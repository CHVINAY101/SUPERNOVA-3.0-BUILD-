-- Migration 0010: Instant Registration Open/Close Controls & Database Enforcement
-- Safe to run multiple times (idempotent)

-- 1. Create registration_controls table
CREATE TABLE IF NOT EXISTS public.registration_controls (
  form_type text PRIMARY KEY CHECK (form_type IN ('esports', 'participation', 'visitor')),
  is_open boolean NOT NULL DEFAULT true,
  closed_message text,
  opens_at timestamptz,
  closes_at timestamptz,
  intro_text text,
  consent_text text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.registration_controls ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.registration_controls TO anon, authenticated;
GRANT UPDATE ON public.registration_controls TO authenticated;

DROP POLICY IF EXISTS "public_read_registration_controls" ON public.registration_controls;
CREATE POLICY "public_read_registration_controls"
ON public.registration_controls FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "admin_update_registration_controls" ON public.registration_controls;
CREATE POLICY "admin_update_registration_controls"
ON public.registration_controls FOR UPDATE
TO authenticated
USING (public.is_content_admin())
WITH CHECK (public.is_content_admin());

-- Attach audit logging trigger
DROP TRIGGER IF EXISTS trg_audit_registration_controls ON public.registration_controls;
CREATE TRIGGER trg_audit_registration_controls
AFTER INSERT OR UPDATE OR DELETE ON public.registration_controls
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

-- 2. Seed initial registration controls
INSERT INTO public.registration_controls (form_type, is_open, closed_message, opens_at, closes_at, intro_text, consent_text)
VALUES
  (
    'esports',
    true,
    'Esports squad registrations are currently closed.',
    null,
    null,
    'Register team rosters for collegiate championships in VALORANT (5 players), FREE FIRE (4 players), or BGMI (4 players).',
    'I confirm all team members are enrolled students and understand the tournament rules and schedule.'
  ),
  (
    'participation',
    true,
    'Student project & exhibit registrations are currently closed.',
    null,
    null,
    'For student innovators, research teams, school inventors, and animators showcasing projects in dedicated stalls.',
    'I confirm the exhibit contents are student work and agree to festival safety and attendance guidelines.'
  ),
  (
    'visitor',
    true,
    'Visitor registrations are currently closed.',
    null,
    null,
    'Free festival admission for school & college students, parents, teachers, and general visitors across both days.',
    'I understand that visitor entry is subject to campus capacity and event security policies.'
  )
ON CONFLICT (form_type) DO UPDATE SET
  updated_at = now();

-- 3. Update submit_esports_registration with database-level registration control check
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
  v_team_size integer;
  v_count integer;
  v_ref text;
  v_reg_id uuid;
  v_player jsonb;
  v_ctrl record;
BEGIN
  -- Strict open/closed enforcement at database level
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

  IF coalesce(p_website, '') <> '' THEN
    RAISE EXCEPTION 'Submission rejected';
  END IF;
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'Consent is required';
  END IF;
  IF length(v_team) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Invalid team name';
  END IF;
  IF length(v_captain) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Invalid representative name';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  IF v_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid mobile number';
  END IF;
  IF p_institution IS NOT NULL AND length(trim(p_institution)) > 120 THEN
    RAISE EXCEPTION 'Invalid institution';
  END IF;

  SELECT team_size INTO v_team_size
  FROM public.games
  WHERE id = p_game_id AND is_active AND is_published;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game is not open for registration';
  END IF;

  IF jsonb_typeof(p_players) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid player list';
  END IF;
  v_count := jsonb_array_length(p_players);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'At least one player is required';
  END IF;
  IF v_team_size IS NOT NULL AND v_count <> v_team_size THEN
    RAISE EXCEPTION 'Player count does not match team size';
  END IF;
  FOR v_player IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    IF length(trim(coalesce(v_player->>'player_name', ''))) NOT BETWEEN 2 AND 80 THEN
      RAISE EXCEPTION 'Invalid player name';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (SELECT 1 FROM public.registrations
             WHERE game_id = p_game_id AND lower(email) = v_email
               AND lower(team_name) = lower(v_team)) THEN
    RAISE EXCEPTION 'Duplicate registration';
  END IF;

  INSERT INTO public.registrations (team_name, game_id, captain_name, email, phone, institution)
  VALUES (v_team, p_game_id, v_captain, v_email, v_phone, nullif(trim(coalesce(p_institution, '')), ''))
  RETURNING id, registration_ref INTO v_reg_id, v_ref;

  INSERT INTO public.players (registration_id, player_name, gamer_tag)
  SELECT v_reg_id, trim(p.value->>'player_name'), nullif(trim(coalesce(p.value->>'gamer_tag', '')), '')
  FROM jsonb_array_elements(p_players) AS p(value);

  RETURN v_ref;
END;
$$;

-- 4. Update submit_visitor_registration with database-level registration control check
CREATE OR REPLACE FUNCTION public.submit_visitor_registration(
  p_full_name text,
  p_email text,
  p_phone text,
  p_institution text,
  p_visitor_category text,
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
  v_name text := trim(coalesce(p_full_name, ''));
  v_ref text;
  v_ctrl record;
BEGIN
  -- Strict open/closed enforcement at database level
  SELECT is_open, closed_message, opens_at, closes_at INTO v_ctrl
  FROM public.registration_controls
  WHERE form_type = 'visitor';

  IF FOUND THEN
    IF v_ctrl.is_open IS NOT TRUE THEN
      RAISE EXCEPTION 'Registrations are closed: %', coalesce(v_ctrl.closed_message, 'Visitor registrations are currently closed.');
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
  IF length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Invalid name';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  IF v_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid mobile number';
  END IF;
  IF p_institution IS NOT NULL AND length(trim(p_institution)) > 120 THEN
    RAISE EXCEPTION 'Invalid institution';
  END IF;

  IF (SELECT count(*) FROM public.visitor_registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (SELECT 1 FROM public.visitor_registrations WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Duplicate registration';
  END IF;

  INSERT INTO public.visitor_registrations (full_name, email, phone, institution, visitor_category, consent_given)
  VALUES (v_name, v_email, v_phone, nullif(trim(coalesce(p_institution, '')), ''), p_visitor_category, true)
  RETURNING registration_ref INTO v_ref;

  RETURN v_ref;
END;
$$;

-- 5. Create submit_participation_registration with database-level registration control check
CREATE OR REPLACE FUNCTION public.submit_participation_registration(
  p_full_name text,
  p_email text,
  p_phone text,
  p_institution text,
  p_category text,
  p_area text,
  p_project_title text,
  p_project_description text,
  p_team_size integer DEFAULT 1,
  p_consent boolean DEFAULT true,
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
  v_name text := trim(coalesce(p_full_name, ''));
  v_ref text;
  v_ctrl record;
BEGIN
  -- Strict open/closed enforcement at database level
  SELECT is_open, closed_message, opens_at, closes_at INTO v_ctrl
  FROM public.registration_controls
  WHERE form_type = 'participation';

  IF FOUND THEN
    IF v_ctrl.is_open IS NOT TRUE THEN
      RAISE EXCEPTION 'Registrations are closed: %', coalesce(v_ctrl.closed_message, 'Student project & exhibit registrations are currently closed.');
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
  IF length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Invalid name';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  IF v_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid mobile number';
  END IF;

  IF (SELECT count(*) FROM public.participation_registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  INSERT INTO public.participation_registrations (
    full_name, email, phone, institution,
    participant_category, participation_area,
    project_title, project_description, team_members_count
  )
  VALUES (
    v_name, v_email, v_phone, nullif(trim(coalesce(p_institution, '')), ''),
    p_category, p_area,
    nullif(trim(coalesce(p_project_title, '')), ''),
    nullif(trim(coalesce(p_project_description, '')), ''),
    coalesce(p_team_size, 1)
  )
  RETURNING registration_ref INTO v_ref;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_participation_registration(text, text, text, text, text, text, text, text, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_participation_registration(text, text, text, text, text, text, text, text, integer, boolean, text) TO anon, authenticated;
