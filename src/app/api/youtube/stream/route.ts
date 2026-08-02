import { NextResponse } from 'next/server';
import { assertMediaUrl } from '@/utils/platform-url';

export const runtime = 'nodejs';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.youtube.com/',
  'Origin': 'https://www.youtube.com',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Dest': 'video',
};

function toWebStream(readable: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return readable;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const streamUrl = searchParams.get('url');
  const rangeHeader = request.headers.get('range');

  if (!streamUrl) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  try {
    const mediaUrl = assertMediaUrl(streamUrl);

    const headers = new Headers(BROWSER_HEADERS);
    if (rangeHeader) {
      headers.set('Range', rangeHeader);
    }

    const response = await fetch(mediaUrl.toString(), {
      method: 'GET',
      headers,
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error(`Stream fetch failed: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Media host returned ${response.status}` },
        { status: response.status }
      );
    }

    // Forward relevant headers
    const responseHeaders = new Headers();
    const allowedHeaders = [
      'content-type',
      'content-length',
      'accept-ranges',
      'content-range',
      'content-disposition',
      'cache-control',
    ];

    for (const [key, value] of response.headers.entries()) {
      if (allowedHeaders.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }

    // Ensure CORS for browser playback/download
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range');
    responseHeaders.set('Cache-Control', 'private, no-store');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    console.error('Error in stream proxy:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stream proxy failed' },
      { status: 400 }
    );
  }
}