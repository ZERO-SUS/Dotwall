// ============================================================================
// DOTWALL — PRODUCTION FIREBASE CONFIGURATION (dotwall-13046)
// Public client configuration protected by Firebase Auth & Database Rules
// ============================================================================

export interface DotwallFirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export const firebaseConfig: DotwallFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDSOJLfHojHd8RyMY4aGnGbh7Rz5sLTcjE',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'dotwall-13046.firebaseapp.com',
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    'https://dotwall-13046-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'dotwall-13046',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'dotwall-13046.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '498104887822',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:498104887822:web:263b36e382d91ca8b4aa5f',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-GSEBFK5H2B',
};

export const CHUNK_SIZE = 50; // 1000x1000 divided into 20x20 chunks of 50x50 pixels
export const CANVAS_DIMENSION = 1000;
export const MAX_GLOBAL_PIXELS = 1_000_000;
export const PLAYER_COOLDOWN_MS = 30_000; // 30 seconds per UID
