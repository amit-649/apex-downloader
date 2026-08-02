import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MERGER_URL = process.env.NEXT_PUBLIC_MERGER_URL;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const height = searchParams.get('height') || '1080';
  const title = searchParams.get('title') || 'Apex_Video';
  const videoItag = searchParams.get('videoItag');
  const audioItag = searchParams.get('audioItag');

  if (!url) {
    return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
  }

  if (!MERGER_URL) {
    return NextResponse.json({ error: 'Merge service not configured' }, { status: 503 });
  }

  try {
    const mergerEndpoint = `${MERGER_URL.replace(/\/$/, '')}/merge`;
    console.log(`[merge-proxy] Forwarding to Render: url=${url}, height=${height}`);

    const response = await fetch(mergerEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, height: parseInt(height), title, videoItag, audioItag }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[merge-proxy] Render error:', response.status, errorText);
      return NextResponse.json(
        { error: `Merge service error: ${errorText}` },
        { status: response.status }
      );
    }

    if (!response.body) {
      return NextResponse.json({ error: 'Empty response from merge service' }, { status: 502 });
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
    console.error('[merge-proxy] Connection failed:', error);
    return NextResponse.json(
      { error: `Merge service connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 502 }
    );
  }
}