import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.pinterest.com/',
  'Origin': 'https://www.pinterest.com',
};

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180) || 'pinterest_pin';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mediaUrl = searchParams.get('url');
  const filenameParam = searchParams.get('filename') || 'pinterest_pin';
  const rangeHeader = request.headers.get('range');

  if (!mediaUrl) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }

  try {
    const headers = new Headers(BROWSER_HEADERS);
    if (rangeHeader) {
      headers.set('Range', rangeHeader);
    }

    const response = await fetch(mediaUrl, {
      method: 'GET',
      headers,
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error(`Pinterest proxy stream fetch failed: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Media host returned ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || (mediaUrl.includes('.mp4') ? 'video/mp4' : 'image/jpeg');
    const extension = contentType.includes('video') ? 'mp4' : 'jpg';
    const filename = safeFilename(filenameParam);
    const disposition = `attachment; filename="${filename}.${extension}"`;

    const responseHeaders = new Headers({
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range',
    });

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
    console.error('Error in Pinterest download proxy:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Download proxy failed' },
      { status: 500 }
    );
  }
}
