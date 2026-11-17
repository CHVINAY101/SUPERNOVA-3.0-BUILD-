-- ==============================================================================
-- SUPERNOVA 3.0 — ESPORTS GAME-WISE REGISTRATION CONTROL & PLAYER EDUCATION
-- Migration: 20261123000000_esports_game_controls_and_player_education.sql
-- Safe, Self-Contained & Idempotent (preserves all historical records)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend public.games with Per-Game Registration Control & Capacity Fields
-- ------------------------------------------------------------------------------
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS registration_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_teams integer,
  ADD COLUMN IF NOT EXISTS auto_close_at_capacity boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS registration_override_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_closed_message text;

-- Ensure max_teams is valid when configured
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

-- Ensure official 3 games exist without overwriting existing customizations
INSERT INTO public.games (title, team_size, is_active, is_published, sort_order, registration_open, auto_close_at_capacity)
SELECT v.title, v.team_size, true, true, v.sort_order, true, true
FROM (VALUES ('VALORANT', 5, 1), ('FREE FIRE', 4, 2), ('BGMI', 4, 3)) AS v(title, team_size, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.games g WHERE upper(trim(g.title)) = v.title);

-- ------------------------------------------------------------------------------
-- 2. Extend public.players with Mandatory Educational Details (Nullable in DB
--    to Preserve Historical Rows; Strictly Enforced for New Registrations)
-- ------------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_players_institution_type
  ON public.players (institution_type);

CREATE INDEX IF NOT EXISTS idx_players_institution_name_lower
  ON public.players (lower(institution_name));

CREATE INDEX IF NOT EXISTS idx_players_course_or_class_lower
  ON public.players (lower(course_or_class));

CREATE INDEX IF NOT EXISTS idx_players_current_year_or_class_lower
  ON public.players (lower(current_year_or_class));

-- Ensure archived_at exists on registrations if earlier soft-delete migration wasn't run
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ------------------------------------------------------------------------------
-- 3. Update RLS on public.games for Authorized Esports & System Settings Staff
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 4. Safe Non-PII Availability & Team Counter RPC (Public & Admin Safe)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 5. Admin RPC to Manage Per-Game Registration Controls & Capacity Overrides
-- ------------------------------------------------------------------------------
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
  v_game public.games%ROWTYPE;
  v_active_count integer;
  v_next_open boolean;
  v_next_override boolean;
  v_next_max integer;
  v_next_auto_close boolean;
  v_next_msg text;
  v_action text := lower(trim(coalesce(p_action, 'update_settings')));
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
    -- If already at/above capacity when opening, mark override so submissions are unlocked cleanly
    v_next_override := (v_next_max IS NOT NULL AND v_active_count >= v_next_max);
  ELSE
    -- update_settings
    v_next_open := v_game.registration_open;
    v_next_override := v_game.registration_override_open;

    -- If admin raised capacity above current active count, clear prior capacity override
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
    updated_at = now()
  WHERE id = p_game_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid,
    'esports_registration_control_' || v_action,
    'games',
    p_game_id,
    jsonb_build_object(
      'game_title', v_game.title,
      'previous_registration_open', v_game.registration_open,
      'next_registration_open', v_next_open,
      'previous_max_teams', v_game.max_teams,
      'next_max_teams', v_next_max,
      'registration_override_open', v_next_override,
      'auto_close_at_capacity', v_next_auto_close,
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
    'active_capacity_teams', v_active_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_esports_game_registration_control(uuid, text, integer, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_esports_game_registration_control(uuid, text, integer, boolean, boolean, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. Upgrade submit_esports_registration(...) with:
--    - Row-level locking on public.games (FOR UPDATE)
--    - Per-game open/close enforcement
--    - Capacity enforcement & automatic closure on reaching N-th team
--    - Capacity override support when admin explicitly reopens
--    - Mandatory per-player Educational Details validation & persistence
-- ------------------------------------------------------------------------------
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
  -- 1. Global esports stream control check
  SELECT is_open, closed_message, opens_at, closes_at INTO v_ctrl
  FROM public.registration_controls
  WHERE form_type = 'esports';

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

  -- 2. Basic anti-bot & team contact validations
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

  -- 3. Lock the selected game row to prevent concurrent capacity races
  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
    AND is_active = true
    AND is_published = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game is not open for registration';
  END IF;

  -- 4. Per-game registration status check
  IF v_game.registration_open IS NOT TRUE THEN
    RAISE EXCEPTION 'Registrations are closed for %: %',
      v_game.title,
      coalesce(
        nullif(trim(v_game.registration_closed_message), ''),
        v_game.title || ' registrations are currently closed.'
      );
  END IF;

  -- 5. Per-game team capacity check (declined, withdrawn & archived teams free their slots)
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

  -- 6. Validate exact player count and mandatory per-player details + educational info
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

  -- 7. Rate limit & duplicate guard (ignore archived duplicates)
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

  -- 8. Insert team registration & all players with educational details
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

  -- 9. Auto-close registration immediately after accepting the N-th team at capacity
  IF v_game.max_teams IS NOT NULL
     AND v_game.max_teams > 0
     AND v_game.auto_close_at_capacity IS TRUE
     AND v_game.registration_override_open IS NOT TRUE
     AND (v_active_teams + 1) >= v_game.max_teams THEN
    UPDATE public.games
    SET registration_open = false,
        updated_at = now()
    WHERE id = p_game_id;
  END IF;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_esports_registration(text, uuid, text, text, text, text, jsonb, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_esports_registration(text, uuid, text, text, text, text, jsonb, boolean, text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. Realtime Publication & PostgREST Schema Cache Reload
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_tbl IN ARRAY ARRAY['games', 'players', 'registrations']
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
