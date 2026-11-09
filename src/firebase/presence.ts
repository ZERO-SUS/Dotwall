import {
  ref,
  onValue,
  onDisconnect,
  set,
  remove,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/database';
import { getFirebaseDb } from './app';
import type { OnlinePlayerPresence, PlayerProfile } from '../types';

const TAB_SESSION_ID = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const LOCAL_PRESENCE_STORAGE_KEY = 'dotwall_live_tab_presence_v1';
const PRESENCE_EXPIRY_MS = 60_000;

/**
 * Reads local presence entries from other tabs/windows stored in localStorage.
 * Automatically prunes any tab entry that hasn't heartbeated in > 60 seconds.
 */
export function getLocalTabPresenceList(): OnlinePlayerPresence[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_PRESENCE_STORAGE_KEY);
    if (!raw) return [];
    const dict: Record<string, OnlinePlayerPresence> = JSON.parse(raw);
    const now = Date.now();
    const active: OnlinePlayerPresence[] = [];
    const byUser = new Map<string, OnlinePlayerPresence>();

    for (const [tabId, p] of Object.entries(dict)) {
      if (p && p.userId && now - Number(p.lastSeenAt || 0) < PRESENCE_EXPIRY_MS) {
        byUser.set(p.userId.toLowerCase(), p);
      }
    }
    return Array.from(byUser.values());
  } catch {
    return [];
  }
}

/**
 * Writes the current tab's presence node to localStorage for zero-latency multi-tab sync.
 */
function recordLocalPresence(user: PlayerProfile, activeView: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LOCAL_PRESENCE_STORAGE_KEY);
    const dict: Record<string, OnlinePlayerPresence> = raw ? JSON.parse(raw) : {};
    const now = Date.now();

    // Prune expired tabs
    for (const [tId, p] of Object.entries(dict)) {
      if (!p || !p.userId || now - Number(p.lastSeenAt || 0) > PRESENCE_EXPIRY_MS) {
        delete dict[tId];
      }
    }

    dict[TAB_SESSION_ID] = {
      userId: user.id,
      username: user.username,
      avatarEmoji: user.avatarEmoji || '👾',
      avatarColor: user.avatarColor || '#6B3DFF',
      activeView: activeView || 'home',
      lastSeenAt: now,
    };

    window.localStorage.setItem(LOCAL_PRESENCE_STORAGE_KEY, JSON.stringify(dict));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Cleans up this tab's presence node from localStorage.
 */
function removeLocalPresence() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LOCAL_PRESENCE_STORAGE_KEY);
    if (!raw) return;
    const dict: Record<string, OnlinePlayerPresence> = JSON.parse(raw);
    delete dict[TAB_SESSION_ID];
    window.localStorage.setItem(LOCAL_PRESENCE_STORAGE_KEY, JSON.stringify(dict));
  } catch {
    // ignore
  }
}

/**
 * Registers UID-based presence in Firebase Realtime Database.
 * Also synchronizes with localStorage and BroadcastChannel for seamless local multi-tab sync.
 */
export function startUserPresenceSession(
  user: PlayerProfile,
  activeView: string,
  onConnectionStateChange?: (connected: boolean) => void
): () => void {
  const db = getFirebaseDb();
  const connectedRef = ref(db, '.info/connected');
  const tabConnRef = ref(db, `presence/${user.id}/connections/${TAB_SESSION_ID}`);

  let isDisposed = false;

  const writeConnectionNode = () => {
    if (isDisposed) return;
    // 1. Update localStorage tab record
    recordLocalPresence(user, activeView);

    // 2. Write to Firebase RTDB
    set(tabConnRef, {
      userId: user.id,
      username: user.username.slice(0, 24),
      avatarEmoji: user.avatarEmoji || '👾',
      avatarColor: user.avatarColor || '#6B3DFF',
      activeView: (activeView || 'home').slice(0, 20),
      lastSeenAt: serverTimestamp(),
    }).catch(() => {
      // Ignored if permissions are restricted
    });
  };

  const unsubConnected = onValue(
    connectedRef,
    (snap) => {
      if (isDisposed) return;
      const isConnected = Boolean(snap.val());
      onConnectionStateChange?.(isConnected);
      if (!isConnected) return;

      onDisconnect(tabConnRef).remove().catch(() => {});
      writeConnectionNode();
    },
    () => {
      // Ignore connection state errors
    }
  );

  // Initial write
  writeConnectionNode();

  // Periodic heartbeat every 15s while tab is open
  const heartbeatInterval = setInterval(writeConnectionNode, 15_000);

  return () => {
    isDisposed = true;
    clearInterval(heartbeatInterval);
    unsubConnected();
    removeLocalPresence();
    remove(tabConnRef).catch(() => {});
  };
}

/**
 * Subscribes to global real-time presence across both Firebase Cloud RTDB and local browser tabs.
 * Merges and deduplicates players by user ID and username.
 */
export function subscribeToOnlinePlayers(
  callback: (players: OnlinePlayerPresence[]) => void,
  serverTimeOffsetMs = 0
): Unsubscribe {
  const db = getFirebaseDb();
  const allPresenceRef = ref(db, 'presence');
  let latestFbPlayers: OnlinePlayerPresence[] = [];

  const emitMerged = () => {
    const localPlayers = getLocalTabPresenceList();
    const mergedMap = new Map<string, OnlinePlayerPresence>();

    // 1. Add all valid Firebase players
    for (const p of latestFbPlayers) {
      if (p && p.userId) {
        mergedMap.set(p.userId.toLowerCase(), p);
      }
    }

    // 2. Merge local tab players (fresher tab information)
    for (const p of localPlayers) {
      if (p && p.userId) {
        mergedMap.set(p.userId.toLowerCase(), p);
      }
    }

    callback(Array.from(mergedMap.values()));
  };

  // 1. Firebase RTDB listener
  const unsubFb = onValue(
    allPresenceRef,
    (snap) => {
      const val = snap.val();
      if (!val || typeof val !== 'object') {
        latestFbPlayers = [];
        emitMerged();
        return;
      }

      const now = Date.now() + serverTimeOffsetMs;
      const parsed: OnlinePlayerPresence[] = [];

      for (const [uid, record] of Object.entries<any>(val)) {
        if (!record) continue;
        let freshConn: any = null;

        if (record.connections && typeof record.connections === 'object') {
          const conns = Object.values<any>(record.connections);
          freshConn = conns.find((c) => {
            const lastSeen = Number(c?.lastSeenAt || 0);
            return lastSeen > 0 && Math.abs(now - lastSeen) < PRESENCE_EXPIRY_MS + 20_000;
          });
        } else if (record.lastSeenAt) {
          const lastSeen = Number(record.lastSeenAt || 0);
          if (lastSeen > 0 && Math.abs(now - lastSeen) < PRESENCE_EXPIRY_MS + 20_000) {
            freshConn = record;
          }
        }

        if (freshConn) {
          parsed.push({
            userId: uid,
            username: freshConn.username || 'player',
            avatarEmoji: freshConn.avatarEmoji || '👾',
            avatarColor: freshConn.avatarColor || '#6B3DFF',
            activeView: freshConn.activeView || 'home',
            lastSeenAt: Number(freshConn.lastSeenAt || now),
          });
        }
      }

      latestFbPlayers = parsed;
      emitMerged();
    },
    (err) => {
      // On Firebase permission denied or offline, fall back to local presence
      latestFbPlayers = [];
      emitMerged();
    }
  );

  // 2. Local storage event listener for cross-tab updates in the same browser
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === LOCAL_PRESENCE_STORAGE_KEY) {
      emitMerged();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageChange);
  }

  // Initial emission with local presence right away
  emitMerged();

  // Periodic poll of local tabs in case a tab closed without storage event
  const localPollInterval = setInterval(emitMerged, 8_000);

  return () => {
    unsubFb();
    clearInterval(localPollInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageChange);
    }
  };
}
