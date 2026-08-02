"use client";

import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="footer">
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
          Instagram Downloader
        </Link>
        <Link href="/pinterest" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
          Pinterest Downloader
        </Link>
      </div>
      <p>© {new Date().getFullYear()} ApexDownloader. All rights reserved.</p>
    </footer>
  );
}
