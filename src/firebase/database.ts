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
import {
  isDeveloperAdmin,
  isReservedAdminHandle,
  type CommunityArtwork,
  type CommunityComment,
  type GlobalPixel,
  type PixelHistoryEntry,
  type PlayerProfile,
  type TaskPixel,
  type TaskSubmission,
} from '../types';

let cachedServerTimeOffsetMs = 0;

export function getEstimatedServerNow(): number {
  return Date.now() + cachedServerTimeOffsetMs;
}

export function subscribeToServerTimeOffset(onOffset?: (offsetMs: number) => void): Unsubscribe {
  const db = getFirebaseDb();
  const offsetRef = ref(db, '.info/serverTimeOffset');
  return onValue(offsetRef, (snap) => {
    const val = Number(snap.val() || 0);
    if (Number.isFinite(val)) {
      cachedServerTimeOffsetMs = val;
      onOffset?.(val);
    }
  });
}

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
  const serverNow = getEstimatedServerNow();
  const isAdmin = isDeveloperAdmin(user);
  const chunkId = getChunkId(x, y);
  const pixelKey = `${x}_${y}`;
  const targetKey = `${chunkId}/${pixelKey}`;

  // Read current cooldown and current pixel state before composing atomic multi-path write
  const [cdSnap, pxSnap, userSnap] = await Promise.all([
    isAdmin ? Promise.resolve(null) : get(ref(db, `cooldowns/${user.id}`)),
    get(ref(db, `canvasChunks/${chunkId}/${pixelKey}`)),
    get(ref(db, `users/${user.id}`)),
  ]);

  if (!isAdmin && cdSnap && cdSnap.exists()) {
    const cdVal = cdSnap.val();
    if (cdVal?.nextCooldownAt && serverNow < Number(cdVal.nextCooldownAt)) {
      const rem = Math.max(1, Math.ceil((Number(cdVal.nextCooldownAt) - serverNow) / 1000));
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
  const assignedNextCooldown = isAdmin ? 0 : serverNow + PLAYER_COOLDOWN_MS + 350;
  const historyId = `hist_${serverNow}_${user.id.slice(0, 5)}`;

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
    [`canvasChunks/${chunkId}/${pixelKey}`]: pixelPayload,
    [`placements/${historyId}`]: historyPayload,
  };

  if (!isAdmin) {
    multiPathUpdates[`cooldowns/${user.id}`] = {
      uid: user.id,
      lastPlacedAt: serverTimestamp(),
      nextCooldownAt: assignedNextCooldown,
      targetKey,
      targetVersion: nextVersion,
    };
  }

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
    updatedAt: serverNow,
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
    createdAt: serverNow,
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

export async function updateProfileInFirebase(
  user: PlayerProfile,
  payload: {
    username: string;
    displayName: string;
    bio: string;
    avatarEmoji: string;
    avatarColor: string;
  }
): Promise<{ ok: boolean; error?: string; user?: PlayerProfile }> {
  const isAdmin = isDeveloperAdmin(user);
  const cleanUsername = payload.username
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 24);

  if (cleanUsername.length < 2) {
    return { ok: false, error: 'Username must be at least 2 characters.' };
  }
  if (!isAdmin && isReservedAdminHandle(cleanUsername)) {
    return { ok: false, error: 'That username is reserved and cannot be used.' };
  }

  const db = getFirebaseDb();
  const userRef = ref(db, `users/${user.id}`);
  try {
    const snap = await get(userRef);
    const existing = snap.exists() ? snap.val() : user;
    const updatedProfile: PlayerProfile = {
      id: user.id,
      username: isAdmin ? 'zero_sus' : cleanUsername,
      displayName: payload.displayName.replace(/[<>]/g, '').trim().slice(0, 32) || cleanUsername,
      bio: payload.bio.replace(/[<>]/g, '').trim().slice(0, 160),
      avatarEmoji: payload.avatarEmoji.slice(0, 8) || '👾',
      avatarColor: /^#[0-9A-Fa-f]{6}$/.test(payload.avatarColor) ? payload.avatarColor : '#6B3DFF',
      pixelsPlaced: Number(existing.pixelsPlaced ?? user.pixelsPlaced ?? 0),
      tasksCompleted: Number(existing.tasksCompleted ?? user.tasksCompleted ?? 0),
      points: Number(existing.points ?? user.points ?? 50),
      joinedAt: Number(existing.joinedAt ?? user.joinedAt ?? Date.now()),
      lastPixelAt: Number(existing.lastPixelAt ?? user.lastPixelAt ?? 0),
      nextCooldownAt: isAdmin ? 0 : Number(existing.nextCooldownAt ?? user.nextCooldownAt ?? 0),
      achievements: Array.isArray(existing.achievements)
        ? existing.achievements
        : user.achievements || [],
      ...(isAdmin ? { isAdmin: true } : {}),
    };

    const dbPayload: Record<string, any> = {
      ...updatedProfile,
      updatedAt: serverTimestamp(),
    };
    await set(userRef, dbPayload);
    return { ok: true, user: updatedProfile };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Could not update profile.' };
  }
}

export async function postCommentInFirebase(
  user: PlayerProfile,
  payload: { artworkId: string | null; parentId?: string | null; content: string }
): Promise<{ ok: boolean; error?: string; comment?: CommunityComment }> {
  const cleanContent = payload.content.replace(/[<>]/g, '').trim().slice(0, 500);
  if (!cleanContent) {
    return { ok: false, error: 'Comment cannot be empty.' };
  }
  const now = getEstimatedServerNow();
  const commentId = `cmt_${now}_${user.id.slice(0, 5)}`;
  const db = getFirebaseDb();
  const record = {
    id: commentId,
    artworkId: payload.artworkId || null,
    parentId: payload.parentId || null,
    userId: user.id,
    username: user.username.slice(0, 24),
    avatarEmoji: user.avatarEmoji,
    avatarColor: user.avatarColor,
    content: cleanContent,
    createdAt: serverTimestamp(),
  };
  try {
    await set(ref(db, `comments/${commentId}`), record);
    return {
      ok: true,
      comment: {
        ...record,
        likes: [],
        reported: false,
        reportReason: null,
        hidden: false,
        createdAt: now,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to post comment.' };
  }
}

export async function reportCommentInFirebase(
  user: PlayerProfile,
  targetId: string,
  reason: string
): Promise<void> {
  const cleanReason = reason.replace(/[<>]/g, '').trim().slice(0, 300);
  if (cleanReason.length < 3) return;
  const now = getEstimatedServerNow();
  const reportId = `rep_${now}_${user.id.slice(0, 5)}`;
  const db = getFirebaseDb();
  await set(ref(db, `reports/${reportId}`), {
    id: reportId,
    targetId,
    reporterId: user.id,
    reason: cleanReason,
    createdAt: serverTimestamp(),
  }).catch(() => {});
}

export async function adminErasePixelsInFirebase(
  adminUser: PlayerProfile | null,
  coords: { x: number; y: number }[]
): Promise<void> {
  if (!isDeveloperAdmin(adminUser)) {
    throw new Error('Unauthorized: Only @zero_sus can erase pixels.');
  }
  try {
    const db = getFirebaseDb();
    const multiUpdates: Record<string, null> = {};
    for (const c of coords) {
      if (c.x >= 0 && c.x < 1000 && c.y >= 0 && c.y < 1000) {
        const chunkId = getChunkId(c.x, c.y);
        multiUpdates[`canvasChunks/${chunkId}/${c.x}_${c.y}`] = null;
      }
    }
    if (Object.keys(multiUpdates).length > 0) {
      await update(ref(db), multiUpdates);
    }
  } catch {
    // ignore if offline
  }
}

export async function adminBatchPlacePixelsInFirebase(
  adminUser: PlayerProfile | null,
  pixels: GlobalPixel[]
): Promise<void> {
  if (!isDeveloperAdmin(adminUser)) {
    throw new Error('Unauthorized: Only @zero_sus can batch place pixels.');
  }
  try {
    const db = getFirebaseDb();
    const multiUpdates: Record<string, any> = {};
    for (const px of pixels) {
      if (px.x >= 0 && px.x < 1000 && px.y >= 0 && px.y < 1000) {
        const chunkId = getChunkId(px.x, px.y);
        multiUpdates[`canvasChunks/${chunkId}/${px.x}_${px.y}`] = {
          x: px.x,
          y: px.y,
          color: String(px.color || '#6B3DFF').toUpperCase(),
          ownerId: adminUser.id,
          ownerUsername: 'zero_sus',
          version: Number(px.version || 1),
          updatedAt: serverTimestamp(),
        };
      }
    }
    if (Object.keys(multiUpdates).length > 0) {
      await update(ref(db), multiUpdates);
    }
  } catch {
    // ignore if offline
  }
}

export async function adminDeleteUserInFirebase(
  adminUser: PlayerProfile | null,
  userId: string
): Promise<void> {
  if (!isDeveloperAdmin(adminUser)) {
    throw new Error('Unauthorized: Only @zero_sus can delete users.');
  }
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

export async function adminUpdateUserInFirebase(
  adminUser: PlayerProfile | null,
  targetUser: PlayerProfile
): Promise<void> {
  if (!isDeveloperAdmin(adminUser)) {
    throw new Error('Unauthorized: Only @zero_sus can update users.');
  }
  try {
    const db = getFirebaseDb();
    await set(ref(db, `users/${targetUser.id}`), {
      ...targetUser,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // ignore
  }
}

export async function adminDeleteArtworkInFirebase(
  adminUser: PlayerProfile | null,
  artworkId: string
): Promise<void> {
  if (!isDeveloperAdmin(adminUser)) {
    throw new Error('Unauthorized: Only @zero_sus can delete artworks.');
  }
  try {
    const db = getFirebaseDb();
    await set(ref(db, `artworks/${artworkId}`), null);
  } catch {
    // ignore
  }
}

export async function adminDeleteCommentInFirebase(
  adminUser: PlayerProfile | null,
  commentId: string
): Promise<void> {
  if (!isDeveloperAdmin(adminUser)) {
    throw new Error('Unauthorized: Only @zero_sus can delete comments.');
  }
  try {
    const db = getFirebaseDb();
    await set(ref(db, `comments/${commentId}`), null);
  } catch {
    // ignore
  }
}

export async function adminBroadcastInFirebase(
  adminUser: PlayerProfile | null,
  title: string,
  message: string
): Promise<void> {
  if (!isDeveloperAdmin(adminUser)) {
    throw new Error('Unauthorized: Only an administrator can broadcast announcements.');
  }
  try {
    const db = getFirebaseDb();
    await set(ref(db, 'system/broadcast'), {
      id: `bc_${Date.now()}`,
      title: title.slice(0, 80),
      message: message.slice(0, 300),
      adminUid: adminUser.id,
      senderUsername: adminUser.username,
      createdAt: serverTimestamp(),
    });
  } catch {
    // ignore
  }
}

export async function adminPromoteUserInFirebase(
  adminUser: PlayerProfile | null,
  targetUserId: string,
  promote: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!isDeveloperAdmin(adminUser)) {
    return { ok: false, error: 'Unauthorized: Only an administrator can assign admin roles.' };
  }
  try {
    const db = getFirebaseDb();
    const updates: Record<string, any> = {
      [`users/${targetUserId}/isAdmin`]: promote ? true : null,
      [`admins/${targetUserId}`]: promote ? true : null,
      [`users/${targetUserId}/updatedAt`]: serverTimestamp(),
    };
    if (promote) {
      updates[`cooldowns/${targetUserId}/nextCooldownAt`] = 0;
    }
    await update(ref(db), updates);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to update admin role in Firebase.' };
  }
}

export async function adminUpdatePasskeyInFirebase(
  adminUser: PlayerProfile | null,
  newPasskey: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isDeveloperAdmin(adminUser)) {
    return { ok: false, error: 'Unauthorized: Only an administrator can update the passkey.' };
  }
  const cleanPasskey = newPasskey.trim();
  if (cleanPasskey.length < 6) {
    return { ok: false, error: 'Admin passkey must be at least 6 characters long.' };
  }
  try {
    const db = getFirebaseDb();
    await set(ref(db, 'system/adminPasskey'), cleanPasskey);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to update admin passkey in database.' };
  }
}

export async function fetchAdminPasskeyFromFirebase(): Promise<string | null> {
  try {
    const db = getFirebaseDb();
    const snap = await get(ref(db, 'system/adminPasskey'));
    return snap.exists() ? String(snap.val()) : null;
  } catch {
    return null;
  }
}

export { ref, get, set, update, push, onValue, runTransaction, query, limitToLast, type Unsubscribe };
