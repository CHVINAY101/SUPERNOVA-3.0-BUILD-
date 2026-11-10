-- Migration 0012: Dynamic Form Options & Server-Side Category Validation
-- Safe to run multiple times (idempotent)

-- 1. Create form_options table
CREATE TABLE IF NOT EXISTS public.form_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type text NOT NULL CHECK (form_type IN ('participation', 'visitor', 'esports')),
  field_key text NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_options_lookup ON public.form_options (form_type, field_key, is_active);

ALTER TABLE public.form_options ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.form_options TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.form_options TO authenticated;

DROP POLICY IF EXISTS "public_read_form_options" ON public.form_options;
CREATE POLICY "public_read_form_options"
ON public.form_options FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "admin_insert_form_options" ON public.form_options;
CREATE POLICY "admin_insert_form_options"
ON public.form_options FOR INSERT
TO authenticated
WITH CHECK (public.is_content_admin());

DROP POLICY IF EXISTS "admin_update_form_options" ON public.form_options;
CREATE POLICY "admin_update_form_options"
ON public.form_options FOR UPDATE
TO authenticated
USING (public.is_content_admin())
WITH CHECK (public.is_content_admin());

DROP POLICY IF EXISTS "admin_delete_form_options" ON public.form_options;
CREATE POLICY "admin_delete_form_options"
ON public.form_options FOR DELETE
TO authenticated
USING (public.is_content_admin());

-- Attach audit trigger
DROP TRIGGER IF EXISTS trg_audit_form_options ON public.form_options;
CREATE TRIGGER trg_audit_form_options
AFTER INSERT OR UPDATE OR DELETE ON public.form_options
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

-- 2. Seed initial choices
INSERT INTO public.form_options (form_type, field_key, label, value, sort_order, is_active)
VALUES
  ('participation', 'participant_category', 'School Student (Classes 6–10)', 'School Student (Classes 6–10)', 1, true),
  ('participation', 'participant_category', 'PUC / High School (+2)', 'PUC / High School (+2)', 2, true),
  ('participation', 'participant_category', 'Undergraduate / College Team', 'Undergraduate / College Team', 3, true),
  ('participation', 'participant_category', 'Postgraduate / Academic Researcher', 'Postgraduate / Academic Researcher', 4, true),
  ('participation', 'participant_category', 'Independent Innovator', 'Independent Innovator', 5, true),
  ('participation', 'participation_area', 'Science Expo (Working Models & Experiments)', 'Science Expo', 1, true),
  ('participation', 'participation_area', 'School Kids'' Exhibition (Creative Innovations)', 'School Kids'' Exhibition', 2, true),
  ('participation', 'participation_area', 'Department of Animation Showcase (VFX & 3D)', 'Department of Animation Showcase', 3, true),
  ('visitor', 'visitor_category', 'School student', 'School student', 1, true),
  ('visitor', 'visitor_category', 'College student', 'College student', 2, true),
  ('visitor', 'visitor_category', 'Teacher or educator', 'Teacher or educator', 3, true),
  ('visitor', 'visitor_category', 'Parent or guardian', 'Parent or guardian', 4, true),
  ('visitor', 'visitor_category', 'Working professional', 'Working professional', 5, true),
  ('visitor', 'visitor_category', 'General visitor', 'General visitor', 6, true),
  ('visitor', 'visitor_category', 'Other', 'Other', 7, true)
ON CONFLICT DO NOTHING;

-- 3. Update submit_visitor_registration with dynamic form_options validation
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
  IF p_institution IS NOT NULL AND length(trim(p_institution)) > 120 THEN
    RAISE EXCEPTION 'Invalid institution';
  END IF;

  -- Validate against active form_options if configured in database
  IF EXISTS (SELECT 1 FROM public.form_options WHERE form_type = 'visitor' AND field_key = 'visitor_category') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.form_options
      WHERE form_type = 'visitor'
        AND field_key = 'visitor_category'
        AND is_active = true
        AND (value = p_visitor_category OR label = p_visitor_category)
    ) THEN
      RAISE EXCEPTION 'Invalid visitor category selection';
    END IF;
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
