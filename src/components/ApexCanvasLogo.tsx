"use client";

import React, { useState, useEffect } from 'react';

export function ApexCanvasLogo({ size = 36, isPinterest = false }: { size?: number; isPinterest?: boolean }) {
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

  const gradId = isPinterest ? "pinBrandGrad" : "instaBrandGrad";

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
        style={{ overflow: 'visible' }}
        className={`apex-vector-logo ${
          activeState === 0 ? 'state-0-apex' : activeState === 1 ? 'state-1-infinity' : 'state-2-download'
        }`}
        aria-hidden="true"
      >
        <defs>
          {isPinterest ? (
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF4D6D" />
              <stop offset="50%" stopColor="#E60023" />
              <stop offset="100%" stopColor="#B3001B" />
            </linearGradient>
          ) : (
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF007A" />
              <stop offset="50%" stopColor="#E60023" />
              <stop offset="100%" stop-color="#7928CA" />
            </linearGradient>
          )}
        </defs>

        {/* === SHAPE 0: Authentic Apex 'A' Chevron Frame === */}
        <g className="vector-shape shape-apex">
          <path
            d="M12 2 L2.2 18 h4.8 L12 9.5 L17 18 H21.8 Z"
            fill={`url(#${gradId})`}
            fillOpacity="0.2"
            stroke={`url(#${gradId})`}
            strokeWidth="2.2"
          />
          <path d="M12 9.5 L7 18 h10 Z" fill="none" stroke="#E60023" strokeWidth="1.5" />
        </g>

        {/* === SHAPE 1: Perfectly Symmetrical Infinity 8 Symbol === */}
        <g className="vector-shape shape-infinity">
          <path
            d={infinityPath}
            stroke={`url(#${gradId})`}
            strokeWidth="2.6"
            fill="none"
          />
        </g>

        {/* === SHAPE 2: Full Sharp Download Arrow Stem + Arrowhead + Tray Line === */}
        <g className="vector-shape shape-download">
          {/* Vertical Shaft */}
          <path d="M12 2.5 V13.5" stroke={`url(#${gradId})`} strokeWidth="2.6" />
          {/* Arrowhead Chevron */}
          <path d="M7 9 L12 14 L17 9" stroke={`url(#${gradId})`} strokeWidth="2.6" />
          {/* Bottom Media Tray */}
          <path d="M4.5 19.5 H19.5" stroke={`url(#${gradId})`} strokeWidth="2.6" />
        </g>
      </svg>
    </div>
  );
}
