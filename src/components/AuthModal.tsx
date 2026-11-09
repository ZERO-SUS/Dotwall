import React, { useState } from 'react';
import { KeyRound, LogIn, Mail, Sparkles, UserPlus, X } from 'lucide-react';
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
  onOpenCloudConfig,
}) => {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [avatarEmoji, setAvatarEmoji] = useState<string>('👾');
  const [avatarColor, setAvatarColor] = useState<string>('#6B3DFF');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
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
    setIsLoading(true);
    const res = await onGoogleLogin();
    setIsLoading(false);
    if (res.ok) {
      onClose();
    } else {
      setErrorMsg(res.error || 'Google Sign-In requires Firebase Auth configuration.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card compact-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="genz-pill daily">GLOBAL PLAYER ACCOUNT</span>
            <h2 className="modal-title">
              {tab === 'login' ? 'Sign In to Dotwall' : 'Create Your Dotwall Account'}
            </h2>
          </div>
          <button type="button" className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="seg" style={{ width: '100%', marginBottom: 16 }}>
          <button
            type="button"
            style={{ flex: 1, justifyContent: 'center' }}
            aria-pressed={tab === 'login'}
            onClick={() => {
              setTab('login');
              setErrorMsg(null);
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
            }}
          >
            <UserPlus size={13} /> Create Account
          </button>
        </div>

        {/* Google 1-Click Button */}
        <button
          type="button"
          className="btn"
          style={{ width: '100%', justifyContent: 'center', marginBottom: 14 }}
          onClick={handleGoogle}
          disabled={isLoading}
        >
          <span>🌐</span> Continue with Google {isFirebaseActive ? '(Firebase Auth)' : ''}
        </button>

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
              {tab === 'login' ? 'Email or @Username' : 'Email Address'}
            </label>
            <input
              type={tab === 'signup' ? 'email' : 'text'}
              className="text-input"
              placeholder={tab === 'login' ? 'you@example.com or @username' : 'you@example.com'}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (tab === 'login') setUsername(e.target.value);
              }}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="text-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

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

          <button type="submit" className="go" disabled={isLoading}>
            {isLoading
              ? 'Authenticating...'
              : tab === 'login'
                ? 'Sign In & Join Global Wall'
                : 'Create Account & Start Playing'}
          </button>
        </form>

        {/* Quick-switch existing profiles */}
        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="form-label">Quick-Switch Player</span>
            <button
              type="button"
              className="mini-link-btn"
              onClick={() => {
                onClose();
                onOpenCloudConfig();
              }}
            >
              🔥 Connect Firebase API
            </button>
          </div>
          <div className="quick-users-list">
            {users.slice(0, 5).map((u) => (
              <button
                key={u.id}
                type="button"
                className="creator-chip"
                onClick={async () => {
                  await onLogin({ mode: 'login', username: u.username });
                  onClose();
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
    </div>
  );
};
