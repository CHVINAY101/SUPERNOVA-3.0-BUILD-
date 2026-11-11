/**
 * Supernova 3.0 — Live Supabase Client Bridge
 * Re-exports the single shared Supabase client from @/utils/supabase.
 * Configured directly with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
 * Mock mode is disabled; all operations execute against live Supabase.
 */
import { supabase, checkSupabaseClientConfig } from "@/utils/supabase";

export { supabase, checkSupabaseClientConfig };

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.startsWith("http") &&
  !supabaseUrl.includes("your-project")
);

export const isMockAllowed = false;
export const isMockMode = false;
export const isMisconfigured = !isConfigured;

export function getSupabaseConnectionInfo() {
  const keyType = supabaseKey?.startsWith("sb_publishable_")
    ? "publishable"
    : supabaseKey?.startsWith("ey")
    ? "anon_jwt"
    : supabaseKey
    ? "custom"
    : "none";

  const diagnostic = isConfigured
    ? `Connected to live Supabase project (${supabaseUrl}) via ${keyType} key`
    : `Missing configuration: ${
        !supabaseUrl
          ? "VITE_SUPABASE_URL is missing"
          : supabaseUrl.includes("your-project")
          ? "VITE_SUPABASE_URL contains placeholder value"
          : "VITE_SUPABASE_PUBLISHABLE_KEY is missing"
      }`;

  return {
    isConfigured,
    isMockMode: false,
    url: supabaseUrl || null,
    hasAnonKey: Boolean(supabaseKey),
    keyType,
    diagnostic,
  };
}
