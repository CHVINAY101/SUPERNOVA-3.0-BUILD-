-- ==============================================================================
-- SUPERNOVA 3.0 — FINAL PRE-EVENT CONTROLS, MASTER RESET & GATE PORTAL
-- Migration: 20261125000000_pre_event_controls_reset_and_gate_portal.sql
-- Target Supabase Project: cirreovughlncadrbvcn
--
-- SAFE & IDEMPOTENT:
--   * Preserves ALL registrations, players, visitor passes, tickets,
--     non-match gate check_ins, CRM staff accounts, and audit_logs.
--   * NO TRUNCATE CASCADE.
--   * Fail-closed RBAC across registration controls, master reset, and gate RPCs.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Helper for Esports / System Permissions (compatible with all migration tiers)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._esports_has_perm(p_perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF to_regprocedure('public.has_crm_permission(text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.has_crm_permission($1)' INTO v_allowed USING p_perm;
    RETURN coalesce(v_allowed, false);
  END IF;

  RETURN public.is_admin();
END;
$$;

REVOKE ALL ON FUNCTION public._esports_has_perm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._esports_has_perm(text) TO authenticated;

CREATE OR REPLACE FUNCTION public._esports_reset_is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_has_status boolean := false;
  v_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'account_status'
  ) INTO v_has_status;

  IF v_has_status THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = v_uid
        AND ur.role = 'super_admin'
        AND p.account_status = 'active'
    ) INTO v_ok;
    RETURN coalesce(v_ok, false);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role = 'super_admin'
  ) INTO v_ok;
  RETURN coalesce(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public._esports_reset_is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._esports_reset_is_super_admin() TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. Phase 1 — Game-Wise Registration Controls, Audit Actor & Player Education
-- ------------------------------------------------------------------------------
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS registration_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_teams integer,
  ADD COLUMN IF NOT EXISTS auto_close_at_capacity boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS registration_override_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_closed_message text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_email text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.games'::regclass
      AND conname = 'games_max_teams_positive_check'
  ) THEN
    ALTER TABLE public.games
      ADD CONSTRAINT games_max_teams_positive_check
      CHECK (max_teams IS NULL OR max_teams >= 1);
  END IF;
END $$;

INSERT INTO public.games (title, team_size, is_active, is_published, sort_order, registration_open, auto_close_at_capacity)
SELECT v.title, v.team_size, true, true, v.sort_order, true, true
FROM (VALUES ('VALORANT', 5, 1), ('FREE FIRE', 4, 2), ('BGMI', 4, 3)) AS v(title, team_size, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.games g WHERE upper(trim(g.title)) = v.title);

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS institution_type text,
  ADD COLUMN IF NOT EXISTS institution_name text,
  ADD COLUMN IF NOT EXISTS course_or_class text,
  ADD COLUMN IF NOT EXISTS current_year_or_class text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.players'::regclass
      AND conname = 'players_institution_type_check'
  ) THEN
    ALTER TABLE public.players
      ADD CONSTRAINT players_institution_type_check
      CHECK (institution_type IS NULL OR institution_type IN ('School', 'College', 'Other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_players_institution_type ON public.players (institution_type);
CREATE INDEX IF NOT EXISTS idx_players_institution_name_lower ON public.players (lower(institution_name));
CREATE INDEX IF NOT EXISTS idx_players_course_or_class_lower ON public.players (lower(course_or_class));
CREATE INDEX IF NOT EXISTS idx_players_current_year_or_class_lower ON public.players (lower(current_year_or_class));

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS selection_status text DEFAULT 'awaiting_selection',
  ADD COLUMN IF NOT EXISTS selection_reason text,
  ADD COLUMN IF NOT EXISTS seed_number integer,
  ADD COLUMN IF NOT EXISTS group_name text;

DROP POLICY IF EXISTS "admin_update_games_rbac" ON public.games;
CREATE POLICY "admin_update_games_rbac"
ON public.games FOR UPDATE
TO authenticated
USING (
  public._esports_has_perm('event_info:edit')
  OR public._esports_has_perm('tournament:manage_games')
  OR public._esports_has_perm('esports:edit')
  OR public._esports_has_perm('system_settings:manage')
)
WITH CHECK (
  public._esports_has_perm('event_info:edit')
  OR public._esports_has_perm('tournament:manage_games')
  OR public._esports_has_perm('esports:edit')
  OR public._esports_has_perm('system_settings:manage')
);

CREATE OR REPLACE FUNCTION public.get_esports_registration_availability()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH reg_counts AS (
    SELECT
      r.game_id,
      count(*) FILTER (
        WHERE r.archived_at IS NULL
          AND coalesce(r.admin_notes, '') NOT LIKE '%[ARCHIVED%'
      )::integer AS total_registered_teams,
      count(*) FILTER (
        WHERE r.archived_at IS NULL
          AND coalesce(r.admin_notes, '') NOT LIKE '%[ARCHIVED%'
          AND r.status = 'confirmed'
      )::integer AS approved_teams,
      count(*) FILTER (
        WHERE r.archived_at IS NULL
          AND coalesce(r.admin_notes, '') NOT LIKE '%[ARCHIVED%'
          AND r.status = 'pending'
      )::integer AS pending_teams,
      count(*) FILTER (
        WHERE r.archived_at IS NULL
          AND coalesce(r.admin_notes, '') NOT LIKE '%[ARCHIVED%'
          AND r.status NOT IN ('declined', 'withdrawn')
      )::integer AS active_capacity_teams
    FROM public.registrations r
    GROUP BY r.game_id
  ),
  portal_ctrl AS (
    SELECT
      coalesce(rc.is_open, true) AS portal_open,
      rc.closed_message AS portal_closed_message,
      rc.opens_at AS portal_opens_at,
      rc.closes_at AS portal_closes_at
    FROM public.registration_controls rc
    WHERE rc.form_type = 'esports'
    LIMIT 1
  ),
  portal_state AS (
    SELECT
      coalesce((SELECT portal_open FROM portal_ctrl), true) AS portal_open,
      (SELECT portal_opens_at FROM portal_ctrl) AS opens_at,
      (SELECT portal_closes_at FROM portal_ctrl) AS closes_at,
      (SELECT portal_closed_message FROM portal_ctrl) AS closed_message
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'title', g.title,
        'team_size', g.team_size,
        'sort_order', g.sort_order,
        'is_active', g.is_active,
        'is_published', g.is_published,
        'registration_open', g.registration_open,
        'max_teams', g.max_teams,
        'auto_close_at_capacity', g.auto_close_at_capacity,
        'registration_override_open', g.registration_override_open,
        'registration_closed_message', g.registration_closed_message,
        'updated_at', g.updated_at,
        'updated_by_email', g.updated_by_email,
        'total_registered_teams', coalesce(rc.total_registered_teams, 0),
        'approved_teams', coalesce(rc.approved_teams, 0),
        'pending_teams', coalesce(rc.pending_teams, 0),
        'active_capacity_teams', coalesce(rc.active_capacity_teams, 0),
        'slots_remaining', CASE
          WHEN g.max_teams IS NULL THEN NULL
          ELSE greatest(0, g.max_teams - coalesce(rc.active_capacity_teams, 0))
        END,
        'is_effectively_open', (
          g.is_active
          AND g.is_published
          AND g.registration_open
          AND ps.portal_open
          AND (ps.opens_at IS NULL OR now() >= ps.opens_at)
          AND (ps.closes_at IS NULL OR now() <= ps.closes_at)
          AND (
            g.max_teams IS NULL
            OR g.registration_override_open IS TRUE
            OR coalesce(rc.active_capacity_teams, 0) < g.max_teams
          )
        ),
        'status_reason', CASE
          WHEN NOT ps.portal_open THEN 'portal_closed'
          WHEN ps.opens_at IS NOT NULL AND now() < ps.opens_at THEN 'portal_scheduled'
          WHEN ps.closes_at IS NOT NULL AND now() > ps.closes_at THEN 'portal_expired'
          WHEN NOT g.registration_open
               AND g.max_teams IS NOT NULL
               AND g.auto_close_at_capacity
               AND coalesce(rc.active_capacity_teams, 0) >= g.max_teams THEN 'capacity_reached'
          WHEN NOT g.registration_open THEN 'manual_closed'
          WHEN g.max_teams IS NOT NULL
               AND NOT g.registration_override_open
               AND coalesce(rc.active_capacity_teams, 0) >= g.max_teams THEN 'capacity_reached'
          WHEN g.registration_override_open
               AND g.max_teams IS NOT NULL
               AND coalesce(rc.active_capacity_teams, 0) >= g.max_teams THEN 'open_override'
          ELSE 'open'
        END
      )
      ORDER BY g.sort_order ASC, g.title ASC
    ),
    '[]'::jsonb
  )
  FROM public.games g
  CROSS JOIN portal_state ps
  LEFT JOIN reg_counts rc ON rc.game_id = g.id
  WHERE g.is_active = true AND g.is_published = true;
$$;

REVOKE EXECUTE ON FUNCTION public.get_esports_registration_availability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_esports_registration_availability() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_esports_game_registration_control(
  p_game_id uuid,
  p_action text,
  p_max_teams integer DEFAULT NULL,
  p_clear_max_teams boolean DEFAULT false,
  p_auto_close_at_capacity boolean DEFAULT NULL,
  p_closed_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_email text;
  v_game public.games%ROWTYPE;
  v_active_count integer;
  v_next_open boolean;
  v_next_override boolean;
  v_next_max integer;
  v_next_auto_close boolean;
  v_next_msg text;
  v_action text := lower(trim(coalesce(p_action, 'update_settings')));
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public._esports_has_perm('tournament:manage_games')
    OR public._esports_has_perm('esports:edit')
    OR public._esports_has_perm('system_settings:manage')
  ) THEN
    RAISE EXCEPTION 'Permission denied: Authorized Esports or System Admin permission required';
  END IF;

  IF v_action NOT IN ('open', 'close', 'reopen_override', 'update_settings') THEN
    RAISE EXCEPTION 'Unsupported registration control action: %', p_action;
  END IF;

  IF p_max_teams IS NOT NULL AND p_max_teams < 1 THEN
    RAISE EXCEPTION 'Maximum team capacity must be at least 1 team';
  END IF;

  SELECT coalesce(
    nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
    (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
    'admin@supernova'
  ) INTO v_actor_email;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game record not found';
  END IF;

  SELECT count(*)::integer INTO v_active_count
  FROM public.registrations r
  WHERE r.game_id = p_game_id
    AND r.archived_at IS NULL
    AND coalesce(r.admin_notes, '') NOT LIKE '%[ARCHIVED%'
    AND r.status NOT IN ('declined', 'withdrawn');

  v_next_max := CASE
    WHEN p_clear_max_teams THEN NULL
    WHEN p_max_teams IS NOT NULL THEN p_max_teams
    ELSE v_game.max_teams
  END;

  v_next_auto_close := coalesce(p_auto_close_at_capacity, v_game.auto_close_at_capacity, true);
  v_next_msg := CASE
    WHEN p_closed_message IS NOT NULL THEN nullif(trim(p_closed_message), '')
    ELSE v_game.registration_closed_message
  END;

  IF v_action = 'close' THEN
    v_next_open := false;
    v_next_override := false;
  ELSIF v_action = 'reopen_override' THEN
    v_next_open := true;
    v_next_override := true;
  ELSIF v_action = 'open' THEN
    v_next_open := true;
    v_next_override := (v_next_max IS NOT NULL AND v_active_count >= v_next_max);
  ELSE
    v_next_open := v_game.registration_open;
    v_next_override := v_game.registration_override_open;

    IF v_next_max IS NULL OR v_active_count < v_next_max THEN
      v_next_override := false;
    ELSIF v_next_auto_close AND v_next_max IS NOT NULL AND v_active_count >= v_next_max AND NOT v_next_override THEN
      v_next_open := false;
    END IF;
  END IF;

  UPDATE public.games
  SET
    registration_open = v_next_open,
    max_teams = v_next_max,
    auto_close_at_capacity = v_next_auto_close,
    registration_override_open = v_next_override,
    registration_closed_message = v_next_msg,
    updated_by = v_uid,
    updated_by_email = v_actor_email,
    updated_at = v_now
  WHERE id = p_game_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid,
    'esports_registration_control_' || v_action,
    'games',
    p_game_id,
    jsonb_build_object(
      'game_title', v_game.title,
      'updated_by_email', v_actor_email,
      'previous_registration_open', v_game.registration_open,
      'next_registration_open', v_next_open,
      'previous_max_teams', v_game.max_teams,
      'next_max_teams', v_next_max,
      'registration_override_open', v_next_override,
      'auto_close_at_capacity', v_next_auto_close,
      'closed_message', v_next_msg,
      'active_teams_at_change', v_active_count
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'game_id', p_game_id,
    'title', v_game.title,
    'registration_open', v_next_open,
    'max_teams', v_next_max,
    'auto_close_at_capacity', v_next_auto_close,
    'registration_override_open', v_next_override,
    'registration_closed_message', v_next_msg,
    'active_capacity_teams', v_active_count,
    'updated_at', v_now,
    'updated_by_email', v_actor_email
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_esports_game_registration_control(uuid, text, integer, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_esports_game_registration_control(uuid, text, integer, boolean, boolean, text) TO authenticated;

-- Defense-in-depth trigger preventing bypass via direct INSERT when a game is closed or full
CREATE OR REPLACE FUNCTION public.enforce_esports_game_registration_control()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_ctrl record;
  v_active_teams integer;
BEGIN
  SELECT is_open, closed_message, opens_at, closes_at INTO v_ctrl
  FROM public.registration_controls
  WHERE form_type = 'esports'
  LIMIT 1;

  IF FOUND THEN
    IF v_ctrl.is_open IS NOT TRUE THEN
      RAISE EXCEPTION 'Registrations are closed: %', coalesce(v_ctrl.closed_message, 'Esports team registrations are currently closed.');
    END IF;
    IF v_ctrl.opens_at IS NOT NULL AND now() < v_ctrl.opens_at THEN
      RAISE EXCEPTION 'Registrations have not opened yet.';
    END IF;
    IF v_ctrl.closes_at IS NOT NULL AND now() > v_ctrl.closes_at THEN
      RAISE EXCEPTION 'Registrations have closed.';
    END IF;
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = NEW.game_id
    AND is_active = true
    AND is_published = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected game is not open for registration.';
  END IF;

  IF v_game.registration_open IS NOT TRUE THEN
    RAISE EXCEPTION 'Registrations are closed for %: %',
      v_game.title,
      coalesce(nullif(trim(v_game.registration_closed_message), ''), v_game.title || ' registrations are currently closed.');
  END IF;

  SELECT count(*)::integer INTO v_active_teams
  FROM public.registrations r
  WHERE r.game_id = NEW.game_id
    AND r.archived_at IS NULL
    AND coalesce(r.admin_notes, '') NOT LIKE '%[ARCHIVED%'
    AND r.status NOT IN ('declined', 'withdrawn');

  IF v_game.max_teams IS NOT NULL
     AND v_game.max_teams > 0
     AND v_game.registration_override_open IS NOT TRUE
     AND v_active_teams >= v_game.max_teams THEN
    RAISE EXCEPTION 'Registrations are closed for %: Maximum team capacity (% teams) has been reached.',
      v_game.title,
      v_game.max_teams;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_esports_game_registration_control ON public.registrations;
CREATE TRIGGER trg_enforce_esports_game_registration_control
BEFORE INSERT ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.enforce_esports_game_registration_control();

-- Ensure submit_esports_registration enforces closure, capacity, & all 4 educational fields
CREATE OR REPLACE FUNCTION public.submit_esports_registration(
  p_team_name text,
  p_game_id uuid,
  p_institution text,
  p_captain_name text,
  p_email text,
  p_phone text,
  p_players jsonb,
  p_consent boolean,
  p_website text DEFAULT ''
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s\-+()]', '', 'g');
  v_team text := trim(coalesce(p_team_name, ''));
  v_captain text := trim(coalesce(p_captain_name, ''));
  v_game public.games%ROWTYPE;
  v_count integer;
  v_active_teams integer;
  v_ref text;
  v_reg_id uuid;
  v_player jsonb;
  v_ctrl record;
  v_idx integer := 0;
  v_p_name text;
  v_p_tag text;
  v_p_inst_type text;
  v_p_inst_name text;
  v_p_course text;
  v_p_year text;
BEGIN
  SELECT is_open, closed_message, opens_at, closes_at INTO v_ctrl
  FROM public.registration_controls
  WHERE form_type = 'esports'
  LIMIT 1;

  IF FOUND THEN
    IF v_ctrl.is_open IS NOT TRUE THEN
      RAISE EXCEPTION 'Registrations are closed: %', coalesce(v_ctrl.closed_message, 'Esports team registrations are currently closed.');
    END IF;
    IF v_ctrl.opens_at IS NOT NULL AND now() < v_ctrl.opens_at THEN
      RAISE EXCEPTION 'Registrations have not opened yet.';
    END IF;
    IF v_ctrl.closes_at IS NOT NULL AND now() > v_ctrl.closes_at THEN
      RAISE EXCEPTION 'Registrations have closed.';
    END IF;
  END IF;

  IF coalesce(p_website, '') <> '' THEN
    RAISE EXCEPTION 'Submission rejected';
  END IF;
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'Consent is required';
  END IF;
  IF length(v_team) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Invalid team name';
  END IF;
  IF length(v_captain) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Invalid representative name';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  IF v_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid mobile number';
  END IF;
  IF p_institution IS NOT NULL AND length(trim(p_institution)) > 150 THEN
    RAISE EXCEPTION 'Invalid institution';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
    AND is_active = true
    AND is_published = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game is not open for registration';
  END IF;

  IF v_game.registration_open IS NOT TRUE THEN
    RAISE EXCEPTION 'Registrations are closed for %: %',
      v_game.title,
      coalesce(nullif(trim(v_game.registration_closed_message), ''), v_game.title || ' registrations are currently closed.');
  END IF;

  SELECT count(*)::integer INTO v_active_teams
  FROM public.registrations r
  WHERE r.game_id = p_game_id
    AND r.archived_at IS NULL
    AND coalesce(r.admin_notes, '') NOT LIKE '%[ARCHIVED%'
    AND r.status NOT IN ('declined', 'withdrawn');

  IF v_game.max_teams IS NOT NULL
     AND v_game.max_teams > 0
     AND v_game.registration_override_open IS NOT TRUE
     AND v_active_teams >= v_game.max_teams THEN
    RAISE EXCEPTION 'Registrations are closed for %: Maximum team capacity (% teams) has been reached.',
      v_game.title,
      v_game.max_teams;
  END IF;

  IF jsonb_typeof(p_players) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid player list';
  END IF;

  v_count := jsonb_array_length(p_players);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'At least one player is required';
  END IF;
  IF v_game.team_size IS NOT NULL AND v_count <> v_game.team_size THEN
    RAISE EXCEPTION 'Player count does not match team size for % (expected %, got %)',
      v_game.title, v_game.team_size, v_count;
  END IF;

  FOR v_player IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    v_idx := v_idx + 1;
    v_p_name := trim(coalesce(v_player->>'player_name', ''));
    v_p_tag := trim(coalesce(v_player->>'gamer_tag', ''));
    v_p_inst_type := trim(coalesce(v_player->>'institution_type', ''));
    v_p_inst_name := trim(coalesce(v_player->>'institution_name', ''));
    v_p_course := trim(coalesce(v_player->>'course_or_class', ''));
    v_p_year := trim(coalesce(v_player->>'current_year_or_class', ''));

    IF length(v_p_name) NOT BETWEEN 2 AND 80 THEN
      RAISE EXCEPTION 'Invalid player name for Player %', v_idx;
    END IF;
    IF length(v_p_tag) NOT BETWEEN 2 AND 40 THEN
      RAISE EXCEPTION 'Invalid in-game ID for Player %', v_idx;
    END IF;
    IF v_p_inst_type NOT IN ('School', 'College', 'Other') THEN
      RAISE EXCEPTION 'Institution Type (School, College, or Other) is mandatory for Player %', v_idx;
    END IF;
    IF length(v_p_inst_name) NOT BETWEEN 2 AND 150 THEN
      RAISE EXCEPTION 'School / College / Institution Name is mandatory for Player % (2-150 chars)', v_idx;
    END IF;
    IF length(v_p_course) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'Course / Class is mandatory for Player %', v_idx;
    END IF;
    IF length(v_p_year) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'Current Year / Class is mandatory for Player %', v_idx;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE game_id = p_game_id
      AND lower(email) = v_email
      AND lower(team_name) = lower(v_team)
      AND archived_at IS NULL
      AND coalesce(admin_notes, '') NOT LIKE '%[ARCHIVED%'
  ) THEN
    RAISE EXCEPTION 'Duplicate registration';
  END IF;

  INSERT INTO public.registrations (team_name, game_id, captain_name, email, phone, institution)
  VALUES (v_team, p_game_id, v_captain, v_email, v_phone, nullif(trim(coalesce(p_institution, '')), ''))
  RETURNING id, registration_ref INTO v_reg_id, v_ref;

  INSERT INTO public.players (
    registration_id,
    player_name,
    gamer_tag,
    institution_type,
    institution_name,
    course_or_class,
    current_year_or_class
  )
  SELECT
    v_reg_id,
    trim(p.value->>'player_name'),
    trim(p.value->>'gamer_tag'),
    trim(p.value->>'institution_type'),
    trim(p.value->>'institution_name'),
    trim(p.value->>'course_or_class'),
    trim(p.value->>'current_year_or_class')
  FROM jsonb_array_elements(p_players) AS p(value);

  IF v_game.max_teams IS NOT NULL
     AND v_game.max_teams > 0
     AND v_game.auto_close_at_capacity IS TRUE
     AND v_game.registration_override_open IS NOT TRUE
     AND (v_active_teams + 1) >= v_game.max_teams THEN
    UPDATE public.games
    SET registration_open = false,
        updated_by_email = 'auto-capacity',
        updated_at = now()
    WHERE id = p_game_id;
  END IF;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_esports_registration(text, uuid, text, text, text, text, jsonb, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_esports_registration(text, uuid, text, text, text, text, jsonb, boolean, text) TO anon, authenticated;

-- Immediate Phase 1 Requirement: Close Free Fire Registrations ONLY (idempotent once per deployment)
DO $$
DECLARE
  v_ff_ids uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'pre_event_free_fire_closure') THEN
    SELECT array_agg(id) INTO v_ff_ids
    FROM public.games
    WHERE upper(trim(title)) IN ('FREE FIRE', 'FREEFIRE') OR upper(title) LIKE '%FREE FIRE%';

    UPDATE public.games
    SET
      registration_open = false,
      registration_override_open = false,
      registration_closed_message = 'Free Fire registrations are currently closed. Teams that have already registered will not be affected.',
      updated_by_email = coalesce(updated_by_email, 'system-pre-event-setup'),
      updated_at = now()
    WHERE upper(trim(title)) IN ('FREE FIRE', 'FREEFIRE') OR upper(title) LIKE '%FREE FIRE%';

    INSERT INTO public.audit_logs (actor_id, action, entity_type, metadata)
    VALUES (
      NULL,
      'pre_event_free_fire_closure',
      'games',
      jsonb_build_object(
        'game_ids', coalesce(to_jsonb(v_ff_ids), '[]'::jsonb),
        'message', 'Free Fire registrations are currently closed. Teams that have already registered will not be affected.',
        'bgmi_and_valorant_untouched', true
      )
    );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Phase 2 & Phase 3 — Esports Backup Snapshot Table, Preview & Master Reset
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.esports_reset_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('results_only', 'selected_game', 'full_reset')),
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  game_title text,
  reason text NOT NULL,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_by_email text,
  counts_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_esports_reset_backups_created_at ON public.esports_reset_backups (created_at DESC);

ALTER TABLE public.esports_reset_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.esports_reset_backups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.esports_reset_backups TO authenticated;

DROP POLICY IF EXISTS "super_admin_select_esports_reset_backups" ON public.esports_reset_backups;
CREATE POLICY "super_admin_select_esports_reset_backups"
ON public.esports_reset_backups FOR SELECT
TO authenticated
USING (public._esports_reset_is_super_admin());

CREATE OR REPLACE FUNCTION public._build_esports_reset_preview_payload(
  p_scope text,
  p_game_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope text := lower(trim(coalesce(p_scope, '')));
  v_game_title text := NULL;
  v_matches_count integer := 0;
  v_results_count integer := 0;
  v_disputes_count integer := 0;
  v_history_count integer := 0;
  v_attendance_count integer := 0;
  v_tournaments_count integer := 0;
  v_selections_count integer := 0;

  v_pres_regs integer := 0;
  v_pres_players integer := 0;
  v_pres_visitors integer := 0;
  v_pres_tickets integer := 0;
  v_pres_checkins integer := 0;
  v_pres_games integer := 0;
  v_pres_audit integer := 0;
BEGIN
  IF v_scope NOT IN ('results_only', 'selected_game', 'full_reset') THEN
    RAISE EXCEPTION 'Invalid reset scope: %. Expected results_only, selected_game, or full_reset.', p_scope;
  END IF;

  IF p_game_id IS NOT NULL THEN
    SELECT title INTO v_game_title FROM public.games WHERE id = p_game_id;
    IF v_game_title IS NULL THEN
      RAISE EXCEPTION 'Selected game record not found.';
    END IF;
  ELSIF v_scope = 'selected_game' THEN
    RAISE EXCEPTION 'A game must be selected for single-game reset.';
  END IF;

  IF v_scope = 'results_only' THEN
    SELECT count(*) FILTER (WHERE status IN ('live', 'result_submitted', 'completed', 'disputed') OR winner_id IS NOT NULL OR score_a > 0 OR score_b > 0 OR coalesce(jsonb_array_length(br_results), 0) > 0)::integer
    INTO v_matches_count
    FROM public.matches
    WHERE (p_game_id IS NULL OR game_id = p_game_id);
    v_results_count := coalesce(v_matches_count, 0);
  ELSE
    SELECT count(*)::integer INTO v_matches_count
    FROM public.matches
    WHERE (p_game_id IS NULL OR game_id = p_game_id);
    SELECT count(*) FILTER (WHERE status IN ('live', 'result_submitted', 'completed', 'disputed') OR winner_id IS NOT NULL)::integer
    INTO v_results_count
    FROM public.matches
    WHERE (p_game_id IS NULL OR game_id = p_game_id);
  END IF;

  IF to_regclass('public.match_disputes') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::integer FROM public.match_disputes md JOIN public.matches m ON m.id = md.match_id WHERE ($1 IS NULL OR m.game_id = $1)'
      INTO v_disputes_count USING p_game_id;
  END IF;

  IF to_regclass('public.match_result_history') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::integer FROM public.match_result_history h JOIN public.matches m ON m.id = h.match_id WHERE ($1 IS NULL OR m.game_id = $1)'
      INTO v_history_count USING p_game_id;
  END IF;

  IF to_regclass('public.match_attendance') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::integer FROM public.match_attendance ma JOIN public.matches m ON m.id = ma.match_id WHERE ($1 IS NULL OR m.game_id = $1)'
      INTO v_attendance_count USING p_game_id;
  END IF;

  IF to_regclass('public.tournaments') IS NOT NULL THEN
    SELECT count(*)::integer INTO v_tournaments_count
    FROM public.tournaments
    WHERE (p_game_id IS NULL OR game_id = p_game_id);
  END IF;

  IF v_scope = 'results_only' THEN
    v_selections_count := 0;
  ELSE
    SELECT count(*)::integer INTO v_selections_count
    FROM public.registrations
    WHERE (p_game_id IS NULL OR game_id = p_game_id)
      AND (
        seed_number IS NOT NULL
        OR group_name IS NOT NULL
        OR selection_reason IS NOT NULL
        OR (status = 'confirmed' AND coalesce(selection_status, 'awaiting_selection') <> 'awaiting_selection')
      );
  END IF;

  SELECT count(*)::integer INTO v_pres_regs FROM public.registrations;
  SELECT count(*)::integer INTO v_pres_players FROM public.players;
  SELECT count(*)::integer INTO v_pres_visitors FROM public.visitor_registrations;
  IF to_regclass('public.tickets') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::integer FROM public.tickets' INTO v_pres_tickets;
  END IF;
  IF to_regclass('public.check_ins') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::integer FROM public.check_ins' INTO v_pres_checkins;
  END IF;
  SELECT count(*)::integer INTO v_pres_games FROM public.games;
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::integer FROM public.audit_logs' INTO v_pres_audit;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'scope', v_scope,
    'game_id', p_game_id,
    'game_title', v_game_title,
    'affected', jsonb_build_object(
      'matches', coalesce(v_matches_count, 0),
      'results', coalesce(v_results_count, 0),
      'disputes', coalesce(v_disputes_count, 0),
      'history', coalesce(v_history_count, 0),
      'match_attendance', coalesce(v_attendance_count, 0),
      'tournaments', coalesce(v_tournaments_count, 0),
      'team_selections', coalesce(v_selections_count, 0)
    ),
    'preserved', jsonb_build_object(
      'esports_registrations', coalesce(v_pres_regs, 0),
      'players', coalesce(v_pres_players, 0),
      'visitor_registrations', coalesce(v_pres_visitors, 0),
      'tickets', coalesce(v_pres_tickets, 0),
      'gate_checkins', coalesce(v_pres_checkins, 0),
      'games', coalesce(v_pres_games, 0),
      'audit_logs', coalesce(v_pres_audit, 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public._build_esports_reset_preview_payload(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_esports_reset_preview(
  p_scope text,
  p_game_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._esports_reset_is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only an active Super Admin can inspect tournament reset previews.';
  END IF;
  RETURN public._build_esports_reset_preview_payload(p_scope, p_game_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_esports_reset_preview(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_esports_reset_preview(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._execute_esports_reset_internal(
  p_scope text,
  p_game_id uuid,
  p_reason text,
  p_actor_id uuid,
  p_actor_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope text := lower(trim(coalesce(p_scope, '')));
  v_preview jsonb;
  v_game_title text;
  v_backup_id uuid;
  v_snapshot jsonb;
  v_snap_matches jsonb := '[]'::jsonb;
  v_snap_tournaments jsonb := '[]'::jsonb;
  v_snap_disputes jsonb := '[]'::jsonb;
  v_snap_history jsonb := '[]'::jsonb;
  v_snap_attendance jsonb := '[]'::jsonb;
  v_snap_reg_sel jsonb := '[]'::jsonb;
  v_snap_games jsonb := '[]'::jsonb;
  v_target_match_ids uuid[];
BEGIN
  v_preview := public._build_esports_reset_preview_payload(v_scope, p_game_id);
  v_game_title := v_preview ->> 'game_title';

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_target_match_ids
  FROM public.matches
  WHERE (p_game_id IS NULL OR game_id = p_game_id);

  SELECT coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) INTO v_snap_matches
  FROM public.matches m
  WHERE (p_game_id IS NULL OR m.game_id = p_game_id);

  IF to_regclass('public.tournaments') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.tournaments t WHERE ($1 IS NULL OR t.game_id = $1)'
      INTO v_snap_tournaments USING p_game_id;
  END IF;

  IF to_regclass('public.match_disputes') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(md)), ''[]''::jsonb) FROM public.match_disputes md WHERE md.match_id = ANY($1)'
      INTO v_snap_disputes USING v_target_match_ids;
  END IF;

  IF to_regclass('public.match_result_history') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(h)), ''[]''::jsonb) FROM public.match_result_history h WHERE h.match_id = ANY($1)'
      INTO v_snap_history USING v_target_match_ids;
  END IF;

  IF to_regclass('public.match_attendance') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(ma)), ''[]''::jsonb) FROM public.match_attendance ma WHERE ma.match_id = ANY($1)'
      INTO v_snap_attendance USING v_target_match_ids;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'game_id', r.game_id,
        'registration_ref', r.registration_ref,
        'status', r.status,
        'selection_status', r.selection_status,
        'seed_number', r.seed_number,
        'group_name', r.group_name,
        'selection_reason', r.selection_reason
      )
    ),
    '[]'::jsonb
  ) INTO v_snap_reg_sel
  FROM public.registrations r
  WHERE (p_game_id IS NULL OR r.game_id = p_game_id);

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'title', g.title,
        'tournament_status', g.tournament_status,
        'assigned_conductor_ids', g.assigned_conductor_ids
      )
    ),
    '[]'::jsonb
  ) INTO v_snap_games
  FROM public.games g
  WHERE (p_game_id IS NULL OR g.id = p_game_id);

  v_snapshot := jsonb_build_object(
    'captured_at', now(),
    'scope', v_scope,
    'game_id', p_game_id,
    'games', v_snap_games,
    'tournaments', v_snap_tournaments,
    'matches', v_snap_matches,
    'match_disputes', v_snap_disputes,
    'match_result_history', v_snap_history,
    'match_attendance', v_snap_attendance,
    'registration_selections', v_snap_reg_sel
  );

  INSERT INTO public.esports_reset_backups (
    scope,
    game_id,
    game_title,
    reason,
    triggered_by,
    triggered_by_email,
    counts_summary,
    snapshot_payload
  )
  VALUES (
    v_scope,
    p_game_id,
    v_game_title,
    trim(p_reason),
    p_actor_id,
    p_actor_email,
    v_preview,
    v_snapshot
  )
  RETURNING id INTO v_backup_id;

  -- Clear dependent match records safely without TRUNCATE CASCADE
  IF array_length(v_target_match_ids, 1) IS NOT NULL THEN
    IF to_regclass('public.match_disputes') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.match_disputes WHERE match_id = ANY($1)' USING v_target_match_ids;
    END IF;
    IF to_regclass('public.match_result_history') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.match_result_history WHERE match_id = ANY($1)' USING v_target_match_ids;
    END IF;
    IF to_regclass('public.match_attendance') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.match_attendance WHERE match_id = ANY($1)' USING v_target_match_ids;
    END IF;
  END IF;

  IF v_scope = 'results_only' THEN
    UPDATE public.matches
    SET
      score_a = 0,
      score_b = 0,
      winner_id = NULL,
      br_results = '[]'::jsonb,
      detailed_scores = NULL,
      status = CASE WHEN scheduled_start IS NOT NULL THEN 'scheduled' ELSE 'upcoming' END,
      result_status = 'pending',
      submitted_by = NULL,
      submitted_at = NULL,
      confirmed_by = NULL,
      confirmed_at = NULL,
      bracket_advanced_at = NULL,
      is_published = false,
      undo_count = 0,
      last_undone_at = NULL,
      last_undone_by = NULL,
      undo_reason = NULL,
      updated_at = now()
    WHERE (p_game_id IS NULL OR game_id = p_game_id);

    IF to_regclass('public.tournaments') IS NOT NULL THEN
      UPDATE public.tournaments
      SET
        champion_team_id = NULL,
        has_started = false,
        status = CASE WHEN status = 'completed' THEN 'bracket_ready' ELSE status END,
        updated_at = now()
      WHERE (p_game_id IS NULL OR game_id = p_game_id);
    END IF;

    UPDATE public.games
    SET
      tournament_status = CASE WHEN tournament_status IN ('in_progress', 'completed') THEN 'bracket_ready' ELSE coalesce(tournament_status, 'draft') END,
      updated_at = now()
    WHERE (p_game_id IS NULL OR id = p_game_id);
  ELSE
    DELETE FROM public.matches
    WHERE (p_game_id IS NULL OR game_id = p_game_id);

    UPDATE public.registrations
    SET
      selection_status = CASE WHEN status = 'confirmed' THEN 'awaiting_selection' ELSE 'not_selected' END,
      seed_number = NULL,
      group_name = NULL,
      selection_reason = NULL,
      updated_at = now()
    WHERE (p_game_id IS NULL OR game_id = p_game_id);

    IF to_regclass('public.tournaments') IS NOT NULL THEN
      UPDATE public.tournaments
      SET
        status = 'draft',
        has_started = false,
        champion_team_id = NULL,
        approved_team_limit = NULL,
        updated_at = now()
      WHERE (p_game_id IS NULL OR game_id = p_game_id);
    END IF;

    UPDATE public.games
    SET
      tournament_status = 'draft',
      assigned_conductor_ids = '{}'::uuid[],
      updated_at = now()
    WHERE (p_game_id IS NULL OR id = p_game_id);
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_actor_id,
    'esports_master_reset_' || v_scope,
    'tournaments',
    p_game_id,
    jsonb_build_object(
      'backup_id', v_backup_id,
      'scope', v_scope,
      'game_id', p_game_id,
      'game_title', v_game_title,
      'actor_email', p_actor_email,
      'reason', trim(p_reason),
      'affected', v_preview -> 'affected',
      'preserved', v_preview -> 'preserved'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'backup_id', v_backup_id,
    'scope', v_scope,
    'game_id', p_game_id,
    'game_title', v_game_title,
    'affected', v_preview -> 'affected',
    'preserved', v_preview -> 'preserved'
  );
END;
$$;

REVOKE ALL ON FUNCTION public._execute_esports_reset_internal(text, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.execute_esports_reset(
  p_scope text,
  p_game_id uuid DEFAULT NULL,
  p_confirmation_text text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_email text;
  v_scope text := lower(trim(coalesce(p_scope, '')));
  v_reason text := trim(coalesce(p_reason, ''));
BEGIN
  IF v_uid IS NULL OR NOT public._esports_reset_is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only an active Super Admin can execute a tournament reset.';
  END IF;

  IF v_scope = 'full_reset' AND upper(trim(coalesce(p_confirmation_text, ''))) <> 'RESET' THEN
    RAISE EXCEPTION 'Confirmation required: Type RESET exactly to confirm a Full Tournament Reset.';
  END IF;

  IF length(v_reason) < 4 THEN
    v_reason := CASE v_scope
      WHEN 'results_only' THEN 'Super Admin cleared match scores and results while keeping fixtures'
      WHEN 'selected_game' THEN 'Super Admin reset selected game tournament workspace'
      ELSE 'Super Admin executed full pre-event Esports Control Centre reset'
    END;
  END IF;

  SELECT coalesce(
    nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
    (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
    'super-admin@supernova'
  ) INTO v_actor_email;

  RETURN public._execute_esports_reset_internal(v_scope, p_game_id, v_reason, v_uid, v_actor_email);
END;
$$;

REVOKE ALL ON FUNCTION public.execute_esports_reset(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_esports_reset(text, uuid, text, text) TO authenticated;

-- Immediate Phase 2 Pre-Event Esports Control Centre Reset (runs once idempotently with backup)
DO $$
DECLARE
  v_res jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'pre_event_initial_esports_reset') THEN
    v_res := public._execute_esports_reset_internal(
      'full_reset',
      NULL,
      'Initial pre-event Supernova 3.0 Esports Control Centre clean-slate reset (20-21 Nov 2026)',
      NULL,
      'system-pre-event-setup'
    );

    INSERT INTO public.audit_logs (actor_id, action, entity_type, metadata)
    VALUES (
      NULL,
      'pre_event_initial_esports_reset',
      'tournaments',
      v_res
    );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Phase 4 & Phase 5 — Harden Gate Staff Access & Add CANCELLED / REVOKED Verdict
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gate_is_entry_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean := false;
  v_has_status boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'account_status'
  ) INTO v_has_status;

  IF v_has_status THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = v_uid
        AND p.account_status = 'active'
        AND ur.role IN ('super_admin', 'crm_admin', 'event_admin', 'registration_staff', 'checkin_staff', 'esports_entry_staff')
    ) INTO v_ok;
    RETURN coalesce(v_ok, false);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN ('super_admin', 'crm_admin', 'event_admin', 'registration_staff', 'checkin_staff', 'esports_entry_staff')
  ) INTO v_ok;
  RETURN coalesce(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public._gate_is_entry_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._gate_is_entry_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public._can_perform_checkin(
  p_subject_type text,
  p_require_override boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_has_perm_fn boolean := (to_regprocedure('public.has_crm_permission(text)') IS NOT NULL);
BEGIN
  IF v_uid IS NULL OR NOT public._gate_is_entry_staff() THEN
    RETURN false;
  END IF;

  IF p_require_override THEN
    IF v_has_perm_fn THEN
      RETURN public._gate_has_perm('entry:override_checkin');
    END IF;
    RETURN public.is_admin();
  END IF;

  IF v_has_perm_fn THEN
    IF p_subject_type = 'visitor' THEN
      RETURN public._gate_has_perm('entry:checkin_visitor')
          OR public._gate_has_perm('visitor:edit')
          OR public.is_admin();
    ELSIF p_subject_type = 'esports_player' THEN
      RETURN public._gate_has_perm('entry:checkin_esports')
          OR public._gate_has_perm('esports:edit')
          OR public.is_admin();
    ELSE
      RETURN public._gate_has_perm('entry:checkin_visitor')
          OR public._gate_has_perm('esports:edit')
          OR public.is_admin();
    END IF;
  END IF;

  RETURN public._gate_is_entry_staff();
END;
$$;

REVOKE ALL ON FUNCTION public._can_perform_checkin(text, boolean) FROM PUBLIC, anon, authenticated;

-- Upgrade verify_gate_ticket to distinguish VALID, ALREADY USED, CANCELLED / REVOKED, and INVALID
CREATE OR REPLACE FUNCTION public.verify_gate_ticket(
  p_query text,
  p_qr_token text DEFAULT NULL,
  p_event_day text DEFAULT '2026-11-20'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_clean_query text := trim(coalesce(p_query, ''));
  v_clean_token text := nullif(trim(coalesce(p_qr_token, '')), '');
  v_event_day text := CASE WHEN trim(coalesce(p_event_day, '')) = '2026-11-21' THEN '2026-11-21' ELSE '2026-11-20' END;
  v_tkt public.tickets%ROWTYPE;
  v_reg_status text;
  v_archived_at timestamptz;
  v_admin_notes text;
  v_existing_ci record;
  v_verdict text := 'INVALID';
  v_reason text := 'Ticket not found.';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Authentication required.');
  END IF;

  IF NOT public._gate_is_entry_staff() THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: Authorized Gate Entry Staff or Admin access required.');
  END IF;

  IF v_clean_query = '' AND v_clean_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'reason', 'Ticket reference or QR token is required.');
  END IF;

  IF v_clean_token IS NOT NULL THEN
    SELECT * INTO v_tkt FROM public.tickets WHERE qr_token = v_clean_token LIMIT 1;
  ELSIF v_clean_query ~ '^[a-fA-F0-9]{32,128}$' THEN
    SELECT * INTO v_tkt FROM public.tickets WHERE qr_token = lower(v_clean_query) LIMIT 1;
  END IF;

  IF v_tkt.id IS NULL AND v_clean_query <> '' THEN
    SELECT * INTO v_tkt
    FROM public.tickets
    WHERE upper(ticket_ref) = upper(v_clean_query)
       OR upper(registration_ref) = upper(v_clean_query)
    LIMIT 1;
  END IF;

  IF v_tkt.id IS NULL AND v_clean_query <> '' AND v_clean_token IS NULL AND v_clean_query !~ '^[a-fA-F0-9]{32,128}$' THEN
    DECLARE
      v_fb_vis record;
      v_fb_esp record;
      v_fb_plr record;
      v_fb_res jsonb;
    BEGIN
      SELECT id, registration_ref, status, archived_at, admin_notes INTO v_fb_vis
      FROM public.visitor_registrations
      WHERE upper(registration_ref) = upper(v_clean_query)
         OR upper(coalesce(ticket_ref, '')) = upper(v_clean_query)
      LIMIT 1;

      IF FOUND THEN
        IF public._is_registration_archived(v_fb_vis.archived_at, v_fb_vis.admin_notes) OR v_fb_vis.status IN ('declined', 'withdrawn') THEN
          RETURN jsonb_build_object('ok', true, 'verdict', 'CANCELLED / REVOKED', 'can_check_in', false, 'reason', 'Visitor pass ' || v_fb_vis.registration_ref || ' has been cancelled or revoked.');
        ELSIF v_fb_vis.status <> 'confirmed' THEN
          RETURN jsonb_build_object('ok', true, 'verdict', 'INVALID', 'can_check_in', false, 'reason', 'Visitor registration ' || v_fb_vis.registration_ref || ' status is "' || v_fb_vis.status || '" (not confirmed).');
        ELSE
          v_fb_res := public._issue_ticket_internal('visitor', v_fb_vis.id);
          SELECT * INTO v_tkt FROM public.tickets WHERE registration_category = 'visitor' AND registration_id = v_fb_vis.id LIMIT 1;
        END IF;
      ELSE
        SELECT id, registration_id INTO v_fb_plr
        FROM public.players
        WHERE upper(coalesce(player_ticket_ref, '')) = upper(v_clean_query)
           OR upper(coalesce(visitor_ticket_ref, '')) = upper(v_clean_query)
        LIMIT 1;

        SELECT id, registration_ref, status, archived_at, admin_notes INTO v_fb_esp
        FROM public.registrations
        WHERE (v_fb_plr.registration_id IS NOT NULL AND id = v_fb_plr.registration_id)
           OR upper(registration_ref) = upper(v_clean_query)
           OR upper(coalesce(captain_ticket_ref, '')) = upper(v_clean_query)
        LIMIT 1;

        IF FOUND THEN
          IF public._is_registration_archived(v_fb_esp.archived_at, v_fb_esp.admin_notes) OR v_fb_esp.status IN ('declined', 'withdrawn') THEN
            RETURN jsonb_build_object('ok', true, 'verdict', 'CANCELLED / REVOKED', 'can_check_in', false, 'reason', 'Esports pass ' || v_fb_esp.registration_ref || ' has been cancelled, declined, or revoked.');
          ELSIF v_fb_esp.status <> 'confirmed' THEN
            RETURN jsonb_build_object('ok', true, 'verdict', 'INVALID', 'can_check_in', false, 'reason', 'Esports registration ' || v_fb_esp.registration_ref || ' status is "' || v_fb_esp.status || '" (not confirmed).');
          ELSE
            v_fb_res := public._issue_ticket_internal('esports', v_fb_esp.id);
            SELECT * INTO v_tkt FROM public.tickets WHERE registration_category = 'esports' AND registration_id = v_fb_esp.id LIMIT 1;
          END IF;
        END IF;
      END IF;
    END;
  END IF;

  IF v_tkt.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'verdict', 'INVALID',
      'can_check_in', false,
      'reason', 'No issued ticket matches this ticket number or QR token.'
    );
  END IF;

  IF v_tkt.registration_category = 'participation' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'verdict', 'CANCELLED / REVOKED',
      'can_check_in', false,
      'reason', 'Participation tickets have been discontinued.'
    );
  END IF;

  IF v_tkt.registration_category = 'visitor' AND NOT (
    public._gate_has_perm('entry:scan_visitor') OR public._gate_has_perm('visitor:view') OR public.is_admin()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: You do not have permission to verify visitor passes.');
  ELSIF v_tkt.registration_category = 'esports' AND NOT (
    public._gate_has_perm('entry:scan_esports') OR public._gate_has_perm('esports:view') OR public.is_admin()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: You do not have permission to verify esports passes.');
  END IF;

  IF v_clean_token IS NOT NULL AND v_tkt.qr_token <> v_clean_token THEN
    RETURN jsonb_build_object(
      'ok', true,
      'verdict', 'INVALID',
      'can_check_in', false,
      'reason', 'QR token mismatch. Reject potential forged ticket.'
    );
  END IF;

  IF v_clean_query <> '' AND v_clean_query !~ '^[a-fA-F0-9]{32,128}$'
     AND upper(v_tkt.ticket_ref) <> upper(v_clean_query)
     AND upper(v_tkt.registration_ref) <> upper(v_clean_query)
  THEN
    RETURN jsonb_build_object(
      'ok', true,
      'verdict', 'INVALID',
      'can_check_in', false,
      'reason', 'Ticket reference mismatch against QR token.'
    );
  END IF;

  IF v_tkt.registration_category = 'visitor' THEN
    SELECT status, archived_at, admin_notes INTO v_reg_status, v_archived_at, v_admin_notes
    FROM public.visitor_registrations WHERE id = v_tkt.registration_id;
  ELSE
    SELECT status, archived_at, admin_notes INTO v_reg_status, v_archived_at, v_admin_notes
    FROM public.registrations WHERE id = v_tkt.registration_id;
  END IF;

  SELECT checked_in_at, coalesce(checked_in_by_email, checked_in_by::text) AS staff_ref
  INTO v_existing_ci
  FROM public.check_ins
  WHERE event_day = v_event_day
    AND coalesce(is_override, false) = false
    AND (
      ticket_id = v_tkt.id
      OR upper(coalesce(ticket_ref, '')) = upper(v_tkt.ticket_ref)
      OR upper(coalesce(ticket_ref, '')) = upper(v_tkt.registration_ref)
      OR (v_tkt.registration_category = 'visitor' AND visitor_registration_id = v_tkt.registration_id)
    )
  ORDER BY checked_in_at DESC
  LIMIT 1;

  IF v_tkt.status IN ('cancelled', 'revoked') THEN
    v_verdict := 'CANCELLED / REVOKED';
    v_reason := 'Ticket has been ' || v_tkt.status || ' and cannot be used for admission.';
  ELSIF v_tkt.status <> 'active' THEN
    v_verdict := 'INVALID';
    v_reason := 'Ticket status is "' || v_tkt.status || '".';
  ELSIF v_reg_status IS NULL THEN
    v_verdict := 'INVALID';
    v_reason := 'Associated registration record is missing.';
  ELSIF public._is_registration_archived(v_archived_at, v_admin_notes) OR v_reg_status IN ('declined', 'withdrawn') THEN
    v_verdict := 'CANCELLED / REVOKED';
    v_reason := 'Associated registration was archived, declined, or withdrawn.';
  ELSIF v_reg_status <> 'confirmed' THEN
    v_verdict := 'INVALID';
    v_reason := 'Associated registration status is "' || v_reg_status || '" (not confirmed).';
  ELSIF v_existing_ci.checked_in_at IS NOT NULL THEN
    v_verdict := 'ALREADY USED';
    v_reason := 'Ticket already checked in on ' || v_event_day || ' at ' || to_char(v_existing_ci.checked_in_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH12:MI AM') || ' IST.';
  ELSE
    v_verdict := 'VALID';
    v_reason := 'Authentic confirmed ticket eligible for gate admission on ' || v_event_day || '.';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'verdict', v_verdict,
    'can_check_in', (v_verdict = 'VALID'),
    'reason', v_reason,
    'ticket', jsonb_build_object(
      'id', v_tkt.id,
      'ticket_ref', v_tkt.ticket_ref,
      'registration_id', v_tkt.registration_id,
      'registration_category', v_tkt.registration_category,
      'registration_ref', v_tkt.registration_ref,
      'display_name', v_tkt.display_name,
      'subtitle', v_tkt.subtitle,
      'institution', v_tkt.institution,
      'metadata', v_tkt.metadata,
      'status', v_tkt.status,
      'registration_status', coalesce(v_reg_status, 'unknown'),
      'issued_at', v_tkt.issued_at,
      'checked_in_at', v_existing_ci.checked_in_at,
      'checked_in_by', CASE WHEN v_existing_ci.checked_in_at IS NOT NULL THEN v_tkt.checked_in_by ELSE NULL END,
      'checked_in_by_email', v_existing_ci.staff_ref
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_gate_ticket(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_gate_ticket(text, text, text) TO authenticated;

-- Ensure Realtime & PostgREST Schema Reload
DO $$
DECLARE
  v_tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_tbl IN ARRAY ARRAY['games', 'players', 'registrations', 'tournaments', 'matches']
    LOOP
      IF to_regclass('public.' || v_tbl) IS NOT NULL
         AND NOT EXISTS (
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
