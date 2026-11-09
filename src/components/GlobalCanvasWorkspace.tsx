import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Download,
  Flame,
  Grid,
  Hand,
  LocateFixed,
  Lock,
  Play,
  Pipette,
  Shuffle,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { CanvasTool, GlobalPixel, GlobalStats, PixelHistoryEntry, PlayerProfile } from '../types';
import { CANVAS_SIZE, COOLDOWN_SECONDS, DOTWALL_PALETTE, getColorName } from '../constants';
import { exportGlobalCanvasPng } from '../utils/exportPng';

interface GlobalCanvasWorkspaceProps {
  pixelsMap: Map<string, GlobalPixel>;
  history: PixelHistoryEntry[];
  stats: GlobalStats;
  currentUser: PlayerProfile | null;
  cooldownRemainingMs: number;
  nextCooldownAt: number;
  onPlacePixel: (x: number, y: number, color: string) => Promise<{ ok: boolean; error?: string }>;
  onInspectPlayer: (username: string) => void;
  compactMode?: boolean;
}

export const GlobalCanvasWorkspace: React.FC<GlobalCanvasWorkspaceProps> = ({
  pixelsMap,
  history,
  stats,
  currentUser,
  cooldownRemainingMs,
  nextCooldownAt,
  onPlacePixel,
  onInspectPlayer,
  compactMode = false,
}) => {
  const [selectedCoord, setSelectedCoord] = useState<{ x: number; y: number }>({ x: 490, y: 490 });
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);

  // Active tool & modes (Permanent Ink rule: Place/Modify, Eyedropper, Pan)
  const [tool, setTool] = useState<CanvasTool>('place');
  const [selectedColor, setSelectedColor] = useState<string>('#6B3DFF');
  const [customHexInput, setCustomHexInput] = useState<string>('#6B3DFF');
  const [recentColors, setRecentColors] = useState<string[]>([
    '#6B3DFF',
    '#5CF2B2',
    '#FFD93B',
    '#FF84CB',
    '#6FD6FF',
    '#D8FF4A',
  ]);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [instantPlaceOnClick, setInstantPlaceOnClick] = useState<boolean>(false);
  const [exportWithGrid, setExportWithGrid] = useState<boolean>(false);

  // Replay state
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number>(0);

  // Viewport transform
  const [zoom, setZoom] = useState<number>(12);
  const [camera, setCamera] = useState<{ x: number; y: number }>({ x: 500, y: 495 });

  // Jump inputs
  const [jumpX, setJumpX] = useState<string>('500');
  const [jumpY, setJumpY] = useState<string>('495');

  // Action feedback message
  const [statusMsg, setStatusMsg] = useState<{ text: string; kind: 'info' | 'error' | 'good' }>({
    text: 'Permanent Ink Rule: Placed pixels cannot be removed — place on empty slots or modify upon existing pixels!',
    kind: 'info',
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Canvas refs
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const dragStateRef = useRef<{
    isDown: boolean;
    hasDragged: boolean;
    startX: number;
    startY: number;
    startCamX: number;
    startCamY: number;
  }>({
    isDown: false,
    hasDragged: false,
    startX: 0,
    startY: 0,
    startCamX: 500,
    startCamY: 495,
  });

  // Maintain 1000x1000 offscreen backing canvas
  useEffect(() => {
    if (!offscreenCanvasRef.current) {
      const off = document.createElement('canvas');
      off.width = CANVAS_SIZE;
      off.height = CANVAS_SIZE;
      offscreenCanvasRef.current = off;
    }
    const off = offscreenCanvasRef.current;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (isReplaying) {
      const slice = history.slice(0, replayIndex);
      for (const item of slice) {
        if (item.newColor) {
          ctx.fillStyle = item.newColor;
          ctx.fillRect(item.x, item.y, 1, 1);
        }
      }
    } else {
      for (const px of pixelsMap.values()) {
        ctx.fillStyle = px.color;
        ctx.fillRect(px.x, px.y, 1, 1);
      }
    }
  }, [pixelsMap, isReplaying, replayIndex, history]);

  useEffect(() => {
    if (!isReplaying) return;
    if (replayIndex >= history.length) {
      const t = setTimeout(() => setIsReplaying(false), 600);
      return () => clearTimeout(t);
    }
    const timer = setTimeout(() => {
      setReplayIndex((i) => i + 1);
    }, 65);
    return () => clearTimeout(timer);
  }, [isReplaying, replayIndex, history.length]);

  // Render main viewport canvas + minimap
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    const off = offscreenCanvasRef.current;
    if (!canvas || !off) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const emptyBg = isDark ? '#24222E' : '#ECEAF3';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(22, 21, 29, 0.09)';
    const majorGridColor = isDark ? 'rgba(160, 139, 255, 0.18)' : 'rgba(91, 52, 240, 0.16)';

    ctx.fillStyle = isDark ? '#121118' : '#E2DFEC';
    ctx.fillRect(0, 0, width, height);

    const originX = width / 2 - camera.x * zoom;
    const originY = height / 2 - camera.y * zoom;
    const boardPixelW = CANVAS_SIZE * zoom;
    const boardPixelH = CANVAS_SIZE * zoom;

    ctx.fillStyle = emptyBg;
    ctx.fillRect(originX, originY, boardPixelW, boardPixelH);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, originX, originY, boardPixelW, boardPixelH);

    const startCellX = Math.max(0, Math.floor(-originX / zoom));
    const endCellX = Math.min(CANVAS_SIZE, Math.ceil((width - originX) / zoom));
    const startCellY = Math.max(0, Math.floor(-originY / zoom));
    const endCellY = Math.min(CANVAS_SIZE, Math.ceil((height - originY) / zoom));

    if (showGrid) {
      if (zoom >= 5) {
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = startCellX; x <= endCellX; x++) {
          const sx = Math.floor(originX + x * zoom) + 0.5;
          ctx.moveTo(sx, Math.max(0, originY));
          ctx.lineTo(sx, Math.min(height, originY + boardPixelH));
        }
        for (let y = startCellY; y <= endCellY; y++) {
          const sy = Math.floor(originY + y * zoom) + 0.5;
          ctx.moveTo(Math.max(0, originX), sy);
          ctx.lineTo(Math.min(width, originX + boardPixelW), sy);
        }
        ctx.stroke();
      }

      const step = zoom >= 4 ? 10 : 50;
      ctx.strokeStyle = majorGridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const firstMajorX = Math.floor(startCellX / step) * step;
      for (let x = firstMajorX; x <= endCellX; x += step) {
        const sx = Math.floor(originX + x * zoom) + 0.5;
        ctx.moveTo(sx, Math.max(0, originY));
        ctx.lineTo(sx, Math.min(height, originY + boardPixelH));
      }
      const firstMajorY = Math.floor(startCellY / step) * step;
      for (let y = firstMajorY; y <= endCellY; y += step) {
        const sy = Math.floor(originY + y * zoom) + 0.5;
        ctx.moveTo(Math.max(0, originX), sy);
        ctx.lineTo(Math.min(width, originX + boardPixelW), sy);
      }
      ctx.stroke();
    }

    if (showHeatmap) {
      const recentSlice = history.slice(-60);
      recentSlice.forEach((h, idx) => {
        const intensity = (idx + 1) / recentSlice.length;
        const sx = originX + h.x * zoom;
        const sy = originY + h.y * zoom;
        ctx.strokeStyle = `rgba(216, 255, 74, ${0.35 + intensity * 0.65})`;
        ctx.lineWidth = Math.max(1.5, zoom * 0.16);
        ctx.strokeRect(sx - 1, sy - 1, zoom + 2, zoom + 2);
      });
    }

    if (hoverCoord) {
      const hx = originX + hoverCoord.x * zoom;
      const hy = originY + hoverCoord.y * zoom;
      if (tool === 'place') {
        ctx.fillStyle = selectedColor;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(hx, hy, zoom, zoom);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = isDark ? '#F3F2F8' : '#16151D';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx + 0.5, hy + 0.5, Math.max(2, zoom - 1), Math.max(2, zoom - 1));
    }

    const selX = originX + selectedCoord.x * zoom;
    const selY = originY + selectedCoord.y * zoom;
    const cellSize = Math.max(4, zoom);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.strokeRect(selX - 1, selY - 1, cellSize + 2, cellSize + 2);
    ctx.strokeStyle = isDark ? '#A08BFF' : '#5B34F0';
    ctx.lineWidth = 2;
    ctx.strokeRect(selX - 1, selY - 1, cellSize + 2, cellSize + 2);

    const mini = minimapCanvasRef.current;
    if (mini) {
      const mctx = mini.getContext('2d');
      if (mctx) {
        const mw = mini.width;
        const mh = mini.height;
        mctx.fillStyle = emptyBg;
        mctx.fillRect(0, 0, mw, mh);

        for (const px of pixelsMap.values()) {
          mctx.fillStyle = px.color;
          const mx = (px.x / CANVAS_SIZE) * mw;
          const my = (px.y / CANVAS_SIZE) * mh;
          mctx.fillRect(mx, my, 2.2, 2.2);
        }

        const visW = width / zoom;
        const visH = height / zoom;
        const vx = ((camera.x - visW / 2) / CANVAS_SIZE) * mw;
        const vy = ((camera.y - visH / 2) / CANVAS_SIZE) * mh;
        const vw = (visW / CANVAS_SIZE) * mw;
        const vh = (visH / CANVAS_SIZE) * mh;

        mctx.strokeStyle = '#6B3DFF';
        mctx.lineWidth = 2;
        mctx.strokeRect(
          Math.max(0, vx),
          Math.max(0, vy),
          Math.min(mw, Math.max(6, vw)),
          Math.min(mh, Math.max(6, vh))
        );
      }
    }
  }, [
    pixelsMap,
    camera,
    zoom,
    showGrid,
    showHeatmap,
    hoverCoord,
    selectedCoord,
    selectedColor,
    tool,
    history,
    isReplaying,
    replayIndex,
  ]);

  const screenToBoardCoord = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = mainCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const canvasX = (clientX - rect.left) * scaleX;
      const canvasY = (clientY - rect.top) * scaleY;

      const originX = canvas.width / 2 - camera.x * zoom;
      const originY = canvas.height / 2 - camera.y * zoom;

      const bx = Math.floor((canvasX - originX) / zoom);
      const by = Math.floor((canvasY - originY) / zoom);

      if (bx < 0 || bx >= CANVAS_SIZE || by < 0 || by >= CANVAS_SIZE) {
        return null;
      }
      return { x: bx, y: by };
    },
    [camera, zoom]
  );

  const selectColorWithHistory = useCallback((hex: string) => {
    const clean = hex.toUpperCase();
    setSelectedColor(clean);
    setCustomHexInput(clean);
    setRecentColors((prev) => [clean, ...prev.filter((c) => c !== clean)].slice(0, 8));
  }, []);

  const handleCommitPlace = useCallback(
    async (targetX = selectedCoord.x, targetY = selectedCoord.y) => {
      if (isSubmitting) return;
      if (cooldownRemainingMs > 0) {
        setStatusMsg({
          text: `Cooldown active! Wait ${(cooldownRemainingMs / 1000).toFixed(1)}s before placing or modifying a pixel.`,
          kind: 'error',
        });
        return;
      }
      const existing = pixelsMap.get(`${targetX},${targetY}`);
      setIsSubmitting(true);
      const res = await onPlacePixel(targetX, targetY, selectedColor);
      setIsSubmitting(false);

      if (res.ok) {
        selectColorWithHistory(selectedColor);
        setStatusMsg({
          text: existing
            ? `Modified (${targetX}, ${targetY}) with ${getColorName(selectedColor)} (${selectedColor})! (0 new slots used)`
            : `Placed permanent pixel ${getColorName(selectedColor)} at (${targetX}, ${targetY})!`,
          kind: 'good',
        });
      } else {
        setStatusMsg({
          text: res.error || 'Could not place pixel.',
          kind: 'error',
        });
      }
    },
    [
      isSubmitting,
      cooldownRemainingMs,
      pixelsMap,
      onPlacePixel,
      selectedCoord.x,
      selectedCoord.y,
      selectedColor,
      selectColorWithHistory,
    ]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      isDown: true,
      hasDragged: false,
      startX: e.clientX,
      startY: e.clientY,
      startCamX: camera.x,
      startCamY: camera.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragStateRef.current;
    if (d.isDown) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        d.hasDragged = true;
      }
      if (d.hasDragged || tool === 'pan') {
        const canvas = mainCanvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const nextX = Math.max(0, Math.min(CANVAS_SIZE, d.startCamX - (dx * scaleX) / zoom));
          const nextY = Math.max(0, Math.min(CANVAS_SIZE, d.startCamY - (dy * scaleY) / zoom));
          setCamera({ x: nextX, y: nextY });
        }
        return;
      }
    }

    const coord = screenToBoardCoord(e.clientX, e.clientY);
    setHoverCoord(coord);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragStateRef.current;
    d.isDown = false;
    if (d.hasDragged) return;

    const coord = screenToBoardCoord(e.clientX, e.clientY);
    if (!coord) return;

    setSelectedCoord(coord);
    setJumpX(String(coord.x));
    setJumpY(String(coord.y));

    const existing = pixelsMap.get(`${coord.x},${coord.y}`);

    if (tool === 'pick') {
      if (existing) {
        selectColorWithHistory(existing.color);
        setTool('place');
        setStatusMsg({
          text: `Picked ${getColorName(existing.color)} (${existing.color}) from (${coord.x}, ${coord.y}).`,
          kind: 'good',
        });
      } else {
        setStatusMsg({
          text: `Cell (${coord.x}, ${coord.y}) is empty — nothing to eyedrop.`,
          kind: 'info',
        });
      }
    } else if (tool === 'place' && instantPlaceOnClick && cooldownRemainingMs <= 0) {
      handleCommitPlace(coord.x, coord.y);
    }
  };

  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.22 : 0.82;
      setZoom((prev) => Math.max(0.65, Math.min(36, Number((prev * factor).toFixed(2)))));
    };
    canvas.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onNativeWheel);
  }, []);

  const handleMinimapInteract = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mini = minimapCanvasRef.current;
    if (!mini) return;
    const rect = mini.getBoundingClientRect();
    const nx = Math.max(0, Math.min(999, Math.floor(((e.clientX - rect.left) / rect.width) * CANVAS_SIZE)));
    const ny = Math.max(0, Math.min(999, Math.floor(((e.clientY - rect.top) / rect.height) * CANVAS_SIZE)));
    setCamera({ x: nx, y: ny });
    setSelectedCoord({ x: nx, y: ny });
    setJumpX(String(nx));
    setJumpY(String(ny));
  };

  const jumpToRandomArtworkLocation = useCallback(() => {
    const list = Array.from(pixelsMap.values());
    if (list.length > 0) {
      const pick = list[Math.floor(Math.random() * list.length)];
      setCamera({ x: pick.x, y: pick.y });
      setSelectedCoord({ x: pick.x, y: pick.y });
      setJumpX(String(pick.x));
      setJumpY(String(pick.y));
      if (zoom < 8) setZoom(14);
      setStatusMsg({
        text: `Teleported to artwork pixel at (${pick.x}, ${pick.y}) by @${pick.ownerUsername}`,
        kind: 'info',
      });
    } else {
      const rx = Math.floor(Math.random() * CANVAS_SIZE);
      const ry = Math.floor(Math.random() * CANVAS_SIZE);
      setCamera({ x: rx, y: ry });
      setSelectedCoord({ x: rx, y: ry });
    }
  }, [pixelsMap, zoom]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedCoord((p) => {
        const ny = Math.max(0, p.y - step);
        setCamera((c) => ({ ...c, y: ny }));
        return { ...p, y: ny };
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedCoord((p) => {
        const ny = Math.min(CANVAS_SIZE - 1, p.y + step);
        setCamera((c) => ({ ...c, y: ny }));
        return { ...p, y: ny };
      });
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSelectedCoord((p) => {
        const nx = Math.max(0, p.x - step);
        setCamera((c) => ({ ...c, x: nx }));
        return { ...p, x: nx };
      });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSelectedCoord((p) => {
        const nx = Math.min(CANVAS_SIZE - 1, p.x + step);
        setCamera((c) => ({ ...c, x: nx }));
        return { ...p, x: nx };
      });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCommitPlace();
    } else if (e.key.toLowerCase() === 'e') {
      e.preventDefault();
      setTool('pick');
    } else if (e.key.toLowerCase() === 'p') {
      e.preventDefault();
      setTool('place');
    } else if (e.key.toLowerCase() === 'g') {
      e.preventDefault();
      setShowGrid((g) => !g);
    } else if (e.key.toLowerCase() === 'h') {
      e.preventDefault();
      setShowHeatmap((h) => !h);
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      jumpToRandomArtworkLocation();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setZoom((z) => Math.min(36, Number((z * 1.25).toFixed(2))));
    } else if (e.key === '-') {
      e.preventDefault();
      setZoom((z) => Math.max(0.65, Number((z * 0.8).toFixed(2))));
    }
  };

  const inspectedPixel = useMemo(
    () => pixelsMap.get(`${selectedCoord.x},${selectedCoord.y}`) || null,
    [pixelsMap, selectedCoord]
  );

  const hoveredPixel = useMemo(
    () => (hoverCoord ? pixelsMap.get(`${hoverCoord.x},${hoverCoord.y}`) || null : null),
    [pixelsMap, hoverCoord]
  );

  const circumference = 2 * Math.PI * 30;
  const cooldownFraction = Math.min(1, Math.max(0, cooldownRemainingMs / (COOLDOWN_SECONDS * 1000)));
  const strokeDashoffset = circumference * cooldownFraction;
  const cooldownSecondsDisplay = (cooldownRemainingMs / 1000).toFixed(1);
  const nextAvailableTimeString = useMemo(() => {
    if (cooldownRemainingMs <= 0 || !nextCooldownAt) return 'Ready right now';
    return new Date(nextCooldownAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [cooldownRemainingMs, nextCooldownAt]);

  return (
    <div className="grid" id="wall" onKeyDown={handleKeyDown}>
      {/* LEFT STAGE: 1000x1000 Global Canvas */}
      <section className="stage" aria-label="1000 by 1000 Global Pixel Wall">
        <div className="bar">
          <div className="readout">
            <span className="genz-pill daily" title="Once placed, pixels cannot be removed or undone — only modified upon!">
              <Lock size={11} /> PERMANENT INK · MODIFY ONLY
            </span>
            <b id="coord">
              ({selectedCoord.x}, {selectedCoord.y})
            </b>
            <span className="sub" id="owner">
              {inspectedPixel
                ? `Occupied by @${inspectedPixel.ownerUsername} (v${inspectedPixel.version}) — Paint over to modify!`
                : 'Empty slot — placing here permanently claims 1 global slot'}
            </span>
          </div>
          <div className="hover" id="hoverInfo">
            {hoverCoord ? (
              <>
                Cursor ({hoverCoord.x}, {hoverCoord.y})
                {hoveredPixel ? ` · @${hoveredPixel.ownerUsername}` : ' · Empty'}
              </>
            ) : (
              'Drag to pan · Scroll to zoom'
            )}
          </div>
        </div>

        {/* Main Canvas Toolbar */}
        <div className="tools" role="toolbar" aria-label="Wall tools">
          <div className="seg" role="group" aria-label="Drawing Tool">
            <button
              type="button"
              aria-pressed={tool === 'place'}
              onClick={() => setTool('place')}
              title="Place or Modify Pixel Tool (P)"
            >
              <Sparkles size={13} /> Place / Modify
            </button>
            <button
              type="button"
              aria-pressed={tool === 'pick'}
              onClick={() => setTool('pick')}
              title="Eyedropper Tool (E)"
            >
              <Pipette size={13} /> Eyedropper
            </button>
            <button
              type="button"
              aria-pressed={tool === 'pan'}
              onClick={() => setTool('pan')}
              title="Pan / Hand Tool"
            >
              <Hand size={13} /> Pan
            </button>
          </div>

          <button
            type="button"
            className="tbtn"
            aria-pressed={showGrid}
            onClick={() => setShowGrid((g) => !g)}
            title="Toggle Pixel Grid (G)"
          >
            <Grid size={13} /> Grid
          </button>

          <button
            type="button"
            className="tbtn"
            aria-pressed={showHeatmap}
            onClick={() => setShowHeatmap((h) => !h)}
            title="Highlight recently placed pixels (H)"
          >
            <Flame size={13} /> Heatmap
          </button>

          <button
            type="button"
            className="tbtn"
            aria-pressed={isReplaying}
            onClick={() => {
              setReplayIndex(1);
              setIsReplaying(true);
            }}
            title="Replay recent pixel placements"
          >
            <Play size={13} /> Replay
          </button>

          <button
            type="button"
            className="tbtn"
            onClick={jumpToRandomArtworkLocation}
            title="Teleport to random pixel art on the canvas (R)"
          >
            <Shuffle size={13} /> Random Spot
          </button>

          <div className="seg" role="group" aria-label="Zoom Controls">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z * 0.75).toFixed(2))))}
              title="Zoom Out (-)"
            >
              <ZoomOut size={13} />
            </button>
            <button
              type="button"
              onClick={() => {
                setCamera({ x: 500, y: 495 });
                setZoom(12);
              }}
              title="Reset Zoom to Central Plaza"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(36, Number((z * 1.35).toFixed(2))))}
              title="Zoom In (+)"
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>

        {/* Canvas Viewport Container */}
        <div className="board-container">
          <div
            className="board"
            id="board"
            data-tool={tool}
            tabIndex={0}
            role="application"
            aria-label="Global 1000 by 1000 pixel canvas. Arrow keys move selection, Enter places or modifies pixel."
          >
            <canvas
              ref={mainCanvasRef}
              width={760}
              height={compactMode ? 540 : 660}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => setHoverCoord(null)}
              onDoubleClick={() => {
                if (tool === 'place') handleCommitPlace();
              }}
            />

            {/* Floating Minimap HUD & Quick Teleport */}
            <div className="minimap-hud">
              <div className="minimap-header">
                <span>MINIMAP (1000×1000)</span>
                <button
                  type="button"
                  className="mini-center-btn"
                  onClick={() => {
                    setCamera({ x: 500, y: 495 });
                    setSelectedCoord({ x: 500, y: 495 });
                    if (zoom < 8) setZoom(12);
                  }}
                  title="Jump to Central Plaza (500, 495)"
                >
                  <LocateFixed size={11} /> Plaza
                </button>
              </div>
              <canvas
                ref={minimapCanvasRef}
                width={148}
                height={148}
                className="minimap-canvas"
                onClick={handleMinimapInteract}
                onMouseMove={(e) => {
                  if (e.buttons === 1) handleMinimapInteract(e);
                }}
              />
            </div>

            {/* Floating Bottom HUD Bar */}
            <div className="canvas-bottom-hud">
              <form
                className="coord-jump-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const nx = Math.max(0, Math.min(999, parseInt(jumpX, 10) || 0));
                  const ny = Math.max(0, Math.min(999, parseInt(jumpY, 10) || 0));
                  setCamera({ x: nx, y: ny });
                  setSelectedCoord({ x: nx, y: ny });
                }}
              >
                <Crosshair size={13} />
                <label>
                  X
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={jumpX}
                    onChange={(e) => setJumpX(e.target.value)}
                  />
                </label>
                <label>
                  Y
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={jumpY}
                    onChange={(e) => setJumpY(e.target.value)}
                  />
                </label>
                <button type="submit" className="mini-go-btn">
                  Go
                </button>
              </form>

              <label className="instant-toggle">
                <input
                  type="checkbox"
                  checked={instantPlaceOnClick}
                  onChange={(e) => setInstantPlaceOnClick(e.target.checked)}
                />
                <span>1-Click Place/Modify</span>
              </label>
            </div>
          </div>
        </div>

        {/* Export & Canvas Footer Row */}
        <div className="canvas-footer-bar">
          <p className="note">
            Rule: Once placed, pixels cannot be removed or undone — double-click or press{' '}
            <kbd>Enter</kbd> to place or modify upon existing pixels!
          </p>
          <div className="export-controls">
            <label className="export-grid-check">
              <input
                type="checkbox"
                checked={exportWithGrid}
                onChange={(e) => setExportWithGrid(e.target.checked)}
              />
              <span>Grid in PNG</span>
            </label>
            <button
              type="button"
              className="tbtn"
              onClick={() =>
                exportGlobalCanvasPng({
                  pixels: pixelsMap,
                  includeGrid: exportWithGrid,
                  cropRegion: {
                    x: Math.max(0, Math.floor(camera.x - 40)),
                    y: Math.max(0, Math.floor(camera.y - 40)),
                    width: 80,
                    height: 80,
                    scale: 10,
                  },
                  filename: `dotwall-sector-${selectedCoord.x}-${selectedCoord.y}.png`,
                })
              }
            >
              <Download size={13} /> Export Sector PNG
            </button>
            <button
              type="button"
              className="tbtn primary-outline"
              onClick={() =>
                exportGlobalCanvasPng({
                  pixels: pixelsMap,
                  includeGrid: exportWithGrid,
                })
              }
            >
              <Download size={13} /> Export Full 1000×1000 PNG
            </button>
          </div>
        </div>
      </section>

      {/* RIGHT RAIL: 320px Control Panel */}
      <aside className="panel" aria-label="Pixel controls and inspector">
        {/* 1. 30-SECOND COOLDOWN & PLACEMENT CARD */}
        <div className="card">
          <h2>
            <span>Placement Charge</span>
            <span className="pick">30s Cooldown</span>
          </h2>
          <div className="charge">
            <div className="ring" aria-hidden="true">
              <svg viewBox="0 0 72 72">
                <circle className="bg" cx="36" cy="36" r="30" />
                <circle
                  className="fg"
                  cx="36"
                  cy="36"
                  r="30"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                />
                <text className="rt" x="36" y="41">
                  {cooldownRemainingMs > 0 ? `${cooldownSecondsDisplay}s` : 'GO'}
                </text>
              </svg>
            </div>
            <div>
              <div className="state">
                {cooldownRemainingMs > 0
                  ? `Recharging...`
                  : inspectedPixel
                    ? 'Ready to Modify'
                    : 'Ready to Place'}
              </div>
              <div className="hint">
                {cooldownRemainingMs > 0
                  ? `Next available at ${nextAvailableTimeString}`
                  : `Target (${selectedCoord.x}, ${selectedCoord.y}) selected`}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="go"
            disabled={cooldownRemainingMs > 0 || isSubmitting}
            onClick={() => handleCommitPlace()}
          >
            {cooldownRemainingMs > 0
              ? `Next pixel in ${cooldownSecondsDisplay}s`
              : inspectedPixel
                ? `Modify (${selectedCoord.x}, ${selectedCoord.y}) with ${getColorName(selectedColor)}`
                : `Place ${getColorName(selectedColor)} at (${selectedCoord.x}, ${selectedCoord.y})`}
          </button>

          <p className="msg" data-kind={statusMsg.kind === 'error' ? 'error' : undefined}>
            {statusMsg.text}
          </p>

          <div className="mine">
            <span>
              Your pixels: <b>{currentUser?.pixelsPlaced ?? 0}</b>
            </span>
            <span>
              Slots left: <b>{stats.pixelsRemaining.toLocaleString()}</b>
            </span>
          </div>
        </div>

        {/* 2. COLOR PALETTE & HEX PICKER CARD */}
        <div className="card">
          <h2>
            <span>Color Palette</span>
            <span className="pick">
              {getColorName(selectedColor)} · {selectedColor}
            </span>
          </h2>
          <div className="swatches" role="radiogroup" aria-label="Color swatches">
            {DOTWALL_PALETTE.map((sw) => (
              <button
                key={sw.hex}
                type="button"
                className="sw"
                style={{ backgroundColor: sw.hex }}
                aria-pressed={selectedColor.toUpperCase() === sw.hex.toUpperCase()}
                aria-label={`${sw.name} ${sw.hex}`}
                title={`${sw.name} (${sw.hex})`}
                onClick={() => {
                  selectColorWithHistory(sw.hex);
                  if (tool === 'pick') setTool('place');
                }}
              />
            ))}
          </div>

          <div className="hex-picker-row">
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => selectColorWithHistory(e.target.value)}
              className="native-color-input"
              title="Open custom color wheel"
            />
            <input
              type="text"
              value={customHexInput}
              maxLength={7}
              placeholder="#6B3DFF"
              onChange={(e) => {
                const v = e.target.value;
                setCustomHexInput(v);
                if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
                  setSelectedColor(v.toUpperCase());
                }
              }}
              className="hex-text-input"
              aria-label="Custom HEX color"
            />
            <span className="hex-badge">HEX</span>
          </div>

          <div className="recent">
            <span>Recent:</span>
            {recentColors.map((hex) => (
              <button
                key={hex}
                type="button"
                className="sw"
                style={{ backgroundColor: hex }}
                aria-pressed={selectedColor === hex}
                onClick={() => selectColorWithHistory(hex)}
                title={`Recent color ${hex}`}
              />
            ))}
          </div>
        </div>

        {/* 3. PIXEL INSPECTOR CARD */}
        <div className="card">
          <h2>
            <span>Pixel Inspector</span>
            <span className="pick">
              ({selectedCoord.x}, {selectedCoord.y})
            </span>
          </h2>
          {inspectedPixel ? (
            <>
              <div className="insp-top">
                <div className="insp-sw" style={{ backgroundColor: inspectedPixel.color }} />
                <div>
                  <div className="insp-name">{getColorName(inspectedPixel.color)}</div>
                  <div className="insp-hex">
                    {inspectedPixel.color} · Modified v{inspectedPixel.version}
                  </div>
                </div>
              </div>
              <dl className="rows">
                <dt>Last Modified By</dt>
                <dd>
                  <button
                    type="button"
                    className="inline-user-link"
                    onClick={() => onInspectPlayer(inspectedPixel.ownerUsername)}
                  >
                    @{inspectedPixel.ownerUsername}
                  </button>
                </dd>
                <dt>Position</dt>
                <dd>
                  X: {inspectedPixel.x}, Y: {inspectedPixel.y}
                </dd>
                <dt>Updated</dt>
                <dd>{new Date(inspectedPixel.updatedAt).toLocaleTimeString()}</dd>
                <dt>Permanent Rule</dt>
                <dd>Cannot be removed — can only be modified with a new color!</dd>
              </dl>
              <div className="insp-actions">
                <button
                  type="button"
                  className="insp-use"
                  onClick={() => selectColorWithHistory(inspectedPixel.color)}
                >
                  Copy Color ({inspectedPixel.color})
                </button>
              </div>
            </>
          ) : (
            <div>
              <p className="empty-line">
                Slot <b>({selectedCoord.x}, {selectedCoord.y})</b> is empty. Placing a pixel here
                permanently claims 1 of the {stats.pixelsRemaining.toLocaleString()} remaining global
                slots!
              </p>
            </div>
          )}
        </div>

        {/* 4. LIVE WALL FEED CARD */}
        <div className="card">
          <h3>
            <span>Live Wall Feed</span>
            <span>{history.length} events</span>
          </h3>
          <ul className="feed">
            {history
              .slice(-7)
              .reverse()
              .map((item) => (
                <li key={item.id}>
                  <span
                    className="sq"
                    style={{ backgroundColor: item.newColor || '#ECEAF3' }}
                  />
                  <span className="feed-text">
                    <button
                      type="button"
                      className="inline-user-link"
                      onClick={() => onInspectPlayer(item.username)}
                    >
                      @{item.username}
                    </button>{' '}
                    {item.actionType === 'replace' ? 'modified' : 'placed'}{' '}
                    <button
                      type="button"
                      className="inline-coord-link"
                      onClick={() => {
                        setCamera({ x: item.x, y: item.y });
                        setSelectedCoord({ x: item.x, y: item.y });
                        if (zoom < 10) setZoom(14);
                      }}
                    >
                      ({item.x}, {item.y})
                    </button>
                  </span>
                  <span className="at">
                    {Math.max(1, Math.round((Date.now() - item.createdAt) / 1000))}s
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </aside>
    </div>
  );
};
