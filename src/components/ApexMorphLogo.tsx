"use client";

import React, { useRef, useEffect } from 'react';

export function ApexMorphLogo({ size = 44 }: { size?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay policy fallback
      });
    }
  }, []);

  return (
    <div className="apex-brand-video-wrapper" style={{ width: size, height: size }}>
      <video
        ref={videoRef}
        src="/brand-logo.mp4"
        autoPlay
        loop
        muted
        playsInline
        aria-label="ApexDownloader Logo Animation"
        className="apex-brand-video"
      />
    </div>
  );
}
