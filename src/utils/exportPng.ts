import type { GlobalPixel, TaskPixel } from '../types';
import { CANVAS_SIZE } from '../constants';

export function exportGlobalCanvasPng(options: {
  pixels: Map<string, GlobalPixel>;
  includeGrid?: boolean;
  backgroundColor?: string;
  cropRegion?: { x: number; y: number; width: number; height: number; scale?: number } | null;
  filename?: string;
}) {
  const {
    pixels,
    includeGrid = false,
    backgroundColor = '#ECEAF3',
    cropRegion = null,
    filename,
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (cropRegion) {
    const scale = cropRegion.scale || ( includeGrid ? 12 : 4 );
    canvas.width = cropRegion.width * scale;
    canvas.height = cropRegion.height * scale;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const px of pixels.values()) {
      if (
        px.x >= cropRegion.x &&
        px.x < cropRegion.x + cropRegion.width &&
        px.y >= cropRegion.y &&
        px.y < cropRegion.y + cropRegion.height
      ) {
        ctx.fillStyle = px.color;
        ctx.fillRect(
          (px.x - cropRegion.x) * scale,
          (px.y - cropRegion.y) * scale,
          scale,
          scale
        );
      }
    }

    if (includeGrid && scale >= 4) {
      ctx.strokeStyle = 'rgba(22, 21, 29, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= cropRegion.width; x++) {
        ctx.moveTo(x * scale + 0.5, 0);
        ctx.lineTo(x * scale + 0.5, canvas.height);
      }
      for (let y = 0; y <= cropRegion.height; y++) {
        ctx.moveTo(0, y * scale + 0.5);
        ctx.lineTo(canvas.width, y * scale + 0.5);
      }
      ctx.stroke();
    }
  } else {
    // Full 1000 x 1000 high-resolution export
    const scale = includeGrid ? 4 : 2; // 2000x2000 or 4000x4000 crisp pixel export
    canvas.width = CANVAS_SIZE * scale;
    canvas.height = CANVAS_SIZE * scale;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const px of pixels.values()) {
      ctx.fillStyle = px.color;
      ctx.fillRect(px.x * scale, px.y * scale, scale, scale);
    }

    if (includeGrid) {
      ctx.strokeStyle = 'rgba(22, 21, 29, 0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= CANVAS_SIZE; i += 10) {
        ctx.beginPath();
        ctx.moveTo(i * scale, 0);
        ctx.lineTo(i * scale, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * scale);
        ctx.lineTo(canvas.width, i * scale);
        ctx.stroke();
      }
    }
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const outName = filename || `dotwall-1000x1000-${dateStamp}.png`;
  triggerCanvasDownload(canvas, outName);
}

export function exportSpritePng(options: {
  pixels: TaskPixel[];
  gridSize: number;
  includeGrid?: boolean;
  backgroundColor?: string;
  filename?: string;
}) {
  const {
    pixels,
    gridSize = 16,
    includeGrid = false,
    backgroundColor = '#18171F',
    filename = 'dotwall-artwork.png',
  } = options;

  const scale = Math.max(16, Math.floor(512 / gridSize));
  const canvas = document.createElement('canvas');
  canvas.width = gridSize * scale;
  canvas.height = gridSize * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const p of pixels) {
    if (p.x >= 0 && p.x < gridSize && p.y >= 0 && p.y < gridSize) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * scale, p.y * scale, scale, scale);
    }
  }

  if (includeGrid) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= gridSize; i++) {
      ctx.moveTo(i * scale + 0.5, 0);
      ctx.lineTo(i * scale + 0.5, canvas.height);
      ctx.moveTo(0, i * scale + 0.5);
      ctx.lineTo(canvas.width, i * scale + 0.5);
    }
    ctx.stroke();
  }

  const cleanTitle = filename
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-|-$/g, '');
  triggerCanvasDownload(canvas, `${cleanTitle || 'dotwall-art'}.png`);
}

function triggerCanvasDownload(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
