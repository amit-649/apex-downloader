"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Download,
  Link2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Info,
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
  Video,
} from 'lucide-react';

const SHOW_ADS = false;

/* ---------- Brand icons ---------- */
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
type Platform = 'instagram' | 'pinterest';
type DownloadStatus =
  | 'idle'
  | 'fetching'
  | 'downloading_video'
  | 'downloading_audio'
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const PLATFORMS: { id: Platform; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: 'instagram', label: 'Instagram', Icon: InstagramIcon },
  { id: 'pinterest', label: 'Pinterest', Icon: PinterestIcon },
];

const EMPTY_HINTS: Record<Platform, { text: string; Icon: React.FC<{ size?: number }> }[]> = {
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
  const [activeTab, setActiveTab] = useState<Platform>('instagram');
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Metadata
  const [instaMetadata, setInstaMetadata] = useState<InstagramMetadata | null>(null);
  const [pinMetadata, setPinMetadata] = useState<PinterestMetadata | null>(null);

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

  const isBusy = downloadStatus === 'downloading_video' || downloadStatus === 'downloading_audio';

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const trimmed = text.trim();
        setUrl(trimmed);
        if (trimmed.includes('instagram.com')) {
          setActiveTab('instagram');
        } else if (trimmed.includes('pinterest.com') || trimmed.includes('pin.it')) {
          setActiveTab('pinterest');
        }
      }
    } catch {
      // Permission error
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

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputUrl = e.target.value;
    setUrl(inputUrl);

    if (inputUrl.includes('instagram.com')) {
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
    setInstaMetadata(null);
    setPinMetadata(null);

    try {
      if (activeTab === 'instagram') {
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
      setUrl('');
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'An unexpected error occurred while fetching details.'));
    } finally {
      setLoading(false);
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
      const proxyUrl = `/api/instagram/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(defaultName)}`;
      const response = await fetch(proxyUrl, { signal: abortController.signal });
      if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body) {
        const blob = await response.blob();
        triggerBlobDownload(blob, `${defaultName}.${mediaType === 'video' ? 'mp4' : 'jpg'}`);
        setDownloadStatus('completed');
        setStatusText('Download finished!');
        addToHistory(defaultName, activeTab, mediaUrl);
        return;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loadedBytes = 0;
      const startTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loadedBytes += value.byteLength;

        if (totalBytes > 0) {
          const pct = Math.min(100, Math.round((loadedBytes / totalBytes) * 100));
          setDownloadProgress(pct);
        }

        const elapsedSec = (Date.now() - startTime) / 1000;
        if (elapsedSec > 0) {
          const mbps = (loadedBytes * 8) / (elapsedSec * 1000 * 1000);
          setDownloadSpeed(mbps);
        }
      }

      const blob = new Blob(chunks as BlobPart[]);
      const extension = mediaType === 'video' ? 'mp4' : 'jpg';
      triggerBlobDownload(blob, `${defaultName}.${extension}`);

      setDownloadStatus('completed');
      setStatusText('Download completed successfully!');
      logToConsole('Download finished successfully.');
      addToHistory(defaultName, activeTab, mediaUrl);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      setDownloadStatus('failed');
      const message = getErrorMessage(error, 'Download request failed.');
      setError(message);
      logToConsole(`Error: ${message}`);
    }
  };

  const triggerBatchDownload = async (items: Array<{ downloadUrl: string; isVideo?: boolean; type?: string; id?: string }>, prefix: string) => {
    setDownloadStatus('downloading_video');
    setDownloadProgress(0);
    setStatusText(`Downloading ${items.length} files...`);
    setConsoleLogs([]);
    logToConsole(`Batch downloading ${items.length} items...`);

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isVid = item.isVideo || item.type === 'video';
        const name = `${prefix}_${i + 1}`;
        setStatusText(`Downloading item ${i + 1} of ${items.length}...`);
        setDownloadProgress(Math.round(((i + 1) / items.length) * 100));

        await triggerDirectDownload(item.downloadUrl, name, isVid ? 'video' : 'image');
      }
      setDownloadStatus('completed');
      setStatusText(`Successfully downloaded ${items.length} items!`);
    } catch (error: unknown) {
      setDownloadStatus('failed');
      setError(getErrorMessage(error, 'Batch download failed.'));
    }
  };

  return (
    <div className="container">
      {/* Top Header */}
      <header className="header">
        <div className="brand">
          <div className="logo-badge">
            <Sparkles size={18} />
          </div>
          <h1>ApexDownloader</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className={`btn btn-ghost ${showHistory ? 'active' : ''}`}
            onClick={() => { setShowHistory(!showHistory); setShowSettings(false); }}
            title="Download history"
          >
            <History size={18} />
          </button>
          <button
            className={`btn btn-ghost ${showSettings ? 'active' : ''}`}
            onClick={() => { setShowSettings(!showSettings); setShowHistory(false); }}
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="hero">
        <h2>Download Instagram &amp; Pinterest Media</h2>
        <p>Save high-resolution Reels, Stories, Posts, Profile pictures, and Pinterest Pins instantly.</p>
      </div>

      <AdBanner position="top" />

      {showHistory && (
        <HistoryPanel
          history={history}
          onClose={() => setShowHistory(false)}
          onClear={() => {
            setHistory([]);
            localStorage.removeItem('apex_download_history');
          }}
        />
      )}

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Primary Card */}
      <main className="card">
        {/* Nav tabs */}
        <div className="nav-tabs" role="tablist">
          {PLATFORMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              className={`tab-btn ${activeTab === id ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(id);
                setError(null);
                setInstaMetadata(null);
                setPinMetadata(null);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* URL Input Box */}
        <div className="input-group">
          <div className="input-wrapper">
            <span className="input-icon"><Link2 size={18} /></span>
            <input
              type="text"
              className="input-field"
              placeholder={`Paste an ${activeTab === 'instagram' ? 'Instagram' : 'Pinterest'} link...`}
              value={url}
              onChange={handleUrlChange}
              onKeyDown={(e) => e.key === 'Enter' && fetchDetails()}
            />
            {url ? (
              <button className="input-action-btn" onClick={handleClear} title="Clear text">
                <X size={15} />
              </button>
            ) : (
              <button className="input-action-btn" onClick={handlePaste} title="Paste from clipboard">
                <Clipboard size={14} /> Paste
              </button>
            )}
          </div>
          <button
            className="btn btn-accent btn-fetch"
            onClick={fetchDetails}
            disabled={loading}
          >
            {loading ? <RefreshCw className="spin" size={18} /> : <RefreshCw size={18} />}
            <span>Fetch</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="alert alert-error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Empty State Hints */}
        {!instaMetadata && !pinMetadata && !loading && (
          <div className="hints-grid">
            {EMPTY_HINTS[activeTab]?.map(({ text, Icon }, idx) => (
              <div key={idx} className="hint-card">
                <div className="hint-icon"><Icon size={20} /></div>
                <span>{text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Instagram View */}
        {activeTab === 'instagram' && instaMetadata && (
          <InstagramView
            meta={instaMetadata}
            onDownload={triggerDirectDownload}
            onBatchDownload={(items, prefix) => triggerBatchDownload(items, prefix)}
          />
        )}

        {/* Pinterest View */}
        {activeTab === 'pinterest' && pinMetadata && (
          <PinterestView meta={pinMetadata} onDownload={triggerDirectDownload} />
        )}

        {/* Progress Panel */}
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

  if (meta.type === 'video' || meta.type === 'image' || meta.type === 'story') {
    return (
      <div className="preview">
        <div className="thumb">
          <img src={meta.thumbnailUrl || meta.downloadUrl} alt="Instagram Media" />
        </div>
        <div className="preview-body">
          <span className="eyebrow">Instagram {meta.type.toUpperCase()}</span>
          {meta.username && <h2 className="preview-title">@{meta.username}</h2>}
          {meta.caption && <p className="caption">{meta.caption}</p>}
          <button className="btn btn-accent preview-btn"
            onClick={() => onDownload(meta.downloadUrl, `instagram_${meta.username || 'media'}`, meta.type === 'video' ? 'video' : 'image')}>
            <Download size={17} /> Download {meta.type === 'video' ? 'Video (MP4)' : 'Image (JPG)'}
          </button>
        </div>
      </div>
    );
  }

  if (meta.type === 'carousel' || meta.type === 'stories_list') {
    return (
      <div>
        <div className="section-head" style={{ marginTop: 0 }}>
          <div>
            <span className="eyebrow">Instagram {meta.type === 'carousel' ? 'Carousel Gallery' : 'Stories'}</span>
            <h2 className="preview-title">@{meta.username}</h2>
          </div>
          {meta.items && meta.items.length > 1 && (
            <button className="btn btn-accent" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
              onClick={() => onBatchDownload(meta.items!, `instagram_${meta.username || 'gallery'}`)}>
              <Download size={15} /> Download All ({meta.items.length})
            </button>
          )}
        </div>
        <div className="stories-grid" style={{ marginTop: '1rem' }}>
          {meta.items?.map((item, idx) => (
            <div className="story-card" key={idx}>
              <div className="story-media">
                <img src={item.thumbnailUrl || item.downloadUrl} alt={`Item ${idx + 1}`} />
                {item.type === 'video' && <span className="story-tag">VIDEO</span>}
              </div>
              <button className="btn btn-ghost" style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                onClick={() => onDownload(item.downloadUrl, `instagram_${meta.username || 'item'}_${idx + 1}`, item.type)}>
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
        <span className="eyebrow">Pinterest {String(meta.type).toUpperCase()}</span>
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
    handoff: 'Handed off to your browser',
    completed: 'Complete',
    failed: 'Failed',
  };
  const isDeterminate = status === 'downloading_video' || status === 'downloading_audio';
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
  onClose,
}: {
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
          Instagram requests use server-managed authorization for high-quality extraction.
          Visitors are never asked to paste or store account cookies in this browser.
        </p>
      </div>
    </div>
  );
}

/* ================================================================
   Ad Banner Component
   ================================================================ */
function AdBanner({ position }: { position: 'top' | 'bottom' }) {
  if (!SHOW_ADS) return null;

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
          <p>Direct high-speed media processing without storing your personal browsing data.</p>
        </div>
        <div className="trust-card">
          <div className="trust-icon">
            <Zap size={24} />
          </div>
          <h3>High-Speed Downloads</h3>
          <p>Media is securely fetched in original high resolution for instant download.</p>
        </div>
        <div className="trust-card">
          <div className="trust-icon">
            <LockKeyhole size={24} />
          </div>
          <h3>100% Safe Connection</h3>
          <p>Protected by HTTPS encryption for fast and safe media downloads.</p>
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
      q: 'Can I download Instagram Reels, Stories, and Carousel posts?',
      a: 'Yes! ApexDownloader supports downloading public Instagram posts, Reels, stories, and carousel galleries in full resolution. Simply paste the Instagram link and click Fetch to extract all media instantly.',
    },
    {
      q: 'How to download Pinterest images and videos online?',
      a: 'Select the Pinterest tab, paste the link of the Pin you wish to save, and click Fetch. The downloader extracts the highest resolution direct download URL for the media (including MP4 video files and clean high-resolution JPEGs) so you can save them instantly to your device.',
    },
    {
      q: 'Can I download Instagram Profile Pictures in HD?',
      a: 'Yes, paste an Instagram profile URL or handle, and ApexDownloader will retrieve the full HD profile photo for direct saving.',
    },
    {
      q: 'Are there download limits or charges?',
      a: 'No, ApexDownloader is 100% free with no limits or speed caps!',
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
