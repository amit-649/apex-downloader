"use client";

import React, { useState, useEffect } from 'react';

export function ApexMorphLogo({ size = 24 }: { size?: number }) {
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
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`apex-authentic-svg ${isDownloadState ? 'state-download' : 'state-infinity'}`}
        aria-hidden="true"
      >
        {/* === ALWAYS PRESENT: Authentic Apex 'A' Outer Frame (From Reference Image) === */}
        <path
          d="M12 2 L2 18 h4.5 L12 9.5 L17.5 18 H22 Z"
          className="apex-outer-frame"
          fill="currentColor"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="1.6"
        />

        {/* === INNER MORPHING STATE 1: Figure-8 Infinity Loop (∞) === */}
        <g className="inner-infinity-group">
          <path
            d="M12 12c-1.8-1.8-4-2.5-5.5-1s-1.5 4 0.5 5.2 5-1.2 5-2.2c0-1 3.2-3.8 5-2.2s2 4.2-0.5 5.2S12 13 12 12z"
            className="infinity-8-path"
            strokeWidth="1.6"
          />
        </g>

        {/* === INNER MORPHING STATE 2: Download Arrow Symbol (↓) === */}
        <g className="inner-download-group">
          {/* Central Down Arrow Stem */}
          <path d="M12 6.5 v8.5" strokeWidth="2.2" />
          {/* Arrowhead Chevron */}
          <path d="m8.5 11.5 3.5 3.5 3.5-3.5" strokeWidth="2.2" />
          {/* Bottom Media Tray */}
          <path d="M7 18.5 h10" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}
