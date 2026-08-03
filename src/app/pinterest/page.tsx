"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Link2,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Zap,
  LockKeyhole,
  Clipboard,
  X,
  Video,
  Image as ImageIcon,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { RotatingText } from '@/components/RotatingText';
import { SkeletonLoader } from '@/components/SkeletonLoader';

type DownloadStatus = 'idle' | 'fetching' | 'downloading_video' | 'completed' | 'failed';
type MediaType = 'image' | 'video';

type HistoryItem = {
  id: string;
  title: string;
  platform: string;
  url: string;
  timestamp: number;
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

export default function PinterestPage() {
  const [showHistory, setShowHistory] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meta, setMeta] = useState<PinterestMetadata | null>(null);

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

  const addToHistory = (title: string, downloadUrl: string) => {
    const newItem: HistoryItem = {
      id: String(Date.now()),
      title: title || 'Pinterest Pin',
      platform: 'pinterest',
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

  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    document.body.className = 'theme-pinterest';
    return () => {
      document.body.className = '';
    };
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
      }
    } catch {
      // Permission
    }
  };

  const fetchPinterestDetails = async () => {
    const inputUrl = url.trim();
    if (!inputUrl) {
      setError('Please paste a Pinterest link (pinterest.com or pin.it) first.');
      return;
    }

    setLoading(true);
    setError(null);
    setMeta(null);

    try {
      const res = await fetch(`/api/pinterest?url=${encodeURIComponent(inputUrl)}`);
      const data = (await res.json()) as PinterestMetadata & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to fetch Pinterest pin details');
      setMeta(data);
      setUrl('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'An unexpected error occurred while fetching Pinterest details.'));
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

  const triggerDirectDownload = async (mediaUrl: string, defaultName: string, mediaType: MediaType) => {
    setDownloadStatus('downloading_video');
    setDownloadProgress(0);
    setStatusText('Downloading Pin...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const proxyUrl = `/api/pinterest/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(defaultName)}`;
      const response = await fetch(proxyUrl, { signal: abortController.signal });
      if (!response.ok) throw new Error(`Server returned HTTP ${response.status}`);

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body) {
        const blob = await response.blob();
        const ext = mediaType === 'video' ? 'mp4' : 'jpg';
        triggerBlobDownload(blob, `${defaultName}.${ext}`);
        setDownloadStatus('completed');
        setStatusText('Download completed!');
        addToHistory(defaultName, mediaUrl);
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
          setDownloadSpeed((loadedBytes * 8) / (elapsedSec * 1000 * 1000));
        }
      }

      const blob = new Blob(chunks as BlobPart[]);
      const ext = mediaType === 'video' ? 'mp4' : 'jpg';
      triggerBlobDownload(blob, `${defaultName}.${ext}`);

      setDownloadStatus('completed');
      setStatusText('Download completed successfully!');
      addToHistory(defaultName, mediaUrl);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setDownloadStatus('failed');
      setError(getErrorMessage(error, 'Download request failed.'));
    }
  };

  return (
    <div className="container pin-theme">
      <Header
        showHistory={showHistory}
        setShowHistory={setShowHistory}
      />

      <div className="hero pin-hero">
        <h1>Pinterest Video &amp; Image Downloader</h1>
        <div className="hero-subtitle-rotating">
          <span>Your downloads,</span>
          <RotatingText
            words={['Original 4K Quality.', 'Video & Image Pins.', 'Zero Cost.', '100% Safe.', 'Fast Downloads.']}
            interval={1450}
          />
        </div>
      </div>

      {showHistory && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="section-head" style={{ marginTop: 0 }}>
            <div className="section-title">Recent Pinterest Downloads ({history.length})</div>
            <button className="btn btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              onClick={() => { setHistory([]); localStorage.removeItem('apex_download_history'); }}>
              Clear History
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {history.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.title}</span>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="input-action-btn">Re-open</a>
              </div>
            ))}
          </div>
        </div>
      )}


      <main className="card">
        <div className="input-group">
          <div className="input-wrapper">
            <span className="input-icon"><Link2 size={18} /></span>
            <input
              type="text"
              className="input-field"
              placeholder="Paste Pinterest link (pinterest.com/pin/... or pin.it/...)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchPinterestDetails()}
            />
            {url ? (
              <button className="input-action-btn" onClick={() => setUrl('')} title="Clear">
                <X size={15} />
              </button>
            ) : (
              <button className="input-action-btn" onClick={handlePaste} title="Paste from clipboard">
                <Clipboard size={14} /> Paste
              </button>
            )}
          </div>
          <button className="btn btn-accent" onClick={fetchPinterestDetails} disabled={loading}>
            {loading ? <RefreshCw className="spin" size={18} /> : <RefreshCw size={18} />}
            <span>Fetch</span>
          </button>
        </div>

        {error && (
          <div style={{ padding: '0.9rem 1.1rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', color: '#fca5a5', display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1.5rem', fontSize: '0.92rem' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {loading && <SkeletonLoader />}

        {!meta && !loading && (
          <div className="hints-grid">
            <div className="hint-card"><div className="hint-icon"><Video size={20} /></div><span>Full HD Video Pins (MP4)</span></div>
            <div className="hint-card"><div className="hint-icon"><ImageIcon size={20} /></div><span>Original Quality Image Pins</span></div>
            <div className="hint-card"><div className="hint-icon"><ImageIcon size={20} /></div><span>Animated GIF Support</span></div>
            <div className="hint-card"><div className="hint-icon"><Link2 size={20} /></div><span>pinterest.com or pin.it</span></div>
          </div>
        )}

        {meta && (
          <div className="preview">
            <div className="thumb">
              {meta.type === 'video' ? (
                <video
                  src={meta.downloadUrl}
                  poster={meta.thumbnailUrl || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <img
                  src={meta.thumbnailUrl || meta.downloadUrl}
                  alt={meta.title}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              )}
            </div>
            <div className="preview-body">
              <span className="eyebrow">Pinterest {meta.type.toUpperCase()} PIN</span>
              <h2 className="preview-title">{meta.title}</h2>
              {meta.description && <p className="caption">{meta.description}</p>}
              <button className="btn btn-accent" style={{ marginTop: '0.75rem', alignSelf: 'flex-start' }}
                onClick={() => triggerDirectDownload(meta.downloadUrl, 'pinterest_pin', meta.type)}>
                <Download size={17} /> Download Original ({meta.type === 'video' ? 'MP4 Video' : 'HD Photo'})
              </button>
            </div>
          </div>
        )}

        {downloadStatus !== 'idle' && (
          <div className="progress">
            <div className="progress-top">
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                {downloadStatus === 'completed' ? 'Download Finished!' : downloadStatus === 'failed' ? 'Download Failed' : 'Downloading Pin...'}
              </span>
              {downloadProgress > 0 && <span style={{ fontWeight: 700, color: 'var(--pin-red)' }}>{downloadProgress}%</span>}
            </div>
            <div className="bar">
              <div className="bar-fill" style={{ width: downloadStatus === 'completed' || downloadStatus === 'failed' ? '100%' : `${downloadProgress}%` }} />
            </div>
            <div className="progress-stats">
              <span>{statusText}</span>
              {downloadSpeed > 0 && <span>{downloadSpeed.toFixed(1)} Mbps</span>}
            </div>
          </div>
        )}
      </main>

      <TrustSection />
      <FaqSection />
      <Footer />
    </div>
  );
}

function TrustSection() {
  return (
    <section className="trust-section">
      <div className="trust-grid">
        <div className="trust-card">
          <div className="trust-icon"><ShieldCheck size={24} /></div>
          <h3>Private &amp; Secure</h3>
          <p>Download Pinterest media safely without saving personal tracking data.</p>
        </div>
        <div className="trust-card">
          <div className="trust-icon"><Zap size={24} /></div>
          <h3>Uncompressed Resolution</h3>
          <p>Saves original full-size Video Pins and maximum quality photo assets.</p>
        </div>
        <div className="trust-card">
          <div className="trust-icon"><LockKeyhole size={24} /></div>
          <h3>100% Safe Connection</h3>
          <p>Protected by HTTPS encryption for fast and secure file saving.</p>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqData = [
    {
      q: 'How to download Pinterest Video Pins in Full HD?',
      a: 'Copy the Pinterest Video Pin URL, paste it into ApexDownloader, and press Fetch. Click Download Original to save the MP4 video directly to your phone or computer.',
    },
    {
      q: 'Can I download short pin links (pin.it)?',
      a: 'Yes! ApexDownloader automatically follows short pin.it links to retrieve the full original media.',
    },
    {
      q: 'Does it download maximum resolution photos?',
      a: 'Yes, ApexDownloader extracts the uncompressed original JPEG/PNG image direct from Pinterest CDN servers.',
    },
  ];

  return (
    <section className="faq-section">
      <h2 className="faq-heading">Frequently Asked Questions</h2>
      <div className="faq-container">
        {faqData.map(({ q, a }, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className={`faq-card ${isOpen ? 'open' : ''}`}
              onClick={() => setOpenIndex(isOpen ? null : i)}
            >
              <div className="faq-card-header">
                <span className="faq-question-text">{q}</span>
                <ChevronDown className={`faq-chevron ${isOpen ? 'rotate' : ''}`} size={18} />
              </div>
              {isOpen && (
                <div className="faq-card-body">
                  <p>{a}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
