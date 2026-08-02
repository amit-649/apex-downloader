import { NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';
import {
  listAllSessions,
  insertSession,
  updateSession,
  deleteSession,
  type Platform,
} from '@/utils/db-cookies';
import { getDb } from '@/utils/db';

export const runtime = 'nodejs';

/**
 * Simple admin API to manage auth sessions in Neon DB.
 * Protected by the ADMIN_SECRET environment variable.
 *
 * GET    /api/admin/sessions            — list all sessions
 * POST   /api/admin/sessions            — add a new session
 * PATCH  /api/admin/sessions?id=X       — update a session
 * DELETE /api/admin/sessions?id=X       — delete a session
 * POST   /api/admin/sessions/cookies    — upsert the default YouTube session
 *                                          (bootstrap for the auto-refresher)
 */

function checkAuth(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false; // Refuse all requests if ADMIN_SECRET is not set
  const auth = request.headers.get('x-admin-secret');
  if (!auth) return false;
  // Compare SHA-256 digests so both sides are always equal length (constant-time compare)
  const expected = createHash('sha256').update(secret).digest();
  const provided = createHash('sha256').update(auth).digest();
  return timingSafeEqual(expected, provided);
}

// ── Cookie bootstrap endpoint ───────────────────────────────────────────────
// Called by scripts/sync_cookies.js after a manual login to seed/refresh the
// session in Neon DB. The auto-refresher worker on Render then keeps that
// session's cookies rotating — no Vercel redeploy required.

async function upsertYouTubeSession(cookieText: string, visitorData?: string): Promise<boolean> {
  const sql = getDb();
  if (!sql) return false;
  try {
    await sql`
      INSERT INTO auth_sessions (platform, account_name, cookie_text, visitor_data, is_active, fail_count)
      VALUES ('youtube', 'default_youtube', ${cookieText}, ${visitorData ?? null}, TRUE, 0)
      ON CONFLICT (platform, account_name) DO UPDATE SET
        cookie_text = EXCLUDED.cookie_text,
        visitor_data = COALESCE(EXCLUDED.visitor_data, auth_sessions.visitor_data),
        is_active = TRUE,
        fail_count = 0,
        updated_at = NOW()
    `;
    return true;
  } catch (e) {
    console.error('[DB] Upsert YouTube session failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sessions = await listAllSessions();
  // Redact cookie_text for security in list view
  const redacted = sessions.map((s) => ({
    ...s,
    cookie_text: s.cookie_text ? `[${s.cookie_text.length} chars]` : null,
    session_id: s.session_id ? `${s.session_id.slice(0, 8)}...` : null,
  }));
  return NextResponse.json({ sessions: redacted });
}

export async function POST(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  // Bootstrap endpoint: POST /api/admin/sessions/cookies
  if (url.pathname.endsWith('/cookies')) {
    const body = await request.json() as { cookie_text?: string; visitor_data?: string };
    if (!body.cookie_text) {
      return NextResponse.json({ error: 'cookie_text is required.' }, { status: 400 });
    }
    const ok = await upsertYouTubeSession(body.cookie_text, body.visitor_data);
    if (!ok) {
      return NextResponse.json({ error: 'Database unavailable or upsert failed.' }, { status: 503 });
    }
    return NextResponse.json({ success: true });
  }

  const body = await request.json() as {
    platform?: string;
    account_name?: string;
    cookie_text?: string;
    session_id?: string;
    visitor_data?: string;
  };

  if (!body.platform || !body.account_name || !body.cookie_text) {
    return NextResponse.json(
      { error: 'platform, account_name, and cookie_text are required.' },
      { status: 400 }
    );
  }

  if (!['youtube', 'instagram'].includes(body.platform)) {
    return NextResponse.json({ error: 'platform must be "youtube" or "instagram".' }, { status: 400 });
  }

  const session = await insertSession({
    platform: body.platform as Platform,
    account_name: body.account_name,
    cookie_text: body.cookie_text,
    session_id: body.session_id,
    visitor_data: body.visitor_data,
  });

  if (!session) {
    return NextResponse.json({ error: 'Database unavailable or insert failed.' }, { status: 503 });
  }

  return NextResponse.json({ success: true, id: session.id });
}

export async function PATCH(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get('id') ?? '', 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ error: 'Valid session id is required as query param.' }, { status: 400 });
  }

  const body = await request.json() as {
    account_name?: string;
    cookie_text?: string;
    session_id?: string;
    visitor_data?: string;
    is_active?: boolean;
    fail_count?: number;
  };

  const updated = await updateSession(id, body);
  if (!updated) {
    return NextResponse.json({ error: 'Session not found or update failed.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, session: { id: updated.id, platform: updated.platform, account_name: updated.account_name, is_active: updated.is_active, fail_count: updated.fail_count } });
}

export async function DELETE(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get('id') ?? '', 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ error: 'Valid session id is required as query param.' }, { status: 400 });
  }

  const ok = await deleteSession(id);
  if (!ok) {
    return NextResponse.json({ error: 'Session not found or delete failed.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
