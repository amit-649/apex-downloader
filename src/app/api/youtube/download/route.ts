import { NextResponse } from 'next/server';
import { getInfo } from '@/utils/ytdlp';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
import axios from 'axios';

// Configure local FFmpeg path
try {
  ffmpeg.setFfmpegPath(ffmpegPath.path);
  console.log('FFmpeg configured at path:', ffmpegPath.path);
} catch (e) {
  console.warn('Could not set local FFmpeg path, server-side merge might fail:', e);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action'); // 'proxy' or 'merge'
  const youtubeCookies = request.headers.get('X-YouTube-Cookies') || searchParams.get('cookies') || '';

  // 1. ACTION: PROXY (Range-based streaming to bypass CORS for client WASM)
  if (action === 'proxy') {
    const streamUrl = searchParams.get('streamUrl');
    if (!streamUrl) {
      return NextResponse.json({ error: 'streamUrl is required' }, { status: 400 });
    }

    const rangeHeader = request.headers.get('range');
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    try {
      const response = await axios({
        url: streamUrl,
        method: 'GET',
        headers,
        responseType: 'stream',
        validateStatus: () => true, // Accept 206 Partial Content
      });

      const passThrough = new PassThrough();
      response.data.pipe(passThrough);

      // Convert Node stream to Web ReadableStream
      // @ts-ignore
      const webStream = new ReadableStream({
        start(controller) {
          passThrough.on('data', (chunk) => controller.enqueue(chunk));
          passThrough.on('end', () => controller.close());
          passThrough.on('error', (err) => controller.error(err));
        },
        cancel() {
          response.data.destroy();
        }
      });

      const resHeaders: Record<string, string> = {
        'Content-Type': String(response.headers['content-type'] || 'video/mp4'),
        'Accept-Ranges': 'bytes',
      };

      if (response.headers['content-range']) {
        resHeaders['Content-Range'] = String(response.headers['content-range']);
      }
      if (response.headers['content-length']) {
        resHeaders['Content-Length'] = String(response.headers['content-length']);
      }

      return new Response(webStream, {
        status: response.status,
        headers: resHeaders,
      });
    } catch (error: any) {
      console.error('Error in range-based YouTube proxy:', error);
      return NextResponse.json({ error: 'Proxy request failed' }, { status: 500 });
    }
  }

  // 2. ACTION: MERGE (Local server merging of separate audio and video streams)
  if (action === 'merge') {
    const url = searchParams.get('url');
    const videoItag = searchParams.get('videoItag');
    const audioItag = searchParams.get('audioItag');
    const title = searchParams.get('title') || 'video';

    if (!url || !videoItag || !audioItag) {
      return NextResponse.json({ error: 'url, videoItag, and audioItag are required' }, { status: 400 });
    }

    try {
      // Retrieve direct YouTube URLs for both video and audio formats using yt-dlp
      const info = await getInfo(url, youtubeCookies);

      const videoFormat = info.formats.find(f => String(f.format_id) === String(videoItag));
      const audioFormat = info.formats.find(f => String(f.format_id) === String(audioItag));

      if (!videoFormat?.url || !audioFormat?.url) {
        return NextResponse.json({ error: 'Video or audio format URL not found' }, { status: 404 });
      }

      const videoUrl = videoFormat.url;
      const audioUrl = audioFormat.url;
      const outputStream = new PassThrough();
      let ffmpegCommand: any = null;

      // Pass HTTPS streaming URLs directly to local FFmpeg
      ffmpegCommand = ffmpeg()
        .input(videoUrl)
        .inputOptions('-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\nAccept-Language: en-US,en;q=0.9\r\n')
        .videoCodec('copy')
        .input(audioUrl)
        .inputOptions('-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\nAccept-Language: en-US,en;q=0.9\r\n')
        .audioCodec('aac')
        .format('mp4')
        .outputOptions('-map 0:v:0')
        .outputOptions('-map 1:a:0')
        .outputOptions('-shortest')
        .on('error', (err) => {
          console.error('FFmpeg merge error:', err);
          outputStream.destroy(err);
        });

      ffmpegCommand.stream(outputStream);

      // Convert Node PassThrough stream to Web ReadableStream
      // @ts-ignore
      const webStream = new ReadableStream({
        start(controller) {
          outputStream.on('data', (chunk) => controller.enqueue(chunk));
          outputStream.on('end', () => controller.close());
          outputStream.on('error', (err) => controller.error(err));
        },
        cancel() {
          if (ffmpegCommand) {
            try {
              ffmpegCommand.kill('SIGKILL');
            } catch (e) {
              console.warn('Could not kill FFmpeg process:', e);
            }
          }
          outputStream.destroy();
        }
      });

      const safeTitle = encodeURIComponent(title.replace(/[^a-zA-Z0-9]/g, '_'));

      return new Response(webStream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${safeTitle}.mp4"`,
        },
      });
    } catch (error: any) {
      console.error('Error during local server merge download:', error);
      let userMessage = error.message || 'Server merge failed';
      if (userMessage.includes('confirm you') && userMessage.includes('bot')) {
        userMessage = 'YouTube is requesting bot verification. Please export your session cookies to cookies.txt / youtube-cookies.txt in the project root folder to download this restricted video.';
      }
      return NextResponse.json({ error: userMessage }, { status: 500 });
    }
  }

  // 3. ACTION: SINGLE (Direct proxy of audio-only or pre-merged video)
  const url = searchParams.get('url');
  const itag = searchParams.get('itag');
  const title = searchParams.get('title') || 'download';

  if (!url || !itag) {
    return NextResponse.json({ error: 'url and itag are required for single format' }, { status: 400 });
  }

  try {
    const info = await getInfo(url, youtubeCookies);
    const format = info.formats.find(f => String(f.format_id) === String(itag));

    if (!format?.url) {
      return NextResponse.json({ error: 'Requested format not found or missing download URL' }, { status: 404 });
    }

    // Proxy the direct deciphered streaming URL using Axios stream piping
    const response = await axios({
      url: format.url,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      responseType: 'stream',
    });

    const passThrough = new PassThrough();
    response.data.pipe(passThrough);

    // @ts-ignore
    const webStream = new ReadableStream({
      start(controller) {
        passThrough.on('data', (chunk) => controller.enqueue(chunk));
        passThrough.on('end', () => controller.close());
        passThrough.on('error', (err) => controller.error(err));
      },
      cancel() {
        response.data.destroy();
        passThrough.destroy();
      }
    });

    const isAudio = !format.vcodec || format.vcodec === 'none';
    const ext = format.ext || (isAudio ? 'mp3' : 'mp4');
    const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';
    const safeTitle = encodeURIComponent(title.replace(/[^a-zA-Z0-9]/g, '_'));
    const contentLength = format.filesize || format.filesize_approx || '';

    return new Response(webStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeTitle}.${ext}"`,
        'Content-Length': String(contentLength),
      },
    });
  } catch (error: any) {
    console.error('Error in single format download:', error);
    let userMessage = error.message || 'Download failed';
    if (userMessage.includes('confirm you') && userMessage.includes('bot')) {
      userMessage = 'YouTube is requesting bot verification. Please export your session cookies to cookies.txt / youtube-cookies.txt in the project root folder to download this restricted video.';
    }
    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
