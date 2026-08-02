"use client";

import React, { useState, useEffect } from 'react';

export function ApexMorphLogo({ size = 22 }: { size?: number }) {
  // state: 'letterA' | 'download'
  const [isDownloadSymbol, setIsDownloadSymbol] = useState(false);

  useEffect(() => {
    // Toggles every 3 seconds (3000ms)
    const interval = setInterval(() => {
      setIsDownloadSymbol((prev) => !prev);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="morph-logo-wrapper" title="ApexDownloader">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`morph-logo-svg ${isDownloadSymbol ? 'state-download' : 'state-a'}`}
        aria-hidden="true"
      >
        {/* === LAYER 1: Apex Letter "A" Monogram Paths === */}
        <g className="path-group-a">
          {/* Left leg of A */}
          <path d="M12 3 L5 18" />
          {/* Right leg of A */}
          <path d="M12 3 L19 18" />
          {/* A Crossbar */}
          <path d="M8 12.5 h8" />
          {/* Bottom Tray Anchor */}
          <path d="M4 20 h16" />
        </g>

        {/* === LAYER 2: Download Arrow Symbol Paths === */}
        <g className="path-group-download">
          {/* Vertical Downward Shaft */}
          <path d="M12 3 v12.5" />
          {/* Downward Arrowhead Chevron */}
          <path d="M6.5 11.5 L12 16.5 L17.5 11.5" />
          {/* Bottom Download Tray */}
          <path d="M4 20 h16" />
        </g>
      </svg>
    </div>
  );
}
