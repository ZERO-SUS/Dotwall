import React, { useMemo, useState } from 'react';
import {
  Download,
  Eraser,
  Lock,
  Megaphone,
  MessageSquare,
  Paintbrush,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import {
  CommunityArtwork,
  CommunityComment,
  GlobalPixel,
  GlobalStats,
  isDeveloperAdmin,
  isPlatformOwner,
  PixelHistoryEntry,
  PlayerProfile,
} from '../types';
import { AVATAR_COLORS, AVATAR_EMOJIS, DOTWALL_PALETTE } from '../constants';
import { PixelArtworkPreview } from './PixelArtworkPreview';

interface AdminPanelViewProps {
  currentUser: PlayerProfile | null;
  users: PlayerProfile[];
  pixelsMap: Map<string, GlobalPixel>;
  history: PixelHistoryEntry[];
  artworks: CommunityArtwork[];
  comments: CommunityComment[];
  stats: GlobalStats;
  onAdminErasePixels: (coords: { x: number; y: number }[]) => Promise<{ ok: boolean; count?: number }>;
  onAdminBatchPlacePixels: (
    coords: { x: number; y: number }[],
    color: string
  ) => Promise<{ ok: boolean; count?: number }>;
  onAdminDeleteUser: (userIdOrUsername: string, wipeContent: boolean) => Promise<void>;
  onAdminWipeUserPixels: (userIdOrUsername: string) => Promise<number>;
  onAdminUpdateUser: (updatedUser: PlayerProfile) => Promise<void>;
  onAdminPromoteUser: (userId: string, promote: boolean) => Promise<{ ok: boolean; error?: string }>;
  onAdminUpdatePasskey: (newPasskey: string) => Promise<{ ok: boolean; error?: string }>;
  currentAdminPasskey?: string;
  onAdminCreateUser: (newUser: {
    username: string;
    displayName: string;
    avatarEmoji: string;
    avatarColor: string;
    points: number;
  }) => Promise<void>;
  onAdminDeleteArtwork: (artworkId: string) => Promise<void>;
  onAdminDeleteComment: (commentId: string) => Promise<void>;
  onAdminClearCanvas: (mode: 'empty' | 'seed') => Promise<void>;
  onAdminBroadcast: (title: string, message: string) => Promise<void>;
  onInspectPlayer: (username: string) => void;
  onJumpToCanvas: () => void;
}

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  currentUser,
  users,
  pixelsMap,
  history,
  artworks,
  comments,
  stats,
  currentAdminPasskey,
  onAdminErasePixels,
  onAdminBatchPlacePixels,
  onAdminDeleteUser,
  onAdminWipeUserPixels,
  onAdminUpdateUser,
  onAdminPromoteUser,
  onAdminUpdatePasskey,
  onAdminCreateUser,
  onAdminDeleteArtwork,
  onAdminDeleteComment,
  onAdminClearCanvas,
  onAdminBroadcast,
  onInspectPlayer,
  onJumpToCanvas,
}) => {
  const isAdmin = isDeveloperAdmin(currentUser);
  const [subTab, setSubTab] = useState<'users' | 'canvas' | 'content' | 'system'>('users');
  const [userSearch, setUserSearch] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Promote friend input
  const [quickPromoteHandle, setQuickPromoteHandle] = useState<string>('');

  // Passkey change inputs
  const [newPasskeyInput, setNewPasskeyInput] = useState<string>('');
  const [confirmPasskeyInput, setConfirmPasskeyInput] = useState<string>('');

  // Single coordinate moderation
  const [singleX, setSingleX] = useState<string>('500');
  const [singleY, setSingleY] = useState<string>('495');
  const [singleColor, setSingleColor] = useState<string>('#6B3DFF');

  // Rectangular region moderation
  const [rectX1, setRectX1] = useState<string>('495');
  const [rectY1, setRectY1] = useState<string>('490');
  const [rectX2, setRectX2] = useState<string>('505');
  const [rectY2, setRectY2] = useState<string>('500');
  const [rectColor, setRectColor] = useState<string>('#5CF2B2');

  // Wipe by username input
  const [targetWipeUsername, setTargetWipeUsername] = useState<string>('');

  // Create user inputs
  const [newUsername, setNewUsername] = useState<string>('');
  const [newDisplayName, setNewDisplayName] = useState<string>('');
  const [newEmoji, setNewEmoji] = useState<string>('🤖');
  const [newColor, setNewColor] = useState<string>('#5CF2B2');
  const [newPoints, setNewPoints] = useState<string>('500');

  // Broadcast inputs
  const [broadcastTitle, setBroadcastTitle] = useState<string>('👑 Developer Update (@zero_sus)');
  const [broadcastMsg, setBroadcastMsg] = useState<string>('');

  const showToast = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  // Count how many active pixels each user currently owns on the 1000x1000 canvas
  const pixelCountByOwner = useMemo(() => {
    const counts = new Map<string, number>();
    for (const px of pixelsMap.values()) {
      const kId = (px.ownerId || '').toLowerCase();
      const kName = (px.ownerUsername || '').toLowerCase();
      if (kId) counts.set(kId, (counts.get(kId) || 0) + 1);
      if (kName && kName !== kId) counts.set(kName, (counts.get(kName) || 0) + 1);
    }
    return counts;
  }, [pixelsMap]);

  // Also discover users who placed pixels on the canvas or are online even if not in local `users` array
  const allKnownUsers = useMemo(() => {
    const byId = new Map<string, PlayerProfile>();
    for (const u of users) {
      byId.set(u.id, u);
    }
    for (const p of stats.onlinePlayers || []) {
      if (!byId.has(p.userId)) {
        byId.set(p.userId, {
          id: p.userId,
          username: p.username,
          displayName: p.username,
          avatarEmoji: p.avatarEmoji || '👾',
          avatarColor: p.avatarColor || '#6B3DFF',
          bio: 'Online Player',
          pixelsPlaced: pixelCountByOwner.get(p.userId.toLowerCase()) || 0,
          tasksCompleted: 0,
          points: 50,
          lastPixelAt: p.lastSeenAt,
          nextCooldownAt: 0,
          joinedAt: p.lastSeenAt,
          achievements: [],
        });
      }
    }
    for (const px of pixelsMap.values()) {
      if (px.ownerId && !byId.has(px.ownerId)) {
        byId.set(px.ownerId, {
          id: px.ownerId,
          username: px.ownerUsername || px.ownerId,
          displayName: px.ownerUsername || px.ownerId,
          avatarEmoji: '🎨',
          avatarColor: px.color || '#6B3DFF',
          bio: 'Canvas Contributor',
          pixelsPlaced: pixelCountByOwner.get(px.ownerId.toLowerCase()) || 1,
          tasksCompleted: 0,
          points: 50,
          lastPixelAt: px.updatedAt,
          nextCooldownAt: 0,
          joinedAt: px.updatedAt,
          achievements: [],
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => {
      if (isDeveloperAdmin(a) && !isDeveloperAdmin(b)) return -1;
      if (!isDeveloperAdmin(a) && isDeveloperAdmin(b)) return 1;
      return (b.points || 0) - (a.points || 0);
    });
  }, [users, stats.onlinePlayers, pixelsMap, pixelCountByOwner]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return allKnownUsers;
    return allKnownUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
    );
  }, [allKnownUsers, userSearch]);

  const handleEraseRectRegion = async () => {
    const x1 = Math.max(0, Math.min(999, parseInt(rectX1, 10) || 0));
    const y1 = Math.max(0, Math.min(999, parseInt(rectY1, 10) || 0));
    const x2 = Math.max(0, Math.min(999, parseInt(rectX2, 10) || 0));
    const y2 = Math.max(0, Math.min(999, parseInt(rectY2, 10) || 0));

    const minX = Math.min(x1, x2);
    const maxX = Math.min(minX + 60, Math.max(x1, x2));
    const minY = Math.min(y1, y2);
    const maxY = Math.min(minY + 60, Math.max(y1, y2));

    const coords: { x: number; y: number }[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        coords.push({ x, y });
      }
    }
    await onAdminErasePixels(coords);
    showToast(`👑 Erased region (${minX}, ${minY}) → (${maxX}, ${maxY}) (${coords.length} cells)!`);
  };

  const handlePaintRectRegion = async () => {
    const x1 = Math.max(0, Math.min(999, parseInt(rectX1, 10) || 0));
    const y1 = Math.max(0, Math.min(999, parseInt(rectY1, 10) || 0));
    const x2 = Math.max(0, Math.min(999, parseInt(rectX2, 10) || 0));
    const y2 = Math.max(0, Math.min(999, parseInt(rectY2, 10) || 0));

    const minX = Math.min(x1, x2);
    const maxX = Math.min(minX + 40, Math.max(x1, x2));
    const minY = Math.min(y1, y2);
    const maxY = Math.min(minY + 40, Math.max(y1, y2));

    const coords: { x: number; y: number }[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        coords.push({ x, y });
      }
    }
    await onAdminBatchPlacePixels(coords, rectColor);
    showToast(
      `👑 Painted region (${minX}, ${minY}) → (${maxX}, ${maxY}) (${coords.length} px) with ${rectColor}!`
    );
  };

  const handleExportSnapshot = () => {
    const pixelsObj: Record<string, GlobalPixel> = {};
    pixelsMap.forEach((v, k) => {
      pixelsObj[k] = v;
    });
    const payload = {
      exportedBy: 'zero_sus',
      exportedAt: new Date().toISOString(),
      stats,
      users: allKnownUsers,
      pixelsCount: pixelsMap.size,
      pixels: pixelsObj,
      artworks,
      comments,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dotwall-admin-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('👑 Exported full Dotwall JSON database backup!');
  };

  const ADMIN_DEFAULT_PASSKEY = '9945069081SUSzero';
  const effectivePasskey = (currentAdminPasskey || ADMIN_DEFAULT_PASSKEY).trim();
  const [isPasskeyUnlocked, setIsPasskeyUnlocked] = useState<boolean>(() => {
    return window.sessionStorage.getItem('dotwall_admin_passkey_unlocked') === 'true';
  });
  const [passkeyInput, setPasskeyInput] = useState<string>('');
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const [promoteBusyId, setPromoteBusyId] = useState<string | null>(null);
  const [passkeyChangeLoading, setPasskeyChangeLoading] = useState<boolean>(false);

  const handleUnlockPasskey = (e: React.FormEvent) => {
    e.preventDefault();
    if (passkeyInput.trim() === effectivePasskey) {
      window.sessionStorage.setItem('dotwall_admin_passkey_unlocked', 'true');
      setIsPasskeyUnlocked(true);
      setPasskeyError(null);
      showToast('👑 Master Admin Console Unlocked!');
    } else {
      setPasskeyError('Incorrect Master Admin Passkey. Access Denied.');
    }
  };

  const handleLockAdminPanel = () => {
    window.sessionStorage.removeItem('dotwall_admin_passkey_unlocked');
    setIsPasskeyUnlocked(false);
    setPasskeyInput('');
    setPasskeyError(null);
  };

  const handleToggleAdmin = async (targetUser: PlayerProfile, promote: boolean) => {
    if (isPlatformOwner(targetUser)) {
      showToast(`👑 @${targetUser.username} is the permanent platform owner and cannot be modified.`);
      return;
    }
    setPromoteBusyId(targetUser.id);
    try {
      const res = await onAdminPromoteUser(targetUser.id, promote);
      if (res.ok) {
        showToast(
          promote
            ? `👑 Successfully appointed @${targetUser.username} as Co-Administrator! 0s cooldown granted.`
            : `🔻 Revoked administrator privileges for @${targetUser.username}.`
        );
      } else {
        showToast(`❌ Error: ${res.error || 'Failed to update admin role'}`);
      }
    } catch (err: any) {
      showToast(`❌ Error: ${err?.message || 'Operation failed'}`);
    } finally {
      setPromoteBusyId(null);
    }
  };

  const handleQuickPromote = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = quickPromoteHandle.trim().replace(/^@/, '').toLowerCase();
    if (!query) return;
    const target = allKnownUsers.find(
      (u) => u.username.toLowerCase() === query || u.id.toLowerCase() === query
    );
    if (!target) {
      showToast(`❌ Player "@${query}" not found among known players. Make sure they have logged in at least once.`);
      return;
    }
    if (isPlatformOwner(target)) {
      showToast(`👑 @${target.username} is already the permanent platform owner!`);
      return;
    }
    await handleToggleAdmin(target, !target.isAdmin);
    setQuickPromoteHandle('');
  };

  const handleChangePasskeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNew = newPasskeyInput.trim();
    if (cleanNew.length < 6) {
      showToast('❌ Admin passkey must be at least 6 characters long.');
      return;
    }
    if (cleanNew !== confirmPasskeyInput.trim()) {
      showToast('❌ New passkeys do not match. Please re-enter.');
      return;
    }
    setPasskeyChangeLoading(true);
    try {
      const res = await onAdminUpdatePasskey(cleanNew);
      if (res.ok) {
        showToast('👑 Master Admin Passkey updated and secured across all sessions!');
        setNewPasskeyInput('');
        setConfirmPasskeyInput('');
      } else {
        showToast(`❌ Error updating passkey: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      showToast(`❌ Error: ${err?.message || 'Failed to update passkey'}`);
    } finally {
      setPasskeyChangeLoading(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  if (!isPasskeyUnlocked) {
    return (
      <main className="view-section" aria-label="Developer Admin Passkey Challenge">
        <div
          className="card compact-modal"
          style={{ maxWidth: 440, margin: '60px auto', border: '2px solid var(--accent)' }}
        >
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <span className="genz-pill daily">👑 DEVELOPER GOD-MODE GATE</span>
            <h2 style={{ marginTop: 8, marginBottom: 4 }}>Admin Passkey Required</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              Session authenticated as <b>@{currentUser.username}</b>. Enter the master administrator passkey to unlock god-mode moderation controls.
            </p>
          </div>

          <form onSubmit={handleUnlockPasskey}>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Master Admin Passkey</label>
              <input
                type="password"
                className="text-input"
                placeholder="Enter admin passkey..."
                value={passkeyInput}
                onChange={(e) => {
                  setPasskeyInput(e.target.value);
                  setPasskeyError(null);
                }}
                autoFocus
                required
              />
            </div>

            {passkeyError && (
              <p className="msg" data-kind="error" style={{ marginBottom: 12 }}>
                {passkeyError}
              </p>
            )}

            <button type="submit" className="go" style={{ width: '100%', justifyContent: 'center' }}>
              <ShieldCheck size={15} /> Unlock Admin Command Center
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="view-section" aria-label="Developer and Admin Control Center">
      {/* Top Developer Identity Header */}
      <div
        className="card"
        style={{
          marginBottom: 20,
          border: '2px solid var(--accent)',
          background: 'linear-gradient(135deg, var(--accent-soft), var(--panel))',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div>
            <span className="genz-pill daily">👑 DEVELOPER &amp; ADMIN CONSOLE · GOD-MODE</span>
            <h1 className="view-title" style={{ marginTop: 6, marginBottom: 4 }}>
              @zero_sus Control Panel
            </h1>
            <p className="view-subtitle" style={{ margin: 0 }}>
              Full authority to delete users, erase any pixel or region, moderate artworks &amp;
              comments, and draw with 0s cooldown across all connected devices in real time.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              className="genz-pill accent"
              style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700 }}
            >
              ✅ Active Admin Session: @{currentUser?.username} (UID: {currentUser?.id})
            </span>
            <button type="button" className="btn" onClick={onJumpToCanvas}>
              <Paintbrush size={15} /> Open Canvas with Erase Tool
            </button>
            <button
              type="button"
              className="btn"
              style={{ borderColor: 'rgba(235, 87, 87, 0.4)', color: '#FF6B6B' }}
              onClick={handleLockAdminPanel}
              title="Lock Admin Control Center"
            >
              <Lock size={15} /> Lock Console
            </button>
          </div>
        </div>

        {/* Live Telemetry Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid var(--line)',
          }}
        >
          <div>
            <small style={{ color: 'var(--muted)', display: 'block' }}>Known Players</small>
            <strong style={{ fontSize: 20 }}>{allKnownUsers.length}</strong>
          </div>
          <div>
            <small style={{ color: 'var(--muted)', display: 'block' }}>Online Now</small>
            <strong style={{ fontSize: 20, color: 'var(--good)' }}>
              {stats.onlinePlayersCount} live
            </strong>
          </div>
          <div>
            <small style={{ color: 'var(--muted)', display: 'block' }}>Canvas Pixels</small>
            <strong style={{ fontSize: 20 }}>{pixelsMap.size.toLocaleString()} / 1M</strong>
          </div>
          <div>
            <small style={{ color: 'var(--muted)', display: 'block' }}>Published Artworks</small>
            <strong style={{ fontSize: 20 }}>{artworks.length}</strong>
          </div>
          <div>
            <small style={{ color: 'var(--muted)', display: 'block' }}>Community Comments</small>
            <strong style={{ fontSize: 20 }}>{comments.length}</strong>
          </div>
          <div>
            <small style={{ color: 'var(--muted)', display: 'block' }}>Admin Cooldown</small>
            <strong style={{ fontSize: 20, color: 'var(--accent)' }}>0.0s (Instant)</strong>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderLeft: '4px solid var(--good)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <strong>{feedback}</strong>
          <button type="button" className="mini-link-btn" onClick={() => setFeedback(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="seg" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          aria-pressed={subTab === 'users'}
          onClick={() => setSubTab('users')}
        >
          <Users size={14} /> Users &amp; Ban/Delete ({allKnownUsers.length})
        </button>
        <button
          type="button"
          aria-pressed={subTab === 'canvas'}
          onClick={() => setSubTab('canvas')}
        >
          <Eraser size={14} /> Erase Pixels &amp; Canvas Moderation ({pixelsMap.size})
        </button>
        <button
          type="button"
          aria-pressed={subTab === 'content'}
          onClick={() => setSubTab('content')}
        >
          <MessageSquare size={14} /> Artworks ({artworks.length}) &amp; Chat ({comments.length})
        </button>
        <button
          type="button"
          aria-pressed={subTab === 'system'}
          onClick={() => setSubTab('system')}
        >
          <Megaphone size={14} /> Global Broadcast &amp; Database Backup
        </button>
      </div>

      {/* TAB 1: USER MANAGEMENT */}
      {subTab === 'users' && (
        <div className="two-col-layout">
          <div className="card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 14,
                flexWrap: 'wrap',
              }}
            >
              <h2 style={{ margin: 0 }}>All Players ({filteredUsers.length})</h2>
              <div className="search-input-wrap" style={{ minWidth: 240 }}>
                <Search size={14} />
                <input
                  type="search"
                  placeholder="Search @username or UID..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredUsers.map((u) => {
                const isOwner = isPlatformOwner(u);
                const isUserAdmin = isDeveloperAdmin(u) || u.isAdmin === true;
                const isOnline = stats.onlinePlayers.some(
                  (p) => p.userId === u.id || p.username.toLowerCase() === u.username.toLowerCase()
                );
                const liveCanvasPixels =
                  pixelCountByOwner.get(u.id.toLowerCase()) ||
                  pixelCountByOwner.get(u.username.toLowerCase()) ||
                  0;

                return (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 12,
                      border: isOwner
                        ? '2px solid #FFD700'
                        : isUserAdmin
                        ? '1.5px solid var(--accent)'
                        : '1px solid var(--line)',
                      background: 'var(--bg)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        className="creator-avatar-dot"
                        style={{
                          backgroundColor: u.avatarColor || '#6B3DFF',
                          width: 36,
                          height: 36,
                          fontSize: 18,
                        }}
                      >
                        {u.avatarEmoji || '👾'}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="inline-user-link"
                            style={{ fontWeight: 700, fontSize: 14 }}
                            onClick={() => onInspectPlayer(u.username)}
                          >
                            @{u.username}
                          </button>
                          {isOwner && (
                            <span className="genz-pill daily" style={{ fontSize: 10, background: 'rgba(255, 215, 0, 0.2)', color: '#FFD700' }}>
                              👑 PLATFORM OWNER
                            </span>
                          )}
                          {!isOwner && isUserAdmin && (
                            <span
                              className="genz-pill accent"
                              style={{
                                fontSize: 10,
                                background: 'rgba(107, 61, 255, 0.2)',
                                color: 'var(--accent)',
                              }}
                            >
                              👑 CO-ADMIN
                            </span>
                          )}
                          {isOnline && (
                            <span
                              className="genz-pill"
                              style={{
                                fontSize: 10,
                                background: 'rgba(14, 159, 104, 0.15)',
                                color: 'var(--good)',
                              }}
                            >
                              ● ONLINE
                            </span>
                          )}
                        </div>
                        <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>
                          UID: <code>{u.id}</code> · <b>{u.points || 0} XP</b> ·{' '}
                          <b>{liveCanvasPixels}</b> active wall px · {u.tasksCompleted || 0} tasks
                        </small>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {/* Appoint / Revoke Co-Admin button */}
                      {!isOwner && (
                        <button
                          type="button"
                          className="tbtn"
                          disabled={promoteBusyId === u.id}
                          style={{
                            borderColor: isUserAdmin ? 'rgba(255, 184, 0, 0.4)' : 'var(--accent)',
                            color: isUserAdmin ? '#FFB800' : 'var(--accent)',
                            background: isUserAdmin ? 'rgba(255, 184, 0, 0.08)' : 'rgba(107, 61, 255, 0.08)',
                            fontWeight: 600,
                          }}
                          title={
                            isUserAdmin
                              ? 'Revoke administrator rights for this user'
                              : 'Appoint user as Co-Administrator (grants 0s cooldown & Admin Panel)'
                          }
                          onClick={() => handleToggleAdmin(u, !isUserAdmin)}
                        >
                          <ShieldCheck size={12} />
                          {promoteBusyId === u.id
                            ? ' Updating...'
                            : isUserAdmin
                            ? ' Revoke Admin'
                            : ' Make Co-Admin'}
                        </button>
                      )}

                      <button
                        type="button"
                        className="tbtn"
                        title="Add +500 XP to this user"
                        onClick={async () => {
                          await onAdminUpdateUser({
                            ...u,
                            points: (u.points || 0) + 500,
                          });
                          showToast(`👑 Added +500 XP to @${u.username}!`);
                        }}
                      >
                        <Zap size={12} /> +500 XP
                      </button>

                      <button
                        type="button"
                        className="tbtn"
                        title="Erase all pixels placed by this user on the 1000×1000 wall"
                        onClick={async () => {
                          const removed = await onAdminWipeUserPixels(u.id || u.username);
                          showToast(
                            `👑 Erased ${removed} pixels owned by @${u.username} from the global wall!`
                          );
                        }}
                      >
                        <Eraser size={12} /> Wipe Pixels ({liveCanvasPixels})
                      </button>

                      {!isOwner && (
                        <>
                          <button
                            type="button"
                            className="tbtn"
                            style={{ color: '#E53935' }}
                            title="Delete user account only (keep their canvas pixels)"
                            onClick={async () => {
                              await onAdminDeleteUser(u.id || u.username, false);
                              showToast(`👑 Deleted user @${u.username}!`);
                            }}
                          >
                            <Trash2 size={12} /> Delete User
                          </button>

                          <button
                            type="button"
                            className="tbtn"
                            style={{
                              background: 'rgba(229, 57, 53, 0.12)',
                              color: '#E53935',
                              borderColor: 'rgba(229, 57, 53, 0.35)',
                            }}
                            title="Delete user AND erase all their pixels, artworks, and comments"
                            onClick={async () => {
                              await onAdminDeleteUser(u.id || u.username, true);
                              showToast(
                                `👑 Deleted @${u.username} & wiped all their pixels, artworks, and comments!`
                              );
                            }}
                          >
                            <ShieldAlert size={12} /> Delete + Wipe All
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Appoint Co-Admin Friend & Create / Spawn Custom User */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'start' }}>
            {/* Quick Appoint Friend as Co-Admin */}
            <div
              className="card"
              style={{
                border: '1.5px solid var(--accent)',
                background: 'linear-gradient(135deg, rgba(107, 61, 255, 0.08), var(--panel))',
              }}
            >
              <h2>
                <span>👑 Appoint Co-Administrator</span>
                <span className="pick">Friend Privileges</span>
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, margin: '4px 0 12px' }}>
                Appoint your friend as a <b>Co-Administrator</b>. They will immediately receive <b>0.0s instant cooldown</b>, Erase &amp; Multi-brush tools, and full access to this Admin Command Center.
              </p>
              <form onSubmit={handleQuickPromote}>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Friend&apos;s @Username or UID</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="e.g. cyber_artist or UID"
                    value={quickPromoteHandle}
                    onChange={(e) => setQuickPromoteHandle(e.target.value)}
                    required
                  />
                  <small style={{ color: 'var(--muted)', fontSize: 11, display: 'block', marginTop: 4 }}>
                    Your friend must have signed in with email or Google at least once so their profile is registered in the database.
                  </small>
                </div>
                <button
                  type="submit"
                  className="go"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={promoteBusyId !== null}
                >
                  <ShieldCheck size={14} /> Promote Friend to Co-Admin
                </button>
              </form>
            </div>

            {/* Create / Spawn Player */}
            <div className="card">
            <h2>
              <span>Create / Spawn Player</span>
              <span className="pick">Admin Tool</span>
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newUsername.trim()) return;
                await onAdminCreateUser({
                  username: newUsername.trim().replace(/^@/, ''),
                  displayName: newDisplayName.trim() || newUsername.trim(),
                  avatarEmoji: newEmoji,
                  avatarColor: newColor,
                  points: parseInt(newPoints, 10) || 500,
                });
                showToast(`👑 Created user @${newUsername.trim().replace(/^@/, '')}!`);
                setNewUsername('');
                setNewDisplayName('');
              }}
            >
              <div className="form-group">
                <label className="form-label">@Username</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="e.g. cyber_ninja"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="Cyber Ninja"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Starting XP Points</label>
                <input
                  type="number"
                  className="text-input"
                  value={newPoints}
                  onChange={(e) => setNewPoints(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Avatar Emoji</label>
                <div className="emoji-picker-grid">
                  {AVATAR_EMOJIS.slice(0, 8).map((em) => (
                    <button
                      key={em}
                      type="button"
                      className={`emoji-btn ${newEmoji === em ? 'active' : ''}`}
                      onClick={() => setNewEmoji(em)}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Avatar Color</label>
                <div className="swatches">
                  {AVATAR_COLORS.slice(0, 8).map((col) => (
                    <button
                      key={col}
                      type="button"
                      className="sw"
                      style={{ backgroundColor: col }}
                      aria-pressed={newColor === col}
                      onClick={() => setNewColor(col)}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" className="go">
                <UserPlus size={14} /> Spawn Player Account
              </button>
            </form>
          </div>
        </div>
      </div>
      )}

      {/* TAB 2: CANVAS & PIXEL MODERATION */}
      {subTab === 'canvas' && (
        <div className="two-col-layout">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Single Pixel Erase / Paint */}
            <div className="card">
              <h2>
                <span>Erase or Paint Single Pixel Coordinate</span>
                <span className="pick">0–999</span>
              </h2>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 90 }}>
                  <label className="form-label">X (0–999)</label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    className="text-input"
                    value={singleX}
                    onChange={(e) => setSingleX(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 90 }}>
                  <label className="form-label">Y (0–999)</label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    className="text-input"
                    value={singleY}
                    onChange={(e) => setSingleY(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Color</label>
                  <input
                    type="color"
                    className="native-color-input"
                    value={singleColor}
                    onChange={(e) => setSingleColor(e.target.value.toUpperCase())}
                  />
                </div>
                <button
                  type="button"
                  className="btn"
                  style={{ color: '#E53935' }}
                  onClick={async () => {
                    const x = Math.max(0, Math.min(999, parseInt(singleX, 10) || 0));
                    const y = Math.max(0, Math.min(999, parseInt(singleY, 10) || 0));
                    await onAdminErasePixels([{ x, y }]);
                    showToast(`👑 Erased pixel at (${x}, ${y})!`);
                  }}
                >
                  <Trash2 size={14} /> Erase ({singleX}, {singleY})
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={async () => {
                    const x = Math.max(0, Math.min(999, parseInt(singleX, 10) || 0));
                    const y = Math.max(0, Math.min(999, parseInt(singleY, 10) || 0));
                    await onAdminBatchPlacePixels([{ x, y }], singleColor);
                    showToast(`👑 Painted (${x}, ${y}) with ${singleColor}!`);
                  }}
                >
                  <Sparkles size={14} /> Paint ({singleX}, {singleY})
                </button>
              </div>
            </div>

            {/* Area / Rectangular Sector Erase or Fill */}
            <div className="card">
              <h2>
                <span>Erase or Fill Rectangular Region</span>
                <span className="pick">Bulk Sector Tool</span>
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <div>
                  <label className="form-label">Start X1</label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    className="text-input"
                    value={rectX1}
                    onChange={(e) => setRectX1(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Start Y1</label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    className="text-input"
                    value={rectY1}
                    onChange={(e) => setRectY1(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">End X2</label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    className="text-input"
                    value={rectX2}
                    onChange={(e) => setRectX2(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">End Y2</label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    className="text-input"
                    value={rectY2}
                    onChange={(e) => setRectY2(e.target.value)}
                  />
                </div>
              </div>

              <div className="swatches" style={{ marginBottom: 12 }}>
                {DOTWALL_PALETTE.map((sw) => (
                  <button
                    key={sw.hex}
                    type="button"
                    className="sw"
                    style={{ backgroundColor: sw.hex }}
                    aria-pressed={rectColor.toUpperCase() === sw.hex.toUpperCase()}
                    onClick={() => setRectColor(sw.hex)}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ color: '#E53935', flex: 1, justifyContent: 'center' }}
                  onClick={handleEraseRectRegion}
                >
                  <Eraser size={14} /> 🗑️ Erase Region ({rectX1},{rectY1}) → ({rectX2},{rectY2})
                </button>
                <button
                  type="button"
                  className="btn primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handlePaintRectRegion}
                >
                  <Paintbrush size={14} /> 🎨 Fill Region with {rectColor}
                </button>
              </div>
            </div>

            {/* Wipe All Pixels by Username + Global Reset */}
            <div className="card">
              <h2>
                <span>Wipe Pixels by @Username or Global Reset</span>
                <span className="pick">Global Wall</span>
              </h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  type="text"
                  className="text-input"
                  placeholder="Enter @username or UID to erase all their pixels..."
                  value={targetWipeUsername}
                  onChange={(e) => setTargetWipeUsername(e.target.value)}
                />
                <button
                  type="button"
                  className="btn"
                  style={{ color: '#E53935', whiteSpace: 'nowrap' }}
                  onClick={async () => {
                    if (!targetWipeUsername.trim()) return;
                    const count = await onAdminWipeUserPixels(
                      targetWipeUsername.trim().replace(/^@/, '')
                    );
                    showToast(`👑 Erased ${count} pixels owned by @${targetWipeUsername.trim()}!`);
                    setTargetWipeUsername('');
                  }}
                >
                  <Trash2 size={14} /> Wipe User&apos;s Pixels
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  paddingTop: 12,
                  borderTop: '1px solid var(--line)',
                }}
              >
                <button
                  type="button"
                  className="tbtn"
                  onClick={async () => {
                    await onAdminClearCanvas('seed');
                    showToast('👑 Restored default seed sprites on the 1000×1000 canvas!');
                  }}
                >
                  <RefreshCw size={13} /> Restore Default Seed Canvas
                </button>
                <button
                  type="button"
                  className="tbtn"
                  style={{ color: '#E53935' }}
                  onClick={async () => {
                    await onAdminClearCanvas('empty');
                    showToast('👑 Wiped entire 1000×1000 canvas clean (0 pixels)!');
                  }}
                >
                  <Trash2 size={13} /> 🧨 Wipe Entire 1000×1000 Canvas Clean
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Recent Pixel Placements with 1-Click Erase */}
          <div className="card">
            <h2>
              <span>Live Pixel Feed (1-Click Erase)</span>
              <span className="pick">{history.length} recent</span>
            </h2>
            <ul className="feed" style={{ maxHeight: 540, overflowY: 'auto' }}>
              {history
                .slice(-40)
                .reverse()
                .map((h) => {
                  const stillExists = pixelsMap.has(`${h.x},${h.y}`);
                  return (
                    <li key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        className="sq"
                        style={{ backgroundColor: h.newColor || '#ECEAF3' }}
                      />
                      <span style={{ flex: 1 }}>
                        <b>@{h.username}</b> ({h.x}, {h.y}) · {h.newColor}
                      </span>
                      {stillExists ? (
                        <button
                          type="button"
                          className="tbtn"
                          style={{ color: '#E53935', padding: '3px 8px', fontSize: 11 }}
                          onClick={async () => {
                            await onAdminErasePixels([{ x: h.x, y: h.y }]);
                            showToast(`👑 Erased pixel at (${h.x}, ${h.y})!`);
                          }}
                        >
                          <Trash2 size={11} /> Erase
                        </button>
                      ) : (
                        <span className="at">Erased</span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        </div>
      )}

      {/* TAB 3: ARTWORKS & COMMUNITY CHAT MODERATION */}
      {subTab === 'content' && (
        <div className="two-col-layout">
          {/* Artworks Moderation */}
          <div className="card">
            <h2>
              <span>Moderate Community Artworks ({artworks.length})</span>
              <span className="pick">Explore Gallery</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {artworks.map((art) => (
                <div
                  key={art.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: 10,
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <PixelArtworkPreview
                      pixels={art.pixels}
                      gridSize={art.gridSize}
                      size={48}
                      backgroundColor="#18171F"
                    />
                    <div>
                      <strong>{art.title}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>
                        by @{art.creatorUsername} · {art.category} · 💜 {art.likes.length} likes
                      </small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="tbtn"
                    style={{ color: '#E53935' }}
                    onClick={async () => {
                      await onAdminDeleteArtwork(art.id);
                      showToast(`👑 Deleted artwork "${art.title}"!`);
                    }}
                  >
                    <Trash2 size={13} /> Delete Artwork
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Comments Moderation */}
          <div className="card">
            <h2>
              <span>Moderate Community Chat ({comments.length})</span>
              <span className="pick">Comments</span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {comments
                .slice()
                .reverse()
                .map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: 10,
                      borderRadius: 10,
                      border: c.reported ? '1px solid #E53935' : '1px solid var(--line)',
                    }}
                  >
                    <div>
                      <strong>
                        {c.avatarEmoji} @{c.username}
                      </strong>
                      {c.reported && (
                        <span
                          className="genz-pill"
                          style={{ marginLeft: 6, color: '#E53935', fontSize: 10 }}
                        >
                          REPORTED
                        </span>
                      )}
                      <p style={{ margin: '4px 0 0', fontSize: 13 }}>{c.content}</p>
                    </div>
                    <button
                      type="button"
                      className="tbtn"
                      style={{ color: '#E53935', whiteSpace: 'nowrap' }}
                      onClick={async () => {
                        await onAdminDeleteComment(c.id);
                        showToast(`👑 Deleted comment by @${c.username}!`);
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GLOBAL BROADCAST & SYSTEM BACKUP */}
      {subTab === 'system' && (
        <div className="two-col-layout">
          <div className="card">
            <h2>
              <span>Broadcast Global Announcement</span>
              <span className="pick">Live Push to All Players</span>
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!broadcastMsg.trim()) return;
                await onAdminBroadcast(
                  broadcastTitle.trim() || '👑 Admin Announcement (@zero_sus)',
                  broadcastMsg.trim()
                );
                showToast('👑 Broadcast sent live to all connected players worldwide!');
                setBroadcastMsg('');
              }}
            >
              <div className="form-group">
                <label className="form-label">Announcement Title</label>
                <input
                  type="text"
                  className="text-input"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Message Content</label>
                <textarea
                  className="text-input"
                  rows={4}
                  placeholder="e.g. Welcome to today's community event at Sector (500, 500)!"
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="go">
                <Megaphone size={15} /> Broadcast Live to All Screens
              </button>
            </form>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Master Admin Passkey Security Gate */}
            <div
              className="card"
              style={{
                border: '1.5px solid var(--accent)',
                background: 'linear-gradient(135deg, rgba(107, 61, 255, 0.08), var(--panel))',
              }}
            >
              <h2>
                <span>🔐 Master Admin Passkey</span>
                <span className="pick">Security Gate</span>
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, margin: '4px 0 12px' }}>
                Change the master passkey required to unlock this Developer &amp; Admin Command Center. This passkey is stored securely in Firebase Realtime Database at <code>system/adminPasskey</code> and synchronizes across all sessions.
              </p>

              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  marginBottom: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Active Console Passkey:</span>
                <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                  {effectivePasskey.slice(0, 4)}•••••••• ({effectivePasskey.length} chars)
                </code>
              </div>

              <form onSubmit={handleChangePasskeySubmit}>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">New Admin Passkey (min 6 chars)</label>
                  <input
                    type="password"
                    className="text-input"
                    placeholder="Enter new admin passkey..."
                    value={newPasskeyInput}
                    onChange={(e) => setNewPasskeyInput(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">Confirm New Passkey</label>
                  <input
                    type="password"
                    className="text-input"
                    placeholder="Re-enter new admin passkey..."
                    value={confirmPasskeyInput}
                    onChange={(e) => setConfirmPasskeyInput(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="go"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={passkeyChangeLoading}
                >
                  <Lock size={14} /> {passkeyChangeLoading ? 'Saving to Firebase...' : 'Update Admin Passkey'}
                </button>
              </form>
            </div>

            <div className="card">
              <h2>
                <span>Database Snapshot &amp; Admin Privileges</span>
                <span className="pick">UID: zero_sus</span>
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
                As <b>@zero_sus</b>, your account is permanently whitelisted as the Lead Developer &amp;
                Administrator across the client, global real-time WebSocket relay, local server, and
                Firebase security rules.
              </p>
              <ul className="feed" style={{ marginBottom: 16 }}>
                <li>
                  <span>✅</span>
                  <span>
                    <b>0s Cooldown Bypass:</b> Place or replace pixels continuously with zero wait.
                  </span>
                </li>
                <li>
                  <span>✅</span>
                  <span>
                    <b>Canvas Erase &amp; Multi-Brush:</b> Use 1×1, 3×3, 5×5, or 10×10 brush to erase or
                    paint.
                  </span>
                </li>
                <li>
                  <span>✅</span>
                  <span>
                    <b>Real-Time User &amp; Content Deletion:</b> Syncs across every connected browser
                    in &lt;200ms.
                  </span>
                </li>
              </ul>
              <button type="button" className="btn primary" onClick={handleExportSnapshot}>
                <Download size={15} /> Export Full Database JSON Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
