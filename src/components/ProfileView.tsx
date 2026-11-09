import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Calendar,
  Camera,
  CheckCircle2,
  Download,
  Edit3,
  Globe,
  Grid,
  Heart,
  Image as ImageIcon,
  KeyRound,
  LogIn,
  LogOut,
  MapPin,
  MessageSquare,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  UserCheck,
} from 'lucide-react';
import {
  isDeveloperAdmin,
  isReservedAdminHandle,
  type AchievementItem,
  type CommunityArtwork,
  type CommunityComment,
  type PixelHistoryEntry,
  type PlayerProfile,
} from '../types';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants';
import { PixelArtworkPreview } from './PixelArtworkPreview';
import { UserAvatar } from './UserAvatar';
import { detectUserCountry, formatCountryDisplay, POPULAR_COUNTRIES } from '../utils/countryHelper';

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
    avatarUrl?: string;
    country?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onOpenAuthModal: () => void;
  onOpenChangePassword?: () => void;
  onLogout?: () => Promise<void>;
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
  onOpenAuthModal,
  onOpenChangePassword,
  onLogout,
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
  const [editAvatarUrl, setEditAvatarUrl] = useState<string>('');
  const [editCountry, setEditCountry] = useState<string>('India');
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [saveFeedback, setSaveFeedback] = useState<{ text: string; isError: boolean } | null>(
    null
  );

  useEffect(() => {
    if (profileUser && isOwnProfile) {
      setEditUsername(profileUser.username);
      setEditDisplayName(profileUser.displayName);
      setEditBio(profileUser.bio);
      setEditEmoji(profileUser.avatarEmoji);
      setEditColor(profileUser.avatarColor);
      setEditAvatarUrl(profileUser.avatarUrl || '');
      setEditCountry(profileUser.country || 'India');
    }
  }, [profileUser, isOwnProfile]);

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSaveFeedback({ text: 'Please select a valid image file (PNG, JPG, WebP).', isError: true });
      return;
    }
    setUploadingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const targetSize = 128;
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setUploadingImage(false);
            return;
          }

          // Centered square crop
          const minSide = Math.min(img.width, img.height);
          const startX = (img.width - minSide) / 2;
          const startY = (img.height - minSide) / 2;
          ctx.drawImage(img, startX, startY, minSide, minSide, 0, 0, targetSize, targetSize);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setEditAvatarUrl(dataUrl);
          setSaveFeedback({ text: 'DP Image loaded! Click Save Changes below.', isError: false });
        } catch {
          setSaveFeedback({ text: 'Failed to process image file.', isError: true });
        } finally {
          setUploadingImage(false);
        }
      };
      img.onerror = () => {
        setUploadingImage(false);
        setSaveFeedback({ text: 'Could not load selected image.', isError: true });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

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

    if (!isDeveloperAdmin(currentUser) && isReservedAdminHandle(editUsername)) {
      setSaveFeedback({
        text: 'That username is reserved and cannot be used.',
        isError: true,
      });
      return;
    }

    const res = await onUpdateProfile({
      username: editUsername,
      displayName: editDisplayName,
      bio: editBio,
      avatarEmoji: editEmoji,
      avatarColor: editColor,
      avatarUrl: editAvatarUrl.trim() || undefined,
      country: editCountry.trim() || undefined,
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
          <div className="profile-big-avatar-wrapper" style={{ position: 'relative' }}>
            <UserAvatar user={profileUser} size={84} />
          </div>
          <div>
            <div className="profile-badges-top">
              <span className="genz-pill accent">GLOBAL RANK #{globalRank}</span>
              <span className="genz-pill">
                Joined {new Date(profileUser.joinedAt).toLocaleDateString()}
              </span>
              <span className="genz-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Globe size={11} /> {formatCountryDisplay(profileUser.country)}
              </span>
            </div>
            <h1 className="profile-display-name">{profileUser.displayName}</h1>
            <div className="profile-handle">@{profileUser.username}</div>
            <p className="profile-bio">{profileUser.bio}</p>
          </div>
        </div>

        {isOwnProfile ? (
          <div className="profile-hero-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => setIsEditing((e) => !e)}
            >
              <Edit3 size={15} /> {isEditing ? 'Close Editor' : 'Edit Profile'}
            </button>
            {onOpenChangePassword && (
              <button
                type="button"
                className="btn"
                onClick={onOpenChangePassword}
              >
                <KeyRound size={15} /> Change Password
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={onOpenAuthModal}
            >
              <LogIn size={15} /> Switch Account
            </button>
            {onLogout && (
              <button
                type="button"
                className="btn"
                style={{ borderColor: 'rgba(235, 87, 87, 0.4)', color: '#FF6B6B' }}
                onClick={onLogout}
              >
                <LogOut size={15} /> Log Out
              </button>
            )}
          </div>
        ) : !currentUser ? (
          <div className="profile-hero-actions">
            <button
              type="button"
              className="btn primary"
              onClick={onOpenAuthModal}
            >
              <LogIn size={15} /> Sign In to Play
            </button>
          </div>
        ) : null}
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
          {/* Custom DP Picture Upload Section */}
          <div className="dp-upload-zone">
            <div style={{ position: 'relative' }}>
              <UserAvatar
                user={{
                  username: editUsername,
                  avatarEmoji: editEmoji,
                  avatarColor: editColor,
                  avatarUrl: editAvatarUrl || null,
                }}
                size={70}
              />
              {editAvatarUrl && (
                <button
                  type="button"
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    background: '#E53935',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: 20,
                    height: 20,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                  }}
                  title="Remove Profile Picture"
                  onClick={() => setEditAvatarUrl('')}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>

            <div style={{ minWidth: 200, flex: 1 }}>
              <strong style={{ fontSize: 14, display: 'block' }}>User DP Profile Picture</strong>
              <small style={{ color: 'var(--muted)', fontSize: 12, display: 'block', margin: '2px 0 8px' }}>
                Upload an image from your device or paste a web URL.
              </small>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleImageFileUpload}
                />
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: 12 }}
                  disabled={uploadingImage}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera size={13} /> {uploadingImage ? 'Processing...' : 'Upload Image File'}
                </button>

                <input
                  type="url"
                  className="text-input"
                  placeholder="Or paste image URL (https://...)"
                  style={{ flex: 1, minWidth: 160, fontSize: 12, padding: '6px 10px' }}
                  value={editAvatarUrl}
                  onChange={(e) => setEditAvatarUrl(e.target.value)}
                />
              </div>
            </div>
          </div>

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

          <div className="two">
            <div className="form-group">
              <label className="form-label">Country / Region</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  className="text-input"
                  style={{ flex: 1 }}
                  value={editCountry}
                  onChange={(e) => setEditCountry(e.target.value)}
                >
                  {POPULAR_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.name}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                  <option value={editCountry}>
                    {formatCountryDisplay(editCountry)}
                  </option>
                </select>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '0 10px', fontSize: 11 }}
                  title="Auto-detect country from your connection"
                  onClick={() => {
                    const d = detectUserCountry();
                    setEditCountry(d.name);
                  }}
                >
                  <MapPin size={12} /> Auto
                </button>
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
    </div>
  );
};
