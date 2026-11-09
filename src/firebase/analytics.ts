import { getAnalytics, isSupported, logEvent, type Analytics } from 'firebase/analytics';
import { getFirebaseApp } from './app';

let analyticsInstance: Analytics | null = null;

export async function initDotwallAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null;
  if (analyticsInstance) return analyticsInstance;

  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(getFirebaseApp());
      return analyticsInstance;
    }
  } catch {
    // Analytics blocked by browser adblocker or environment; fail gracefully
  }
  return null;
}

export function trackGameEvent(eventName: string, params?: Record<string, unknown>) {
  if (!analyticsInstance) return;
  try {
    logEvent(analyticsInstance, eventName, params);
  } catch {
    // Ignore analytics errors
  }
}
