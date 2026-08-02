import { NextResponse } from 'next/server';
import { getInfo } from '@/utils/ytdlp';
import { assertYoutubeUrl } from '@/utils/platform-url';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
  }

  try {
    const youtubeUrl = assertYoutubeUrl(url);
    const info = await getInfo(youtubeUrl.toString());

    // Return raw formats — frontend filters by hasVideo/hasAudio
    const formats = (info.formats || []).map((f) => {
      const hasVideo = f.vcodec && f.vcodec !== 'none';
      const hasAudio = f.acodec && f.acodec !== 'none';

      let qualityLabel = '';
      if (hasVideo) {
        qualityLabel = f.format_note || 'Video';
        if (qualityLabel.includes('1080')) qualityLabel = f.fps === 60 ? '1080p60' : '1080p';
        else if (qualityLabel.includes('720')) qualityLabel = f.fps === 60 ? '720p60' : '720p';
        else if (qualityLabel.includes('480')) qualityLabel = '480p';
        else if (qualityLabel.includes('360')) qualityLabel = '360p';
        else if (qualityLabel.includes('240')) qualityLabel = '240p';
        else if (qualityLabel.includes('144')) qualityLabel = '144p';
        else if (qualityLabel.includes('2160') || qualityLabel.toLowerCase().includes('4k')) qualityLabel = '2160p (4K)';
        else if (qualityLabel.includes('1440') || qualityLabel.toLowerCase().includes('2k')) qualityLabel = '1440p (2K)';
      } else {
        qualityLabel = f.abr ? `${Math.round(f.abr)}kbps` : 'Audio';
      }

      return {
        itag: parseInt(f.format_id, 10) || f.format_id,
        url: f.url,
        qualityLabel,
        ext: f.ext || 'unknown',
        vcodec: f.vcodec || 'none',
        acodec: f.acodec || 'none',
        hasVideo,
        hasAudio,
        fps: f.fps || null,
        sizeBytes: f.filesize || f.filesize_approx || null,
        audioBitrate: f.abr || null,
      };
    });

    const validFormats = formats.filter(f => f.ext !== 'mhtml');

    const getRes = (label: string) => {
      const m = label.match(/(\d+)p/);
      return m ? parseInt(m[1], 10) : 0;
    };

    // Group into videoWithAudio (progressive <= 720p/720p60, no merging needed) and audioOnly
    const videoWithAudio = validFormats.filter(f => {
      if (!f.hasVideo || !f.hasAudio) return false;
      const res = getRes(f.qualityLabel);
      return res === 0 || res <= 720;
    });
    const videoOnly: typeof validFormats = [];
    const audioOnly = validFormats.filter(f => !f.hasVideo && f.hasAudio);

    return NextResponse.json({
      title: info.title,
      description: info.description || '',
      duration: info.duration || 0,
      author: info.uploader || 'Unknown Channel',
      authorUrl: info.uploader_url || info.channel_url || '',
      thumbnail: info.thumbnail || '',
      isRestricted: info.is_restricted || false,
      formats: {
        videoWithAudio,
        videoOnly,
        audioOnly,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching YouTube details:', error);
    let userMessage = error instanceof Error ? error.message : 'Failed to retrieve video details';
    if (userMessage.includes('confirm you') && userMessage.includes('bot')) {
      userMessage = 'YouTube is requesting bot verification. Please refresh the service authorization cookies and try again.';
    }
    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}