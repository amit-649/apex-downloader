import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface PoTokenCache {
  visitorData: string;
  poToken?: string;
  timestamp: number;
}

const CACHE_FILE = process.platform !== 'win32'
  ? '/tmp/yt_potoken_cache.json'
  : path.join(process.cwd(), 'yt_potoken_cache.json');

// 2 hours cache TTL
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Fetch a fresh visitorData string directly from YouTube's visitor_id API endpoint.
 */
export async function fetchFreshVisitorData(): Promise<string | null> {
  try {
    const res = await axios.post(
      'https://www.youtube.com/youtubei/v1/visitor_id?key=AIzaSyAO_FJ2Slv5QZ0_j26V4Q2zW21X903_vY0',
      {
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240308.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': BROWSER_USER_AGENT,
        },
        timeout: 10000,
      }
    );

    if (res.data?.responseContext?.visitorData) {
      return res.data.responseContext.visitorData;
    }
  } catch (error) {
    console.warn('⚠️ Failed to fetch YouTube visitorData from visitor_id API:', error instanceof Error ? error.message : error);
  }
  return null;
}

/**
 * Read cached PO token / visitorData or fetch a fresh token set automatically.
 */
export async function getAutoYouTubeTokens(): Promise<{ visitorData?: string; poToken?: string }> {
  // Check disk cache first
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf8');
      const cache: PoTokenCache = JSON.parse(content);
      if (Date.now() - cache.timestamp < CACHE_TTL_MS && cache.visitorData) {
        return { visitorData: cache.visitorData, poToken: cache.poToken };
      }
    }
  } catch {
    // Ignore cache read errors
  }

  // Fetch fresh visitorData
  const freshVisitorData = await fetchFreshVisitorData();
  if (freshVisitorData) {
    const cacheData: PoTokenCache = {
      visitorData: freshVisitorData,
      timestamp: Date.now(),
    };

    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData), 'utf8');
    } catch {
      // Ignore disk write errors on read-only systems
    }

    return { visitorData: freshVisitorData };
  }

  return {};
}
