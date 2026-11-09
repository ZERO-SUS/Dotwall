/**
 * DOTWALL — TRUSTED FIREBASE CLOUD FUNCTIONS
 * Note: Deploying Cloud Functions requires upgrading Firebase project `dotwall-13046`
 * from the free Spark plan to the Blaze plan.
 * The client also uses atomic RTDB transactions + `database.rules.json` so the game works
 * immediately on the free Spark tier without requiring paid services.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.database();

const COOLDOWN_MS = 30000;
const CHUNK_SIZE = 50;

exports.placePixelTrusted = onCall({ region: 'asia-southeast1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required to place pixels.');
  }

  const uid = request.auth.uid;
  const x = Number(request.data.x);
  const y = Number(request.data.y);
  const color = String(request.data.color || '').toUpperCase();

  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 1000 || y < 0 || y >= 1000) {
    throw new HttpsError('invalid-argument', 'Coordinates must be between (0,0) and (999,999).');
  }

  if (!/^#[0-9A-F]{6}$/.test(color)) {
    throw new HttpsError('invalid-argument', 'Invalid HEX color.');
  }

  const now = Date.now();
  const cdRef = db.ref(`cooldowns/${uid}`);
  const cdSnap = await cdRef.get();
  if (cdSnap.exists() && Number(cdSnap.val().nextCooldownAt || 0) > now) {
    throw new HttpsError('resource-exhausted', '30-second cooldown is still active.');
  }

  const userSnap = await db.ref(`users/${uid}`).get();
  const username = userSnap.exists() ? userSnap.val().username : 'player';

  const chunkId = `${Math.floor(x / CHUNK_SIZE)}_${Math.floor(y / CHUNK_SIZE)}`;
  const pixelRef = db.ref(`canvasChunks/${chunkId}/${x}_${y}`);
  const existingSnap = await pixelRef.get();
  const existing = existingSnap.exists() ? existingSnap.val() : null;

  const nextCooldownAt = now + COOLDOWN_MS;
  await cdRef.set({ uid, lastPlacedAt: now, nextCooldownAt });

  const newPixel = {
    x,
    y,
    color,
    ownerId: uid,
    ownerUsername: username,
    version: existing ? Number(existing.version || 1) + 1 : 1,
    updatedAt: now,
  };
  await pixelRef.set(newPixel);

  return { ok: true, pixel: newPixel, nextCooldownAt };
});
