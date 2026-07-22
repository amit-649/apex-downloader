// Chunk size for range-based downloads (2MB is optimal)
const CHUNK_SIZE = 2 * 1024 * 1024;

// Single-threaded FFmpeg CDN URLs to avoid SharedArrayBuffer restrictions
const FFMPEG_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

let ffmpegInstance: any = null;

/**
 * Lazy load and get the single-threaded FFmpeg instance.
 */
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

/**
 * Download a file in chunks using HTTP Range headers to bypass serverless timeouts.
 */
export async function downloadInChunks(
  url: string,
  totalBytes: number,
  onProgress?: (downloaded: number, total: number, speedMbps: number) => void,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const safeTotalBytes = totalBytes && !isNaN(totalBytes) && totalBytes > 0 ? totalBytes : 0;
  
  if (safeTotalBytes === 0) {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const buffer = await res.arrayBuffer();
    if (onProgress) onProgress(buffer.byteLength, buffer.byteLength, 0);
    return new Uint8Array(buffer);
  }

  const chunks: Uint8Array[] = [];
  let downloadedBytes = 0;
  const startTime = Date.now();

  const numChunks = Math.ceil(safeTotalBytes / CHUNK_SIZE);

  for (let i = 0; i < numChunks; i++) {
    if (signal?.aborted) {
      throw new Error('Download cancelled by user.');
    }

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE - 1, safeTotalBytes - 1);

    const response = await fetch(url, {
      headers: { Range: `bytes=${start}-${end}` },
      signal,
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to download chunk ${i + 1}/${numChunks}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const chunk = new Uint8Array(arrayBuffer);
    chunks.push(chunk);

    downloadedBytes += chunk.byteLength;

    if (onProgress) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const speedMbps = elapsedSec > 0 ? (downloadedBytes * 8) / (1000 * 1000 * elapsedSec) : 0;
      onProgress(downloadedBytes, safeTotalBytes, speedMbps);
    }
  }

  const combined = new Uint8Array(downloadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
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

  if (onProgress) onProgress('Downloading video stream...', 10, 0);
  const videoData = await downloadInChunks(videoUrl, videoSizeBytes, (d, t, spd) => {
    if (onProgress) {
      const pct = Math.round((d / t) * 45);
      onProgress(`Downloading video stream... (${Math.round((d / (1024 * 1024)))}MB / ${Math.round((t / (1024 * 1024)))}MB)`, pct, spd);
    }
  }, signal);

  if (onProgress) onProgress('Downloading audio stream...', 50, 0);
  const audioData = await downloadInChunks(audioUrl, audioSizeBytes, (d, t, spd) => {
    if (onProgress) {
      const pct = 45 + Math.round((d / t) * 45);
      onProgress(`Downloading audio stream... (${Math.round((d / (1024 * 1024)))}MB / ${Math.round((t / (1024 * 1024)))}MB)`, pct, spd);
    }
  }, signal);

  if (onProgress) onProgress('Initializing WebAssembly engine...', 90, 0);
  const ffmpeg = await getFFmpeg(logHandler);

  await ffmpeg.writeFile('input_video.mp4', videoData);
  await ffmpeg.writeFile('input_audio.mp3', audioData);

  if (onProgress) onProgress('Merging video & audio in browser...', 95, 0);
  await ffmpeg.exec([
    '-i', 'input_video.mp4',
    '-i', 'input_audio.mp3',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-shortest',
    'output.mp4'
  ]);

  const mergedData = await ffmpeg.readFile('output.mp4');

  try {
    await ffmpeg.deleteFile('input_video.mp4');
    await ffmpeg.deleteFile('input_audio.mp3');
    await ffmpeg.deleteFile('output.mp4');
  } catch (e) {
    console.warn('Failed to clean virtual filesystem:', e);
  }

  const uint8Data = typeof mergedData === 'string'
    ? new TextEncoder().encode(mergedData)
    : mergedData;

  return new Blob([uint8Data.buffer as ArrayBuffer], { type: 'video/mp4' });
}
