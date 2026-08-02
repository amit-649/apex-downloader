/**
 * Auto Cookie Refresher — runs on Render (merger service).
 *
 * Two modes:
 *  1. Periodic: every REFRESH_INTERVAL_MS (default 6h), rotate cookies by
 *     visiting youtube.com with the current DB cookies → Google issues fresh
 *     cookie values → re-extract and write back to Neon DB.
 *  2. On-demand: POST /api/refresh-cookies (fire-and-forget, deduped) from
 *     Vercel when a download hits a bot-block ("Sign in to confirm").
 *
 * Prerequisites:
 *  - Neon DB (DATABASE_URL) with auth_sessions table
 *  - Render instance with PUPPETEER_SKIP_DOWNLOAD=true,
 *    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
 *  - At least ONE YouTube session in DB seeded from sync_cookies.js
 *
 * The worker NEVER creates a login — it only rotates cookies for an
 * existing session. If Google invalidates the login (password change, security
 * event), the session will eventually fail and you must re-bootstrap via
 * sync_cookies.js.
 */

const { chromium } = require('puppeteer-core');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

// ── Config ──────────────────────────────────────────────────────────────
const REFRESH_INTERVAL_MS = parseInt(process.env.COOKIE_REFRESH_INTERVAL_MS || '') || 6 * 60 * 60 * 1000; // 6h
const MAX_CONCURRENT_REFRESH = 1; // dedupe on-demand calls

// ── Neon helpers ───────────────────────────────────────────────────────
function getDb() {
  return process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
}

async function getActiveYouTubeSession() {
  const sql = getDb();
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT * FROM auth_sessions
      WHERE platform = 'youtube' AND is_active = TRUE
      ORDER BY fail_count ASC, last_used_at ASC
      LIMIT 1
    `;
    return rows[0] || null;
  } catch (e) {
    console.error('[Refresher] DB fetch error:', e.message);
    return null;
  }
}

async function updateYouTubeSession(id, cookieText, visitorData) {
  const sql = getDb();
  if (!sql) return false;
  try {
    await sql`
      UPDATE auth_sessions
      SET cookie_text = ${cookieText},
          visitor_data = ${visitorData ?? null},
          fail_count = 0,
          last_used_at = NOW(),
          updated_at = NOW()
      WHERE id = ${id}
    `;
    return true;
  } catch (e) {
    console.error('[Refresher] DB update error:', e.message);
    return false;
  }
}

async function markSessionFailed(id) {
  const sql = getDb();
  if (!sql) return;
  try {
    await sql`
      UPDATE auth_sessions
      SET fail_count = fail_count + 1,
          updated_at = NOW()
      WHERE id = ${id}
    `;
  } catch (e) {
    console.error('[Refresher] mark failed error:', e.message);
  }
}

// ── Chromium session management ────────────────────────────────────────
let browser = null;
async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  console.log('[Refresher] Launching Chromium...');
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote',
    ],
  });
  browser.on('disconnected', () => { browser = null; });
  return browser;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// ── Cookie rotation logic ──────────────────────────────────────────────
function writeNetscapeCookies(cookies, path) {
  const fs = require('fs');
  let output = '# Netscape HTTP Cookie File\n# Auto-refreshed by ApexDownloader\n\n';
  for (const c of cookies) {
    const domain = c.domain;
    const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const cookiePath = c.path || '/';
    const secure = c.secure ? 'TRUE' : 'FALSE';
    const expiry = c.expires ? Math.round(c.expires) : Math.round(Date.now() / 1000 + 365 * 24 * 60 * 60);
    output += `${domain}\t${includeSubdomains}\t${cookiePath}\t${secure}\t${expiry}\t${c.name}\t${c.value}\n`;
  }
  fs.writeFileSync(path, output, 'utf8');
}

async function fetchVisitorData() {
  try {
    const YT_PUBLIC_KEY = Buffer.from('QUl6YVN5QU9fRkoyczF2NVFRMF9qMjZWNFEyelcyMVg5MDNfdlkw', 'base64').toString('utf8');
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/visitor_id?key=${YT_PUBLIC_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          context: {
            client: { clientName: 'WEB', clientVersion: '2.20240308.00.00', hl: 'en', gl: 'US' },
          },
        }),
      }
    );
    const data = await res.json();
    return data?.responseContext?.visitorData || null;
  } catch (e) {
    console.warn('[Refresher] visitorData fetch failed:', e.message);
    return null;
  }
}

/**
 * Core rotation: load current cookies into Chromium, visit youtube.com,
 * extract fresh cookies, persist to DB.
 */
async function rotateSessionCookies(session) {
  if (!session?.cookie_text) {
    console.warn('[Refresher] No cookie_text in session, skipping');
    return { ok: false, reason: 'no_cookies' };
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  // Set cookies from DB
  const cookiePairs = session.cookie_text.split(';').map(p => p.trim()).filter(Boolean);
  const puppeteerCookies = [];
  for (const pair of cookiePairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const name = pair.substring(0, idx).trim();
      const value = pair.substring(idx + 1).trim();
      puppeteerCookies.push({
        name,
        value,
        domain: '.youtube.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'None',
      });
    }
  }
  await page.setCookie(...puppeteerCookies);

  // Visit YouTube to trigger cookie refresh (Google updates expiry/values)
  try {
    await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    console.warn('[Refresher] youtube.com navigation error:', e.message);
  }

  // Extract fresh cookies
  const freshCookies = await page.cookies('https://www.youtube.com', 'https://google.com');
  await page.close();

  const hasSid = freshCookies.some(c => c.name === 'SID');
  if (!hasSid) {
    console.warn('[Refresher] Rotation produced no SID — session may be dead');
    return { ok: false, reason: 'no_sid' };
  }

  const cookieString = freshCookies.map(c => `${c.name}=${c.value}`).join('; ');
  const visitorData = await fetchVisitorData();

  const updated = await updateYouTubeSession(session.id, cookieString, visitorData);
  if (!updated) return { ok: false, reason: 'db_update_failed' };

  console.log(`[Refresher] ✅ Rotated YouTube session ${session.id} (account: ${session.account_name})`);
  return { ok: true, visitorData: !!visitorData };
}

// ── Periodic runner ────────────────────────────────────────────────────
let periodicTimer = null;
async function runPeriodicRefresh() {
  console.log('[Refresher] ⏰ Periodic refresh tick');
  const session = await getActiveYouTubeSession();
  if (!session) {
    console.warn('[Refresher] No active YouTube session in DB — skipping');
    return;
  }
  const result = await rotateSessionCookies(session);
  if (!result.ok) {
    await markSessionFailed(session.id);
    console.warn('[Refresher] Rotation failed, marked session failed');
  }
}

function startPeriodic() {
  if (periodicTimer) return;
  console.log(`[Refresher] Starting periodic refresh every ${REFRESH_INTERVAL_MS / 1000 / 60} min`);
  runPeriodicRefresh(); // run once immediately
  periodicTimer = setInterval(runPeriodicRefresh, REFRESH_INTERVAL_MS);
}

function stopPeriodic() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

// ── On-demand (fire-and-forget, deduped) ───────────────────────────────
let onDemandRunning = false;
async function handleOnDemandRefresh() {
  if (onDemandRunning) {
    console.log('[Refresher] On-demand refresh already running — skipping');
    return { ok: false, reason: 'already_running' };
  }
  onDemandRunning = true;
  try {
    const session = await getActiveYouTubeSession();
    if (!session) return { ok: false, reason: 'no_session' };
    return await rotateSessionCookies(session);
  } finally {
    onDemandRunning = false;
  }
}

// ── Express route handlers ─────────────────────────────────────────────
function attachRefresherRoutes(app) {
  // On-demand: POST /api/refresh-cookies
  app.post('/api/refresh-cookies', async (req, res) => {
    // Optional: simple shared secret for callers (Vercel side)
    const secret = process.env.REFRESHER_SECRET;
    if (secret) {
      const auth = req.headers['x-refresher-secret'];
      if (auth !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    // Fire-and-forget — return immediately
    res.json({ status: 'accepted', message: 'Cookie refresh started in background' });
    handleOnDemandRefresh().then(r => {
      console.log('[Refresher] On-demand result:', r);
    }).catch(e => {
      console.error('[Refresher] On-demand error:', e.message);
    });
  });

  // Health: GET /api/refresh-cookies
  app.get('/api/refresh-cookies', async (req, res) => {
    const session = await getActiveYouTubeSession();
    res.json({
      status: 'ok',
      periodic: { intervalMs: REFRESH_INTERVAL_MS, running: !!periodicTimer },
      activeSession: session ? {
        id: session.id,
        account: session.account_name,
        failCount: session.fail_count,
        hasVisitorData: !!session.visitor_data,
        lastUsed: session.last_used_at,
      } : null,
    });
  });
}

// ── Graceful shutdown ──────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('[Refresher] SIGTERM — shutting down...');
  stopPeriodic();
  await closeBrowser();
  process.exit(0);
});

module.exports = { startPeriodic, stopPeriodic, attachRefresherRoutes, runPeriodicRefresh, handleOnDemandRefresh };