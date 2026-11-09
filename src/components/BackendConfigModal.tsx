import React, { useState } from 'react';
import { Cloud, Flame, Server, X } from 'lucide-react';
import { getSupabaseConfig, saveRuntimeSupabaseConfig } from '../lib/supabase';
import { getFirebaseConfig, saveRuntimeFirebaseConfig } from '../lib/firebase';

interface BackendConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionMode: 'firebase-cloud' | 'supabase-cloud' | 'local-server' | 'static-global';
  onlineCount: number;
  onConfigSaved: () => void;
}

export const BackendConfigModal: React.FC<BackendConfigModalProps> = ({
  isOpen,
  onClose,
  connectionMode,
  onlineCount,
  onConfigSaved,
}) => {
  const existingSupa = getSupabaseConfig();
  const existingFb = getFirebaseConfig();

  const [fbRaw, setFbRaw] = useState<string>(
    existingFb.config ? JSON.stringify(existingFb.config, null, 2) : ''
  );
  const [url, setUrl] = useState<string>(existingSupa.url);
  const [anonKey, setAnonKey] = useState<string>(existingSupa.anonKey);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);

    if (fbRaw.trim()) {
      const ok = saveRuntimeFirebaseConfig(fbRaw);
      if (!ok) {
        setErrorNotice(
          'Could not parse Firebase config. Paste the firebaseConfig object or JSON with apiKey & projectId.'
        );
        return;
      }
    } else {
      saveRuntimeFirebaseConfig('');
    }

    saveRuntimeSupabaseConfig(url, anonKey);
    setSavedNotice('Cloud configuration saved! Reconnecting global multiplayer...');
    setTimeout(() => {
      setSavedNotice(null);
      onConfigSaved();
    }, 800);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="genz-pill daily">GLOBAL MULTIPLAYER ENGINE</span>
            <h2 className="modal-title">Firebase Auth, Realtime DB &amp; Cloud Setup</h2>
          </div>
          <button type="button" className="icon-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Active Status Banner */}
        <div className="backend-status-banner">
          {connectionMode === 'firebase-cloud' ? (
            <>
              <Flame size={22} color="#FF8A3C" />
              <div>
                <strong>Connected to Firebase Global Realtime Server</strong>
                <p>
                  Firebase Auth + Firebase Realtime Database active ({onlineCount} players online).
                </p>
              </div>
            </>
          ) : connectionMode === 'supabase-cloud' ? (
            <>
              <Cloud size={22} color="var(--good)" />
              <div>
                <strong>Connected to Supabase Cloud Realtime</strong>
                <p>PostgreSQL + Realtime Presence active ({onlineCount} players online).</p>
              </div>
            </>
          ) : (
            <>
              <Server size={22} color="var(--good)" />
              <div>
                <strong>
                  {connectionMode === 'local-server'
                    ? 'Connected to Live Multiplayer Server'
                    : 'Global Browser Engine Active (Ready for Firebase API)'}
                </strong>
                <p>
                  {onlineCount} active session(s) · Paste your Firebase config below to link global
                  Firebase Auth &amp; Realtime DB across millions of players!
                </p>
              </div>
            </>
          )}
        </div>

        <form onSubmit={handleSave} style={{ marginTop: 16 }}>
          <h3 style={{ margin: '0 0 6px', font: '700 15px var(--font-display)' }}>
            🔥 Option 1: Firebase Config (Recommended for Global Auth + Realtime DB)
          </h3>
          <p className="empty-line" style={{ marginBottom: 10 }}>
            Paste your <code>firebaseConfig</code> snippet directly from Firebase Console → Project
            Settings (supports both JS snippet and JSON):
          </p>

          <div className="form-group">
            <textarea
              className="text-input"
              rows={6}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
              placeholder={`{\n  "apiKey": "AIzaSy...",\n  "authDomain": "your-app.firebaseapp.com",\n  "databaseURL": "https://your-app-default-rtdb.firebaseio.com",\n  "projectId": "your-app",\n  "appId": "1:123456:web:abcdef"\n}`}
              value={fbRaw}
              onChange={(e) => setFbRaw(e.target.value)}
            />
          </div>

          <h3 style={{ margin: '14px 0 6px', font: '700 15px var(--font-display)' }}>
            ⚡ Option 2: Supabase Cloud (Optional Alternative)
          </h3>
          <div className="two">
            <div className="form-group">
              <label className="form-label">VITE_SUPABASE_URL</label>
              <input
                type="url"
                className="text-input"
                placeholder="https://your-project.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">VITE_SUPABASE_ANON_KEY</label>
              <input
                type="password"
                className="text-input"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
              />
            </div>
          </div>

          {errorNotice && (
            <p className="msg" data-kind="error">
              {errorNotice}
            </p>
          )}
          {savedNotice && (
            <p className="msg" style={{ color: 'var(--good)' }}>
              {savedNotice}
            </p>
          )}

          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="btn primary">
              Save &amp; Connect Global Server
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
