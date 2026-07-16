"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Download,
  AudioLines,
  Video,
  Link2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Trash2,
  Info,
  Lock,
  ExternalLink,
  ChevronDown,
  Clapperboard,
  Image as ImageIcon,
  Sparkles,
  ShieldCheck,
  Zap,
  LockKeyhole,
} from 'lucide-react';

const SHOW_ADS = false; // Set to true when you want to enable sponsored banner placeholders!
import { downloadInChunks, mergeVideoAndAudio } from '@/utils/downloader';

/* ---------- Brand icons (Lucide dropped these) ---------- */
const YoutubeIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
    <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor" />
  </svg>
);

const InstagramIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const PinterestIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M8 11.2c0 3 1.6 5.2 3.4 5.2 1 0 1.6-.8 1.6-2 0-1.3-.7-3.2-.7-4.4 0-1 .6-1.9 1.7-1.9 2 0 3.2 2 3.2 4.3 0 2.8-1.6 5-4 5" />
    <path d="M12 8.5c-.4 2-1 4.4-1.4 6.2-.4 1.7-.6 3.4-.4 5.3" />
    <circle cx="12" cy="12" r="10" />
  </svg>
);

/* ---------- Types ---------- */
type Platform = 'youtube' | 'instagram' | 'pinterest';
type DownloadStatus =
  | 'idle'
  | 'fetching'
  | 'downloading_video'
  | 'downloading_audio'
  | 'merging'
  | 'handoff'
  | 'completed'
  | 'failed';

/* ---------- Formatting helpers ---------- */
const fmtDuration = (s?: number) => {
  if (!s || s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};
const fmtSize = (bytes?: number | null) =>
  bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : null;

const PLATFORMS: { id: Platform; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: 'youtube', label: 'YouTube', Icon: YoutubeIcon },
  { id: 'instagram', label: 'Instagram', Icon: InstagramIcon },
  { id: 'pinterest', label: 'Pinterest', Icon: PinterestIcon },
];

const EMPTY_HINTS: Record<Platform, { text: string; Icon: React.FC<{ size?: number }> }[]> = {
  youtube: [
    { text: 'Video up to 4K', Icon: Video },
    { text: 'Audio only (M4A)', Icon: AudioLines },
    { text: 'youtube.com or youtu.be', Icon: Link2 },
  ],
  instagram: [
    { text: 'Posts & Reels', Icon: Clapperboard },
    { text: 'Stories & Profile pics', Icon: ImageIcon },
    { text: 'Carousel galleries', Icon: ImageIcon },
  ],
  pinterest: [
    { text: 'Image Pins', Icon: ImageIcon },
    { text: 'Video Pins', Icon: Video },
    { text: 'pinterest.com or pin.it', Icon: Link2 },
  ],
};

export default function Home() {
  // Navigation & URL input
  const [activeTab, setActiveTab] = useState<Platform>('youtube');
  const [showSettings, setShowSettings] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Metadata
  const [ytMetadata, setYtMetadata] = useState<any>(null);
  const [instaMetadata, setInstaMetadata] = useState<any>(null);
  const [pinMetadata, setPinMetadata] = useState<any>(null);

  // YouTube selection
  const [selectedVideoFormat, setSelectedVideoFormat] = useState<any>(null);
  const [selectedAudioFormat, setSelectedAudioFormat] = useState<any>(null);
  const [isSplitSelection, setIsSplitSelection] = useState(false);
  const [showAdvancedCodecs, setShowAdvancedCodecs] = useState(false);

  // Compatibility filter (MP4/H.264 prioritization)
  const getCompatibleFormats = (formats: any[], isVideo: boolean) => {
    if (showAdvancedCodecs || !formats) return formats;

    const grouped = new Map<string, any>();

    for (const f of formats) {
      const key = isVideo ? `${f.qualityLabel}-${f.fps || ''}` : `${f.audioBitrate || ''}`;
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, f);
      } else {
        if (isVideo) {
          const existingIsMp4 = existing.container?.toLowerCase() === 'mp4';
          const currentIsMp4 = f.container?.toLowerCase() === 'mp4';
          const existingIsH264 = existing.codec?.toLowerCase() === 'h.264';
          const currentIsH264 = f.codec?.toLowerCase() === 'h.264';

          if (currentIsMp4 && !existingIsMp4) {
            grouped.set(key, f);
          } else if (currentIsMp4 === existingIsMp4) {
            if (currentIsH264 && !existingIsH264) {
              grouped.set(key, f);
            }
          }
        } else {
          const existingIsMp4 = existing.container?.toLowerCase() === 'mp4' || existing.container?.toLowerCase() === 'm4a';
          const currentIsMp4 = f.container?.toLowerCase() === 'mp4' || f.container?.toLowerCase() === 'm4a';
          if (currentIsMp4 && !existingIsMp4) {
            grouped.set(key, f);
          }
        }
      }
    }

    return Array.from(grouped.values());
  };

  // Settings
  const [instaSessionId, setInstaSessionId] = useState('');
  const [youtubeCookies, setYoutubeCookies] = useState('');
  const [useLocalMerge, setUseLocalMerge] = useState(false);

  // Downloader state
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  const isBusy = downloadStatus === 'downloading_video' || downloadStatus === 'downloading_audio' || downloadStatus === 'merging';

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setInstaSessionId(localStorage.getItem('instagram_session_id') || '');
      setYoutubeCookies(localStorage.getItem('youtube_cookies') || '');
      
      const storedMerge = localStorage.getItem('use_local_merge');
      if (storedMerge === null) {
        // Default to TRUE for client-side merging to prevent Vercel 10s timeouts
        setUseLocalMerge(true);
        localStorage.setItem('use_local_merge', 'true');
      } else {
        setUseLocalMerge(storedMerge === 'true');
      }
    }
  }, []);

  const saveInstaSession = (val: string) => {
    setInstaSessionId(val);
    localStorage.setItem('instagram_session_id', val);
  };
  const saveYtCookies = (val: string) => {
    setYoutubeCookies(val);
    localStorage.setItem('youtube_cookies', val);
  };
  const saveMergePref = (val: boolean) => {
    setUseLocalMerge(val);
    localStorage.setItem('use_local_merge', String(val));
  };

  // Auto-detect platform on paste
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputUrl = e.target.value;
    setUrl(inputUrl);

    if (inputUrl.includes('youtube.com') || inputUrl.includes('youtu.be')) {
      setActiveTab('youtube');
    } else if (inputUrl.includes('instagram.com')) {
      setActiveTab('instagram');
    } else if (inputUrl.includes('pinterest.com') || inputUrl.includes('pin.it')) {
      setActiveTab('pinterest');
    }
  };

  const logToConsole = (msg: string) => {
    setConsoleLogs(prev => [...prev.slice(-99), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  // Fetch details
  const fetchDetails = async () => {
    if (!url) {
      setError('Please paste a link first.');
      return;
    }

    setLoading(true);
    setError(null);
    setYtMetadata(null);
    setInstaMetadata(null);
    setPinMetadata(null);
    setSelectedVideoFormat(null);
    setSelectedAudioFormat(null);
    setIsSplitSelection(false);

    try {
      if (activeTab === 'youtube') {
        const res = await fetch(`/api/youtube/details?url=${encodeURIComponent(url)}`, {
          headers: { 'X-YouTube-Cookies': youtubeCookies },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch YouTube details');

        setYtMetadata(data);

        const defaultMerged = data.formats?.videoWithAudio?.sort((a: any, b: any) => b.sizeBytes - a.sizeBytes)[0];
        if (defaultMerged) {
          setSelectedVideoFormat(defaultMerged);
        } else {
          const bestVideo = data.formats?.videoOnly?.sort((a: any, b: any) => b.sizeBytes - a.sizeBytes)[0];
          const bestAudio = data.formats?.audioOnly?.sort((a: any, b: any) => b.audioBitrate - a.audioBitrate)[0];
          setSelectedVideoFormat(bestVideo);
          setSelectedAudioFormat(bestAudio);
          setIsSplitSelection(true);
        }
      } else if (activeTab === 'instagram') {
        const res = await fetch(`/api/instagram?url=${encodeURIComponent(url)}`, {
          headers: { 'X-Instagram-Session': instaSessionId },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch Instagram details');
        setInstaMetadata(data);
      } else if (activeTab === 'pinterest') {
        const res = await fetch(`/api/pinterest?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch Pinterest details');
        setPinMetadata(data);
      }
      // Clear the URL input after successful fetch so user can paste a new link
      setUrl('');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while fetching details.');
    } finally {
      setLoading(false);
    }
  };

  const selectYtFormat = (format: any, isSplit: boolean) => {
    setIsSplitSelection(isSplit);
    if (isSplit) {
      setSelectedVideoFormat(format);
      if (!selectedAudioFormat && ytMetadata?.formats?.audioOnly?.length > 0) {
        setSelectedAudioFormat(ytMetadata.formats.audioOnly[0]);
      }
    } else {
      setSelectedVideoFormat(format);
      setSelectedAudioFormat(null);
    }
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  };

  // Main YouTube download
  const handleYoutubeDownload = async () => {
    if (!selectedVideoFormat) return;

    setConsoleLogs([]);
    setDownloadProgress(0);
    setDownloadSpeed(0);

    const title = ytMetadata.title || 'YouTube_Video';
    const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_');

    // Scenario A: pre-merged or audio-only (browser handoff)
    if (!isSplitSelection) {
      setDownloadStatus('handoff');
      setStatusText('Your download is starting in the browser…');
      logToConsole(`Requesting download for itag ${selectedVideoFormat.itag}...`);

      try {
        window.location.href = `/api/youtube/download?url=${encodeURIComponent(url)}&itag=${selectedVideoFormat.itag}&title=${encodeURIComponent(cleanTitle)}&cookies=${encodeURIComponent(youtubeCookies)}`;
        logToConsole('Direct stream download requested. Handed over to browser downloader.');
      } catch (err: any) {
        setDownloadStatus('failed');
        setError(err.message || 'Stream download failed.');
        logToConsole(`Error: ${err.message}`);
      }
      return;
    }

    // Scenario B: server-side merge (browser handoff)
    if (useLocalMerge) {
      setDownloadStatus('handoff');
      setStatusText('Server is merging your file — the download will begin shortly…');
      logToConsole(`Requesting server-side merge of video (itag: ${selectedVideoFormat.itag}) and audio (itag: ${selectedAudioFormat.itag})...`);

      try {
        window.location.href = `/api/youtube/download?action=merge&url=${encodeURIComponent(url)}&videoItag=${selectedVideoFormat.itag}&audioItag=${selectedAudioFormat.itag}&title=${encodeURIComponent(cleanTitle)}&cookies=${encodeURIComponent(youtubeCookies)}`;
        logToConsole('Server-side merge initiated. File is being compiled and streamed.');
      } catch (err: any) {
        setDownloadStatus('failed');
        setError(err.message || 'Server merge request failed.');
        logToConsole(`Error: ${err.message}`);
      }
      return;
    }

    // Scenario C: client-side chunk proxy + FFmpeg WASM merge
    try {
      setDownloadStatus('downloading_video');
      setStatusText('Downloading video stream in chunks...');
      logToConsole('Starting client-side range-based video chunk proxy...');
      logToConsole(`Video format: ${selectedVideoFormat.qualityLabel} | Size: ${(selectedVideoFormat.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);

      const videoBlob = await downloadInChunks(
        selectedVideoFormat.url,
        selectedVideoFormat.sizeBytes,
        (percent, speed) => {
          setDownloadProgress(Math.round(percent));
          setDownloadSpeed(speed);
          setStatusText(`Downloading video stream: ${Math.round(percent)}%`);
        }
      );

      logToConsole('Video stream chunks download complete.');

      setDownloadStatus('downloading_audio');
      setDownloadProgress(0);
      setStatusText('Downloading audio stream in chunks...');
      logToConsole('Starting client-side range-based audio chunk proxy...');
      logToConsole(`Audio format: ${selectedAudioFormat.qualityLabel} | Size: ${(selectedAudioFormat.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);

      const audioBlob = await downloadInChunks(
        selectedAudioFormat.url,
        selectedAudioFormat.sizeBytes,
        (percent, speed) => {
          setDownloadProgress(Math.round(percent));
          setDownloadSpeed(speed);
          setStatusText(`Downloading audio stream: ${Math.round(percent)}%`);
        }
      );

      logToConsole('Audio stream chunks download complete.');

      setDownloadStatus('merging');
      setDownloadProgress(0);
      setStatusText('Initializing FFmpeg WebAssembly...');
      logToConsole('Loading single-threaded FFmpeg.wasm core (no-COOP/COEP mode)...');

      const mergedBlob = await mergeVideoAndAudio(
        videoBlob,
        audioBlob,
        `${cleanTitle}.mp4`,
        (percent) => {
          setDownloadProgress(percent);
          setStatusText(`FFmpeg Merging tracks: ${percent}%`);
        },
        (ffmpegLog) => {
          logToConsole(`[FFmpeg] ${ffmpegLog}`);
        }
      );

      logToConsole('FFmpeg merge complete. Packaging output file.');
      setDownloadStatus('completed');
      setStatusText('Successfully merged and downloaded!');

      triggerBlobDownload(mergedBlob, `${cleanTitle}.mp4`);
      logToConsole('File successfully saved to your device!');
    } catch (err: any) {
      console.error('Error during client-side download/merge:', err);
      setDownloadStatus('failed');
      setStatusText('Download or Merge failed');
      logToConsole(`Fatal Error: ${err.message || 'An error occurred.'}`);
    }
  };

  // Direct downloader for Instagram / Pinterest
  const triggerDirectDownload = async (mediaUrl: string, defaultName: string) => {
    setDownloadStatus('downloading_video');
    setDownloadProgress(0);
    setStatusText('Downloading file...');
    setConsoleLogs([]);
    logToConsole(`Initiating proxy download for media URL: ${mediaUrl.substring(0, 60)}...`);

    try {
      const proxyUrl = `/api/youtube/download?action=proxy&streamUrl=${encodeURIComponent(mediaUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);

      const totalBytesHeader = response.headers.get('Content-Length');
      const totalBytes = totalBytesHeader ? parseInt(totalBytesHeader, 10) : 0;

      let downloaded = 0;
      const chunks: Uint8Array[] = [];
      const reader = response.body?.getReader();
      const startTime = Date.now();

      if (!reader) throw new Error('ReadableStream not supported in this browser.');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        downloaded += value.length;

        if (totalBytes > 0) {
          const percent = Math.min((downloaded / totalBytes) * 100, 100);
          setDownloadProgress(Math.round(percent));
          setStatusText(`Downloading: ${Math.round(percent)}%`);
        } else {
          setStatusText(`Downloaded ${(downloaded / (1024 * 1024)).toFixed(2)} MB...`);
        }

        const elapsed = (Date.now() - startTime) / 1000;
        const speed = (downloaded * 8) / (1024 * 1024 * elapsed);
        setDownloadSpeed(speed);
      }

      const mergedArray = new Uint8Array(downloaded);
      let offset = 0;
      for (const chunk of chunks) {
        mergedArray.set(chunk, offset);
        offset += chunk.length;
      }

      const ext = mediaUrl.includes('.mp4') || mediaUrl.includes('video') ? 'mp4' : 'jpg';
      const fileBlob = new Blob([mergedArray.buffer], { type: ext === 'mp4' ? 'video/mp4' : 'image/jpeg' });

      setDownloadStatus('completed');
      setStatusText('Download completed!');
      logToConsole('Media saved successfully.');
      triggerBlobDownload(fileBlob, `${defaultName}.${ext}`);
    } catch (error: any) {
      console.error(error);
      setDownloadStatus('failed');
      setStatusText('Proxy download failed.');
      logToConsole(`Error: ${error.message}`);
    }
  };

  const switchTab = (tab: Platform) => {
    setActiveTab(tab);
    setUrl('');
    setError(null);
    setShowSettings(false);
  };

  const hasResult =
    (activeTab === 'youtube' && ytMetadata) ||
    (activeTab === 'instagram' && instaMetadata) ||
    (activeTab === 'pinterest' && pinMetadata);

  const activeMeta = PLATFORMS.find(p => p.id === activeTab)!;

  return (
    <div className="container">
      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Download size={18} /></div>
          <div className="brand-name">Apex<span>Downloader</span></div>
        </div>
      </header>

      {/* Hero */}
      <div className="hero">
        <h1>Apex<span>Downloader</span></h1>
        <p>Download high-quality video, audio, Reels, and stories from YouTube, Instagram, and Pinterest.</p>
      </div>

      <AdBanner position="top" />

      {/* Main card */}
      <main className="card">
            {/* Tabs */}
            <div className="tabs" role="tablist" aria-label="Platform">
              {PLATFORMS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={activeTab === id}
                  className={`tab tab-${id} ${activeTab === id ? 'active' : ''}`}
                  onClick={() => switchTab(id)}
                >
                  <Icon size={17} />
                  <span className="tab-label">{label}</span>
                </button>
              ))}
            </div>

            {/* URL input */}
            <div className="input-row">
              <div className="input-wrap">
                <Link2 className="lead-icon" size={18} />
                <input
                  type="text"
                  className="url-input"
                  placeholder={`Paste a ${activeMeta.label} link…`}
                  value={url}
                  onChange={handleUrlChange}
                  onKeyDown={(e) => e.key === 'Enter' && fetchDetails()}
                  aria-label={`${activeMeta.label} link`}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button className="btn btn-primary" onClick={fetchDetails} disabled={loading}>
                {loading ? <span className="spinner" /> : <RefreshCw size={17} />}
                {loading ? 'Analyzing…' : 'Fetch'}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="alert alert-error" role="alert">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && !hasResult && (
              <div className="skeleton" aria-hidden="true">
                <div className="sk-block sk-thumb" />
                <div className="sk-lines">
                  <div className="sk-block sk-line" style={{ width: '80%' }} />
                  <div className="sk-block sk-line" style={{ width: '45%' }} />
                  <div className="sk-block sk-line" style={{ width: '60%', marginTop: '0.4rem' }} />
                </div>
              </div>
            )}

            {/* Empty state */}
            {!loading && !hasResult && !error && (
              <div className="empty">
                <div className="empty-icon"><Sparkles size={24} /></div>
                <h3>Paste a link to get started</h3>
                <p>Drop in any {activeMeta.label} URL above and hit Fetch. We’ll detect the platform automatically.</p>
                <div className="chips">
                  {EMPTY_HINTS[activeTab].map(({ text, Icon }, i) => (
                    <span className="chip" key={i}><Icon size={13} /> {text}</span>
                  ))}
                </div>
              </div>
            )}

            {/* YouTube */}
            {activeTab === 'youtube' && ytMetadata && (
              <YoutubeView
                meta={ytMetadata}
                getCompatibleFormats={getCompatibleFormats}
                showAdvancedCodecs={showAdvancedCodecs}
                setShowAdvancedCodecs={setShowAdvancedCodecs}
                selectedVideoFormat={selectedVideoFormat}
                isSplitSelection={isSplitSelection}
                selectYtFormat={selectYtFormat}
                onDownload={handleYoutubeDownload}
                isBusy={isBusy}
                useLocalMerge={useLocalMerge}
              />
            )}

            {/* Instagram */}
            {activeTab === 'instagram' && instaMetadata && (
              <InstagramView meta={instaMetadata} onDownload={triggerDirectDownload} />
            )}

            {/* Pinterest */}
            {activeTab === 'pinterest' && pinMetadata && (
              <PinterestView meta={pinMetadata} onDownload={triggerDirectDownload} />
            )}

            {/* Progress */}
            {downloadStatus !== 'idle' && (
              <ProgressPanel
                status={downloadStatus}
                progress={downloadProgress}
                speed={downloadSpeed}
                statusText={statusText}
                logs={consoleLogs}
                showLog={showLog}
                setShowLog={setShowLog}
                consoleBottomRef={consoleBottomRef}
              />
            )}
      </main>

      <AdBanner position="bottom" />

      <TrustSection />

      <FaqSection />

      <footer className="footer">
        <p>© {new Date().getFullYear()} ApexDownloader. All rights reserved.</p>
      </footer>
    </div>
  );
}

/* ================================================================
   YouTube view
   ================================================================ */
function YoutubeView({
  meta, getCompatibleFormats, showAdvancedCodecs, setShowAdvancedCodecs,
  selectedVideoFormat, isSplitSelection, selectYtFormat, onDownload, isBusy, useLocalMerge,
}: any) {
  const hd = getCompatibleFormats(meta.formats?.videoOnly || [], true);
  const sd = getCompatibleFormats(meta.formats?.videoWithAudio || [], true);
  const audio = getCompatibleFormats(meta.formats?.audioOnly || [], false);

  return (
    <div>
      {meta.isRestricted && (
        <div className="alert alert-warning" role="status">
          <Lock size={17} />
          <span>
            <strong>Limited mode:</strong> bot protection is active on this video, so it was fetched via mobile
            emulation (360p). To unlock 1080p/4K, add your cookies in Settings or a <code>cookies.txt</code> in the project root.
          </span>
        </div>
      )}

      {/* Preview */}
      <div className="preview" style={{ marginTop: meta.isRestricted ? '1.25rem' : 0 }}>
        <div className="thumb">
          {meta.thumbnail && <img src={meta.thumbnail} alt={meta.title} />}
        </div>
        <div className="preview-body">
          <span className="eyebrow">YouTube Video</span>
          <h2 className="preview-title">{meta.title}</h2>
          <div className="preview-meta">
            {meta.author && <span>{meta.author}</span>}
            {meta.duration > 0 && <span>{fmtDuration(meta.duration)}</span>}
          </div>
        </div>
      </div>

      {/* Resolution selection */}
      <div className="section-head">
        <div className="section-title"><Video size={18} /> Choose quality</div>
        <label className="toggle-inline">
          <input
            type="checkbox"
            checked={showAdvancedCodecs}
            onChange={(e) => setShowAdvancedCodecs(e.target.checked)}
          />
          Advanced codecs (VP9 / AV1 / Opus)
        </label>
      </div>

      {hd.length > 0 && (
        <>
          <div className="subhead">High definition · merged in your browser</div>
          <div className="format-grid">
            {hd.map((f: any, idx: number) => (
              <FormatCard
                key={`${f.itag}-${idx}`}
                selected={selectedVideoFormat?.itag === f.itag && isSplitSelection}
                onClick={() => selectYtFormat(f, true)}
                title={f.qualityLabel}
                badges={[
                  f.fps ? { label: `${f.fps}fps` } : null,
                  { label: `${f.container} · ${f.codec}` },
                ]}
                size={fmtSize(f.sizeBytes)}
              />
            ))}
          </div>
        </>
      )}

      {sd.length > 0 && (
        <>
          <div className="subhead">Standard · direct download</div>
          <div className="format-grid">
            {sd.map((f: any, idx: number) => (
              <FormatCard
                key={`${f.itag}-${idx}`}
                selected={selectedVideoFormat?.itag === f.itag && !isSplitSelection}
                onClick={() => selectYtFormat(f, false)}
                title={f.qualityLabel}
                badges={[{ label: `${f.container} · ${f.codec}`, kind: 'success' }]}
                size={fmtSize(f.sizeBytes)}
              />
            ))}
          </div>
        </>
      )}

      {audio.length > 0 && (
        <>
          <div className="section-head" style={{ marginBottom: '0.5rem' }}>
            <div className="section-title"><AudioLines size={18} /> Audio only</div>
          </div>
          <div className="format-grid">
            {audio.map((f: any, idx: number) => (
              <FormatCard
                key={`${f.itag}-${idx}`}
                selected={selectedVideoFormat?.itag === f.itag && !isSplitSelection}
                onClick={() => selectYtFormat(f, false)}
                title={f.qualityLabel}
                badges={[
                  { label: `${f.container} · ${f.codec}`, kind: 'accent' },
                  f.audioBitrate ? { label: `${f.audioBitrate} kbps` } : null,
                ]}
                size={fmtSize(f.sizeBytes)}
              />
            ))}
          </div>
        </>
      )}

      <div className="cta">
        <button
          className="btn btn-accent btn-lg"
          onClick={onDownload}
          disabled={isBusy || !selectedVideoFormat}
        >
          <Download size={20} /> Download selected
        </button>
        {isSplitSelection && !useLocalMerge && (
          <p className="cta-note">High-resolution streams are combined entirely in your browser — no upload limits apply.</p>
        )}
        {isSplitSelection && useLocalMerge && (
          <p className="cta-note">Server-side merge is on — the Next.js backend will compile this locally (requires server FFmpeg).</p>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Instagram view
   ================================================================ */
function InstagramView({ meta, onDownload }: any) {
  if (meta.type === 'profile_pic') {
    return (
      <div className="preview" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div className="thumb thumb-round">
          <img src={meta.downloadUrl} alt={meta.username} />
        </div>
        <div className="preview-body" style={{ alignItems: 'center' }}>
          <h2 className="preview-title">@{meta.username}</h2>
          {meta.fullName && <p className="preview-sub">{meta.fullName}</p>}
          {meta.biography && <p className="caption" style={{ maxWidth: '30rem', textAlign: 'center' }}>{meta.biography}</p>}
          <p className="preview-sub" style={{ fontWeight: 600 }}>{Number(meta.followers).toLocaleString()} followers</p>
          <button className="btn btn-accent" style={{ marginTop: '0.75rem' }}
            onClick={() => onDownload(meta.downloadUrl, `pfp_${meta.username}`)}>
            <Download size={17} /> Download HD profile picture
          </button>
        </div>
      </div>
    );
  }

  if (meta.type === 'video' || meta.type === 'image') {
    return (
      <div className="preview">
        <div className="thumb thumb-portrait">
          <img src={meta.thumbnailUrl || meta.downloadUrl} alt="Instagram media" />
        </div>
        <div className="preview-body">
          <span className="eyebrow">Instagram {String(meta.type)}</span>
          {meta.username && <h2 className="preview-title">@{meta.username}</h2>}
          <p className="caption">{meta.caption || 'No caption available'}</p>
          <button className="btn btn-accent" style={{ marginTop: '0.75rem', alignSelf: 'flex-start' }}
            onClick={() => onDownload(meta.downloadUrl, `instagram_${meta.username || 'media'}`)}>
            <Download size={17} /> Download original ({meta.type})
          </button>
        </div>
      </div>
    );
  }

  if (meta.type === 'stories_list' || meta.type === 'story') {
    return (
      <div>
        <div className="section-head" style={{ marginTop: 0 }}>
          <div className="section-title"><InstagramIcon size={18} /> Stories for @{meta.username}</div>
          <span className="count">{meta.items?.length || 0}</span>
        </div>
        <div className="stories-grid">
          {meta.items?.map((item: any, idx: number) => (
            <div className="story-card" key={`${item.id}-${idx}`}>
              <div className="story-media">
                <img src={item.thumbnailUrl} alt="Story" />
                {item.isVideo && <span className="story-tag">VIDEO</span>}
              </div>
              <button className="btn btn-ghost" style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                onClick={() => onDownload(item.downloadUrl, `story_${meta.username}_${item.id}`)}>
                <Download size={14} /> Save
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (meta.type === 'carousel') {
    return (
      <div>
        <div className="preview" style={{ marginBottom: '1.5rem' }}>
          <div className="thumb thumb-portrait">
            <img src={meta.thumbnailUrl} alt="Carousel cover" />
          </div>
          <div className="preview-body">
            <span className="eyebrow">Instagram Carousel</span>
            {meta.username && <h2 className="preview-title">@{meta.username}</h2>}
            <p className="caption">{meta.caption || 'No caption available'}</p>
          </div>
        </div>

        <div className="section-head">
          <div className="section-title"><InstagramIcon size={18} /> Post Gallery</div>
          <span className="count">{meta.items?.length || 0} items</span>
        </div>
        <div className="stories-grid">
          {meta.items?.map((item: any, idx: number) => (
            <div className="story-card" key={idx}>
              <div className="story-media">
                <img src={item.thumbnailUrl || item.downloadUrl} alt={`Item ${idx + 1}`} />
                {item.type === 'video' && <span className="story-tag">VIDEO</span>}
              </div>
              <button className="btn btn-ghost" style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                onClick={() => onDownload(item.downloadUrl, `instagram_${meta.username || 'post'}_${idx + 1}`)}>
                <Download size={14} /> Save {item.type === 'video' ? 'Video' : 'Image'}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

/* ================================================================
   Pinterest view
   ================================================================ */
function PinterestView({ meta, onDownload }: any) {
  const isPortrait = meta.type === 'image';
  return (
    <div className="preview">
      <div className={`thumb ${isPortrait ? 'thumb-portrait' : ''}`}>
        <img src={meta.thumbnailUrl} alt={meta.title} />
      </div>
      <div className="preview-body">
        <span className="eyebrow">Pinterest {String(meta.type)}</span>
        <h2 className="preview-title">{meta.title}</h2>
        {meta.description && <p className="caption">{meta.description}</p>}
        <button className="btn btn-accent" style={{ marginTop: '0.75rem', alignSelf: 'flex-start' }}
          onClick={() => onDownload(meta.downloadUrl, 'pinterest_pin')}>
          <Download size={17} /> Download original ({meta.type})
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   Format card
   ================================================================ */
function FormatCard({ selected, onClick, title, badges, size }: any) {
  return (
    <button
      type="button"
      className={`format-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="format-main">
        <span className="format-res">{title}</span>
        <span className="format-meta">
          {badges.filter(Boolean).map((b: any, i: number) => (
            <span key={i} className={`badge ${b.kind === 'success' ? 'badge-success' : b.kind === 'accent' ? 'badge-accent' : ''}`}
              style={{ textTransform: 'none' }}>
              {b.label}
            </span>
          ))}
          {size && <span>{size}</span>}
        </span>
      </span>
      <CheckCircle className="format-check" size={18} />
    </button>
  );
}

/* ================================================================
   Progress panel
   ================================================================ */
function ProgressPanel({ status, progress, speed, statusText, logs, showLog, setShowLog, consoleBottomRef }: any) {
  const labelMap: Record<string, string> = {
    downloading_video: 'Downloading video…',
    downloading_audio: 'Downloading audio…',
    merging: 'Merging video & audio…',
    handoff: 'Handed off to your browser',
    completed: 'Complete',
    failed: 'Failed',
  };
  const isDeterminate = status === 'downloading_video' || status === 'downloading_audio' || status === 'merging';
  const isSuccess = status === 'completed';
  const isError = status === 'failed';

  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="progress-top">
        <span className={`progress-label ${isSuccess ? 'is-success' : ''} ${isError ? 'is-error' : ''}`}>
          {isSuccess && <CheckCircle size={16} />}
          {isError && <AlertCircle size={16} />}
          {status === 'handoff' && <Info size={16} />}
          {labelMap[status] || status}
        </span>
        {isDeterminate && <span className="progress-pct">{progress}%</span>}
      </div>

      <div className="bar">
        <div
          className={`bar-fill ${status === 'handoff' ? 'is-indeterminate' : ''} ${isSuccess ? 'is-success' : ''} ${isError ? 'is-error' : ''}`}
          style={{ width: isSuccess || isError ? '100%' : `${progress}%` }}
        />
      </div>

      <div className="progress-stats">
        <span>{statusText}</span>
        {isDeterminate && speed > 0 && <span className="spd">{speed.toFixed(1)} Mbps</span>}
      </div>

      {logs.length > 0 && (
        <>
          <button className="log-toggle" onClick={() => setShowLog((s: boolean) => !s)} aria-expanded={showLog}>
            <ChevronDown size={14} style={{ transform: showLog ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
            {showLog ? 'Hide' : 'Show'} technical details
          </button>
          {showLog && (
            <div className="log">
              {logs.map((log: string, i: number) => <div key={i}>{log}</div>)}
              <div ref={consoleBottomRef} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ================================================================
   Settings panel
   ================================================================ */
function SettingsPanel({
  instaSessionId, saveInstaSession, youtubeCookies, saveYtCookies,
  useLocalMerge, saveMergePref, onClose,
}: any) {
  return (
    <div className="settings">
      <div className="section-head" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
        <div className="section-title"><Settings size={18} /> Settings</div>
        <button className="btn btn-ghost" style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }} onClick={onClose}>
          Done
        </button>
      </div>

      <div className="setting">
        <label className="setting-label">Instagram Session ID</label>
        <p className="setting-desc">
          Link your account to download Stories, profile pictures, and private posts.
          Stored only in your browser’s local storage and sent to the API on request.
        </p>
        <div className="input-inline">
          <input
            type="password"
            className="setting-input"
            placeholder={instaSessionId ? '••••••••••••••••••••••••' : 'Paste sessionid cookie value'}
            value={instaSessionId}
            onChange={(e) => saveInstaSession(e.target.value)}
          />
          {instaSessionId && (
            <button className="btn btn-danger" onClick={() => saveInstaSession('')} aria-label="Clear session ID">
              <Trash2 size={17} />
            </button>
          )}
        </div>
        <span className="hint"><Lock size={12} /> Saved locally · overrides backend env fallback</span>
      </div>

      <div className="setting">
        <label className="setting-label">YouTube session cookies <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
        <p className="setting-desc">
          Paste your YouTube cookies to download restricted / bot-blocked videos in high resolution (1080p, 4K).
          Stored only in your browser and sent to the API dynamically.
        </p>
        <div className="input-inline">
          <textarea
            className="setting-input"
            rows={2}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem', resize: 'vertical' }}
            placeholder={youtubeCookies ? '••••••••••••••••••••••••' : 'Paste raw Cookie header (e.g. VISITOR_INFO1_LIVE=…; SID=…)'}
            value={youtubeCookies}
            onChange={(e) => saveYtCookies(e.target.value)}
          />
          {youtubeCookies && (
            <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => saveYtCookies('')} aria-label="Clear cookies">
              <Trash2 size={17} />
            </button>
          )}
        </div>
        <span className="hint"><Lock size={12} /> Saved locally · sent for download authorization</span>
      </div>

      <div className="setting">
        <div className="setting-head">
          <div>
            <label className="setting-label">Local server-side merge</label>
            <p className="setting-desc">
              Turn on when running this app on your own machine — it uses your local FFmpeg binary to merge YouTube files.
              Leave off when hosting on Vercel to use in-browser WASM merging.
            </p>
          </div>
          <label className="switch">
            <input type="checkbox" checked={useLocalMerge} onChange={(e) => saveMergePref(e.target.checked)} />
            <span className="switch-track" />
          </label>
        </div>
      </div>

      <div className="setting">
        <label className="setting-label"><Info size={15} /> How to find your Instagram Session ID</label>
        <ol className="steps">
          <li>Go to <a href="https://www.instagram.com" target="_blank" rel="noreferrer">instagram.com</a> and log in.</li>
          <li>Right-click the page and choose <strong>Inspect</strong> to open DevTools.</li>
          <li>Open the <strong>Application</strong> (Chrome) or <strong>Storage</strong> (Firefox) tab.</li>
          <li>Expand <strong>Cookies</strong> → select <code>https://www.instagram.com</code>.</li>
          <li>Find the <code>sessionid</code> cookie and copy its value.</li>
        </ol>
      </div>
    </div>
  );
}

/* ================================================================
   Ad Banner Component
   ================================================================ */
function AdBanner({ position }: { position: 'top' | 'bottom' }) {
  if (!SHOW_ADS) return null;

  // AD NETWORK CODE PASTE AREA:
  // To paste your ad codes (Adsterra, PropellerAds, Monetag, etc.):
  // 1. Remove the <a className="ad-fallback">...</a> block below.
  // 2. Use dangerouslySetInnerHTML to load your ad script:
  //    e.g. <div dangerouslySetInnerHTML={{ __html: `<script src="..." ...></script>` }} />
  
  return (
    <div className="ad-section">
      <div className="ad-label">Sponsored</div>
      <div className="ad-wrapper">
        <a 
          href="#" 
          onClick={(e) => e.preventDefault()} 
          className="ad-fallback"
        >
          <span>Sponsor Space Available ({position === 'top' ? 'Leaderboard' : 'Footer'})</span>
          <p>This premium ad space supports fast download servers. Click to advertise here.</p>
        </a>
      </div>
    </div>
  );
}

/* ================================================================
   Trust Section Component
   ================================================================ */
function TrustSection() {
  return (
    <section className="trust-section">
      <div className="trust-grid">
        <div className="trust-card">
          <div className="trust-icon">
            <ShieldCheck size={26} />
          </div>
          <h3>Private &amp; Secure</h3>
          <p>No downloads are processed on our servers. Video compilations happen directly in your browser.</p>
        </div>
        <div className="trust-card">
          <div className="trust-icon">
            <Zap size={24} />
          </div>
          <h3>High-Speed Downloads</h3>
          <p>Direct streams with zero download limits, speed caps, or registration requirements.</p>
        </div>
        <div className="trust-card">
          <div className="trust-icon">
            <LockKeyhole size={24} />
          </div>
          <h3>100% Safe Connection</h3>
          <p>Protected by SSL encryption. We do not store or track any cookies or history logs.</p>
        </div>
      </div>
    </section>
  );
}

/* ================================================================
   FAQ / SEO Section Component
   ================================================================ */
function FaqSection() {
  const faqData = [
    {
      q: 'How to download YouTube videos in 1080p and 4K?',
      a: 'To download YouTube videos in Full HD (1080p, 1440p) or Ultra HD (4K), simply paste the video link into the YouTube tab and press Fetch. Our system retrieves separate high-definition video and audio tracks, which are merged directly inside your web browser using FFmpeg WebAssembly. This preserves absolute original quality without compressing the output.',
    },
    {
      q: 'Can I download Instagram Reels, Stories, and Carousel posts?',
      a: 'Yes! ApexDownloader supports downloading public Instagram posts, Reels, stories, and carousel galleries in full resolution. Simply paste the Instagram link and click Fetch to extract all media instantly.',
    },
    {
      q: 'How to download Pinterest images and videos online?',
      a: 'Select the Pinterest tab, paste the link of the Pin you wish to save, and click Fetch. The downloader extracts the highest resolution direct download URL for the media (including MP4 video files and clean high-resolution JPEGs) so you can save them instantly to your device.',
    },
    {
      q: 'Are there download limits or charges?',
      a: 'No, ApexDownloader is 100% free with no premium caps or speed limits. Because video compilations and merges are processed client-side inside your own browser window rather than loading our servers, we can offer unlimited high-speed conversions for free!',
    },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqData.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <section className="faq-section">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h2 className="faq-heading">Frequently Asked Questions</h2>
      <div className="faq-container">
        {faqData.map(({ q, a }, i) => (
          <details key={i} className="faq-item">
            <summary className="faq-question">{q}</summary>
            <div className="faq-answer"><p>{a}</p></div>
          </details>
        ))}
      </div>
    </section>
  );
}

