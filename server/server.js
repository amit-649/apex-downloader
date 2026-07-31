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
app.use(express.json());

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Lazy load FFmpeg
let ffmpeg = null;
try {
  ffmpeg = require('fluent-ffmpeg');
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  if (ffmpegInstaller?.path) {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  }
} catch (e) {
  console.warn('⚠️ FFmpeg installer warning:', e.message);
}

// Neon DB helper
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
    const row = rows[0];
    return row?.cookie_text || process.env.YOUTUBE_COOKIES || null;
  } catch (e) {
    console.warn('[Server] DB cookie fetch error:', e.message);
    return process.env.YOUTUBE_COOKIES || null;
  }
}

function writeCookiesTempFile(cookieString) {
  if (!cookieString) return null;
  const tmpPath = path.join(process.cwd(), 'temp_yt_cookies.txt');
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
    console.error('Failed to write temp cookie file:', e.message);
    return null;
  }
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const exe = process.platform === 'win32' ? 'yt-dlp' : 'yt-dlp';
    execFile(exe, ['--dump-json', '--no-warnings', '--no-playlist', ...args], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr.trim() || error.message));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`JSON parse error: ${e.message}`));
      }
    });
  });
}

function safeFilename(value, fallback) {
  const clean = (value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
  return clean || fallback;
}

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ApexDownloader Native Live Merger',
    ffmpegAvailable: Boolean(ffmpeg),
    timestamp: new Date().toISOString(),
  });
});

// ── Live Stream Merger Endpoint ──────────────────────────────────────────────
app.get('/api/merge', async (req, res) => {
  const { videoUrl, audioUrl, title } = req.query;

  if (!videoUrl || !audioUrl) {
    return res.status(400).json({ error: 'videoUrl and audioUrl query parameters are required.' });
  }

  if (!ffmpeg) {
    return res.status(500).json({ error: 'FFmpeg binary is not available on this server environment.' });
  }

  try {
    const filename = safeFilename(title, 'Apex_Video');
    console.log(`[Merger] ⚡ Starting live stream pipe for "${filename}.mp4"...`);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.mp4"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const command = ffmpeg()
      .input(videoUrl)
      .inputOptions([
        '-headers', `User-Agent: ${BROWSER_HEADERS['User-Agent']}\r\nAccept-Language: ${BROWSER_HEADERS['Accept-Language']}\r\n`,
      ])
      .input(audioUrl)
      .inputOptions([
        '-headers', `User-Agent: ${BROWSER_HEADERS['User-Agent']}\r\nAccept-Language: ${BROWSER_HEADERS['Accept-Language']}\r\n`,
      ])
      .videoCodec('copy')
      .audioCodec('aac')
      .format('mp4')
      .outputOptions(['-map 0:v:0', '-map 1:a:0', '-shortest', '-movflags frag_keyframe+empty_moov'])
      .on('start', (cmdStr) => {
        console.log('[Merger] FFmpeg live stream process started successfully.');
      })
      .on('error', (err) => {
        console.error('[Merger] FFmpeg streaming error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'FFmpeg stream error' });
        }
      })
      .on('end', () => {
        console.log(`[Merger] ✅ Streaming complete for "${filename}.mp4".`);
      });

    command.pipe(res, { end: true });

  } catch (error) {
    console.error('[Merger] Pipeline error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Stream merger failed.' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Apex Live Stream Merger server listening on port ${PORT}`);
});
