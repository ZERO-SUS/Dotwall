import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { createInitialDatabaseSeed, INITIAL_TASKS, ACHIEVEMENTS_CATALOG } from './seedData';

const DB_DIR = path.resolve(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DB_DIR, 'dotwall-db.json');
const COOLDOWN_MS = 30_000; // Mandatory 30-second cooldown per player
const GLOBAL_CAPACITY = 1_000_000; // Mandatory 1000 x 1000 = 1,000,000 capacity

interface PresenceClient {
  sessionId: string;
  userId: string;
  username: string;
  avatarEmoji: string;
  avatarColor: string;
  activeView: string;
  lastSeenAt: number;
  res?: ServerResponse;
}

function sanitizeText(raw: unknown, maxLen = 500): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[<>]/g, '') // Strip angle brackets to prevent HTML/script injection
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

const SPAM_PATTERNS = [
  /free\s+crypto/i,
  /click\s+here\s+http/i,
  /(.)\1{12,}/, // repeated character flood
];

export function dotwallMultiplayerPlugin(): Plugin {
  let db: ReturnType<typeof createInitialDatabaseSeed>;
  const clients = new Map<string, PresenceClient>();
  let saveTimer: NodeJS.Timeout | null = null;

  function loadDb() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.pixels && parsed.users) {
          db = {
            ...createInitialDatabaseSeed(),
            ...parsed,
            tasks: INITIAL_TASKS,
          };
          return;
        }
      }
    } catch (err) {
      console.error('[Dotwall DB] Failed to load existing DB, initializing fresh seed:', err);
    }
    db = createInitialDatabaseSeed();
    saveDbImmediate();
  }

  function saveDbImmediate() {
    try {
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Dotwall DB] Save error:', err);
    }
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveDbImmediate();
    }, 350);
  }

  function getActiveAuthenticatedPlayers() {
    const now = Date.now();
    const uniqueUsers = new Map<
      string,
      { userId: string; username: string; avatarEmoji: string; avatarColor: string; activeView: string; lastSeenAt: number }
    >();
    for (const [sid, c] of clients.entries()) {
      if (now - c.lastSeenAt > 35_000 && !c.res) {
        clients.delete(sid);
        continue;
      }
      if (c.userId) {
        uniqueUsers.set(c.userId, {
          userId: c.userId,
          username: c.username,
          avatarEmoji: c.avatarEmoji,
          avatarColor: c.avatarColor,
          activeView: c.activeView,
          lastSeenAt: c.lastSeenAt,
        });
      }
    }
    return Array.from(uniqueUsers.values());
  }

  function broadcast(event: string, payload: unknown) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const [sid, client] of clients.entries()) {
      if (client.res) {
        try {
          client.res.write(msg);
        } catch {
          clients.delete(sid);
        }
      }
    }
  }

  function evaluateAchievements(user: any): string[] {
    const newlyUnlocked: string[] = [];
    const current = new Set<string>(user.achievements || []);
    const unlock = (id: string) => {
      if (!current.has(id)) {
        current.add(id);
        newlyUnlocked.push(id);
        const def = ACHIEVEMENTS_CATALOG.find((a) => a.id === id);
        if (def) {
          user.points = (user.points || 0) + def.xpReward;
        }
      }
    };

    if (user.pixelsPlaced >= 1) unlock('first_dot');
    if (user.pixelsPlaced >= 10) unlock('pixel_ten');
    if (user.pixelsPlaced >= 50) unlock('pixel_fifty');
    if (user.tasksCompleted >= 1) unlock('task_rookie');
    if (user.tasksCompleted >= 3) unlock('task_master');

    user.achievements = Array.from(current);
    return newlyUnlocked;
  }

  function computeGlobalStats() {
    const pixelList = Object.values(db.pixels);
    const pixelsUsed = pixelList.length;
    const pixelsRemaining = Math.max(0, GLOBAL_CAPACITY - pixelsUsed);
    const completionPct = Number(((pixelsUsed / GLOBAL_CAPACITY) * 100).toFixed(4));
    const contributorIds = new Set(pixelList.map((p) => p.ownerId));
    const activePlayers = getActiveAuthenticatedPlayers();

    return {
      capacity: GLOBAL_CAPACITY,
      pixelsUsed,
      pixelsRemaining,
      completionPct,
      activeContributors: contributorIds.size,
      totalRegisteredPlayers: Object.keys(db.users).length,
      onlinePlayersCount: activePlayers.length,
      onlinePlayers: activePlayers,
      totalTasksCompleted: Object.values(db.users).reduce((acc: number, u: any) => acc + (u.tasksCompleted || 0), 0),
      totalArtworks: db.artworks.length,
    };
  }

  function parseJsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 2_000_000) {
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  }

  function sendJson(res: ServerResponse, status: number, data: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(data));
  }

  function attachMiddleware(middlewares: any) {
    loadDb();

    middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const urlObj = new URL(req.url || '/', 'http://localhost');
      const pathname = urlObj.pathname;

      if (!pathname.startsWith('/api/')) {
        return next();
      }

      try {
        // 1. REAL-TIME SSE STREAM (/api/stream)
        if (pathname === '/api/stream' && req.method === 'GET') {
          const sessionId = urlObj.searchParams.get('sessionId') || `sess-${Date.now()}-${Math.random()}`;
          const userId = urlObj.searchParams.get('userId') || '';
          const username = sanitizeText(urlObj.searchParams.get('username') || 'player', 24);
          const avatarEmoji = sanitizeText(urlObj.searchParams.get('avatarEmoji') || '👾', 8);
          const avatarColor = sanitizeText(urlObj.searchParams.get('avatarColor') || '#6B3DFF', 12);
          const activeView = sanitizeText(urlObj.searchParams.get('view') || 'home', 20);

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          });

          if (userId && db.users[userId as keyof typeof db.users]) {
            const u = db.users[userId as keyof typeof db.users];
            clients.set(sessionId, {
              sessionId,
              userId: u.id,
              username: u.username,
              avatarEmoji: u.avatarEmoji,
              avatarColor: u.avatarColor,
              activeView,
              lastSeenAt: Date.now(),
              res,
            });
          } else if (userId) {
            clients.set(sessionId, {
              sessionId,
              userId,
              username,
              avatarEmoji,
              avatarColor,
              activeView,
              lastSeenAt: Date.now(),
              res,
            });
          }

          const stats = computeGlobalStats();
          res.write(`event: presence\ndata: ${JSON.stringify({ onlinePlayersCount: stats.onlinePlayersCount, onlinePlayers: stats.onlinePlayers })}\n\n`);
          broadcast('presence', {
            onlinePlayersCount: stats.onlinePlayersCount,
            onlinePlayers: stats.onlinePlayers,
          });

          req.on('close', () => {
            clients.delete(sessionId);
            const updatedStats = computeGlobalStats();
            broadcast('presence', {
              onlinePlayersCount: updatedStats.onlinePlayersCount,
              onlinePlayers: updatedStats.onlinePlayers,
            });
          });
          return;
        }

        // 2. INITIAL STATE SNAPSHOT (/api/state)
        if (pathname === '/api/state' && req.method === 'GET') {
          const stats = computeGlobalStats();
          return sendJson(res, 200, {
            ok: true,
            stats,
            pixels: Object.values(db.pixels),
            history: db.history.slice(-100),
            users: Object.values(db.users),
            tasks: db.tasks,
            taskSubmissions: db.taskSubmissions,
            artworks: db.artworks,
            comments: db.comments.filter((c: any) => !c.hidden),
            achievementsCatalog: ACHIEVEMENTS_CATALOG,
            serverTime: Date.now(),
          });
        }

        // 3. AUTH / SESSION / PROFILE REGISTRATION (/api/auth)
        if (pathname === '/api/auth' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const requestedId = sanitizeText(body.userId, 64);
          let rawUsername = sanitizeText(body.username, 24).replace(/[^a-zA-Z0-9_.-]/g, '');
          if (rawUsername.length < 2) {
            rawUsername = `pixel_${Math.floor(1000 + Math.random() * 9000)}`;
          }

          // Check if switching to an existing username or userId
          let existingUser = requestedId ? (db.users as Record<string, any>)[requestedId] : undefined;
          if (!existingUser && body.loginByUsername) {
            existingUser = Object.values(db.users).find(
              (u: any) => u.username.toLowerCase() === rawUsername.toLowerCase()
            );
          }

          if (!existingUser) {
            // Ensure unique username
            const taken = Object.values(db.users).some(
              (u: any) => u.username.toLowerCase() === rawUsername.toLowerCase()
            );
            if (taken) {
              rawUsername = `${rawUsername}_${Math.floor(10 + Math.random() * 89)}`;
            }
            const newId = requestedId || `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            existingUser = {
              id: newId,
              username: rawUsername,
              displayName: sanitizeText(body.displayName || rawUsername, 32),
              avatarEmoji: sanitizeText(body.avatarEmoji || '👾', 8),
              avatarColor: /^#[0-9A-Fa-f]{6}$/.test(body.avatarColor || '') ? body.avatarColor : '#6B3DFF',
              bio: sanitizeText(body.bio || 'Collaborating on the 1,000,000-pixel global wall.', 160),
              pixelsPlaced: 0,
              tasksCompleted: 0,
              points: 50,
              lastPixelAt: 0,
              nextCooldownAt: 0,
              lastCommentAt: 0,
              joinedAt: Date.now(),
              achievements: [],
            };
            (db.users as Record<string, any>)[newId] = existingUser;
            scheduleSave();
            broadcast('user_updated', { user: existingUser, stats: computeGlobalStats() });
          }

          return sendJson(res, 200, {
            ok: true,
            user: existingUser,
            serverTime: Date.now(),
          });
        }

        // 4. PROFILE UPDATE (/api/profile)
        if (pathname === '/api/profile' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const user = (db.users as Record<string, any>)[body.userId];
          if (!user) {
            return sendJson(res, 404, { ok: false, error: 'Player profile not found.' });
          }

          if (body.username) {
            const cleanName = sanitizeText(body.username, 24).replace(/[^a-zA-Z0-9_.-]/g, '');
            if (cleanName.length < 2) {
              return sendJson(res, 400, { ok: false, error: 'Username must be at least 2 characters.' });
            }
            const conflict = Object.values(db.users).find(
              (u: any) => u.id !== user.id && u.username.toLowerCase() === cleanName.toLowerCase()
            );
            if (conflict) {
              return sendJson(res, 409, { ok: false, error: 'That username is already taken.' });
            }
            user.username = cleanName;
          }

          if (body.displayName !== undefined) user.displayName = sanitizeText(body.displayName, 32) || user.username;
          if (body.bio !== undefined) user.bio = sanitizeText(body.bio, 160);
          if (body.avatarEmoji) user.avatarEmoji = sanitizeText(body.avatarEmoji, 8);
          if (body.avatarColor && /^#[0-9A-Fa-f]{6}$/.test(body.avatarColor)) {
            user.avatarColor = body.avatarColor;
          }

          scheduleSave();
          broadcast('user_updated', { user, stats: computeGlobalStats() });
          return sendJson(res, 200, { ok: true, user });
        }

        // 5. PLACE OR REPLACE GLOBAL PIXEL (/api/pixel/place)
        if (pathname === '/api/pixel/place' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const user = (db.users as Record<string, any>)[body.userId];
          if (!user) {
            return sendJson(res, 401, { ok: false, error: 'Sign in required to place pixels.' });
          }

          const x = Number(body.x);
          const y = Number(body.y);
          const color = String(body.color || '').toUpperCase();

          if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 1000 || y < 0 || y >= 1000) {
            return sendJson(res, 400, { ok: false, error: 'Coordinates must be between (0, 0) and (999, 999).' });
          }

          if (!/^#[0-9A-F]{6}$/.test(color)) {
            return sendJson(res, 400, { ok: false, error: 'Invalid HEX color code.' });
          }

          const now = Date.now();
          if (user.nextCooldownAt && now < user.nextCooldownAt) {
            const waitSec = Math.ceil((user.nextCooldownAt - now) / 1000);
            return sendJson(res, 429, {
              ok: false,
              error: `Cooldown active! Next pixel available in ${waitSec}s.`,
              nextCooldownAt: user.nextCooldownAt,
              serverTime: now,
            });
          }

          const key = `${x},${y}`;
          const existing = db.pixels[key];
          const isReplacement = Boolean(existing);

          if (!isReplacement && Object.keys(db.pixels).length >= GLOBAL_CAPACITY) {
            return sendJson(res, 409, {
              ok: false,
              error: 'Global 1,000,000 pixel capacity reached! Replace or erase an occupied pixel.',
            });
          }

          const newVersion = existing ? existing.version + 1 : 1;
          const updatedPixel = {
            x,
            y,
            color,
            ownerId: user.id,
            ownerUsername: user.username,
            version: newVersion,
            updatedAt: now,
          };

          db.pixels[key] = updatedPixel;

          const histEntry = {
            id: `hist-${now}-${Math.random().toString(36).slice(2, 7)}`,
            x,
            y,
            prevColor: existing ? existing.color : null,
            prevOwnerId: existing ? existing.ownerId : null,
            prevOwnerUsername: existing ? existing.ownerUsername : null,
            newColor: color,
            userId: user.id,
            username: user.username,
            actionType: isReplacement ? 'replace' : 'place',
            pixelVersion: newVersion,
            undone: false,
            createdAt: now,
          };
          db.history.push(histEntry);
          if (db.history.length > 500) {
            db.history = db.history.slice(-500);
          }

          user.pixelsPlaced = (user.pixelsPlaced || 0) + 1;
          user.points = (user.points || 0) + (isReplacement ? 12 : 10);
          user.lastPixelAt = now;
          user.nextCooldownAt = now + COOLDOWN_MS;

          if (isReplacement && !user.achievements.includes('pixel_modifier')) {
            user.achievements.push('pixel_modifier');
            user.points += 35;
          }

          const newlyUnlocked = evaluateAchievements(user);
          scheduleSave();

          const stats = computeGlobalStats();
          broadcast('pixel_update', {
            type: 'place',
            pixel: updatedPixel,
            historyEntry: histEntry,
            user,
            stats,
          });

          return sendJson(res, 200, {
            ok: true,
            pixel: updatedPixel,
            historyEntry: histEntry,
            user,
            stats,
            newlyUnlocked,
            serverTime: now,
          });
        }

        // 6. ERASE OCCUPIED PIXEL (/api/pixel/erase)
        if (pathname === '/api/pixel/erase' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const user = (db.users as Record<string, any>)[body.userId];
          if (!user) {
            return sendJson(res, 401, { ok: false, error: 'Authentication required.' });
          }

          const x = Number(body.x);
          const y = Number(body.y);
          const key = `${x},${y}`;
          const existing = db.pixels[key];

          if (!existing) {
            return sendJson(res, 400, { ok: false, error: 'That pixel position is already empty.' });
          }

          if (existing.ownerId !== user.id) {
            return sendJson(res, 403, {
              ok: false,
              error: `Only @${existing.ownerUsername} can erase their pixel directly (or overwrite it with a color).`,
            });
          }

          const now = Date.now();
          if (user.nextCooldownAt && now < user.nextCooldownAt) {
            const waitSec = Math.ceil((user.nextCooldownAt - now) / 1000);
            return sendJson(res, 429, {
              ok: false,
              error: `Cooldown active (${waitSec}s remaining).`,
              nextCooldownAt: user.nextCooldownAt,
            });
          }

          delete db.pixels[key];

          const histEntry = {
            id: `hist-${now}-${Math.random().toString(36).slice(2, 7)}`,
            x,
            y,
            prevColor: existing.color,
            prevOwnerId: existing.ownerId,
            prevOwnerUsername: existing.ownerUsername,
            newColor: null,
            userId: user.id,
            username: user.username,
            actionType: 'erase',
            pixelVersion: existing.version + 1,
            undone: false,
            createdAt: now,
          };
          db.history.push(histEntry);
          scheduleSave();

          const stats = computeGlobalStats();
          broadcast('pixel_update', {
            type: 'erase',
            x,
            y,
            pixel: null,
            historyEntry: histEntry,
            user,
            stats,
          });

          return sendJson(res, 200, {
            ok: true,
            x,
            y,
            historyEntry: histEntry,
            user,
            stats,
          });
        }

        // 7. SERVER-VALIDATED UNDO (/api/pixel/undo)
        if (pathname === '/api/pixel/undo' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const user = (db.users as Record<string, any>)[body.userId];
          if (!user) {
            return sendJson(res, 401, { ok: false, error: 'Authentication required.' });
          }

          // Find most recent eligible placement by this user that has not been undone
          let targetHist: any = null;
          for (let i = db.history.length - 1; i >= 0; i--) {
            const h = db.history[i];
            if (h.userId === user.id && !h.undone && (h.actionType === 'place' || h.actionType === 'replace')) {
              targetHist = h;
              break;
            }
          }

          if (!targetHist) {
            return sendJson(res, 400, { ok: false, error: 'No eligible placement found in your history to undo.' });
          }

          const key = `${targetHist.x},${targetHist.y}`;
          const currentPixel = db.pixels[key];

          // Mandatory Rule: If another player has replaced the pixel, prevent outdated undo from overwriting!
          if (
            !currentPixel ||
            currentPixel.ownerId !== user.id ||
            currentPixel.version !== targetHist.pixelVersion
          ) {
            return sendJson(res, 409, {
              ok: false,
              error: `Cannot undo (${targetHist.x}, ${targetHist.y}): another player has modified that pixel since your placement.`,
            });
          }

          const now = Date.now();
          let restoredPixel: any = null;

          if (targetHist.prevColor === null) {
            // Frees the global pixel slot!
            delete db.pixels[key];
          } else {
            restoredPixel = {
              x: targetHist.x,
              y: targetHist.y,
              color: targetHist.prevColor,
              ownerId: targetHist.prevOwnerId || user.id,
              ownerUsername: targetHist.prevOwnerUsername || user.username,
              version: currentPixel.version + 1,
              updatedAt: now,
            };
            db.pixels[key] = restoredPixel;
          }

          targetHist.undone = true;
          targetHist.undoneAt = now;
          user.pixelsPlaced = Math.max(0, (user.pixelsPlaced || 1) - 1);

          // Unlock undo achievement if first time
          if (!user.achievements.includes('precision_undo')) {
            user.achievements.push('precision_undo');
            user.points = (user.points || 0) + 20;
          }

          // Note: Undo does NOT reset or bypass an active cooldown!
          scheduleSave();
          const stats = computeGlobalStats();

          broadcast('pixel_update', {
            type: 'undo',
            x: targetHist.x,
            y: targetHist.y,
            pixel: restoredPixel,
            user,
            stats,
          });

          return sendJson(res, 200, {
            ok: true,
            x: targetHist.x,
            y: targetHist.y,
            restoredPixel,
            undoneHistoryId: targetHist.id,
            user,
            stats,
          });
        }

        // 8. SERVER-VALIDATED REDO (/api/pixel/redo)
        if (pathname === '/api/pixel/redo' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const user = (db.users as Record<string, any>)[body.userId];
          if (!user) {
            return sendJson(res, 401, { ok: false, error: 'Authentication required.' });
          }

          const now = Date.now();
          if (user.nextCooldownAt && now < user.nextCooldownAt) {
            const waitSec = Math.ceil((user.nextCooldownAt - now) / 1000);
            return sendJson(res, 429, {
              ok: false,
              error: `Cooldown active! Wait ${waitSec}s before redoing placement.`,
              nextCooldownAt: user.nextCooldownAt,
            });
          }

          let targetHist: any = null;
          for (let i = db.history.length - 1; i >= 0; i--) {
            const h = db.history[i];
            if (h.userId === user.id && h.undone && h.newColor) {
              targetHist = h;
              break;
            }
          }

          if (!targetHist) {
            return sendJson(res, 400, { ok: false, error: 'Nothing eligible to redo.' });
          }

          const key = `${targetHist.x},${targetHist.y}`;
          const existing = db.pixels[key];
          if (existing && existing.ownerId !== user.id && existing.color !== targetHist.prevColor) {
            return sendJson(res, 409, {
              ok: false,
              error: 'Cannot redo: another player has placed a pixel at this coordinate.',
            });
          }

          const newVersion = existing ? existing.version + 1 : 1;
          const updatedPixel = {
            x: targetHist.x,
            y: targetHist.y,
            color: targetHist.newColor,
            ownerId: user.id,
            ownerUsername: user.username,
            version: newVersion,
            updatedAt: now,
          };

          db.pixels[key] = updatedPixel;
          targetHist.undone = false;
          targetHist.pixelVersion = newVersion;

          user.pixelsPlaced = (user.pixelsPlaced || 0) + 1;
          user.lastPixelAt = now;
          user.nextCooldownAt = now + COOLDOWN_MS;

          scheduleSave();
          const stats = computeGlobalStats();

          broadcast('pixel_update', {
            type: 'redo',
            x: targetHist.x,
            y: targetHist.y,
            pixel: updatedPixel,
            user,
            stats,
          });

          return sendJson(res, 200, {
            ok: true,
            pixel: updatedPixel,
            user,
            stats,
          });
        }

        // 9. SUBMIT PIXEL TASK CHALLENGE & PUBLISH TO EXPLORE (/api/tasks/submit)
        if (pathname === '/api/tasks/submit' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const user = (db.users as Record<string, any>)[body.userId];
          if (!user) {
            return sendJson(res, 401, { ok: false, error: 'Sign in required to submit tasks.' });
          }

          const task = db.tasks.find((t) => t.id === body.taskId);
          if (!task) {
            return sendJson(res, 404, { ok: false, error: 'Task not found.' });
          }

          const pixels = Array.isArray(body.pixels) ? body.pixels : [];
          if (pixels.length < 4) {
            return sendJson(res, 400, { ok: false, error: 'Draw at least 4 pixels before submitting your challenge!' });
          }

          const now = Date.now();
          const todayUtc = new Date(now).toISOString().slice(0, 10);
          const alreadyClaimedToday = (db.taskSubmissions as any[]).some(
            (s: any) =>
              s.userId === user.id &&
              s.taskId === task.id &&
              new Date(s.createdAt).toISOString().slice(0, 10) === todayUtc
          );
          if (alreadyClaimedToday) {
            return sendJson(res, 409, {
              ok: false,
              error: `You have already claimed today's daily reward (${todayUtc} UTC) for "${task.title}"!`,
            });
          }

          const accuracyScore = Math.min(100, Math.max(40, Number(body.accuracyScore) || 85));
          const pointsAwarded = task.rewardPoints;

          const submission = {
            id: `sub-${now}-${Math.random().toString(36).slice(2, 6)}`,
            taskId: task.id,
            userId: user.id,
            username: user.username,
            gridSize: task.gridSize,
            pixels,
            accuracyScore,
            pointsAwarded,
            createdAt: now,
          };
          (db.taskSubmissions as any[]).unshift(submission);

          let createdArtwork: any = null;
          if (body.shareToCommunity !== false) {
            createdArtwork = {
              id: `art-${now}-${Math.random().toString(36).slice(2, 6)}`,
              title: sanitizeText(body.title || `${task.title.replace('Draw a ', '').replace('Draw an ', '')} by @${user.username}`, 80),
              description: sanitizeText(body.description || `Completed the "${task.title}" challenge (${accuracyScore}% match).`, 280),
              category: task.category,
              gridSize: task.gridSize,
              pixels,
              creatorId: user.id,
              creatorUsername: user.username,
              creatorAvatar: user.avatarEmoji,
              creatorColor: user.avatarColor,
              taskId: task.id,
              likes: [user.id],
              commentsCount: 0,
              createdAt: now,
            };
            db.artworks.unshift(createdArtwork);
          }

          user.tasksCompleted = (user.tasksCompleted || 0) + 1;
          let bonusPoints = 0;
          if (Number(body.dailyStageIndex) === 5) {
            bonusPoints = 250;
            if (!user.achievements.includes('daily_five_sweep')) {
              user.achievements.push('daily_five_sweep');
            }
          }
          user.points = (user.points || 0) + pointsAwarded + bonusPoints;
          const newlyUnlocked = evaluateAchievements(user);

          scheduleSave();
          const stats = computeGlobalStats();

          broadcast('task_submitted', {
            submission,
            artwork: createdArtwork,
            user,
            stats,
          });

          return sendJson(res, 200, {
            ok: true,
            submission,
            artwork: createdArtwork,
            user,
            stats,
            newlyUnlocked,
          });
        }

        // 10. PUBLISH STANDALONE ARTWORK (/api/artworks/create)
        if (pathname === '/api/artworks/create' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const user = (db.users as Record<string, any>)[body.userId];
          if (!user) {
            return sendJson(res, 401, { ok: false, error: 'Authentication required.' });
          }

          const title = sanitizeText(body.title, 80);
          if (!title) {
            return sendJson(res, 400, { ok: false, error: 'Artwork title is required.' });
          }

          const pixels = Array.isArray(body.pixels) ? body.pixels : [];
          if (pixels.length === 0) {
            return sendJson(res, 400, { ok: false, error: 'Artwork cannot be empty.' });
          }

          const now = Date.now();
          const artwork = {
            id: `art-${now}-${Math.random().toString(36).slice(2, 6)}`,
            title,
            description: sanitizeText(body.description || 'Original pixel artwork created in Dotwall Studio.', 280),
            category: sanitizeText(body.category || 'Original', 32),
            gridSize: Number(body.gridSize) || 16,
            pixels,
            creatorId: user.id,
            creatorUsername: user.username,
            creatorAvatar: user.avatarEmoji,
            creatorColor: user.avatarColor,
            taskId: body.taskId || null,
            likes: [user.id],
            commentsCount: 0,
            createdAt: now,
          };

          db.artworks.unshift(artwork);
          user.points = (user.points || 0) + 40;
          scheduleSave();

          broadcast('artwork_created', { artwork, user, stats: computeGlobalStats() });
          return sendJson(res, 200, { ok: true, artwork, user });
        }

        // 11. LIKE / UNLIKE ARTWORK (/api/artworks/like)
        if (pathname === '/api/artworks/like' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const user = (db.users as Record<string, any>)[body.userId];
          if (!user) {
            return sendJson(res, 401, { ok: false, error: 'Sign in required.' });
          }

          const art = db.artworks.find((a) => a.id === body.artworkId);
          if (!art) {
            return sendJson(res, 404, { ok: false, error: 'Artwork not found.' });
          }

          const idx = art.likes.indexOf(user.id);
          if (idx >= 0) {
            art.likes.splice(idx, 1);
          } else {
            art.likes.push(user.id);
            // Check art_critic achievement
            const totalLikesByUser = db.artworks.filter((a) => a.likes.includes(user.id)).length;
            if (totalLikesByUser >= 5 && !user.achievements.includes('art_critic')) {
              user.achievements.push('art_critic');
              user.points = (user.points || 0) + 40;
            }
          }

          scheduleSave();
          broadcast('artwork_liked', { artworkId: art.id, likes: art.likes });
          return sendJson(res, 200, { ok: true, artworkId: art.id, likes: art.likes, user });
        }

        // 12. POST SAFE COMMENT / REPLY (/api/comments/create)
        if (pathname === '/api/comments/create' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const user = (db.users as Record<string, any>)[body.userId];
          if (!user) {
            return sendJson(res, 401, { ok: false, error: 'Sign in required to comment.' });
          }

          const now = Date.now();
          // Rate limiting: 5 seconds between comments
          if (user.lastCommentAt && now - user.lastCommentAt < 5000) {
            return sendJson(res, 429, {
              ok: false,
              error: 'Rate limit: Please wait a few seconds before posting another comment.',
            });
          }

          const content = sanitizeText(body.content, 500);
          if (content.length < 2) {
            return sendJson(res, 400, { ok: false, error: 'Comment cannot be empty.' });
          }

          for (const pat of SPAM_PATTERNS) {
            if (pat.test(content)) {
              return sendJson(res, 400, {
                ok: false,
                error: 'Automated spam filter blocked this comment.',
              });
            }
          }

          const newComment = {
            id: `cmt-${now}-${Math.random().toString(36).slice(2, 6)}`,
            artworkId: body.artworkId || null,
            parentId: body.parentId || null,
            userId: user.id,
            username: user.username,
            avatarEmoji: user.avatarEmoji,
            avatarColor: user.avatarColor,
            content,
            likes: [],
            reported: false,
            reportReason: null,
            hidden: false,
            createdAt: now,
          };

          db.comments.push(newComment);
          if (body.artworkId) {
            const art = db.artworks.find((a) => a.id === body.artworkId);
            if (art) art.commentsCount = (art.commentsCount || 0) + 1;
          }

          user.lastCommentAt = now;
          user.points = (user.points || 0) + 5;
          if (!user.achievements.includes('community_voice')) {
            user.achievements.push('community_voice');
            user.points += 30;
          }

          scheduleSave();
          broadcast('comment_added', { comment: newComment });
          return sendJson(res, 200, { ok: true, comment: newComment, user });
        }

        // 13. REPORT / MODERATE COMMENT (/api/comments/report)
        if (pathname === '/api/comments/report' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const cmt = db.comments.find((c) => c.id === body.commentId);
          if (!cmt) {
            return sendJson(res, 404, { ok: false, error: 'Comment not found.' });
          }

          cmt.reported = true;
          cmt.reportReason = sanitizeText(body.reason || 'Flagged by community member', 120);
          if (body.hideImmediately) {
            cmt.hidden = true;
          }

          scheduleSave();
          broadcast('comment_updated', { comment: cmt });
          return sendJson(res, 200, { ok: true, comment: cmt });
        }

        // 14. PRESENCE HEARTBEAT (/api/presence)
        if (pathname === '/api/presence' && req.method === 'POST') {
          const body = await parseJsonBody(req);
          const sessionId = sanitizeText(body.sessionId, 64);
          const existing = clients.get(sessionId);
          if (existing) {
            existing.lastSeenAt = Date.now();
            if (body.activeView) existing.activeView = sanitizeText(body.activeView, 24);
            if (body.username) existing.username = sanitizeText(body.username, 24);
          } else if (sessionId && body.userId) {
            clients.set(sessionId, {
              sessionId,
              userId: sanitizeText(body.userId, 64),
              username: sanitizeText(body.username || 'player', 24),
              avatarEmoji: sanitizeText(body.avatarEmoji || '👾', 8),
              avatarColor: sanitizeText(body.avatarColor || '#6B3DFF', 12),
              activeView: sanitizeText(body.activeView || 'home', 24),
              lastSeenAt: Date.now(),
            });
          }
          const stats = computeGlobalStats();
          return sendJson(res, 200, {
            ok: true,
            onlinePlayersCount: stats.onlinePlayersCount,
            onlinePlayers: stats.onlinePlayers,
          });
        }

        return sendJson(res, 404, { ok: false, error: 'Unknown API endpoint' });
      } catch (err: any) {
        console.error('[Dotwall API Error]', err);
        return sendJson(res, 500, { ok: false, error: err?.message || 'Internal server error' });
      }
    });
  }

  return {
    name: 'dotwall-multiplayer-backend',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}
