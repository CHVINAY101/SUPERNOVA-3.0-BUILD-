import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ''
).trim();

const isValidHttpUrl = (val: unknown): val is string => {
  if (typeof val !== 'string' || !val.trim()) return false;
  try {
    const parsed = new URL(val);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !val.includes('placeholder') &&
      !val.includes('your-project')
    );
  } catch {
    return false;
  }
};

const isKeyValid = (key: unknown): key is string => {
  return typeof key === 'string' && key.trim().length > 10 && !key.includes('placeholder');
};

const isUrlConfigured = isValidHttpUrl(rawUrl);
const isKeyConfigured = isKeyValid(rawKey);

if (!isUrlConfigured || !isKeyConfigured) {
  console.warn(
    'Supabase configuration missing or malformed. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export function checkSupabaseClientConfig(): {
  isValid: boolean;
  url: string | null;
  hasKey: boolean;
  warning?: string;
} {
  const isUrlValid = isValidHttpUrl(rawUrl);
  const isKeyValid = typeof rawKey === 'string' && rawKey.trim().length > 10 && !rawKey.includes('placeholder');

  if (!isUrlValid || !isKeyValid) {
    const missing = [];
    if (!isUrlValid) missing.push(!rawUrl ? 'VITE_SUPABASE_URL is missing' : 'VITE_SUPABASE_URL is invalid/placeholder');
    if (!isKeyValid) missing.push(!rawKey ? 'VITE_SUPABASE_ANON_KEY is missing' : 'VITE_SUPABASE_ANON_KEY is invalid/placeholder');

    const warning = `[Supernova Supabase Client Warning] Configuration is incomplete before render: ${missing.join(', ')}. Live authentication may fail.`;
    return {
      isValid: false,
      url: rawUrl || null,
      hasKey: Boolean(rawKey),
      warning,
    };
  }

  return {
    isValid: true,
    url: rawUrl,
    hasKey: true,
  };
}

// Safely provide the client when configured; do not initialize with placeholder URLs or demo config
const createUnconfiguredClient = (): SupabaseClient => {
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === 'auth') {
        return {
          getSession: async () => ({
            data: { session: null },
            error: new Error('Supabase configuration incomplete. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.'),
          }),
          signInWithPassword: async () => ({
            data: { user: null, session: null },
            error: new Error('Supabase client is not configured with valid credentials. Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'),
          }),
          signUp: async () => ({
            data: { user: null, session: null },
            error: new Error('Supabase client is not configured with valid credentials.'),
          }),
          signOut: async () => ({ error: null }),
          onAuthStateChange: () => ({
            data: { subscription: { unsubscribe: () => {} } },
          }),
          resetPasswordForEmail: async () => ({
            data: null,
            error: new Error('Supabase client is not configured with valid credentials.'),
          }),
        };
      }
      if (prop === 'from') {
        return () => ({
          select: () => ({
            eq: () => ({ limit: async () => ({ data: [], error: new Error('Supabase client is not configured.') }) }),
            limit: async () => ({ data: [], error: new Error('Supabase client is not configured.') }),
          }),
        });
      }
      if (prop === 'rpc') {
        return async () => ({ data: null, error: new Error('Supabase client is not configured.') });
      }
      return undefined;
    },
  };
  return new Proxy({}, handler) as unknown as SupabaseClient;
};

export const supabase: SupabaseClient = (isUrlConfigured && isKeyConfigured)
  ? createClient(rawUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : createUnconfiguredClient();

