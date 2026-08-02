/**
 * ApexDownloader — Render Merge Service (clean rewrite)
 *
 * Single responsibility: merge YouTube split streams (video+audio) via FFmpeg.
 * No cookie management, no cron, no WASM — just pure FFmpeg piping.
 *
 * Endpoints:
 *   GET  /health                    — health check
 *   POST /merge                     — merge endpoint
 *       body: { url, height?, title?, videoItag?, audioItag? }
 *       response: video/mp4 stream
 */

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── FFmpeg Setup ─────────────────────────────────────────────────────────────
let ffmpeg = null;
try {
  ffmpeg = require('fluent-ffmpeg');
  if (fs.existsSync('/usr/bin/ffmpeg')) {
    ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');
    console.log('[Init] Using system native FFmpeg at /usr/bin/ffmpeg');
  } else {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    if (ffmpegInstaller?.path && fs.existsSync(ffmpegInstaller.path)) {
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
      console.log(`[Init] Using installer FFmpeg: ${ffmpegInstaller.path}`);
    }
  }
} catch (e) {
  console.warn('[Init] FFmpeg setup warning:', e.message);
}

// ── yt-dlp binary ─────────────────────────────────────────────────────────────
const YTDLP_PATH = path.join(__dirname, 'yt-dlp');
function getYtDlpPath() {
  return fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : 'yt-dlp';
}

// Absolute Node path for yt-dlp JS runtime
const JS_RUNTIME = `node:${process.execPath}`;

// ── Neon DB (for cookie rotation) ─────────────────────────────────────────────
function getDb() {
  return process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
}

async function getActiveCookie() {
  const sql = getDb();
  if (!sql) return process.env.YOUTUBE_COOKIES || null;
  try {
    const rows = await sql`
      SELECT cookie_text FROM auth_sessions
      WHERE platform = 'youtube' AND is_active = TRUE
      ORDER BY fail_count ASC, last_used_at ASC LIMIT 1
    `;
    return rows[0]?.cookie_text || process.env.YOUTUBE_COOKIES || null;
  } catch (e) {
    console.warn('[DB] Cookie fetch error:', e.message);
    return process.env.YOUTUBE_COOKIES || null;
  }
}

function writeCookieFile(cookieString) {
  if (!cookieString) return null;
  const tmp = path.join(__dirname, 'yt_cookies.txt');
  try {
    let out = '# Netscape HTTP Cookie File\n\n';
    for (const pair of cookieString.split(';')) {
      const i = pair.indexOf('=');
      if (i > 0) {
        const k = pair.substring(0, i).trim();
        const v = pair.substring(i + 1).trim();
        out += `.youtube.com\tTRUE\t/\tTRUE\t0\t${k}\t${v}\n`;
      }
    }
    fs.writeFileSync(tmp, out, 'utf8');
    return tmp;
  } catch (e) {
    console.error('[Cookies] Write error:', e.message);
    return null;
  }
}

// ── yt-dlp extraction ─────────────────────────────────────────────────────────
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const exe = getYtDlpPath();
    const fullArgs = ['--dump-json', '--no-warnings', '--no-playlist', ...args];
    console.log(`[yt-dlp] ${exe} ${fullArgs.join(' ').slice(0, 200)}...`);

    execFile(exe, fullArgs, { maxBuffer: 10 * 1024 * 1024, timeout: 60000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.trim() || err.message));
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
    });
  });
}

async function fetchVisitorData() {
  try {
    const key = Buffer.from('QUl6YVN5QU9fRkoyczF2NVFRMF9qMjZWNFEyelcyMVg5MDNfdlkw', 'base64').toString('utf8');
    const res = await fetch(`https://www.youtube.com/youtubei/v1/visitor_id?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20240308.00.00', hl: 'en', gl: 'US' } } }),
    });
    const data = await res.json();
    return data?.responseContext?.visitorData || null;
  } catch (e) {
    console.warn('[yt-dlp] visitorData fetch failed:', e.message);
    return null;
  }
}

async function extractInfoWithFallback(url, cookieArgs) {
  const visitorData = await fetchVisitorData();
  const baseExtractorArgs = [visitorData ? `youtube:visitor_data=${visitorData}` : ''].filter(Boolean);

  // 3-stage player client fallback (same as ytdlp.ts)
  const attempts = [
    { label: 'Standard', extraArgs: [...baseExtractorArgs, 'youtube:player_client=ios,android,web'] },
    { label: 'iOS/Android/Web', extraArgs: [...baseExtractorArgs, 'youtube:player_client=ios,android,web'] },
    { label: 'TV/mweb', extraArgs: [...baseExtractorArgs, 'youtube:player_client=tv,mweb'] },
  ];

  for (const attempt of attempts) {
    try {
      const args = [...cookieArgs, '--js-runtimes', JS_RUNTIME];
      if (attempt.extraArgs.length) {
        args.push('--extractor-args', attempt.extraArgs.join(','));
      }
      console.log(`[yt-dlp] Attempt: ${attempt.label}`);
      return await runYtDlp([...args, url]);
    } catch (e) {
      console.warn(`[yt-dlp] ${attempt.label} failed:`, e.message);
    }
  }
  throw new Error('All extraction attempts failed');
}

// ── Merge Endpoint ────────────────────────────────────────────────────────────
app.post('/merge', async (req, res) => {
  const { url, height = 1080, title = 'Apex_Video', videoItag, audioItag } = req.body;

  if (!url) return res.status(400).json({ error: 'YouTube URL required' });
  if (!ffmpeg) return res.status(500).json({ error: 'FFmpeg unavailable' });

  try {
    // Get cookies for this request
    const cookieText = await getActiveCookie();
    const cookieFile = writeCookieFile(cookieText);
    const cookieArgs = cookieFile ? ['--cookies', cookieFile] : [];

    // Extract fresh formats on Render's IP (bypasses Vercel IP lock)
    const info = await extractInfoWithFallback(url, cookieArgs);
    const formats = info.formats || [];

    // Select video format — prioritize exact itag match, but ALWAYS fallback to resolution
    let videoFormat = null;
    if (videoItag) {
      videoFormat = formats.find(f => String(f.format_id) === String(videoItag) && f.url);
      if (!videoFormat) {
        console.log(`[Merge] Exact video itag ${videoItag} not found in fresh extraction, falling back to resolution ${height}p`);
      }
    }
    if (!videoFormat) {
      videoFormat = formats
        .filter(f => f.vcodec && f.vcodec !== 'none' && f.url)
        .sort((a, b) => {
          const ad = Math.abs((a.height || 0) - height);
          const bd = Math.abs((b.height || 0) - height);
          return ad - bd || (b.tbr || 0) - (a.tbr || 0);
        })[0];
    }

    // Select audio format — same logic
    let audioFormat = null;
    if (audioItag) {
      audioFormat = formats.find(f => String(f.format_id) === String(audioItag) && f.url);
      if (!audioFormat) {
        console.log(`[Merge] Exact audio itag ${audioItag} not found in fresh extraction, falling back to best audio`);
      }
    }
    if (!audioFormat) {
      audioFormat = formats
        .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none') && f.url)
        .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];
    }

    if (!videoFormat?.url || !audioFormat?.url) {
      return res.status(404).json({ error: 'Could not resolve compatible streams' });
    }

    console.log(`[Merge] ${videoFormat.format_id} (${videoFormat.height || '?'}p) + ${audioFormat.format_id}`);

    const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180) || 'Apex_Video';
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp4"`);
    res.setHeader('Cache-Control', 'no-store');

    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    const headers = `User-Agent: ${ua}\r\nReferer: https://www.youtube.com/\r\n`;

    ffmpeg()
      .input(videoFormat.url).inputOptions(['-headers', headers, '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '15'])
      .input(audioFormat.url).inputOptions(['-headers', headers, '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '15'])
      .videoCodec('copy')
      .audioCodec('aac')
      .format('mp4')
      .outputOptions(['-map', '0:v:0', '-map', '1:a:0', '-movflags', 'frag_keyframe+empty_moov+default_base_moof'])
      .on('error', (err) => {
        console.error('[Merge] FFmpeg error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: `FFmpeg: ${err.message}` });
      })
      .on('end', () => console.log(`[Merge] Done: ${safeTitle}.mp4`))
      .writeToStream(res, { end: true });

  } catch (e) {
    console.error('[Merge] Fatal:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Merge failed' });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const ytdlp = getYtDlpPath();
  res.json({
    status: 'ok',
    service: 'ApexDownloader Merge Service',
    ffmpeg: !!ffmpeg,
    ytdlp: fs.existsSync(ytdlp) || ytdlp === 'yt-dlp',
    ytdlpPath: ytdlp,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Apex Merge Service on port ${PORT}`);
  console.log(`   yt-dlp: ${getYtDlpPath()}`);
  console.log(`   FFmpeg: ${!!ffmpeg}`);
});