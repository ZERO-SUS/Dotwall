import {
  ref,
  get,
  set,
  update,
  push,
  onValue,
  runTransaction,
  serverTimestamp,
  query,
  limitToLast,
  type Unsubscribe,
} from 'firebase/database';
import { getFirebaseDb } from './app';
import { CANVAS_DIMENSION, CHUNK_SIZE, PLAYER_COOLDOWN_MS } from './config';
import type {
  CommunityArtwork,
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

  const ids: string[] = [];
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      ids.push(`${cx}_${cy}`);
    }
  }
  for (const plaza of ['9_9', '9_10', '10_9', '10_10']) {
    if (!ids.includes(plaza)) ids.push(plaza);
  }
  return ids.slice(0, 36);
}

/**
 * Atomic Multi-Path Pixel Placement with Server-Timestamped Cooldown Lock:
 * Writes `cooldowns/{uid}`, `canvasChunks/{chunkId}/{x}_{y}`, `placements/{historyId}`,
 * and `users/{uid}` in a SINGLE atomic `update(ref(db), updates)` call so `database.rules.json`
 * can cross-validate `newData.parent().parent().parent().child('cooldowns/' + auth.uid)`
 * and guarantee 1 pixel per 30 seconds without any rollback loophole.
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

  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    x >= CANVAS_DIMENSION ||
    y < 0 ||
    y >= CANVAS_DIMENSION
  ) {
    return { ok: false, error: 'Coordinates must be integers between (0, 0) and (999, 999).' };
  }

  const cleanColor = String(color || '').toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(cleanColor)) {
    return { ok: false, error: 'Invalid HEX color format.' };
  }

  const db = getFirebaseDb();
  const now = Date.now();
  const chunkId = getChunkId(x, y);
  const pixelKey = `${x}_${y}`;
  const targetKey = `${chunkId}/${pixelKey}`;

  // Read current cooldown and current pixel state before composing atomic multi-path write
  const [cdSnap, pxSnap, userSnap] = await Promise.all([
    get(ref(db, `cooldowns/${user.id}`)),
    get(ref(db, `canvasChunks/${chunkId}/${pixelKey}`)),
    get(ref(db, `users/${user.id}`)),
  ]);

  if (cdSnap.exists()) {
    const cdVal = cdSnap.val();
    if (cdVal?.nextCooldownAt && now < Number(cdVal.nextCooldownAt)) {
      const rem = Math.max(1, Math.ceil((Number(cdVal.nextCooldownAt) - now) / 1000));
      return {
        ok: false,
        error: `Cooldown active! Wait ${rem}s before placing your next pixel.`,
        nextCooldownAt: Number(cdVal.nextCooldownAt),
      };
    }
  }

  const existingPixel = pxSnap.exists() ? (pxSnap.val() as GlobalPixel) : null;
  const isReplacement = Boolean(existingPixel);
  const nextVersion = existingPixel ? Number(existingPixel.version || 1) + 1 : 1;
  const assignedNextCooldown = now + PLAYER_COOLDOWN_MS + 400; // +400ms network buffer so >= now + 30000 on server
  const historyId = `hist_${now}_${user.id.slice(0, 5)}`;

  const pixelPayload: Record<string, any> = {
    x,
    y,
    color: cleanColor,
    ownerId: user.id,
    ownerUsername: user.username.slice(0, 24),
    version: nextVersion,
    updatedAt: serverTimestamp(),
  };

  if (existingPixel) {
    pixelPayload.prevColor = existingPixel.color;
    pixelPayload.prevOwnerId = existingPixel.ownerId;
    pixelPayload.prevOwnerUsername = existingPixel.ownerUsername;
  }

  const historyPayload: Record<string, any> = {
    id: historyId,
    x,
    y,
    prevColor: existingPixel ? existingPixel.color : null,
    prevOwnerId: existingPixel ? existingPixel.ownerId : null,
    prevOwnerUsername: existingPixel ? existingPixel.ownerUsername : null,
    newColor: cleanColor,
    userId: user.id,
    username: user.username.slice(0, 24),
    actionType: isReplacement ? 'replace' : 'place',
    pixelVersion: nextVersion,
    undone: false,
    createdAt: serverTimestamp(),
  };

  const multiPathUpdates: Record<string, any> = {
    [`cooldowns/${user.id}`]: {
      uid: user.id,
      lastPlacedAt: serverTimestamp(),
      nextCooldownAt: assignedNextCooldown,
      targetKey,
      targetVersion: nextVersion,
    },
    [`canvasChunks/${chunkId}/${pixelKey}`]: pixelPayload,
    [`placements/${historyId}`]: historyPayload,
  };

  if (userSnap.exists()) {
    const u = userSnap.val();
    const ach = new Set<string>(Array.isArray(u.achievements) ? u.achievements : []);
    ach.add('first_dot');
    if (isReplacement) ach.add('pixel_modifier');
    if (Number(u.pixelsPlaced || 0) + 1 >= 10) ach.add('pixel_ten');
    if (Number(u.pixelsPlaced || 0) + 1 >= 50) ach.add('pixel_fifty');

    multiPathUpdates[`users/${user.id}`] = {
      ...u,
      id: user.id,
      pixelsPlaced: Number(u.pixelsPlaced || 0) + 1,
      tasksCompleted: Number(u.tasksCompleted || 0),
      points: Number(u.points || 50) + (isReplacement ? 12 : 10),
      lastPixelAt: serverTimestamp(),
      nextCooldownAt: assignedNextCooldown,
      achievements: Array.from(ach),
    };
  }

  try {
    await update(ref(db), multiPathUpdates);
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Atomic pixel placement rejected by database security rules.',
    };
  }

  const committedPixel: GlobalPixel = {
    x,
    y,
    color: cleanColor,
    ownerId: user.id,
    ownerUsername: user.username,
    version: nextVersion,
    updatedAt: now,
  };

  const historyEntry: PixelHistoryEntry = {
    id: historyId,
    x,
    y,
    prevColor: existingPixel ? existingPixel.color : null,
    prevOwnerId: existingPixel ? existingPixel.ownerId : null,
    prevOwnerUsername: existingPixel ? existingPixel.ownerUsername : null,
    newColor: cleanColor,
    userId: user.id,
    username: user.username,
    actionType: isReplacement ? 'replace' : 'place',
    pixelVersion: nextVersion,
    undone: false,
    createdAt: now,
  };

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
 * Enforced by `database.rules.json` via `data.child('ownerId').val() === auth.uid` and stored `prevColor`/`prevOwnerId`.
 * Never touches `cooldowns/{uid}`, so Undo cannot reset or bypass the 30-second cooldown.
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

  const currentPixel = snap.val() as any;
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

  if (!currentPixel.prevColor) {
    await set(pixelRef, null);
  } else {
    const restoredPayload = {
      x: myEligible.x,
      y: myEligible.y,
      color: currentPixel.prevColor,
      ownerId: currentPixel.prevOwnerId || user.id,
      ownerUsername: currentPixel.prevOwnerUsername || user.username,
      version: Number(currentPixel.version) + 1,
      updatedAt: serverTimestamp(),
    };
    await set(pixelRef, restoredPayload);
    restoredPixel = {
      ...restoredPayload,
      updatedAt: now,
    };
  }

  const histRef = ref(db, `placements/${myEligible.id}`);
  const histSnap = await get(histRef);
  if (histSnap.exists()) {
    await set(histRef, {
      ...histSnap.val(),
      undone: true,
    }).catch(() => {});
  }

  return {
    ok: true,
    x: myEligible.x,
    y: myEligible.y,
    restoredPixel,
  };
}

/**
 * Submit Task Artwork & Record Daily Task Claim
 * Note: Without Cloud Functions (Spark Tier / Option B), task submissions and artworks are stored
 * with write-once claim keys (`taskClaims/{uid}_{taskId}_{utcDateKey}`), while competitive XP/leaderboard
 * mutations require Cloud Functions (Option A) to prevent client-side score spoofing.
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
  if (claimSnap.exists()) {
    return {
      ok: false,
      error: `Duplicate daily task claim blocked: reward for "${taskId}" already claimed on ${utcDateKey} UTC.`,
    };
  }

  const grantedPoints = rewardPoints + (dailyStageIndex === 5 ? 250 : 0);

  await set(claimRef, {
    uid: user.id,
    taskId,
    utcDateKey,
    pointsGranted: grantedPoints,
    claimedAt: serverTimestamp(),
  });

  const subId = `sub_${now}_${user.id.slice(0, 5)}`;
  const submissionPayload = {
    id: subId,
    taskId,
    userId: user.id,
    username: user.username,
    gridSize,
    pixels,
    accuracyScore,
    pointsAwarded: grantedPoints,
    createdAt: serverTimestamp(),
  };

  await set(ref(db, `taskSubmissions/${subId}`), submissionPayload);

  let createdArtwork: CommunityArtwork | undefined;
  if (shareToCommunity) {
    const artId = `art_${now}_${user.id.slice(0, 5)}`;
    const artworkPayload = {
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
      createdAt: serverTimestamp(),
    };
    await set(ref(db, `artworks/${artId}`), artworkPayload);
    createdArtwork = {
      ...artworkPayload,
      createdAt: now,
    };
  }

  return {
    ok: true,
    submission: {
      ...submissionPayload,
      createdAt: now,
    },
    artwork: createdArtwork,
    pointsGranted: grantedPoints,
  };
}

export async function adminErasePixelsInFirebase(coords: { x: number; y: number }[]): Promise<void> {
  try {
    const db = getFirebaseDb();
    const multiUpdates: Record<string, null> = {};
    for (const c of coords) {
      if (c.x >= 0 && c.x < 1000 && c.y >= 0 && c.y < 1000) {
        const chunkId = getChunkId(c.x, c.y);
        multiUpdates[`canvas/chunks/${chunkId}/${c.x}_${c.y}`] = null;
        multiUpdates[`canvasChunks/${chunkId}/${c.x}_${c.y}`] = null;
      }
    }
    if (Object.keys(multiUpdates).length > 0) {
      await update(ref(db), multiUpdates);
    }
  } catch {
    // ignore if rules locked
  }
}

export async function adminDeleteUserInFirebase(userId: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    await update(ref(db), {
      [`users/${userId}`]: null,
      [`cooldowns/${userId}`]: null,
      [`presence/${userId}`]: null,
    });
  } catch {
    // ignore if rules locked
  }
}

export async function adminDeleteArtworkInFirebase(artworkId: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    await set(ref(db, `artworks/${artworkId}`), null);
  } catch {
    // ignore
  }
}

export async function adminDeleteCommentInFirebase(commentId: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    await set(ref(db, `comments/${commentId}`), null);
  } catch {
    // ignore
  }
}

export { ref, get, set, update, push, onValue, runTransaction, query, limitToLast, type Unsubscribe };
