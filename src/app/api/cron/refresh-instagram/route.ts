import { NextResponse } from 'next/server';
import axios from 'axios';
import { getActiveSession, insertSession, updateSession } from '@/utils/db-cookies';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  // Verify authorization header or secret if configured
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const username = process.env.INSTAGRAM_BOT_USERNAME;
  const password = process.env.INSTAGRAM_BOT_PASSWORD;

  if (!username || !password) {
    return NextResponse.json({
      message: 'INSTAGRAM_BOT_USERNAME and INSTAGRAM_BOT_PASSWORD env variables are required for automated headless login. Checking existing database sessions.',
      status: 'skipped'
    }, { status: 200 });
  }

  try {
    console.log(`[Cron] Starting automated Instagram session refresh for account: ${username}`);

    // Step 1: Initial web session handshake
    const initialRes = await axios.get('https://www.instagram.com/accounts/login/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const cookies = initialRes.headers['set-cookie'] || [];
    let csrfToken = '';
    let mid = '';

    for (const c of cookies) {
      if (c.includes('csrftoken=')) csrfToken = c.split('csrftoken=')[1].split(';')[0];
      if (c.includes('mid=')) mid = c.split('mid=')[1].split(';')[0];
    }

    if (!csrfToken) csrfToken = 'missing';

    // Step 2: Post login payload to Instagram Web API
    const loginUrl = 'https://www.instagram.com/api/v1/web/accounts/login/ajax/';
    const postData = new URLSearchParams({
      enc_password: `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${password}`,
      username,
      queryParams: '{}',
      optIntoOneTap: 'false',
      trustedDeviceRecords: '{}',
    }).toString();

    const loginRes = await axios.post(loginUrl, postData, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-CSRFToken': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'X-IG-App-ID': '936619743392459',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `csrftoken=${csrfToken}; mid=${mid};`,
        'Referer': 'https://www.instagram.com/accounts/login/',
      },
    });

    if (loginRes.data?.authenticated) {
      const loginCookies = loginRes.headers['set-cookie'] || [];
      let sessionId = '';
      let dsUserId = '';

      const fullCookieParts: string[] = [];
      for (const c of loginCookies) {
        const part = c.split(';')[0];
        fullCookieParts.push(part);
        if (part.startsWith('sessionid=')) sessionId = part.split('sessionid=')[1];
        if (part.startsWith('ds_user_id=')) dsUserId = part.split('ds_user_id=')[1];
      }

      const cookieText = fullCookieParts.join('; ');

      // Save or update session in Neon DB
      const existingSession = await getActiveSession('instagram');
      if (existingSession) {
        await updateSession(existingSession.id, {
          cookie_text: cookieText,
          session_id: sessionId,
          is_active: true,
          fail_count: 0,
        });
      } else {
        await insertSession({
          platform: 'instagram',
          account_name: username,
          cookie_text: cookieText,
          session_id: sessionId,
        });
      }

      console.log(`[Cron] Successfully refreshed Instagram session for user: ${username}`);
      return NextResponse.json({
        success: true,
        account: username,
        session_id: sessionId ? 'acquired' : 'none',
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: false,
      message: loginRes.data?.message || 'Login attempt failed',
      authenticated: false,
    }, { status: 400 });

  } catch (error: unknown) {
    console.error('[Cron] Error in automated Instagram cookie refresh:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Instagram cookie refresh failed',
    }, { status: 500 });
  }
}
