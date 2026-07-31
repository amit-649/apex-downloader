import { neon } from '@neondatabase/serverless';

/**
 * Singleton Neon SQL client.
 * Uses HTTP-based serverless driver — no connection pool exhaustion on Vercel.
 * Returns null if DATABASE_URL is not configured (graceful degradation to env vars).
 */
let _sql: ReturnType<typeof neon> | null = null;

export function getDb(): ReturnType<typeof neon> | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
