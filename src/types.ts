export type NavTab =
  | 'home'
  | 'wall'
  | 'tasks'
  | 'explore'
  | 'leaderboard'
  | 'community'
  | 'profile'
  | 'admin';

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

export function isDeveloperAdmin(user: PlayerProfile | null | undefined): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  const uid = (user.id || '').trim().toLowerCase();
  const uname = (user.username || '').trim().toLowerCase().replace(/^@/, '');
  return uid === 'zero_sus' || uname === 'zero_sus';
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
