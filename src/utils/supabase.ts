import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

const isValidHttpUrl = (val: unknown): val is string => {
  if (typeof val !== 'string' || !val.trim()) return false;
  try {
    const parsed = new URL(val);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const supabaseUrl = isValidHttpUrl(rawUrl) ? rawUrl : 'https://placeholder.supabase.co';
const supabaseKey = typeof rawKey === 'string' && rawKey.trim() ? rawKey : 'placeholder-anon-key';

if (!isValidHttpUrl(rawUrl) || !rawKey) {
  console.warn(
    'Supabase configuration missing or malformed. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

export function checkSupabaseClientConfig(): {
  isValid: boolean;
  url: string | null;
  hasKey: boolean;
  warning?: string;
} {
  const isUrlValid = isValidHttpUrl(rawUrl) && !rawUrl.includes('placeholder') && !rawUrl.includes('your-project');
  const isKeyValid = typeof rawKey === 'string' && rawKey.trim().length > 10 && !rawKey.includes('placeholder');

  if (!isUrlValid || !isKeyValid) {
    const missing = [];
    if (!isUrlValid) missing.push(!rawUrl ? 'VITE_SUPABASE_URL is missing' : 'VITE_SUPABASE_URL is invalid/placeholder');
    if (!isKeyValid) missing.push(!rawKey ? 'VITE_SUPABASE_PUBLISHABLE_KEY is missing' : 'VITE_SUPABASE_PUBLISHABLE_KEY is invalid/placeholder');

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

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
