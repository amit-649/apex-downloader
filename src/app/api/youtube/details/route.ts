import { NextResponse } from 'next/server';
import { getInfo } from '@/utils/ytdlp';
import { assertYoutubeUrl } from '@/utils/platform-url';

export const runtime = 'nodejs';

function getCodecName(codec?: string): string {
  if (!codec) return 'Unknown';
  const c = codec.toLowerCase();
  if (c.startsWith('avc1') || c.startsWith('h264')) return 'H.264';
  if (c.startsWith('vp9') || c.startsWith('vp09')) return 'VP9';
  if (c.startsWith('av01') || c.startsWith('av1')) return 'AV1';
  if (c.startsWith('mp4a') || c.startsWith('aac')) return 'AAC';
  if (c.startsWith('opus')) return 'Opus';
  return codec;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
  }

  try {
    const youtubeUrl = assertYoutubeUrl(url);

    // Optional proxy to Railway VPS backend if configured
    if (process.env.RAILWAY_API_URL) {
      try {
        const railwayUrl = `${process.env.RAILWAY_API_URL.replace(/\/$/, '')}/api/youtube/details?url=${encodeURIComponent(youtubeUrl.toString())}`;
        const proxyRes = await fetch(railwayUrl, { headers: { 'Accept': 'application/json' } });
        if (proxyRes.ok) {
          const data = await proxyRes.json();
          if (data && !data.error) {
            return NextResponse.json(data);
          }
        }
      } catch (e) {
        console.warn('Railway proxy attempt failed, falling back to local extraction:', e);
      }
    }

    const info = await getInfo(youtubeUrl.toString());

    // Map formats
    const formats = (info.formats || []).map((f) => {
      const hasVideo = f.vcodec && f.vcodec !== 'none';
      const hasAudio = f.acodec && f.acodec !== 'none';
      const codec = hasVideo ? getCodecName(f.vcodec) : getCodecName(f.acodec);
      const container = f.ext || 'unknown';

      // We determine quality label
      let qualityLabel = '';
      if (hasVideo) {
        qualityLabel = f.format_note || 'Video';
        // Normalize quality labels like "1080p" to keep consistency
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
        container,
        codec,
        hasVideo,
        hasAudio,
        fps: f.fps || null,
        sizeBytes: f.filesize || f.filesize_approx || null,
        audioBitrate: f.abr || null,
      };
    });

    // Filter out storyboard formats (mhtml)
    const validFormats = formats.filter(f => f.container !== 'mhtml');

    // Group formats
    const videoWithAudioRaw = validFormats.filter(f => f.hasVideo && f.hasAudio);
    const videoOnlyRaw = validFormats.filter(f => f.hasVideo && !f.hasAudio);
    const audioOnlyRaw = validFormats.filter(f => !f.hasVideo && f.hasAudio);

    // Server-side Deduplication to keep clean format lists
    const seenVideoWithAudio = new Set<string>();
    const videoWithAudio = videoWithAudioRaw.filter(f => {
      const key = `${f.qualityLabel}-${f.container}-${f.codec}`;
      if (seenVideoWithAudio.has(key)) return false;
      seenVideoWithAudio.add(key);
      return true;
    });

    const seenVideoOnly = new Set<string>();
    const videoOnly = videoOnlyRaw.filter(f => {
      const key = `${f.qualityLabel}-${f.fps}-${f.container}-${f.codec}`;
      if (seenVideoOnly.has(key)) return false;
      seenVideoOnly.add(key);
      return true;
    });

    const seenAudioOnly = new Set<string>();
    const audioOnly = audioOnlyRaw.filter(f => {
      const key = `${f.audioBitrate}-${f.container}-${f.codec}`;
      if (seenAudioOnly.has(key)) return false;
      seenAudioOnly.add(key);
      return true;
    });

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
      }
    });
  } catch (error: unknown) {
    console.error('Error fetching YouTube details:', error);
    // If it is a bot-protection block, return a user-friendly instruction
    let userMessage = error instanceof Error ? error.message : 'Failed to retrieve video details';
    if (userMessage.includes('confirm you') && userMessage.includes('bot')) {
      userMessage = 'YouTube is requesting bot verification. Please refresh the service authorization cookies and try again.';
    }
    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
