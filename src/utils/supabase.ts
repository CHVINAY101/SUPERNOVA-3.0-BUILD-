/**
 * Supabase Client Export for Supernova 3.0
 * Re-exports the configured client and utilities from @/lib/supabase
 * Supports both VITE_SUPABASE_PUBLISHABLE_KEY and legacy VITE_SUPABASE_ANON_KEY.
 */

export {
  supabase,
  isConfigured,
  isMockAllowed,
  isMockMode,
  isMisconfigured,
  getSupabaseConnectionInfo,
} from "@/lib/supabase";

export default undefined;
