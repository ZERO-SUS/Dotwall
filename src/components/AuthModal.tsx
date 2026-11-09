import React, { useState } from 'react';
import { KeyRound, LogIn, LogOut, ShieldCheck, UserPlus, X } from 'lucide-react';
import { isDeveloperAdmin, isReservedAdminHandle, PlayerProfile } from '../types';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: PlayerProfile | null;
  users: PlayerProfile[];
  isFirebaseActive: boolean;
  initialTab?: 'login' | 'signup' | 'reset' | 'change';
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
  onChangePassword?: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  onLogout: () => Promise<void>;
  onOpenCloudConfig?: () => void;
  onOpenAdminPanel?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  isFirebaseActive: _isFirebaseActive,
  initialTab = 'login',
  onLogin,
  onGoogleLogin,
  onPasswordReset,
  onChangePassword,
  onLogout,
  onOpenAdminPanel,
}) => {
  const [tab, setTab] = useState<'login' | 'signup' | 'reset' | 'change'>(initialTab);
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [avatarEmoji, setAvatarEmoji] = useState<string>('👾');
  const [avatarColor, setAvatarColor] = useState<string>('#6B3DFF');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  React.useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setErrorMsg(null);
      setSuccessMsg(null);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const isAdmin = isDeveloperAdmin(currentUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (tab === 'change') {
      if (!onChangePassword) {
        setErrorMsg('Password change is not supported on this device.');
        return;
      }
      if (!newPassword || newPassword.length < 6) {
        setErrorMsg('New password must be at least 6 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg('New passwords do not match. Please re-enter.');
        return;
      }
      setIsLoading(true);
      const res = await onChangePassword(newPassword);
      setIsLoading(false);
      if (res.ok) {
        setSuccessMsg('Your password was changed successfully!');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setErrorMsg(res.error || 'Failed to change password. You may need to log in again first.');
      }
      return;
    }

    if (tab === 'reset') {
      setIsLoading(true);
      const targetEmail = email.trim().toLowerCase() === 'zero_sus' ? 'zero_sus@dotwall.app' : email.trim();
      const res = await onPasswordReset(targetEmail);
      setIsLoading(false);
      if (res.ok) {
        setSuccessMsg(`Password reset instructions sent to ${targetEmail}! Check your inbox.`);
      } else {
        setErrorMsg(res.error || 'Could not send password reset email.');
      }
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Please enter a valid password (at least 6 characters).');
      return;
    }

    if (tab === 'signup') {
      if (isReservedAdminHandle(username) || isReservedAdminHandle(email.split('@')[0])) {
        setErrorMsg('That username is reserved and cannot be registered.');
        return;
      }
    }

    setIsLoading(true);
    const res = await onLogin({
      mode: tab,
      email: email.trim(),
      username: username.trim() || email.trim().split('@')[0] || 'player',
      password,
      avatarEmoji,
      avatarColor,
    });
    setIsLoading(false);
    if (res.ok) {
      setPassword('');
      onClose();
    } else {
      setErrorMsg(res.error || 'Authentication failed. Please check your credentials.');
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
            <span className="genz-pill daily">DOTWALL ACCOUNT · GLOBAL MULTIPLAYER</span>
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
          {currentUser ? (
            <button
              type="button"
              style={{ flex: 1.1, justifyContent: 'center' }}
              aria-pressed={tab === 'change'}
              onClick={() => {
                setTab('change');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
            >
              <KeyRound size={13} /> Change Password
            </button>
          ) : (
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
          )}
        </div>

        {tab === 'login' && (
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
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {tab === 'change' && (
            <>
              <div className="form-group">
                <label className="form-label">New Password (min 6 characters)</label>
                <input
                  type="password"
                  className="text-input"
                  placeholder="Enter new secure password"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className="text-input"
                  placeholder="Re-type new password"
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <button
                  type="button"
                  className="mini-link-btn"
                  onClick={() => {
                    setTab('reset');
                    setEmail(currentUser?.username === 'zero_sus' ? 'zero_sus@dotwall.app' : '');
                  }}
                >
                  Forgot your current password? Send reset link to email →
                </button>
              </div>
            </>
          )}

          {tab === 'signup' && (
            <div className="form-group">
              <label className="form-label">Choose @Username</label>
              <input
                type="text"
                className="text-input"
                placeholder="e.g. pixel_voyager"
                maxLength={22}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          )}

          {tab !== 'change' && (
            <div className="form-group">
              <label className="form-label">
                {tab === 'login' ? 'Email Address' : 'Email Address'}
              </label>
              <input
                type={tab === 'login' ? 'text' : 'email'}
                className="text-input"
                placeholder={tab === 'login' ? 'your-email@example.com (or zero_sus@dotwall.app)' : 'you@example.com'}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (tab === 'login') setUsername(e.target.value.split('@')[0]);
                }}
                required
              />
            </div>
          )}

          {(tab === 'login' || tab === 'signup') && (
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Password (min 6 chars)</label>
                {tab === 'login' && (
                  <button
                    type="button"
                    className="mini-link-btn"
                    style={{ fontSize: 11 }}
                    onClick={() => {
                      setTab('reset');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
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
              ? 'Authenticating...'
              : tab === 'login'
                ? 'Sign In with Email'
                : tab === 'signup'
                  ? 'Register Account & Play'
                  : tab === 'change'
                    ? 'Update Password'
                    : 'Send Password Reset Email'}
          </button>
        </form>

        <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="form-label">Dotwall Global 1,000,000-Pixel Wall · Firebase Auth</span>
            {currentUser && tab !== 'change' && (
              <button
                type="button"
                className="mini-link-btn"
                onClick={() => setTab('change')}
              >
                Change password →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
