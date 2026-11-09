import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Compass,
  Grid,
  Home,
  LogIn,
  MessageSquare,
  Moon,
  Paintbrush,
  Palette,
  Search,
  Server,
  Shuffle,
  Sparkles,
  Sun,
  Trophy,
  User,
  X,
} from 'lucide-react';
import type {
  AchievementItem,
  AppNotification,
  CommunityArtwork,
  CommunityComment,
  GlobalPixel,
  GlobalStats,
  NavTab,
  PixelHistoryEntry,
  PixelTask,
  PlayerProfile,
  TaskPixel,
  TaskSubmission,
} from './types';
import { COOLDOWN_SECONDS, GLOBAL_CAPACITY } from './constants';
import { getFirebaseAuth, getFirebaseDb } from './firebase/app';
import {
  ensurePlayerProfileInDb,
  formatFirebaseAuthError,
  loginWithEmail,
  loginWithGooglePopup,
  logoutFirebaseUser,
  onAuthStateChanged,
  registerWithEmail,
  sendAccountPasswordReset,
} from './firebase/auth';
import { startUserPresenceSession, subscribeToOnlinePlayers } from './firebase/presence';
import {
  placePixelInFirebase,
  submitTaskInFirebase,
  undoLastPlacementInFirebase,
} from './firebase/database';
import {
  publishGlobalRelayEvent,
  startGlobalRelayPresence,
  subscribeToGlobalRelayStream,
} from './firebase/globalRelay';
import { initDotwallAnalytics, trackGameEvent } from './firebase/analytics';
import { onValue, ref } from 'firebase/database';
import {
  ACHIEVEMENTS_CATALOG,
  createInitialDatabaseSeed,
  INITIAL_TASKS,
} from './lib/clientSeed';
import { GlobalCanvasWorkspace } from './components/GlobalCanvasWorkspace';
import { PixelTasksView } from './components/PixelTasksView';
import { ExploreView } from './components/ExploreView';
import { LeaderboardView } from './components/LeaderboardView';
import { CommunityView } from './components/CommunityView';
import { ProfileView } from './components/ProfileView';
import { GlobalInsightsAndGuide } from './components/GlobalInsightsAndGuide';
import { PixelArtworkPreview } from './components/PixelArtworkPreview';
import { BackendConfigModal } from './components/BackendConfigModal';
import { AuthModal } from './components/AuthModal';
import {
  applyAppearanceToDocument,
  AppearanceSettings,
  loadAppearanceSettings,
  ThemeCustomizerModal,
} from './components/ThemeCustomizerModal';

const USER_ID_STORAGE_KEY = 'dotwall_auth_user_id';
const STATIC_DB_STORAGE_KEY = 'dotwall_static_global_db_v2';
const SESSION_ID = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function isLocalhostRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  // Complete Theme & Custom Appearance System
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => loadAppearanceSettings());
  const [showThemeModal, setShowThemeModal] = useState<boolean>(false);

  useEffect(() => {
    applyAppearanceToDocument(appearance);
    if (appearance.mode !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyAppearanceToDocument(appearance);
    mq.addEventListener?.('change', listener);
    return () => mq.removeEventListener?.('change', listener);
  }, [appearance]);

  // Initialize Firebase Analytics safely
  useEffect(() => {
    initDotwallAnalytics();
  }, []);

  // Multiplayer Connection state
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'warn'>('live');
  const [connectionMode, setConnectionMode] = useState<
    'firebase-cloud' | 'supabase-cloud' | 'local-server' | 'static-global'
  >('firebase-cloud');
  const [rtdbStatus, setRtdbStatus] = useState<'connected' | 'permission-denied' | 'connecting'>(
    'connecting'
  );
  const [showBackendModal, setShowBackendModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  // Core Game State
  const [pixelsMap, setPixelsMap] = useState<Map<string, GlobalPixel>>(new Map());
  const [history, setHistory] = useState<PixelHistoryEntry[]>([]);
  const [users, setUsers] = useState<PlayerProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<PlayerProfile | null>(null);
  const [tasks, setTasks] = useState<PixelTask[]>(INITIAL_TASKS);
  const [taskSubmissions, setTaskSubmissions] = useState<TaskSubmission[]>([]);
  const [artworks, setArtworks] = useState<CommunityArtwork[]>([]);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [achievementsCatalog, setAchievementsCatalog] =
    useState<AchievementItem[]>(ACHIEVEMENTS_CATALOG);
  const [stats, setStats] = useState<GlobalStats>({
    capacity: GLOBAL_CAPACITY,
    pixelsUsed: 0,
    pixelsRemaining: GLOBAL_CAPACITY,
    completionPct: 0,
    activeContributors: 0,
    totalRegisteredPlayers: 0,
    onlinePlayersCount: 1,
    onlinePlayers: [],
    totalTasksCompleted: 0,
    totalArtworks: 0,
  });

  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState<number>(0);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [visibleChunkIds, setVisibleChunkIds] = useState<string[]>(['9_9', '9_10', '10_9', '10_10']);

  const [inspectedUsername, setInspectedUsername] = useState<string | null>(null);
  const [selectedExploreArtwork, setSelectedExploreArtwork] = useState<CommunityArtwork | null>(
    null
  );
  const [randomHomeArtIdx, setRandomHomeArtIdx] = useState<number>(0);
  const [showSearchModal, setShowSearchModal] = useState<boolean>(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [showNotifDropdown, setShowNotifDropdown] = useState<boolean>(false);
  const [showPresenceDropdown, setShowPresenceDropdown] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([
    {
      id: 'notif-welcome',
      title: 'Welcome to Dotwall 1000×1000!',
      body: 'Connected to Firebase (dotwall-13046). Place or modify pixels on the 1M grid and complete your 5 daily objects!',
      icon: '👾',
      timestamp: Date.now(),
      read: false,
      linkTab: 'tasks',
    },
  ]);

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const pushNotification = useCallback(
    (title: string, body: string, icon = '✨', linkTab?: NavTab) => {
      setNotifications((prev) => [
        {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          body,
          icon,
          timestamp: Date.now(),
          read: false,
          linkTab,
        },
        ...prev.slice(0, 19),
      ]);
    },
    []
  );

  // Recompute GlobalStats dynamically whenever pixelsMap or users change
  const recomputeStatsFromState = useCallback(
    (
      pxMap: Map<string, GlobalPixel>,
      usersList: PlayerProfile[],
      artsList: CommunityArtwork[],
      onlineList = stats.onlinePlayers
    ): GlobalStats => {
      const pixelsUsed = pxMap.size;
      const pixelsRemaining = Math.max(0, GLOBAL_CAPACITY - pixelsUsed);
      const completionPct = Number(((pixelsUsed / GLOBAL_CAPACITY) * 100).toFixed(4));
      const contributors = new Set<string>();
      for (const p of pxMap.values()) contributors.add(p.ownerId);

      return {
        capacity: GLOBAL_CAPACITY,
        pixelsUsed,
        pixelsRemaining,
        completionPct,
        activeContributors: contributors.size,
        totalRegisteredPlayers: usersList.length,
        onlinePlayersCount: Math.max(1, onlineList.length),
        onlinePlayers: onlineList,
        totalTasksCompleted: usersList.reduce((acc, u) => acc + (u.tasksCompleted || 0), 0),
        totalArtworks: artsList.length,
      };
    },
    [stats.onlinePlayers]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const nextCooldownAt = currentUser?.nextCooldownAt || 0;
  const estimatedServerNow = nowTick + serverTimeOffsetMs;
  const cooldownRemainingMs = Math.max(0, nextCooldownAt - estimatedServerNow);

  const prevCooldownRef = useRef<number>(0);
  useEffect(() => {
    if (prevCooldownRef.current > 0 && cooldownRemainingMs === 0) {
      pushNotification(
        'Pixel Charge Ready!',
        'Your 30-second cooldown is complete. Place or modify a pixel on the wall!',
        '⚡',
        'wall'
      );
    }
    prevCooldownRef.current = cooldownRemainingMs;
  }, [cooldownRemainingMs, pushNotification]);

  // Persist static seed snapshot helper
  const persistToLocalStore = useCallback(
    (
      pxMap: Map<string, GlobalPixel>,
      usersList: PlayerProfile[],
      histList: PixelHistoryEntry[],
      subsList: TaskSubmission[],
      artsList: CommunityArtwork[],
      cmtsList: CommunityComment[]
    ) => {
      try {
        const pixelsRecord: Record<string, GlobalPixel> = {};
        pxMap.forEach((v, k) => {
          pixelsRecord[k] = v;
        });
        const usersRecord: Record<string, PlayerProfile> = {};
        usersList.forEach((u) => {
          usersRecord[u.id] = u;
        });
        window.localStorage.setItem(
          STATIC_DB_STORAGE_KEY,
          JSON.stringify({
            pixels: pixelsRecord,
            users: usersRecord,
            history: histList.slice(-200),
            taskSubmissions: subsList.slice(0, 100),
            artworks: artsList,
            comments: cmtsList,
          })
        );
      } catch {
        // ignore storage quota errors
      }
    },
    []
  );

  // Initialize Local/Static State Seed
  const loadOrInitStaticEngine = useCallback(() => {
    let parsed: any = null;
    try {
      const raw = window.localStorage.getItem(STATIC_DB_STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch {
      // ignore
    }
    const seed = parsed && parsed.pixels && parsed.users ? parsed : createInitialDatabaseSeed();
    const map = new Map<string, GlobalPixel>();
    Object.values(seed.pixels as Record<string, GlobalPixel>).forEach((px) => {
      map.set(`${px.x},${px.y}`, px);
    });

    const usersList = Object.values(seed.users) as PlayerProfile[];
    const savedUserId = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    let me = usersList.find((u) => u.id === savedUserId) || null;
    if (!me) {
      me = {
        id: `usr-${Date.now().toString(36)}`,
        username: `pixel_${Math.floor(1000 + Math.random() * 8999)}`,
        displayName: 'Global Pixel Artist',
        avatarEmoji: '👾',
        avatarColor: '#6B3DFF',
        bio: 'Collaborating on the 1,000,000-pixel global wall.',
        pixelsPlaced: 0,
        tasksCompleted: 0,
        points: 50,
        lastPixelAt: 0,
        nextCooldownAt: 0,
        joinedAt: Date.now(),
        achievements: [],
      };
      usersList.push(me);
      seed.users[me.id] = me;
      window.localStorage.setItem(USER_ID_STORAGE_KEY, me.id);
      window.localStorage.setItem(STATIC_DB_STORAGE_KEY, JSON.stringify(seed));
    }

    const onlinePresence = [
      {
        userId: me.id,
        username: me.username,
        avatarEmoji: me.avatarEmoji,
        avatarColor: me.avatarColor,
        activeView: activeTab,
        lastSeenAt: Date.now(),
      },
    ];

    setPixelsMap(map);
    setHistory(seed.history || []);
    setUsers(usersList);
    setCurrentUser((prev) => prev || me);
    setTasks(INITIAL_TASKS);
    setTaskSubmissions(seed.taskSubmissions || []);
    setArtworks(seed.artworks || []);
    setComments(seed.comments || []);
    setAchievementsCatalog(ACHIEVEMENTS_CATALOG);
    setStats(recomputeStatsFromState(map, usersList, seed.artworks || [], onlinePresence));
    setConnectionState('live');
  }, [activeTab, recomputeStatsFromState]);

  // Bootstrap Multiplayer Engine
  const initializeMultiplayer = useCallback(async () => {
    setConnectionState('connecting');
    loadOrInitStaticEngine();

    // Only probe /api/* when running on localhost dev server (never in production on GitHub Pages)
    if (isLocalhostRuntime()) {
      try {
        const savedUserId = window.localStorage.getItem(USER_ID_STORAGE_KEY);
        const authRes = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: savedUserId || undefined }),
        });

        if (authRes.ok) {
          const authData = await authRes.json();
          let activeUser: PlayerProfile | null = null;
          if (authData.ok && authData.user) {
            activeUser = authData.user;
            window.localStorage.setItem(USER_ID_STORAGE_KEY, authData.user.id);
            if (authData.serverTime) {
              setServerTimeOffsetMs(authData.serverTime - Date.now());
            }
            setCurrentUser((prev) => prev || authData.user);
          }

          const stateRes = await fetch('/api/state');
          const stateData = await stateRes.json();
          if (stateData.ok) {
            const map = new Map<string, GlobalPixel>();
            for (const px of stateData.pixels as GlobalPixel[]) {
              map.set(`${px.x},${px.y}`, px);
            }
            setPixelsMap(map);
            setHistory(stateData.history || []);
            setUsers(stateData.users || []);
            setTasks(stateData.tasks || INITIAL_TASKS);
            setTaskSubmissions(stateData.taskSubmissions || []);
            setArtworks(stateData.artworks || []);
            setComments(stateData.comments || []);
            setAchievementsCatalog(stateData.achievementsCatalog || ACHIEVEMENTS_CATALOG);
            if (stateData.stats) setStats(stateData.stats);
            if (activeUser) {
              const freshMe = (stateData.users || []).find(
                (u: PlayerProfile) => u.id === activeUser!.id
              );
              if (freshMe) setCurrentUser(freshMe);
            }
            setConnectionMode('local-server');
            setConnectionState('live');
          }
        }
      } catch {
        // Local API not running -> use Firebase + Static Engine
      }
    }
  }, [loadOrInitStaticEngine]);

  useEffect(() => {
    initializeMultiplayer();
  }, []);

  // Subscribe to Firebase Authentication (dotwall-13046) session persistence
  useEffect(() => {
    const auth = getFirebaseAuth();
    let autoAuthAttempted = false;
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        if (!autoAuthAttempted) {
          autoAuthAttempted = true;
          try {
            const AUTO_CRED_KEY = 'dotwall_auto_fb_cred_v1';
            let credObj: { email: string; password: string; username: string } | null = null;
            const raw = window.localStorage.getItem(AUTO_CRED_KEY);
            if (raw) {
              credObj = JSON.parse(raw);
            }
            if (credObj && credObj.email && credObj.password) {
              await loginWithEmail(credObj.email, credObj.password).catch(() => {});
            } else {
              const randId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
              const autoUsername = `pixel_${Math.floor(1000 + Math.random() * 8999)}`;
              const newCred = {
                email: `player_${randId}@dotwall.app`,
                password: `Dw!${randId}#99`,
                username: autoUsername,
              };
              window.localStorage.setItem(AUTO_CRED_KEY, JSON.stringify(newCred));
              await registerWithEmail(newCred).catch(() => {});
            }
          } catch {
            // ignore auto-auth failure
          }
        }
        return;
      }
      try {
        const profile = await ensurePlayerProfileInDb(fbUser);
        window.localStorage.setItem(USER_ID_STORAGE_KEY, profile.id);
        setCurrentUser(profile);
        setUsers((prev) => {
          const exists = prev.some((u) => u.id === profile.id);
          return exists ? prev.map((u) => (u.id === profile.id ? profile : u)) : [...prev, profile];
        });
      } catch {
        // Fallback profile directly from Firebase Auth user
        const cleanHandle = (
          fbUser.displayName ||
          fbUser.email?.split('@')[0] ||
          `pixel_${fbUser.uid.slice(0, 6)}`
        )
          .replace(/^@/, '')
          .replace(/[^a-zA-Z0-9_.-]/g, '')
          .slice(0, 24);
        const fallbackProfile: PlayerProfile = {
          id: fbUser.uid,
          username: cleanHandle,
          displayName: fbUser.displayName || cleanHandle,
          avatarEmoji: '👾',
          avatarColor: '#6B3DFF',
          bio: 'Verified Firebase Player on Dotwall 1000×1000.',
          pixelsPlaced: 0,
          tasksCompleted: 0,
          points: 50,
          lastPixelAt: 0,
          nextCooldownAt: 0,
          joinedAt: Date.now(),
          achievements: [],
        };
        window.localStorage.setItem(USER_ID_STORAGE_KEY, fallbackProfile.id);
        setCurrentUser((prev) => (prev && prev.id === fbUser.uid ? prev : fallbackProfile));
        setUsers((prev) =>
          prev.some((u) => u.id === fallbackProfile.id) ? prev : [...prev, fallbackProfile]
        );
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to visible chunks in Firebase Realtime Database (`canvasChunks/{chunkX}_{chunkY}`)
  useEffect(() => {
    const db = getFirebaseDb();
    const unsubscribes: (() => void)[] = [];

    for (const chunkId of visibleChunkIds.slice(0, 36)) {
      const chunkRef = ref(db, `canvasChunks/${chunkId}`);
      const unsub = onValue(
        chunkRef,
        (snapshot) => {
          setRtdbStatus('connected');
          setConnectionMode('firebase-cloud');
          setConnectionState('live');
          const val = snapshot.val();
          if (val && typeof val === 'object') {
            setPixelsMap((prev) => {
              const next = new Map(prev);
              Object.values(val as Record<string, any>).forEach((cell) => {
                if (cell && typeof cell.x === 'number' && typeof cell.y === 'number') {
                  next.set(`${cell.x},${cell.y}`, {
                    x: cell.x,
                    y: cell.y,
                    color: cell.color,
                    ownerId: cell.uid || cell.ownerId,
                    ownerUsername: cell.username || cell.ownerUsername || 'player',
                    version: cell.version || 1,
                    updatedAt: cell.updatedAt || Date.now(),
                  });
                }
              });
              return next;
            });
          }
        },
        (err) => {
          if (err?.message?.toLowerCase().includes('permission_denied') || err?.message?.toLowerCase().includes('permission denied')) {
            setRtdbStatus('permission-denied');
          }
        }
      );
      unsubscribes.push(unsub);
    }

    return () => {
      unsubscribes.forEach((u) => u());
    };
  }, [visibleChunkIds]);

  // Subscribe to Firebase Realtime Presence + Global Cross-Device WebSocket Presence
  useEffect(() => {
    if (!currentUser) return;
    const stopPresence = startUserPresenceSession(currentUser, activeTab);
    const stopOnlineListener = subscribeToOnlinePlayers((onlineList) => {
      if (onlineList.length > 0) {
        setStats((prev) => ({
          ...prev,
          onlinePlayersCount: onlineList.length,
          onlinePlayers: onlineList,
        }));
      }
    });
    const stopRelayPresence = startGlobalRelayPresence(
      currentUser,
      activeTab,
      (relayOnlineList) => {
        if (relayOnlineList.length > 0) {
          setStats((prev) => {
            const merged = new Map<string, any>();
            for (const p of prev.onlinePlayers || []) merged.set(p.userId, p);
            for (const p of relayOnlineList) merged.set(p.userId, p);
            const list = Array.from(merged.values());
            return {
              ...prev,
              onlinePlayersCount: Math.max(1, list.length),
              onlinePlayers: list,
            };
          });
        }
      }
    );
    return () => {
      stopPresence();
      stopOnlineListener();
      stopRelayPresence();
    };
  }, [currentUser?.id, currentUser?.username, activeTab]);

  // Global Real-Time Cloud Relay (Syncs pixels, undos, artworks, and comments across all devices/browsers worldwide in <150ms)
  useEffect(() => {
    const unsubRelay = subscribeToGlobalRelayStream({
      onConnectionState: (connected) => {
        if (connected) setConnectionState('live');
      },
      onPixelPlaced: (pixel, historyEntry) => {
        setPixelsMap((prev) => {
          const next = new Map(prev);
          const existing = next.get(`${pixel.x},${pixel.y}`);
          if (existing && existing.updatedAt && pixel.updatedAt && existing.updatedAt > pixel.updatedAt) {
            return prev;
          }
          next.set(`${pixel.x},${pixel.y}`, pixel);
          return next;
        });
        if (historyEntry) {
          setHistory((prev) =>
            prev.some((h) => h.id === historyEntry.id)
              ? prev
              : [...prev.slice(-199), historyEntry]
          );
        }
      },
      onPixelUndone: (x, y, restoredPixel, historyId) => {
        setPixelsMap((prev) => {
          const next = new Map(prev);
          if (restoredPixel) {
            next.set(`${x},${y}`, restoredPixel);
          } else {
            next.delete(`${x},${y}`);
          }
          return next;
        });
        if (historyId) {
          setHistory((prev) =>
            prev.map((h) => (h.id === historyId ? { ...h, undone: true } : h))
          );
        }
      },
      onArtworkPublished: (artwork) => {
        setArtworks((prev) =>
          prev.some((a) => a.id === artwork.id) ? prev : [artwork, ...prev]
        );
      },
      onCommentPosted: (comment) => {
        setComments((prev) =>
          prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]
        );
      },
    });
    return () => unsubRelay();
  }, []);

  // Multi-tab BroadcastChannel sync for instant cross-tab updates
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel('dotwall_global_sync');
    broadcastChannelRef.current = bc;
    bc.onmessage = (evt) => {
      const msg = evt.data;
      if (msg?.type === 'pixel_placed' && msg.pixel) {
        setPixelsMap((prev) => {
          const next = new Map(prev);
          next.set(`${msg.pixel.x},${msg.pixel.y}`, msg.pixel);
          return next;
        });
        if (msg.historyEntry) {
          setHistory((prev) => [...prev.slice(-199), msg.historyEntry]);
        }
      } else if (msg?.type === 'pixel_undone' && typeof msg.x === 'number' && typeof msg.y === 'number') {
        setPixelsMap((prev) => {
          const next = new Map(prev);
          if (msg.restoredPixel) {
            next.set(`${msg.x},${msg.y}`, msg.restoredPixel);
          } else {
            next.delete(`${msg.x},${msg.y}`);
          }
          return next;
        });
      }
    };
    return () => bc.close();
  }, []);

  // SSE stream when connected to local server on localhost
  useEffect(() => {
    if (!currentUser || connectionMode !== 'local-server' || !isLocalhostRuntime()) return;

    const params = new URLSearchParams({
      sessionId: SESSION_ID,
      userId: currentUser.id,
      username: currentUser.username,
      avatarEmoji: currentUser.avatarEmoji,
      avatarColor: currentUser.avatarColor,
      view: activeTab,
    });

    const es = new EventSource(`/api/stream?${params.toString()}`);

    es.onopen = () => setConnectionState('live');

    es.addEventListener('presence', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        setStats((prev) => ({
          ...prev,
          onlinePlayersCount: data.onlinePlayersCount,
          onlinePlayers: data.onlinePlayers || [],
        }));
      } catch {
        // ignore
      }
    });

    es.addEventListener('pixel_update', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data.pixel) {
          setPixelsMap((prev) => {
            const next = new Map(prev);
            next.set(`${data.pixel.x},${data.pixel.y}`, data.pixel);
            return next;
          });
        } else if (data.deletedCoord) {
          setPixelsMap((prev) => {
            const next = new Map(prev);
            next.delete(`${data.deletedCoord.x},${data.deletedCoord.y}`);
            return next;
          });
        }
        if (data.historyEntry) {
          setHistory((prev) => [...prev.slice(-199), data.historyEntry]);
        }
        if (data.user) {
          setUsers((prev) => {
            const exists = prev.some((u) => u.id === data.user.id);
            return exists
              ? prev.map((u) => (u.id === data.user.id ? data.user : u))
              : [...prev, data.user];
          });
          setCurrentUser((me) => (me && me.id === data.user.id ? data.user : me));
        }
        if (data.stats) setStats(data.stats);
      } catch {
        // ignore
      }
    });

    es.addEventListener('task_submitted', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data.submission) {
          setTaskSubmissions((prev) => [
            data.submission,
            ...prev.filter((s) => s.id !== data.submission.id),
          ]);
        }
        if (data.artwork) {
          setArtworks((prev) => [
            data.artwork,
            ...prev.filter((a) => a.id !== data.artwork.id),
          ]);
        }
        if (data.user) {
          setUsers((prev) => prev.map((u) => (u.id === data.user.id ? data.user : u)));
          setCurrentUser((me) => (me && me.id === data.user.id ? data.user : me));
        }
        if (data.stats) setStats(data.stats);
      } catch {
        // ignore
      }
    });

    es.addEventListener('artwork_liked', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        setArtworks((prev) =>
          prev.map((a) => (a.id === data.artworkId ? { ...a, likes: data.likes } : a))
        );
      } catch {
        // ignore
      }
    });

    es.addEventListener('comment_added', (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data);
        if (data.comment) {
          setComments((prev) =>
            prev.some((c) => c.id === data.comment.id) ? prev : [...prev, data.comment]
          );
        }
      } catch {
        // ignore
      }
    });

    return () => es.close();
  }, [currentUser?.id, connectionMode, activeTab]);

  // PLACE OR MODIFY PIXEL
  const handlePlacePixel = useCallback(
    async (x: number, y: number, color: string) => {
      if (!currentUser) {
        setShowAuthModal(true);
        return { ok: false, error: 'Please sign in to place pixels.' };
      }

      const now = Date.now();
      if (currentUser.nextCooldownAt && now < currentUser.nextCooldownAt) {
        const waitSec = Math.ceil((currentUser.nextCooldownAt - now) / 1000);
        return { ok: false, error: `Cooldown active! Wait ${waitSec}s.` };
      }

      // 1. Try Firebase RTDB Chunked Placement first when RTDB is connected
      if (rtdbStatus === 'connected') {
        try {
          const fbRes = await placePixelInFirebase({
            user: currentUser,
            x,
            y,
            color,
          });
          if (fbRes.ok && fbRes.pixel && fbRes.historyEntry && fbRes.nextCooldownAt) {
            const nextUser: PlayerProfile = {
              ...currentUser,
              pixelsPlaced: (currentUser.pixelsPlaced || 0) + 1,
              points:
                (currentUser.points || 0) +
                (fbRes.historyEntry.actionType === 'replace' ? 12 : 10),
              lastPixelAt: now,
              nextCooldownAt: fbRes.nextCooldownAt,
            };
            setPixelsMap((prev) => {
              const next = new Map(prev);
              next.set(`${x},${y}`, fbRes.pixel!);
              setStats(recomputeStatsFromState(next, users, artworks));
              return next;
            });
            setHistory((prev) => [...prev.slice(-199), fbRes.historyEntry!]);
            setCurrentUser(nextUser);
            setUsers((prev) => prev.map((u) => (u.id === nextUser.id ? nextUser : u)));
            publishGlobalRelayEvent({
              type: 'pixel_placed',
              pixel: fbRes.pixel!,
              historyEntry: fbRes.historyEntry!,
            });
            trackGameEvent('pixel_placed', {
              x,
              y,
              actionType: fbRes.historyEntry.actionType,
            });
            return { ok: true };
          } else if (fbRes.error && !fbRes.error.toLowerCase().includes('permission')) {
            return { ok: false, error: fbRes.error };
          }
        } catch {
          // Fall through if RTDB rules are not yet published
        }
      }

      // 2. If connected to Local Server on localhost
      if (connectionMode === 'local-server' && isLocalhostRuntime()) {
        try {
          const res = await fetch('/api/pixel/place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: currentUser.id,
              username: currentUser.username,
              x,
              y,
              color,
            }),
          });
          const data = await res.json();
          if (data.serverTime) setServerTimeOffsetMs(data.serverTime - Date.now());
          if (!data.ok) return { ok: false, error: data.error };
          if (data.user) setCurrentUser(data.user);
          if (data.stats) setStats(data.stats);
          if (data.pixel && data.historyEntry) {
            publishGlobalRelayEvent({
              type: 'pixel_placed',
              pixel: data.pixel,
              historyEntry: data.historyEntry,
            });
          }
          trackGameEvent('pixel_placed', { x, y });
          return { ok: true };
        } catch {
          // Fall through to client engine
        }
      }

      // 3. Synchronized Client / BroadcastChannel Engine
      const key = `${x},${y}`;
      const existing = pixelsMap.get(key);
      const isReplacement = Boolean(existing);
      const newVersion = existing ? existing.version + 1 : 1;
      const updatedPixel: GlobalPixel = {
        x,
        y,
        color: color.toUpperCase(),
        ownerId: currentUser.id,
        ownerUsername: currentUser.username,
        version: newVersion,
        updatedAt: now,
      };

      const histEntry: PixelHistoryEntry = {
        id: `hist-${now}-${Math.random().toString(36).slice(2, 6)}`,
        x,
        y,
        prevColor: existing ? existing.color : null,
        prevOwnerId: existing ? existing.ownerId : null,
        prevOwnerUsername: existing ? existing.ownerUsername : null,
        newColor: color.toUpperCase(),
        userId: currentUser.id,
        username: currentUser.username,
        actionType: isReplacement ? 'replace' : 'place',
        pixelVersion: newVersion,
        undone: false,
        createdAt: now,
      };

      const nextUser: PlayerProfile = {
        ...currentUser,
        pixelsPlaced: (currentUser.pixelsPlaced || 0) + 1,
        points: (currentUser.points || 0) + (isReplacement ? 12 : 10),
        lastPixelAt: now,
        nextCooldownAt: now + COOLDOWN_SECONDS * 1000,
        achievements: Array.from(
          new Set([
            ...(currentUser.achievements || []),
            'first_dot',
            ...(isReplacement ? ['pixel_modifier'] : []),
          ])
        ),
      };

      setPixelsMap((prev) => {
        const next = new Map(prev);
        next.set(key, updatedPixel);
        const nextUsers = users.map((u) => (u.id === nextUser.id ? nextUser : u));
        setStats(recomputeStatsFromState(next, nextUsers, artworks));
        persistToLocalStore(
          next,
          nextUsers,
          [...history, histEntry],
          taskSubmissions,
          artworks,
          comments
        );
        return next;
      });
      setHistory((prev) => [...prev.slice(-199), histEntry]);
      setCurrentUser(nextUser);
      setUsers((prev) => prev.map((u) => (u.id === nextUser.id ? nextUser : u)));

      broadcastChannelRef.current?.postMessage({
        type: 'pixel_placed',
        pixel: updatedPixel,
        historyEntry: histEntry,
      });

      publishGlobalRelayEvent({
        type: 'pixel_placed',
        pixel: updatedPixel,
        historyEntry: histEntry,
      });

      trackGameEvent('pixel_placed', { x, y, actionType: histEntry.actionType });
      return { ok: true };
    },
    [
      currentUser,
      rtdbStatus,
      connectionMode,
      pixelsMap,
      recomputeStatsFromState,
      users,
      artworks,
      history,
      taskSubmissions,
      comments,
      persistToLocalStore,
    ]
  );

  // SAFE UNDO LAST PIXEL PLACEMENT (Only if not overwritten by another user; does NOT reset cooldown)
  const handleUndoPixel = useCallback(async () => {
    if (!currentUser) {
      return { ok: false, error: 'Sign in required to undo.' };
    }

    const entry = [...history]
      .reverse()
      .find(
        (h) =>
          h.userId === currentUser.id &&
          !h.undone &&
          (h.actionType === 'place' || h.actionType === 'replace') &&
          Boolean(h.newColor)
      );

    if (!entry || !entry.newColor) {
      return { ok: false, error: 'No eligible recent placement found to undo.' };
    }

    const key = `${entry.x},${entry.y}`;
    const currentCell = pixelsMap.get(key);
    if (
      !currentCell ||
      currentCell.ownerId !== currentUser.id ||
      currentCell.color.toUpperCase() !== entry.newColor.toUpperCase()
    ) {
      return {
        ok: false,
        error: 'Cannot undo: another player has already modified this pixel!',
      };
    }

    if (rtdbStatus === 'connected') {
      try {
        const fbRes = await undoLastPlacementInFirebase(currentUser, history);
        if (!fbRes.ok && fbRes.error && !fbRes.error.toLowerCase().includes('permission')) {
          return fbRes;
        }
      } catch {
        // continue to local state update
      }
    }

    if (connectionMode === 'local-server' && isLocalhostRuntime()) {
      try {
        const res = await fetch('/api/pixel/undo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id }),
        });
        const data = await res.json();
        if (data.ok) {
          return { ok: true, x: entry.x, y: entry.y };
        }
      } catch {
        // fall through
      }
    }

    const restoredPixel: GlobalPixel | null =
      entry.prevColor && entry.prevOwnerId
        ? {
            x: entry.x,
            y: entry.y,
            color: entry.prevColor,
            ownerId: entry.prevOwnerId,
            ownerUsername: entry.prevOwnerUsername || 'player',
            version: (currentCell.version || 1) + 1,
            updatedAt: Date.now(),
          }
        : null;

    setPixelsMap((prev) => {
      const next = new Map(prev);
      if (restoredPixel) {
        next.set(key, restoredPixel);
      } else {
        next.delete(key);
      }
      setStats(recomputeStatsFromState(next, users, artworks));
      return next;
    });

    setHistory((prev) => prev.map((h) => (h.id === entry.id ? { ...h, undone: true } : h)));

    broadcastChannelRef.current?.postMessage({
      type: 'pixel_undone',
      x: entry.x,
      y: entry.y,
      restoredPixel,
    });

    publishGlobalRelayEvent({
      type: 'pixel_undone',
      x: entry.x,
      y: entry.y,
      restoredPixel,
      historyId: entry.id,
    });

    return { ok: true, x: entry.x, y: entry.y };
  }, [
    currentUser,
    history,
    pixelsMap,
    rtdbStatus,
    connectionMode,
    recomputeStatsFromState,
    users,
    artworks,
  ]);

  // SUBMIT SEQUENTIAL DAILY TASK
  const handleSubmitTask = useCallback(
    async (payload: {
      taskId: string;
      pixels: TaskPixel[];
      accuracyScore: number;
      title: string;
      description: string;
      shareToCommunity: boolean;
      dailyStageIndex?: number;
    }) => {
      if (!currentUser) {
        setShowAuthModal(true);
        return { ok: false, error: 'Sign in required.' };
      }

      const todayUtc = new Date().toISOString().slice(0, 10);
      const alreadyClaimed = taskSubmissions.some(
        (s) =>
          s.userId === currentUser.id &&
          s.taskId === payload.taskId &&
          new Date(s.createdAt).toISOString().slice(0, 10) === todayUtc
      );
      if (alreadyClaimed) {
        return {
          ok: false,
          error: `You already claimed today's daily reward (${todayUtc} UTC) for this task!`,
        };
      }

      const taskObj = tasks.find((t) => t.id === payload.taskId);
      const reward = (taskObj?.rewardPoints || 60) + (payload.dailyStageIndex === 5 ? 250 : 0);

      if (rtdbStatus === 'connected') {
        try {
          const fbRes = await submitTaskInFirebase({
            user: currentUser,
            taskId: payload.taskId,
            taskTitle: payload.title || taskObj?.title || payload.taskId,
            taskCategory: taskObj?.category || 'Everyday Objects',
            gridSize: taskObj?.gridSize || 16,
            pixels: payload.pixels,
            accuracyScore: payload.accuracyScore,
            rewardPoints: reward,
            title: payload.title || taskObj?.title || payload.taskId,
            description: payload.description,
            shareToCommunity: payload.shareToCommunity,
            dailyStageIndex: payload.dailyStageIndex,
          });
          if (!fbRes.ok && fbRes.error && !fbRes.error.toLowerCase().includes('permission')) {
            return { ok: false, error: fbRes.error };
          }
        } catch {
          // fall through
        }
      }

      if (connectionMode === 'local-server' && isLocalhostRuntime()) {
        try {
          const res = await fetch('/api/tasks/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, ...payload }),
          });
          const data = await res.json();
          if (data.ok) {
            if (data.user) setCurrentUser(data.user);
            if (data.stats) setStats(data.stats);
            trackGameEvent('task_submitted', { taskId: payload.taskId });
            return { ok: true };
          }
        } catch {
          // Fall through
        }
      }

      const now = Date.now();
      const newSub: TaskSubmission = {
        id: `sub-${now}`,
        taskId: payload.taskId,
        userId: currentUser.id,
        username: currentUser.username,
        gridSize: taskObj?.gridSize || 16,
        pixels: payload.pixels,
        accuracyScore: payload.accuracyScore,
        pointsAwarded: reward,
        createdAt: now,
      };

      setTaskSubmissions((prev) => [newSub, ...prev]);

      if (payload.shareToCommunity !== false) {
        const newArt: CommunityArtwork = {
          id: `art-${now}`,
          title: payload.title,
          description: payload.description,
          category: taskObj?.category || 'Everyday Objects',
          gridSize: taskObj?.gridSize || 16,
          pixels: payload.pixels,
          creatorId: currentUser.id,
          creatorUsername: currentUser.username,
          creatorAvatar: currentUser.avatarEmoji,
          creatorColor: currentUser.avatarColor,
          taskId: payload.taskId,
          likes: [currentUser.id],
          commentsCount: 0,
          createdAt: now,
        };
        setArtworks((prev) => [newArt, ...prev]);
        publishGlobalRelayEvent({
          type: 'artwork_published',
          artwork: newArt,
        });
      }

      const nextUser: PlayerProfile = {
        ...currentUser,
        tasksCompleted: (currentUser.tasksCompleted || 0) + 1,
        points: (currentUser.points || 0) + reward,
        achievements: Array.from(
          new Set([
            ...(currentUser.achievements || []),
            'task_rookie',
            ...(payload.dailyStageIndex === 5 ? ['daily_five_sweep'] : []),
          ])
        ),
      };
      setCurrentUser(nextUser);
      setUsers((prev) => prev.map((u) => (u.id === nextUser.id ? nextUser : u)));
      trackGameEvent('task_submitted', { taskId: payload.taskId, reward });

      return { ok: true };
    },
    [currentUser, taskSubmissions, tasks, rtdbStatus, connectionMode]
  );

  const handleToggleLikeArtwork = useCallback(
    async (artworkId: string) => {
      if (!currentUser) {
        setShowAuthModal(true);
        return;
      }
      if (connectionMode === 'local-server' && isLocalhostRuntime()) {
        try {
          await fetch('/api/artworks/like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, artworkId }),
          });
          return;
        } catch {
          // fallback
        }
      }
      setArtworks((prev) =>
        prev.map((a) => {
          if (a.id !== artworkId) return a;
          const exists = a.likes.includes(currentUser.id);
          return {
            ...a,
            likes: exists
              ? a.likes.filter((id) => id !== currentUser.id)
              : [...a.likes, currentUser.id],
          };
        })
      );
    },
    [currentUser, connectionMode]
  );

  const handlePostComment = useCallback(
    async (payload: { artworkId: string | null; parentId?: string | null; content: string }) => {
      if (!currentUser) {
        setShowAuthModal(true);
        return { ok: false, error: 'Sign in required.' };
      }
      if (connectionMode === 'local-server' && isLocalhostRuntime()) {
        try {
          const res = await fetch('/api/comments/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, ...payload }),
          });
          const data = await res.json();
          if (data.ok) {
            if (data.user) setCurrentUser(data.user);
            return { ok: true };
          }
          return { ok: false, error: data.error };
        } catch {
          // fallback
        }
      }

      const newCmt: CommunityComment = {
        id: `cmt-${Date.now()}`,
        artworkId: payload.artworkId,
        parentId: payload.parentId || null,
        userId: currentUser.id,
        username: currentUser.username,
        avatarEmoji: currentUser.avatarEmoji,
        avatarColor: currentUser.avatarColor,
        content: payload.content.replace(/[<>]/g, '').trim().slice(0, 500),
        likes: [],
        reported: false,
        reportReason: null,
        hidden: false,
        createdAt: Date.now(),
      };
      setComments((prev) => [...prev, newCmt]);
      publishGlobalRelayEvent({
        type: 'comment_posted',
        comment: newCmt,
      });
      return { ok: true };
    },
    [currentUser, connectionMode]
  );

  const handleReportComment = useCallback(
    async (commentId: string, reason: string, hideImmediately = false) => {
      if (connectionMode === 'local-server' && isLocalhostRuntime()) {
        fetch('/api/comments/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commentId, reason, hideImmediately }),
        }).catch(() => {});
      }
      if (hideImmediately) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } else {
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, reported: true, reportReason: reason } : c
          )
        );
      }
    },
    [connectionMode]
  );

  const handleUpdateProfile = useCallback(
    async (payload: {
      username: string;
      displayName: string;
      bio: string;
      avatarEmoji: string;
      avatarColor: string;
    }) => {
      if (!currentUser) return { ok: false, error: 'Not signed in.' };
      if (connectionMode === 'local-server' && isLocalhostRuntime()) {
        try {
          const res = await fetch('/api/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, ...payload }),
          });
          const data = await res.json();
          if (data.ok && data.user) {
            setCurrentUser(data.user);
            return { ok: true };
          }
        } catch {
          // fallback
        }
      }

      const updated: PlayerProfile = {
        ...currentUser,
        ...payload,
      };
      setCurrentUser(updated);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      return { ok: true };
    },
    [currentUser, connectionMode]
  );

  // Full Login / Sign Up Handler (Firebase Auth `dotwall-13046` + Profile Sync)
  const handleAuthAction = useCallback(
    async (payload: {
      mode: 'login' | 'signup';
      email?: string;
      username: string;
      password?: string;
      avatarEmoji?: string;
      avatarColor?: string;
    }) => {
      let firebaseUid: string | null = null;

      if (payload.email && payload.password && payload.email.includes('@')) {
        try {
          if (payload.mode === 'signup') {
            const prof = await registerWithEmail({
              email: payload.email,
              password: payload.password,
              username: payload.username,
              avatarEmoji: payload.avatarEmoji,
              avatarColor: payload.avatarColor,
            });
            firebaseUid = prof.id;
          } else {
            const prof = await loginWithEmail(payload.email, payload.password);
            firebaseUid = prof.id;
          }
        } catch (err: any) {
          // If Firebase Auth succeeded in creating/signing in the user but RTDB profile read threw permission_denied,
          // check if getFirebaseAuth().currentUser is populated!
          const activeFbUser = getFirebaseAuth().currentUser;
          if (activeFbUser && activeFbUser.email?.toLowerCase() === payload.email.trim().toLowerCase()) {
            firebaseUid = activeFbUser.uid;
          } else {
            return { ok: false, error: formatFirebaseAuthError(err) };
          }
        }
      }

      const cleanHandle = (
        payload.username ||
        payload.email?.split('@')[0] ||
        `pixel_${Math.floor(100 + Math.random() * 899)}`
      )
        .replace(/^@/, '')
        .replace(/[^a-zA-Z0-9_.-]/g, '')
        .slice(0, 24);

      if (connectionMode === 'local-server' && isLocalhostRuntime()) {
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: firebaseUid || undefined,
              username: cleanHandle,
              loginByUsername: !firebaseUid,
              avatarEmoji: payload.avatarEmoji,
              avatarColor: payload.avatarColor,
            }),
          });
          const data = await res.json();
          if (data.ok && data.user) {
            const mergedUser: PlayerProfile = firebaseUid
              ? { ...data.user, id: firebaseUid }
              : data.user;
            window.localStorage.setItem(USER_ID_STORAGE_KEY, mergedUser.id);
            setCurrentUser(mergedUser);
            setUsers((prev) =>
              prev.some((u) => u.id === mergedUser.id)
                ? prev.map((u) => (u.id === mergedUser.id ? mergedUser : u))
                : [...prev, mergedUser]
            );
            pushNotification(
              `Signed in as @${mergedUser.username}`,
              'Your Firebase UID, cooldown, and pixel stats are now synced.',
              mergedUser.avatarEmoji || '👾'
            );
            trackGameEvent('login', { method: payload.email ? 'email' : 'username' });
            return { ok: true };
          }
        } catch {
          // fallback
        }
      }

      let found = users.find(
        (u) =>
          (firebaseUid && u.id === firebaseUid) ||
          u.username.toLowerCase() === cleanHandle.toLowerCase()
      );
      if (!found) {
        found = {
          id: firebaseUid || `usr-${Date.now().toString(36)}`,
          username: cleanHandle,
          displayName: cleanHandle,
          avatarEmoji: payload.avatarEmoji || '👾',
          avatarColor: payload.avatarColor || '#6B3DFF',
          bio: 'Playing on the 1,000,000-pixel global wall.',
          pixelsPlaced: 0,
          tasksCompleted: 0,
          points: 50,
          lastPixelAt: 0,
          nextCooldownAt: 0,
          joinedAt: Date.now(),
          achievements: [],
        };
        setUsers((prev) => [...prev, found!]);
      }
      window.localStorage.setItem(USER_ID_STORAGE_KEY, found.id);
      setCurrentUser(found);
      pushNotification(
        `Signed in as @${found.username}`,
        'Ready to place pixels and complete your 5 daily objects!',
        found.avatarEmoji
      );
      return { ok: true };
    },
    [connectionMode, users, pushNotification]
  );

  const handleGoogleLogin = useCallback(async () => {
    try {
      const prof = await loginWithGooglePopup();
      window.localStorage.setItem(USER_ID_STORAGE_KEY, prof.id);
      setCurrentUser(prof);
      setUsers((prev) => (prev.some((u) => u.id === prof.id) ? prev : [...prev, prof]));
      pushNotification(
        `Signed in with Google as @${prof.username}`,
        'Your Firebase UID is active across the 1000×1000 wall.',
        prof.avatarEmoji
      );
      trackGameEvent('login', { method: 'google' });
      return { ok: true };
    } catch (err: any) {
      const activeFbUser = getFirebaseAuth().currentUser;
      if (activeFbUser) {
        const cleanName = (
          activeFbUser.displayName ||
          activeFbUser.email?.split('@')[0] ||
          `google_${activeFbUser.uid.slice(0, 5)}`
        )
          .replace(/[^a-zA-Z0-9_.-]/g, '')
          .slice(0, 22);
        return await handleAuthAction({
          mode: 'login',
          username: cleanName,
          email: activeFbUser.email || undefined,
        });
      }
      return { ok: false, error: formatFirebaseAuthError(err) };
    }
  }, [pushNotification, handleAuthAction]);

  const handleResetPassword = useCallback(async (email: string) => {
    try {
      await sendAccountPasswordReset(email);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: formatFirebaseAuthError(err) };
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutFirebaseUser();
    window.localStorage.removeItem(USER_ID_STORAGE_KEY);
    setCurrentUser(null);
    pushNotification('Signed Out', 'You have signed out of your Dotwall account.', '👋');
  }, [pushNotification]);

  const handleInspectPlayer = useCallback((username: string) => {
    setInspectedUsername(username);
    setActiveTab('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const dailyTask = useMemo(() => tasks[0], [tasks]);
  const spotlightArtwork = useMemo(
    () => artworks[randomHomeArtIdx % Math.max(1, artworks.length)] || artworks[0],
    [artworks, randomHomeArtIdx]
  );

  const formattedPixelsUsed = useMemo(() => {
    return String(stats.pixelsUsed).padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }, [stats.pixelsUsed]);

  const searchResults = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q) return { players: [], artworks: [], tasks: [] };
    return {
      players: users.filter(
        (u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)
      ),
      artworks: artworks.filter(
        (a) => a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
      ),
      tasks: tasks.filter((t) => t.title.toLowerCase().includes(q)),
    };
  }, [globalSearchQuery, users, artworks, tasks]);

  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Home', icon: <Home size={14} /> },
    { id: 'wall', label: 'Global Wall', icon: <Grid size={14} /> },
    { id: 'tasks', label: 'Pixel Tasks (5/Day)', icon: <Palette size={14} /> },
    { id: 'explore', label: 'Explore', icon: <Compass size={14} /> },
    { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy size={14} /> },
    { id: 'community', label: 'Community', icon: <MessageSquare size={14} /> },
    { id: 'profile', label: 'Profile', icon: <User size={14} /> },
  ];

  const isCurrentlyDark =
    document.documentElement.getAttribute('data-theme') === 'dark' || appearance.mode === 'dark';

  return (
    <div className="wrap">
      {/* PRIMARY NAVIGATION BAR */}
      <nav className="nav" aria-label="Primary">
        <div
          className="brand"
          onClick={() => {
            setActiveTab('home');
            setInspectedUsername(null);
          }}
          style={{ cursor: 'pointer' }}
        >
          <svg className="logo" viewBox="0 0 34 34" aria-hidden="true">
            <rect x="0" y="0" width="10" height="10" rx="2" fill="#6B3DFF" />
            <rect x="12" y="0" width="10" height="10" rx="2" fill="#5CF2B2" />
            <rect x="24" y="0" width="10" height="10" rx="2" fill="#FFD93B" />
            <rect x="0" y="12" width="10" height="10" rx="2" fill="#FF84CB" />
            <rect x="12" y="12" width="10" height="10" rx="2" fill="#E0229B" />
            <rect x="24" y="12" width="10" height="10" rx="2" fill="#6FD6FF" />
            <rect x="0" y="24" width="10" height="10" rx="2" fill="#D8FF4A" />
            <rect x="12" y="24" width="10" height="10" rx="2" fill="#FF8A3C" />
            <rect x="24" y="24" width="10" height="10" rx="2" fill="#2D6BFF" />
          </svg>
          <span className="word">dotwall</span>
          <span className="genz-edition-tag">1M GRID</span>
        </div>

        <div className="links" role="navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeTab === item.id ? 'active-nav' : ''}
              onClick={() => {
                setActiveTab(item.id);
                if (item.id === 'profile') setInspectedUsername(null);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="nav-right-cluster">
          <button
            type="button"
            className="nav-icon-btn"
            onClick={() => setShowSearchModal(true)}
            title="Search players, artworks, or tasks"
            aria-label="Search"
          >
            <Search size={15} />
          </button>

          {/* Live Online Player Indicator Chip */}
          <div className="dropdown-anchor">
            <button
              type="button"
              className="chip"
              id="status"
              data-state={connectionState}
              onClick={() => setShowPresenceDropdown((p) => !p)}
              title="Click to view active online players & Firebase config"
            >
              <i className="dot" />
              <span id="statusText">
                {connectionState === 'live'
                  ? `${stats.onlinePlayersCount} online`
                  : 'Connecting'}
              </span>
            </button>

            {showPresenceDropdown && (
              <div className="popover-card">
                <div className="popover-head">
                  <strong>Live Player Presence ({stats.onlinePlayersCount})</strong>
                  <button
                    type="button"
                    className="mini-link-btn"
                    onClick={() => {
                      setShowPresenceDropdown(false);
                      setShowBackendModal(true);
                    }}
                  >
                    <Server size={11} /> Firebase / API
                  </button>
                </div>
                <ul className="feed">
                  {stats.onlinePlayers.map((p) => (
                    <li key={p.userId}>
                      <span
                        className="sq"
                        style={{ backgroundColor: p.avatarColor, borderRadius: '50%' }}
                      />
                      <button
                        type="button"
                        className="inline-user-link"
                        onClick={() => {
                          setShowPresenceDropdown(false);
                          handleInspectPlayer(p.username);
                        }}
                      >
                        {p.avatarEmoji} @{p.username}
                      </button>
                      <span className="at">{p.activeView}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Notifications Bell */}
          <div className="dropdown-anchor">
            <button
              type="button"
              className="nav-icon-btn"
              onClick={() => {
                setShowNotifDropdown((n) => !n);
                setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
              }}
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={15} />
              {unreadNotificationsCount > 0 && (
                <span className="notif-badge">{unreadNotificationsCount}</span>
              )}
            </button>

            {showNotifDropdown && (
              <div className="popover-card">
                <div className="popover-head">
                  <strong>Notifications</strong>
                  <button
                    type="button"
                    className="mini-link-btn"
                    onClick={() => setShowNotifDropdown(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="notif-list">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className="notif-item"
                      onClick={() => {
                        if (n.linkTab) setActiveTab(n.linkTab);
                        setShowNotifDropdown(false);
                      }}
                    >
                      <span className="notif-icon">{n.icon}</span>
                      <div>
                        <strong>{n.title}</strong>
                        <p>{n.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick Light/Dark Toggle */}
          <button
            type="button"
            className="nav-icon-btn"
            onClick={() =>
              setAppearance((prev) => ({
                ...prev,
                mode: isCurrentlyDark ? 'light' : 'dark',
              }))
            }
            title={`Switch to ${isCurrentlyDark ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle theme"
          >
            {isCurrentlyDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Complete Theme & Custom Appearance Studio Button */}
          <button
            type="button"
            className="nav-icon-btn"
            onClick={() => setShowThemeModal(true)}
            title="Custom Theme & Appearance Studio"
            aria-label="Customize appearance"
          >
            <Paintbrush size={15} />
          </button>

          {/* Login / Account Pill */}
          <button
            type="button"
            className="user-nav-pill"
            onClick={() => setShowAuthModal(true)}
            title="Sign In / Switch Account"
          >
            {currentUser ? (
              <>
                <span
                  className="creator-avatar-dot"
                  style={{ backgroundColor: currentUser.avatarColor }}
                >
                  {currentUser.avatarEmoji}
                </span>
                <span className="user-nav-name">@{currentUser.username}</span>
              </>
            ) : (
              <>
                <LogIn size={14} />
                <span>Login</span>
              </>
            )}
          </button>
        </div>
      </nav>

      {/* VIEW 1: HOME DASHBOARD */}
      {activeTab === 'home' && (
        <>
          <header className="hero">
            <div>
              <p className="eyebrow">
                GLOBAL COLLABORATIVE CANVAS · 1000 × 1000 · REAL-TIME MULTIPLAYER
              </p>
              <h1>Draw something together, one pixel at a time.</h1>
              <p className="lede">
                Every player shares one massive 1,000,000-pixel canvas. Place new pixels, replace
                existing ones after a 30s cooldown, or complete 5 random object tasks one by one
                every day.
              </p>
              <div className="cta">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    document.getElementById('wall')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Place on 1000×1000 Wall
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setActiveTab('tasks')}
                >
                  <Sparkles size={15} /> Start 5/5 Daily Objects
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowAuthModal(true)}
                >
                  <LogIn size={15} /> {currentUser ? `@${currentUser.username}` : 'Login / Sign Up'}
                </button>
              </div>
            </div>

            <dl className="strip" aria-label="Live wall numbers">
              <div>
                <dt>Pixels Used / Global Capacity</dt>
                <dd>
                  <span id="sPixels">{formattedPixelsUsed}</span> <small>/ 1,000,000</small>
                </dd>
              </div>
              <div>
                <dt>Pixels Remaining</dt>
                <dd>{stats.pixelsRemaining.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Canvas Completion</dt>
                <dd id="sFilled">
                  {stats.completionPct}% <small>· {stats.activeContributors} artists</small>
                </dd>
              </div>
              <div>
                <dt>Your Next Pixel (30s Rule)</dt>
                <dd id="sNext">
                  {cooldownRemainingMs > 0
                    ? `${(cooldownRemainingMs / 1000).toFixed(1)}s`
                    : 'Ready'}{' '}
                  <small>· {stats.onlinePlayersCount} online</small>
                </dd>
              </div>
            </dl>
          </header>

          {/* Dashboard Bento Row */}
          <section className="three dashboard-bento-row" aria-label="Daily highlights">
            {dailyTask && (
              <div className="card highlight-bento-card">
                <h2>
                  <span>5-Task Daily Object Run</span>
                  <span className="genz-pill daily">1 BY 1 · 5/DAY</span>
                </h2>
                <div className="bento-split">
                  <div className="bento-thumb">
                    <PixelArtworkPreview
                      pixels={dailyTask.referencePixels}
                      gridSize={dailyTask.gridSize}
                      size={84}
                      backgroundColor="#18171F"
                    />
                  </div>
                  <div>
                    <strong className="bento-title">5 Sequential Objects Today</strong>
                    <p className="bento-desc">
                      Finish one random object to unlock the next — complete all 5 for +250 Bonus XP!
                    </p>
                    <button
                      type="button"
                      className="tbtn primary-outline"
                      style={{ marginTop: 8 }}
                      onClick={() => setActiveTab('tasks')}
                    >
                      Start Object 1/5 →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {spotlightArtwork && (
              <div className="card highlight-bento-card">
                <h2>
                  <span>Random Artwork Spotlight</span>
                  <button
                    type="button"
                    className="mini-link-btn"
                    onClick={() => setRandomHomeArtIdx((i) => i + 1)}
                  >
                    <Shuffle size={11} /> Roll Another
                  </button>
                </h2>
                <div className="bento-split">
                  <div
                    className="bento-thumb"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedExploreArtwork(spotlightArtwork);
                      setActiveTab('explore');
                    }}
                  >
                    <PixelArtworkPreview
                      pixels={spotlightArtwork.pixels}
                      gridSize={spotlightArtwork.gridSize}
                      size={84}
                      backgroundColor="#18171F"
                    />
                  </div>
                  <div>
                    <strong className="bento-title">{spotlightArtwork.title}</strong>
                    <p className="bento-desc">
                      by @{spotlightArtwork.creatorUsername} · 💜 {spotlightArtwork.likes.length}{' '}
                      likes
                    </p>
                    <button
                      type="button"
                      className="tbtn"
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        setSelectedExploreArtwork(spotlightArtwork);
                        setActiveTab('explore');
                      }}
                    >
                      Inspect Artwork →
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="card highlight-bento-card">
              <h2>
                <span>Recent Community Activity</span>
                <button
                  type="button"
                  className="mini-link-btn"
                  onClick={() => setActiveTab('community')}
                >
                  Open Lounge →
                </button>
              </h2>
              <ul className="feed">
                {comments
                  .slice(-3)
                  .reverse()
                  .map((c) => (
                    <li key={c.id}>
                      <span className="sq" style={{ backgroundColor: c.avatarColor }} />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <b>@{c.username}:</b> {c.content}
                      </span>
                      <span className="at">chat</span>
                    </li>
                  ))}
              </ul>
            </div>
          </section>

          <main style={{ marginTop: 22 }}>
            <GlobalCanvasWorkspace
              pixelsMap={pixelsMap}
              history={history}
              stats={stats}
              currentUser={currentUser}
              cooldownRemainingMs={cooldownRemainingMs}
              nextCooldownAt={nextCooldownAt}
              onPlacePixel={handlePlacePixel}
              onUndoPixel={handleUndoPixel}
              onInspectPlayer={handleInspectPlayer}
              onVisibleChunksChange={setVisibleChunkIds}
            />
          </main>

          <GlobalInsightsAndGuide
            pixelsMap={pixelsMap}
            history={history}
            users={users}
            stats={stats}
            currentUser={currentUser}
            onInspectPlayer={handleInspectPlayer}
          />
        </>
      )}

      {/* VIEW 2: DEDICATED FULL-STUDIO GLOBAL WALL */}
      {activeTab === 'wall' && (
        <main className="view-section">
          <div className="wall-studio-banner">
            <div>
              <span className="eyebrow">
                GLOBAL CANVAS STUDIO · 1000 × 1000 · EXPANDED &amp; FULLSCREEN WORKSPACE
              </span>
              <h1 className="view-title" style={{ fontSize: 28 }}>
                The 1,000,000-Pixel Shared Wall
              </h1>
            </div>
            <div className="wall-banner-stats">
              <span className="genz-pill">
                Used: <b>{formattedPixelsUsed}</b> / 1,000,000
              </span>
              <span className="genz-pill">
                Remaining: <b>{stats.pixelsRemaining.toLocaleString()}</b>
              </span>
              <span className="genz-pill accent">
                Completion: <b>{stats.completionPct}%</b>
              </span>
            </div>
          </div>

          <GlobalCanvasWorkspace
            pixelsMap={pixelsMap}
            history={history}
            stats={stats}
            currentUser={currentUser}
            cooldownRemainingMs={cooldownRemainingMs}
            nextCooldownAt={nextCooldownAt}
            onPlacePixel={handlePlacePixel}
            onUndoPixel={handleUndoPixel}
            onInspectPlayer={handleInspectPlayer}
            onVisibleChunksChange={setVisibleChunkIds}
          />
        </main>
      )}

      {/* VIEW 3: PIXEL TASKS — 1-BY-1 5-TASK DAILY OBJECT GAUNTLET */}
      {activeTab === 'tasks' && (
        <PixelTasksView
          tasks={tasks}
          submissions={taskSubmissions}
          artworks={artworks}
          achievementsCatalog={achievementsCatalog}
          currentUser={currentUser}
          onSubmitTask={handleSubmitTask}
          onOpenArtwork={(art) => {
            setSelectedExploreArtwork(art);
            setActiveTab('explore');
          }}
        />
      )}

      {/* VIEW 4: EXPLORE */}
      {activeTab === 'explore' && (
        <ExploreView
          artworks={artworks}
          tasks={tasks}
          comments={comments}
          currentUser={currentUser}
          selectedArtwork={selectedExploreArtwork}
          onSelectArtwork={setSelectedExploreArtwork}
          onToggleLike={handleToggleLikeArtwork}
          onPostComment={handlePostComment}
          onReportComment={handleReportComment}
          onInspectPlayer={handleInspectPlayer}
        />
      )}

      {/* VIEW 5: GLOBAL LEADERBOARD */}
      {activeTab === 'leaderboard' && (
        <LeaderboardView
          users={users}
          artworks={artworks}
          achievementsCatalog={achievementsCatalog}
          currentUser={currentUser}
          onInspectPlayer={handleInspectPlayer}
        />
      )}

      {/* VIEW 6: COMMUNITY & COMMENTS */}
      {activeTab === 'community' && (
        <CommunityView
          comments={comments}
          artworks={artworks}
          onlinePlayers={stats.onlinePlayers}
          currentUser={currentUser}
          onPostComment={handlePostComment}
          onReportComment={handleReportComment}
          onToggleLikeArtwork={handleToggleLikeArtwork}
          onOpenArtwork={(art) => {
            setSelectedExploreArtwork(art);
            setActiveTab('explore');
          }}
          onInspectPlayer={handleInspectPlayer}
        />
      )}

      {/* VIEW 7: PLAYER PROFILES */}
      {activeTab === 'profile' && (
        <ProfileView
          currentUser={currentUser}
          inspectedUsername={inspectedUsername}
          users={users}
          artworks={artworks}
          history={history}
          comments={comments}
          achievementsCatalog={achievementsCatalog}
          onClearInspectedUser={() => setInspectedUsername(null)}
          onInspectPlayer={handleInspectPlayer}
          onUpdateProfile={handleUpdateProfile}
          onSwitchAccount={(uName) => handleAuthAction({ mode: 'login', username: uName })}
          onOpenArtwork={(art) => {
            setSelectedExploreArtwork(art);
            setActiveTab('explore');
          }}
        />
      )}

      {/* GLOBAL SEARCH MODAL */}
      {showSearchModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowSearchModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card compact-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Search Dotwall</h2>
              <button
                type="button"
                className="icon-close-btn"
                onClick={() => setShowSearchModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="search-input-wrap" style={{ marginBottom: 14 }}>
              <Search size={15} />
              <input
                type="search"
                placeholder="Search @players, artworks, or tasks..."
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {globalSearchQuery.trim() && (
              <div className="global-search-results">
                {searchResults.players.length > 0 && (
                  <div>
                    <h4 className="search-sec-label">Players</h4>
                    {searchResults.players.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="search-hit-row"
                        onClick={() => {
                          setShowSearchModal(false);
                          handleInspectPlayer(p.username);
                        }}
                      >
                        <span>
                          {p.avatarEmoji} <b>@{p.username}</b> ({p.displayName})
                        </span>
                        <span className="at">{p.pixelsPlaced} px</span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.artworks.length > 0 && (
                  <div>
                    <h4 className="search-sec-label">Artworks</h4>
                    {searchResults.artworks.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="search-hit-row"
                        onClick={() => {
                          setShowSearchModal(false);
                          setSelectedExploreArtwork(a);
                          setActiveTab('explore');
                        }}
                      >
                        <span>
                          🎨 <b>{a.title}</b> by @{a.creatorUsername}
                        </span>
                        <span className="at">💜 {a.likes.length}</span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.tasks.length > 0 && (
                  <div>
                    <h4 className="search-sec-label">Pixel Tasks</h4>
                    {searchResults.tasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="search-hit-row"
                        onClick={() => {
                          setShowSearchModal(false);
                          setActiveTab('tasks');
                        }}
                      >
                        <span>
                          🎯 <b>{t.title}</b> ({t.difficulty})
                        </span>
                        <span className="at">+{t.rewardPoints} XP</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* THEME & CUSTOM APPEARANCE MODAL */}
      <ThemeCustomizerModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
        settings={appearance}
        onChange={setAppearance}
      />

      {/* LOGIN / SIGN UP MODAL */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        currentUser={currentUser}
        users={users}
        isFirebaseActive={true}
        onLogin={handleAuthAction}
        onGoogleLogin={handleGoogleLogin}
        onPasswordReset={handleResetPassword}
        onLogout={handleLogout}
        onOpenCloudConfig={() => setShowBackendModal(true)}
      />

      {/* FIREBASE / SUPABASE CLOUD CONFIGURATION MODAL */}
      <BackendConfigModal
        isOpen={showBackendModal}
        onClose={() => setShowBackendModal(false)}
        connectionMode={connectionMode}
        onlineCount={stats.onlinePlayersCount}
        rtdbStatus={rtdbStatus}
        onConfigSaved={() => {
          setShowBackendModal(false);
          initializeMultiplayer();
        }}
      />

      {/* FOOTER */}
      <footer className="foot">
        <span>
          dotwall · 1000 × 1000 (1,000,000 pixels) · Firebase (`dotwall-13046`) · 5 Daily Objects ·{' '}
          {stats.pixelsUsed.toLocaleString()} pixels placed
        </span>
        <span style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="mini-link-btn"
            onClick={() => setShowThemeModal(true)}
          >
            🎨 Custom Theme Studio
          </button>
          <button
            type="button"
            className="mini-link-btn"
            onClick={() => setShowBackendModal(true)}
          >
            🔥 Firebase (`dotwall-13046`) Connected
          </button>
        </span>
      </footer>
    </div>
  );
}
