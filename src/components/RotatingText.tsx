"use client";

import React, { useState, useEffect } from 'react';

interface RotatingTextProps {
  words: string[];
  interval?: number;
  className?: string;
}

export function RotatingText({
  words,
  interval = 1500,
  className = '',
}: RotatingTextProps) {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % words.length);
        setFade(true);
      }, 250); // 250ms fade out transition
    }, interval);

    return () => clearInterval(timer);
  }, [words, interval]);

  return (
    <span
      className={`rotating-text-span ${fade ? 'flip-in' : 'flip-out'} ${className}`}
    >
      {words[index]}
    </span>
  );
}
