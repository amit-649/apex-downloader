import { getDb } from '@/utils/db';

export type Platform = 'instagram' | 'pinterest';

export interface AuthSession {
  id: number;
  platform: Platform;
  account_name: string;
  cookie_text: string;
  session_id: string | null;
  visitor_data: string | null;
  is_active: boolean;
  fail_count: number;
  last_used_at: string;
  updated_at: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache: Record<Platform, { session: AuthSession | null; fetchedAt: number } | null> = {
  instagram: null,
  pinterest: null,
};

function isCacheValid(platform: Platform): boolean {
  const c = cache[platform];
  return c !== null && Date.now() - c.fetchedAt < CACHE_TTL_MS;
}

function setCache(platform: Platform, session: AuthSession | null) {
  cache[platform] = { session, fetchedAt: Date.now() };
}

function clearCache(platform: Platform) {
  cache[platform] = null;
}

function toSession(row: Record<string, unknown>): AuthSession {
  return {
    id: row.id as number,
    platform: row.platform as Platform,
    account_name: row.account_name as string,
    cookie_text: row.cookie_text as string,
    session_id: (row.session_id as string) ?? null,
    visitor_data: (row.visitor_data as string) ?? null,
    is_active: row.is_active as boolean,
    fail_count: row.fail_count as number,
    last_used_at: row.last_used_at as string,
    updated_at: row.updated_at as string,
  };
}

async function fetchActiveSessionFromDb(platform: Platform): Promise<AuthSession | null> {
  const sql = getDb();
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT * FROM auth_sessions
      WHERE platform = ${platform} AND is_active = TRUE
      ORDER BY fail_count ASC, last_used_at ASC
      LIMIT 1
    `;
    const row = (rows as unknown[])[0] as Record<string, unknown> | undefined;
    return row ? toSession(row) : null;
  } catch (e) {
    console.error(`[DB] Failed to fetch active ${platform} session:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function getActiveSession(platform: Platform): Promise<AuthSession | null> {
  if (isCacheValid(platform)) {
    return cache[platform]!.session;
  }

  const session = await fetchActiveSessionFromDb(platform);
  setCache(platform, session);

  if (session) {
    console.log(`[DB] Loaded ${platform} session from database (account: "${session.account_name}")`);
  } else {
    console.warn(`[DB] No active ${platform} session found in database. Falling back to env vars.`);
  }

  return session;
}

export async function getActiveCookieText(platform: Platform): Promise<string | null> {
  const session = await getActiveSession(platform);
  if (session?.cookie_text) return session.cookie_text;

  if (platform === 'instagram') return process.env.INSTAGRAM_COOKIES ?? null;
  return null;
}

export async function getInstagramSessionId(): Promise<string | null> {
  const session = await getActiveSession('instagram');
  if (session?.session_id) return session.session_id;
  return process.env.INSTAGRAM_SESSION_ID ?? null;
}

export async function markSessionFailed(platform: Platform): Promise<void> {
  const session = await getActiveSession(platform);
  if (!session) return;

  const sql = getDb();
  if (!sql) return;

  clearCache(platform);

  try {
    const newFailCount = session.fail_count + 1;
    if (newFailCount >= 3) {
      await sql`
        UPDATE auth_sessions
        SET is_active = FALSE, fail_count = ${newFailCount}, updated_at = NOW()
        WHERE id = ${session.id}
      `;
      console.warn(`[DB] ⚠️ ${platform} session "${session.account_name}" deactivated after ${newFailCount} failures. Rotating to next.`);
    } else {
      await sql`
        UPDATE auth_sessions
        SET fail_count = ${newFailCount}, updated_at = NOW()
        WHERE id = ${session.id}
      `;
      console.warn(`[DB] ${platform} session "${session.account_name}" failed (attempt ${newFailCount}/3).`);
    }
  } catch (e) {
    console.error('[DB] Failed to update fail_count:', e instanceof Error ? e.message : e);
  }
}

export async function listAllSessions(): Promise<AuthSession[]> {
  const sql = getDb();
  if (!sql) return [];

  try {
    const rows = await sql`SELECT * FROM auth_sessions ORDER BY platform, id`;
    return (rows as Record<string, unknown>[]).map(toSession);
  } catch (e) {
    console.error('[DB] Failed to list sessions:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function insertSession(data: {
  platform: Platform;
  account_name: string;
  cookie_text: string;
  session_id?: string;
  visitor_data?: string;
}): Promise<AuthSession | null> {
  const sql = getDb();
  if (!sql) return null;

  try {
    const rows = await sql`
      INSERT INTO auth_sessions (platform, account_name, cookie_text, session_id, visitor_data)
      VALUES (${data.platform}, ${data.account_name}, ${data.cookie_text}, ${data.session_id ?? null}, ${data.visitor_data ?? null})
      RETURNING *
    `;
    const row = (rows as unknown[])[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    clearCache(data.platform);
    return toSession(row);
  } catch (e) {
    console.error('[DB] Failed to insert session:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function updateSession(
  id: number,
  data: Partial<{
    account_name: string;
    cookie_text: string;
    session_id: string;
    visitor_data: string;
    is_active: boolean;
    fail_count: number;
  }>
): Promise<AuthSession | null> {
  const sql = getDb();
  if (!sql) return null;

  const currentRows = await sql`SELECT * FROM auth_sessions WHERE id = ${id} LIMIT 1`;
  const current = (currentRows as unknown[])[0] as Record<string, unknown> | undefined;
  if (!current) return null;

  try {
    const rows = await sql`
      UPDATE auth_sessions SET
        account_name  = COALESCE(${data.account_name  ?? null}, account_name),
        cookie_text   = COALESCE(${data.cookie_text   ?? null}, cookie_text),
        session_id    = COALESCE(${data.session_id    ?? null}, session_id),
        visitor_data  = COALESCE(${data.visitor_data  ?? null}, visitor_data),
        is_active     = COALESCE(${data.is_active     ?? null}, is_active),
        fail_count    = COALESCE(${data.fail_count    ?? null}, fail_count),
        updated_at    = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    const row = (rows as unknown[])[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    clearCache(current.platform as Platform);
    return toSession(row);
  } catch (e) {
    console.error('[DB] Failed to update session:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function deleteSession(id: number): Promise<boolean> {
  const sql = getDb();
  if (!sql) return false;

  const currentRows = await sql`SELECT platform FROM auth_sessions WHERE id = ${id} LIMIT 1`;
  const current = (currentRows as unknown[])[0] as Record<string, unknown> | undefined;
  if (!current) return false;

  try {
    await sql`DELETE FROM auth_sessions WHERE id = ${id}`;
    clearCache(current.platform as Platform);
    return true;
  } catch (e) {
    console.error('[DB] Failed to delete session:', e instanceof Error ? e.message : e);
    return false;
  }
}
