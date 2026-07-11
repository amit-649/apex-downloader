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
  onProgress: (percent: number, speedMbps: number) => void
): Promise<Blob> {
  const chunks: ArrayBuffer[] = [];
  let downloadedBytes = 0;
  const startTime = Date.now();

  const numChunks = Math.ceil(totalBytes / CHUNK_SIZE);

  for (let i = 0; i < numChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE - 1, totalBytes - 1);

    const rangeHeader = `bytes=${start}-${end}`;
    const proxyUrl = `/api/youtube/download?action=proxy&streamUrl=${encodeURIComponent(streamUrl)}`;

    let retryCount = 0;
    let success = false;
    let resData: ArrayBuffer | null = null;

    while (retryCount < 3 && !success) {
      try {
        const response = await fetch(proxyUrl, {
          headers: {
            'Range': rangeHeader,
          },
        });

        if (!response.ok && response.status !== 206) {
          throw new Error(`Failed to fetch chunk: ${response.statusText}`);
        }

        resData = await response.arrayBuffer();
        success = true;
      } catch (err) {
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
      
      const percent = Math.min((downloadedBytes / totalBytes) * 100, 100);
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

  // Create a Blob from the Uint8Array
  // @ts-ignore
  return new Blob([mergedData.buffer], { type: 'video/mp4' });
}
