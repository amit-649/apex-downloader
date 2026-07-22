import { NextResponse } from 'next/server';
import { fetchFreshVisitorData, getAutoYouTubeTokens } from '@/utils/yt-potoken';

export const runtime = 'nodejs';

/**
 * 24/7 Background Cron route to generate and cache fresh YouTube Visitor PO-Tokens on Railway & Vercel.
 */
export async function GET() {
  try {
    const visitorData = await fetchFreshVisitorData();
    const tokens = await getAutoYouTubeTokens();

    return NextResponse.json({
      status: 'ok',
      message: 'Automated YouTube PO-Tokens refreshed successfully!',
      timestamp: new Date().toISOString(),
      visitorDataExtracted: Boolean(visitorData || tokens.visitorData),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown cron error';
    return NextResponse.json({ status: 'error', error: msg }, { status: 500 });
  }
}
