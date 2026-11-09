import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'dotwall_supabase_url';
const STORAGE_KEY_ANON = 'dotwall_supabase_anon_key';

export function getSupabaseConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  const storedUrl = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY_URL) : null;
  const storedKey = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY_ANON) : null;

  const url = (storedUrl || envUrl || '').trim();
  const anonKey = (storedKey || envKey || '').trim();

  const isConfigured =
    Boolean(url && anonKey) &&
    url.startsWith('http') &&
    !url.includes('your-project-id.supabase.co') &&
    anonKey !== 'your-public-anon-key-here';

  return { url, anonKey, isConfigured };
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  const sig = `${url}::${anonKey}`;
  if (cachedClient && cachedSignature === sig) {
    return cachedClient;
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  });
  cachedSignature = sig;
  return cachedClient;
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string) {
  if (typeof window === 'undefined') return;
  if (url.trim() && anonKey.trim()) {
    window.localStorage.setItem(STORAGE_KEY_URL, url.trim());
    window.localStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
  } else {
    window.localStorage.removeItem(STORAGE_KEY_URL);
    window.localStorage.removeItem(STORAGE_KEY_ANON);
  }
  cachedClient = null;
  cachedSignature = '';
}
