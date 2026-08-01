const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// ── FFmpeg Setup ─────────────────────────────────────────────────────────────
let ffmpeg = null;
try {
  ffmpeg = require('fluent-ffmpeg');
  if (fs.existsSync('/usr/bin/ffmpeg')) {
    ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');
    console.log('[Init] Using system native FFmpeg binary at /usr/bin/ffmpeg');
  } else {
    try {
      const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
      if (ffmpegInstaller?.path && fs.existsSync(ffmpegInstaller.path)) {
        ffmpeg.setFfmpegPath(ffmpegInstaller.path);
        console.log(`[Init] Using installer FFmpeg path: ${ffmpegInstaller.path}`);
      }
    } catch (e) {
      console.warn('[Init] FFmpeg installer fallback warning:', e.message);
    }
  }
} catch (e) {
  console.warn('[Init] FFmpeg setup warning:', e.message);
}

// ── yt-dlp binary path ──────────────────────────────────────────────────────
function getYtDlpPath() {
  const localBin = path.join(__dirname, 'yt-dlp');
  if (fs.existsSync(localBin)) return localBin;
  return 'yt-dlp'; // fallback to system PATH
}

// Absolute path to the JS runtime for yt-dlp. Bare `node` works locally but
// NOT on Render (yt-dlp 2026+ needs a JS runtime to extract YouTube; without
// it you get "No supported JavaScript runtime could be found" / "Requested
// format is not available"). process.execPath is always the exact Node binary
// running this server, so it is guaranteed to exist.
const JS_RUNTIME = `node:${process.execPath}`;

// Keep yt-dlp fresh at startup. YouTube changes its format extraction frequently;
// an outdated binary returns "Requested format is not available" (or empty format
// lists). Self-update in place, falling back to re-downloading the latest binary.
async function updateYtDlp() {
  const exe = getYtDlpPath();
  try {
    const { execFile } = require('child_process');
    await new Promise((resolve) => {
      execFile(exe, ['-U', '--no-warnings'], { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) {
          console.warn('[yt-dlp] Self-update failed:', stderr?.trim() || err.message);
        } else {
          console.log('[yt-dlp] Self-update OK:', (stdout || '').trim().split('\n')[0]);
        }
        resolve();
      });
    });
    // Verify it still runs after updating.
    await new Promise((resolve) => {
      execFile(exe, ['--version'], { timeout: 10000 }, (err, stdout) => {
        if (!err) console.log(`[yt-dlp] Running version: ${stdout.trim()}`);
        else console.warn('[yt-dlp] Version check failed:', err.message);
        resolve();
      });
    });
  } catch (e) {
    console.warn('[yt-dlp] Startup update error:', e.message);
  }
}

// ── Neon DB helpers ──────────────────────────────────────────────────────────
function getDb() {
  if (!process.env.DATABASE_URL) return null;
  return neon(process.env.DATABASE_URL);
}

async function getActiveYouTubeCookie() {
  const sql = getDb();
  if (!sql) return process.env.YOUTUBE_COOKIES || null;

  try {
    const rows = await sql`
      SELECT cookie_text FROM auth_sessions
      WHERE platform = 'youtube' AND is_active = TRUE
      ORDER BY fail_count ASC, last_used_at ASC
      LIMIT 1
    `;
    return rows[0]?.cookie_text || process.env.YOUTUBE_COOKIES || null;
  } catch (e) {
    console.warn('[DB] Cookie fetch error:', e.message);
    return process.env.YOUTUBE_COOKIES || null;
  }
}

function writeCookiesTempFile(cookieString) {
  if (!cookieString) return null;
  const tmpPath = path.join(__dirname, 'temp_yt_cookies.txt');
  try {
    let netscape = '# Netscape HTTP Cookie File\n\n';
    for (const pair of cookieString.split(';')) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const key = pair.substring(0, idx).trim();
        const val = pair.substring(idx + 1).trim();
        netscape += `.youtube.com\tTRUE\t/\tTRUE\t0\t${key}\t${val}\n`;
      }
    }
    fs.writeFileSync(tmpPath, netscape, 'utf8');
    return tmpPath;
  } catch (e) {
    console.error('[Cookies] Write error:', e.message);
    return null;
  }
}

// ── yt-dlp format extraction ─────────────────────────────────────────────────
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const exe = getYtDlpPath();
    const fullArgs = ['--dump-json', '--no-warnings', '--no-playlist', ...args];
    console.log(`[yt-dlp] Running: ${exe} ${fullArgs.join(' ').substring(0, 200)}...`);

    execFile(exe, fullArgs, { maxBuffer: 10 * 1024 * 1024, timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[yt-dlp] Error:', stderr?.trim() || error.message);
        return reject(new Error(stderr?.trim() || error.message));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`JSON parse error: ${e.message}`));
      }
    });
  });
}

function safeFilename(value, fallback) {
  return (value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180) || fallback;
}

// ── Diagnostic: probe Render's outbound network to youtube.com ───────────────
// Debugs why yt-dlp extraction works locally but fails on Render despite the
// same binary/version/flags. If Render cannot reach youtube.com/youtubei/v1,
// fetchVisitorData() returns null and attempts run WITHOUT visitor_data →
// "Requested format is not available".
app.get('/diag', async (req, res) => {
  const out = { timestamp: new Date().toISOString() };

  // 1. yt-dlp version
  out.ytdlpVersion = await getYtDlpVersion();

  // 2. Direct probe of the visitor_id endpoint (same URL + key fetchVisitorData uses)
  try {
    const YT_PUBLIC_KEY = Buffer.from('QUl6YVN5QU9fRkoyczF2NVFRMF9qMjZWNFEyelcyMVg5MDNfdlkw', 'base64').toString('utf8');
    const probe = await fetch(
      `https://www.youtube.com/youtubei/v1/visitor_id?key=${YT_PUBLIC_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
        body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20240308.00.00', hl: 'en', gl: 'US' } } }),
      }
    );
    const txt = await probe.text();
    let vd = null;
    try { vd = JSON.parse(txt)?.responseContext?.visitorData || null; } catch {}
    out.visitorProbe = {
      status: probe.status,
      ok: probe.ok,
      hasVisitorData: Boolean(vd),
      visitorDataPrefix: vd ? vd.substring(0, 20) : null,
      bodySnippet: txt.substring(0, 200),
    };
  } catch (e) {
    out.visitorProbe = { error: e.message };
  }

  // 3. Quick yt-dlp extraction smoke test (no cookies, attempt 1 flags)
  try {
    const args = ['--js-runtimes', JS_RUNTIME, '--print', '%(title)s'];
    const title = await new Promise((resolve, reject) => {
      execFile(getYtDlpPath(), args.concat('https://www.youtube.com/watch?v=jNQXAC9IVRw'), { timeout: 60000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr?.trim() || err.message));
        resolve(stdout.trim());
      });
    });
    out.extractionSmokeTest = { ok: true, title };
  } catch (e) {
    out.extractionSmokeTest = { ok: false, error: e.message };
  }

  res.json(out);
});

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const ytdlpExists = fs.existsSync(getYtDlpPath()) || getYtDlpPath() === 'yt-dlp';
  res.json({
    status: 'ok',
    service: 'ApexDownloader Live Merger',
    ffmpegAvailable: Boolean(ffmpeg),
    ytdlpAvailable: ytdlpExists,
    ytdlpPath: getYtDlpPath(),
    ytdlpVersion: await getYtDlpVersion(),
    timestamp: new Date().toISOString(),
  });
});

function getYtDlpVersion() {
  const exe = getYtDlpPath();
  return new Promise((resolve) => {
    execFile(exe, ['--version'], { timeout: 10000 }, (err, stdout) => {
      resolve(err ? null : (stdout || '').trim());
    });
  });
}

// Fresh visitor_data mirrors Vercel's src/utils/yt-potoken.ts. Without it,
// YouTube returns empty/garbled format lists ("Requested format is not
// available") — the exact failure the user hit on Render.
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
    console.warn('[yt-dlp] visitorData fetch failed:', e.message);
    return null;
  }
}

async function extractInfoWithFallback(url, cookieArgs) {
  const visitorData = await fetchVisitorData();
  const visitorPart = visitorData ? `youtube:visitor_data=${visitorData}` : '';
  // Combine visitor_data + player_client in one --extractor-args list when both exist.
  const extractorArgs = (clientPart) => {
    const parts = [];
    if (visitorPart) parts.push(visitorPart);
    if (clientPart) parts.push(clientPart);
    return parts.length ? ['--extractor-args', parts.join(',')] : [];
  };

  const attempts = [
    // NOTE: `--js-runtimes <abs node path>` is REQUIRED on every attempt.
    // Verified on Render: without a resolvable JS runtime yt-dlp returns
    // "No supported JavaScript runtime could be found" / "Requested format
    // is not available". Bare `node` is NOT found on Render; use the abs path.
    { label: 'Standard + visitor data', args: [...extractorArgs(''), '--js-runtimes', JS_RUNTIME] },
    { label: 'Rotated clients (ios, android, web)', args: [...extractorArgs('player_client=ios,android,web'), '--js-runtimes', JS_RUNTIME] },
    { label: 'TV / mweb clients', args: [...extractorArgs('player_client=tv,mweb'), '--js-runtimes', JS_RUNTIME] },
  ];

  const runAttempts = async () => {
    let lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
      const { label, args } = attempts[i];
      try {
        console.log(`[yt-dlp] Attempt ${i + 1}: ${label}...`);
        return await runYtDlp([...cookieArgs, ...args, url]);
      } catch (e) {
        console.warn(`[yt-dlp] Attempt ${i + 1} failed:`, e.message);
        lastErr = e;
      }
    }
    const err = new Error(`YouTube extraction failed on all client rotation attempts: ${lastErr.message}`);
    err.retryable = /Requested format is not available|No video formats found|Sign in to confirm/i.test(lastErr ? lastErr.message : '');
    return { err };
  };

  const first = await runAttempts();
  if (!first.err) return first;

  // Self-heal: if extraction failed with a format/sign-in error, force-update
  // yt-dlp and retry once. Handles a stale binary baked into a cached Docker
  // layer even when the startup update didn't take effect.
  if (first.err.retryable) {
    console.warn('[yt-dlp] Extraction failed — forcing yt-dlp self-update and retrying...');
    await updateYtDlp();
    const retry = await runAttempts();
    if (!retry.err) return retry;
    throw retry.err;
  }
  throw first.err;
}

// ── Live Stream Merger Endpoint ──────────────────────────────────────────────
app.all('/api/merge', async (req, res) => {
  const { url, height, title, videoItag, audioItag, videoUrl: rawVideoUrl, audioUrl: rawAudioUrl } = req.body || req.query || {};

  console.log(`[Merger] Request — url: ${url}, videoItag: ${videoItag}, height: ${height}, title: ${title}, hasDirectUrls: ${Boolean(rawVideoUrl && rawAudioUrl)}`);

  if (!url && (!rawVideoUrl || !rawAudioUrl)) {
    return res.status(400).json({ error: 'YouTube URL or stream URLs are required.' });
  }

  if (!ffmpeg) {
    return res.status(500).json({ error: 'FFmpeg binary is not available.' });
  }

  try {
    let finalVideoUrl = rawVideoUrl;
    let finalAudioUrl = rawAudioUrl;

    // ⚠️ ALWAYS re-extract fresh stream URLs on Render's own IP when a YouTube URL is given.
    // Client-supplied videoUrl/audioUrl are IP-locked to whichever server fetched details;
    // Googlevideo drops those connections after ~1-2MB (HTTP 403 / TCP RST), which truncates
    // the download. Fresh URLs bound to Render's IP stream the full video without interruption.
    if (url) {
      finalVideoUrl = null;
      finalAudioUrl = null;
    }

    // If direct stream URLs are not provided, extract them using 3-stage yt-dlp fallback
    if (!finalVideoUrl || !finalAudioUrl) {
      const cookieText = await getActiveYouTubeCookie();
      const cookieFile = writeCookiesTempFile(cookieText);
      const cookieArgs = cookieFile ? ['--cookies', cookieFile] : [];

      console.log('[Merger] Extracting format info with 3-stage yt-dlp fallback...');
      const info = await extractInfoWithFallback(url, cookieArgs);

      const targetHeight = parseInt(height) || 1080;
      const allFormats = info.formats || [];

      // Attempt exact itag match first (matches user selection byte-for-byte)
      let videoFormat = videoItag ? allFormats.find(f => String(f.format_id) === String(videoItag) && f.url) : null;
      let audioFormat = audioItag ? allFormats.find(f => String(f.format_id) === String(audioItag) && f.url) : null;

      // Fallback: match by height proximity if exact itag not found in rotation
      if (!videoFormat) {
        const videoFormats = allFormats
          .filter(f => f.vcodec && f.vcodec !== 'none' && f.url)
          .sort((a, b) => {
            const aHeight = a.height || 0;
            const bHeight = b.height || 0;
            const aDiff = Math.abs(aHeight - targetHeight);
            const bDiff = Math.abs(bHeight - targetHeight);
            if (aDiff !== bDiff) return aDiff - bDiff;
            return (b.tbr || b.vbr || 0) - (a.tbr || a.vbr || 0);
          });
        videoFormat = videoFormats[0];
      }

      if (!audioFormat) {
        const audioFormats = allFormats
          .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none') && f.url)
          .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
        audioFormat = audioFormats[0];
      }

      if (!videoFormat?.url || !audioFormat?.url) {
        return res.status(404).json({ error: 'Could not resolve compatible video or audio format streams.' });
      }

      finalVideoUrl = videoFormat.url;
      finalAudioUrl = audioFormat.url;
      console.log(`[Merger] Resolved video format: ${videoFormat.format_id} (${videoFormat.height || '?'}p), audio: ${audioFormat.format_id}`);
    }

    const filename = safeFilename(title, 'Apex_Video');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.mp4"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    console.log(`[Merger] ⚡ Starting FFmpeg live stream pipe for "${filename}.mp4"...`);

    const command = ffmpeg()
      .input(finalVideoUrl)
      .inputOptions([
        '-headers', `User-Agent: ${BROWSER_HEADERS['User-Agent']}\r\nReferer: https://www.youtube.com/\r\n`,
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '15',
        '-rw_timeout', '30000000',
        '-http_persistent', '0',
      ])
      .input(finalAudioUrl)
      .inputOptions([
        '-headers', `User-Agent: ${BROWSER_HEADERS['User-Agent']}\r\nReferer: https://www.youtube.com/\r\n`,
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '15',
        '-rw_timeout', '30000000',
        '-http_persistent', '0',
      ])
      .videoCodec('copy')
      .audioCodec('aac')
      .format('mp4')
      .outputOptions([
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      ])
      .on('start', (cmd) => {
        console.log('[Merger] FFmpeg process started successfully.');
      })
      .on('error', (err) => {
        console.error('[Merger] FFmpeg streaming error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: `FFmpeg error: ${err.message}` });
        }
      })
      .on('end', () => {
        console.log(`[Merger] ✅ Stream complete for "${filename}.mp4".`);
      });

    command.writeToStream(res, { end: true });

  } catch (error) {
    console.error('[Merger] Fatal error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Stream merger failed.' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Apex Live Merger listening on port ${PORT}`);
  console.log(`   yt-dlp path: ${getYtDlpPath()}`);
  console.log(`   FFmpeg available: ${Boolean(ffmpeg)}`);
});

// Ensure yt-dlp is current before serving merge requests (fixes
// "Requested format is not available" caused by an outdated binary).
updateYtDlp();
