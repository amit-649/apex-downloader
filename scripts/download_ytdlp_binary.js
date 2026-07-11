const fs = require('fs');
const path = require('path');
const https = require('https');

const BIN_DIR = path.join(process.cwd(), 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp');
const DOWNLOAD_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    console.log(`Downloading Linux yt-dlp binary from: ${url}`);
    
    https.get(url, (response) => {
      // Handle redirects (GitHub releases redirect to AWS S3)
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Server responded with status code: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(() => {
          console.log(`✅ Successfully saved yt-dlp binary to: ${dest}`);
          resolve();
        });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // Delete temp file on error
      reject(err);
    });
  });
}

async function main() {
  try {
    if (!fs.existsSync(BIN_DIR)) {
      fs.mkdirSync(BIN_DIR, { recursive: true });
    }
    
    await downloadFile(DOWNLOAD_URL, YTDLP_PATH);
    
    // Set executable permission (755)
    fs.chmodSync(YTDLP_PATH, '755');
    console.log('✅ Set executable permissions (755) on yt-dlp binary.');
  } catch (err) {
    console.error('❌ Failed to download yt-dlp binary:', err.message);
    process.exit(1);
  }
}

main();
