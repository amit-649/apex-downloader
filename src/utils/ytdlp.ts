import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface YtDlpFormat {
  format_id: string;
  url: string;
  ext: string;
  vcodec: string;
  acodec: string;
  format_note?: string;
  fps?: number;
  filesize?: number;
  filesize_approx?: number;
  abr?: number;
  tbr?: number;
}

export interface YtDlpInfo {
  title: string;
  description: string;
  duration: number;
  uploader: string;
  uploader_url?: string;
  channel_url?: string;
  thumbnail: string;
  formats: YtDlpFormat[];
  is_restricted?: boolean;
}

export function getCookiesFilePath(): string | null {
  const possiblePaths = [
    path.join(process.cwd(), 'youtube-cookies.txt'),
    path.join(process.cwd(), 'cookies.txt'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      // On Vercel (Linux), the project dir is read-only.
      // yt-dlp tries to write back to the cookies file after reading it,
      // so we must copy it to the writable /tmp directory first.
      if (process.platform !== 'win32') {
        const tmpCookies = '/tmp/cookies.txt';
        try {
          fs.copyFileSync(p, tmpCookies);
          return tmpCookies;
        } catch (e) {
          console.error('Failed to copy cookies to /tmp:', e);
        }
      }
      return p;
    }
  }
  return null;
}

function getExecutable(): string {
  if (process.platform === 'win32') {
    return 'yt-dlp';
  }
  
  const localPath = path.join(process.cwd(), 'bin', 'yt-dlp');
  if (fs.existsSync(localPath)) {
    const tempPath = '/tmp/yt-dlp';
    try {
      // On Vercel, copy read-only binary to writable /tmp so we can mark it executable (chmod +x)
      if (!fs.existsSync(tempPath)) {
        fs.copyFileSync(localPath, tempPath);
      }
      fs.chmodSync(tempPath, '755');
      return tempPath;
    } catch (e) {
      console.error('Failed to prepare yt-dlp binary in /tmp:', e);
      return localPath;
    }
  }
  
  return 'yt-dlp'; // Fallback to global
}

function runYtDlp(args: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const exe = getExecutable();
    const cmd = `"${exe}" --dump-json --no-warnings --no-playlist ${args}`;
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(stderr.trim() || error.message));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err: any) {
        reject(new Error('Failed to parse JSON: ' + err.message));
      }
    });
  });
}

export async function getInfo(url: string, cookies?: string): Promise<YtDlpInfo> {
  const safeUrl = url.replace(/"/g, '\\"');
  let cookiesArg = '';

  if (cookies) {
    // Priority 1: Cookies passed explicitly from the client request
    const safeCookie = cookies.replace(/"/g, '\\"');
    cookiesArg = `--add-header "Cookie:${safeCookie}"`;
  } else {
    // Priority 2: cookies.txt file on disk (local dev)
    const cookiesPath = getCookiesFilePath();
    if (cookiesPath) {
      cookiesArg = `--cookies "${cookiesPath}"`;
    } else if (process.env.YOUTUBE_COOKIES) {
      // Priority 3: YOUTUBE_COOKIES env var (Vercel / hosted deployments)
      const envCookie = process.env.YOUTUBE_COOKIES.replace(/"/g, '\\"');
      cookiesArg = `--add-header "Cookie:${envCookie}"`;
    }
  }

  try {
    // Attempt 1: Standard client + Node JS runtime
    const data = await runYtDlp(`${cookiesArg} --js-runtimes node "${safeUrl}"`);
    return { ...data, is_restricted: false };
  } catch (error: any) {
    const errMsg = error.message;
    // If it is a bot-protection block, and we are not already using cookies, fall back to android client
    if (!cookies && !cookiesArg.includes('--cookies') && (errMsg.includes('confirm') && errMsg.includes('bot'))) {
      console.warn('⚠️ Standard yt-dlp check failed with bot verification trigger. Falling back to android client...');
      try {
        const data = await runYtDlp(`--extractor-args "youtube:player_client=android" "${safeUrl}"`);
        return { ...data, is_restricted: true };
      } catch (fallbackErr: any) {
        throw new Error('Both standard and fallback extraction failed: ' + fallbackErr.message);
      }
    }
    throw error;
  }
}
