-- ==============================================================================
-- SUPERNOVA 3.0 — COMPLETE ESPORTS CONTROL CENTRE REVAMP & PUBLIC LIVE BOARD FIX
-- Migration: 20261122000000_esports_control_centre_revamp.sql
-- Target Project: https://cirreovughlncadrbvcn.supabase.co
-- Safe, Self-Contained & Idempotent:
--   1. Fixes critical anon 42501 error on _esports_has_perm / matches / tournaments
--      and adds public.get_public_esports_live_board() SECURITY DEFINER RPC that
--      returns only published matches + sanitized non-PII team names/institutions.
--   2. Extends public.tournaments with independent game setup configuration
--      (competition_mode, approved_team_limit, total_rounds, start_date,
--       champion_team_id, rules_snapshot, battle_royale & head_to_head formats).
--   3. Extends public.matches with match_code, bracket_position, scheduled_end,
--      duration_minutes, is_scheduled, br_results, undo_count, last_undone_at,
--      last_undone_by, undo_reason while preserving all existing rows & results.
--   4. Creates public.match_result_history for Rewind, Remap & Audit Tracking.
--   5. Upgrades public.confirm_match_result_and_advance(...) to handle H2H,
--      Knockout progression, Champion crowning, Round Robin, and Battle Royale
--      lobby scoring (without wrongful H2H advancement on BR).
--   6. Adds transactional public.undo_match_result_and_rewind(...) RPC with
--      dependent downstream match detection, cascade confirmation support,
--      state restoration, and audit logging.
--   7. Reloads PostgREST schema cache (NOTIFY pgrst, 'reload schema').
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Fix _esports_has_perm Execution Grants for RLS Compatibility (anon + auth)
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
  -- Always false for anonymous requests so public RLS policies fall through cleanly
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

-- Policy on public.matches targets TO anon, authenticated, so anon needs EXECUTE
-- (the function returns false immediately whenever auth.uid() IS NULL).
GRANT EXECUTE ON FUNCTION public._esports_has_perm(text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Extend public.games, public.registrations & public.tournaments Idempotently
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
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in';

CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name text NOT NULL,
  format text NOT NULL DEFAULT 'single_elimination',
  scoring_mode text NOT NULL DEFAULT 'round_based',
  scoring_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  seeding_mode text NOT NULL DEFAULT 'manual',
  require_manager_confirmation boolean NOT NULL DEFAULT true,
  has_started boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  is_structure_locked boolean NOT NULL DEFAULT false,
  allow_unselected_entry boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tournaments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;

DO $$
DECLARE
  v_con record;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tournaments'::regclass
      AND contype = 'c'
      AND (pg_get_constraintdef(oid) ~* '\mformat\M' OR pg_get_constraintdef(oid) ~* '\mstatus\M')
  LOOP
    EXECUTE format('ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS competition_mode text NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS approved_team_limit integer,
  ADD COLUMN IF NOT EXISTS total_rounds integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS start_date date DEFAULT '2026-11-20',
  ADD COLUMN IF NOT EXISTS rules_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS champion_team_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL;

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_format_check
  CHECK (format IN (
    'single_elimination',
    'double_elimination',
    'round_robin',
    'battle_royale',
    'head_to_head',
    'group_knockout',
    'custom'
  ));

ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_status_check
  CHECK (status IN ('draft', 'open', 'published', 'in_progress', 'locked', 'completed'));

-- Allow public read of non-draft/published tournaments for live board / champions
GRANT SELECT ON public.tournaments TO anon, authenticated;

DROP POLICY IF EXISTS "tournaments_public_select" ON public.tournaments;
CREATE POLICY "tournaments_public_select"
ON public.tournaments FOR SELECT
TO anon, authenticated
USING (status IN ('open', 'published', 'in_progress', 'locked', 'completed'));

DROP POLICY IF EXISTS "tournaments_select_rbac" ON public.tournaments;
CREATE POLICY "tournaments_select_rbac"
ON public.tournaments FOR SELECT
TO authenticated
USING (
  public._esports_has_perm('esports:view')
  OR public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('tournament:manage_games')
  OR public._esports_has_perm('conductor:view_assigned')
);

DROP POLICY IF EXISTS "tournaments_write_rbac" ON public.tournaments;
CREATE POLICY "tournaments_write_rbac"
ON public.tournaments FOR ALL
TO authenticated
USING (
  public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('tournament:manage_games')
  OR public._esports_has_perm('tournament:confirm_results')
  OR public._esports_has_perm('esports:edit')
)
WITH CHECK (
  public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('tournament:manage_games')
  OR public._esports_has_perm('tournament:confirm_results')
  OR public._esports_has_perm('esports:edit')
);

-- ------------------------------------------------------------------------------
-- 3. Extend public.matches (Scheduling, BR Results, Bracket Links & Rewind)
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
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS match_code text,
  ADD COLUMN IF NOT EXISTS bracket_position text,
  ADD COLUMN IF NOT EXISTS scheduled_end timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS is_scheduled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS br_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS undo_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_undone_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_undone_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS undo_reason text;

UPDATE public.matches
SET is_scheduled = (scheduled_start IS NOT NULL)
WHERE is_scheduled = false AND scheduled_start IS NOT NULL;

-- Preserve valid existing match statuses; only normalize null/legacy aliases
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

CREATE INDEX IF NOT EXISTS idx_matches_match_code ON public.matches (match_code);
CREATE INDEX IF NOT EXISTS idx_matches_is_scheduled ON public.matches (is_scheduled, scheduled_start);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON public.matches (tournament_id);

-- Ensure public read of published matches & RBAC write policies on public.matches
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;

DROP POLICY IF EXISTS "matches_select_policy" ON public.matches;
CREATE POLICY "matches_select_policy"
ON public.matches FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR (
    auth.uid() IS NOT NULL
    AND (
      public._esports_has_perm('esports:view')
      OR public._esports_has_perm('tournament:confirm_results')
      OR public._esports_has_perm('tournament:build_bracket')
      OR (public._esports_has_perm('conductor:view_assigned') AND conductor_id = (select auth.uid()))
    )
  )
);

DROP POLICY IF EXISTS "admin_insert_match" ON public.matches;
CREATE POLICY "admin_insert_match"
ON public.matches FOR INSERT
TO authenticated
WITH CHECK (
  public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('esports:create')
  OR public._esports_has_perm('esports:edit')
);

DROP POLICY IF EXISTS "admin_update_match" ON public.matches;
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

DROP POLICY IF EXISTS "admin_delete_match" ON public.matches;
CREATE POLICY "admin_delete_match"
ON public.matches FOR DELETE
TO authenticated
USING (
  public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('esports:edit')
);

-- ------------------------------------------------------------------------------
-- 4. Match Disputes & Result History Audit Tables
-- ------------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_match_disputes_match_id ON public.match_disputes (match_id);
ALTER TABLE public.match_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_disputes FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.match_disputes TO authenticated;
GRANT ALL ON public.match_disputes TO service_role;

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

CREATE TABLE IF NOT EXISTS public.match_result_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'result_submitted',
    'result_confirmed',
    'undo_rewind',
    'dispute_resolved',
    'teams_remapped',
    'schedule_updated'
  )),
  previous_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  downstream_affected_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  reason text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_result_history_match ON public.match_result_history (match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_result_history_game ON public.match_result_history (game_id, created_at DESC);

ALTER TABLE public.match_result_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_result_history FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.match_result_history TO authenticated;
GRANT ALL ON public.match_result_history TO service_role;

DROP POLICY IF EXISTS "match_result_history_select" ON public.match_result_history;
CREATE POLICY "match_result_history_select"
ON public.match_result_history FOR SELECT
TO authenticated
USING (
  public._esports_has_perm('esports:view')
  OR public._esports_has_perm('tournament:confirm_results')
  OR public._esports_has_perm('tournament:resolve_disputes')
  OR public._esports_has_perm('reports:view')
);

DROP POLICY IF EXISTS "match_result_history_insert" ON public.match_result_history;
CREATE POLICY "match_result_history_insert"
ON public.match_result_history FOR INSERT
TO authenticated
WITH CHECK (
  public._esports_has_perm('esports:edit')
  OR public._esports_has_perm('tournament:confirm_results')
  OR public._esports_has_perm('tournament:resolve_disputes')
  OR public._esports_has_perm('tournament:build_bracket')
  OR public._esports_has_perm('conductor:submit_result')
);

-- ------------------------------------------------------------------------------
-- 5. Upgraded Confirm Result & Advance RPC (Knockout, RR, & Battle Royale)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_match_result_and_advance(
  p_match_id uuid,
  p_winner_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_detailed_scores jsonb DEFAULT '{}'::jsonb,
  p_br_results jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_email text;
  v_match record;
  v_loser_id uuid;
  v_now timestamptz := now();
  v_is_br boolean := false;
  v_prev_snapshot jsonb;
  v_top_br_team_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT (
    public._esports_has_perm('tournament:confirm_results')
    OR public._esports_has_perm('esports:edit')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: tournament:confirm_results permission required');
  END IF;

  SELECT email INTO v_actor_email FROM public.profiles WHERE id = v_uid;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Match not found');
  END IF;

  IF v_match.status = 'disputed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Match is disputed and frozen. Resolve dispute first.');
  END IF;

  IF v_match.status = 'completed' AND v_match.bracket_advanced_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Double-advancement blocked: match result has already been confirmed.');
  END IF;

  v_is_br := (
    v_match.bracket_side = 'battle_royale'
    OR coalesce(v_match.match_format, '') ILIKE '%BR%'
    OR (p_br_results IS NOT NULL AND jsonb_typeof(p_br_results) = 'array' AND jsonb_array_length(p_br_results) > 0)
  );

  v_prev_snapshot := jsonb_build_object(
    'status', v_match.status,
    'result_status', v_match.result_status,
    'score_a', v_match.score_a,
    'score_b', v_match.score_b,
    'winner_id', v_match.winner_id,
    'br_results', v_match.br_results,
    'detailed_scores', v_match.detailed_scores,
    'confirmed_by', v_match.confirmed_by,
    'confirmed_at', v_match.confirmed_at,
    'bracket_advanced_at', v_match.bracket_advanced_at
  );

  IF v_is_br THEN
    IF p_br_results IS NULL OR jsonb_typeof(p_br_results) <> 'array' OR jsonb_array_length(p_br_results) = 0 THEN
      IF v_match.br_results IS NULL OR jsonb_typeof(v_match.br_results) <> 'array' OR jsonb_array_length(v_match.br_results) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Battle Royale match requires at least one team placement & kills entry.');
      END IF;
    END IF;

    -- Identify placement 1 team if provided for display purposes only
    SELECT NULLIF(elem->>'team_id', '')::uuid
    INTO v_top_br_team_id
    FROM jsonb_array_elements(coalesce(p_br_results, v_match.br_results)) AS elem
    ORDER BY coalesce((elem->>'total_points')::integer, 0) DESC, coalesce((elem->>'placement')::integer, 999) ASC
    LIMIT 1;

    UPDATE public.matches
    SET
      br_results = coalesce(p_br_results, br_results, '[]'::jsonb),
      detailed_scores = coalesce(p_detailed_scores, detailed_scores, '{}'::jsonb),
      winner_id = coalesce(p_winner_id, v_top_br_team_id),
      status = 'completed',
      result_status = 'confirmed',
      confirmed_by = v_uid,
      confirmed_at = v_now,
      bracket_advanced_at = v_now
    WHERE id = p_match_id;

    -- Explicitly NO H2H winner progression on Battle Royale rounds.
    -- If every BR match for this tournament is now completed, crown the #1 cumulative team automatically.
    IF v_match.tournament_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.matches m2
      WHERE m2.tournament_id = v_match.tournament_id
        AND m2.status <> 'completed'
        AND m2.status <> 'cancelled'
    ) THEN
      DECLARE
        v_cum_champ uuid;
      BEGIN
        SELECT NULLIF(elem->>'team_id', '')::uuid
        INTO v_cum_champ
        FROM public.matches m_all,
             jsonb_array_elements(coalesce(m_all.br_results, '[]'::jsonb)) AS elem
        WHERE m_all.tournament_id = v_match.tournament_id
          AND m_all.status = 'completed'
          AND NULLIF(elem->>'team_id', '') IS NOT NULL
        GROUP BY NULLIF(elem->>'team_id', '')::uuid
        ORDER BY
          sum(coalesce((elem->>'total_points')::integer, 0)) DESC,
          sum(CASE WHEN (elem->>'placement')::integer = 1 THEN 1 ELSE 0 END) DESC,
          sum(coalesce((elem->>'placement_points')::integer, 0)) DESC,
          sum(coalesce((elem->>'kills')::integer, 0)) DESC
        LIMIT 1;

        IF v_cum_champ IS NOT NULL THEN
          UPDATE public.tournaments
          SET
            champion_team_id = v_cum_champ,
            status = 'completed',
            updated_at = v_now
          WHERE id = v_match.tournament_id;
        END IF;
      END;
    END IF;
  ELSE
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

    -- If this was a Championship Final match without next_match_id, update tournament champion
    IF v_match.tournament_id IS NOT NULL
       AND v_match.next_match_id IS NULL
       AND (v_match.bracket_side = 'grand_final' OR lower(coalesce(v_match.round, '')) LIKE '%final%')
    THEN
      UPDATE public.tournaments
      SET
        champion_team_id = p_winner_id,
        status = 'completed',
        updated_at = v_now
      WHERE id = v_match.tournament_id;
    END IF;
  END IF;

  INSERT INTO public.match_result_history (
    match_id, tournament_id, game_id, action_type, previous_state, next_state, actor_id, actor_email, reason
  )
  VALUES (
    p_match_id,
    v_match.tournament_id,
    v_match.game_id,
    'result_confirmed',
    v_prev_snapshot,
    jsonb_build_object(
      'status', 'completed',
      'winner_id', coalesce(p_winner_id, v_top_br_team_id),
      'score_a', greatest(0, coalesce(p_score_a, 0)),
      'score_b', greatest(0, coalesce(p_score_b, 0)),
      'is_br', v_is_br
    ),
    v_uid,
    v_actor_email,
    'Official match result confirmed'
  );

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid,
    'match_result_confirmed_and_advanced',
    'matches',
    p_match_id,
    jsonb_build_object(
      'winner_id', coalesce(p_winner_id, v_top_br_team_id),
      'loser_id', v_loser_id,
      'score_a', p_score_a,
      'score_b', p_score_b,
      'next_match_id', v_match.next_match_id,
      'is_br', v_is_br
    )
  );

  RETURN jsonb_build_object('ok', true, 'confirmed_at', v_now, 'is_br', v_is_br);
END;
$$;

-- Keep backward-compatible 5-arg overload cleanly delegating
CREATE OR REPLACE FUNCTION public.confirm_match_result_and_advance(
  p_match_id uuid,
  p_winner_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_detailed_scores jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.confirm_match_result_and_advance(p_match_id, p_winner_id, p_score_a, p_score_b, p_detailed_scores, NULL::jsonb);
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. Transactional Undo / Rewind RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_match_result_and_rewind(
  p_match_id uuid,
  p_reason text,
  p_force_cascade boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_email text;
  v_match record;
  v_dep record;
  v_dep_ids uuid[] := '{}'::uuid[];
  v_started_deps uuid[] := '{}'::uuid[];
  v_now timestamptz := now();
  v_prev_snapshot jsonb;
  v_loser_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT (
    public._esports_has_perm('tournament:confirm_results')
    OR public._esports_has_perm('tournament:resolve_disputes')
    OR public._esports_has_perm('esports:edit')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: esports manager confirmation permission required to undo results.');
  END IF;

  IF coalesce(length(trim(p_reason)), 0) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A clear rewind/correction reason (min 4 characters) is mandatory.');
  END IF;

  SELECT email INTO v_actor_email FROM public.profiles WHERE id = v_uid;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Match not found');
  END IF;

  -- Check direct downstream dependent matches (winner & loser advancement targets)
  FOR v_dep IN
    SELECT id, match_code, round, status
    FROM public.matches
    WHERE id IN (v_match.next_match_id, v_match.loser_next_match_id)
  LOOP
    v_dep_ids := array_append(v_dep_ids, v_dep.id);
    IF v_dep.status IN ('live', 'result_submitted', 'completed', 'disputed') THEN
      v_started_deps := array_append(v_started_deps, v_dep.id);
    END IF;
  END LOOP;

  IF coalesce(array_length(v_started_deps, 1), 0) > 0 AND NOT p_force_cascade THEN
    RETURN jsonb_build_object(
      'ok', false,
      'requires_cascade', true,
      'dependent_match_ids', to_jsonb(v_started_deps),
      'error', 'Downstream matches fed by this match already have live or completed results. Confirm cascade rewind to clear dependent matches too.'
    );
  END IF;

  v_prev_snapshot := jsonb_build_object(
    'status', v_match.status,
    'result_status', v_match.result_status,
    'score_a', v_match.score_a,
    'score_b', v_match.score_b,
    'winner_id', v_match.winner_id,
    'br_results', v_match.br_results,
    'confirmed_by', v_match.confirmed_by,
    'confirmed_at', v_match.confirmed_at,
    'bracket_advanced_at', v_match.bracket_advanced_at
  );

  v_loser_id := CASE
    WHEN v_match.winner_id IS NOT NULL AND v_match.winner_id = v_match.team_a_id THEN v_match.team_b_id
    WHEN v_match.winner_id IS NOT NULL AND v_match.winner_id = v_match.team_b_id THEN v_match.team_a_id
    ELSE NULL
  END;

  -- Clear propagated winner/loser slots downstream
  IF v_match.next_match_id IS NOT NULL AND v_match.winner_id IS NOT NULL THEN
    IF upper(coalesce(v_match.next_match_slot, 'A')) = 'B' THEN
      UPDATE public.matches
      SET team_b_id = CASE WHEN team_b_id = v_match.winner_id THEN NULL ELSE team_b_id END
      WHERE id = v_match.next_match_id;
    ELSE
      UPDATE public.matches
      SET team_a_id = CASE WHEN team_a_id = v_match.winner_id THEN NULL ELSE team_a_id END
      WHERE id = v_match.next_match_id;
    END IF;
  END IF;

  IF v_match.loser_next_match_id IS NOT NULL AND v_loser_id IS NOT NULL THEN
    IF upper(coalesce(v_match.loser_next_match_slot, 'A')) = 'B' THEN
      UPDATE public.matches
      SET team_b_id = CASE WHEN team_b_id = v_loser_id THEN NULL ELSE team_b_id END
      WHERE id = v_match.loser_next_match_id;
    ELSE
      UPDATE public.matches
      SET team_a_id = CASE WHEN team_a_id = v_loser_id THEN NULL ELSE team_a_id END
      WHERE id = v_match.loser_next_match_id;
    END IF;
  END IF;

  -- If forced cascade, reset started downstream matches cleanly back to scheduled/upcoming
  IF p_force_cascade AND coalesce(array_length(v_started_deps, 1), 0) > 0 THEN
    UPDATE public.matches
    SET
      status = CASE WHEN scheduled_start IS NOT NULL THEN 'scheduled' ELSE 'upcoming' END,
      result_status = 'pending',
      score_a = 0,
      score_b = 0,
      winner_id = NULL,
      confirmed_by = NULL,
      confirmed_at = NULL,
      bracket_advanced_at = NULL,
      undo_count = coalesce(undo_count, 0) + 1,
      last_undone_at = v_now,
      last_undone_by = v_uid,
      undo_reason = 'Cascade rewind from upstream match: ' || trim(p_reason)
    WHERE id = ANY(v_started_deps);
  END IF;

  -- Reset target match back to pre-confirmation state so admin can re-enter or confirm
  UPDATE public.matches
  SET
    status = CASE WHEN v_match.scheduled_start IS NOT NULL THEN 'scheduled' ELSE 'upcoming' END,
    result_status = 'pending',
    winner_id = NULL,
    confirmed_by = NULL,
    confirmed_at = NULL,
    bracket_advanced_at = NULL,
    undo_count = coalesce(undo_count, 0) + 1,
    last_undone_at = v_now,
    last_undone_by = v_uid,
    undo_reason = trim(p_reason)
  WHERE id = p_match_id;

  -- Clear tournament champion if this match had crowned one
  IF v_match.tournament_id IS NOT NULL AND v_match.winner_id IS NOT NULL THEN
    UPDATE public.tournaments
    SET
      champion_team_id = NULL,
      status = CASE WHEN status = 'completed' THEN 'in_progress' ELSE status END,
      updated_at = v_now
    WHERE id = v_match.tournament_id
      AND champion_team_id = v_match.winner_id;
  END IF;

  INSERT INTO public.match_result_history (
    match_id, tournament_id, game_id, action_type, previous_state, next_state, downstream_affected_ids, actor_id, actor_email, reason
  )
  VALUES (
    p_match_id,
    v_match.tournament_id,
    v_match.game_id,
    'undo_rewind',
    v_prev_snapshot,
    jsonb_build_object('status', CASE WHEN v_match.scheduled_start IS NOT NULL THEN 'scheduled' ELSE 'upcoming' END, 'result_status', 'pending'),
    v_dep_ids,
    v_uid,
    v_actor_email,
    trim(p_reason)
  );

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid,
    'match_result_undone_and_rewound',
    'matches',
    p_match_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'force_cascade', p_force_cascade,
      'dependent_match_ids', v_dep_ids,
      'previous_winner_id', v_match.winner_id
    )
  );

  RETURN jsonb_build_object('ok', true, 'rewound_at', v_now, 'dependent_cleared', v_started_deps);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_match_result_and_rewind(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_match_result_and_rewind(uuid, text, boolean) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. Safe Public Live Board RPC (Zero PII exposed to anon/public spectators)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_esports_live_board()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'games', coalesce((
      SELECT jsonb_agg(g ORDER BY g.sort_order ASC)
      FROM (
        SELECT id, title, description, team_size, match_format, scoring_mode, scoring_config, match_duration_minutes, tournament_status, sort_order, is_active, is_published
        FROM public.games
        WHERE is_active = true
      ) g
    ), '[]'::jsonb),
    'tournaments', coalesce((
      SELECT jsonb_agg(t ORDER BY t.created_at DESC)
      FROM (
        SELECT id, game_id, name, format, scoring_mode, seeding_mode, competition_mode, approved_team_limit, total_rounds, start_date, rules_snapshot, status, has_started, champion_team_id, created_at, updated_at
        FROM public.tournaments
        WHERE status IN ('open', 'published', 'in_progress', 'locked', 'completed')
      ) t
    ), '[]'::jsonb),
    'matches', coalesce((
      SELECT jsonb_agg(m ORDER BY m.scheduled_start ASC NULLS LAST, m.round_number ASC, m.match_number ASC)
      FROM public.matches m
      WHERE m.is_published = true
    ), '[]'::jsonb),
    'teams', coalesce((
      SELECT jsonb_agg(r ORDER BY r.seed_number ASC NULLS LAST, r.team_name ASC)
      FROM (
        SELECT id, game_id, registration_ref, team_name, institution, seed_number, group_name, selection_status, status
        FROM public.registrations
        WHERE status = 'confirmed'
      ) r
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_public_esports_live_board() TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 8. Realtime Publication & PostgREST Schema Cache Reload
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_tbl IN ARRAY ARRAY['matches', 'tournaments', 'match_result_history']
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
