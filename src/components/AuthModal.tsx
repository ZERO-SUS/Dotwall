import React, { useState } from 'react';
import { KeyRound, LogIn, LogOut, ShieldCheck, UserPlus, X } from 'lucide-react';
import { isDeveloperAdmin, PlayerProfile } from '../types';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: PlayerProfile | null;
  users: PlayerProfile[];
  isFirebaseActive: boolean;
  onLogin: (payload: {
    mode: 'login' | 'signup' | 'admin';
    email?: string;
    username: string;
    password?: string;
    avatarEmoji?: string;
    avatarColor?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onGoogleLogin: () => Promise<{ ok: boolean; error?: string }>;
  onPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  onLogout: () => Promise<void>;
  onOpenCloudConfig: () => void;
  onOpenAdminPanel?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  isFirebaseActive: _isFirebaseActive,
  onLogin,
  onGoogleLogin,
  onPasswordReset,
  onLogout,
  onOpenCloudConfig,
  onOpenAdminPanel,
}) => {
  const [tab, setTab] = useState<'login' | 'signup' | 'admin' | 'reset'>('login');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [adminUserIdInput, setAdminUserIdInput] = useState<string>('zero_sus');
  const [avatarEmoji, setAvatarEmoji] = useState<string>('👾');
  const [avatarColor, setAvatarColor] = useState<string>('#6B3DFF');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleDeveloperLogin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);
    const cleanId = adminUserIdInput.trim().replace(/^@/, '').toLowerCase();
    if (cleanId !== 'zero_sus') {
      setIsLoading(false);
      setErrorMsg('Developer Admin access requires User ID / Username: zero_sus');
      return;
    }
    const res = await onLogin({
      mode: 'admin',
      username: 'zero_sus',
      email: 'zero_sus@dotwall.app',
      avatarEmoji: '👑',
      avatarColor: '#6B3DFF',
    });
    setIsLoading(false);
    if (res.ok) {
      onClose();
      onOpenAdminPanel?.();
    } else {
      setErrorMsg(res.error || 'Could not sign in as Developer Admin.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (tab === 'admin') {
      await handleDeveloperLogin();
      return;
    }

    setIsLoading(true);

    if (tab === 'reset') {
      const res = await onPasswordReset(email.trim());
      setIsLoading(false);
      if (res.ok) {
        setSuccessMsg(`Password reset instructions sent to ${email.trim()}!`);
      } else {
        setErrorMsg(res.error || 'Could not send password reset email.');
      }
      return;
    }

    // Check if user entered zero_sus directly in Sign In / Sign Up
    const rawIdentifier = (username.trim() || email.trim().split('@')[0] || '').replace(/^@/, '').toLowerCase();
    if (rawIdentifier === 'zero_sus' || email.trim().toLowerCase() === 'zero_sus') {
      const res = await onLogin({
        mode: 'admin',
        username: 'zero_sus',
        email: 'zero_sus@dotwall.app',
        avatarEmoji: '👑',
        avatarColor: '#6B3DFF',
      });
      setIsLoading(false);
      if (res.ok) {
        onClose();
        onOpenAdminPanel?.();
      } else {
        setErrorMsg(res.error || 'Admin login failed.');
      }
      return;
    }

    const res = await onLogin({
      mode: tab,
      email: email.trim(),
      username: username.trim() || email.split('@')[0] || 'player',
      password,
      avatarEmoji,
      avatarColor,
    });
    setIsLoading(false);
    if (res.ok) {
      onClose();
    } else {
      setErrorMsg(res.error || 'Authentication failed.');
    }
  };

  const handleGoogle = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);
    const res = await onGoogleLogin();
    setIsLoading(false);
    if (res.ok) {
      onClose();
    } else {
      setErrorMsg(res.error || 'Google Sign-In failed.');
    }
  };

  const isAdmin = isDeveloperAdmin(currentUser);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card compact-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="genz-pill daily">
              {tab === 'admin' ? '👑 DEVELOPER GOD-MODE · UID: zero_sus' : 'FIREBASE AUTH · UID SESSION'}
            </span>
            <h2 className="modal-title">
              {tab === 'login'
                ? 'Sign In to Dotwall'
                : tab === 'signup'
                  ? 'Register Dotwall Account'
                  : tab === 'admin'
                    ? 'Developer / Admin Console Login'
                    : 'Reset Account Password'}
            </h2>
          </div>
          <button type="button" className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Active Account Banner with Logout */}
        {currentUser && (
          <div className="active-session-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className="creator-avatar-dot"
                style={{ backgroundColor: currentUser.avatarColor }}
              >
                {currentUser.avatarEmoji}
              </span>
              <div>
                <strong>
                  @{currentUser.username}{' '}
                  {isAdmin && (
                    <span
                      className="genz-pill daily"
                      style={{ marginLeft: 4, fontSize: 10, padding: '2px 6px' }}
                    >
                      👑 DEV ADMIN
                    </span>
                  )}
                </strong>
                <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                  UID: {currentUser.id}
                </small>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {isAdmin && onOpenAdminPanel && (
                <button
                  type="button"
                  className="tbtn primary-outline"
                  onClick={() => {
                    onClose();
                    onOpenAdminPanel();
                  }}
                >
                  <ShieldCheck size={13} /> Admin Panel
                </button>
              )}
              <button
                type="button"
                className="tbtn"
                onClick={async () => {
                  await onLogout();
                  onClose();
                }}
              >
                <LogOut size={13} /> Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Mode Switcher */}
        <div className="seg" style={{ width: '100%', marginBottom: 16 }}>
          <button
            type="button"
            style={{ flex: 1, justifyContent: 'center' }}
            aria-pressed={tab === 'login'}
            onClick={() => {
              setTab('login');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
          >
            <LogIn size={13} /> Sign In
          </button>
          <button
            type="button"
            style={{ flex: 1, justifyContent: 'center' }}
            aria-pressed={tab === 'signup'}
            onClick={() => {
              setTab('signup');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
          >
            <UserPlus size={13} /> Register
          </button>
          <button
            type="button"
            style={{ flex: 1.15, justifyContent: 'center' }}
            aria-pressed={tab === 'admin'}
            onClick={() => {
              setTab('admin');
              setAdminUserIdInput('zero_sus');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
          >
            <ShieldCheck size={13} /> 👑 Dev Admin
          </button>
          <button
            type="button"
            style={{ flex: 0.85, justifyContent: 'center' }}
            aria-pressed={tab === 'reset'}
            onClick={() => {
              setTab('reset');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
          >
            <KeyRound size={13} /> Reset
          </button>
        </div>

        {tab === 'admin' ? (
          <form onSubmit={handleSubmit}>
            <div
              className="card"
              style={{
                marginBottom: 14,
                padding: 14,
                border: '1px solid var(--accent)',
                background: 'var(--accent-soft)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 24 }}>👑</span>
                <div>
                  <strong style={{ display: 'block', fontSize: 14 }}>
                    Developer &amp; Admin God-Mode
                  </strong>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Full authority to erase pixels/regions, delete or edit users, moderate artworks &amp;
                    comments, and place pixels with 0s cooldown.
                  </span>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
                <label className="form-label">Developer User ID / Username</label>
                <input
                  type="text"
                  className="text-input"
                  value={adminUserIdInput}
                  onChange={(e) => setAdminUserIdInput(e.target.value)}
                  placeholder="zero_sus"
                  required
                />
              </div>
            </div>

            {errorMsg && (
              <p className="msg" data-kind="error" style={{ marginBottom: 10 }}>
                {errorMsg}
              </p>
            )}

            <button type="submit" className="go" disabled={isLoading}>
              {isLoading ? 'Activating Admin Console...' : '👑 Sign In as @zero_sus & Open Admin Panel'}
            </button>
          </form>
        ) : (
          <>
            {tab !== 'reset' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={handleGoogle}
                  disabled={isLoading}
                >
                  <span>🌐</span> Continue with Google
                </button>
                <button
                  type="button"
                  className="btn primary"
                  style={{ justifyContent: 'center' }}
                  onClick={() => {
                    setTab('admin');
                    setAdminUserIdInput('zero_sus');
                  }}
                  title="Login as Developer Admin (@zero_sus)"
                >
                  👑 Dev (@zero_sus)
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {tab === 'signup' && (
                <div className="form-group">
                  <label className="form-label">Choose @Username</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="e.g. zero_sus"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  {tab === 'login' ? 'Email Address or @Username (type zero_sus for Dev)' : 'Email Address'}
                </label>
                <input
                  type={tab === 'login' ? 'text' : 'email'}
                  className="text-input"
                  placeholder={tab === 'login' ? 'you@example.com or zero_sus' : 'you@example.com'}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (tab === 'login') setUsername(e.target.value.split('@')[0]);
                  }}
                  required
                />
              </div>

              {tab !== 'reset' && email.trim().replace(/^@/, '').toLowerCase() !== 'zero_sus' && (
                <div className="form-group">
                  <label className="form-label">Password (min 6 chars)</label>
                  <input
                    type="password"
                    className="text-input"
                    placeholder="••••••••"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              )}

              {tab === 'signup' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Pick Your Avatar Icon</label>
                    <div className="emoji-picker-grid">
                      {AVATAR_EMOJIS.slice(0, 8).map((em) => (
                        <button
                          key={em}
                          type="button"
                          className={`emoji-btn ${avatarEmoji === em ? 'active' : ''}`}
                          onClick={() => setAvatarEmoji(em)}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Pick Your Aura Color</label>
                    <div className="swatches">
                      {AVATAR_COLORS.slice(0, 8).map((col) => (
                        <button
                          key={col}
                          type="button"
                          className="sw"
                          style={{ backgroundColor: col }}
                          aria-pressed={avatarColor === col}
                          onClick={() => setAvatarColor(col)}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {errorMsg && (
                <p className="msg" data-kind="error" style={{ marginBottom: 10 }}>
                  {errorMsg}
                </p>
              )}
              {successMsg && (
                <p className="msg" style={{ color: 'var(--good)', marginBottom: 10 }}>
                  {successMsg}
                </p>
              )}

              <button type="submit" className="go" disabled={isLoading}>
                {isLoading
                  ? 'Processing...'
                  : tab === 'login'
                    ? email.trim().replace(/^@/, '').toLowerCase() === 'zero_sus'
                      ? '👑 Sign In as Developer (@zero_sus)'
                      : 'Sign In'
                    : tab === 'signup'
                      ? 'Register Account & Play'
                      : 'Send Password Reset Email'}
              </button>
            </form>
          </>
        )}

        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="form-label">Firebase Project: dotwall-13046</span>
            <button
              type="button"
              className="mini-link-btn"
              onClick={() => {
                onClose();
                onOpenCloudConfig();
              }}
            >
              🔥 Database &amp; Auth Status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
