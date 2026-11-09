import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  type Auth,
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
  onDisconnect,
  push,
  type Database,
} from 'firebase/database';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

const STORAGE_KEY_FB = 'dotwall_firebase_config';

// Parse either JSON or raw JS snippet from Firebase Console (`const firebaseConfig = { ... }`)
export function parseFirebaseConfigInput(raw: string): FirebaseConfig | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Extract key-value pairs from JS object snippet
    const extract = (key: string) => {
      const m = trimmed.match(new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`));
      return m ? m[1] : '';
    };
    const apiKey = extract('apiKey');
    const projectId = extract('projectId');
    const authDomain = extract('authDomain') || (projectId ? `${projectId}.firebaseapp.com` : '');
    const databaseURL =
      extract('databaseURL') ||
      (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : '');
    const storageBucket = extract('storageBucket');
    const messagingSenderId = extract('messagingSenderId');
    const appId = extract('appId');

    if (apiKey && projectId) {
      return {
        apiKey,
        authDomain,
        databaseURL,
        projectId,
        storageBucket,
        messagingSenderId,
        appId: appId || 'dotwall-web',
      };
    }
    return null;
  }
}

export function getFirebaseConfig(): { config: FirebaseConfig | null; isConfigured: boolean } {
  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const envAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
  const envDatabaseUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined;
  const envAppId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;

  if (envApiKey && envProjectId && !envApiKey.includes('your-firebase')) {
    return {
      config: {
        apiKey: envApiKey,
        projectId: envProjectId,
        authDomain: envAuthDomain || `${envProjectId}.firebaseapp.com`,
        databaseURL:
          envDatabaseUrl || `https://${envProjectId}-default-rtdb.firebaseio.com`,
        appId: envAppId || 'dotwall-app',
      },
      isConfigured: true,
    };
  }

  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(STORAGE_KEY_FB);
    if (saved) {
      const parsed = parseFirebaseConfigInput(saved);
      if (parsed && parsed.apiKey && parsed.projectId) {
        if (!parsed.databaseURL) {
          parsed.databaseURL = `https://${parsed.projectId}-default-rtdb.firebaseio.com`;
        }
        return { config: parsed, isConfigured: true };
      }
    }
  }

  return { config: null, isConfigured: false };
}

export function saveRuntimeFirebaseConfig(rawInput: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!rawInput.trim()) {
    window.localStorage.removeItem(STORAGE_KEY_FB);
    return true;
  }
  const parsed = parseFirebaseConfigInput(rawInput);
  if (!parsed) return false;
  window.localStorage.setItem(STORAGE_KEY_FB, JSON.stringify(parsed));
  return true;
}

let fbApp: FirebaseApp | null = null;
let fbAuth: Auth | null = null;
let fbDb: Database | null = null;

export function getFirebaseInstances(): {
  app: FirebaseApp;
  auth: Auth;
  db: Database;
} | null {
  const { config, isConfigured } = getFirebaseConfig();
  if (!isConfigured || !config) return null;

  try {
    if (!fbApp) {
      const existing = getApps();
      fbApp = existing.length > 0 ? existing[0] : initializeApp(config);
      fbAuth = getAuth(fbApp);
      fbDb = getDatabase(fbApp, config.databaseURL);
    }
    if (fbApp && fbAuth && fbDb) {
      return { app: fbApp, auth: fbAuth, db: fbDb };
    }
  } catch (e) {
    console.error('[Dotwall Firebase] Initialization error:', e);
  }
  return null;
}

export {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fbSignOut,
  fbUpdateProfile,
  ref,
  set,
  update,
  get,
  onValue,
  onDisconnect,
  push,
};
