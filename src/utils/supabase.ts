import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
const legacyAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const rawKey = publishableKey || legacyAnonKey;

const PLACEHOLDER_RE = /(?:placeholder|your-project|your-key|your-anon-key|your-publishable-key|example\.supabase\.co|<|>)/i;

export const isValidHttpUrl = (val: unknown): val is string => {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  if (!trimmed || PLACEHOLDER_RE.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
};

export const isValidSupabaseKey = (key: unknown): key is string => {
  if (typeof key !== "string") return false;
  const trimmed = key.trim();
  if (!trimmed || trimmed.length < 20 || PLACEHOLDER_RE.test(trimmed)) return false;
  if (trimmed.startsWith("sb_secret_")) return false;
  if (trimmed.startsWith("sb_publishable_")) {
    return /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(trimmed);
  }
  if (trimmed.startsWith("eyJ")) {
    return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed);
  }
  return trimmed.length >= 24;
};

const normalizedUrl = rawUrl.replace(/\/+$/, "");
const isUrlConfigured = isValidHttpUrl(normalizedUrl);
const isKeyConfigured = isValidSupabaseKey(rawKey);

if (!isUrlConfigured || !isKeyConfigured) {
  console.warn(
    "Supabase configuration missing or malformed. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or legacy VITE_SUPABASE_ANON_KEY)."
  );
}

export function getSupabaseClientConfig(): {
  url: string;
  key: string;
  keySource: "VITE_SUPABASE_PUBLISHABLE_KEY" | "VITE_SUPABASE_ANON_KEY" | "none";
  isUrlValid: boolean;
  isKeyValid: boolean;
  isValid: boolean;
} {
  return {
    url: normalizedUrl,
    key: rawKey,
    keySource: publishableKey
      ? "VITE_SUPABASE_PUBLISHABLE_KEY"
      : legacyAnonKey
      ? "VITE_SUPABASE_ANON_KEY"
      : "none",
    isUrlValid: isUrlConfigured,
    isKeyValid: isKeyConfigured,
    isValid: isUrlConfigured && isKeyConfigured,
  };
}

export function checkSupabaseClientConfig(): {
  isValid: boolean;
  url: string | null;
  hasKey: boolean;
  warning?: string;
} {
  if (!isUrlConfigured || !isKeyConfigured) {
    const missing: string[] = [];
    if (!isUrlConfigured) {
      missing.push(
        !rawUrl ? "VITE_SUPABASE_URL is missing" : "VITE_SUPABASE_URL is invalid/placeholder"
      );
    }
    if (!isKeyConfigured) {
      missing.push(
        !rawKey
          ? "VITE_SUPABASE_PUBLISHABLE_KEY (or fallback VITE_SUPABASE_ANON_KEY) is missing"
          : "VITE_SUPABASE_PUBLISHABLE_KEY is invalid/placeholder"
      );
    }

    const warning = `[Supernova Supabase Client Warning] Configuration is incomplete before render: ${missing.join(", ")}. Live authentication may fail.`;
    return {
      isValid: false,
      url: isUrlConfigured ? normalizedUrl : rawUrl || null,
      hasKey: Boolean(rawKey),
      warning,
    };
  }

  return {
    isValid: true,
    url: normalizedUrl,
    hasKey: true,
  };
}

// Safely provide the client when configured; do not initialize with placeholder URLs or demo config
const createUnconfiguredClient = (): SupabaseClient => {
  const missingMsg =
    "Supabase configuration incomplete. VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or legacy VITE_SUPABASE_ANON_KEY) are required.";
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === "auth") {
        return {
          getSession: async () => ({
            data: { session: null },
            error: new Error(missingMsg),
          }),
          refreshSession: async () => ({
            data: { session: null, user: null },
            error: new Error(missingMsg),
          }),
          signInWithPassword: async () => ({
            data: { user: null, session: null },
            error: new Error(missingMsg),
          }),
          signUp: async () => ({
            data: { user: null, session: null },
            error: new Error(missingMsg),
          }),
          signOut: async () => ({ error: null }),
          onAuthStateChange: () => ({
            data: { subscription: { unsubscribe: () => {} } },
          }),
          resetPasswordForEmail: async () => ({
            data: null,
            error: new Error(missingMsg),
          }),
        };
      }
      if (prop === "from") {
        return () => ({
          select: () => ({
            eq: () => ({
              limit: async () => ({ data: [], error: new Error("Supabase client is not configured.") }),
            }),
            limit: async () => ({ data: [], error: new Error("Supabase client is not configured.") }),
          }),
        });
      }
      if (prop === "rpc") {
        return async () => ({ data: null, error: new Error("Supabase client is not configured.") });
      }
      return undefined;
    },
  };
  return new Proxy({}, handler) as unknown as SupabaseClient;
};

export const supabase: SupabaseClient =
  isUrlConfigured && isKeyConfigured
    ? createClient(normalizedUrl, rawKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : createUnconfiguredClient();
