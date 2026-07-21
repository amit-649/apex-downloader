import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { assertInstagramUrl } from '@/utils/platform-url';

export const runtime = 'nodejs';

// Public Instagram Web App ID (needed for Web API queries)
const INSTAGRAM_APP_ID = '936619743392459';

interface InstagramCandidate {
  width: number;
  height: number;
  url: string;
}

interface InstagramVersion {
  width: number;
  height: number;
  url: string;
}

interface InstagramStoryItem {
  id: string;
  media_type: number;
  video_versions?: InstagramVersion[];
  image_versions2?: { candidates?: InstagramCandidate[] };
  taken_at?: number;
}

interface InstagramMediaItem {
  media_type: number;
  video_versions?: InstagramVersion[];
  image_versions2?: { candidates?: InstagramCandidate[] };
  carousel_media?: InstagramMediaItem[];
  user?: { username?: string };
  caption?: { text?: string };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Instagram URL is required' }, { status: 400 });
  }

  // Credentials are maintained only by the server environment, never supplied by visitors.
  const instagramCookies = process.env.INSTAGRAM_COOKIES || '';
  const sessionId = process.env.INSTAGRAM_SESSION_ID || '';

  // Setup request headers mimicking a real browser session
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-IG-App-ID': INSTAGRAM_APP_ID,
  };

  if (instagramCookies) {
    headers['Cookie'] = instagramCookies;
  } else if (sessionId) {
    headers['Cookie'] = `sessionid=${sessionId};`;
  }

  try {
    assertInstagramUrl(url);
    // 1. STORY DOWNLOAD (e.g. instagram.com/stories/username/story_id)
    if (url.includes('/stories/')) {
      if (!sessionId) {
        return NextResponse.json({ 
          error: 'Instagram Session ID is required in backend env variables to download stories.' 
        }, { status: 400 });
      }

      const storyMatch = url.match(/stories\/([a-zA-Z0-9\._\-]+)(?:\/([0-9]+))?/);
      if (!storyMatch) {
        return NextResponse.json({ error: 'Invalid Instagram Story URL format' }, { status: 400 });
      }

      const username = storyMatch[1];
      const targetStoryId = storyMatch[2]; // May be empty

      // Fetch user profile to get numerical ID
      const profileUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
      const profileRes = await axios.get(profileUrl, { headers });
      const userId = profileRes.data?.data?.user?.id;

      if (!userId) {
        return NextResponse.json({ error: 'Failed to retrieve Instagram User ID' }, { status: 404 });
      }

      // Fetch active stories for user ID
      const storiesUrl = `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`;
      const storiesRes = await axios.get(storiesUrl, { headers });
      const reels = storiesRes.data?.reels;
      const userReel = reels ? reels[userId] : null;

      if (!userReel || !userReel.items || userReel.items.length === 0) {
        return NextResponse.json({ error: 'No active stories found for this user.' }, { status: 404 });
      }

      // Map active stories
      const storyItems = (userReel.items as InstagramStoryItem[]).map((item) => {
        const isVideo = item.media_type === 2;
        const videoUrl = isVideo ? item.video_versions?.sort((a, b) => b.width - a.width)[0]?.url : null;
        const imageUrl = item.image_versions2?.candidates?.sort((a, b) => b.width - a.width)[0]?.url;

        return {
          id: item.id.split('_')[0], // Extract raw story ID
          isVideo,
          downloadUrl: isVideo ? videoUrl : imageUrl,
          thumbnailUrl: imageUrl,
          takenAt: item.taken_at,
        };
      });

      // If a specific story ID was targeted, return that one
      if (targetStoryId) {
        const targeted = storyItems.find((s) => s.id === targetStoryId);
        if (targeted) {
          return NextResponse.json({
            type: 'story',
            username,
            items: [targeted]
          });
        }
      }

      // Default: Return all active stories for user
      return NextResponse.json({
        type: 'stories_list',
        username,
        items: storyItems
      });
    }

    // 2. PROFILE PICTURE / PFP DOWNLOAD (e.g. instagram.com/username or instagram.com/username/)
    // Match profile URLs (excludes posts, reels, stories, and explore pages)
    const isProfileUrl = /instagram\.com\/([a-zA-Z0-9\._\-]+)\/?(?:\?|$)/.test(url) && 
                         !url.includes('/p/') && 
                         !url.includes('/reel/') && 
                         !url.includes('/stories/') && 
                         !url.includes('/explore/') &&
                         !url.includes('/direct/');

    if (isProfileUrl) {
      const usernameMatch = url.match(/instagram\.com\/([a-zA-Z0-9\._\-]+)/);
      if (!usernameMatch) {
        return NextResponse.json({ error: 'Invalid profile URL' }, { status: 400 });
      }

      const username = usernameMatch[1];
      const profileApiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
      const profileRes = await axios.get(profileApiUrl, { headers });
      const user = profileRes.data?.data?.user;

      if (!user) {
        return NextResponse.json({ error: 'Instagram user not found' }, { status: 404 });
      }

      return NextResponse.json({
        type: 'profile_pic',
        username: user.username,
        fullName: user.full_name,
        downloadUrl: user.profile_pic_url_hd,
        thumbnailUrl: user.profile_pic_url,
        biography: user.biography,
        followers: user.edge_followed_by?.count || 0,
      });
    }

    // 3. POST / REEL DOWNLOAD (e.g. instagram.com/p/shortcode or instagram.com/reel/shortcode)
    const shortcodeMatch = url.match(/\/(?:p|reel)\/([a-zA-Z0-9\-_]+)/);
    if (!shortcodeMatch) {
      return NextResponse.json({ error: 'Invalid Instagram Reel/Post URL format' }, { status: 400 });
    }

    const shortcode = shortcodeMatch[1];

    // Helper: convert shortcode → numerical media ID (Instagram's base64 encoding)
    const shortcodeToMediaId = (code: string): string => {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let mediaId = BigInt(0);
      for (const char of code) {
        mediaId = mediaId * BigInt(64) + BigInt(alphabet.indexOf(char));
      }
      return mediaId.toString();
    };

    // Helper: extract download data from a media object
    const extractFromMedia = (media: InstagramMediaItem | null | undefined) => {
      if (!media) return null;

      // Handle carousel (sidecar) posts
      if (media.carousel_media && media.carousel_media.length > 0) {
        const items = media.carousel_media.map((item) => {
          const isVid = item.media_type === 2;
          return {
            type: isVid ? 'video' : 'image',
            downloadUrl: isVid
              ? item.video_versions?.sort((a, b) => b.width - a.width)[0]?.url
              : item.image_versions2?.candidates?.sort((a, b) => b.width - a.width)[0]?.url,
            thumbnailUrl: item.image_versions2?.candidates?.[0]?.url || '',
          };
        });
        return {
          type: 'carousel',
          username: media.user?.username,
          caption: media.caption?.text || '',
          items,
          thumbnailUrl: items[0]?.thumbnailUrl || '',
          downloadUrl: items[0]?.downloadUrl || '',
        };
      }

      const isVideo = media.media_type === 2;
      const downloadUrl = isVideo
        ? media.video_versions?.sort((a, b) => b.width - a.width)[0]?.url
        : media.image_versions2?.candidates?.sort((a, b) => b.width - a.width)[0]?.url;

      return {
        type: isVideo ? 'video' : 'image',
        username: media.user?.username,
        caption: media.caption?.text || '',
        downloadUrl,
        thumbnailUrl: media.image_versions2?.candidates?.[0]?.url || '',
      };
    };

    // Method A: /api/v1/media/{media_id}/info/ — most reliable with session
    try {
      const mediaId = shortcodeToMediaId(shortcode);
      const mediaInfoUrl = `https://www.instagram.com/api/v1/media/${mediaId}/info/`;
      const apiRes = await axios.get(mediaInfoUrl, { headers, timeout: 8000 });
      const media = apiRes.data?.items?.[0] as InstagramMediaItem | undefined;
      const result = extractFromMedia(media);
      if (result?.downloadUrl) {
        return NextResponse.json(result);
      }
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; message?: string };
      console.warn('Method A (/api/v1/media/info) failed:', err.response?.status || err.message);
    }

    // Method B: GraphQL query with shortcode
    try {
      const graphqlUrl = `https://www.instagram.com/graphql/query/?query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({ shortcode, child_comment_count: 0, fetch_comment_count: 0, parent_comment_count: 0, has_threaded_comments: false }))}`;
      const gqlRes = await axios.get(graphqlUrl, { headers, timeout: 8000 });
      const gqlMedia = gqlRes.data?.data?.shortcode_media;

      if (gqlMedia) {
        const isVideo = Boolean(gqlMedia.is_video);
        const downloadUrl = isVideo ? gqlMedia.video_url : gqlMedia.display_url;

        if (downloadUrl) {
          return NextResponse.json({
            type: isVideo ? 'video' : 'image',
            username: gqlMedia.owner?.username,
            caption: gqlMedia.edge_media_to_caption?.edges?.[0]?.node?.text || '',
            downloadUrl,
            thumbnailUrl: gqlMedia.display_url || '',
          });
        }
      }
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; message?: string };
      console.warn('Method B (GraphQL) failed:', err.response?.status || err.message);
    }

    // Method C: Legacy __a=1 endpoint
    try {
      const apiInfoUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
      const apiRes = await axios.get(apiInfoUrl, { headers, timeout: 5000 });
      const media = apiRes.data?.items?.[0] as InstagramMediaItem | undefined;
      const result = extractFromMedia(media);
      if (result?.downloadUrl) {
        return NextResponse.json(result);
      }
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; message?: string };
      console.warn('Method C (__a=1) failed:', err.response?.status || err.message);
    }

    // Method D: HTML OG tag scraping (last resort)
    try {
      const pageUrl = `https://www.instagram.com/p/${shortcode}/`;
      const pageRes = await axios.get(pageUrl, { headers, timeout: 8000 });
      const $ = cheerio.load(pageRes.data);

      const ogVideo = $('meta[property="og:video"]').attr('content');
      const ogImage = $('meta[property="og:image"]').attr('content');
      const ogTitle = $('meta[property="og:title"]').attr('content') || '';

      if (ogVideo) {
        return NextResponse.json({ type: 'video', caption: ogTitle, downloadUrl: ogVideo, thumbnailUrl: ogImage || '' });
      }
      if (ogImage) {
        return NextResponse.json({ type: 'image', caption: ogTitle, downloadUrl: ogImage, thumbnailUrl: ogImage });
      }
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; message?: string };
      console.warn('Method D (OG scraping) failed:', err.response?.status || err.message);
    }

    // All methods failed
    return NextResponse.json({
      error: 'Could not extract download URL. All extraction methods failed. Make sure: (1) the post/reel is public, (2) the URL is valid, and (3) your Instagram session cookie is fresh.'
    }, { status: 404 });

  } catch (error: unknown) {
    console.error('Error handling Instagram request:', error);
    const msg = error instanceof Error ? error.message : 'Instagram extraction failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
