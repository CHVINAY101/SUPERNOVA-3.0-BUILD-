import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);
