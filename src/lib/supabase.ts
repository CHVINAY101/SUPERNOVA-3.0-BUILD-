import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supernova 3.0 — Live Supabase Production Client
 * 
 * Target: https://cirreovughlncadrbvcn.supabase.co
 * Strict Production Mode: Demo-mode in-memory stubs are completely removed.
 * In production, queries directly hit live Supabase PostgreSQL.
 * If credentials are not configured, queries fail explicitly instead of silently serving mock data.
 */

const rawSupabaseUrl = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.SUPABASE_URL as string | undefined)
)?.trim();

const rawSupabaseAnonKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.SUPABASE_PUBLISHABLE_KEY as string | undefined)
)?.trim();

function normalizeSupabaseUrl(url?: string): string | undefined {
  if (!url) return undefined;
  let clean = url.trim().replace(/\/+$/, "");
  // Strip /rest/v1 if inadvertently included in environment URL
  clean = clean.replace(/\/rest\/v1\/?$/i, "");
  return clean;
}

const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
const supabaseAnonKey = rawSupabaseAnonKey;

export const isConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith("http") &&
  !supabaseUrl.includes("your-project")
);

// Demo mode is permanently disabled in production
export const isMockMode = false;
export const isMockAllowed = false;
export const isMisconfigured = !isConfigured;

export function getSupabaseConnectionInfo() {
  return {
    isConfigured,
    isMockMode: false,
    url: supabaseUrl || null,
    hasAnonKey: Boolean(supabaseAnonKey),
  };
}

/**
 * Creates an unconfigured error client that explicitly rejects queries
 * with an informative error instead of silently returning mock data.
 */
function createUnconfiguredClient(): SupabaseClient {
  const errMsg = "Supabase connection error: Missing or invalid VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Demo mode is disabled.";
  
  const queryBuilder: any = {
    select: () => queryBuilder,
    insert: () => queryBuilder,
    update: () => queryBuilder,
    delete: () => queryBuilder,
    upsert: () => queryBuilder,
    eq: () => queryBuilder,
    neq: () => queryBuilder,
    gt: () => queryBuilder,
    gte: () => queryBuilder,
    lt: () => queryBuilder,
    lte: () => queryBuilder,
    like: () => queryBuilder,
    ilike: () => queryBuilder,
    is: () => queryBuilder,
    in: () => queryBuilder,
    contains: () => queryBuilder,
    order: () => queryBuilder,
    limit: () => queryBuilder,
    range: () => queryBuilder,
    single: async () => ({ data: null, error: { message: errMsg, code: "PGRST_NOT_CONFIGURED" } }),
    maybeSingle: async () => ({ data: null, error: { message: errMsg, code: "PGRST_NOT_CONFIGURED" } }),
    then: (resolve: (val: any) => void) => {
      resolve({ data: null, error: { message: errMsg, code: "PGRST_NOT_CONFIGURED" } });
    },
  };

  return {
    from: () => queryBuilder,
    rpc: async () => ({ data: null, error: { message: errMsg, code: "PGRST_NOT_CONFIGURED" } }),
    auth: {
      getSession: async () => ({ data: { session: null }, error: { message: errMsg } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: errMsg } }),
      signOut: async () => ({ error: null }),
      signUp: async () => ({ data: { user: null, session: null }, error: { message: errMsg } }),
      resetPasswordForEmail: async () => ({ data: null, error: { message: errMsg } }),
    },
    channel: (name: string) => {
      const channelObj: any = {
        name,
        on: () => channelObj,
        subscribe: (cb?: (status: string) => void) => {
          if (cb) setTimeout(() => cb("CHANNEL_ERROR"), 0);
          return channelObj;
        },
        unsubscribe: () => Promise.resolve("ok"),
      };
      return channelObj;
    },
    removeChannel: () => Promise.resolve("ok"),
    getChannels: () => [],
    storage: {
      from: () => ({
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
        upload: async () => ({ data: null, error: { message: errMsg } }),
        remove: async () => ({ data: null, error: { message: errMsg } }),
      }),
    },
  } as unknown as SupabaseClient;
}

function initSupabase(): SupabaseClient {
  if (!isConfigured) {
    console.error("[Supernova 3.0] Supabase credentials not found or invalid in environment. Demo mode is disabled in production.");
    return createUnconfiguredClient();
  }

  // Real production Supabase Client — direct connection to live Postgres database
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

export const supabase: SupabaseClient = initSupabase();
