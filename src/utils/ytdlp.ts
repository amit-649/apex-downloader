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

  // Auto-generate Netscape cookies file from process.env.YOUTUBE_COOKIES on Linux/Vercel/Railway
  if (process.env.YOUTUBE_COOKIES) {
    const tmpEnvCookies = process.platform !== 'win32' ? '/tmp/env_youtube_cookies.txt' : path.join(process.cwd(), 'env_yt_cookies.txt');
    try {
      let netscapeOutput = '# Netscape HTTP Cookie File\n# Generated from YOUTUBE_COOKIES env\n\n';
      const pairs = process.env.YOUTUBE_COOKIES.split(';');
      for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx > 0) {
          const key = pair.substring(0, idx).trim();
          const val = pair.substring(idx + 1).trim();
          netscapeOutput += `.youtube.com\tTRUE\t/\tTRUE\t0\t${key}\t${val}\n`;
        }
      }
      fs.writeFileSync(tmpEnvCookies, netscapeOutput, 'utf8');
      return tmpEnvCookies;
    } catch (e) {
      console.error('Failed to write YOUTUBE_COOKIES to Netscape file:', e);
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
  const cookieArgs = cookiesPath ? ['--cookies', cookiesPath] : [];

  try {
    // Attempt 1: Standard client + cookies + Node JS runtime
    const data = await runYtDlp([...cookieArgs, '--js-runtimes', 'node', url]);
    return { ...data, is_restricted: false };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '';
    console.warn('⚠️ Standard yt-dlp check failed:', errMsg);

    // Attempt 2: Rotate player clients (ios, android, web) to bypass bot verification
    try {
      console.warn('🔄 Retrying with rotated iOS player client...');
      const data = await runYtDlp([...cookieArgs, '--extractor-args', 'youtube:player_client=ios,android,web', url]);
      return { ...data, is_restricted: true };
    } catch (fallbackError: unknown) {
      // Attempt 3: Try TV client
      try {
        console.warn('🔄 Retrying with TV embedded player client...');
        const data = await runYtDlp([...cookieArgs, '--extractor-args', 'youtube:player_client=tv,mweb', url]);
        return { ...data, is_restricted: true };
      } catch (finalErr: unknown) {
        const message = finalErr instanceof Error ? finalErr.message : 'Unknown extraction error';
        throw new Error(`YouTube extraction failed: ${message}`);
      }
    }
  }
}
