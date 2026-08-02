import { NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';
import { fetchFreshVisitorData, getAutoYouTubeTokens } from '@/utils/yt-potoken';
import { updateYouTubeVisitorData } from '@/utils/db-cookies';

export const runtime = 'nodejs';

/**
 * 24/7 Background Cron route to generate and cache fresh YouTube Visitor PO-Tokens on Railway & Vercel.
 *
 * Protected by the CRON_SECRET environment variable. When unset, the route
 * refuses all requests. To run manually (or locally), send the secret via the
 * Authorization: Bearer <secret> header.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const authHeader = request.headers.get('authorization') ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!provided) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const expected = createHash('sha256').update(secret).digest();
  const actual = createHash('sha256').update(provided).digest();
  if (!timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
