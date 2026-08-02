"use client";

import React, { useState, useEffect } from 'react';

export function ApexMorphLogo({ size = 32 }: { size?: number }) {
  // state: 0 = Apex 'A' with Infinity 8 Loop, 1 = Apex 'A' morphed into Download Symbol
  const [isDownloadState, setIsDownloadState] = useState(false);

  useEffect(() => {
    // 3.0 seconds stay time before morphing
    const interval = setInterval(() => {
      setIsDownloadState((prev) => !prev);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="apex-authentic-logo-wrapper" title="ApexDownloader">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`apex-authentic-svg ${isDownloadState ? 'state-download' : 'state-infinity'}`}
        aria-hidden="true"
      >
        {/* === ALWAYS PRESENT: Authentic Apex 'A' Outer Frame (From Reference Image) === */}
        <path
          d="M12 1.5 L1.5 19.5 h5.2 L12 9.5 L17.3 19.5 H22.5 Z"
          className="apex-outer-frame"
          fill="currentColor"
          fillOpacity="0.2"
          stroke="currentColor"
          strokeWidth="2"
        />

        {/* === INNER MORPHING STATE 1: High-Visibility Figure-8 Infinity Loop (∞) === */}
        <g className="inner-infinity-group">
          <path
            d="M12 12.5c-1.8-1.8-4-2.5-5.5-1s-1.5 4 0.5 5.2 5-1.2 5-2.2c0-1 3.2-3.8 5-2.2s2 4.2-0.5 5.2S12 13.5 12 12.5z"
            className="infinity-8-path"
            strokeWidth="2.2"
            stroke="#FFFFFF"
          />
        </g>

        {/* === INNER MORPHING STATE 2: High-Visibility Download Arrow Symbol (↓) === */}
        <g className="inner-download-group">
          {/* Central Down Arrow Stem */}
          <path d="M12 5.5 v9.5" strokeWidth="2.6" stroke="#FFFFFF" />
          {/* Arrowhead Chevron */}
          <path d="m8 11.5 4 4 4-4" strokeWidth="2.6" stroke="#FFFFFF" />
          {/* Bottom Media Tray */}
          <path d="M6 19 h12" strokeWidth="2.4" stroke="#FFFFFF" />
        </g>
      </svg>
    </div>
  );
}
