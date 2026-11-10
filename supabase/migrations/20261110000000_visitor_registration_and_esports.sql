-- ============================================================================
-- SUPERNOVA 3.0 — VISITOR REGISTRATION & ESPORTS ARENA ENHANCEMENT MIGRATION
-- Migration Version: 20261110000000_visitor_registration_and_esports.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Description:
--   1. Safely adds conditional student, faculty, and esports columns to visitor_registrations.
--   2. Preserves all existing registrations and schema policies.
--   3. Updates form_options to accept new category classifications.
--   4. Provides submit_visitor_registration_v2 and backwards-compatible submit_visitor_registration.
-- ============================================================================

-- 1. ADD CONDITIONAL VISITOR COLUMNS SAFELY (IDEMPOTENT)
ALTER TABLE public.visitor_registrations
  ADD COLUMN IF NOT EXISTS student_class text,
  ADD COLUMN IF NOT EXISTS student_id text,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS esports_interest boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_game text,
  ADD COLUMN IF NOT EXISTS esports_intent text,
  ADD COLUMN IF NOT EXISTS in_game_id text,
  ADD COLUMN IF NOT EXISTS team_name text,
  ADD COLUMN IF NOT EXISTS competition_notes text,
  ADD COLUMN IF NOT EXISTS days_attending text DEFAULT 'Both',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Add index on visitor_category and esports fields for administrative filtering
CREATE INDEX IF NOT EXISTS idx_visitor_registrations_category ON public.visitor_registrations (visitor_category);
CREATE INDEX IF NOT EXISTS idx_visitor_registrations_esports ON public.visitor_registrations (esports_interest, preferred_game);

-- 2. POPULATE FORM OPTIONS WITH NEW CATEGORIES
INSERT INTO public.form_options (form_type, field_key, value, label, sort_order, is_active)
VALUES
  ('visitor', 'visitor_category', 'Student', 'Student', 1, true),
  ('visitor', 'visitor_category', 'General Visitor', 'General Visitor', 2, true),
  ('visitor', 'visitor_category', 'Faculty / Staff', 'Faculty / Staff', 3, true)
ON CONFLICT DO NOTHING;

-- 3. CREATE V2 REGISTRATION RPC WITH FULL CONDITIONAL SUPPORT
CREATE OR REPLACE FUNCTION public.submit_visitor_registration_v2(
  p_full_name text,
  p_email text,
  p_phone text,
  p_institution text,
  p_visitor_category text,
  p_student_class text DEFAULT NULL,
  p_student_id text DEFAULT NULL,
  p_designation text DEFAULT NULL,
  p_esports_interest boolean DEFAULT false,
  p_preferred_game text DEFAULT NULL,
  p_esports_intent text DEFAULT NULL,
  p_in_game_id text DEFAULT NULL,
  p_team_name text DEFAULT NULL,
  p_competition_notes text DEFAULT NULL,
  p_days_attending text DEFAULT 'Both',
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
  v_clean_cat text := trim(coalesce(p_visitor_category, 'General Visitor'));
  v_meta jsonb := '{}'::jsonb;
BEGIN
  -- Check open/closed control
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

  -- Honeypot bot protection
  IF coalesce(p_website, '') <> '' THEN
    RAISE EXCEPTION 'Submission rejected';
  END IF;

  -- Validation
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'Consent is required';
  END IF;
  IF length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Enter a valid name between 2 and 120 characters';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;
  IF v_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Enter a valid mobile number (10 to 15 digits)';
  END IF;

  -- Rate limit per email address
  IF (SELECT count(*) FROM public.visitor_registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  -- Prevent duplicate email submissions
  IF EXISTS (SELECT 1 FROM public.visitor_registrations WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'A visitor registration already exists for this email address.';
  END IF;

  -- Build metadata object for flexibility
  v_meta := jsonb_build_object(
    'student_class', nullif(trim(coalesce(p_student_class, '')), ''),
    'student_id', nullif(trim(coalesce(p_student_id, '')), ''),
    'designation', nullif(trim(coalesce(p_designation, '')), ''),
    'esports_interest', coalesce(p_esports_interest, false),
    'preferred_game', nullif(trim(coalesce(p_preferred_game, '')), ''),
    'esports_intent', nullif(trim(coalesce(p_esports_intent, '')), ''),
    'in_game_id', nullif(trim(coalesce(p_in_game_id, '')), ''),
    'team_name', nullif(trim(coalesce(p_team_name, '')), ''),
    'competition_notes', nullif(trim(coalesce(p_competition_notes, '')), ''),
    'days_attending', coalesce(p_days_attending, 'Both')
  );

  INSERT INTO public.visitor_registrations (
    full_name,
    email,
    phone,
    institution,
    visitor_category,
    visitor_count,
    student_class,
    student_id,
    designation,
    esports_interest,
    preferred_game,
    esports_intent,
    in_game_id,
    team_name,
    competition_notes,
    days_attending,
    metadata,
    consent_given
  )
  VALUES (
    v_name,
    v_email,
    v_phone,
    nullif(trim(coalesce(p_institution, '')), ''),
    v_clean_cat,
    1,
    nullif(trim(coalesce(p_student_class, '')), ''),
    nullif(trim(coalesce(p_student_id, '')), ''),
    nullif(trim(coalesce(p_designation, '')), ''),
    coalesce(p_esports_interest, false),
    nullif(trim(coalesce(p_preferred_game, '')), ''),
    nullif(trim(coalesce(p_esports_intent, '')), ''),
    nullif(trim(coalesce(p_in_game_id, '')), ''),
    nullif(trim(coalesce(p_team_name, '')), ''),
    nullif(trim(coalesce(p_competition_notes, '')), ''),
    coalesce(p_days_attending, 'Both'),
    v_meta,
    true
  )
  RETURNING registration_ref INTO v_ref;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_visitor_registration_v2 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_registration_v2 TO anon, authenticated;

-- 4. UPDATE LEGACY submit_visitor_registration TO SAFELY STORE STRUCTURED DETAILS
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
  -- Strict open/closed enforcement
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

  IF (SELECT count(*) FROM public.visitor_registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (SELECT 1 FROM public.visitor_registrations WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Duplicate registration';
  END IF;

  INSERT INTO public.visitor_registrations (
    full_name,
    email,
    phone,
    institution,
    visitor_category,
    consent_given
  )
  VALUES (
    v_name,
    v_email,
    v_phone,
    nullif(trim(coalesce(p_institution, '')), ''),
    p_visitor_category,
    true
  )
  RETURNING registration_ref INTO v_ref;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_visitor_registration(text, text, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_registration(text, text, text, text, text, boolean, text) TO anon, authenticated;
