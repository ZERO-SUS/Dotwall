import React, { useState } from 'react';
import { KeyRound, LogIn, LogOut, Mail, UserPlus, X } from 'lucide-react';
import type { PlayerProfile } from '../types';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: PlayerProfile | null;
  users: PlayerProfile[];
  isFirebaseActive: boolean;
  onLogin: (payload: {
    mode: 'login' | 'signup';
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
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  users,
  isFirebaseActive,
  onLogin,
  onGoogleLogin,
  onPasswordReset,
  onLogout,
  onOpenCloudConfig,
}) => {
  const [tab, setTab] = useState<'login' | 'signup' | 'reset'>('login');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [avatarEmoji, setAvatarEmoji] = useState<string>('👾');
  const [avatarColor, setAvatarColor] = useState<string>('#6B3DFF');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
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

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card compact-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="genz-pill daily">FIREBASE AUTH · UID SESSION</span>
            <h2 className="modal-title">
              {tab === 'login'
                ? 'Sign In to Dotwall'
                : tab === 'signup'
                  ? 'Register Dotwall Account'
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
                <strong>@{currentUser.username}</strong>
                <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                  UID: {currentUser.id.slice(0, 14)}...
                </small>
              </div>
            </div>
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
            style={{ flex: 1, justifyContent: 'center' }}
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

        {tab !== 'reset' && (
          <button
            type="button"
            className="btn"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 14 }}
            onClick={handleGoogle}
            disabled={isLoading}
          >
            <span>🌐</span> Continue with Google (Firebase Auth)
          </button>
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
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="text-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (tab === 'login' && !username) setUsername(e.target.value.split('@')[0]);
              }}
              required
            />
          </div>

          {tab !== 'reset' && (
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
                ? 'Sign In with Email'
                : tab === 'signup'
                  ? 'Register Account & Play'
                  : 'Send Password Reset Email'}
          </button>
        </form>

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
