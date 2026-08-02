"use client";

import React, { useRef, useEffect } from 'react';

interface Point {
  x: number;
  y: number;
}

// Generate 60 control points along a closed or open path for seamless 60fps lerping
function generateApexAPoints(numPoints = 60): Point[] {
  const points: Point[] = [];
  // Apex A: Apex Peak (0.5, 0.15) -> Bottom Left (0.1, 0.85) -> Notch (0.3, 0.85) -> Inner Apex (0.5, 0.45) -> Notch (0.7, 0.85) -> Bottom Right (0.9, 0.85) -> Peak
  const keyNodes: Point[] = [
    { x: 0.5, y: 0.12 },
    { x: 0.1, y: 0.88 },
    { x: 0.3, y: 0.88 },
    { x: 0.5, y: 0.48 },
    { x: 0.7, y: 0.88 },
    { x: 0.9, y: 0.88 },
    { x: 0.5, y: 0.12 },
  ];

  for (let i = 0; i < keyNodes.length - 1; i++) {
    const p1 = keyNodes[i];
    const p2 = keyNodes[i + 1];
    const steps = Math.floor(numPoints / (keyNodes.length - 1));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      points.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      });
    }
  }
  while (points.length < numPoints) {
    points.push({ ...keyNodes[keyNodes.length - 1] });
  }
  return points;
}

function generateInfinityPoints(numPoints = 60): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < numPoints; i++) {
    const t = (i / numPoints) * Math.PI * 2;
    const scale = 0.36;
    // Lemniscate of Bernoulli formula
    const denominator = 1 + Math.sin(t) * Math.sin(t);
    const x = 0.5 + (scale * Math.cos(t)) / denominator;
    const y = 0.5 + (scale * Math.sin(t) * Math.cos(t)) / denominator;
    points.push({ x, y });
  }
  return points;
}

function generateDownloadArrowPoints(numPoints = 60): Point[] {
  const points: Point[] = [];
  // Arrow stem -> Arrowhead -> Tray
  const keyNodes: Point[] = [
    { x: 0.5, y: 0.15 },
    { x: 0.5, y: 0.62 },
    { x: 0.25, y: 0.42 },
    { x: 0.5, y: 0.68 },
    { x: 0.75, y: 0.42 },
    { x: 0.5, y: 0.68 },
    { x: 0.5, y: 0.62 },
    { x: 0.2, y: 0.85 },
    { x: 0.8, y: 0.85 },
    { x: 0.5, y: 0.15 },
  ];

  for (let i = 0; i < keyNodes.length - 1; i++) {
    const p1 = keyNodes[i];
    const p2 = keyNodes[i + 1];
    const steps = Math.floor(numPoints / (keyNodes.length - 1));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      points.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
      });
    }
  }
  while (points.length < numPoints) {
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

    const numPoints = 60;
    const shapeA = generateApexAPoints(numPoints);
    const shapeInf = generateInfinityPoints(numPoints);
    const shapeDl = generateDownloadArrowPoints(numPoints);

    let animationFrameId: number;
    let startTime: number | null = null;
    const cycleDuration = 9000; // 9-second full smooth cycle matching video

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const render = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = (timestamp - startTime) % cycleDuration;
      const tSec = elapsed / 1000;

      let currentShape: Point[] = shapeA;
      let targetShape: Point[] = shapeInf;
      let transitionT = 0;

      if (tSec < 2.0) {
        // Hold Shape 1: Apex A
        currentShape = shapeA;
        targetShape = shapeA;
        transitionT = 0;
      } else if (tSec < 3.8) {
        // Transition 1: Apex A -> Infinity 8
        currentShape = shapeA;
        targetShape = shapeInf;
        transitionT = easeInOut((tSec - 2.0) / 1.8);
      } else if (tSec < 5.8) {
        // Hold Shape 2: Infinity 8
        currentShape = shapeInf;
        targetShape = shapeInf;
        transitionT = 0;
      } else if (tSec < 7.6) {
        // Transition 2: Infinity 8 -> Download Arrow
        currentShape = shapeInf;
        targetShape = shapeDl;
        transitionT = easeInOut((tSec - 5.8) / 1.8);
      } else if (tSec < 8.4) {
        // Hold Shape 3: Download Arrow
        currentShape = shapeDl;
        targetShape = shapeDl;
        transitionT = 0;
      } else {
        // Transition 3: Download Arrow -> Apex A
        currentShape = shapeDl;
        targetShape = shapeA;
        transitionT = easeInOut((tSec - 8.4) / 0.6);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Create glowing neon linear gradient
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, '#E1306C');
      grad.addColorStop(0.5, '#E60023');
      grad.addColorStop(1, '#833AB4');

      ctx.save();
      ctx.scale(dpi, dpi);

      // Draw multi-pass neon glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#FF007A';
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const px = lerp(currentShape[i].x, targetShape[i].x, transitionT) * size;
        const py = lerp(currentShape[i].y, targetShape[i].y, transitionT) * size;

        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.stroke();

      // Bright inner core stroke
      ctx.shadowBlur = 2;
      ctx.shadowColor = '#FFFFFF';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.2;
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
      aria-label="ApexDownloader Dynamic Logo Animation"
    />
  );
}
