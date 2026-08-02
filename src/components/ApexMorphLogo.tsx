"use client";

import React, { useState, useEffect } from 'react';

export function ApexMorphLogo({ size = 22 }: { size?: number }) {
  // state: 'apexA' | 'download'
  const [isDownloadSymbol, setIsDownloadSymbol] = useState(false);

  useEffect(() => {
    // Toggles state every 3 seconds (3000ms)
    const interval = setInterval(() => {
      setIsDownloadSymbol((prev) => !prev);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="apex-morph-wrapper" title="ApexDownloader">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`apex-morph-svg ${isDownloadSymbol ? 'state-download' : 'state-apex-a'}`}
        aria-hidden="true"
      >
        {/* === STATE 1: Iconic Apex 'A' Monogram (From Reference) === */}
        <g className="shape-apex-a">
          {/* Main Sharp Apex A Chevron Monogram */}
          <path d="M12 2.5 L2.5 17.5 H7.5 L12 10 L16.5 17.5 H21.5 Z" />
        </g>

        {/* === STATE 2: High-Speed Download Symbol (↓) === */}
        <g className="shape-download">
          {/* Downward Arrow Stem */}
          <path d="M10.25 3 H13.75 V11 H17.5 L12 17 L6.5 11 H10.25 Z" />
          {/* Bottom Media Tray */}
          <rect x="4" y="19" width="16" height="2.8" rx="1.4" />
        </g>
      </svg>
    </div>
  );
}
