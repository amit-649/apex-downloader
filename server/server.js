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
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  if (ffmpegInstaller?.path) {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    console.log(`[Init] FFmpeg path: ${ffmpegInstaller.path}`);
  }
} catch (e) {
  console.warn('[Init] FFmpeg installer warning:', e.message);
}

// ── yt-dlp binary path ──────────────────────────────────────────────────────
function getYtDlpPath() {
  const localBin = path.join(__dirname, 'yt-dlp');
  if (fs.existsSync(localBin)) return localBin;
  return 'yt-dlp'; // fallback to system PATH
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

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const ytdlpExists = fs.existsSync(getYtDlpPath()) || getYtDlpPath() === 'yt-dlp';
  res.json({
    status: 'ok',
    service: 'ApexDownloader Live Merger',
    ffmpegAvailable: Boolean(ffmpeg),
    ytdlpAvailable: ytdlpExists,
    ytdlpPath: getYtDlpPath(),
    timestamp: new Date().toISOString(),
  });
});

// ── Live Stream Merger Endpoint ──────────────────────────────────────────────
// Accepts: { url: "youtube-video-url", height: 1080|1440|2160, title: "..." }
// Render runs its own yt-dlp to extract stream URLs (avoids IP-lock issues)
// Then merges video+audio via FFmpeg and streams back
app.post('/api/merge', async (req, res) => {
  const { url, height, title } = req.body || {};

  console.log(`[Merger] Request — url: ${url}, height: ${height}, title: ${title}`);

  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required.' });
  }

  if (!ffmpeg) {
    return res.status(500).json({ error: 'FFmpeg binary is not available.' });
  }

  try {
    // 1. Get YouTube cookies from Neon DB
    const cookieText = await getActiveYouTubeCookie();
    const cookieFile = writeCookiesTempFile(cookieText);
    const cookieArgs = cookieFile ? ['--cookies', cookieFile] : [];

    // 2. Extract format info using yt-dlp on THIS server (Render's IP)
    console.log('[Merger] Extracting format info with yt-dlp...');
    const info = await runYtDlp([...cookieArgs, url]);

    // 3. Pick best video format at the requested height
    const targetHeight = parseInt(height) || 1080;
    const allFormats = info.formats || [];

    // Filter video-only formats (has video codec, no audio or separate audio)
    const videoFormats = allFormats
      .filter(f => f.vcodec && f.vcodec !== 'none' && f.url && f.height)
      .sort((a, b) => {
        // Prefer exact height match, then closest height
        const aDiff = Math.abs(a.height - targetHeight);
        const bDiff = Math.abs(b.height - targetHeight);
        if (aDiff !== bDiff) return aDiff - bDiff;
        // For same height, prefer higher bitrate
        return (b.tbr || b.vbr || 0) - (a.tbr || a.vbr || 0);
      });

    // Filter audio-only formats
    const audioFormats = allFormats
      .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none') && f.url)
      .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));

    const videoFormat = videoFormats[0];
    const audioFormat = audioFormats[0];

    if (!videoFormat?.url) {
      return res.status(404).json({ error: `No video format found at ${targetHeight}p. Available heights: ${[...new Set(allFormats.filter(f => f.height).map(f => f.height))].join(', ')}` });
    }
    if (!audioFormat?.url) {
      return res.status(404).json({ error: 'No audio format found.' });
    }

    console.log(`[Merger] Selected video: ${videoFormat.format_id} (${videoFormat.height}p ${videoFormat.vcodec} ${videoFormat.tbr || '?'}kbps)`);
    console.log(`[Merger] Selected audio: ${audioFormat.format_id} (${audioFormat.acodec} ${audioFormat.abr || '?'}kbps)`);

    // 4. Set response headers for file download
    const filename = safeFilename(title, 'Apex_Video');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.mp4"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // 5. FFmpeg live stream merge
    console.log(`[Merger] ⚡ Starting FFmpeg live stream pipe for "${filename}.mp4"...`);

    const command = ffmpeg()
      .input(videoFormat.url)
      .inputOptions([
        '-user_agent', BROWSER_HEADERS['User-Agent'],
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
      ])
      .input(audioFormat.url)
      .inputOptions([
        '-user_agent', BROWSER_HEADERS['User-Agent'],
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
      ])
      .videoCodec('copy')
      .audioCodec('aac')
      .format('mp4')
      .outputOptions([
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      ])
      .on('start', (cmd) => {
        console.log('[Merger] FFmpeg process started.');
      })
      .on('progress', (progress) => {
        if (progress.timemark) {
          console.log(`[Merger] Progress: ${progress.timemark}`);
        }
      })
      .on('error', (err) => {
        console.error('[Merger] FFmpeg error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: `FFmpeg error: ${err.message}` });
        }
      })
      .on('end', () => {
        console.log(`[Merger] ✅ Stream complete for "${filename}.mp4".`);
      });

    command.pipe(res, { end: true });

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
