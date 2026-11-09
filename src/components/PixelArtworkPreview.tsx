import React, { useEffect, useRef } from 'react';
import type { TaskPixel } from '../types';

interface PixelArtworkPreviewProps {
  pixels: TaskPixel[];
  gridSize?: number;
  size?: number;
  showGrid?: boolean;
  backgroundColor?: string;
  className?: string;
}

export const PixelArtworkPreview: React.FC<PixelArtworkPreviewProps> = ({
  pixels,
  gridSize = 16,
  size = 160,
  showGrid = false,
  backgroundColor = 'transparent',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cell = canvas.width / gridSize;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    for (const p of pixels) {
      if (p.x >= 0 && p.x < gridSize && p.y >= 0 && p.y < gridSize) {
        ctx.fillStyle = p.color;
        ctx.fillRect(
          Math.floor(p.x * cell),
          Math.floor(p.y * cell),
          Math.ceil(cell),
          Math.ceil(cell)
        );
      }
    }

    if (showGrid) {
      ctx.strokeStyle = 'rgba(154, 152, 174, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= gridSize; i++) {
        const pos = Math.floor(i * cell) + 0.5;
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, canvas.height);
        ctx.moveTo(0, pos);
        ctx.lineTo(canvas.width, pos);
      }
      ctx.stroke();
    }
  }, [pixels, gridSize, backgroundColor, showGrid]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`pixel-preview-canvas ${className}`}
      style={{
        width: '100%',
        height: '100%',
        imageRendering: 'pixelated',
        display: 'block',
      }}
    />
  );
};
