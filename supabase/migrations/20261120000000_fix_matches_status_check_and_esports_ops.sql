-- ==============================================================================
-- SUPERNOVA 3.0 — FIX MATCHES_STATUS_CHECK & REPAIR ESPORTS MATCH OPERATIONS SCHEMA
-- Migration: 20261120000000_fix_matches_status_check_and_esports_ops.sql
-- Target Project: https://cirreovughlncadrbvcn.supabase.co
-- Safe, Self-Contained & Idempotent:
--   1. Preserves all existing games, registrations, teams, players, brackets,
--      matches, and results.
--   2. Repairs missing esports tournament columns on public.games,
--      public.registrations, and public.matches (match_number, round_number,
--      station, conductor_id, conductor_email, match_format, bracket_side,
--      group_name, detailed_scores, result_status, next_match_id, etc.).
--   3. Safely normalizes any non-canonical legacy matches.status values without
--      touching valid existing statuses, drops legacy matches_status_check, and
--      recreates matches_status_check with ALL 10 canonical MatchStatus values:
--      ('upcoming', 'scheduled', 'check_in', 'ready', 'live',
--       'result_submitted', 'completed', 'disputed', 'postponed', 'cancelled').
--   4. Ensures public.tournaments, public.team_status_history,
--      public.match_attendance, public.match_disputes, and RPC
--      public.confirm_match_result_and_advance(...) exist.
--   5. Applies safe permission-scoped RLS policies that work cleanly both with
--      and without 20261113/20261114 RBAC helper functions.
--   6. Reloads PostgREST schema cache (NOTIFY pgrst, 'reload schema').
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Self-Contained Permission Helper (Works with OR without 20261113 RBAC)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._esports_has_perm(p_perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF to_regprocedure('public.has_crm_permission(text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.has_crm_permission($1)' INTO v_allowed USING p_perm;
    RETURN coalesce(v_allowed, false);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN ('super_admin', 'crm_admin', 'event_admin', 'esports_manager', 'score_operator')
  ) THEN
    RETURN true;
  END IF;

  IF p_perm LIKE 'conductor:%' AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role = 'match_conductor'
  ) THEN
    RETURN true;
  END IF;

  -- Legacy admin fallback when user_roles only has generic admin entries
  IF public.is_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN (
        'checkin_staff',
        'registration_staff',
        'esports_entry_staff',
        'participation_manager',
        'content_manager',
        'viewer',
        'match_conductor'
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public._esports_has_perm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._esports_has_perm(text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. Repair public.games & public.registrations Esports Operations Columns
-- ------------------------------------------------------------------------------
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS substitutes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_teams integer,
  ADD COLUMN IF NOT EXISTS match_format text NOT NULL DEFAULT 'single_elimination',
  ADD COLUMN IF NOT EXISTS scoring_mode text NOT NULL DEFAULT 'round_based',
  ADD COLUMN IF NOT EXISTS scoring_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS match_duration_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tournament_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS assigned_conductor_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS selection_status text NOT NULL DEFAULT 'awaiting_selection',
  ADD COLUMN IF NOT EXISTS selection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS seed_number integer,
  ADD COLUMN IF NOT EXISTS group_name text;

UPDATE public.registrations
SET selection_status = 'awaiting_selection'
WHERE selection_status IS NULL
   OR trim(selection_status) = ''
   OR selection_status NOT IN ('awaiting_selection', 'selected', 'not_selected', 'waitlisted', 'disqualified');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'registrations_selection_status_check'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_selection_status_check
      CHECK (selection_status IN ('awaiting_selection', 'selected', 'not_selected', 'waitlisted', 'disqualified'));
  END IF;
END $$;

-- Preserve existing registration statuses while allowing 'withdrawn'
DO $$
DECLARE
  v_con record;
BEGIN
  UPDATE public.registrations
  SET status = 'pending'
  WHERE status IS NULL
     OR status NOT IN ('pending', 'confirmed', 'declined', 'withdrawn', 'correction_requested');

  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.registrations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* '\mstatus\M'
      AND conname NOT ILIKE '%selection%'
      AND conname NOT ILIKE '%email%'
      AND conname NOT ILIKE '%check_in%'
  LOOP
    EXECUTE format('ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;

  ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_status_check;
  ALTER TABLE public.registrations
    ADD CONSTRAINT registrations_status_check
    CHECK (status IN ('pending', 'confirmed', 'declined', 'withdrawn', 'correction_requested'));
END $$;

-- ------------------------------------------------------------------------------
-- 3. Ensure Team Status History & Tournaments Tables Exist
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('registration_status', 'selection_status')),
  previous_value text,
  next_value text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_status_history_reg_id
  ON public.team_status_history (registration_id, created_at DESC);

ALTER TABLE public.team_status_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_status_history FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.team_status_history TO authenticated;
GRANT ALL ON public.team_status_history TO service_role;

DROP POLICY IF EXISTS "team_status_history_select" ON public.team_status_history;
CREATE POLICY "team_status_history_select"
ON public.team_status_history FOR SELECT
TO authenticated
USING (
  public._esports_has_perm('esports:view')
  OR public._esports_has_perm('tournament:select_teams')
  OR public._esports_has_perm('reports:view')
);

DROP POLICY IF EXISTS "team_status_history_insert" ON public.team_status_history;
CREATE POLICY "team_status_history_insert"
ON public.team_status_history FOR INSERT
TO authenticated
WITH CHECK (
  public._esports_has_perm('esports:edit')
  OR public._esports_has_perm('esports:approve')
  OR public._esports_has_perm('esports:reject')
  OR public._esports_has_perm('tournament:select_teams')
);

CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name text NOT NULL,
  format text NOT NULL DEFAULT 'single_elimination'
    CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin', 'group_knockout', 'custom')),
  scoring_mode text NOT NULL DEFAULT 'round_based'
    CHECK (scoring_mode IN ('round_based', 'battle_royale', 'group_points', 'custom')),
  scoring_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  seeding_mode text NOT NULL DEFAULT 'manual',
  require_manager_confirmation boolean NOT NULL DEFAULT true,
  has_started boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'published', 'in_progress', 'locked', 'completed')),
  is_structure_locked boolean NOT NULL DEFAULT false,
  allow_unselected_entry boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_game_id ON public.tournaments (game_id);

DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_tournaments_updated_at ON public.tournaments;
    CREATE TRIGGER trg_tournaments_updated_at
    BEFORE UPDATE ON public.tournaments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tournaments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;

DROP POLICY IF EXISTS "tournaments_select_rbac" ON public.tournaments;
CREATE POLICY "tournaments_select_rbac"
ON public.tournaments FOR SELECT
TO authenticated
USING (
  public._esports_has_perm('esports:view')
  OR public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('conductor:view_assigned')
);

DROP POLICY IF EXISTS "tournaments_write_rbac" ON public.tournaments;
CREATE POLICY "tournaments_write_rbac"
ON public.tournaments FOR ALL
TO authenticated
USING (
  public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('tournament:manage_games')
  OR public._esports_has_perm('esports:edit')
)
WITH CHECK (
  public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('tournament:manage_games')
  OR public._esports_has_perm('esports:edit')
);

-- ------------------------------------------------------------------------------
-- 4. Repair public.matches Columns & Canonical matches_status_check Constraint
-- ------------------------------------------------------------------------------
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS round_number integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS match_number integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS bracket_side text DEFAULT 'winners',
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS station text,
  ADD COLUMN IF NOT EXISTS conductor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conductor_email text,
  ADD COLUMN IF NOT EXISTS match_format text DEFAULT 'BO1',
  ADD COLUMN IF NOT EXISTS detailed_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS next_match_id uuid,
  ADD COLUMN IF NOT EXISTS next_match_slot text,
  ADD COLUMN IF NOT EXISTS loser_next_match_id uuid,
  ADD COLUMN IF NOT EXISTS loser_next_match_slot text,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS bracket_advanced_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

-- Preserve all valid existing match statuses; only normalize null/legacy aliases
UPDATE public.matches
SET status = CASE
  WHEN status IS NULL OR trim(status) = '' THEN 'upcoming'
  WHEN lower(trim(status)) IN (
    'upcoming', 'scheduled', 'check_in', 'ready', 'live',
    'result_submitted', 'completed', 'disputed', 'postponed', 'cancelled'
  ) THEN lower(trim(status))
  WHEN lower(trim(status)) IN ('in_progress', 'playing', 'ongoing') THEN 'live'
  WHEN lower(trim(status)) IN ('pending', 'draft', 'tbd') THEN 'upcoming'
  WHEN lower(trim(status)) IN ('finished', 'done', 'final') THEN 'completed'
  WHEN lower(trim(status)) IN ('canceled') THEN 'cancelled'
  ELSE 'upcoming'
END
WHERE status IS NULL
   OR status NOT IN (
     'upcoming', 'scheduled', 'check_in', 'ready', 'live',
     'result_submitted', 'completed', 'disputed', 'postponed', 'cancelled'
   );

-- Drop only status CHECK constraints (preserving score_a >= 0, score_b >= 0, result_status checks)
DO $$
DECLARE
  v_con record;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.matches'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* '\mstatus\M'
      AND conname NOT ILIKE '%result_status%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%result_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;

ALTER TABLE public.matches
  ALTER COLUMN status SET DEFAULT 'scheduled';

ALTER TABLE public.matches
  ADD CONSTRAINT matches_status_check
  CHECK (status IN (
    'upcoming',
    'scheduled',
    'check_in',
    'ready',
    'live',
    'result_submitted',
    'completed',
    'disputed',
    'postponed',
    'cancelled'
  ));

CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON public.matches (tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_conductor_id ON public.matches (conductor_id);
CREATE INDEX IF NOT EXISTS idx_matches_game_round_match ON public.matches (game_id, round_number, match_number);
CREATE INDEX IF NOT EXISTS idx_matches_team_a_id ON public.matches (team_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_team_b_id ON public.matches (team_b_id);
CREATE INDEX IF NOT EXISTS idx_matches_winner_id ON public.matches (winner_id);

-- Clean, deterministic RLS policies on public.matches
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;

DROP POLICY IF EXISTS "public_read_published_matches" ON public.matches;
DROP POLICY IF EXISTS "admin_read_all_matches" ON public.matches;
DROP POLICY IF EXISTS "score_operator_read_all_matches" ON public.matches;
DROP POLICY IF EXISTS "score_operator_insert_matches" ON public.matches;
DROP POLICY IF EXISTS "score_operator_update_matches" ON public.matches;
DROP POLICY IF EXISTS "score_operator_delete_matches" ON public.matches;
DROP POLICY IF EXISTS "matches_select_policy" ON public.matches;
DROP POLICY IF EXISTS "admin_insert_match" ON public.matches;
DROP POLICY IF EXISTS "admin_update_match" ON public.matches;
DROP POLICY IF EXISTS "admin_delete_match" ON public.matches;

CREATE POLICY "matches_select_policy"
ON public.matches FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR (
    auth.role() = 'authenticated'
    AND (
      public._esports_has_perm('esports:view')
      OR public._esports_has_perm('tournament:confirm_results')
      OR (public._esports_has_perm('conductor:view_assigned') AND conductor_id = (select auth.uid()))
    )
  )
);

CREATE POLICY "admin_insert_match"
ON public.matches FOR INSERT
TO authenticated
WITH CHECK (
  public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('esports:create')
  OR public._esports_has_perm('esports:edit')
);

CREATE POLICY "admin_update_match"
ON public.matches FOR UPDATE
TO authenticated
USING (
  public._esports_has_perm('esports:edit')
  OR public._esports_has_perm('tournament:assign_conductors')
  OR public._esports_has_perm('tournament:confirm_results')
  OR public._esports_has_perm('tournament:resolve_disputes')
  OR (public._esports_has_perm('conductor:submit_result') AND conductor_id = (select auth.uid()))
  OR (public._esports_has_perm('conductor:start_match') AND conductor_id = (select auth.uid()))
)
WITH CHECK (
  public._esports_has_perm('esports:edit')
  OR public._esports_has_perm('tournament:assign_conductors')
  OR public._esports_has_perm('tournament:confirm_results')
  OR public._esports_has_perm('tournament:resolve_disputes')
  OR (
    (public._esports_has_perm('conductor:submit_result') OR public._esports_has_perm('conductor:start_match'))
    AND conductor_id = (select auth.uid())
    AND status IN ('upcoming', 'scheduled', 'check_in', 'ready', 'live', 'result_submitted', 'disputed')
  )
);

CREATE POLICY "admin_delete_match"
ON public.matches FOR DELETE
TO authenticated
USING (
  public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('esports:edit')
);

-- ------------------------------------------------------------------------------
-- 5. Ensure Match Attendance & Match Disputes Tables Exist
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  present boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz DEFAULT now(),
  notes text,
  UNIQUE (match_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.match_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by_email text,
  reason text NOT NULL,
  original_submission jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved')),
  resolution_notes text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_attendance_match_id ON public.match_attendance (match_id);
CREATE INDEX IF NOT EXISTS idx_match_disputes_match_id ON public.match_disputes (match_id);

ALTER TABLE public.match_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_attendance FROM anon, PUBLIC;
REVOKE ALL ON public.match_disputes FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.match_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.match_disputes TO authenticated;
GRANT ALL ON public.match_attendance TO service_role;
GRANT ALL ON public.match_disputes TO service_role;

DROP POLICY IF EXISTS "match_attendance_select" ON public.match_attendance;
CREATE POLICY "match_attendance_select"
ON public.match_attendance FOR SELECT
TO authenticated
USING (
  public._esports_has_perm('esports:view')
  OR public._esports_has_perm('conductor:verify_roster')
);

DROP POLICY IF EXISTS "match_attendance_write" ON public.match_attendance;
CREATE POLICY "match_attendance_write"
ON public.match_attendance FOR ALL
TO authenticated
USING (
  public._esports_has_perm('esports:edit')
  OR (
    public._esports_has_perm('conductor:verify_roster')
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_attendance.match_id
        AND m.conductor_id = (select auth.uid())
    )
  )
)
WITH CHECK (
  public._esports_has_perm('esports:edit')
  OR (
    public._esports_has_perm('conductor:verify_roster')
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_attendance.match_id
        AND m.conductor_id = (select auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "match_disputes_select" ON public.match_disputes;
CREATE POLICY "match_disputes_select"
ON public.match_disputes FOR SELECT
TO authenticated
USING (
  public._esports_has_perm('tournament:resolve_disputes')
  OR public._esports_has_perm('esports:view')
  OR reported_by = (select auth.uid())
);

DROP POLICY IF EXISTS "match_disputes_insert" ON public.match_disputes;
CREATE POLICY "match_disputes_insert"
ON public.match_disputes FOR INSERT
TO authenticated
WITH CHECK (
  public._esports_has_perm('conductor:report_dispute')
  OR public._esports_has_perm('tournament:resolve_disputes')
  OR public._esports_has_perm('esports:edit')
);

DROP POLICY IF EXISTS "match_disputes_update" ON public.match_disputes;
CREATE POLICY "match_disputes_update"
ON public.match_disputes FOR UPDATE
TO authenticated
USING (
  public._esports_has_perm('tournament:resolve_disputes')
  OR public._esports_has_perm('esports:edit')
)
WITH CHECK (
  public._esports_has_perm('tournament:resolve_disputes')
  OR public._esports_has_perm('esports:edit')
);

-- ------------------------------------------------------------------------------
-- 6. Ensure Transactional Match Result Confirmation RPC Exists
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_match_result_and_advance(
  p_match_id uuid,
  p_winner_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_detailed_scores jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match record;
  v_loser_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL OR NOT (
    public._esports_has_perm('tournament:confirm_results')
    OR public._esports_has_perm('esports:edit')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: tournament:confirm_results permission required');
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Match not found');
  END IF;

  IF v_match.status = 'disputed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Match is disputed and frozen. Resolve dispute first.');
  END IF;

  IF v_match.bracket_advanced_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Double-advancement blocked: bracket progression already executed.');
  END IF;

  IF p_winner_id IS NULL OR (p_winner_id <> v_match.team_a_id AND p_winner_id <> v_match.team_b_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Winner must be one of the match teams.');
  END IF;

  v_loser_id := CASE WHEN p_winner_id = v_match.team_a_id THEN v_match.team_b_id ELSE v_match.team_a_id END;

  UPDATE public.matches
  SET
    score_a = greatest(0, coalesce(p_score_a, 0)),
    score_b = greatest(0, coalesce(p_score_b, 0)),
    detailed_scores = coalesce(p_detailed_scores, detailed_scores, '{}'::jsonb),
    winner_id = p_winner_id,
    status = 'completed',
    result_status = 'confirmed',
    confirmed_by = v_uid,
    confirmed_at = v_now,
    bracket_advanced_at = v_now
  WHERE id = p_match_id;

  IF v_match.next_match_id IS NOT NULL THEN
    IF upper(coalesce(v_match.next_match_slot, 'A')) = 'B' THEN
      UPDATE public.matches SET team_b_id = p_winner_id WHERE id = v_match.next_match_id;
    ELSE
      UPDATE public.matches SET team_a_id = p_winner_id WHERE id = v_match.next_match_id;
    END IF;
  END IF;

  IF v_match.loser_next_match_id IS NOT NULL AND v_loser_id IS NOT NULL THEN
    IF upper(coalesce(v_match.loser_next_match_slot, 'A')) = 'B' THEN
      UPDATE public.matches SET team_b_id = v_loser_id WHERE id = v_match.loser_next_match_id;
    ELSE
      UPDATE public.matches SET team_a_id = v_loser_id WHERE id = v_match.loser_next_match_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid,
    'match_result_confirmed_and_advanced',
    'matches',
    p_match_id,
    jsonb_build_object(
      'winner_id', p_winner_id,
      'loser_id', v_loser_id,
      'score_a', p_score_a,
      'score_b', p_score_b,
      'next_match_id', v_match.next_match_id
    )
  );

  RETURN jsonb_build_object('ok', true, 'confirmed_at', v_now);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. Realtime Publication & PostgREST Schema Cache Reload
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_tbl IN ARRAY ARRAY['matches', 'tournaments', 'match_attendance', 'match_disputes', 'team_status_history']
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
