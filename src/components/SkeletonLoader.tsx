"use client";

import React from 'react';

export function SkeletonLoader() {
  return (
    <div className="skeleton-container" aria-label="Extracting media...">
      <div className="skeleton-media"></div>
      <div className="skeleton-content">
        <div className="skeleton-line skeleton-title"></div>
        <div className="skeleton-line skeleton-sub"></div>
        <div className="skeleton-btn"></div>
      </div>
    </div>
  );
}
