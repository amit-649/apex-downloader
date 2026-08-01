import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Allow long-running streams (up to 60s on Vercel Hobby)
export const maxDuration = 60;

const MERGER_URL = process.env.NEXT_PUBLIC_MERGER_URL;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const height = searchParams.get('height') || '1080';
  const title = searchParams.get('title') || 'Apex_Video';
  const videoItag = searchParams.get('videoItag');
  const audioItag = searchParams.get('audioItag');
  const videoUrl = searchParams.get('videoUrl');
  const audioUrl = searchParams.get('audioUrl');

  if (!url && (!videoUrl || !audioUrl)) {
    return NextResponse.json({ error: 'YouTube URL or stream URLs are required.' }, { status: 400 });
  }

  if (!MERGER_URL) {
    return NextResponse.json({ error: 'Live merger service is not configured.' }, { status: 503 });
  }

  try {
    const mergerEndpoint = `${MERGER_URL.replace(/\/$/, '')}/api/merge`;
    console.log(`[merge-proxy] Forwarding to Render: url=${url}, videoItag=${videoItag}, height=${height}`);

    // When a YouTube URL + itags are supplied, prefer fresh yt-dlp extraction on Render's IP.
    // Forwarding client-supplied videoUrl/audioUrl risks IP-locked Googlevideo URLs that
    // Google drops after ~1-2MB (403 / TCP RST) — the very cause of truncated downloads.
    const forwardVideoUrl = url ? undefined : videoUrl;
    const forwardAudioUrl = url ? undefined : audioUrl;

    const response = await fetch(mergerEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, height: parseInt(height), title, videoItag, audioItag, videoUrl: forwardVideoUrl, audioUrl: forwardAudioUrl }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[merge-proxy] Render error:', response.status, errorText);
      return NextResponse.json(
        { error: `Live merger error: ${errorText}` },
        { status: response.status }
      );
    }

    if (!response.body) {
      return NextResponse.json({ error: 'Empty response from live merger.' }, { status: 502 });
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Merger connection failed: ${message}` }, { status: 502 });
  }
}
