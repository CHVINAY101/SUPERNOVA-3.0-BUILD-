-- ==============================================================================
-- SUPERNOVA 3.0 — FOREIGN-KEY INDEX OPTIMIZATION MIGRATION
-- Migration Version: 20261115000000_fk_index_optimization.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
--
-- IMPORTANT NOTE ON `CREATE INDEX CONCURRENTLY` & SUPABASE CLI:
--   Supabase CLI (`supabase db push`) executes files under `supabase/migrations/`
--   inside a transaction block (`BEGIN ... COMMIT`). PostgreSQL forbids
--   `CREATE INDEX CONCURRENTLY` inside a transaction block (SQLSTATE 25001).
--
--   For ZERO write locks on live production tables:
--     1. Run `supabase/scripts/20261115_fk_indexes_concurrent.sql` first outside
--        a transaction (via `psql` or Supabase SQL Editor statement-by-statement).
--     2. This migration uses `CREATE INDEX IF NOT EXISTS`, so running `supabase db push`
--        afterward safely no-ops for indexes already created concurrently, OR creates
--        any missing indexes cleanly when applied via the migration runner.
--
--   Zero existing tables, columns, foreign keys, RLS policies, or rows are altered.
--   No existing indexes are dropped here.
-- ==============================================================================

-- 1. public.announcements(author_id) -> announcements_author_id_fkey
CREATE INDEX IF NOT EXISTS idx_announcements_author_id
  ON public.announcements USING btree (author_id);

-- 2. public.check_ins(checked_in_by) -> check_ins_checked_in_by_fkey
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_in_by
  ON public.check_ins USING btree (checked_in_by);

-- 3. public.check_ins(player_id) -> check_ins_player_id_fkey
CREATE INDEX IF NOT EXISTS idx_check_ins_player_id
  ON public.check_ins USING btree (player_id);

-- 4. public.event_settings(updated_by) -> event_settings_updated_by_fkey
CREATE INDEX IF NOT EXISTS idx_event_settings_updated_by
  ON public.event_settings USING btree (updated_by);

-- 5. public.matches(team_a_id) -> matches_team_a_id_fkey
CREATE INDEX IF NOT EXISTS idx_matches_team_a_id
  ON public.matches USING btree (team_a_id);

-- 6. public.matches(team_b_id) -> matches_team_b_id_fkey
CREATE INDEX IF NOT EXISTS idx_matches_team_b_id
  ON public.matches USING btree (team_b_id);

-- 7. public.matches(winner_id) -> matches_winner_id_fkey
CREATE INDEX IF NOT EXISTS idx_matches_winner_id
  ON public.matches USING btree (winner_id);

-- 8. public.registration_controls(updated_by) -> registration_controls_updated_by_fkey
CREATE INDEX IF NOT EXISTS idx_registration_controls_updated_by
  ON public.registration_controls USING btree (updated_by);

-- 9. public.site_content(updated_by) -> site_content_updated_by_fkey
CREATE INDEX IF NOT EXISTS idx_site_content_updated_by
  ON public.site_content USING btree (updated_by);

-- Update planner statistics
ANALYZE public.announcements;
ANALYZE public.check_ins;
ANALYZE public.event_settings;
ANALYZE public.matches;
ANALYZE public.registration_controls;
ANALYZE public.site_content;
