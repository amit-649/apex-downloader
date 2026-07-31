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

async function extractInfoWithFallback(url, cookieArgs) {
  try {
    console.log('[yt-dlp] Attempt 1: Standard extraction...');
    return await runYtDlp([...cookieArgs, url]);
  } catch (err1) {
    console.warn('[yt-dlp] Attempt 1 failed:', err1.message);
    try {
      console.log('[yt-dlp] Attempt 2: Rotated player clients (ios, android, web)...');
      return await runYtDlp([...cookieArgs, '--extractor-args', 'youtube:player_client=ios,android,web', url]);
    } catch (err2) {
      console.warn('[yt-dlp] Attempt 2 failed:', err2.message);
      try {
        console.log('[yt-dlp] Attempt 3: TV / mweb player clients...');
        return await runYtDlp([...cookieArgs, '--extractor-args', 'youtube:player_client=tv,mweb', url]);
      } catch (err3) {
        throw new Error(`YouTube extraction failed on all client rotation attempts: ${err3.message}`);
      }
    }
  }
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
        '-reconnect_delay_max', '5',
      ])
      .input(finalAudioUrl)
      .inputOptions([
        '-headers', `User-Agent: ${BROWSER_HEADERS['User-Agent']}\r\nReferer: https://www.youtube.com/\r\n`,
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
