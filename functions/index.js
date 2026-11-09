/**
 * DOTWALL — TRUSTED FIREBASE CLOUD FUNCTIONS (OPTION A ARCHITECTURE)
 *
 * IMPORTANT SECURITY NOTE:
 * Cloud Functions are NOT currently deployed on `dotwall-13046` because Firebase
 * requires upgrading from the free Spark plan to the Blaze pay-as-you-go plan.
 * Until deployed, backend Cloud Function protection is NOT active; only
 * `database.rules.json` is enforced by Firebase Realtime Database.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.database();

const COOLDOWN_MS = 30000;
const CHUNK_SIZE = 50;

/**
 * 1. Trusted Pixel Placement & Replacement (Enforces 30s cooldown, coordinates, HEX, and XP)
 */
exports.placePixelTrusted = onCall({ region: 'asia-southeast1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required to place pixels.');
  }

  const uid = request.auth.uid;
  const x = Number(request.data.x);
  const y = Number(request.data.y);
  const color = String(request.data.color || '').toUpperCase();

  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 1000 || y < 0 || y >= 1000) {
    throw new HttpsError('invalid-argument', 'Coordinates must be integers between (0,0) and (999,999).');
  }

  if (!/^#[0-9A-F]{6}$/.test(color)) {
    throw new HttpsError('invalid-argument', 'Invalid HEX color.');
  }

  const now = Date.now();
  const cdRef = db.ref(`cooldowns/${uid}`);

  // Atomic transaction on cooldowns/{uid}
  const cdTx = await cdRef.transaction((current) => {
    if (current && Number(current.nextCooldownAt || 0) > now) {
      return; // Abort: still on cooldown
    }
    return {
      uid,
      lastPlacedAt: now,
      nextCooldownAt: now + COOLDOWN_MS,
    };
  });

  if (!cdTx.committed) {
    throw new HttpsError('resource-exhausted', '30-second cooldown is still active.');
  }

  const userSnap = await db.ref(`users/${uid}`).get();
  const username = userSnap.exists() ? String(userSnap.val().username || 'player').slice(0, 24) : 'player';

  const chunkId = `${Math.floor(x / CHUNK_SIZE)}_${Math.floor(y / CHUNK_SIZE)}`;
  const pixelKey = `${x}_${y}`;
  const pixelRef = db.ref(`canvasChunks/${chunkId}/${pixelKey}`);

  let prevPixel = null;
  const pxTx = await pixelRef.transaction((existing) => {
    if (existing) prevPixel = existing;
    return {
      x,
      y,
      color,
      ownerId: uid,
      ownerUsername: username,
      version: existing ? Number(existing.version || 1) + 1 : 1,
      updatedAt: now,
      ...(existing
        ? {
            prevColor: existing.color,
            prevOwnerId: existing.ownerId,
            prevOwnerUsername: existing.ownerUsername,
          }
        : {}),
    };
  });

  const committedPixel = pxTx.snapshot.val();
  const isReplacement = Boolean(prevPixel);
  const historyId = `hist_${now}_${uid.slice(0, 5)}`;

  await db.ref(`placements/${historyId}`).set({
    id: historyId,
    x,
    y,
    prevColor: prevPixel ? prevPixel.color : null,
    prevOwnerId: prevPixel ? prevPixel.ownerId : null,
    prevOwnerUsername: prevPixel ? prevPixel.ownerUsername : null,
    newColor: color,
    userId: uid,
    username,
    actionType: isReplacement ? 'replace' : 'place',
    pixelVersion: committedPixel.version,
    undone: false,
    createdAt: now,
  });

  await db.ref(`users/${uid}`).transaction((u) => {
    if (!u) return u;
    return {
      ...u,
      pixelsPlaced: Number(u.pixelsPlaced || 0) + 1,
      points: Number(u.points || 50) + (isReplacement ? 12 : 10),
      lastPixelAt: now,
      nextCooldownAt: now + COOLDOWN_MS,
    };
  });

  return { ok: true, pixel: committedPixel, nextCooldownAt: now + COOLDOWN_MS };
});

/**
 * 2. Trusted Safe Undo (Blocks overwriting another player's replacement; never resets cooldown)
 */
exports.undoPixelTrusted = onCall({ region: 'asia-southeast1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const uid = request.auth.uid;
  const x = Number(request.data.x);
  const y = Number(request.data.y);

  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 1000 || y < 0 || y >= 1000) {
    throw new HttpsError('invalid-argument', 'Invalid coordinates.');
  }

  const chunkId = `${Math.floor(x / CHUNK_SIZE)}_${Math.floor(y / CHUNK_SIZE)}`;
  const pixelRef = db.ref(`canvasChunks/${chunkId}/${x}_${y}`);
  const snap = await pixelRef.get();

  if (!snap.exists()) {
    throw new HttpsError('failed-precondition', 'Pixel slot is already empty.');
  }

  const current = snap.val();
  if (current.ownerId !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Cannot undo: another player has modified this pixel since your placement.'
    );
  }

  const now = Date.now();
  let restoredPixel = null;
  if (!current.prevColor) {
    await pixelRef.remove();
  } else {
    restoredPixel = {
      x,
      y,
      color: current.prevColor,
      ownerId: current.prevOwnerId,
      ownerUsername: current.prevOwnerUsername || 'player',
      version: Number(current.version || 1) + 1,
      updatedAt: now,
    };
    await pixelRef.set(restoredPixel);
  }

  return { ok: true, x, y, restoredPixel };
});

/**
 * 3. Trusted Task Submission & Server-Verified Reward Claim
 */
exports.submitTaskTrusted = onCall({ region: 'asia-southeast1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const uid = request.auth.uid;
  const taskId = String(request.data.taskId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const pixels = Array.isArray(request.data.pixels) ? request.data.pixels : [];

  if (!taskId || pixels.length < 4 || pixels.length > 256) {
    throw new HttpsError('invalid-argument', 'Valid taskId and 4..256 pixels required.');
  }

  const now = Date.now();
  const utcDateKey = new Date(now).toISOString().slice(0, 10);
  const claimRef = db.ref(`taskClaims/${uid}_${taskId}_${utcDateKey}`);

  const claimTx = await claimRef.transaction((existing) => {
    if (existing) return; // Abort: duplicate daily claim
    return {
      uid,
      taskId,
      utcDateKey,
      claimedAt: now,
    };
  });

  if (!claimTx.committed) {
    throw new HttpsError('already-exists', `Daily reward for ${taskId} already claimed on ${utcDateKey} UTC.`);
  }

  const rewardPoints = 75;
  await db.ref(`users/${uid}`).transaction((u) => {
    if (!u) return u;
    return {
      ...u,
      tasksCompleted: Number(u.tasksCompleted || 0) + 1,
      points: Number(u.points || 50) + rewardPoints,
    };
  });

  return { ok: true, utcDateKey, pointsGranted: rewardPoints };
});
