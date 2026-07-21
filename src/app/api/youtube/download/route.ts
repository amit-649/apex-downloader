import { NextResponse } from 'next/server';
import { getInfo } from '@/utils/ytdlp';
import { assertMediaUrl, assertYoutubeUrl } from '@/utils/platform-url';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough, Readable } from 'stream';
import axios from 'axios';

export const runtime = 'nodejs';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Configure local FFmpeg path.
try {
  ffmpeg.setFfmpegPath(ffmpegPath.path);
} catch (error) {
  console.warn('Could not configure local FFmpeg; server-side merge will be unavailable:', error);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function safeFilename(value: string, fallback: string): string {
  const filename = value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
  return filename || fallback;
}

function isSafeFormatId(value: string): boolean {
  return /^[a-zA-Z0-9._-]{1,32}$/.test(value);
}

function getSafeRange(value: string | null): string | undefined {
  if (!value || !/^bytes=\d+-\d*$/.test(value)) return undefined;
  return value;
}

function toWebStream(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

function createProxyResponse(stream: Readable, status: number, sourceHeaders: Record<string, unknown>): Response {
  const headers = new Headers({
    'Content-Type': String(sourceHeaders['content-type'] || 'application/octet-stream'),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
  });

  for (const header of ['content-range', 'content-length']) {
    const value = sourceHeaders[header];
    if (value) headers.set(header, String(value));
  }

  return new Response(toWebStream(stream), { status, headers });
}

async function proxyMedia(streamUrl: string, range: string | null): Promise<Response> {
  const mediaUrl = assertMediaUrl(streamUrl);
  const safeRange = getSafeRange(range);
  const headers: Record<string, string> = { ...BROWSER_HEADERS };
  if (safeRange) headers.Range = safeRange;

  const response = await axios({
    url: mediaUrl.toString(),
    method: 'GET',
    headers,
    responseType: 'stream',
    timeout: 30_000,
    maxRedirects: 5,
    decompress: false,
    validateStatus: (status) => status >= 200 && status < 300,
  });

  const contentType = String(response.headers['content-type'] || 'application/octet-stream');
  if (!/^(?:video|audio|image)\//.test(contentType) && contentType !== 'application/octet-stream') {
    (response.data as Readable).destroy();
    throw new Error('The media host returned an unsupported response type.');
  }

  const passThrough = new PassThrough();
  (response.data as Readable).pipe(passThrough);
  return createProxyResponse(passThrough, response.status, response.headers as Record<string, unknown>);
}

function startMerge(videoUrl: string, audioUrl: string): { output: PassThrough; command: ReturnType<typeof ffmpeg> } {
  const output = new PassThrough();
  const command = ffmpeg()
    .input(videoUrl)
    .inputOptions('-headers', `User-Agent: ${BROWSER_HEADERS['User-Agent']}\r\nAccept-Language: ${BROWSER_HEADERS['Accept-Language']}\r\n`)
    .videoCodec('copy')
    .input(audioUrl)
    .inputOptions('-headers', `User-Agent: ${BROWSER_HEADERS['User-Agent']}\r\nAccept-Language: ${BROWSER_HEADERS['Accept-Language']}\r\n`)
    .audioCodec('aac')
    .format('mp4')
    .outputOptions('-map 0:v:0')
    .outputOptions('-map 1:a:0')
    .outputOptions('-shortest')
    .on('error', (error) => {
      console.error('FFmpeg merge error:', error);
      output.destroy(error);
    });

  command.stream(output);
  return { output, command };
}

function startAudioTranscode(sourceUrl: string): { output: PassThrough; command: ReturnType<typeof ffmpeg> } {
  const output = new PassThrough();
  const command = ffmpeg(sourceUrl)
    .inputOptions('-headers', `User-Agent: ${BROWSER_HEADERS['User-Agent']}\r\nAccept-Language: ${BROWSER_HEADERS['Accept-Language']}\r\n`)
    .audioCodec('libmp3lame')
    .audioBitrate(192)
    .format('mp3')
    .on('error', (error) => {
      console.error('FFmpeg audio transcode error:', error);
      output.destroy(error);
    });

  command.stream(output);
  return { output, command };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // Proxy only known platform CDNs. This endpoint deliberately never accepts
  // credentials from the browser; platform authorization stays in server env vars.
  if (action === 'proxy') {
    const streamUrl = searchParams.get('streamUrl');
    if (!streamUrl) {
      return NextResponse.json({ error: 'streamUrl is required' }, { status: 400 });
    }

    try {
      return await proxyMedia(streamUrl, request.headers.get('range'));
    } catch (error: unknown) {
      console.error('Error in media proxy:', error);
      return NextResponse.json({ error: errorMessage(error, 'Proxy request failed') }, { status: 400 });
    }
  }

  if (action === 'merge') {
    const url = searchParams.get('url');
    const videoItag = searchParams.get('videoItag');
    const audioItag = searchParams.get('audioItag');
    const title = searchParams.get('title') || 'video';

    if (!url || !videoItag || !audioItag || !isSafeFormatId(videoItag) || !isSafeFormatId(audioItag)) {
      return NextResponse.json({ error: 'A valid video URL and format selections are required.' }, { status: 400 });
    }

    try {
      const info = await getInfo(assertYoutubeUrl(url).toString());
      const videoFormat = info.formats.find((format) => String(format.format_id) === videoItag);
      const audioFormat = info.formats.find((format) => String(format.format_id) === audioItag);

      if (!videoFormat?.url || !audioFormat?.url) {
        return NextResponse.json({ error: 'Video or audio format URL not found.' }, { status: 404 });
      }

      const { output } = startMerge(
        assertMediaUrl(videoFormat.url).toString(),
        assertMediaUrl(audioFormat.url).toString(),
      );
      const filename = safeFilename(title, 'video');

      return new Response(toWebStream(output), {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${filename}.mp4"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (error: unknown) {
      console.error('Error during local server merge download:', error);
      return NextResponse.json({ error: errorMessage(error, 'Server merge failed') }, { status: 500 });
    }
  }

  const url = searchParams.get('url');
  const itag = searchParams.get('itag');
  const title = searchParams.get('title') || 'download';

  if (!url || !itag || !isSafeFormatId(itag)) {
    return NextResponse.json({ error: 'A valid YouTube URL and format selection are required.' }, { status: 400 });
  }

  try {
    const info = await getInfo(assertYoutubeUrl(url).toString());
    const format = info.formats.find((candidate) => String(candidate.format_id) === itag);

    if (!format?.url) {
      return NextResponse.json({ error: 'Requested format not found or missing download URL.' }, { status: 404 });
    }

    const formatIsAudio = !format.vcodec || format.vcodec === 'none';
    const wantsMp3 = searchParams.get('format') === 'mp3';
    const filename = safeFilename(title, 'download');

    if (formatIsAudio && wantsMp3) {
      const { output } = startAudioTranscode(assertMediaUrl(format.url).toString());
      return new Response(toWebStream(output), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${filename}.mp3"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const response = await axios({
      url: assertMediaUrl(format.url).toString(),
      method: 'GET',
      headers: BROWSER_HEADERS,
      responseType: 'stream',
      timeout: 30_000,
      maxRedirects: 5,
      decompress: false,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    const passThrough = new PassThrough();
    (response.data as Readable).pipe(passThrough);

    const extension = format.ext || (formatIsAudio ? 'm4a' : 'mp4');
    const contentType = String(response.headers['content-type'] || (formatIsAudio ? 'audio/*' : 'video/*'));
    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}.${extension}"`,
      'Cache-Control': 'private, no-store',
    });
    if (response.headers['content-length']) {
      headers.set('Content-Length', String(response.headers['content-length']));
    }

    return new Response(toWebStream(passThrough), { headers });
  } catch (error: unknown) {
    console.error('Error in single format download:', error);
    return NextResponse.json({ error: errorMessage(error, 'Download failed') }, { status: 500 });
  }
}
