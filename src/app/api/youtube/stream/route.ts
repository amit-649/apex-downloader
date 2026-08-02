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

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180) || 'video';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const streamUrl = searchParams.get('url');
  const title = searchParams.get('title') || 'video';
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

    // Force download with proper Content-Disposition
    const extension = mediaUrl.pathname.split('.').pop()?.split('?')[0] || 'mp4';
    const filename = safeFilename(title);
    const disposition = `attachment; filename="${filename}.${extension}"`;

    const responseHeaders = new Headers({
      'Content-Type': response.headers.get('content-type') || 'video/mp4',
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range',
    });

    // Forward Range headers if present
    const contentRange = response.headers.get('content-range');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);
    const contentLength = response.headers.get('content-length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);
    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) responseHeaders.set('Accept-Ranges', acceptRanges);

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