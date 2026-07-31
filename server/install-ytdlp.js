/**
 * Postinstall script to download yt-dlp standalone Linux binary.
 * This runs during `npm install` on Render's Linux build environment.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const YTDLP_PATH = path.join(__dirname, 'yt-dlp');
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

if (process.platform !== 'linux') {
  console.log('[postinstall] Not Linux — skipping yt-dlp binary download (use system yt-dlp for local dev).');
  process.exit(0);
}

if (fs.existsSync(YTDLP_PATH)) {
  console.log('[postinstall] yt-dlp binary already exists, skipping download.');
  process.exit(0);
}

console.log('[postinstall] Downloading yt-dlp standalone Linux binary...');

try {
  execSync(`curl -L "${YTDLP_URL}" -o "${YTDLP_PATH}" --silent --show-error`, { stdio: 'inherit' });
  execSync(`chmod +x "${YTDLP_PATH}"`, { stdio: 'inherit' });
  console.log('[postinstall] ✅ yt-dlp installed successfully.');
} catch (e) {
  console.warn('[postinstall] ⚠️ yt-dlp download failed (merge will fall back to direct URLs):', e.message);
}
