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
  Info,
  Lock,
  ChevronDown,
  Clapperboard,
  Image as ImageIcon,
  Sparkles,
  ShieldCheck,
  Zap,
  LockKeyhole,
  Clipboard,
  X,
  Square,
  History,
  Clock,
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
type MediaType = 'image' | 'video';

type HistoryItem = {
  id: string;
  title: string;
  platform: Platform;
  url: string;
  timestamp: number;
};

type YoutubeFormat = {
  itag: number | string;
  url: string;
  qualityLabel: string;
  container: string;
  codec: string;
  hasVideo: boolean;
  hasAudio: boolean;
  fps: number | null;
  sizeBytes: number | null;
  audioBitrate: number | null;
};

type YoutubeMetadata = {
  title: string;
  description: string;
  duration: number;
  author: string;
  authorUrl: string;
  thumbnail: string;
  isRestricted: boolean;
  formats: {
    videoWithAudio: YoutubeFormat[];
    videoOnly: YoutubeFormat[];
    audioOnly: YoutubeFormat[];
  };
};

type InstagramItem = {
  id: string;
  type: MediaType;
  isVideo?: boolean;
  downloadUrl: string;
  thumbnailUrl: string;
};

type InstagramMetadata = {
  type: 'profile_pic' | 'video' | 'image' | 'stories_list' | 'story' | 'carousel';
  username?: string;
  fullName?: string;
  biography?: string;
  followers?: number;
  caption?: string;
  downloadUrl: string;
  thumbnailUrl: string;
  items?: InstagramItem[];
};

type PinterestMetadata = {
  type: MediaType;
  title: string;
  description: string;
  downloadUrl: string;
  thumbnailUrl: string;
};

type Badge = { label: string; kind?: 'success' | 'accent' };

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

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
  const [showHistory, setShowHistory] = useState(false);
  const [url, setUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Metadata
  const [ytMetadata, setYtMetadata] = useState<YoutubeMetadata | null>(null);
  const [instaMetadata, setInstaMetadata] = useState<InstagramMetadata | null>(null);
  const [pinMetadata, setPinMetadata] = useState<PinterestMetadata | null>(null);

  // YouTube selection
  const [selectedVideoFormat, setSelectedVideoFormat] = useState<YoutubeFormat | null>(null);
  const [selectedAudioFormat, setSelectedAudioFormat] = useState<YoutubeFormat | null>(null);
  const [isSplitSelection, setIsSplitSelection] = useState(false);
  const [showAdvancedCodecs, setShowAdvancedCodecs] = useState(false);

  // Compatibility filter (MP4/H.264 prioritization & Audio streamlining)
  const getCompatibleFormats = (formats: YoutubeFormat[], isVideo: boolean): YoutubeFormat[] => {
    if (showAdvancedCodecs) return formats;

    if (!isVideo) {
      // Keep only top High Quality (~320kbps) and Standard (~140kbps) audio options in basic mode
      const sorted = [...formats].sort((a, b) => (b.audioBitrate || b.sizeBytes || 0) - (a.audioBitrate || a.sizeBytes || 0));
      if (sorted.length === 0) return [];
      const best = sorted[0];
      const standard = sorted.find((f) => f.audioBitrate && f.audioBitrate <= 160 && f.itag !== best.itag);
      return standard ? [best, standard] : [best];
    }

    const grouped = new Map<string, YoutubeFormat>();

    for (const f of formats) {
      const key = `${f.qualityLabel}-${f.fps || ''}`;
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, f);
      } else {
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
      }
    }

    return Array.from(grouped.values());
  };

  const [useLocalMerge, setUseLocalMerge] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const storedMerge = localStorage.getItem('use_local_merge');
      if (storedMerge !== null) return storedMerge === 'true';
    }
    return false;
  });

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('apex_download_history');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const addToHistory = (title: string, platform: Platform, downloadUrl: string) => {
    const newItem: HistoryItem = {
      id: String(Date.now()),
      title: title || 'Download',
      platform,
      url: downloadUrl,
      timestamp: Date.now(),
    };
    setHistory((prev) => {
      const updated = [newItem, ...prev.filter((i) => i.url !== downloadUrl)].slice(0, 10);
      if (typeof window !== 'undefined') {
        localStorage.setItem('apex_download_history', JSON.stringify(updated));
      }
      return updated;
    });
  };

  const abortControllerRef = useRef<AbortController | null>(null);

  // Downloader state
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  const isBusy = downloadStatus === 'downloading_video' || downloadStatus === 'downloading_audio' || downloadStatus === 'merging';

  const saveMergePref = (val: boolean) => {
    setUseLocalMerge(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('use_local_merge', String(val));
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const trimmed = text.trim();
        setUrl(trimmed);
        if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
          setActiveTab('youtube');
        } else if (trimmed.includes('instagram.com')) {
          setActiveTab('instagram');
        } else if (trimmed.includes('pinterest.com') || trimmed.includes('pin.it')) {
          setActiveTab('pinterest');
        }
      }
    } catch {
      // Permission or API error
    }
  };

  const handleClear = () => {
    setUrl('');
  };

  const cancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setDownloadStatus('failed');
    setStatusText('Download canceled by user.');
    logToConsole('Download task was canceled.');
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
    const requestedUrl = url.trim();
    if (!requestedUrl) {
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
        const res = await fetch(`/api/youtube/details?url=${encodeURIComponent(requestedUrl)}`);
        const data = await res.json() as YoutubeMetadata & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Failed to fetch YouTube details');

        setYtMetadata(data);

        const defaultMerged = [...data.formats.videoWithAudio]
          .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))[0];
        if (defaultMerged) {
          setSelectedVideoFormat(defaultMerged);
        } else {
          const bestVideo = [...data.formats.videoOnly]
            .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))[0] ?? null;
          const bestAudio = [...data.formats.audioOnly]
            .sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0))[0] ?? null;
          setSelectedVideoFormat(bestVideo);
          setSelectedAudioFormat(bestAudio);
          setIsSplitSelection(true);
        }
      } else if (activeTab === 'instagram') {
        const res = await fetch(`/api/instagram?url=${encodeURIComponent(requestedUrl)}`);
        const data = await res.json() as InstagramMetadata & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Failed to fetch Instagram details');
        setInstaMetadata(data);
      } else if (activeTab === 'pinterest') {
        const res = await fetch(`/api/pinterest?url=${encodeURIComponent(requestedUrl)}`);
        const data = await res.json() as PinterestMetadata & { error?: string };
        if (!res.ok) throw new Error(data.error || 'Failed to fetch Pinterest details');
        setPinMetadata(data);
      }
      // Keep the fetched source separately so the input can be cleared for the next link.
      setSourceUrl(requestedUrl);
      setUrl('');
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'An unexpected error occurred while fetching details.'));
    } finally {
      setLoading(false);
    }
  };

  const selectYtFormat = (format: YoutubeFormat, isSplit: boolean) => {
    setIsSplitSelection(isSplit);
    if (isSplit) {
      setSelectedVideoFormat(format);
      if (!selectedAudioFormat && ytMetadata?.formats.audioOnly.length) {
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
    if (!selectedVideoFormat || !sourceUrl) {
      setError('Please fetch a YouTube video before starting a download.');
      return;
    }

    setConsoleLogs([]);
    setDownloadProgress(0);
    setDownloadSpeed(0);

    const title = ytMetadata?.title || 'YouTube_Video';
    const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '_');

    // Scenario A: pre-merged or audio-only (browser handoff)
    if (!isSplitSelection) {
      setDownloadStatus('handoff');
      setStatusText('Your download is starting in the browser…');
      logToConsole(`Requesting download for itag ${selectedVideoFormat.itag}...`);

      const isAudioOnly = !selectedVideoFormat.hasVideo;
      const formatQuery = isAudioOnly && !showAdvancedCodecs ? '&format=mp3' : '';

      try {
        window.location.href = `/api/youtube/download?url=${encodeURIComponent(sourceUrl)}&itag=${selectedVideoFormat.itag}&title=${encodeURIComponent(cleanTitle)}${formatQuery}`;
        logToConsole('Direct stream download requested. Handed over to browser downloader.');
        addToHistory(title, 'youtube', sourceUrl);
      } catch (error: unknown) {
        setDownloadStatus('failed');
        const message = getErrorMessage(error, 'Stream download failed.');
        setError(message);
        logToConsole(`Error: ${message}`);
      }
      return;
    }

    // Scenario B: server-side merge (browser handoff)
    if (useLocalMerge) {
      if (!selectedAudioFormat) {
        setError('No compatible audio stream was found for this video.');
        return;
      }
      setDownloadStatus('handoff');
      setStatusText('Server is merging your file — the download will begin shortly…');
      logToConsole(`Requesting server-side merge of video (itag: ${selectedVideoFormat.itag}) and audio (itag: ${selectedAudioFormat.itag})...`);

      try {
        window.location.href = `/api/youtube/download?action=merge&url=${encodeURIComponent(sourceUrl)}&videoItag=${selectedVideoFormat.itag}&audioItag=${selectedAudioFormat.itag}&title=${encodeURIComponent(cleanTitle)}`;
        logToConsole('Server-side merge initiated. File is being compiled and streamed.');
        addToHistory(title, 'youtube', sourceUrl);
      } catch (error: unknown) {
        setDownloadStatus('failed');
        const message = getErrorMessage(error, 'Server merge request failed.');
        setError(message);
        logToConsole(`Error: ${message}`);
      }
      return;
    }

    // Scenario C: client-side chunk proxy + FFmpeg WASM merge
    try {
      if (!selectedAudioFormat) {
        throw new Error('No compatible audio stream was found for this video.');
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const videoSizeBytes = selectedVideoFormat.sizeBytes ?? 0;
      const audioSizeBytes = selectedAudioFormat.sizeBytes ?? 0;

      setDownloadStatus('downloading_video');
      setStatusText('Downloading video stream in chunks...');
      logToConsole('Starting client-side range-based video chunk proxy...');
      logToConsole(`Video format: ${selectedVideoFormat.qualityLabel} | Size: ${videoSizeBytes > 0 ? (videoSizeBytes / (1024 * 1024)).toFixed(2) + ' MB' : 'Dynamic'}`);

      const videoBlob = await downloadInChunks(
        selectedVideoFormat.url,
        videoSizeBytes,
        (percent, speed) => {
          setDownloadProgress(Math.round(percent));
          setDownloadSpeed(speed);
          setStatusText(`Downloading video stream: ${Math.round(percent)}%`);
        },
        abortController.signal
      );

      logToConsole('Video stream chunks download complete.');

      setDownloadStatus('downloading_audio');
      setDownloadProgress(0);
      setStatusText('Downloading audio stream in chunks...');
      logToConsole('Starting client-side range-based audio chunk proxy...');
      logToConsole(`Audio format: ${selectedAudioFormat.qualityLabel} | Size: ${audioSizeBytes > 0 ? (audioSizeBytes / (1024 * 1024)).toFixed(2) + ' MB' : 'Dynamic'}`);

      const audioBlob = await downloadInChunks(
        selectedAudioFormat.url,
        audioSizeBytes,
        (percent, speed) => {
          setDownloadProgress(Math.round(percent));
          setDownloadSpeed(speed);
          setStatusText(`Downloading audio stream: ${Math.round(percent)}%`);
        },
        abortController.signal
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
      addToHistory(title, 'youtube', sourceUrl);
      logToConsole('File successfully saved to your device!');
    } catch (error: unknown) {
      console.error('Error during client-side download/merge:', error);
      setDownloadStatus('failed');
      setStatusText('Download or Merge failed');
      logToConsole(`Fatal Error: ${getErrorMessage(error, 'An error occurred.')}`);
    } finally {
      abortControllerRef.current = null;
    }
  };

  // Direct downloader for Instagram / Pinterest
  const triggerDirectDownload = async (mediaUrl: string, defaultName: string, mediaType: MediaType) => {
    setDownloadStatus('downloading_video');
    setDownloadProgress(0);
    setStatusText('Downloading file...');
    setConsoleLogs([]);
    logToConsole(`Initiating proxy download for media URL: ${mediaUrl.substring(0, 60)}...`);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const proxyUrl = `/api/youtube/download?action=proxy&streamUrl=${encodeURIComponent(mediaUrl)}`;
      const response = await fetch(proxyUrl, { signal: abortController.signal });
      if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);

      const totalBytesHeader = response.headers.get('Content-Length');
      const totalBytes = totalBytesHeader ? parseInt(totalBytesHeader, 10) : 0;

      let downloaded = 0;
      const chunks: Uint8Array[] = [];
      const reader = response.body?.getReader();
      const startTime = Date.now();

      if (!reader) throw new Error('ReadableStream not supported in this browser.');

      while (true) {
        if (abortController.signal.aborted) throw new Error('Download canceled');
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

      const responseType = response.headers.get('Content-Type') || '';
      const isVideo = mediaType === 'video' || responseType.startsWith('video/');
      const ext = isVideo ? 'mp4' : 'jpg';
      const fileBlob = new Blob([mergedArray.buffer], { type: isVideo ? 'video/mp4' : 'image/jpeg' });

      setDownloadStatus('completed');
      setStatusText('Download completed!');
      logToConsole('Media saved successfully.');
      triggerBlobDownload(fileBlob, `${defaultName}.${ext}`);
      addToHistory(defaultName, activeTab, mediaUrl);
    } catch (error: unknown) {
      console.error(error);
      setDownloadStatus('failed');
      setStatusText('Proxy download failed.');
      logToConsole(`Error: ${getErrorMessage(error, 'Download failed.')}`);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const triggerBatchDownload = async (items: Array<{ downloadUrl: string; isVideo?: boolean; type?: string; id?: string }>, prefix: string) => {
    setConsoleLogs([]);
    logToConsole(`Starting batch download of ${items.length} items...`);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isVid = item.isVideo || item.type === 'video';
      const name = `${prefix}_${i + 1}`;
      logToConsole(`Downloading batch item ${i + 1}/${items.length}...`);
      await triggerDirectDownload(item.downloadUrl, name, isVid ? 'video' : 'image');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    logToConsole('Batch download complete!');
  };

  const switchTab = (tab: Platform) => {
    setActiveTab(tab);
    setUrl('');
    setSourceUrl('');
    setError(null);
    setShowSettings(false);
    setYtMetadata(null);
    setInstaMetadata(null);
    setPinMetadata(null);
    setSelectedVideoFormat(null);
    setSelectedAudioFormat(null);
    setIsSplitSelection(false);
  };

  const hasResult =
    (activeTab === 'youtube' && ytMetadata) ||
    (activeTab === 'instagram' && instaMetadata) ||
    (activeTab === 'pinterest' && pinMetadata);

  const activeMeta = PLATFORMS.find(p => p.id === activeTab)!;

  return (
    <div className="container">
      {/* Top bar */}
      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Download size={18} /></div>
          <div className="brand-name">Apex<span>Downloader</span></div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {history.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setShowHistory((open) => !open)} aria-expanded={showHistory}>
              <History size={17} /> History ({history.length})
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setShowSettings((open) => !open)} aria-expanded={showSettings}>
            <Settings size={17} /> Settings
          </button>
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
            {showSettings && (
              <SettingsPanel
                useLocalMerge={useLocalMerge}
                saveMergePref={saveMergePref}
                onClose={() => setShowSettings(false)}
              />
            )}
            {showHistory && (
              <HistoryPanel
                history={history}
                onClose={() => setShowHistory(false)}
                onClear={() => {
                  setHistory([]);
                  if (typeof window !== 'undefined') localStorage.removeItem('apex_download_history');
                }}
              />
            )}
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
                <div className="input-actions">
                  {url ? (
                    <button type="button" className="input-action-btn" onClick={handleClear} title="Clear input text">
                      <X size={14} /> Clear
                    </button>
                  ) : (
                    <button type="button" className="input-action-btn" onClick={handlePaste} title="Paste from clipboard">
                      <Clipboard size={14} /> Paste
                    </button>
                  )}
                </div>
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
              <InstagramView
                meta={instaMetadata}
                onDownload={triggerDirectDownload}
                onBatchDownload={(items, prefix) => triggerBatchDownload(items, prefix)}
              />
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
                onCancel={cancelDownload}
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
}: {
  meta: YoutubeMetadata;
  getCompatibleFormats: (formats: YoutubeFormat[], isVideo: boolean) => YoutubeFormat[];
  showAdvancedCodecs: boolean;
  setShowAdvancedCodecs: React.Dispatch<React.SetStateAction<boolean>>;
  selectedVideoFormat: YoutubeFormat | null;
  isSplitSelection: boolean;
  selectYtFormat: (format: YoutubeFormat, isSplit: boolean) => void;
  onDownload: () => Promise<void>;
  isBusy: boolean;
  useLocalMerge: boolean;
}) {
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
            emulation (360p). To unlock 1080p/4K, refresh the service authorization cookies and try again.
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
            {hd.map((f, idx) => (
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
            {sd.map((f, idx) => (
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
            {audio.map((f, idx) => {
              const isBest = idx === 0;
              const badgeLabel = showAdvancedCodecs
                ? `${f.container} · ${f.codec}`
                : isBest
                ? 'MP3 · High Quality (~320kbps)'
                : 'MP3 · Standard (~140kbps)';
              const cardTitle = showAdvancedCodecs
                ? f.qualityLabel
                : isBest
                ? 'High Quality MP3'
                : 'Standard MP3';

              return (
                <FormatCard
                  key={`${f.itag}-${idx}`}
                  selected={selectedVideoFormat?.itag === f.itag && !isSplitSelection}
                  onClick={() => selectYtFormat(f, false)}
                  title={cardTitle}
                  badges={[
                    {
                      label: badgeLabel,
                      kind: 'accent',
                    },
                    showAdvancedCodecs && f.audioBitrate ? { label: `${f.audioBitrate} kbps` } : null,
                  ]}
                  size={fmtSize(f.sizeBytes)}
                />
              );
            })}
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
function InstagramView({ meta, onDownload, onBatchDownload }: {
  meta: InstagramMetadata;
  onDownload: (mediaUrl: string, defaultName: string, mediaType: MediaType) => Promise<void>;
  onBatchDownload: (items: Array<{ downloadUrl: string; isVideo?: boolean; type?: string; id?: string }>, prefix: string) => Promise<void>;
}) {
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
          <button className="btn btn-accent preview-btn" style={{ marginTop: '0.75rem' }}
            onClick={() => onDownload(meta.downloadUrl, `pfp_${meta.username}`, 'image')}>
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
          <button className="btn btn-accent preview-btn"
            onClick={() => onDownload(meta.downloadUrl, `instagram_${meta.username || 'media'}`, meta.type as MediaType)}>
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
        {meta.items && meta.items.length > 1 && (
          <button className="btn btn-primary" style={{ marginBottom: '1rem', width: '100%' }}
            onClick={() => onBatchDownload(meta.items || [], `story_${meta.username}`)}>
            <Download size={16} /> Save All ({meta.items.length}) Stories
          </button>
        )}
        <div className="stories-grid">
          {meta.items?.map((item, idx) => (
            <div className="story-card" key={`${item.id}-${idx}`}>
              <div className="story-media">
                <img src={item.thumbnailUrl} alt="Story" />
                {item.isVideo && <span className="story-tag">VIDEO</span>}
              </div>
              <button className="btn btn-ghost" style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                onClick={() => onDownload(item.downloadUrl, `story_${meta.username}_${item.id}`, item.isVideo ? 'video' : 'image')}>
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
            {meta.items && meta.items.length > 1 && (
              <button className="btn btn-accent preview-btn"
                onClick={() => onBatchDownload(meta.items || [], `instagram_${meta.username || 'carousel'}`)}>
                <Download size={16} /> Download All ({meta.items.length}) Items
              </button>
            )}
          </div>
        </div>

        <div className="section-head">
          <div className="section-title"><InstagramIcon size={18} /> Post Gallery</div>
          <span className="count">{meta.items?.length || 0} items</span>
        </div>
        <div className="stories-grid">
          {meta.items?.map((item, idx) => (
            <div className="story-card" key={idx}>
              <div className="story-media">
                <img src={item.thumbnailUrl || item.downloadUrl} alt={`Item ${idx + 1}`} />
                {item.type === 'video' && <span className="story-tag">VIDEO</span>}
              </div>
              <button className="btn btn-ghost" style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                onClick={() => onDownload(item.downloadUrl, `instagram_${meta.username || 'post'}_${idx + 1}`, item.type as MediaType)}>
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
function PinterestView({ meta, onDownload }: {
  meta: PinterestMetadata;
  onDownload: (mediaUrl: string, defaultName: string, mediaType: MediaType) => Promise<void>;
}) {
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
        <button className="btn btn-accent preview-btn"
          onClick={() => onDownload(meta.downloadUrl, 'pinterest_pin', meta.type)}>
          <Download size={17} /> Download original ({meta.type})
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   Format card
   ================================================================ */
function FormatCard({ selected, onClick, title, badges, size }: {
  selected: boolean;
  onClick: () => void;
  title: string;
  badges: Array<Badge | null>;
  size: string | null;
}) {
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
          {badges.filter((badge): badge is Badge => Boolean(badge)).map((b, i) => (
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
function ProgressPanel({ status, progress, speed, statusText, logs, showLog, setShowLog, consoleBottomRef, onCancel }: {
  status: DownloadStatus;
  progress: number;
  speed: number;
  statusText: string;
  logs: string[];
  showLog: boolean;
  setShowLog: React.Dispatch<React.SetStateAction<boolean>>;
  consoleBottomRef: React.RefObject<HTMLDivElement | null>;
  onCancel?: () => void;
}) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isDeterminate && <span className="progress-pct">{progress}%</span>}
          {isDeterminate && onCancel && (
            <button
              className="input-action-btn"
              onClick={onCancel}
              title="Cancel current download"
              style={{ color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.3)' }}
            >
              <Square size={12} fill="currentColor" /> Cancel
            </button>
          )}
        </div>
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
          <button className="log-toggle" onClick={() => setShowLog((isShown) => !isShown)} aria-expanded={showLog}>
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
   History Panel Component
   ================================================================ */
function HistoryPanel({ history, onClose, onClear }: {
  history: HistoryItem[];
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <div className="settings" style={{ marginBottom: '1.5rem' }}>
      <div className="section-head" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
        <div className="section-title"><History size={18} /> Recent Downloads ({history.length})</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={onClear}>
            Clear History
          </button>
          <button className="btn btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
      <div className="history-list">
        {history.map((item) => (
          <div className="history-item" key={item.id}>
            <div>
              <div className="history-item-title">{item.title}</div>
              <span className="hint" style={{ fontSize: '0.75rem' }}>
                <Clock size={11} /> {new Date(item.timestamp).toLocaleTimeString()} · {item.platform.toUpperCase()}
              </span>
            </div>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="input-action-btn">
              <Download size={13} /> Re-open
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   Settings panel
   ================================================================ */
function SettingsPanel({
  useLocalMerge,
  saveMergePref,
  onClose,
}: {
  useLocalMerge: boolean;
  saveMergePref: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="settings">
      <div className="section-head" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
        <div className="section-title"><Settings size={18} /> Settings</div>
        <button className="btn btn-ghost" style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }} onClick={onClose}>
          Done
        </button>
      </div>

      <div className="setting">
        <label className="setting-label"><ShieldCheck size={15} /> Service authorization</label>
        <p className="setting-desc">
          High-quality YouTube extraction and Instagram requests use the service&apos;s server-managed authorization.
          Visitors are never asked to paste or store account cookies in this browser.
        </p>
        <span className="hint"><Lock size={12} /> Authorization remains on the server and is never included in download URLs.</span>
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
          <p>Authorization stays on our server. High-resolution video compilation happens in your browser by default.</p>
        </div>
        <div className="trust-card">
          <div className="trust-icon">
            <Zap size={24} />
          </div>
          <h3>High-Speed Downloads</h3>
          <p>Media is securely streamed through our download service with no account required from visitors.</p>
        </div>
        <div className="trust-card">
          <div className="trust-icon">
            <LockKeyhole size={24} />
          </div>
          <h3>100% Safe Connection</h3>
          <p>Protected by HTTPS. Visitor browsers do not store or send account cookies to begin a download.</p>
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
