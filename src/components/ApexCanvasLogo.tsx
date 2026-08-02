"use client";

import React, { useState, useEffect } from 'react';

export function ApexCanvasLogo({ size = 44 }: { size?: number }) {
  // state: 0 = Apex 'A', 1 = Infinity 8 Loop, 2 = Download Arrow
  const [activeState, setActiveState] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    // Cycles every 2.8 seconds: Apex A (0) -> Infinity 8 (1) -> Download Arrow (2) -> repeat
    const interval = setInterval(() => {
      setActiveState((prev) => ((prev + 1) % 3) as 0 | 1 | 2);
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  // 100% Mathematically Symmetrical Lemniscate Infinity Symbol Path
  const infinityPath = "M 12 12 C 9.2 7.5, 3.8 7.5, 3.8 12 C 3.8 16.5, 9.2 16.5, 12 12 C 14.8 7.5, 20.2 7.5, 20.2 12 C 20.2 16.5, 14.8 16.5, 12 12 Z";

  return (
    <div className="apex-crisp-logo-container" style={{ width: size, height: size }} title="ApexDownloader">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`apex-vector-logo ${
          activeState === 0 ? 'state-0-apex' : activeState === 1 ? 'state-1-infinity' : 'state-2-download'
        }`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="neonBrandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF007A" />
            <stop offset="50%" stopColor="#E60023" />
            <stop offset="100%" stopColor="#7928CA" />
          </linearGradient>

          <filter id="neonBlurGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* === SHAPE 0: Authentic Apex 'A' Chevron Frame (Frame 00:00) === */}
        <g className="vector-shape shape-apex">
          <path
            d="M12 2 L2.2 18 h4.8 L12 9.5 L17 18 H21.8 Z"
            fill="url(#neonBrandGrad)"
            fillOpacity="0.25"
            stroke="url(#neonBrandGrad)"
            strokeWidth="2"
            filter="url(#neonBlurGlow)"
          />
          <path d="M12 9.5 L7 18 h10 Z" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
        </g>

        {/* === SHAPE 1: Perfectly Symmetrical Infinity 8 Symbol (Frame 00:03) === */}
        <g className="vector-shape shape-infinity">
          <path
            d={infinityPath}
            stroke="url(#neonBrandGrad)"
            strokeWidth="2.6"
            fill="none"
            filter="url(#neonBlurGlow)"
          />
          <path
            d={infinityPath}
            stroke="#FFFFFF"
            strokeWidth="1.3"
            fill="none"
          />
        </g>

        {/* === SHAPE 2: Perfect Sharp Download Arrow + Tray (Frame 00:08) === */}
        <g className="vector-shape shape-download">
          {/* Arrow Stem */}
          <path d="M12 3.5 v10.5" stroke="url(#neonBrandGrad)" strokeWidth="2.8" filter="url(#neonBlurGlow)" />
          <path d="M12 3.5 v10.5" stroke="#FFFFFF" strokeWidth="1.4" />
          {/* Arrowhead Chevron */}
          <path d="m7.5 10.5 4.5 4.5 4.5-4.5" stroke="url(#neonBrandGrad)" strokeWidth="2.8" filter="url(#neonBlurGlow)" />
          <path d="m7.5 10.5 4.5 4.5 4.5-4.5" stroke="#FFFFFF" strokeWidth="1.4" />
          {/* Bottom Tray Line */}
          <path d="M5 19.5 h14" stroke="url(#neonBrandGrad)" strokeWidth="2.5" filter="url(#neonBlurGlow)" />
          <path d="M5 19.5 h14" stroke="#FFFFFF" strokeWidth="1.3" />
        </g>
      </svg>
    </div>
  );
}
