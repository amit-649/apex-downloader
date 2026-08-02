"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Link2,
  RefreshCw,
  AlertCircle,
  Clapperboard,
  Image as ImageIcon,
  ShieldCheck,
  Zap,
  LockKeyhole,
  Clipboard,
  X,
  AudioLines,
  User,
  Sparkles,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { RotatingText } from '@/components/RotatingText';

type DownloadStatus = 'idle' | 'fetching' | 'downloading_video' | 'downloading_audio' | 'completed' | 'failed';
type MediaType = 'image' | 'video';

type HistoryItem = {
  id: string;
  title: string;
  platform: string;
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function InstagramPage() {
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [meta, setMeta] = useState<InstagramMetadata | null>(null);

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
      title: title || 'Instagram Media',
      platform: 'instagram',
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
    document.body.className = 'theme-instagram';
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

  const fetchInstagramDetails = async () => {
    const inputUrl = url.trim();
    if (!inputUrl) {
      setError('Please paste an Instagram Reel, Story, Post, or Profile link first.');
      return;
    }

    setLoading(true);
    setError(null);
    setMeta(null);

    try {
      const res = await fetch(`/api/instagram?url=${encodeURIComponent(inputUrl)}`);
      const data = (await res.json()) as InstagramMetadata & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to fetch Instagram media');
      setMeta(data);
      setUrl('');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'An unexpected error occurred while extracting Instagram media.'));
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

  const triggerDirectDownload = async (mediaUrl: string, defaultName: string, mediaType: MediaType | 'audio') => {
    setDownloadStatus(mediaType === 'audio' ? 'downloading_audio' : 'downloading_video');
    setDownloadProgress(0);
    setStatusText('Downloading media...');

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
        const ext = mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'mp3' : 'jpg';
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
      const ext = mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'mp3' : 'jpg';
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

  const triggerBatchDownload = async (items: Array<{ downloadUrl: string; isVideo?: boolean; type?: string; id?: string }>, prefix: string) => {
    setDownloadStatus('downloading_video');
    setDownloadProgress(0);
    setStatusText(`Downloading ${items.length} files...`);

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
      setStatusText(`Successfully saved ${items.length} media items!`);
    } catch (error: unknown) {
      setDownloadStatus('failed');
      setError(getErrorMessage(error, 'Batch download failed.'));
    }
  };

  return (
    <div className="container">
      <Header
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
      />

      <div className="hero insta-hero">
        <div className="hero-badge">
          <Sparkles size={13} />
          <span>#1 Free Instagram Downloader • 1080p Full HD</span>
        </div>
        <h1>Instagram Video &amp; Story Downloader</h1>
        <div className="hero-subtitle-rotating">
          <span>Your downloads,</span>
          <RotatingText
            words={['100% Private.', 'Full HD 1080p.', 'Zero Cost.', 'Always Fast.', 'No Login Required.']}
            interval={1450}
          />
        </div>
      </div>

      {showHistory && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="section-head" style={{ marginTop: 0 }}>
            <div className="section-title">Recent Instagram Downloads ({history.length})</div>
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

      {showSettings && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="section-title" style={{ marginBottom: '0.5rem' }}>Instagram Extraction Authorization</div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            High-speed Instagram media downloads are processed securely via server-managed session credentials without storing data in your browser.
          </p>
        </div>
      )}

      <main className="card">
        <div className="input-group">
          <div className="input-wrapper">
            <span className="input-icon"><Link2 size={18} /></span>
            <input
              type="text"
              className="input-field"
              placeholder="Paste Instagram Reel, Story, Post or Profile link..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchInstagramDetails()}
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
          <button className="btn btn-accent" onClick={fetchInstagramDetails} disabled={loading}>
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

        {!meta && !loading && (
          <div className="hints-grid">
            <div className="hint-card"><div className="hint-icon"><Clapperboard size={20} /></div><span>Reels (1080p MP4)</span></div>
            <div className="hint-card"><div className="hint-icon"><ImageIcon size={20} /></div><span>Stories &amp; Highlights</span></div>
            <div className="hint-card"><div className="hint-icon"><ImageIcon size={20} /></div><span>Carousel Galleries</span></div>
            <div className="hint-card"><div className="hint-icon"><User size={20} /></div><span>HD Profile Pictures</span></div>
          </div>
        )}

        {meta && (
          <div>
            {meta.type === 'profile_pic' && (
              <div className="preview" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div className="thumb thumb-round">
                  <img src={meta.downloadUrl} alt={meta.username} />
                </div>
                <div className="preview-body" style={{ alignItems: 'center' }}>
                  <span className="eyebrow">Instagram Profile</span>
                  <h2 className="preview-title">@{meta.username}</h2>
                  {meta.fullName && <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{meta.fullName}</p>}
                  {meta.biography && <p className="caption" style={{ textAlign: 'center', maxWidth: '28rem' }}>{meta.biography}</p>}
                  {meta.followers && <p style={{ fontWeight: 700, marginTop: '0.25rem' }}>{Number(meta.followers).toLocaleString()} followers</p>}
                  <button className="btn btn-accent" style={{ marginTop: '1rem' }}
                    onClick={() => triggerDirectDownload(meta.downloadUrl, `pfp_${meta.username}`, 'image')}>
                    <Download size={17} /> Download HD Profile Photo
                  </button>
                </div>
              </div>
            )}

            {(meta.type === 'video' || meta.type === 'image' || meta.type === 'story') && (
              <div className="preview">
                <div className="thumb">
                  <img src={meta.thumbnailUrl || meta.downloadUrl} alt="Instagram Media" />
                </div>
                <div className="preview-body">
                  <span className="eyebrow">Instagram {meta.type.toUpperCase()}</span>
                  {meta.username && <h2 className="preview-title">@{meta.username}</h2>}
                  {meta.caption && <p className="caption">{meta.caption}</p>}

                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    <button className="btn btn-accent" onClick={() => triggerDirectDownload(meta.downloadUrl, `instagram_${meta.username || 'media'}`, meta.type === 'video' ? 'video' : 'image')}>
                      <Download size={17} /> Save {meta.type === 'video' ? 'Video (MP4)' : 'Image (JPG)'}
                    </button>
                    {meta.type === 'video' && (
                      <button className="btn btn-ghost" onClick={() => triggerDirectDownload(meta.downloadUrl, `reel_audio_${meta.username || 'sound'}`, 'audio')}>
                        <AudioLines size={16} /> Extract Reel Audio (MP3)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {(meta.type === 'carousel' || meta.type === 'stories_list') && (
              <div>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <div>
                    <span className="eyebrow">Instagram {meta.type === 'carousel' ? 'Carousel Gallery' : 'Stories'}</span>
                    <h2 className="preview-title">@{meta.username}</h2>
                  </div>
                  {meta.items && meta.items.length > 1 && (
                    <button className="btn btn-accent" style={{ padding: '0.55rem 1.1rem', fontSize: '0.88rem' }}
                      onClick={() => triggerBatchDownload(meta.items!, `instagram_${meta.username || 'gallery'}`)}>
                      <Download size={16} /> Download All ({meta.items.length})
                    </button>
                  )}
                </div>
                <div className="stories-grid">
                  {meta.items?.map((item, idx) => (
                    <div className="story-card" key={idx}>
                      <div className="story-media">
                        <img src={item.thumbnailUrl || item.downloadUrl} alt={`Item ${idx + 1}`} />
                        {item.type === 'video' && <span className="story-tag">VIDEO</span>}
                      </div>
                      <button className="btn btn-ghost" style={{ padding: '0.45rem', fontSize: '0.82rem' }}
                        onClick={() => triggerDirectDownload(item.downloadUrl, `instagram_${meta.username || 'item'}_${idx + 1}`, item.type)}>
                        <Download size={14} /> Save {item.type === 'video' ? 'Video' : 'Image'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {downloadStatus !== 'idle' && (
          <div className="progress">
            <div className="progress-top">
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                {downloadStatus === 'completed' ? 'Download Finished!' : downloadStatus === 'failed' ? 'Download Failed' : 'Downloading Media...'}
              </span>
              {downloadProgress > 0 && <span style={{ fontWeight: 700, color: 'var(--insta-pink)' }}>{downloadProgress}%</span>}
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
          <p>Direct media extraction with no personal login required.</p>
        </div>
        <div className="trust-card">
          <div className="trust-icon"><Zap size={24} /></div>
          <h3>Full HD Downloads</h3>
          <p>Download original 1080p Reels, full quality Stories, and uncompressed Photos.</p>
        </div>
        <div className="trust-card">
          <div className="trust-icon"><LockKeyhole size={24} /></div>
          <h3>100% Safe Connection</h3>
          <p>Encrypted HTTPS delivery directly to your device.</p>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const faqData = [
    {
      q: 'How to download Instagram Reels in 1080p Full HD?',
      a: 'Paste the link of the Instagram Reel into ApexDownloader and click Fetch. You will instantly get a direct download link for the original 1080p MP4 video.',
    },
    {
      q: 'Can I download Instagram Stories and Story Highlights?',
      a: 'Yes! Enter an Instagram username or story link to view and save active stories or batch-download full story highlights.',
    },
    {
      q: 'How to download Instagram Carousel multi-slide posts?',
      a: 'When you paste a carousel link, ApexDownloader extracts all images and videos into a gallery with a "Download All" option.',
    },
    {
      q: 'Can I save high resolution Instagram profile photos?',
      a: 'Yes, paste the profile URL to extract the original HD profile avatar.',
    },
  ];

  return (
    <section className="faq-section">
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
