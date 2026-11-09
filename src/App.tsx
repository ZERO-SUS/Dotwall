import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Compass,
  Grid,
  Home,
  LogIn,
  MessageSquare,
  Moon,
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
import { getSupabaseClient, getSupabaseConfig } from './lib/supabase';
import {
  createUserWithEmailAndPassword,
  fbUpdateProfile,
  getFirebaseConfig,
  getFirebaseInstances,
  GoogleAuthProvider,
  onDisconnect,
  onValue,
  ref,
  set,
  signInWithEmailAndPassword,
  signInWithPopup,
  update,
} from './lib/firebase';
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

const USER_ID_STORAGE_KEY = 'dotwall_auth_user_id';
const STATIC_DB_STORAGE_KEY = 'dotwall_static_global_db_v2';
const SESSION_ID = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = window.localStorage.getItem('dotwall_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('dotwall_theme', theme);
  }, [theme]);

  // Multiplayer Connection state
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'warn'>('live');
  const [connectionMode, setConnectionMode] = useState<
    'firebase-cloud' | 'supabase-cloud' | 'local-server' | 'static-global'
  >('local-server');
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
      body: 'Permanent Ink Rule: Placed pixels cannot be undone — only modified upon! Clear 5 random objects daily in Pixel Tasks.',
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

  // Recompute GlobalStats dynamically whenever pixelsMap or users change in static/Firebase mode
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

  // Initialize Static Fallback Engine (used on GitHub Pages if local /api is absent and before Firebase keys are entered)
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
    setCurrentUser(me);
    setTasks(INITIAL_TASKS);
    setTaskSubmissions(seed.taskSubmissions || []);
    setArtworks(seed.artworks || []);
    setComments(seed.comments || []);
    setAchievementsCatalog(ACHIEVEMENTS_CATALOG);
    setStats(recomputeStatsFromState(map, usersList, seed.artworks || [], onlinePresence));
    setConnectionMode('static-global');
    setConnectionState('live');
  }, [activeTab, recomputeStatsFromState]);

  // Bootstrap Multiplayer Engine (Firebase -> Local API Server -> Static GitHub Pages Engine)
  const initializeMultiplayer = useCallback(async () => {
    setConnectionState('connecting');
    const fbCfg = getFirebaseConfig();
    const fb = getFirebaseInstances();
    const supaCfg = getSupabaseConfig();
    const supabase = getSupabaseClient();

    // 1. Check if Firebase Realtime Database is configured
    if (fbCfg.isConfigured && fb) {
      setConnectionMode('firebase-cloud');
      setConnectionState('live');
      // Seed initial state locally first, then subscribe to Firebase RTDB
      loadOrInitStaticEngine();
      setConnectionMode('firebase-cloud');

      const pixelsRef = ref(fb.db, 'dotwall/pixels');
      onValue(pixelsRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
          setPixelsMap((prev) => {
            const next = new Map(prev);
            Object.values(val as Record<string, GlobalPixel>).forEach((p) => {
              next.set(`${p.x},${p.y}`, p);
            });
            return next;
          });
        }
      });

      const presenceRef = ref(fb.db, `dotwall/presence/${SESSION_ID}`);
      if (currentUser) {
        set(presenceRef, {
          userId: currentUser.id,
          username: currentUser.username,
          avatarEmoji: currentUser.avatarEmoji,
          avatarColor: currentUser.avatarColor,
          activeView: activeTab,
          lastSeenAt: Date.now(),
        }).catch(() => {});
        onDisconnect(presenceRef).remove().catch(() => {});
      }
      return;
    }

    if (supaCfg.isConfigured && supabase) {
      setConnectionMode('supabase-cloud');
    }

    // 2. Try connecting to Built-in Local Multiplayer API Server (/api/state)
    try {
      const savedUserId = window.localStorage.getItem(USER_ID_STORAGE_KEY);
      const authRes = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: savedUserId || undefined }),
      });

      if (!authRes.ok) {
        throw new Error('Static host detected');
      }

      const authData = await authRes.json();
      let activeUser: PlayerProfile | null = null;
      if (authData.ok && authData.user) {
        activeUser = authData.user;
        window.localStorage.setItem(USER_ID_STORAGE_KEY, authData.user.id);
        if (authData.serverTime) {
          setServerTimeOffsetMs(authData.serverTime - Date.now());
        }
        setCurrentUser(authData.user);
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
        setConnectionMode(supaCfg.isConfigured ? 'supabase-cloud' : 'local-server');
        setConnectionState('live');
        return;
      }
    } catch {
      // Running on GitHub Pages static host without /api server -> use Static Global Engine + BroadcastChannel!
      loadOrInitStaticEngine();
    }
  }, [activeTab, currentUser, loadOrInitStaticEngine]);

  useEffect(() => {
    initializeMultiplayer();
  }, []);

  // Multi-tab BroadcastChannel sync for Static Global Engine on GitHub Pages
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
      }
    };
    return () => bc.close();
  }, []);

  // SSE stream when connected to local server
  useEffect(() => {
    if (!currentUser || connectionMode !== 'local-server') return;

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

  // PLACE OR MODIFY PIXEL (Permanent Ink Rule: No removal/undo)
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

      // If connected to Local Server
      if (connectionMode === 'local-server') {
        try {
          const res = await fetch('/api/pixel/place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, x, y, color }),
          });
          const data = await res.json();
          if (data.serverTime) setServerTimeOffsetMs(data.serverTime - Date.now());
          if (!data.ok) return { ok: false, error: data.error };
          if (data.user) setCurrentUser(data.user);
          if (data.stats) setStats(data.stats);
          return { ok: true };
        } catch {
          // Fall through to client/Firebase engine if fetch fails
        }
      }

      // Static / Firebase Realtime Engine
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
        setStats(recomputeStatsFromState(next, users, artworks));
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

      // Sync to Firebase Realtime Database if active
      const fb = getFirebaseInstances();
      if (fb) {
        set(ref(fb.db, `dotwall/pixels/${x}_${y}`), updatedPixel).catch(() => {});
      }

      return { ok: true };
    },
    [currentUser, connectionMode, pixelsMap, recomputeStatsFromState, users, artworks]
  );

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

      if (connectionMode === 'local-server') {
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
            return { ok: true };
          }
        } catch {
          // Fall through to client/Firebase engine
        }
      }

      const now = Date.now();
      const taskObj = tasks.find((t) => t.id === payload.taskId);
      const reward = (taskObj?.rewardPoints || 60) + (payload.dailyStageIndex === 5 ? 250 : 0);

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

      return { ok: true };
    },
    [currentUser, connectionMode, tasks]
  );

  const handleToggleLikeArtwork = useCallback(
    async (artworkId: string) => {
      if (!currentUser) {
        setShowAuthModal(true);
        return;
      }
      if (connectionMode === 'local-server') {
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
      if (connectionMode === 'local-server') {
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
      return { ok: true };
    },
    [currentUser, connectionMode]
  );

  const handleReportComment = useCallback(
    async (commentId: string, reason: string, hideImmediately = false) => {
      if (connectionMode === 'local-server') {
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
      if (connectionMode === 'local-server') {
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

  // Full Login / Sign Up Handler (Firebase Auth + Local/Global Profile)
  const handleAuthAction = useCallback(
    async (payload: {
      mode: 'login' | 'signup';
      email?: string;
      username: string;
      password?: string;
      avatarEmoji?: string;
      avatarColor?: string;
    }) => {
      const fb = getFirebaseInstances();
      if (fb && payload.email && payload.password && payload.email.includes('@')) {
        try {
          if (payload.mode === 'signup') {
            const cred = await createUserWithEmailAndPassword(
              fb.auth,
              payload.email,
              payload.password
            );
            await fbUpdateProfile(cred.user, { displayName: payload.username });
          } else {
            await signInWithEmailAndPassword(fb.auth, payload.email, payload.password);
          }
        } catch (err: any) {
          return { ok: false, error: err?.message || 'Firebase Auth error' };
        }
      }

      const cleanHandle = payload.username
        .replace(/^@/, '')
        .replace(/[^a-zA-Z0-9_.-]/g, '')
        .slice(0, 24);

      if (connectionMode === 'local-server') {
        try {
          const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: cleanHandle,
              loginByUsername: true,
              avatarEmoji: payload.avatarEmoji,
              avatarColor: payload.avatarColor,
            }),
          });
          const data = await res.json();
          if (data.ok && data.user) {
            window.localStorage.setItem(USER_ID_STORAGE_KEY, data.user.id);
            setCurrentUser(data.user);
            setUsers((prev) =>
              prev.some((u) => u.id === data.user.id) ? prev : [...prev, data.user]
            );
            pushNotification(
              `Signed in as @${data.user.username}`,
              'Your global cooldown and pixel stats are now synced to this account.',
              data.user.avatarEmoji || '👾'
            );
            return { ok: true };
          }
        } catch {
          // fallback
        }
      }

      // Static/Firebase profile lookup or creation
      let found = users.find((u) => u.username.toLowerCase() === cleanHandle.toLowerCase());
      if (!found) {
        found = {
          id: `usr-${Date.now().toString(36)}`,
          username: cleanHandle || `pixel_${Math.floor(100 + Math.random() * 899)}`,
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
    const fb = getFirebaseInstances();
    if (!fb) {
      setShowAuthModal(false);
      setShowBackendModal(true);
      return {
        ok: false,
        error: 'Paste your Firebase Config in the Server Config modal to enable Google 1-Click Login!',
      };
    }
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(fb.auth, provider);
      const uName =
        cred.user.displayName?.replace(/\s+/g, '_').toLowerCase() ||
        cred.user.email?.split('@')[0] ||
        'google_player';
      return await handleAuthAction({
        mode: 'login',
        username: uName,
        email: cred.user.email || undefined,
      });
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Google sign-in cancelled.' };
    }
  }, [handleAuthAction]);

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

          {/* Theme Switcher */}
          <button
            type="button"
            className="nav-icon-btn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
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
                GLOBAL COLLABORATIVE CANVAS · 1000 × 1000 · PERMANENT INK
              </p>
              <h1>Draw something together, one pixel at a time.</h1>
              <p className="lede">
                Every player shares one massive 1,000,000-pixel canvas. Once placed, pixels cannot be
                undone or removed — only modified upon! Plus, complete 5 random object tasks one by
                one every day.
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
                  <LogIn size={15} /> Login / Sign Up
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
              onInspectPlayer={handleInspectPlayer}
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
                GLOBAL CANVAS STUDIO · 1000 × 1000 · PERMANENT PIXELS (MODIFY ONLY)
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
            onInspectPlayer={handleInspectPlayer}
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

      {/* LOGIN / SIGN UP MODAL */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        currentUser={currentUser}
        users={users}
        isFirebaseActive={connectionMode === 'firebase-cloud'}
        onLogin={handleAuthAction}
        onGoogleLogin={handleGoogleLogin}
        onOpenCloudConfig={() => setShowBackendModal(true)}
      />

      {/* FIREBASE / SUPABASE CLOUD CONFIGURATION MODAL */}
      <BackendConfigModal
        isOpen={showBackendModal}
        onClose={() => setShowBackendModal(false)}
        connectionMode={connectionMode}
        onlineCount={stats.onlinePlayersCount}
        onConfigSaved={() => {
          setShowBackendModal(false);
          initializeMultiplayer();
        }}
      />

      {/* FOOTER */}
      <footer className="foot">
        <span>
          dotwall · 1000 × 1000 (1,000,000 pixels) · Permanent Ink (Modify Only) · 5 Daily Objects
          · {stats.pixelsUsed.toLocaleString()} pixels placed
        </span>
        <span>
          <button
            type="button"
            className="mini-link-btn"
            onClick={() => setShowBackendModal(true)}
          >
            {connectionMode === 'firebase-cloud'
              ? '🔥 Firebase Global Realtime Connected'
              : connectionMode === 'supabase-cloud'
                ? '⚡ Supabase Realtime Cloud'
                : '⚡ Connect Firebase / Global Server'}
          </button>
        </span>
      </footer>
    </div>
  );
}
