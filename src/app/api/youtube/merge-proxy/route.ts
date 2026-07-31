import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Allow long-running streams (10 minutes max for large 4K files)
export const maxDuration = 600;

const MERGER_URL = process.env.NEXT_PUBLIC_MERGER_URL;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('videoUrl');
  const audioUrl = searchParams.get('audioUrl');
  const title = searchParams.get('title') || 'Apex_Video';

  if (!videoUrl || !audioUrl) {
    return NextResponse.json({ error: 'videoUrl and audioUrl are required.' }, { status: 400 });
  }

  if (!MERGER_URL) {
    return NextResponse.json({ error: 'Live merger service is not configured.' }, { status: 503 });
  }

  try {
    // POST to Render live merger service with full stream URLs in body
    const mergerEndpoint = `${MERGER_URL.replace(/\/$/, '')}/api/merge`;

    const response = await fetch(mergerEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, audioUrl, title }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[merge-proxy] Render merger error:', response.status, errorText);
      return NextResponse.json(
        { error: `Live merger returned HTTP ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    if (!response.body) {
      return NextResponse.json({ error: 'Live merger returned empty response.' }, { status: 502 });
    }

    const safeTitle = (title || 'Apex_Video').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180) || 'Apex_Video';

    return new Response(response.body, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${safeTitle}.mp4"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: unknown) {
    console.error('[merge-proxy] Failed to reach live merger:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Live merger connection failed: ${message}` }, { status: 502 });
  }
}
