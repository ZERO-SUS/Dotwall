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
 * Uses `serverTimestamp()` and stores profile fields inside each connection node
 * so `onDisconnect(tabConnRef).remove()` leaves zero orphaned nodes when all tabs close.
 */
export function startUserPresenceSession(
  user: PlayerProfile,
  activeView: string,
  onConnectionStateChange?: (connected: boolean) => void
): () => void {
  const db = getFirebaseDb();
  const connectedRef = ref(db, '.info/connected');
  const tabConnRef = ref(db, `presence/${user.id}/connections/${TAB_SESSION_ID}`);

  const writeConnectionNode = () => {
    set(tabConnRef, {
      userId: user.id,
      username: user.username.slice(0, 24),
      avatarEmoji: user.avatarEmoji,
      avatarColor: user.avatarColor,
      activeView: activeView.slice(0, 20),
      lastSeenAt: serverTimestamp(),
    }).catch(() => {});
  };

  const unsubConnected = onValue(connectedRef, (snap) => {
    const isConnected = Boolean(snap.val());
    onConnectionStateChange?.(isConnected);
    if (!isConnected) return;

    // When this tab disconnects, remove ONLY this tab's connection node.
    // When the user's last tab closes, Firebase RTDB automatically deletes `presence/{uid}`.
    onDisconnect(tabConnRef).remove().catch(() => {});
    writeConnectionNode();
  });

  // Periodic heartbeat every 20s while tab is open
  const heartbeatInterval = setInterval(writeConnectionNode, 20_000);

  return () => {
    clearInterval(heartbeatInterval);
    unsubConnected();
    remove(tabConnRef).catch(() => {});
  };
}

/**
 * Subscribes to global `presence/` and counts ONLY authenticated users with at least
 * one active non-expired tab connection (deduplicated by `uid`).
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
      // Pick the freshest tab connection updated within the last 65 seconds
      const freshConn = conns.find((c) => now - Number(c?.lastSeenAt || 0) < 65_000);
      if (freshConn) {
        activeUsers.push({
          userId: uid,
          username: freshConn.username || record.profile?.username || 'player',
          avatarEmoji: freshConn.avatarEmoji || record.profile?.avatarEmoji || '👾',
          avatarColor: freshConn.avatarColor || record.profile?.avatarColor || '#6B3DFF',
          activeView: freshConn.activeView || 'home',
          lastSeenAt: Number(freshConn.lastSeenAt || now),
        });
      }
    }

    callback(activeUsers);
  });
}
