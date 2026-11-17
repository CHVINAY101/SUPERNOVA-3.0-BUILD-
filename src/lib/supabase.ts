/**
 * Supernova 3.0 — Live Supabase Client Bridge
 * Re-exports the single shared Supabase client from @/utils/supabase.
 * Configured directly with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
 * (with VITE_SUPABASE_ANON_KEY as legacy fallback).
 * Mock mode is disabled; all operations execute against live Supabase.
 */
import {
  supabase,
  checkSupabaseClientConfig,
  getSupabaseClientConfig,
} from "@/utils/supabase";

export { supabase, checkSupabaseClientConfig, getSupabaseClientConfig };

const config = getSupabaseClientConfig();

export const isConfigured = config.isValid;
export const isMockAllowed = false;
export const isMockMode = false;
export const isMisconfigured = !isConfigured;

export function getSupabaseConnectionInfo() {
  const { url, key, isUrlValid, isKeyValid } = config;
  const keyType = key?.startsWith("sb_publishable_")
    ? "publishable"
    : key?.startsWith("ey")
    ? "anon_jwt"
    : key
    ? "custom"
    : "none";

  const diagnostic = isConfigured
    ? `Connected to live Supabase project (${url}) via ${keyType} key`
    : `Missing configuration: ${
        !url
          ? "VITE_SUPABASE_URL is missing"
          : !isUrlValid
          ? "VITE_SUPABASE_URL contains invalid or placeholder value"
          : !key
          ? "VITE_SUPABASE_PUBLISHABLE_KEY (or legacy VITE_SUPABASE_ANON_KEY) is missing"
          : !isKeyValid
          ? "VITE_SUPABASE_PUBLISHABLE_KEY contains invalid or placeholder value"
          : "Configuration incomplete"
      }`;

  return {
    isConfigured,
    isMockMode: false,
    url: url || null,
    hasAnonKey: Boolean(key),
    keyType,
    diagnostic,
  };
}

export async function pingSupabaseAuth(): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
  statusCode?: number;
}> {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const cfg = getSupabaseClientConfig();
  const statusCheck = checkSupabaseClientConfig();

  if (!cfg.isValid || !statusCheck.isValid) {
    return {
      ok: false,
      message: statusCheck.warning || "Supabase configuration is incomplete.",
      latencyMs: 0,
    };
  }

  try {
    const response = await fetch(`${cfg.url}/auth/v1/settings`, {
      method: "GET",
      headers: {
        apikey: cfg.key,
      },
    });
    const sessionRes = await supabase.auth.getSession();
    const latency = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - start
    );

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        latencyMs: latency,
        message: `Supabase Auth endpoint returned HTTP ${response.status}. Verify VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.`,
      };
    }

    if (sessionRes.error) {
      return {
        ok: false,
        statusCode: response.status,
        latencyMs: latency,
        message: `Auth endpoint responded (HTTP ${response.status}), but session check returned: ${sessionRes.error.message}`,
      };
    }

    return {
      ok: true,
      statusCode: response.status,
      latencyMs: latency,
      message: `Auth endpoint reachable (${latency}ms, HTTP ${response.status}). Live Supabase connection is active.`,
    };
  } catch (err: any) {
    const latency = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - start
    );
    return {
      ok: false,
      latencyMs: latency,
      message: `Network ping failed: ${err?.message || "Supabase Auth server unreachable"}`,
    };
  }
}
