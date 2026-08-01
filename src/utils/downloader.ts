// Chunk size for range-based downloads (8MB for high-speed parallel transfer)
const CHUNK_SIZE = 8 * 1024 * 1024;
// Higher concurrency for large 1080p/4K video+audio streams — more parallel
// range requests saturate the connection better. 6 workers is a good balance
// (too many can trip CDN rate limits / memory usage).
const PARALLEL_CONCURRENCY = 6;

/**
 * Detect the container of an audio buffer from its magic bytes so FFmpeg can
 * demux it correctly. Returns 'm4a' (AAC) or 'mp3'.
 */
function detectAudioExt(data: Uint8Array): string {
  // MP3: ID3 tag at offset 0, or a frame sync (0xFF 0xEx) near the start.
  if (data.length >= 3) {
    const isId3 = data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33; // "ID3"
    const isFrameSync = data[0] === 0xff && (data[1] & 0xe0) === 0xe0; // 0xFFEx
    if (isId3 || isFrameSync) return 'mp3';
  }
  // Everything else (M4A/AAC, OGG, OPUS, etc.) — the paired audio from
  // YouTube's split streams is virtually always AAC in an M4A container.
  return 'm4a';
}

// Single-threaded FFmpeg CDN URLs to avoid SharedArrayBuffer restrictions
const FFMPEG_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpegInstance: any = null;

/**
 * Lazy load and get the single-threaded FFmpeg instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFFmpeg(onLog?: (msg: string) => void): Promise<any> {
  if (ffmpegInstance) {
    return ffmpegInstance;
  }

  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { toBlobURL } = await import('@ffmpeg/util');

  const ffmpeg = new FFmpeg();
  
  if (onLog) {
    ffmpeg.on('log', ({ message }: { message: string }) => onLog(message));
  }

  await ffmpeg.load({
    coreURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

function resolveProxyUrl(targetUrl: string): string {
  if (targetUrl.startsWith('/') || targetUrl.startsWith('http://localhost') || targetUrl.includes('/api/youtube/download')) {
    return targetUrl;
  }
  return `/api/youtube/download?action=proxy&streamUrl=${encodeURIComponent(targetUrl)}`;
}

/**
 * Download a file in chunks using HTTP Range headers with parallel concurrency pool.
 */
export async function downloadInChunks(
  url: string,
  totalBytes: number,
  onProgress?: (downloaded: number, total: number, speedMbps: number) => void,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const proxyUrl = resolveProxyUrl(url);
  let safeTotalBytes = totalBytes && !isNaN(totalBytes) && totalBytes > 0 ? totalBytes : 0;

  // If safeTotalBytes is unknown (0), perform a HEAD request to proxy to get Content-Length
  if (safeTotalBytes === 0) {
    try {
      const headRes = await fetch(proxyUrl, { method: 'HEAD', signal });
      const contentLength = headRes.headers.get('content-length');
      if (contentLength) {
        const parsed = parseInt(contentLength, 10);
        if (!isNaN(parsed) && parsed > 0) {
          safeTotalBytes = parsed;
        }
      }
    } catch {
      // Ignore head error and fall back
    }
  }

  // If still zero, stream sequentially with reader loop to capture full content without socket cutoff
  if (safeTotalBytes === 0) {
    const res = await fetch(proxyUrl, { signal });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const headerCL = res.headers.get('content-length');
    const knownTotal = headerCL ? parseInt(headerCL, 10) : 0;

    const reader = res.body?.getReader();
    if (!reader) {
      const buffer = await res.arrayBuffer();
      return new Uint8Array(buffer);
    }

    const chunks: Uint8Array[] = [];
    let downloaded = 0;
    const startTime = Date.now();

    while (true) {
      if (signal?.aborted) throw new Error('Download cancelled by user.');
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      downloaded += value.length;

      if (onProgress) {
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedMbps = elapsedSec > 0 ? (downloaded * 8) / (1000 * 1000 * elapsedSec) : 0;
        onProgress(downloaded, knownTotal > 0 ? knownTotal : downloaded, speedMbps);
      }
    }

    const combined = new Uint8Array(downloaded);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  }

  const numChunks = Math.ceil(safeTotalBytes / CHUNK_SIZE);
  const chunks: (Uint8Array | null)[] = new Array(numChunks).fill(null);
  let downloadedBytes = 0;
  const startTime = Date.now();

  const fetchChunk = async (i: number) => {
    if (signal?.aborted) {
      throw new Error('Download cancelled by user.');
    }

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE - 1, safeTotalBytes - 1);

    let response: Response;
    try {
      response = await fetch(proxyUrl, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      });
      if (!response.ok && response.status !== 206) {
        throw new Error(`Proxy status: ${response.status}`);
      }
    } catch {
      response = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal,
      });
      if (!response.ok && response.status !== 206) {
        throw new Error(`Failed chunk ${i + 1}/${numChunks}`);
      }
    }

    const arrayBuffer = await response.arrayBuffer();
    const chunk = new Uint8Array(arrayBuffer);
    chunks[i] = chunk;

    downloadedBytes += chunk.byteLength;
    if (onProgress) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const speedMbps = elapsedSec > 0 ? (downloadedBytes * 8) / (1000 * 1000 * elapsedSec) : 0;
      onProgress(downloadedBytes, safeTotalBytes, speedMbps);
    }
  };

  let nextChunkIdx = 0;
  const workers = Array.from({ length: Math.min(PARALLEL_CONCURRENCY, numChunks) }, async () => {
    while (nextChunkIdx < numChunks) {
      const idx = nextChunkIdx++;
      await fetchChunk(idx);
    }
  });

  await Promise.all(workers);

  const combined = new Uint8Array(downloadedBytes);
  let offset = 0;
  for (let i = 0; i < numChunks; i++) {
    const chunk = chunks[i];
    if (chunk) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }

  return combined;
}

/**
 * Merge video and audio streams entirely client-side using FFmpeg WebAssembly.
 */
export async function mergeVideoAndAudio(
  videoUrl: string,
  audioUrl: string,
  videoSizeBytes: number,
  audioSizeBytes: number,
  onProgress?: (status: string, pct: number, speedMbps: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const logHandler = (msg: string) => {
    if (onProgress) {
      onProgress(`FFmpeg: ${msg}`, 95, 0);
    }
  };

  // Download video and audio streams IN PARALLEL to roughly halve total
  // download time. The merge below is a mux (-c:v copy), so the bottleneck
  // is purely download throughput — running both at once makes best use of it.
  if (onProgress) onProgress('Downloading video & audio streams in parallel...', 10, 0);
  const [videoData, audioData] = await Promise.all([
    downloadInChunks(videoUrl, videoSizeBytes, (d, t, spd) => {
      if (onProgress) {
        const pct = Math.round((d / t) * 45);
        onProgress(`Downloading video stream... (${Math.round((d / (1024 * 1024)))}MB / ${Math.round((t / (1024 * 1024)))}MB)`, pct, spd);
      }
    }, signal),
    downloadInChunks(audioUrl, audioSizeBytes, (d, t, spd) => {
      if (onProgress) {
        const pct = 45 + Math.round((d / t) * 45);
        onProgress(`Downloading audio stream... (${Math.round((d / (1024 * 1024)))}MB / ${Math.round((t / (1024 * 1024)))}MB)`, pct, spd);
      }
    }, signal),
  ]);

  if (onProgress) onProgress('Initializing WebAssembly engine...', 90, 0);
  const ffmpeg = await getFFmpeg(logHandler);

  await ffmpeg.writeFile('input_video.mp4', videoData);

  // Detect the audio container from its magic bytes so FFmpeg demuxes it
  // correctly. YouTube's paired audio is almost always M4A (AAC, starts with
  // "ftyp"), but MP3 (ID3 / 0xFFFB frame sync) is also possible. Writing the
  // wrong extension (e.g. naming AAC bytes ".mp3") makes FFmpeg misdetect the
  // stream and the merge fails or produces a corrupt file.
  const audioExt = detectAudioExt(audioData);
  await ffmpeg.writeFile(`input_audio.${audioExt}`, audioData);

  if (onProgress) onProgress('Merging video & audio in browser...', 95, 0);
  await ffmpeg.exec([
    '-i', 'input_video.mp4',
    '-i', `input_audio.${audioExt}`,
    '-c:v', 'copy',
    '-c:a', 'aac',
    'output.mp4'
  ]);

  const mergedData = await ffmpeg.readFile('output.mp4');

  try {
    await ffmpeg.deleteFile('input_video.mp4');
    await ffmpeg.deleteFile(`input_audio.${audioExt}`);
    await ffmpeg.deleteFile('output.mp4');
  } catch (e) {
    console.warn('Failed to clean virtual filesystem:', e);
  }

  const uint8Data = typeof mergedData === 'string'
    ? new TextEncoder().encode(mergedData)
    : mergedData;

  return new Blob([uint8Data.buffer as ArrayBuffer], { type: 'video/mp4' });
}
