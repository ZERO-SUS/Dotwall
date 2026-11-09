import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Download,
  Flame,
  Grid,
  Hand,
  LocateFixed,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Pipette,
  Redo2,
  Shuffle,
  Sparkles,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { CanvasTool, GlobalPixel, GlobalStats, PixelHistoryEntry, PlayerProfile } from '../types';
import { CANVAS_SIZE, COOLDOWN_SECONDS, DOTWALL_PALETTE, getColorName } from '../constants';
import { exportGlobalCanvasPng } from '../utils/exportPng';
import { getVisibleChunkIds } from '../firebase/database';

interface GlobalCanvasWorkspaceProps {
  pixelsMap: Map<string, GlobalPixel>;
  history: PixelHistoryEntry[];
  stats: GlobalStats;
  currentUser: PlayerProfile | null;
  cooldownRemainingMs: number;
  nextCooldownAt: number;
  onPlacePixel: (x: number, y: number, color: string) => Promise<{ ok: boolean; error?: string }>;
  onUndoPixel?: () => Promise<{ ok: boolean; error?: string; x?: number; y?: number }>;
  onRedoPixel?: () => Promise<{ ok: boolean; error?: string; x?: number; y?: number }>;
  onInspectPlayer: (username: string) => void;
  onVisibleChunksChange?: (chunkIds: string[]) => void;
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
  onUndoPixel,
  onRedoPixel,
  onInspectPlayer,
  onVisibleChunksChange,
  compactMode = false,
}) => {
  const [selectedCoord, setSelectedCoord] = useState<{ x: number; y: number }>({ x: 490, y: 490 });
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number } | null>(null);

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

  // Expanded & Fullscreen & Collapsible Inspector Panel states (Section 7)
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState<boolean>(false);
  const [isExpandedWorkspace, setIsExpandedWorkspace] = useState<boolean>(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);

  // Replay state
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number>(0);

  // Viewport transform
  const [zoom, setZoom] = useState<number>(13);
  const [camera, setCamera] = useState<{ x: number; y: number }>({ x: 500, y: 495 });

  // Jump inputs
  const [jumpX, setJumpX] = useState<string>('500');
  const [jumpY, setJumpY] = useState<string>('495');

  const [statusMsg, setStatusMsg] = useState<{ text: string; kind: 'info' | 'error' | 'good' }>({
    text: 'Select a coordinate and press Enter or Place Pixel.',
    kind: 'info',
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Refs
  const workspaceRootRef = useRef<HTMLDivElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pointer & Pinch-to-Zoom tracking
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

  const pinchDistRef = useRef<number | null>(null);

  // Notify parent of visible 50x50 spatial chunks when camera/zoom changes
  useEffect(() => {
    if (!onVisibleChunksChange) return;
    const chunkIds = getVisibleChunkIds(camera.x, camera.y, 1100, 760, zoom);
    onVisibleChunksChange(chunkIds);
  }, [camera.x, camera.y, zoom, onVisibleChunksChange]);

  // Listen for native fullscreen change
  useEffect(() => {
    const onFsChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleNativeFullscreen = useCallback(async () => {
    const el = workspaceRootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback to expanded workspace mode if browser blocks fullscreen
      setIsExpandedWorkspace((v) => !v);
    }
  }, []);

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
    const customCellEmpty = getComputedStyle(document.documentElement)
      .getPropertyValue('--cell-empty')
      .trim();
    const emptyBg = customCellEmpty || (isDark ? '#24222E' : '#ECEAF3');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(22, 21, 29, 0.09)';
    const majorGridColor = isDark ? 'rgba(160, 139, 255, 0.2)' : 'rgba(91, 52, 240, 0.18)';

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

      // 50x50 Chunk boundaries or 10x10 guides
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
    isExpandedWorkspace,
    isInspectorCollapsed,
    isNativeFullscreen,
  ]);

  // Accurate 1000x1000 coordinate mapping across any zoom, pan, DPR, or screen size
  const screenToBoardCoord = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = mainCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;

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
          text: `Cooldown active! Wait ${(cooldownRemainingMs / 1000).toFixed(1)}s before placing your next pixel.`,
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
            ? `Replaced (${targetX}, ${targetY}) with ${getColorName(selectedColor)} (${selectedColor})! (0 new slots used)`
            : `Placed ${getColorName(selectedColor)} (${selectedColor}) at (${targetX}, ${targetY})!`,
          kind: 'good',
        });
      } else {
        setStatusMsg({
          text: res.error || 'Placement rejected.',
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

  const handleUndo = useCallback(async () => {
    if (!onUndoPixel || isSubmitting) return;
    setIsSubmitting(true);
    const res = await onUndoPixel();
    setIsSubmitting(false);
    if (res.ok) {
      if (res.x !== undefined && res.y !== undefined) {
        setSelectedCoord({ x: res.x, y: res.y });
      }
      setStatusMsg({
        text: `Undid your recent placement at (${res.x}, ${res.y}).`,
        kind: 'good',
      });
    } else {
      setStatusMsg({
        text: res.error || 'No eligible own placement to undo.',
        kind: 'error',
      });
    }
  }, [onUndoPixel, isSubmitting]);

  const handleRedo = useCallback(async () => {
    if (!onRedoPixel || isSubmitting) return;
    setIsSubmitting(true);
    const res = await onRedoPixel();
    setIsSubmitting(false);
    if (res.ok) {
      setStatusMsg({
        text: `Redid placement at (${res.x}, ${res.y}).`,
        kind: 'good',
      });
    } else {
      setStatusMsg({
        text: res.error || 'Nothing safe to redo.',
        kind: 'error',
      });
    }
  }, [onRedoPixel, isSubmitting]);

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
    if (pinchDistRef.current !== null) return;
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
    if (d.hasDragged || pinchDistRef.current !== null) return;

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

  // Mobile Two-Finger Pinch-to-Zoom Support
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDistRef.current = Math.hypot(dx, dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && pinchDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / Math.max(10, pinchDistRef.current);
      if (Math.abs(ratio - 1) > 0.03) {
        setZoom((z) => Math.max(0.65, Math.min(36, Number((z * ratio).toFixed(2)))));
        pinchDistRef.current = dist;
      }
    }
  };

  const handleTouchEnd = () => {
    pinchDistRef.current = null;
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
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      toggleNativeFullscreen();
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      jumpToRandomArtworkLocation();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      handleUndo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
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

  const canvasPixelWidth = isExpandedWorkspace || isInspectorCollapsed || isNativeFullscreen ? 1360 : 1040;
  const canvasPixelHeight = isNativeFullscreen ? 860 : compactMode ? 680 : 760;

  return (
    <div
      ref={workspaceRootRef}
      className={`grid ${isInspectorCollapsed ? 'collapsed-rail' : ''} ${
        isExpandedWorkspace ? 'expanded-workspace' : ''
      } ${isNativeFullscreen ? 'fullscreen-workspace' : ''}`}
      id="wall"
      onKeyDown={handleKeyDown}
    >
      {/* LEFT STAGE: Large 1000x1000 Global Canvas */}
      <section className="stage" aria-label="1000 by 1000 Global Pixel Wall">
        <div className="bar">
          <div className="readout">
            <span className="genz-pill accent">
              CHUNK {Math.floor(selectedCoord.x / 50)}_{Math.floor(selectedCoord.y / 50)}
            </span>
            <b id="coord">
              ({selectedCoord.x}, {selectedCoord.y})
            </b>
            <span className="sub" id="owner">
              {inspectedPixel
                ? `Owned by @${inspectedPixel.ownerUsername} (v${inspectedPixel.version}) · ${getColorName(inspectedPixel.color)}`
                : 'Empty slot — placing here claims 1 of 1,000,000 positions'}
            </span>
          </div>
          <div className="hover" id="hoverInfo">
            {hoverCoord ? (
              <>
                Cursor ({hoverCoord.x}, {hoverCoord.y})
                {hoveredPixel ? ` · @${hoveredPixel.ownerUsername}` : ' · Empty'}
              </>
            ) : (
              'Pinch or scroll to zoom · Drag to pan'
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
              title="Place / Replace Pixel Tool (P)"
            >
              <Sparkles size={13} /> Place
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

          {onUndoPixel && (
            <div className="seg" role="group" aria-label="Safe History">
              <button
                type="button"
                onClick={handleUndo}
                title="Undo own recent placement if not modified by another player (Ctrl+Z)"
              >
                <Undo2 size={13} /> Undo
              </button>
              {onRedoPixel && (
                <button
                  type="button"
                  onClick={handleRedo}
                  title="Redo placement when safe (Ctrl+Y)"
                >
                  <Redo2 size={13} /> Redo
                </button>
              )}
            </div>
          )}

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
            <Shuffle size={13} /> Random
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
                setZoom(13);
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

          {/* Fullscreen & Collapsible Panel Controls */}
          <div className="seg" style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              aria-pressed={isExpandedWorkspace}
              onClick={() => setIsExpandedWorkspace((v) => !v)}
              title="Toggle Wide Expanded Canvas Workspace"
            >
              {isExpandedWorkspace ? <Minimize2 size={13} /> : <Maximize2 size={13} />} Wide
            </button>
            <button
              type="button"
              aria-pressed={isNativeFullscreen}
              onClick={toggleNativeFullscreen}
              title="Fullscreen Canvas Mode (F)"
            >
              <Maximize2 size={13} /> Fullscreen
            </button>
            <button
              type="button"
              aria-pressed={isInspectorCollapsed}
              onClick={() => setIsInspectorCollapsed((c) => !c)}
              title={isInspectorCollapsed ? 'Show Inspector Panel' : 'Hide Inspector Panel'}
            >
              {isInspectorCollapsed ? (
                <>
                  <PanelRightOpen size={13} /> Show Tools
                </>
              ) : (
                <>
                  <PanelRightClose size={13} /> Hide Panel
                </>
              )}
            </button>
          </div>
        </div>

        {/* Canvas Viewport Container */}
        <div className="board-container large-board">
          <div
            className="board"
            id="board"
            data-tool={tool}
            tabIndex={0}
            role="application"
            aria-label="Global 1000 by 1000 pixel canvas. Arrow keys move selection, Enter places pixel."
          >
            <canvas
              ref={mainCanvasRef}
              width={canvasPixelWidth}
              height={canvasPixelHeight}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => setHoverCoord(null)}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onDoubleClick={() => {
                if (tool === 'place') handleCommitPlace();
              }}
            />

            {/* Floating Minimap HUD */}
            <div className="minimap-hud">
              <div className="minimap-header">
                <span>MINIMAP (1000×1000)</span>
                <button
                  type="button"
                  className="mini-center-btn"
                  onClick={() => {
                    setCamera({ x: 500, y: 495 });
                    setSelectedCoord({ x: 500, y: 495 });
                    if (zoom < 8) setZoom(13);
                  }}
                  title="Jump to Central Plaza (500, 495)"
                >
                  <LocateFixed size={11} /> Plaza
                </button>
              </div>
              <canvas
                ref={minimapCanvasRef}
                width={156}
                height={156}
                className="minimap-canvas"
                onClick={handleMinimapInteract}
                onMouseMove={(e) => {
                  if (e.buttons === 1) handleMinimapInteract(e);
                }}
              />
            </div>

            {/* Floating Quick Place Pill when Inspector is Collapsed or in Fullscreen */}
            {(isInspectorCollapsed || isNativeFullscreen) && (
              <div className="floating-quick-place-dock">
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(e) => selectColorWithHistory(e.target.value)}
                  className="native-color-input"
                />
                <button
                  type="button"
                  className="btn primary"
                  disabled={cooldownRemainingMs > 0 || isSubmitting}
                  onClick={() => handleCommitPlace()}
                >
                  {cooldownRemainingMs > 0
                    ? `Wait ${cooldownSecondsDisplay}s`
                    : `Place (${selectedCoord.x}, ${selectedCoord.y})`}
                </button>
              </div>
            )}

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
                <span>1-Click Place</span>
              </label>
            </div>
          </div>
        </div>

        {/* Export & Canvas Footer Row */}
        <div className="canvas-footer-bar">
          <p className="note">
            Tip: Double-click any cell or press <kbd>Enter</kbd> to place · Press <kbd>F</kbd> for
            fullscreen · Hide the side panel anytime for a distraction-free studio.
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

      {/* RIGHT RAIL: Collapsible 330px Control Panel */}
      {!isInspectorCollapsed && (
        <aside className="panel" aria-label="Pixel controls and inspector">
          {/* 1. 30-SECOND COOLDOWN & PLACEMENT CARD */}
          <div className="card">
            <h2>
              <span>Placement Charge</span>
              <span className="pick">30s UID Cooldown</span>
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
                      ? 'Ready to Replace'
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
                  ? `Replace (${selectedCoord.x}, ${selectedCoord.y}) with ${getColorName(selectedColor)}`
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
                      {inspectedPixel.color} · Version v{inspectedPixel.version}
                    </div>
                  </div>
                </div>
                <dl className="rows">
                  <dt>Owner</dt>
                  <dd>
                    <button
                      type="button"
                      className="inline-user-link"
                      onClick={() => onInspectPlayer(inspectedPixel.ownerUsername)}
                    >
                      @{inspectedPixel.ownerUsername}
                    </button>
                  </dd>
                  <dt>Chunk</dt>
                  <dd>
                    Chunk {Math.floor(inspectedPixel.x / 50)}_{Math.floor(inspectedPixel.y / 50)}
                  </dd>
                  <dt>Updated</dt>
                  <dd>{new Date(inspectedPixel.updatedAt).toLocaleTimeString()}</dd>
                  <dt>Capacity Rule</dt>
                  <dd>Replacing consumes 0 new slots</dd>
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
                  Position <b>({selectedCoord.x}, {selectedCoord.y})</b> is empty. Placing a pixel
                  here claims 1 of the {stats.pixelsRemaining.toLocaleString()} remaining global
                  slots.
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
                      {item.actionType === 'replace' ? 'replaced' : 'placed'}{' '}
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
      )}
    </div>
  );
};
