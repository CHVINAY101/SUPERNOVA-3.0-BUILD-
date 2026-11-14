-- ==============================================================================
-- SUPERNOVA 3.0 — ROLLBACK SCRIPT FOR FK INDEX OPTIMIZATION
-- Target Project: https://cirreovughlncadrbvcn.supabase.co
-- Purpose:
--   Safely removes ONLY the 9 foreign-key indexes introduced by
--   20261115_fk_indexes_concurrent.sql / 20261115000000_fk_index_optimization.sql.
--   Run outside a transaction block (psql autocommit or SQL Editor one-by-one).
-- ==============================================================================

DROP INDEX CONCURRENTLY IF EXISTS public.idx_announcements_author_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_check_ins_checked_in_by;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_check_ins_player_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_event_settings_updated_by;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_matches_team_a_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_matches_team_b_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_matches_winner_id;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_registration_controls_updated_by;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_site_content_updated_by;
