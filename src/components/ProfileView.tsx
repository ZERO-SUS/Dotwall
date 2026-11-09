import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  Download,
  Edit3,
  Grid,
  Heart,
  LogIn,
  MessageSquare,
  Sparkles,
  Trophy,
  UserCheck,
} from 'lucide-react';
import type {
  AchievementItem,
  CommunityArtwork,
  CommunityComment,
  PixelHistoryEntry,
  PlayerProfile,
} from '../types';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants';
import { PixelArtworkPreview } from './PixelArtworkPreview';
import { exportSpritePng } from '../utils/exportPng';

interface ProfileViewProps {
  currentUser: PlayerProfile | null;
  inspectedUsername: string | null;
  users: PlayerProfile[];
  artworks: CommunityArtwork[];
  history: PixelHistoryEntry[];
  comments: CommunityComment[];
  achievementsCatalog: AchievementItem[];
  onClearInspectedUser: () => void;
  onInspectPlayer: (username: string) => void;
  onUpdateProfile: (payload: {
    username: string;
    displayName: string;
    bio: string;
    avatarEmoji: string;
    avatarColor: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onSwitchAccount: (username: string) => Promise<{ ok: boolean; error?: string }>;
  onOpenArtwork: (art: CommunityArtwork) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  inspectedUsername,
  users,
  artworks,
  history,
  comments,
  achievementsCatalog,
  onClearInspectedUser,
  onInspectPlayer,
  onUpdateProfile,
  onSwitchAccount,
  onOpenArtwork,
}) => {
  // Determine which profile we are viewing
  const profileUser = useMemo(() => {
    if (inspectedUsername) {
      const found = users.find(
        (u) => u.username.toLowerCase() === inspectedUsername.toLowerCase()
      );
      if (found) return found;
    }
    return currentUser;
  }, [inspectedUsername, users, currentUser]);

  const isOwnProfile = Boolean(
    currentUser && profileUser && currentUser.id === profileUser.id
  );

  // Compute global rank
  const globalRank = useMemo(() => {
    if (!profileUser) return 1;
    const sorted = [...users].sort(
      (a, b) => b.points - a.points || b.pixelsPlaced - a.pixelsPlaced
    );
    const idx = sorted.findIndex((u) => u.id === profileUser.id);
    return idx >= 0 ? idx + 1 : sorted.length;
  }, [users, profileUser]);

  // Edit profile state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editUsername, setEditUsername] = useState<string>('');
  const [editDisplayName, setEditDisplayName] = useState<string>('');
  const [editBio, setEditBio] = useState<string>('');
  const [editEmoji, setEditEmoji] = useState<string>('👾');
  const [editColor, setEditColor] = useState<string>('#6B3DFF');
  const [saveFeedback, setSaveFeedback] = useState<{ text: string; isError: boolean } | null>(
    null
  );

  // Switch / Sign-in modal state
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [loginUsernameInput, setLoginUsernameInput] = useState<string>('');

  useEffect(() => {
    if (profileUser && isOwnProfile) {
      setEditUsername(profileUser.username);
      setEditDisplayName(profileUser.displayName);
      setEditBio(profileUser.bio);
      setEditEmoji(profileUser.avatarEmoji);
      setEditColor(profileUser.avatarColor);
    }
  }, [profileUser, isOwnProfile]);

  const userArtworks = useMemo(() => {
    if (!profileUser) return [];
    return artworks.filter((a) => a.creatorId === profileUser.id);
  }, [artworks, profileUser]);

  const userHistory = useMemo(() => {
    if (!profileUser) return [];
    return history
      .filter((h) => h.userId === profileUser.id)
      .slice(-12)
      .reverse();
  }, [history, profileUser]);

  const userComments = useMemo(() => {
    if (!profileUser) return [];
    return comments
      .filter((c) => c.userId === profileUser.id && !c.hidden)
      .slice(-8)
      .reverse();
  }, [comments, profileUser]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveFeedback(null);
    const res = await onUpdateProfile({
      username: editUsername,
      displayName: editDisplayName,
      bio: editBio,
      avatarEmoji: editEmoji,
      avatarColor: editColor,
    });
    if (res.ok) {
      setIsEditing(false);
      setSaveFeedback({ text: 'Profile updated!', isError: false });
      setTimeout(() => setSaveFeedback(null), 3000);
    } else {
      setSaveFeedback({ text: res.error || 'Could not update profile.', isError: true });
    }
  };

  if (!profileUser) {
    return (
      <div className="view-section">
        <div className="card">
          <p className="empty-line">Loading player profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-section">
      {/* Top Banner when inspecting another player */}
      {!isOwnProfile && (
        <div className="inspecting-banner">
          <span>
            Viewing public profile of <b>@{profileUser.username}</b>
          </span>
          <button
            type="button"
            className="tbtn"
            onClick={onClearInspectedUser}
          >
            Back to My Personal Dashboard
          </button>
        </div>
      )}

      {/* Main Profile Hero Card */}
      <div className="card profile-hero-card">
        <div className="profile-identity">
          <div
            className="profile-big-avatar"
            style={{ backgroundColor: profileUser.avatarColor }}
          >
            {profileUser.avatarEmoji}
          </div>
          <div>
            <div className="profile-badges-top">
              <span className="genz-pill accent">GLOBAL RANK #{globalRank}</span>
              <span className="genz-pill">
                Joined {new Date(profileUser.joinedAt).toLocaleDateString()}
              </span>
            </div>
            <h1 className="profile-display-name">{profileUser.displayName}</h1>
            <div className="profile-handle">@{profileUser.username}</div>
            <p className="profile-bio">{profileUser.bio}</p>
          </div>
        </div>

        {isOwnProfile && (
          <div className="profile-hero-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => setIsEditing((e) => !e)}
            >
              <Edit3 size={15} /> {isEditing ? 'Close Editor' : 'Edit Profile'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setShowAuthModal(true)}
            >
              <LogIn size={15} /> Switch / Sign In
            </button>
          </div>
        )}
      </div>

      {saveFeedback && (
        <p
          className="msg"
          data-kind={saveFeedback.isError ? 'error' : undefined}
          style={{ color: saveFeedback.isError ? undefined : 'var(--good)', marginBottom: 14 }}
        >
          {saveFeedback.text}
        </p>
      )}

      {/* Inline Profile Editor */}
      {isOwnProfile && isEditing && (
        <form className="card profile-edit-card" onSubmit={handleSaveProfile}>
          <h2>
            <span>Customize Your Dotwall Identity</span>
            <span className="pick">Synced to Multiplayer Server</span>
          </h2>
          <div className="two">
            <div className="form-group">
              <label className="form-label">Username (@handle)</label>
              <input
                type="text"
                className="text-input"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                maxLength={24}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                className="text-input"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                maxLength={32}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Bio / Status</label>
            <input
              type="text"
              className="text-input"
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              maxLength={160}
            />
          </div>

          <div className="two">
            <div className="form-group">
              <label className="form-label">Avatar Icon</label>
              <div className="emoji-picker-grid">
                {AVATAR_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className={`emoji-btn ${editEmoji === em ? 'active' : ''}`}
                    onClick={() => setEditEmoji(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Avatar Aura Color</label>
              <div className="swatches">
                {AVATAR_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    className="sw"
                    style={{ backgroundColor: col }}
                    aria-pressed={editColor === col}
                    onClick={() => setEditColor(col)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <button type="submit" className="btn primary">
              Save Changes
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* 4-Metric Personal Stats Strip */}
      <dl className="strip four-col" style={{ marginTop: 18 }}>
        <div>
          <dt>Total Pixels Placed</dt>
          <dd>{profileUser.pixelsPlaced.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Total Points (XP)</dt>
          <dd>{profileUser.points.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Tasks Completed</dt>
          <dd>{profileUser.tasksCompleted}</dd>
        </div>
        <div>
          <dt>Global Rank</dt>
          <dd>
            #{globalRank} <small>of {users.length}</small>
          </dd>
        </div>
      </dl>

      {/* Achievements Showcase */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2>
          <span>Achievements &amp; Badges</span>
          <span className="pick">
            {(profileUser.achievements || []).length} / {achievementsCatalog.length} Unlocked
          </span>
        </h2>
        <div className="achievements-grid">
          {achievementsCatalog.map((ach) => {
            const unlocked = (profileUser.achievements || []).includes(ach.id);
            return (
              <div
                key={ach.id}
                className={`achievement-card ${unlocked ? 'unlocked' : 'locked'}`}
              >
                <div
                  className="ach-badge-circle"
                  style={{
                    backgroundColor: unlocked ? ach.badgeColor : 'var(--line)',
                  }}
                >
                  {ach.icon}
                </div>
                <div>
                  <div className="ach-title-row">
                    <strong>{ach.title}</strong>
                    <span className="ach-xp">+{ach.xpReward} XP</span>
                  </div>
                  <p>{ach.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Artwork Gallery + Activity & Comments */}
      <div className="two" style={{ marginTop: 20 }}>
        <div className="card">
          <h2>
            <span>Artwork Gallery</span>
            <span className="pick">{userArtworks.length} creations</span>
          </h2>
          {userArtworks.length === 0 ? (
            <p className="empty-line">
              No submitted artworks yet. Complete a challenge in Pixel Tasks to publish!
            </p>
          ) : (
            <div className="mini-art-grid">
              {userArtworks.map((art) => (
                <div
                  key={art.id}
                  className="mini-art-card"
                  onClick={() => onOpenArtwork(art)}
                >
                  <div className="mini-art-thumb">
                    <PixelArtworkPreview
                      pixels={art.pixels}
                      gridSize={art.gridSize}
                      size={110}
                      backgroundColor="#18171F"
                    />
                  </div>
                  <div className="mini-art-info">
                    <strong>{art.title}</strong>
                    <span>
                      💜 {art.likes.length} · 💬 {art.commentsCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>
            <span>Recent Wall Activity &amp; Comments</span>
            <span className="pick">{userHistory.length} pixel events</span>
          </h2>
          {userHistory.length === 0 ? (
            <p className="empty-line">No recent pixel placements recorded yet.</p>
          ) : (
            <ul className="feed">
              {userHistory.map((h) => (
                <li key={h.id}>
                  <span
                    className="sq"
                    style={{ backgroundColor: h.newColor || '#ECEAF3' }}
                  />
                  <span>
                    {h.actionType === 'erase' ? 'Cleared' : 'Placed'} pixel at{' '}
                    <b>
                      ({h.x}, {h.y})
                    </b>
                  </span>
                  <span className="at">
                    {new Date(h.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 style={{ marginTop: 18 }}>
            <span>Recent Community Comments</span>
            <span>{userComments.length}</span>
          </h3>
          {userComments.length === 0 ? (
            <p className="empty-line">No comments posted yet.</p>
          ) : (
            <ul className="feed">
              {userComments.map((c) => (
                <li key={c.id}>
                  <span className="sq" style={{ backgroundColor: 'var(--accent)' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    “{c.content}”
                  </span>
                  <span className="at">
                    {new Date(c.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Switch Account / Sign In Modal */}
      {showAuthModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowAuthModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-card compact-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Sign In or Switch Player Account</h2>
            </div>
            <p className="empty-line" style={{ marginBottom: 12 }}>
              Enter any new or existing username to sign in, or pick a demo player account to test
              multi-user cooldowns and ownership rules:
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!loginUsernameInput.trim()) return;
                await onSwitchAccount(loginUsernameInput.trim());
                setShowAuthModal(false);
              }}
            >
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="e.g. cyber_artist"
                  value={loginUsernameInput}
                  onChange={(e) => setLoginUsernameInput(e.target.value)}
                  required
                />
              </div>
              <div className="modal-actions" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowAuthModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn primary">
                  Sign In / Create Account
                </button>
              </div>
            </form>

            <h3 style={{ marginTop: 18, font: '500 11px var(--font-mono)', color: 'var(--muted)' }}>
              QUICK-SWITCH EXISTING PLAYERS:
            </h3>
            <div className="quick-users-list">
              {users.slice(0, 6).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="creator-chip"
                  onClick={async () => {
                    await onSwitchAccount(u.username);
                    setShowAuthModal(false);
                  }}
                >
                  <span
                    className="creator-avatar-dot"
                    style={{ backgroundColor: u.avatarColor }}
                  >
                    {u.avatarEmoji}
                  </span>
                  <span>@{u.username}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
