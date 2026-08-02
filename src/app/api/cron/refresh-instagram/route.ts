import { NextResponse } from 'next/server';
import axios from 'axios';
import { getActiveSession, insertSession, updateSession } from '@/utils/db-cookies';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  // Verify authorization header or secret if configured
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.REFRESHER_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !request.url.includes(`secret=${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const envSessionId = process.env.INSTAGRAM_SESSION_ID;
  const envCookies = process.env.INSTAGRAM_COOKIES;
  const botUsername = process.env.INSTAGRAM_BOT_USERNAME;
  const botPassword = process.env.INSTAGRAM_BOT_PASSWORD;

  // Case A: Sync existing Vercel env cookies to Neon DB
  if (envSessionId || envCookies) {
    try {
      const cookieText = envCookies || `sessionid=${envSessionId};`;
      const sessionId = envSessionId || (envCookies?.match(/sessionid=([^;]+)/)?.[1] ?? '');

      // Verify active status with Instagram API
      const testRes = await axios.get('https://www.instagram.com/api/v1/users/web_profile_info/?username=instagram', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-IG-App-ID': '936619743392459',
          'Cookie': cookieText,
        },
        timeout: 5000,
      });

      const isValid = Boolean(testRes.data?.data?.user?.id);

      const existingSession = await getActiveSession('instagram');
      if (existingSession) {
        await updateSession(existingSession.id, {
          cookie_text: cookieText,
          session_id: sessionId,
          is_active: isValid,
          fail_count: isValid ? 0 : existingSession.fail_count,
        });
      } else {
        await insertSession({
          platform: 'instagram',
          account_name: 'vercel_env_session',
          cookie_text: cookieText,
          session_id: sessionId,
        });
      }

      return NextResponse.json({
        success: true,
        source: 'vercel_environment_variables',
        session_valid: isValid,
        session_id_synced: Boolean(sessionId),
        updated_at: new Date().toISOString(),
      });
    } catch (e: unknown) {
      console.warn('[Cron] Failed to verify env cookies:', e instanceof Error ? e.message : e);
    }
  }

  // Case B: Headless Login Auto-Refresh if bot credentials provided
  if (botUsername && botPassword) {
    try {
      const initialRes = await axios.get('https://www.instagram.com/accounts/login/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const cookies = initialRes.headers['set-cookie'] || [];
      let csrfToken = '';
      let mid = '';

      for (const c of cookies) {
        if (c.includes('csrftoken=')) csrfToken = c.split('csrftoken=')[1].split(';')[0];
        if (c.includes('mid=')) mid = c.split('mid=')[1].split(';')[0];
      }

      const loginUrl = 'https://www.instagram.com/api/v1/web/accounts/login/ajax/';
      const postData = new URLSearchParams({
        enc_password: `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${botPassword}`,
        username: botUsername,
        queryParams: '{}',
        optIntoOneTap: 'false',
        trustedDeviceRecords: '{}',
      }).toString();

      const loginRes = await axios.post(loginUrl, postData, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-CSRFToken': csrfToken || 'missing',
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
        const fullCookieParts: string[] = [];
        for (const c of loginCookies) {
          const part = c.split(';')[0];
          fullCookieParts.push(part);
          if (part.startsWith('sessionid=')) sessionId = part.split('sessionid=')[1];
        }

        const cookieText = fullCookieParts.join('; ');
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
            account_name: botUsername,
            cookie_text: cookieText,
            session_id: sessionId,
          });
        }

        return NextResponse.json({
          success: true,
          source: 'bot_auto_login',
          account: botUsername,
          session_id_acquired: Boolean(sessionId),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e: unknown) {
      console.error('[Cron] Error in bot login refresh:', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    success: true,
    message: 'Cron check completed.',
    status: 'synced'
  });
}
