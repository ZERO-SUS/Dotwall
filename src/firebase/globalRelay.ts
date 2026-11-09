import type {
  CommunityArtwork,
  CommunityComment,
  GlobalPixel,
  OnlinePlayerPresence,
  PixelHistoryEntry,
  PlayerProfile,
} from '../types';

const CANVAS_TOPIC = 'dotwall_global_canvas_clean_v4';
const PRESENCE_TOPIC = 'dotwall_global_presence_clean_v4';
const RELAY_HTTP_BASE = 'https://ntfy.sh';
const RELAY_WS_BASE = 'wss://ntfy.sh';

export type GlobalRelayEvent =
  | {
      type: 'pixel_placed';
      senderTabId: string;
      pixel: GlobalPixel;
      historyEntry: PixelHistoryEntry;
    }
  | {
      type: 'pixel_undone';
      senderTabId: string;
      x: number;
      y: number;
      restoredPixel: GlobalPixel | null;
      historyId: string;
    }
  | {
      type: 'pixel_erased';
      senderTabId: string;
      coords: { x: number; y: number }[];
      adminUsername: string;
    }
  | {
      type: 'pixels_batch_placed';
      senderTabId: string;
      pixels: GlobalPixel[];
      adminUsername: string;
    }
  | {
      type: 'user_deleted';
      senderTabId: string;
      userId: string;
      username: string;
      wipeContent: boolean;
    }
  | {
      type: 'user_updated';
      senderTabId: string;
      user: PlayerProfile;
    }
  | {
      type: 'artwork_published';
      senderTabId: string;
      artwork: CommunityArtwork;
    }
  | {
      type: 'artwork_deleted';
      senderTabId: string;
      artworkId: string;
    }
  | {
      type: 'comment_posted';
      senderTabId: string;
      comment: CommunityComment;
    }
  | {
      type: 'comment_deleted';
      senderTabId: string;
      commentId: string;
    }
  | {
      type: 'canvas_cleared';
      senderTabId: string;
      mode: 'empty' | 'seed';
    }
  | {
      type: 'admin_broadcast';
      senderTabId: string;
      title: string;
      message: string;
      timestamp: number;
    };

export type DistributeOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export interface GlobalRelayCallbacks {
  onPixelPlaced: (pixel: GlobalPixel, historyEntry: PixelHistoryEntry) => void;
  onPixelUndone: (x: number, y: number, restoredPixel: GlobalPixel | null, historyId: string) => void;
  onPixelsErased?: (coords: { x: number; y: number }[], adminUsername: string) => void;
  onPixelsBatchPlaced?: (pixels: GlobalPixel[], adminUsername: string) => void;
  onUserDeleted?: (userId: string, username: string, wipeContent: boolean) => void;
  onUserUpdated?: (user: PlayerProfile) => void;
  onArtworkPublished: (artwork: CommunityArtwork) => void;
  onArtworkDeleted?: (artworkId: string) => void;
  onCommentPosted: (comment: CommunityComment) => void;
  onCommentDeleted?: (commentId: string) => void;
  onCanvasCleared?: (mode: 'empty' | 'seed') => void;
  onAdminBroadcast?: (title: string, message: string, timestamp: number) => void;
  onConnectionState?: (connected: boolean) => void;
}

const CLIENT_TAB_ID = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function getClientTabId(): string {
  return CLIENT_TAB_ID;
}

/**
 * Publishes a validated canvas/game/admin event to the global real-time cloud relay
 * so all connected browsers/devices worldwide receive it in <200ms.
 */
export async function publishGlobalRelayEvent(
  event: DistributeOmit<GlobalRelayEvent, 'senderTabId'>
): Promise<void> {
  try {
    const payload: GlobalRelayEvent = {
      ...event,
      senderTabId: CLIENT_TAB_ID,
    } as GlobalRelayEvent;

    await fetch(`${RELAY_HTTP_BASE}/${CANVAS_TOPIC}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    // Ignore transient network errors
  }
}

/**
 * Fetches recent global history from the cloud relay on startup so any new browser/device
 * opening https://zero-sus.github.io/Dotwall/ immediately sees pixels, erasures, user deletions,
 * artworks, and comments placed by players and admins worldwide.
 */
export async function fetchGlobalRelayHistory(callbacks: GlobalRelayCallbacks): Promise<void> {
  try {
    const res = await fetch(`${RELAY_HTTP_BASE}/${CANVAS_TOPIC}/json?poll=1&since=all`);
    if (!res.ok) return;
    const text = await res.text();
    const lines = text.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const envelope = JSON.parse(line);
        if (envelope.event !== 'message' || !envelope.message) continue;
        const msg = JSON.parse(envelope.message) as GlobalRelayEvent;
        applyRelayMessage(msg, callbacks, true);
      } catch {
        // skip malformed line
      }
    }
  } catch {
    // ignore offline/network error
  }
}

function applyRelayMessage(
  msg: GlobalRelayEvent,
  callbacks: GlobalRelayCallbacks,
  isReplay = false
) {
  if (!isReplay && msg.senderTabId === CLIENT_TAB_ID) return;

  if (msg.type === 'pixel_placed' && msg.pixel) {
    const x = Number(msg.pixel.x);
    const y = Number(msg.pixel.y);
    if (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      x < 1000 &&
      y >= 0 &&
      y < 1000 &&
      /^#[0-9A-Fa-f]{6}$/.test(msg.pixel.color || '')
    ) {
      callbacks.onPixelPlaced(msg.pixel, msg.historyEntry);
    }
  } else if (msg.type === 'pixel_undone' && typeof msg.x === 'number' && typeof msg.y === 'number') {
    callbacks.onPixelUndone(msg.x, msg.y, msg.restoredPixel || null, msg.historyId || '');
  } else if (msg.type === 'pixel_erased' && Array.isArray(msg.coords)) {
    callbacks.onPixelsErased?.(msg.coords, msg.adminUsername || 'zero_sus');
  } else if (msg.type === 'pixels_batch_placed' && Array.isArray(msg.pixels)) {
    callbacks.onPixelsBatchPlaced?.(msg.pixels, msg.adminUsername || 'zero_sus');
  } else if (msg.type === 'user_deleted' && (msg.userId || msg.username)) {
    callbacks.onUserDeleted?.(msg.userId || '', msg.username || '', Boolean(msg.wipeContent));
  } else if (msg.type === 'user_updated' && msg.user) {
    callbacks.onUserUpdated?.(msg.user);
  } else if (msg.type === 'artwork_published' && msg.artwork) {
    callbacks.onArtworkPublished(msg.artwork);
  } else if (msg.type === 'artwork_deleted' && msg.artworkId) {
    callbacks.onArtworkDeleted?.(msg.artworkId);
  } else if (msg.type === 'comment_posted' && msg.comment) {
    callbacks.onCommentPosted(msg.comment);
  } else if (msg.type === 'comment_deleted' && msg.commentId) {
    callbacks.onCommentDeleted?.(msg.commentId);
  } else if (msg.type === 'canvas_cleared' && msg.mode) {
    callbacks.onCanvasCleared?.(msg.mode);
  } else if (msg.type === 'admin_broadcast' && !isReplay && msg.message) {
    callbacks.onAdminBroadcast?.(
      msg.title || '👑 Admin Announcement (@zero_sus)',
      msg.message,
      msg.timestamp || Date.now()
    );
  }
}

/**
 * Subscribes to live WebSocket stream (`wss://ntfy.sh/.../ws`) with automatic reconnect
 * so pixels placed/erased and admin actions on any device worldwide appear in real time (< 150ms).
 */
export function subscribeToGlobalRelayStream(callbacks: GlobalRelayCallbacks): () => void {
  let ws: WebSocket | null = null;
  let closedByApp = false;
  let reconnectTimer: number | null = null;

  // First replay recent global placements & admin actions
  fetchGlobalRelayHistory(callbacks);

  const connect = () => {
    if (closedByApp) return;
    try {
      ws = new WebSocket(`${RELAY_WS_BASE}/${CANVAS_TOPIC}/ws`);
      ws.onopen = () => {
        callbacks.onConnectionState?.(true);
      };
      ws.onmessage = (evt) => {
        try {
          const envelope = JSON.parse(evt.data);
          if (envelope.event !== 'message' || !envelope.message) return;
          const msg = JSON.parse(envelope.message) as GlobalRelayEvent;
          applyRelayMessage(msg, callbacks, false);
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (!closedByApp) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          // ignore
        }
      };
    } catch {
      if (!closedByApp) {
        reconnectTimer = window.setTimeout(connect, 3500);
      }
    }
  };

  connect();

  return () => {
    closedByApp = true;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    try {
      ws?.close();
    } catch {
      // ignore
    }
  };
}

/**
 * Global Cross-Device Presence Stream (Deduplicated by `userId` / Firebase `uid`)
 */
export function startGlobalRelayPresence(
  user: PlayerProfile,
  activeView: string,
  onOnlinePlayersUpdate: (players: OnlinePlayerPresence[]) => void
): () => void {
  const activeMap = new Map<string, OnlinePlayerPresence>();
  let ws: WebSocket | null = null;

  const upsertAndEmit = (entry: OnlinePlayerPresence) => {
    activeMap.set(entry.userId, entry);
    const now = Date.now();
    for (const [uid, p] of activeMap.entries()) {
      if (now - p.lastSeenAt > 65_000) {
        activeMap.delete(uid);
      }
    }
    onOnlinePlayersUpdate(Array.from(activeMap.values()));
  };

  // Always include current user immediately
  upsertAndEmit({
    userId: user.id,
    username: user.username,
    avatarEmoji: user.avatarEmoji,
    avatarColor: user.avatarColor,
    activeView,
    lastSeenAt: Date.now(),
  });

  const sendHeartbeat = (eventType: 'heartbeat' | 'leave' = 'heartbeat') => {
    fetch(`${RELAY_HTTP_BASE}/${PRESENCE_TOPIC}`, {
      method: 'POST',
      body: JSON.stringify({
        eventType,
        userId: user.id,
        username: user.username,
        avatarEmoji: user.avatarEmoji,
        avatarColor: user.avatarColor,
        activeView,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  };

  // Replay recent presence announcements from the last 60s
  fetch(`${RELAY_HTTP_BASE}/${PRESENCE_TOPIC}/json?poll=1&since=1m`)
    .then((r) => r.text())
    .then((txt) => {
      for (const line of txt.split('\n').filter(Boolean)) {
        try {
          const env = JSON.parse(line);
          if (env.event !== 'message' || !env.message) continue;
          const p = JSON.parse(env.message);
          if (p.eventType === 'leave' && p.userId !== user.id) {
            activeMap.delete(p.userId);
          } else if (p.userId && Date.now() - Number(p.timestamp || 0) < 65_000) {
            upsertAndEmit({
              userId: p.userId,
              username: p.username || 'player',
              avatarEmoji: p.avatarEmoji || '👾',
              avatarColor: p.avatarColor || '#6B3DFF',
              activeView: p.activeView || 'home',
              lastSeenAt: Number(p.timestamp || Date.now()),
            });
          }
        } catch {
          // ignore
        }
      }
    })
    .catch(() => {});

  try {
    ws = new WebSocket(`${RELAY_WS_BASE}/${PRESENCE_TOPIC}/ws`);
    ws.onopen = () => {
      sendHeartbeat('heartbeat');
    };
    ws.onmessage = (evt) => {
      try {
        const env = JSON.parse(evt.data);
        if (env.event !== 'message' || !env.message) return;
        const p = JSON.parse(env.message);
        if (p.eventType === 'leave' && p.userId !== user.id) {
          activeMap.delete(p.userId);
          onOnlinePlayersUpdate(Array.from(activeMap.values()));
        } else if (p.userId) {
          upsertAndEmit({
            userId: p.userId,
            username: p.username || 'player',
            avatarEmoji: p.avatarEmoji || '👾',
            avatarColor: p.avatarColor || '#6B3DFF',
            activeView: p.activeView || 'home',
            lastSeenAt: Date.now(),
          });
        }
      } catch {
        // ignore
      }
    };
  } catch {
    // ignore
  }

  const interval = window.setInterval(() => {
    upsertAndEmit({
      userId: user.id,
      username: user.username,
      avatarEmoji: user.avatarEmoji,
      avatarColor: user.avatarColor,
      activeView,
      lastSeenAt: Date.now(),
    });
    sendHeartbeat('heartbeat');
  }, 22_000);

  return () => {
    window.clearInterval(interval);
    sendHeartbeat('leave');
    try {
      ws?.close();
    } catch {
      // ignore
    }
  };
}
