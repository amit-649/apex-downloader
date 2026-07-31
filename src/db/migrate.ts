/**
 * One-time database migration script.
 * Run with: npm run db:migrate
 *
 * Creates the auth_sessions table and seeds initial sessions from .env.local values.
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local for local migration runs
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set. Please add it to .env.local and retry.');
    process.exit(1);
  }

  const sql = neon(databaseUrl);
  console.log('🔌 Connected to Neon Postgres.\n');

  // ── 1. Create Table ──────────────────────────────────────────────────────
  console.log('📦 Creating auth_sessions table (if not exists)...');
  await sql`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id            SERIAL        PRIMARY KEY,
      platform      VARCHAR(30)   NOT NULL,
      account_name  VARCHAR(100)  NOT NULL,
      cookie_text   TEXT          NOT NULL,
      session_id    TEXT,
      visitor_data  TEXT,
      is_active     BOOLEAN       DEFAULT TRUE,
      fail_count    INTEGER       DEFAULT 0,
      last_used_at  TIMESTAMPTZ   DEFAULT NOW(),
      updated_at    TIMESTAMPTZ   DEFAULT NOW()
    )
  `;
  console.log('✅ Table ready.\n');

  // ── 2. Seed YouTube Session ──────────────────────────────────────────────
  const youtubeCookies = process.env.YOUTUBE_COOKIES;
  if (youtubeCookies) {
    const existing = await sql`
      SELECT id FROM auth_sessions WHERE platform = 'youtube' AND account_name = 'default_youtube'
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO auth_sessions (platform, account_name, cookie_text, is_active)
        VALUES ('youtube', 'default_youtube', ${youtubeCookies}, TRUE)
      `;
      console.log('✅ YouTube session seeded from YOUTUBE_COOKIES env var.');
    } else {
      // Update existing row with latest env var value
      await sql`
        UPDATE auth_sessions
        SET cookie_text = ${youtubeCookies}, updated_at = NOW()
        WHERE platform = 'youtube' AND account_name = 'default_youtube'
      `;
      console.log('🔄 YouTube session updated from YOUTUBE_COOKIES env var (row already existed).');
    }
  } else {
    console.warn('⚠️  YOUTUBE_COOKIES not set — skipping YouTube seed.');
  }

  // ── 3. Seed Instagram Session ────────────────────────────────────────────
  const instagramCookies = process.env.INSTAGRAM_COOKIES;
  const instagramSessionId = process.env.INSTAGRAM_SESSION_ID;

  if (instagramCookies) {
    const existing = await sql`
      SELECT id FROM auth_sessions WHERE platform = 'instagram' AND account_name = 'default_instagram'
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO auth_sessions (platform, account_name, cookie_text, session_id, is_active)
        VALUES ('instagram', 'default_instagram', ${instagramCookies}, ${instagramSessionId ?? null}, TRUE)
      `;
      console.log('✅ Instagram session seeded from INSTAGRAM_COOKIES env var.');
    } else {
      await sql`
        UPDATE auth_sessions
        SET cookie_text  = ${instagramCookies},
            session_id   = ${instagramSessionId ?? null},
            updated_at   = NOW()
        WHERE platform = 'instagram' AND account_name = 'default_instagram'
      `;
      console.log('🔄 Instagram session updated from INSTAGRAM_COOKIES env var (row already existed).');
    }
  } else {
    console.warn('⚠️  INSTAGRAM_COOKIES not set — skipping Instagram seed.');
  }

  // ── 4. Verify ────────────────────────────────────────────────────────────
  const rows = await sql`SELECT id, platform, account_name, is_active, fail_count FROM auth_sessions ORDER BY id`;
  console.log('\n📋 Current auth_sessions table:');
  console.table(rows);
  console.log('\n✅ Migration complete! Your cookies are now stored in Neon Postgres.');
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
