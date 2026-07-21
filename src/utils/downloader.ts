import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// Chunk size for range-based downloads (2MB is optimal)
const CHUNK_SIZE = 2 * 1024 * 1024;

// Single-threaded FFmpeg CDN URLs to avoid SharedArrayBuffer restrictions
const FFMPEG_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

let ffmpegInstance: FFmpeg | null = null;

/**
 * Lazy load and get the single-threaded FFmpeg instance.
 */
async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return ffmpegInstance;
  }

  const ffmpeg = new FFmpeg();
  
  if (onLog) {
    ffmpeg.on('log', ({ message }) => onLog(message));
  }

  await ffmpeg.load({
    coreURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/**
 * Downloads a binary file in ranges/chunks via Next.js proxy to bypass Vercel limits.
 */
export async function downloadInChunks(
  streamUrl: string,
  totalBytes: number,
  onProgress: (percent: number, speedMbps: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const chunks: ArrayBuffer[] = [];
  let downloadedBytes = 0;
  const startTime = Date.now();

  const safeTotalBytes = totalBytes && totalBytes > 0 ? totalBytes : 0;

  if (safeTotalBytes === 0) {
    // Dynamic single-pass download when total file size is unknown upfront
    const proxyUrl = `/api/youtube/download?action=proxy&streamUrl=${encodeURIComponent(streamUrl)}`;
    const response = await fetch(proxyUrl, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch media stream: ${response.statusText}`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
      const buf = await response.arrayBuffer();
      onProgress(100, 0);
      return new Blob([buf]);
    }
    const contentLength = response.headers.get('Content-Length');
    const expected = contentLength ? parseInt(contentLength, 10) : 0;
    while (true) {
      if (signal?.aborted) throw new Error('Download canceled');
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      downloadedBytes += value.length;
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const speedMbps = elapsedSeconds > 0 ? (downloadedBytes * 8) / (1024 * 1024 * elapsedSeconds) : 0;
      const percent = expected > 0 ? Math.min((downloadedBytes / expected) * 100, 100) : 50;
      onProgress(percent, speedMbps);
    }
    return new Blob(chunks);
  }

  const numChunks = Math.ceil(safeTotalBytes / CHUNK_SIZE);

  for (let i = 0; i < numChunks; i++) {
    if (signal?.aborted) throw new Error('Download canceled');
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE - 1, safeTotalBytes - 1);

    const rangeHeader = `bytes=${start}-${end}`;
    const proxyUrl = `/api/youtube/download?action=proxy&streamUrl=${encodeURIComponent(streamUrl)}`;

    let retryCount = 0;
    let success = false;
    let resData: ArrayBuffer | null = null;

    while (retryCount < 3 && !success) {
      if (signal?.aborted) throw new Error('Download canceled');
      try {
        const response = await fetch(proxyUrl, {
          headers: {
            'Range': rangeHeader,
          },
          signal,
        });

        if (!response.ok && response.status !== 206) {
          throw new Error(`Failed to fetch chunk: ${response.statusText}`);
        }

        resData = await response.arrayBuffer();
        success = true;
      } catch (err: unknown) {
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
          throw new Error('Download canceled');
        }
        retryCount++;
        if (retryCount >= 3) throw err;
        await new Promise(resolve => setTimeout(resolve, 1000)); // exponential backoff
      }
    }

    if (resData) {
      chunks.push(resData);
      downloadedBytes += resData.byteLength;

      // Speed calculation
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const speedMbps = elapsedSeconds > 0 ? (downloadedBytes * 8) / (1024 * 1024 * elapsedSeconds) : 0;
      
      const percent = Math.min((downloadedBytes / safeTotalBytes) * 100, 100);
      onProgress(percent, speedMbps);
    }
  }

  return new Blob(chunks);
}

/**
 * Combines separate video and audio Blobs client-side using FFmpeg WebAssembly.
 */
export async function mergeVideoAndAudio(
  videoBlob: Blob,
  audioBlob: Blob,
  outputName: string,
  onProgress: (percent: number) => void,
  onLog?: (msg: string) => void
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onLog);

  // Read blobs into array buffers
  const videoData = new Uint8Array(await videoBlob.arrayBuffer());
  const audioData = new Uint8Array(await audioBlob.arrayBuffer());

  // Write to virtual filesystem
  await ffmpeg.writeFile('input_video.mp4', videoData);
  await ffmpeg.writeFile('input_audio.mp3', audioData);

  // Setup progress handler
  ffmpeg.on('progress', ({ progress }) => {
    // progress is between 0 and 1
    onProgress(Math.min(Math.round(progress * 100), 100));
  });

  // Run FFmpeg command
  // -c:v copy copies the video codec directly without transcoding (super fast!)
  // -c:a aac transcode audio stream to standard AAC format
  await ffmpeg.exec([
    '-i', 'input_video.mp4',
    '-i', 'input_audio.mp3',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-shortest',
    'output.mp4'
  ]);

  // Read resulting file
  const mergedData = await ffmpeg.readFile('output.mp4');
  
  // Clean up virtual files
  try {
    await ffmpeg.deleteFile('input_video.mp4');
    await ffmpeg.deleteFile('input_audio.mp3');
    await ffmpeg.deleteFile('output.mp4');
  } catch (e) {
    console.warn('Failed to clean virtual filesystem:', e);
  }

  // Create a Blob from Uint8Array or String
  const uint8Data = typeof mergedData === 'string'
    ? new TextEncoder().encode(mergedData)
    : mergedData;

  return new Blob([uint8Data.buffer as ArrayBuffer], { type: 'video/mp4' });
}
