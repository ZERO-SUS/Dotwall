import type {
  CommunityArtwork,
  CommunityComment,
  GlobalPixel,
  OnlinePlayerPresence,
  PixelHistoryEntry,
  PlayerProfile,
} from '../types';

/**
 * SECURITY HARDENING NOTE:
 * Unauthenticated third-party pub/sub relay (`ntfy.sh`) has been disabled to prevent
 * unverified client spoofing, unauthorized canvas erasures, and cooldown bypasses.
 * All real-time state synchronization now flows exclusively through Firebase Realtime Database
 * enforced by `database.rules.json`.
 */

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

export async function publishGlobalRelayEvent(
  _event: DistributeOmit<GlobalRelayEvent, 'senderTabId'>
): Promise<void> {
  // No-op: Firebase Realtime Database is the single source of truth
}

export async function fetchGlobalRelayHistory(_callbacks: GlobalRelayCallbacks): Promise<void> {
  // No-op: Firebase Realtime Database is the single source of truth
}

export function subscribeToGlobalRelayStream(_callbacks: GlobalRelayCallbacks): () => void {
  return () => {};
}

export function startGlobalRelayPresence(
  _user: PlayerProfile,
  _activeView: string,
  _onOnlinePlayersUpdate: (players: OnlinePlayerPresence[]) => void
): () => void {
  return () => {};
}
