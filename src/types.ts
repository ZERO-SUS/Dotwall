import { getFirebaseAuth } from './firebase/app';

export type NavTab =
  | 'home'
  | 'wall'
  | 'tasks'
  | 'explore'
  | 'leaderboard'
  | 'community'
  | 'profile'
  | 'admin';

export const RESERVED_ADMIN_USERNAME = 'zero_sus';
export const VERIFIED_ADMIN_EMAILS = new Set<string>([
  'zero_sus@dotwall.app',
  'darshan99806@gmail.com',
]);

export function isReservedAdminHandle(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const cleaned = raw.trim().toLowerCase().replace(/^@+/, '').replace(/[\s_-]+/g, '_');
  return (
    cleaned === 'zero_sus' ||
    cleaned === 'zerosus' ||
    cleaned.includes('zero_sus') ||
    cleaned.includes('zerosus')
  );
}

export type CanvasTool = 'place' | 'pick' | 'erase' | 'pan';

export interface GlobalPixel {
  x: number;
  y: number;
  color: string;
  ownerId: string;
  ownerUsername: string;
  version: number;
  updatedAt: number;
}

export interface PixelHistoryEntry {
  id: string;
  x: number;
  y: number;
  prevColor: string | null;
  prevOwnerId: string | null;
  prevOwnerUsername: string | null;
  newColor: string | null;
  userId: string;
  username: string;
  actionType: 'place' | 'replace' | 'erase' | 'undo' | 'redo';
  pixelVersion: number;
  undone: boolean;
  createdAt: number;
}

export interface PlayerProfile {
  id: string;
  username: string;
  displayName: string;
  avatarEmoji: string;
  avatarColor: string;
  bio: string;
  pixelsPlaced: number;
  tasksCompleted: number;
  points: number;
  lastPixelAt: number;
  nextCooldownAt: number;
  lastCommentAt?: number;
  joinedAt: number;
  achievements: string[];
  isAdmin?: boolean;
  banned?: boolean;
}

export function isDeveloperAdmin(
  user: PlayerProfile | null | undefined
): user is PlayerProfile & { isAdmin: true } {
  if (!user || user.isAdmin !== true) return false;
  const uname = (user.username || '').trim().toLowerCase().replace(/^@/, '');
  if (uname !== RESERVED_ADMIN_USERNAME) return false;

  try {
    const fbUser = getFirebaseAuth().currentUser;
    if (!fbUser || fbUser.uid !== user.id) return false;
    const email = (fbUser.email || '').trim().toLowerCase();
    return VERIFIED_ADMIN_EMAILS.has(email);
  } catch {
    return false;
  }
}

export interface OnlinePlayerPresence {
  userId: string;
  username: string;
  avatarEmoji: string;
  avatarColor: string;
  activeView: string;
  lastSeenAt: number;
}

export interface GlobalStats {
  capacity: number; // 1,000,000
  pixelsUsed: number;
  pixelsRemaining: number;
  completionPct: number;
  activeContributors: number;
  totalRegisteredPlayers: number;
  onlinePlayersCount: number;
  onlinePlayers: OnlinePlayerPresence[];
  totalTasksCompleted: number;
  totalArtworks: number;
}

export interface TaskPixel {
  x: number;
  y: number;
  color: string;
}

export interface PixelTask {
  id: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
  rewardPoints: number;
  gridSize: number;
  isDaily: boolean;
  palette: string[];
  referencePixels: TaskPixel[];
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  userId: string;
  username: string;
  gridSize: number;
  pixels: TaskPixel[];
  accuracyScore: number;
  pointsAwarded: number;
  createdAt: number;
}

export interface CommunityArtwork {
  id: string;
  title: string;
  description: string;
  category: string;
  gridSize: number;
  pixels: TaskPixel[];
  creatorId: string;
  creatorUsername: string;
  creatorAvatar: string;
  creatorColor: string;
  taskId: string | null;
  likes: string[];
  commentsCount: number;
  createdAt: number;
}

export interface CommunityComment {
  id: string;
  artworkId: string | null;
  parentId: string | null;
  userId: string;
  username: string;
  avatarEmoji: string;
  avatarColor: string;
  content: string;
  likes: string[];
  reported: boolean;
  reportReason: string | null;
  hidden: boolean;
  createdAt: number;
}

export interface AchievementItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  badgeColor: string;
  xpReward: number;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  icon: string;
  timestamp: number;
  read: boolean;
  linkTab?: NavTab;
}
