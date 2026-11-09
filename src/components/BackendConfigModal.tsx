import React, { useState } from 'react';
import { CheckCircle2, Cloud, Copy, Flame, Server, ShieldAlert, X } from 'lucide-react';
import { getSupabaseConfig, saveRuntimeSupabaseConfig } from '../lib/supabase';
import { getFirebaseConfig, saveRuntimeFirebaseConfig } from '../lib/firebase';
import { firebaseConfig } from '../firebase/config';

interface BackendConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionMode: 'firebase-cloud' | 'supabase-cloud' | 'local-server' | 'static-global';
  onlineCount: number;
  rtdbStatus?: 'connected' | 'permission-denied' | 'connecting';
  onConfigSaved: () => void;
}

const RECOMMENDED_DATABASE_RULES = `{
  "rules": {
    "users": {
      ".read": true,
      "$uid": {
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "presence": {
      ".read": true,
      "$uid": {
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "cooldowns": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "canvasChunks": {
      ".read": true,
      "$chunkId": {
        "$coordKey": {
          ".write": "auth != null && (!newData.exists() || newData.child('uid').val() === auth.uid)"
        }
      }
    },
    "placements": {
      ".read": true,
      "$eventId": {
        ".write": "auth != null && newData.child('userId').val() === auth.uid"
      }
    },
    "taskClaims": {
      ".read": "auth != null",
      "$claimKey": {
        ".write": "auth != null && !data.exists() && newData.child('userId').val() === auth.uid"
      }
    },
    "taskSubmissions": {
      ".read": true,
      "$subId": {
        ".write": "auth != null && newData.child('userId').val() === auth.uid"
      }
    },
    "artworks": {
      ".read": true,
      "$artId": {
        ".write": "auth != null"
      }
    },
    "comments": {
      ".read": true,
      "$artId": {
        "$commentId": {
          ".write": "auth != null && newData.child('userId').val() === auth.uid"
        }
      }
    },
    "reports": {
      ".read": "auth != null",
      "$reportId": {
        ".write": "auth != null && newData.child('reporterId').val() === auth.uid"
      }
    }
  }
}`;

export const BackendConfigModal: React.FC<BackendConfigModalProps> = ({
  isOpen,
  onClose,
  connectionMode,
  onlineCount,
  rtdbStatus = 'connected',
  onConfigSaved,
}) => {
  const existingSupa = getSupabaseConfig();
  const existingFb = getFirebaseConfig();

  const [fbRaw, setFbRaw] = useState<string>(
    existingFb.config
      ? JSON.stringify(existingFb.config, null, 2)
      : JSON.stringify(firebaseConfig, null, 2)
  );
  const [url, setUrl] = useState<string>(existingSupa.url);
  const [anonKey, setAnonKey] = useState<string>(existingSupa.anonKey);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [copiedRules, setCopiedRules] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(RECOMMENDED_DATABASE_RULES);
      setCopiedRules(true);
      setTimeout(() => setCopiedRules(false), 2500);
    } catch {
      // fallback
    }
  };

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
      <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="genz-pill daily">FIREBASE PROJECT: {firebaseConfig.projectId}</span>
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
                <strong>Connected to Firebase ({firebaseConfig.projectId})</strong>
                <p>
                  Firebase Auth + Realtime Database (`asia-southeast1`) active ({onlineCount} players
                  online).
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
                  Firebase Auth (`{firebaseConfig.projectId}`) Live ·{' '}
                  {connectionMode === 'local-server'
                    ? 'Multiplayer Server Sync Active'
                    : 'Global Canvas Sync Active'}
                </strong>
                <p>
                  {onlineCount} active player(s) online · Firebase Authentication is live!
                </p>
              </div>
            </>
          )}
        </div>

        {/* If Firebase RTDB returned PERMISSION_DENIED, show 1-click copy rules helper */}
        {rtdbStatus === 'permission-denied' && (
          <div
            className="card"
            style={{
              marginTop: 12,
              padding: 12,
              borderColor: 'var(--warn)',
              background: 'color-mix(in oklab, var(--warn) 8%, var(--paper))',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                <ShieldAlert size={16} color="var(--warn)" /> Publish `database.rules.json` in Firebase Console
              </span>
              <button type="button" className="tbtn" onClick={handleCopyRules}>
                {copiedRules ? <CheckCircle2 size={13} /> : <Copy size={13} />}{' '}
                {copiedRules ? 'Copied Rules!' : 'Copy database.rules.json'}
              </button>
            </div>
            <p className="empty-line" style={{ marginTop: 6, fontSize: 12 }}>
              Your Firebase Auth (`dotwall-13046`) is live, and the app is seamlessly syncing! To unlock
              direct client-to-RTDB writes on <code>dotwall-13046-default-rtdb</code>, paste{' '}
              <code>database.rules.json</code> into Firebase Console → Realtime Database → Rules.
            </p>
          </div>
        )}

        <form onSubmit={handleSave} style={{ marginTop: 16 }}>
          <h3 style={{ margin: '0 0 6px', font: '700 15px var(--font-display)' }}>
            🔥 Active Firebase Config (`dotwall-13046`)
          </h3>
          <p className="empty-line" style={{ marginBottom: 10 }}>
            Configured with production <code>dotwall-13046</code> credentials (`asia-southeast1` RTDB +
            Firebase Auth + Analytics):
          </p>

          <div className="form-group">
            <textarea
              className="text-input"
              rows={6}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
              value={fbRaw}
              onChange={(e) => setFbRaw(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn" onClick={handleCopyRules}>
              <Copy size={14} /> {copiedRules ? 'Copied Security Rules!' : 'Copy Security Rules JSON'}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="btn primary">
              Save &amp; Verify Connection
            </button>
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
        </form>
      </div>
    </div>
  );
};
