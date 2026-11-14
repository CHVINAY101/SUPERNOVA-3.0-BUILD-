-- ==============================================================================
-- ROLLBACK MIGRATION: 20261114000001_rollback_entry_esports_ops.sql
-- Safely reverses 20261114000000 objects when needed without breaking base CRM.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb);
DROP FUNCTION IF EXISTS public.perform_event_checkin(text, text, text, uuid, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.is_match_conductor();
DROP FUNCTION IF EXISTS public.is_entry_staff();

DROP TABLE IF EXISTS public.match_disputes;
DROP TABLE IF EXISTS public.match_attendance;
DROP TABLE IF EXISTS public.tournaments CASCADE;
DROP TABLE IF EXISTS public.team_status_history;
DROP TABLE IF EXISTS public.wristband_issuances;
DROP TABLE IF EXISTS public.wristband_categories;

DROP INDEX IF EXISTS public.idx_check_ins_unique_daily_entry;
DROP INDEX IF EXISTS public.idx_check_ins_ticket_ref;
DROP INDEX IF EXISTS public.idx_check_ins_event_day;
DROP INDEX IF EXISTS public.idx_matches_tournament_id;
DROP INDEX IF EXISTS public.idx_matches_conductor_id;
