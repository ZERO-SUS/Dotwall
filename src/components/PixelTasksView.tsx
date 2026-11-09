import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  CheckCircle2,
  Download,
  Eraser,
  Eye,
  Grid,
  Lock,
  PaintBucket,
  Pipette,
  Redo2,
  RotateCcw,
  Shuffle,
  Sparkles,
  Send,
  Trophy,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AchievementItem,
  CommunityArtwork,
  PixelTask,
  PlayerProfile,
  TaskPixel,
  TaskSubmission,
} from '../types';
import { DOTWALL_PALETTE } from '../constants';
import { PixelArtworkPreview } from './PixelArtworkPreview';
import { exportSpritePng } from '../utils/exportPng';

const DAILY_QUOTA_MAX = 5;

interface PixelTasksViewProps {
  tasks: PixelTask[];
  submissions: TaskSubmission[];
  artworks: CommunityArtwork[];
  achievementsCatalog: AchievementItem[];
  currentUser: PlayerProfile | null;
  onSubmitTask: (payload: {
    taskId: string;
    pixels: TaskPixel[];
    accuracyScore: number;
    title: string;
    description: string;
    shareToCommunity: boolean;
    dailyStageIndex?: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  onOpenArtwork?: (art: CommunityArtwork) => void;
}

export const PixelTasksView: React.FC<PixelTasksViewProps> = ({
  tasks,
  submissions,
  artworks,
  achievementsCatalog,
  currentUser,
  onSubmitTask,
  onOpenArtwork,
}) => {
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Generate or load the player's 5 random objects for today
  const [dailyQueueIds, setDailyQueueIds] = useState<string[]>([]);
  const [currentStageIdx, setCurrentStageIdx] = useState<number>(0); // 0..4 (or 5 when all 5 done)
  const [bonusModeTask, setBonusModeTask] = useState<PixelTask | null>(null);

  useEffect(() => {
    if (tasks.length === 0) return;
    const storageKey = `dotwall_daily5_${currentUser?.id || 'guest'}_${todayKey}`;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.queueIds) && parsed.queueIds.length === DAILY_QUOTA_MAX) {
          setDailyQueueIds(parsed.queueIds);
          setCurrentStageIdx(Number(parsed.stageIdx) || 0);
          return;
        }
      } catch {
        // ignore
      }
    }

    // Pick 5 random distinct objects from the pool for today's 1-by-1 gauntlet
    const shuffled = [...tasks].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, DAILY_QUOTA_MAX).map((t) => t.id);
    setDailyQueueIds(picked);
    setCurrentStageIdx(0);
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ queueIds: picked, stageIdx: 0 })
    );
  }, [tasks, currentUser?.id, todayKey]);

  const saveDailyProgress = useCallback(
    (queueIds: string[], nextStage: number) => {
      const storageKey = `dotwall_daily5_${currentUser?.id || 'guest'}_${todayKey}`;
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ queueIds, stageIdx: nextStage })
      );
    },
    [currentUser?.id, todayKey]
  );

  const dailyFiveTasks = useMemo(() => {
    return dailyQueueIds
      .map((id) => tasks.find((t) => t.id === id))
      .filter((t): t is PixelTask => Boolean(t));
  }, [dailyQueueIds, tasks]);

  const isDailyQuotaComplete = currentStageIdx >= DAILY_QUOTA_MAX;

  const activeTask = useMemo(() => {
    if (bonusModeTask) return bonusModeTask;
    if (dailyFiveTasks.length > 0) {
      const clamped = Math.min(DAILY_QUOTA_MAX - 1, Math.max(0, currentStageIdx));
      return dailyFiveTasks[clamped] || tasks[0];
    }
    return tasks[0];
  }, [bonusModeTask, dailyFiveTasks, currentStageIdx, tasks]);

  // Task Workspace state (separate from Global Canvas, zero cooldown!)
  const [canvasMap, setCanvasMap] = useState<Map<string, string>>(new Map());
  const [undoStack, setUndoStack] = useState<Map<string, string>[]>([]);
  const [redoStack, setRedoStack] = useState<Map<string, string>[]>([]);
  const [activeColor, setActiveColor] = useState<string>('#E53935');
  const [taskTool, setTaskTool] = useState<'draw' | 'erase' | 'pick' | 'fill'>('draw');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showGhostReference, setShowGhostReference] = useState<boolean>(true);
  const [workspaceZoom, setWorkspaceZoom] = useState<number>(1);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  // Submission form state
  const [submissionTitle, setSubmissionTitle] = useState<string>('');
  const [submissionDesc, setSubmissionDesc] = useState<string>('');
  const [shareToCommunity, setShareToCommunity] = useState<boolean>(true);
  const [submitStatus, setSubmitStatus] = useState<{ text: string; kind: 'info' | 'good' | 'error' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (activeTask && activeTask.palette.length > 0) {
      setActiveColor(activeTask.palette[0]);
      setSubmissionTitle(`${activeTask.title}`);
      setSubmissionDesc(
        `Completed Object ${Math.min(DAILY_QUOTA_MAX, currentStageIdx + 1)}/${DAILY_QUOTA_MAX}: ${activeTask.title}!`
      );
    }
  }, [activeTask, currentStageIdx]);

  const gridSize = activeTask?.gridSize || 16;

  // Compute progress & reference match accuracy
  const { progressPct, accuracyScore, drawnPixelsArray } = useMemo(() => {
    const arr: TaskPixel[] = [];
    for (const [key, color] of canvasMap.entries()) {
      const [x, y] = key.split(',').map(Number);
      arr.push({ x, y, color });
    }
    if (!activeTask) {
      return { progressPct: 0, accuracyScore: 0, drawnPixelsArray: arr };
    }
    const refCount = Math.max(1, activeTask.referencePixels.length);
    const pct = Math.min(100, Math.round((arr.length / refCount) * 100));

    let matchedPos = 0;
    let matchedColor = 0;
    for (const rp of activeTask.referencePixels) {
      const drawn = canvasMap.get(`${rp.x},${rp.y}`);
      if (drawn) {
        matchedPos++;
        if (drawn.toUpperCase() === rp.color.toUpperCase()) {
          matchedColor++;
        }
      }
    }
    const posScore = (matchedPos / refCount) * 60;
    const colorScore = (matchedColor / refCount) * 40;
    const rawScore = arr.length > 0 ? Math.min(100, Math.max(45, Math.round(posScore + colorScore))) : 0;

    return {
      progressPct: pct,
      accuracyScore: rawScore,
      drawnPixelsArray: arr,
    };
  }, [canvasMap, activeTask]);

  // Draw task canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeTask) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const cell = size / gridSize;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const even = (x + y) % 2 === 0;
        ctx.fillStyle = isDark
          ? even
            ? '#201E2B'
            : '#1A1823'
          : even
            ? '#F0EEF7'
            : '#E6E3F1';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    if (showGhostReference) {
      ctx.globalAlpha = 0.22;
      for (const rp of activeTask.referencePixels) {
        ctx.fillStyle = rp.color;
        ctx.fillRect(rp.x * cell, rp.y * cell, cell, cell);
      }
      ctx.globalAlpha = 1;
    }

    for (const [key, color] of canvasMap.entries()) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = color;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }

    if (showGrid) {
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(22,21,29,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= gridSize; i++) {
        const pos = Math.floor(i * cell) + 0.5;
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, size);
        ctx.moveTo(0, pos);
        ctx.lineTo(size, pos);
      }
      ctx.stroke();
    }
  }, [canvasMap, activeTask, gridSize, showGrid, showGhostReference]);

  const pushHistorySnapshot = useCallback((current: Map<string, string>) => {
    setUndoStack((prev) => [...prev.slice(-30), new Map(current)]);
    setRedoStack([]);
  }, []);

  const floodFill = useCallback(
    (startX: number, startY: number, fillColor: string) => {
      const startKey = `${startX},${startY}`;
      const targetColor = canvasMap.get(startKey) || null;
      if (targetColor === fillColor) return;

      pushHistorySnapshot(canvasMap);
      const next = new Map(canvasMap);
      const queue: [number, number][] = [[startX, startY]];
      const visited = new Set<string>();

      while (queue.length > 0) {
        const [cx, cy] = queue.shift()!;
        const k = `${cx},${cy}`;
        if (visited.has(k)) continue;
        visited.add(k);
        if (cx < 0 || cx >= gridSize || cy < 0 || cy >= gridSize) continue;

        const cur = next.get(k) || null;
        if (cur !== targetColor) continue;

        next.set(k, fillColor);
        queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      setCanvasMap(next);
    },
    [canvasMap, gridSize, pushHistorySnapshot]
  );

  const applyToolAt = useCallback(
    (x: number, y: number, isFirstStroke: boolean) => {
      if (x < 0 || x >= gridSize || y < 0 || y >= gridSize) return;
      const key = `${x},${y}`;

      if (taskTool === 'pick') {
        const c = canvasMap.get(key);
        if (c) {
          setActiveColor(c);
          setTaskTool('draw');
        }
        return;
      }

      if (taskTool === 'fill') {
        if (isFirstStroke) floodFill(x, y, activeColor);
        return;
      }

      if (isFirstStroke) {
        pushHistorySnapshot(canvasMap);
      }

      setCanvasMap((prev) => {
        const next = new Map(prev);
        if (taskTool === 'erase') {
          next.delete(key);
        } else {
          next.set(key, activeColor);
        }
        return next;
      });
    },
    [gridSize, taskTool, canvasMap, activeColor, floodFill, pushHistorySnapshot]
  );

  const getCellFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * gridSize);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * gridSize);
    return { x, y };
  };

  const handleTaskUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, new Map(canvasMap)]);
    setCanvasMap(new Map(previous));
    setUndoStack((u) => u.slice(0, -1));
  };

  const handleTaskRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, new Map(canvasMap)]);
    setCanvasMap(new Map(next));
    setRedoStack((r) => r.slice(0, -1));
  };

  // Swap current stage's random object with another unused object from the pool
  const handleRerollCurrentObject = () => {
    const unused = tasks.filter((t) => !dailyQueueIds.includes(t.id) && t.id !== activeTask?.id);
    const pool = unused.length > 0 ? unused : tasks.filter((t) => t.id !== activeTask?.id);
    if (pool.length === 0) return;

    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (isDailyQuotaComplete) {
      setBonusModeTask(pick);
    } else {
      const nextQueue = [...dailyQueueIds];
      nextQueue[currentStageIdx] = pick.id;
      setDailyQueueIds(nextQueue);
      saveDailyProgress(nextQueue, currentStageIdx);
    }
    setCanvasMap(new Map());
    setUndoStack([]);
    setRedoStack([]);
    setSubmitStatus({
      text: `Swapped to new random object: "${pick.title}"!`,
      kind: 'info',
    });
  };

  const handleLoadReferenceStarter = () => {
    if (!activeTask) return;
    pushHistorySnapshot(canvasMap);
    const next = new Map<string, string>();
    for (const p of activeTask.referencePixels) {
      next.set(`${p.x},${p.y}`, p.color);
    }
    setCanvasMap(next);
  };

  const handleCompleteAndAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTask || isSubmitting) return;
    if (drawnPixelsArray.length < 4) {
      setSubmitStatus({
        text: 'Draw at least 4 pixels of the object before completing this stage!',
        kind: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    const stageNumber = Math.min(DAILY_QUOTA_MAX, currentStageIdx + 1);
    const res = await onSubmitTask({
      taskId: activeTask.id,
      pixels: drawnPixelsArray,
      accuracyScore: Math.max(70, accuracyScore),
      title: submissionTitle || activeTask.title,
      description: submissionDesc,
      shareToCommunity,
      dailyStageIndex: stageNumber,
    });
    setIsSubmitting(false);

    if (res.ok) {
      try {
        confetti({ particleCount: 70, spread: 65, origin: { y: 0.65 } });
      } catch {
        // ignore
      }

      // Clear workspace and advance 1-by-1 to the NEXT random object in the 5-task daily run!
      setCanvasMap(new Map());
      setUndoStack([]);
      setRedoStack([]);

      if (!isDailyQuotaComplete) {
        const nextStage = currentStageIdx + 1;
        setCurrentStageIdx(nextStage);
        saveDailyProgress(dailyQueueIds, nextStage);

        if (nextStage >= DAILY_QUOTA_MAX) {
          setSubmitStatus({
            text: `🎉 DAILY 5/5 OBJECTS COMPLETE! You cleared all 5 random objects for today (+250 Bonus XP)!`,
            kind: 'good',
          });
        } else {
          const nextObj = dailyFiveTasks[nextStage];
          setSubmitStatus({
            text: `✅ Object ${stageNumber}/5 Complete! Automatically loaded Object ${nextStage + 1}/5: "${nextObj?.title || 'Next Object'}"!`,
            kind: 'good',
          });
        }
      } else {
        // In bonus endless mode, roll another random object immediately
        const pool = tasks.filter((t) => t.id !== activeTask.id);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        setBonusModeTask(pick);
        setSubmitStatus({
          text: `✅ Bonus Object Complete! Loaded next random object: "${pick.title}"!`,
          kind: 'good',
        });
      }
    } else {
      setSubmitStatus({
        text: res.error || 'Could not submit challenge.',
        kind: 'error',
      });
    }
  };

  const taskCommunityArtworks = useMemo(
    () => artworks.filter((a) => a.taskId === activeTask?.id),
    [artworks, activeTask]
  );

  return (
    <div className="view-section">
      {/* Header Banner: 1-by-1 Sequential 5-Task Daily Gauntlet */}
      <div className="section-hero-card">
        <div>
          <span className="eyebrow">
            SEQUENTIAL 5-OBJECT DAILY GAUNTLET · ONE BY ONE · NO GLOBAL COOLDOWN
          </span>
          <h1 className="view-title">
            {isDailyQuotaComplete
              ? '🎉 All 5 Daily Objects Completed!'
              : `Daily Object ${currentStageIdx + 1} of ${DAILY_QUOTA_MAX}: ${activeTask?.title || ''}`}
          </h1>
          <p className="lede">
            Every day you get <b>5 random objects one by one</b>. Complete your current object to
            automatically unlock the next random object in your 5-task daily run!
          </p>
        </div>
        <div className="task-hero-actions">
          <button type="button" className="btn" onClick={handleRerollCurrentObject}>
            <Shuffle size={16} /> Reroll Current Object
          </button>
          {isDailyQuotaComplete && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const pick = tasks[Math.floor(Math.random() * tasks.length)];
                setBonusModeTask(pick);
                setCanvasMap(new Map());
              }}
            >
              <Sparkles size={16} /> Next Bonus Random Object
            </button>
          )}
        </div>
      </div>

      {/* 5-Stage Sequential Progress Track (One by One) */}
      <div className="task-cards-strip" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        {dailyFiveTasks.map((t, idx) => {
          const isCompleted = idx < currentStageIdx;
          const isCurrent = idx === currentStageIdx && !isDailyQuotaComplete;
          const isLocked = idx > currentStageIdx;

          return (
            <div
              key={`${t.id}-${idx}`}
              className={`task-select-card ${isCurrent ? 'active' : ''}`}
              style={{
                opacity: isLocked ? 0.55 : 1,
                cursor: isLocked ? 'not-allowed' : 'default',
              }}
            >
              <div className="task-select-thumb" style={{ display: 'grid', placeItems: 'center' }}>
                {isLocked ? (
                  <Lock size={22} color="var(--muted)" />
                ) : (
                  <PixelArtworkPreview pixels={t.referencePixels} gridSize={t.gridSize} size={64} />
                )}
              </div>
              <div className="task-select-meta">
                <div className="task-badges-row">
                  <span className={`genz-pill ${isCurrent ? 'daily' : ''}`}>
                    OBJECT {idx + 1} / {DAILY_QUOTA_MAX}
                  </span>
                  {isCompleted && (
                    <span className="genz-pill done">
                      <CheckCircle2 size={11} /> Cleared
                    </span>
                  )}
                </div>
                <strong>{isLocked ? 'Mystery Random Object' : t.title}</strong>
                <span className="reward-tag">
                  {isLocked
                    ? `Complete Object ${idx}/5 to unlock`
                    : `+${t.rewardPoints} XP · ${t.category}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Task Drawing Workspace */}
      {activeTask && (
        <div className="task-studio-grid">
          {/* Left Column: Reference Image & Task Brief */}
          <div className="card task-reference-card">
            <h2>
              <span>
                {isDailyQuotaComplete
                  ? 'Bonus Random Object'
                  : `Active Object (${currentStageIdx + 1} of ${DAILY_QUOTA_MAX})`}
              </span>
              <span className="pick">
                {activeTask.gridSize}×{activeTask.gridSize} Grid
              </span>
            </h2>
            <div className="reference-preview-box">
              <PixelArtworkPreview
                pixels={activeTask.referencePixels}
                gridSize={activeTask.gridSize}
                size={240}
                showGrid={true}
                backgroundColor="#18171F"
              />
            </div>

            <div className="task-brief">
              <div className="task-badges-row">
                <span className="genz-pill daily">
                  {isDailyQuotaComplete
                    ? 'BONUS RUN'
                    : `STAGE ${currentStageIdx + 1} / ${DAILY_QUOTA_MAX}`}
                </span>
                <span className={`genz-pill diff-${activeTask.difficulty.toLowerCase()}`}>
                  {activeTask.difficulty}
                </span>
                <span className="genz-pill accent">+{activeTask.rewardPoints} XP</span>
              </div>
              <h3>{activeTask.title}</h3>
              <p>{activeTask.description}</p>
            </div>

            {/* Progress & Match Meter */}
            <div className="task-progress-box">
              <div className="progress-row">
                <span>Stroke Progress</span>
                <b>{progressPct}%</b>
              </div>
              <div className="trk">
                <i style={{ width: `${progressPct}%` }} />
              </div>
              <div className="progress-row" style={{ marginTop: 10 }}>
                <span>Object Match Score</span>
                <b>{accuracyScore}%</b>
              </div>
              <div className="trk">
                <i style={{ width: `${accuracyScore}%`, backgroundColor: 'var(--good)' }} />
              </div>
            </div>

            <div className="reference-helper-btns">
              <button
                type="button"
                className="tbtn"
                aria-pressed={showGhostReference}
                onClick={() => setShowGhostReference((g) => !g)}
              >
                <Eye size={13} /> {showGhostReference ? 'Hide Ghost Guide' : 'Show Ghost Guide'}
              </button>
              <button
                type="button"
                className="tbtn"
                onClick={handleLoadReferenceStarter}
                title="Load reference pixels onto your canvas to customize or remix"
              >
                <Sparkles size={13} /> Auto-Fill Reference to Remix
              </button>
            </div>
          </div>

          {/* Center Column: Interactive Task Drawing Canvas */}
          <div className="stage task-canvas-stage">
            <div className="bar">
              <div className="readout">
                <b>
                  Drawing Object {Math.min(DAILY_QUOTA_MAX, currentStageIdx + 1)}/{DAILY_QUOTA_MAX}
                </b>
                <span className="sub">
                  Zero cooldown · {drawnPixelsArray.length} pixels drawn
                </span>
              </div>
              <div className="tools">
                <div className="seg">
                  <button
                    type="button"
                    aria-pressed={taskTool === 'draw'}
                    onClick={() => setTaskTool('draw')}
                  >
                    Pencil
                  </button>
                  <button
                    type="button"
                    aria-pressed={taskTool === 'fill'}
                    onClick={() => setTaskTool('fill')}
                  >
                    <PaintBucket size={12} /> Fill
                  </button>
                  <button
                    type="button"
                    aria-pressed={taskTool === 'pick'}
                    onClick={() => setTaskTool('pick')}
                  >
                    <Pipette size={12} /> Pick
                  </button>
                  <button
                    type="button"
                    aria-pressed={taskTool === 'erase'}
                    onClick={() => setTaskTool('erase')}
                  >
                    <Eraser size={12} /> Erase
                  </button>
                </div>

                <div className="seg">
                  <button type="button" onClick={handleTaskUndo} disabled={undoStack.length === 0}>
                    <Undo2 size={13} />
                  </button>
                  <button type="button" onClick={handleTaskRedo} disabled={redoStack.length === 0}>
                    <Redo2 size={13} />
                  </button>
                </div>

                <button
                  type="button"
                  className="tbtn"
                  aria-pressed={showGrid}
                  onClick={() => setShowGrid((g) => !g)}
                >
                  <Grid size={13} /> Grid
                </button>

                <button
                  type="button"
                  className="tbtn"
                  onClick={() => {
                    pushHistorySnapshot(canvasMap);
                    setCanvasMap(new Map());
                  }}
                >
                  <RotateCcw size={13} /> Clear
                </button>
              </div>
            </div>

            <div className="task-canvas-scroller">
              <div
                className="task-canvas-wrapper"
                style={{
                  width: `${Math.round(380 * workspaceZoom)}px`,
                  height: `${Math.round(380 * workspaceZoom)}px`,
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={384}
                  height={384}
                  className="task-draw-canvas"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setIsDrawing(true);
                    const cell = getCellFromEvent(e);
                    if (cell) applyToolAt(cell.x, cell.y, true);
                  }}
                  onPointerMove={(e) => {
                    if (!isDrawing) return;
                    const cell = getCellFromEvent(e);
                    if (cell) applyToolAt(cell.x, cell.y, false);
                  }}
                  onPointerUp={() => setIsDrawing(false)}
                  onPointerCancel={() => setIsDrawing(false)}
                />
              </div>
            </div>

            <div className="canvas-footer-bar">
              <div className="seg">
                <button
                  type="button"
                  onClick={() => setWorkspaceZoom((z) => Math.max(0.8, Number((z - 0.2).toFixed(1))))}
                >
                  <ZoomOut size={13} />
                </button>
                <button type="button" onClick={() => setWorkspaceZoom(1)}>
                  {Math.round(workspaceZoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceZoom((z) => Math.min(1.6, Number((z + 0.2).toFixed(1))))}
                >
                  <ZoomIn size={13} />
                </button>
              </div>

              <button
                type="button"
                className="tbtn primary-outline"
                onClick={() =>
                  exportSpritePng({
                    pixels: drawnPixelsArray,
                    gridSize,
                    includeGrid: showGrid,
                    filename: submissionTitle || activeTask.id,
                  })
                }
              >
                <Download size={13} /> Download Object PNG
              </button>
            </div>
          </div>

          {/* Right Column: Task Color Palette & Next Object Submit Form */}
          <div className="panel">
            <div className="card">
              <h2>
                <span>Object Color Palette</span>
                <span className="pick">{activeColor}</span>
              </h2>
              <div className="swatches">
                {activeTask.palette.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className="sw"
                    style={{ backgroundColor: hex }}
                    aria-pressed={activeColor.toUpperCase() === hex.toUpperCase()}
                    onClick={() => {
                      setActiveColor(hex);
                      if (taskTool === 'erase' || taskTool === 'pick') setTaskTool('draw');
                    }}
                  />
                ))}
              </div>

              <h3 style={{ marginTop: 14 }}>
                <span>Full Studio Palette</span>
              </h3>
              <div className="swatches">
                {DOTWALL_PALETTE.slice(0, 16).map((sw) => (
                  <button
                    key={sw.hex}
                    type="button"
                    className="sw"
                    style={{ backgroundColor: sw.hex }}
                    aria-pressed={activeColor.toUpperCase() === sw.hex.toUpperCase()}
                    onClick={() => setActiveColor(sw.hex)}
                  />
                ))}
              </div>
            </div>

            <form className="card" onSubmit={handleCompleteAndAdvance}>
              <h2>
                <span>
                  {isDailyQuotaComplete
                    ? 'Submit Bonus Object'
                    : `Finish Object ${currentStageIdx + 1} of ${DAILY_QUOTA_MAX}`}
                </span>
                <span className="pick">+{activeTask.rewardPoints} XP</span>
              </h2>
              <div className="form-group">
                <label className="form-label">Artwork Title</label>
                <input
                  type="text"
                  className="text-input"
                  value={submissionTitle}
                  onChange={(e) => setSubmissionTitle(e.target.value)}
                  placeholder="Name your creation..."
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description / Vibe</label>
                <textarea
                  className="text-input"
                  rows={2}
                  value={submissionDesc}
                  onChange={(e) => setSubmissionDesc(e.target.value)}
                  placeholder="Share your technique or story..."
                />
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={shareToCommunity}
                  onChange={(e) => setShareToCommunity(e.target.checked)}
                />
                <span>Publish artwork to Community Explore gallery</span>
              </label>

              <button type="submit" className="go" disabled={isSubmitting}>
                <Send size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {isSubmitting
                  ? 'Submitting...'
                  : isDailyQuotaComplete
                    ? `Submit & Load Next Bonus Object`
                    : currentStageIdx + 1 < DAILY_QUOTA_MAX
                      ? `Submit Object ${currentStageIdx + 1}/5 & Load Next Object →`
                      : `Complete Final Object 5/5 & Claim +250 Bonus XP!`}
              </button>

              {submitStatus && (
                <p
                  className="msg"
                  data-kind={submitStatus.kind === 'error' ? 'error' : undefined}
                  style={{ color: submitStatus.kind === 'good' ? 'var(--good)' : undefined }}
                >
                  {submitStatus.text}
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Community Submissions for this Task + Task History */}
      <div className="two" style={{ marginTop: 28 }}>
        <div className="card">
          <h2>
            <span>Community Submissions for “{activeTask?.title}”</span>
            <span className="pick">{taskCommunityArtworks.length} entries</span>
          </h2>
          {taskCommunityArtworks.length === 0 ? (
            <p className="empty-line">
              Be the first player to submit artwork for this random object!
            </p>
          ) : (
            <div className="mini-art-grid">
              {taskCommunityArtworks.slice(0, 6).map((art) => (
                <div
                  key={art.id}
                  className="mini-art-card"
                  onClick={() => onOpenArtwork && onOpenArtwork(art)}
                >
                  <div className="mini-art-thumb">
                    <PixelArtworkPreview
                      pixels={art.pixels}
                      gridSize={art.gridSize}
                      size={96}
                      backgroundColor="#18171F"
                    />
                  </div>
                  <div className="mini-art-info">
                    <strong>{art.title}</strong>
                    <span>by @{art.creatorUsername}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>
            <span>Your Daily 5-Object History &amp; Rewards</span>
            <span className="pick">
              {Math.min(DAILY_QUOTA_MAX, currentStageIdx)} / {DAILY_QUOTA_MAX} today
            </span>
          </h2>
          {submissions.length === 0 ? (
            <p className="empty-line">
              No objects completed yet today — draw Object 1/5 above to start your streak!
            </p>
          ) : (
            <ul className="feed">
              {submissions.slice(0, 6).map((sub) => {
                const taskObj = tasks.find((t) => t.id === sub.taskId);
                return (
                  <li key={sub.id}>
                    <span className="sq" style={{ backgroundColor: '#5CF2B2' }} />
                    <span>
                      <b>@{sub.username}</b> completed <b>{taskObj?.title || sub.taskId}</b> (
                      {sub.accuracyScore}% match)
                    </span>
                    <span className="at">+{sub.pointsAwarded} XP</span>
                  </li>
                );
              })}
            </ul>
          )}

          <h3 style={{ marginTop: 18 }}>
            <span>Daily Gauntlet Badges</span>
          </h3>
          <div className="badge-strip">
            {achievementsCatalog.slice(0, 4).map((ach) => {
              const unlocked = currentUser?.achievements.includes(ach.id);
              return (
                <div key={ach.id} className={`ach-pill ${unlocked ? 'unlocked' : ''}`}>
                  <span className="ach-icon">{ach.icon}</span>
                  <div>
                    <strong>{ach.title}</strong>
                    <small>+{ach.xpReward} XP</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
