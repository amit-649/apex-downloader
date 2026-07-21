import { execFile } from 'child_process';
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

function runYtDlp(args: string[]): Promise<YtDlpInfo> {
  return new Promise((resolve, reject) => {
    const exe = getExecutable();
    execFile(exe, ['--dump-json', '--no-warnings', '--no-playlist', ...args], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(stderr.trim() || error.message));
      }
      try {
        resolve(JSON.parse(stdout) as YtDlpInfo);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown JSON parsing error';
        reject(new Error(`Failed to parse JSON: ${message}`));
      }
    });
  });
}

export async function getInfo(url: string): Promise<YtDlpInfo> {
  const cookiesPath = getCookiesFilePath();
  const cookieArgs = cookiesPath
    ? ['--cookies', cookiesPath]
    : process.env.YOUTUBE_COOKIES
      ? ['--add-header', `Cookie:${process.env.YOUTUBE_COOKIES}`]
      : [];

  try {
    // Attempt 1: Standard client + Node JS runtime
    const data = await runYtDlp([...cookieArgs, '--js-runtimes', 'node', url]);
    return { ...data, is_restricted: false };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '';
    // If it is a bot-protection block without any server-managed cookies, fall back to android client.
    if (cookieArgs.length === 0 && errMsg.includes('confirm') && errMsg.includes('bot')) {
      console.warn('⚠️ Standard yt-dlp check failed with bot verification trigger. Falling back to android client...');
      try {
        const data = await runYtDlp(['--extractor-args', 'youtube:player_client=android', url]);
        return { ...data, is_restricted: true };
      } catch (fallbackError: unknown) {
        const message = fallbackError instanceof Error ? fallbackError.message : 'Unknown extraction error';
        throw new Error(`Both standard and fallback extraction failed: ${message}`);
      }
    }
    throw error;
  }
}
