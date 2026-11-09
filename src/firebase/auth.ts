import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { ref, get, set, update, serverTimestamp } from 'firebase/database';
import { getFirebaseAuth, getFirebaseDb } from './app';
import type { PlayerProfile } from '../types';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants';

export function formatFirebaseAuthError(error: any): string {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been suspended.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please check your credentials or create a new account.';
    case 'auth/wrong-password':
      return 'Incorrect password. Try again or use "Forgot password?" to reset it.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing login.';
    case 'auth/unauthorized-domain':
      return 'Domain not yet authorized in Firebase Console (Add zero-sus.github.io under Authentication -> Settings -> Authorized domains).';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return error?.message || 'Authentication error occurred. Please try again.';
  }
}

export async function ensurePlayerProfileInDb(
  fbUser: User,
  overrides?: {
    username?: string;
    displayName?: string;
    avatarEmoji?: string;
    avatarColor?: string;
  }
): Promise<PlayerProfile> {
  const db = getFirebaseDb();
  const userRef = ref(db, `users/${fbUser.uid}`);
  const snap = await get(userRef);

  const now = Date.now();
  if (snap.exists()) {
    const data = snap.val();
    // Ensure cooldown node check
    const cdSnap = await get(ref(db, `cooldowns/${fbUser.uid}`));
    const nextCooldownAt = cdSnap.exists() ? Number(cdSnap.val()?.nextCooldownAt || 0) : 0;

    return {
      id: fbUser.uid,
      username: data.username || fbUser.displayName || `user_${fbUser.uid.slice(0, 6)}`,
      displayName: data.displayName || data.username || 'Pixel Artist',
      avatarEmoji: data.avatarEmoji || '👾',
      avatarColor: data.avatarColor || '#6B3DFF',
      bio: data.bio || 'Collaborating on the 1,000,000-pixel global wall.',
      pixelsPlaced: Number(data.pixelsPlaced || 0),
      tasksCompleted: Number(data.tasksCompleted || 0),
      points: Number(data.points || 50),
      lastPixelAt: Number(data.lastPixelAt || 0),
      nextCooldownAt,
      joinedAt: Number(data.joinedAt || now),
      achievements: Array.isArray(data.achievements) ? data.achievements : [],
    };
  }

  const rawName =
    overrides?.username ||
    fbUser.displayName ||
    fbUser.email?.split('@')[0] ||
    `artist_${fbUser.uid.slice(0, 5)}`;
  const cleanUsername = rawName.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 22) || `artist_${fbUser.uid.slice(0, 5)}`;

  const newProfile: PlayerProfile = {
    id: fbUser.uid,
    username: cleanUsername,
    displayName: overrides?.displayName || fbUser.displayName || cleanUsername,
    avatarEmoji:
      overrides?.avatarEmoji || AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)],
    avatarColor:
      overrides?.avatarColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    bio: 'Collaborating on the 1,000,000-pixel global Dotwall.',
    pixelsPlaced: 0,
    tasksCompleted: 0,
    points: 50,
    lastPixelAt: 0,
    nextCooldownAt: 0,
    joinedAt: now,
    achievements: [],
  };

  await set(userRef, {
    ...newProfile,
    updatedAt: serverTimestamp(),
  });

  return newProfile;
}

export async function registerWithEmail(params: {
  email: string;
  password: string;
  username: string;
  avatarEmoji?: string;
  avatarColor?: string;
}): Promise<PlayerProfile> {
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
  const cleanName = params.username.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 22);
  if (cleanName) {
    await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
  }
  return ensurePlayerProfileInDb(cred.user, {
    username: cleanName,
    displayName: cleanName,
    avatarEmoji: params.avatarEmoji,
    avatarColor: params.avatarColor,
  });
}

export async function loginWithEmail(email: string, password: string): Promise<PlayerProfile> {
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return ensurePlayerProfileInDb(cred.user);
}

export async function loginWithGooglePopup(): Promise<PlayerProfile> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return ensurePlayerProfileInDb(cred.user);
}

export async function sendAccountPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logoutFirebaseUser(): Promise<void> {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export { onAuthStateChanged, update };
