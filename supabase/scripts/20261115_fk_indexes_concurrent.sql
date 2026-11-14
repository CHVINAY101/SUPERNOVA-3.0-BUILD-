-- ==============================================================================
-- SUPERNOVA 3.0 — PRODUCTION LOCK-FREE FK INDEX OPTIMIZATION (CONCURRENTLY)
-- Target Project: https://cirreovughlncadrbvcn.supabase.co
--
-- EXECUTION REQUIREMENTS (CRITICAL):
--   `CREATE INDEX CONCURRENTLY` CANNOT run inside a transaction block
--   (SQLSTATE 25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block).
--
--   How to execute safely in production:
--     Option A (Recommended): Run via psql with autocommit enabled (default):
--       psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/20261115_fk_indexes_concurrent.sql
--     Option B: Run statement-by-statement in Supabase Dashboard -> SQL Editor
--       (do NOT wrap in BEGIN / COMMIT).
--
--   After running this script, subsequent `supabase db push` runs of
--   `20261115000000_fk_index_optimization.sql` will safely no-op via `IF NOT EXISTS`.
-- ==============================================================================

-- 1. announcements_author_id_fkey -> public.announcements(author_id uuid)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_announcements_author_id
  ON public.announcements USING btree (author_id);

-- 2. check_ins_checked_in_by_fkey -> public.check_ins(checked_in_by uuid)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_check_ins_checked_in_by
  ON public.check_ins USING btree (checked_in_by);

-- 3. check_ins_player_id_fkey -> public.check_ins(player_id uuid)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_check_ins_player_id
  ON public.check_ins USING btree (player_id);

-- 4. event_settings_updated_by_fkey -> public.event_settings(updated_by uuid)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_settings_updated_by
  ON public.event_settings USING btree (updated_by);

-- 5. matches_team_a_id_fkey -> public.matches(team_a_id uuid)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matches_team_a_id
  ON public.matches USING btree (team_a_id);

-- 6. matches_team_b_id_fkey -> public.matches(team_b_id uuid)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matches_team_b_id
  ON public.matches USING btree (team_b_id);

-- 7. matches_winner_id_fkey -> public.matches(winner_id uuid)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matches_winner_id
  ON public.matches USING btree (winner_id);

-- 8. registration_controls_updated_by_fkey -> public.registration_controls(updated_by uuid)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_registration_controls_updated_by
  ON public.registration_controls USING btree (updated_by);

-- 9. site_content_updated_by_fkey -> public.site_content(updated_by uuid)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_site_content_updated_by
  ON public.site_content USING btree (updated_by);

-- Refresh planner statistics on the 6 affected tables
ANALYZE public.announcements;
ANALYZE public.check_ins;
ANALYZE public.event_settings;
ANALYZE public.matches;
ANALYZE public.registration_controls;
ANALYZE public.site_content;

-- ==============================================================================
-- POST-CREATION VERIFICATION
-- Confirm all 9 indexes exist, are valid (indisvalid = true), ready, and cover
-- all 9 target FK constraints cleanly.
-- ==============================================================================
SELECT
  pi.tablename,
  pi.indexname,
  i.indisvalid,
  i.indisready,
  pg_size_pretty(pg_relation_size(ic.oid)) AS index_size,
  pi.indexdef
FROM pg_indexes pi
JOIN pg_namespace n ON n.nspname = pi.schemaname
JOIN pg_class ic ON ic.relname = pi.indexname AND ic.relnamespace = n.oid
JOIN pg_index i ON i.indexrelid = ic.oid
WHERE pi.schemaname = 'public'
  AND pi.indexname IN (
    'idx_announcements_author_id',
    'idx_check_ins_checked_in_by',
    'idx_check_ins_player_id',
    'idx_event_settings_updated_by',
    'idx_matches_team_a_id',
    'idx_matches_team_b_id',
    'idx_matches_winner_id',
    'idx_registration_controls_updated_by',
    'idx_site_content_updated_by'
  )
ORDER BY pi.tablename, pi.indexname;
