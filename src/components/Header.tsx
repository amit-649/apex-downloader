"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { History, Settings } from 'lucide-react';
import { ApexCanvasLogo } from './ApexCanvasLogo';

const InstagramIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const PinterestIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 11.2c0 3 1.6 5.2 3.4 5.2 1 0 1.6-.8 1.6-2 0-1.3-.7-3.2-.7-4.4 0-1 .6-1.9 1.7-1.9 2 0 3.2 2 3.2 4.3 0 2.8-1.6 5-4 5" />
    <path d="M12 8.5c-.4 2-1 4.4-1.4 6.2-.4 1.7-.6 3.4-.4 5.3" />
    <circle cx="12" cy="12" r="10" />
  </svg>
);

export function Header({
  showHistory,
  setShowHistory,
  showSettings,
  setShowSettings,
}: {
  showHistory: boolean;
  setShowHistory: (val: boolean) => void;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
}) {
  const pathname = usePathname();
  const isPinterest = pathname.startsWith('/pinterest');
  const activeClass = isPinterest ? 'active-pin' : 'active-insta';

  return (
    <header className="site-header">
      <Link href={isPinterest ? '/pinterest' : '/'} className="brand-link">
        <div className={`brand-logo ${isPinterest ? 'pin-logo' : ''}`}>
          <ApexCanvasLogo size={46} />
        </div>
        <span className="brand-title">ApexDownloader</span>
      </Link>

      <nav className="nav-links">
        <Link
          href="/"
          className={`nav-link ${!isPinterest ? 'active-insta' : ''}`}
        >
          <InstagramIcon size={16} />
          <span>Instagram</span>
        </Link>
        <Link
          href="/pinterest"
          className={`nav-link ${isPinterest ? 'active-pin' : ''}`}
        >
          <PinterestIcon size={16} />
          <span>Pinterest</span>
        </Link>
      </nav>

      <div className="header-actions">
        <button
          className={`icon-btn ${showHistory ? activeClass : ''}`}
          onClick={() => { setShowHistory(!showHistory); setShowSettings(false); }}
          title="Download History"
          aria-label="Download History"
        >
          <History size={18} />
        </button>
        <button
          className={`icon-btn ${showSettings ? activeClass : ''}`}
          onClick={() => { setShowSettings(!showSettings); setShowHistory(false); }}
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </header>
  );
}
