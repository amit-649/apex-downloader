"use client";

import React, { useRef, useEffect } from 'react';

interface Point {
  x: number;
  y: number;
}

// 80 High-Density Control Points for Organic Spline Morphing
const NUM_POINTS = 80;

// Shape 1: Authentic Apex 'A' Chevron Frame (Matching Video Frame 00:00)
function generateApexAShape(): Point[] {
  const points: Point[] = [];
  // Smooth continuous outline of the sharp Apex A chevron
  const keyNodes: Point[] = [
    { x: 0.50, y: 0.12 }, // Apex Peak
    { x: 0.12, y: 0.84 }, // Outer Left Base
    { x: 0.32, y: 0.84 }, // Inner Left Notch
    { x: 0.50, y: 0.46 }, // Inner Peak Cutout
    { x: 0.68, y: 0.84 }, // Inner Right Notch
    { x: 0.88, y: 0.84 }, // Outer Right Base
    { x: 0.50, y: 0.12 }, // Back to Peak
  ];

  for (let i = 0; i < keyNodes.length - 1; i++) {
    const p1 = keyNodes[i];
    const p2 = keyNodes[i + 1];
    const steps = Math.floor(NUM_POINTS / (keyNodes.length - 1));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      points.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      });
    }
  }
  while (points.length < NUM_POINTS) {
    points.push({ ...keyNodes[keyNodes.length - 1] });
  }
  return points;
}

// Shape 2: Continuous Lemniscate Infinity 8 Loop (Matching Video Frame 00:03)
function generateInfinityShape(): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    const t = (i / NUM_POINTS) * Math.PI * 2;
    const scale = 0.38;
    const denominator = 1 + Math.sin(t) * Math.sin(t);
    const x = 0.50 + (scale * Math.cos(t)) / denominator;
    const y = 0.50 + (scale * Math.sin(t) * Math.cos(t)) / denominator;
    points.push({ x, y });
  }
  return points;
}

// Shape 3: Clean, Perfect Download Arrow + Tray (Matching Video Frame 00:08)
function generateDownloadShape(): Point[] {
  const points: Point[] = [];
  // Continuous smooth path forming a crisp Download Arrow + Tray
  const keyNodes: Point[] = [
    { x: 0.50, y: 0.14 }, // Arrow Shaft Top
    { x: 0.50, y: 0.58 }, // Arrow Shaft Base
    { x: 0.26, y: 0.38 }, // Left Chevron Wing
    { x: 0.50, y: 0.62 }, // Chevron Tip Point
    { x: 0.74, y: 0.38 }, // Right Chevron Wing
    { x: 0.50, y: 0.62 }, // Back to Tip Point
    { x: 0.50, y: 0.76 }, // Connector to Tray
    { x: 0.18, y: 0.82 }, // Tray Left End
    { x: 0.82, y: 0.82 }, // Tray Right End
    { x: 0.50, y: 0.14 }, // Back to Top
  ];

  for (let i = 0; i < keyNodes.length - 1; i++) {
    const p1 = keyNodes[i];
    const p2 = keyNodes[i + 1];
    const steps = Math.floor(NUM_POINTS / (keyNodes.length - 1));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      points.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      });
    }
  }
  while (points.length < NUM_POINTS) {
    points.push({ ...keyNodes[keyNodes.length - 1] });
  }
  return points;
}

export function ApexCanvasLogo({ size = 48 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpi = window.devicePixelRatio || 2;
    canvas.width = size * dpi;
    canvas.height = size * dpi;

    const shapeA = generateApexAShape();
    const shapeInf = generateInfinityShape();
    const shapeDl = generateDownloadShape();

    let animationFrameId: number;
    let startTime: number | null = null;
    const cycleDuration = 9000; // 9-second full smooth cycle matching video

    // Smooth Cubic Easing for Fluid Organic Morphing
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const render = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = (timestamp - startTime) % cycleDuration;
      const tSec = elapsed / 1000;

      let fromShape: Point[] = shapeA;
      let toShape: Point[] = shapeInf;
      let progress = 0;

      if (tSec < 2.0) {
        // Hold Apex A
        fromShape = shapeA;
        toShape = shapeA;
        progress = 0;
      } else if (tSec < 3.8) {
        // Morph Apex A -> Infinity 8 Loop
        fromShape = shapeA;
        toShape = shapeInf;
        progress = easeInOutCubic((tSec - 2.0) / 1.8);
      } else if (tSec < 5.8) {
        // Hold Infinity 8 Loop
        fromShape = shapeInf;
        toShape = shapeInf;
        progress = 0;
      } else if (tSec < 7.6) {
        // Morph Infinity 8 Loop -> Download Arrow
        fromShape = shapeInf;
        toShape = shapeDl;
        progress = easeInOutCubic((tSec - 5.8) / 1.8);
      } else if (tSec < 8.4) {
        // Hold Download Arrow
        fromShape = shapeDl;
        toShape = shapeDl;
        progress = 0;
      } else {
        // Morph Download Arrow -> Apex A
        fromShape = shapeDl;
        toShape = shapeA;
        progress = easeInOutCubic((tSec - 8.4) / 0.6);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Create glowing neon linear gradient matching video (#FF007A -> #E60023 -> #7928CA)
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#FF007A');
      grad.addColorStop(0.5, '#E60023');
      grad.addColorStop(1, '#7928CA');

      ctx.save();
      ctx.scale(dpi, dpi);

      // Compute interpolated point positions with spiral curvature wave for liquid feel
      const currentPoints: Point[] = [];
      for (let i = 0; i < NUM_POINTS; i++) {
        const x1 = fromShape[i].x;
        const y1 = fromShape[i].y;
        const x2 = toShape[i].x;
        const y2 = toShape[i].y;

        // Fluid spiral wave offset during morphing
        const wave = Math.sin(progress * Math.PI) * 0.02 * Math.sin((i / NUM_POINTS) * Math.PI * 4);

        currentPoints.push({
          x: (lerp(x1, x2, progress) + wave) * size,
          y: (lerp(y1, y2, progress) + wave) * size,
        });
      }

      // Outer Neon Glow Pass
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#FF007A';
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < NUM_POINTS; i++) {
        const xc = (currentPoints[i].x + currentPoints[i - 1].x) / 2;
        const yc = (currentPoints[i].y + currentPoints[i - 1].y) / 2;
        ctx.quadraticCurveTo(currentPoints[i - 1].x, currentPoints[i - 1].y, xc, yc);
      }
      ctx.closePath();
      ctx.stroke();

      // Bright Core Pass
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#FFFFFF';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        display: 'block',
      }}
      aria-label="ApexDownloader Dynamic Morphing Logo"
    />
  );
}
