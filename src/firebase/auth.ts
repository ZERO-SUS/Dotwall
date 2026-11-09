import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  updatePassword,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { ref, get, set, update, serverTimestamp } from 'firebase/database';
import { getFirebaseAuth, getFirebaseDb } from './app';
import {
  isReservedAdminHandle,
  RESERVED_ADMIN_USERNAME,
  VERIFIED_ADMIN_EMAILS,
  type PlayerProfile,
} from '../types';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../constants';

export function isVerifiedFirebaseAdminUser(fbUser: User | null | undefined): boolean {
  if (!fbUser || !fbUser.email) return false;
  const email = fbUser.email.trim().toLowerCase();
  if (email === 'darshan99806@gmail.com') {
    return fbUser.emailVerified === true;
  }
  return VERIFIED_ADMIN_EMAILS.has(email);
}

export function sanitizePublicUsername(raw: string | undefined | null, fallbackUid: string): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 22);
  if (cleaned.length < 2 || isReservedAdminHandle(cleaned)) {
    return `artist_${fallbackUid.slice(0, 6).toLowerCase()}`;
  }
  return cleaned;
}

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
  const isAdminUser = isVerifiedFirebaseAdminUser(fbUser);

  let snap = null;
  try {
    snap = await get(userRef);
  } catch {
    snap = null;
  }

  const now = Date.now();
  if (snap && snap.exists()) {
    const data = snap.val();
    let nextCooldownAt = 0;
    if (!isAdminUser) {
      try {
        const cdSnap = await get(ref(db, `cooldowns/${fbUser.uid}`));
        nextCooldownAt = cdSnap.exists() ? Number(cdSnap.val()?.nextCooldownAt || 0) : 0;
      } catch {
        nextCooldownAt = 0;
      }
    }

    const isAppointedAdmin = Boolean(data.isAdmin === true);
    const hasAdminStatus = isAdminUser || isAppointedAdmin;

    const safeUsername = isAdminUser
      ? RESERVED_ADMIN_USERNAME
      : sanitizePublicUsername(data.username || fbUser.displayName, fbUser.uid);

    return {
      id: fbUser.uid,
      username: safeUsername,
      displayName: isAdminUser
        ? data.displayName || 'ZERO_SUS · Lead Developer & Admin'
        : data.displayName || safeUsername,
      avatarEmoji: isAdminUser ? data.avatarEmoji || '👑' : data.avatarEmoji || '👾',
      avatarColor: data.avatarColor || '#6B3DFF',
      avatarUrl: data.avatarUrl || fbUser.photoURL || undefined,
      country: data.country || undefined,
      bio: isAdminUser
        ? data.bio || 'Creator & Lead Developer of Dotwall 1000×1000.'
        : data.bio || 'Collaborating on the 1,000,000-pixel global wall.',
      pixelsPlaced: Number(data.pixelsPlaced || 0),
      tasksCompleted: Number(data.tasksCompleted || 0),
      points: Number(data.points || 50),
      lastPixelAt: Number(data.lastPixelAt || 0),
      nextCooldownAt: hasAdminStatus ? 0 : nextCooldownAt,
      joinedAt: Number(data.joinedAt || now),
      achievements: Array.isArray(data.achievements) ? data.achievements : [],
      ...(hasAdminStatus ? { isAdmin: true } : {}),
    };
  }

  const rawName =
    overrides?.username ||
    fbUser.displayName ||
    fbUser.email?.split('@')[0] ||
    `artist_${fbUser.uid.slice(0, 6)}`;

  const cleanUsername = isAdminUser
    ? RESERVED_ADMIN_USERNAME
    : sanitizePublicUsername(rawName, fbUser.uid);

  const newProfile: PlayerProfile = {
    id: fbUser.uid,
    username: cleanUsername,
    displayName: isAdminUser
      ? 'ZERO_SUS · Lead Developer & Admin'
      : overrides?.displayName || fbUser.displayName || cleanUsername,
    avatarEmoji: isAdminUser
      ? '👑'
      : overrides?.avatarEmoji || AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)],
    avatarColor: isAdminUser
      ? '#6B3DFF'
      : overrides?.avatarColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    avatarUrl: fbUser.photoURL || undefined,
    country: 'India',
    bio: isAdminUser
      ? 'Creator & Lead Developer of Dotwall 1000×1000.'
      : 'Collaborating on the 1,000,000-pixel global Dotwall.',
    pixelsPlaced: 0,
    tasksCompleted: 0,
    points: 50,
    lastPixelAt: 0,
    nextCooldownAt: 0,
    joinedAt: now,
    achievements: [],
    ...(isAdminUser ? { isAdmin: true } : {}),
  };

  try {
    const dbPayload: Record<string, any> = {
      id: newProfile.id,
      username: newProfile.username,
      displayName: newProfile.displayName,
      avatarEmoji: newProfile.avatarEmoji,
      avatarColor: newProfile.avatarColor,
      bio: newProfile.bio,
      pixelsPlaced: 0,
      tasksCompleted: 0,
      points: 50,
      joinedAt: now,
      lastPixelAt: 0,
      nextCooldownAt: 0,
      achievements: [],
      updatedAt: serverTimestamp(),
    };
    if (newProfile.avatarUrl) {
      dbPayload.avatarUrl = newProfile.avatarUrl;
    }
    if (newProfile.country) {
      dbPayload.country = newProfile.country;
    }
    if (isAdminUser) {
      dbPayload.isAdmin = true;
    }
    await set(userRef, dbPayload);
  } catch {
    // Return verified profile even if RTDB rules are still initializing
  }

  return newProfile;
}

export async function registerWithEmail(params: {
  email: string;
  password: string;
  username: string;
  avatarEmoji?: string;
  avatarColor?: string;
  isAutoBootstrap?: boolean;
}): Promise<PlayerProfile> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (
    isReservedAdminHandle(params.username) ||
    isReservedAdminHandle(cleanEmail.split('@')[0]) ||
    VERIFIED_ADMIN_EMAILS.has(cleanEmail)
  ) {
    throw new Error(
      'The @zero_sus administrator account is reserved and cannot be registered publicly.'
    );
  }
  if (!params.password || params.password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, params.password);
  const cleanName = sanitizePublicUsername(params.username, cred.user.uid);
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

export async function loginWithEmail(emailOrUsername: string, password: string): Promise<PlayerProfile> {
  const raw = emailOrUsername.trim();
  const cleanedHandle = raw.replace(/^@+/, '').toLowerCase();
  const targetEmail =
    cleanedHandle === RESERVED_ADMIN_USERNAME
      ? 'zero_sus@dotwall.app'
      : raw.includes('@')
        ? raw.toLowerCase()
        : `${cleanedHandle}@dotwall.app`;

  if (!password || password.length < 6) {
    throw new Error('Please enter a valid password (minimum 6 characters).');
  }

  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, targetEmail, password);
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

export async function changeUserPassword(newPassword: string): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No user is currently signed in to change password.');
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }
  await updatePassword(user, newPassword);
}

export async function logoutFirebaseUser(): Promise<void> {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export { onAuthStateChanged, update };
