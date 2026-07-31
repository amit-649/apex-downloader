import { NextResponse } from 'next/server';
import { fetchFreshVisitorData, getAutoYouTubeTokens } from '@/utils/yt-potoken';
import { updateYouTubeVisitorData } from '@/utils/db-cookies';

export const runtime = 'nodejs';

/**
 * 24/7 Background Cron route to generate and cache fresh YouTube Visitor PO-Tokens on Railway & Vercel.
 */
export async function GET() {
  try {
    const visitorData = await fetchFreshVisitorData();
    const tokens = await getAutoYouTubeTokens();

    // Persist the fresh visitorData to Neon DB so it survives serverless cold-starts
    const freshData = visitorData || tokens.visitorData;
    if (freshData) {
      await updateYouTubeVisitorData(freshData);
    }

    return NextResponse.json({
      status: 'ok',
      message: 'Automated YouTube PO-Tokens refreshed successfully!',
      timestamp: new Date().toISOString(),
      visitorDataExtracted: Boolean(freshData),
      syncedToDb: Boolean(freshData),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown cron error';
    return NextResponse.json({ status: 'error', error: msg }, { status: 500 });
  }
}
