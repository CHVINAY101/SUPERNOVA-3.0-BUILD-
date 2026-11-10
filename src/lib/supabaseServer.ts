/**
 * Supabase Server Integration Helper
 * Powered by @supabase/server
 * Handles backend authentication, token verification, and server-side Supabase client initialization.
 */

import { withSupabase, fromSupabaseUrl } from "@supabase/server";

declare const process: {
  env: Record<string, string | undefined>;
};

export const serverConfig = {
  url:
    (typeof process !== "undefined" && process.env?.SUPABASE_URL) ||
    "https://cirreovughlncadrbvcn.supabase.co",
  publishableKey:
    (typeof process !== "undefined" && process.env?.SUPABASE_PUBLISHABLE_KEY) ||
    "sb_publishable_V0xjxKVIapydIaIz93PC3Q_qd5poUqd",
  secretKey:
    (typeof process !== "undefined" && process.env?.SUPABASE_SECRET_KEY) ||
    "",
  jwksUrl:
    (typeof process !== "undefined" && process.env?.SUPABASE_JWKS_URL) ||
    "https://cirreovughlncadrbvcn.supabase.co/auth/v1/.well-known/jwks.json",
};

export { withSupabase, fromSupabaseUrl };
