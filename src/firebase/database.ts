import {
  ref,
  get,
  set,
  update,
  push,
  onValue,
  runTransaction,
  query,
  limitToLast,
  type Unsubscribe,
} from 'firebase/database';
import { getFirebaseDb } from './app';
import { CANVAS_DIMENSION, CHUNK_SIZE, MAX_GLOBAL_PIXELS, PLAYER_COOLDOWN_MS } from './config';
import type {
  CommunityArtwork,
  CommunityComment,
  GlobalPixel,
  PixelHistoryEntry,
  PlayerProfile,
  TaskPixel,
  TaskSubmission,
} from '../types';

export function getChunkId(x: number, y: number): string {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  return `${cx}_${cy}`;
}

export function getVisibleChunkIds(
  centerX: number,
  centerY: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  zoom: number
): string[] {
  const halfSpanX = Math.ceil(viewportWidthPx / Math.max(1, zoom) / 2) + CHUNK_SIZE;
  const halfSpanY = Math.ceil(viewportHeightPx / Math.max(1, zoom) / 2) + CHUNK_SIZE;

  const minX = Math.max(0, Math.floor((centerX - halfSpanX) / CHUNK_SIZE));
  const maxX = Math.min(
    Math.floor((CANVAS_DIMENSION - 1) / CHUNK_SIZE),
    Math.floor((centerX + halfSpanX) / CHUNK_SIZE)
  );
  const minY = Math.max(0, Math.floor((centerY - halfSpanY) / CHUNK_SIZE));
  const maxY = Math.min(
    Math.floor((CANVAS_DIMENSION - 1) / CHUNK_SIZE),
    Math.floor((centerY + halfSpanY) / CHUNK_SIZE)
  );

  // Cap active simultaneous chunk listeners if zoomed all the way out
  const ids: string[] = [];
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      ids.push(`${cx}_${cy}`);
    }
  }
  // Always ensure the central plaza chunks (9_9, 9_10, 10_9, 10_10) are included
  for (const plaza of ['9_9', '9_10', '10_9', '10_10']) {
    if (!ids.includes(plaza)) ids.push(plaza);
  }
  return ids.slice(0, 36);
}

/**
 * Atomic Pixel Placement with Cooldown & Coordinate Validation
 */
export async function placePixelInFirebase(params: {
  user: PlayerProfile;
  x: number;
  y: number;
  color: string;
}): Promise<{
  ok: boolean;
  error?: string;
  pixel?: GlobalPixel;
  historyEntry?: PixelHistoryEntry;
  nextCooldownAt?: number;
  isReplacement?: boolean;
}> {
  const { user, x, y, color } = params;

  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= CANVAS_DIMENSION || y < 0 || y >= CANVAS_DIMENSION) {
    return { ok: false, error: 'Coordinates must be integers between (0, 0) and (999, 999).' };
  }

  const cleanColor = String(color || '').toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(cleanColor)) {
    return { ok: false, error: 'Invalid HEX color format.' };
  }

  const db = getFirebaseDb();
  const now = Date.now();
  const cooldownRef = ref(db, `cooldowns/${user.id}`);

  // 1. Atomic transaction on player's UID cooldown node
  let assignedNextCooldown = now + PLAYER_COOLDOWN_MS;
  try {
    const cdResult = await runTransaction(cooldownRef, (current) => {
      if (current && current.nextCooldownAt && now < Number(current.nextCooldownAt)) {
        // Abort transaction — player is still on cooldown
        return;
      }
      return {
        uid: user.id,
        lastPlacedAt: now,
        nextCooldownAt: assignedNextCooldown,
      };
    });

    if (!cdResult.committed) {
      const snap = cdResult.snapshot.val();
      const rem = snap?.nextCooldownAt ? Math.ceil((Number(snap.nextCooldownAt) - now) / 1000) : 30;
      return {
        ok: false,
        error: `Cooldown active! Wait ${Math.max(1, rem)}s before placing your next pixel.`,
        nextCooldownAt: Number(snap?.nextCooldownAt || now + 5000),
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Could not verify cooldown with database.',
    };
  }

  // 2. Atomic transaction on the target pixel coordinate inside its 50x50 chunk
  const chunkId = getChunkId(x, y);
  const pixelKey = `${x}_${y}`;
  const pixelRef = ref(db, `canvasChunks/${chunkId}/${pixelKey}`);

  let prevPixel: GlobalPixel | null = null;
  let committedPixel: GlobalPixel | null = null;

  try {
    const pxTx = await runTransaction(pixelRef, (existing) => {
      if (existing) {
        prevPixel = existing as GlobalPixel;
      }
      const nextVersion = existing ? Number(existing.version || 1) + 1 : 1;
      const next: GlobalPixel = {
        x,
        y,
        color: cleanColor,
        ownerId: user.id,
        ownerUsername: user.username,
        version: nextVersion,
        updatedAt: now,
      };
      return next;
    });

    committedPixel = pxTx.snapshot.val() as GlobalPixel;
  } catch (err: any) {
    // Rollback cooldown so failed requests never consume cooldown!
    await set(cooldownRef, { uid: user.id, lastPlacedAt: 0, nextCooldownAt: 0 }).catch(() => {});
    return {
      ok: false,
      error: err?.message || 'Failed to write pixel to chunk.',
    };
  }

  const isReplacement = Boolean(prevPixel);

  // 3. Record placement history entry & update global occupied counter if new slot
  const historyId = `hist_${now}_${user.id.slice(0, 5)}`;
  const historyEntry: PixelHistoryEntry = {
    id: historyId,
    x,
    y,
    prevColor: prevPixel ? (prevPixel as GlobalPixel).color : null,
    prevOwnerId: prevPixel ? (prevPixel as GlobalPixel).ownerId : null,
    prevOwnerUsername: prevPixel ? (prevPixel as GlobalPixel).ownerUsername : null,
    newColor: cleanColor,
    userId: user.id,
    username: user.username,
    actionType: isReplacement ? 'replace' : 'place',
    pixelVersion: committedPixel.version,
    undone: false,
    createdAt: now,
  };

  await set(ref(db, `placements/${historyId}`), historyEntry).catch(() => {});

  // Update user's trusted stats atomically
  const userRef = ref(db, `users/${user.id}`);
  await runTransaction(userRef, (u) => {
    if (!u) return u;
    const ach = new Set<string>(Array.isArray(u.achievements) ? u.achievements : []);
    ach.add('first_dot');
    if (isReplacement) ach.add('pixel_modifier');
    if ((u.pixelsPlaced || 0) + 1 >= 10) ach.add('pixel_ten');
    if ((u.pixelsPlaced || 0) + 1 >= 50) ach.add('pixel_fifty');

    return {
      ...u,
      pixelsPlaced: Number(u.pixelsPlaced || 0) + 1,
      points: Number(u.points || 0) + (isReplacement ? 12 : 10),
      lastPixelAt: now,
      nextCooldownAt: assignedNextCooldown,
      achievements: Array.from(ach),
    };
  }).catch(() => {});

  return {
    ok: true,
    pixel: committedPixel,
    historyEntry,
    nextCooldownAt: assignedNextCooldown,
    isReplacement,
  };
}

/**
 * Atomic Undo Validation:
 * Only allows undoing the player's own recent placement if no other player has modified that coordinate since.
 * Does NOT reset or bypass the player's active 30-second cooldown!
 */
export async function undoLastPlacementInFirebase(
  user: PlayerProfile,
  recentHistory: PixelHistoryEntry[]
): Promise<{
  ok: boolean;
  error?: string;
  x?: number;
  y?: number;
  restoredPixel?: GlobalPixel | null;
}> {
  const myEligible = [...recentHistory]
    .reverse()
    .find(
      (h) =>
        h.userId === user.id &&
        !h.undone &&
        (h.actionType === 'place' || h.actionType === 'replace')
    );

  if (!myEligible) {
    return { ok: false, error: 'No eligible recent placement of yours found to undo.' };
  }

  const db = getFirebaseDb();
  const chunkId = getChunkId(myEligible.x, myEligible.y);
  const pixelKey = `${myEligible.x}_${myEligible.y}`;
  const pixelRef = ref(db, `canvasChunks/${chunkId}/${pixelKey}`);

  const snap = await get(pixelRef);
  if (!snap.exists()) {
    return { ok: false, error: 'That pixel position is already empty.' };
  }

  const currentPixel = snap.val() as GlobalPixel;
  if (
    currentPixel.ownerId !== user.id ||
    Number(currentPixel.version) !== Number(myEligible.pixelVersion)
  ) {
    return {
      ok: false,
      error: `Cannot undo (${myEligible.x}, ${myEligible.y}): another player has modified this pixel since your placement.`,
    };
  }

  const now = Date.now();
  let restoredPixel: GlobalPixel | null = null;

  if (!myEligible.prevColor) {
    // Clearing frees that position
    await set(pixelRef, null);
  } else {
    restoredPixel = {
      x: myEligible.x,
      y: myEligible.y,
      color: myEligible.prevColor,
      ownerId: myEligible.prevOwnerId || user.id,
      ownerUsername: myEligible.prevOwnerUsername || user.username,
      version: currentPixel.version + 1,
      updatedAt: now,
    };
    await set(pixelRef, restoredPixel);
  }

  await update(ref(db, `placements/${myEligible.id}`), { undone: true }).catch(() => {});

  return {
    ok: true,
    x: myEligible.x,
    y: myEligible.y,
    restoredPixel,
  };
}

/**
 * Submit Task Artwork & Grant Verified Reward (Prevents duplicate daily reward claims)
 */
export async function submitTaskInFirebase(params: {
  user: PlayerProfile;
  taskId: string;
  taskTitle: string;
  taskCategory: string;
  gridSize: number;
  rewardPoints: number;
  pixels: TaskPixel[];
  accuracyScore: number;
  title: string;
  description: string;
  shareToCommunity: boolean;
  dailyStageIndex?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  submission?: TaskSubmission;
  artwork?: CommunityArtwork;
  pointsGranted?: number;
}> {
  const {
    user,
    taskId,
    taskCategory,
    gridSize,
    rewardPoints,
    pixels,
    accuracyScore,
    title,
    description,
    shareToCommunity,
    dailyStageIndex,
  } = params;

  if (!Array.isArray(pixels) || pixels.length < 4) {
    return { ok: false, error: 'Draw at least 4 pixels in the task workspace before submitting.' };
  }

  const db = getFirebaseDb();
  const now = Date.now();
  const utcDateKey = new Date(now).toISOString().slice(0, 10);
  const claimKey = `${user.id}_${taskId}_${utcDateKey}`;
  const claimRef = ref(db, `taskClaims/${claimKey}`);

  const claimSnap = await get(claimRef);
  const alreadyClaimedToday = claimSnap.exists();
  const grantedPoints = alreadyClaimedToday
    ? 0
    : rewardPoints + (dailyStageIndex === 5 ? 250 : 0);

  if (!alreadyClaimedToday) {
    await set(claimRef, {
      uid: user.id,
      taskId,
      utcDateKey,
      pointsGranted: grantedPoints,
      claimedAt: now,
    }).catch(() => {});
  }

  const subId = `sub_${now}_${user.id.slice(0, 5)}`;
  const submission: TaskSubmission = {
    id: subId,
    taskId,
    userId: user.id,
    username: user.username,
    gridSize,
    pixels,
    accuracyScore,
    pointsAwarded: grantedPoints,
    createdAt: now,
  };

  await set(ref(db, `taskSubmissions/${subId}`), submission).catch(() => {});

  let createdArtwork: CommunityArtwork | undefined;
  if (shareToCommunity) {
    const artId = `art_${now}_${user.id.slice(0, 5)}`;
    createdArtwork = {
      id: artId,
      title: title.slice(0, 80),
      description: description.slice(0, 280),
      category: taskCategory,
      gridSize,
      pixels,
      creatorId: user.id,
      creatorUsername: user.username,
      creatorAvatar: user.avatarEmoji,
      creatorColor: user.avatarColor,
      taskId,
      likes: [user.id],
      commentsCount: 0,
      createdAt: now,
    };
    await set(ref(db, `artworks/${artId}`), createdArtwork).catch(() => {});
  }

  if (grantedPoints > 0) {
    const userRef = ref(db, `users/${user.id}`);
    await runTransaction(userRef, (u) => {
      if (!u) return u;
      const ach = new Set<string>(Array.isArray(u.achievements) ? u.achievements : []);
      ach.add('task_rookie');
      if (dailyStageIndex === 5) ach.add('daily_five_sweep');
      return {
        ...u,
        tasksCompleted: Number(u.tasksCompleted || 0) + 1,
        points: Number(u.points || 0) + grantedPoints,
        achievements: Array.from(ach),
      };
    }).catch(() => {});
  }

  return {
    ok: true,
    submission,
    artwork: createdArtwork,
    pointsGranted: grantedPoints,
  };
}

export { ref, get, set, update, push, onValue, runTransaction, query, limitToLast, type Unsubscribe };
