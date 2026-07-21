import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { assertPinterestUrl } from '@/utils/platform-url';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Pinterest URL is required' }, { status: 400 });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  try {
    const pinterestUrl = assertPinterestUrl(url);
    const response = await axios.get(pinterestUrl.toString(), {
      headers,
      timeout: 8000,
      maxRedirects: 5,
    });
    const html = response.data;
    const $ = cheerio.load(html);

    // Method A: Check for the script tag containing page data
    const pwsScript = $('script[id="__PWS_DATA__"]').html();
    if (pwsScript) {
      try {
        const jsonData = JSON.parse(pwsScript);
        const pinResources = jsonData?.props?.initialReduxState?.resources?.PinResource;

        if (pinResources) {
          // Find the active pin resource data (usually the only key is the Pin ID)
          const pinKey = Object.keys(pinResources)[0];
          const pinData = pinResources[pinKey]?.data;

          if (pinData) {
            const title = pinData.title || pinData.grid_title || 'Pinterest Pin';
            const description = pinData.description || '';
            const isVideo = !!pinData.videos;

            let downloadUrl = '';
            let type = 'image';

            if (isVideo) {
              type = 'video';
              // Find the highest resolution video version
              const videoList = pinData.videos?.video_list;
              if (videoList) {
                // Look for V_720P, V_HLS_H264, etc.
                const qualities = ['V_720P', 'V_540P', 'V_360P', 'V_HLS_H264'];
                for (const q of qualities) {
                  if (videoList[q]?.url) {
                    downloadUrl = videoList[q].url;
                    break;
                  }
                }
                // Fallback to first available video stream
                if (!downloadUrl) {
                  const firstKey = Object.keys(videoList)[0];
                  downloadUrl = videoList[firstKey]?.url || '';
                }
              }
            } else {
              // Get original high-res image
              downloadUrl = pinData.images?.orig?.url || pinData.images?.['736x']?.url || '';
            }

            if (downloadUrl) {
              return NextResponse.json({
                type,
                title,
                description,
                downloadUrl,
                thumbnailUrl: pinData.images?.['736x']?.url || downloadUrl,
              });
            }
          }
        }
      } catch (e) {
        console.warn('Failed to parse __PWS_DATA__ script tag, falling back to meta tags:', e);
      }
    }

    // Method B: Standard OpenGraph Meta Tags Extraction
    const ogVideo = $('meta[property="og:video"]').attr('content') || 
                    $('meta[property="og:video:secure_url"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    const ogTitle = $('meta[property="og:title"]').attr('content') || 'Pinterest Pin';
    const ogDescription = $('meta[property="og:description"]').attr('content') || '';

    if (ogVideo) {
      return NextResponse.json({
        type: 'video',
        title: ogTitle,
        description: ogDescription,
        downloadUrl: ogVideo,
        thumbnailUrl: ogImage || '',
      });
    }

    if (ogImage) {
      // Replace dimensions to get original/highest quality image if possible
      // E.g. replacing '/236x/' or '/736x/' with '/originals/'
      let highResImage = ogImage;
      if (ogImage.includes('/236x/') || ogImage.includes('/736x/')) {
        highResImage = ogImage.replace(/\/(?:236|564|736)x\//, '/originals/');
      }

      return NextResponse.json({
        type: 'image',
        title: ogTitle,
        description: ogDescription,
        downloadUrl: highResImage,
        thumbnailUrl: ogImage,
      });
    }

    return NextResponse.json({ error: 'Could not extract Pinterest media URL' }, { status: 404 });

  } catch (error: unknown) {
    console.error('Error extracting Pinterest data:', error);
    const msg = error instanceof Error ? error.message : 'Pinterest extraction failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
