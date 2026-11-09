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

/**
 * Registers UID-based presence in Firebase Realtime Database.
 * Prevents duplicate player counts across multiple tabs by storing tab connections
 * under `presence/{uid}/connections/{tabId}` and aggregating by unique `uid`.
 */
export function startUserPresenceSession(
  user: PlayerProfile,
  activeView: string,
  onConnectionStateChange?: (connected: boolean) => void
): () => void {
  const db = getFirebaseDb();
  const connectedRef = ref(db, '.info/connected');
  const userPresenceRef = ref(db, `presence/${user.id}`);
  const tabConnRef = ref(db, `presence/${user.id}/connections/${TAB_SESSION_ID}`);

  const unsubConnected = onValue(connectedRef, (snap) => {
    const isConnected = Boolean(snap.val());
    onConnectionStateChange?.(isConnected);
    if (!isConnected) return;

    // When this tab disconnects, remove ONLY this tab's connection node
    onDisconnect(tabConnRef).remove().catch(() => {});

    // Write user metadata + this tab's active connection
    set(tabConnRef, {
      activeView,
      lastSeenAt: Date.now(),
      serverTime: serverTimestamp(),
    }).catch(() => {});

    set(ref(db, `presence/${user.id}/profile`), {
      userId: user.id,
      username: user.username,
      avatarEmoji: user.avatarEmoji,
      avatarColor: user.avatarColor,
      activeView,
      lastSeenAt: Date.now(),
    }).catch(() => {});
  });

  // Periodic heartbeat every 20s while tab is open
  const heartbeatInterval = setInterval(() => {
    set(tabConnRef, {
      activeView,
      lastSeenAt: Date.now(),
      serverTime: serverTimestamp(),
    }).catch(() => {});
  }, 20_000);

  return () => {
    clearInterval(heartbeatInterval);
    unsubConnected();
    remove(tabConnRef).catch(() => {});
  };
}

/**
 * Subscribes to global `presence/` and counts ONLY authenticated users with at least
 * one active non-expired tab connection.
 */
export function subscribeToOnlinePlayers(
  callback: (players: OnlinePlayerPresence[]) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const allPresenceRef = ref(db, 'presence');

  return onValue(allPresenceRef, (snap) => {
    const val = snap.val();
    if (!val || typeof val !== 'object') {
      callback([]);
      return;
    }

    const now = Date.now();
    const activeUsers: OnlinePlayerPresence[] = [];

    for (const [uid, record] of Object.entries<any>(val)) {
      if (!record || !record.connections) continue;
      const conns = Object.values<any>(record.connections);
      // Check if at least one tab connection was updated within the last 60 seconds
      const freshConn = conns.find((c) => now - Number(c?.lastSeenAt || 0) < 65_000);
      if (freshConn && record.profile) {
        activeUsers.push({
          userId: uid,
          username: record.profile.username || 'player',
          avatarEmoji: record.profile.avatarEmoji || '👾',
          avatarColor: record.profile.avatarColor || '#6B3DFF',
          activeView: freshConn.activeView || record.profile.activeView || 'home',
          lastSeenAt: Number(freshConn.lastSeenAt || now),
        });
      }
    }

    callback(activeUsers);
  });
}
