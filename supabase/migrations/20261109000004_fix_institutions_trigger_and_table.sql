-- ============================================================================
-- SUPERNOVA 3.0 — PRODUCTION DATABASE MIGRATION REPAIR & ACTIVATION
-- Migration Version: 20261109000004_fix_institutions_trigger_and_table.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
--
-- Description:
--   1. Fixes the SQLSTATE 42P01 error on DROP TRIGGER IF EXISTS trg_audit_institutions
--      by ensuring safe, dynamic trigger handling when tables are created or modified.
--   2. Ensures public.institutions exists with full schema support for both:
--      - Admin Management UI (role, description, is_published, sort_order)
--      - Registration Forms & Verification (code, institution_type, city, state, is_verified)
--   3. Ensures public.participation_registrations & public.registration_controls exist
--      (which were blocked when the earlier migration aborted at statement 50).
--   4. Configures idempotent audit triggers, RLS policies, and Realtime publications.
--   5. Safe to rerun multiple times without data loss or duplicate objects.
-- ============================================================================

-- 1. INSTITUTIONS TABLE (SAFE CREATION & COLUMN VERIFICATION)
CREATE TABLE IF NOT EXISTS public.institutions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL UNIQUE,
  role text DEFAULT 'Participating Institution',
  description text,
  code text UNIQUE,
  institution_type text NOT NULL DEFAULT 'college' CHECK (institution_type IN ('school', 'puc', 'college', 'university', 'other')),
  city text NOT NULL DEFAULT 'Bengaluru',
  state text NOT NULL DEFAULT 'Karnataka',
  is_verified boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  contact_person text,
  contact_email text,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all columns exist if table was previously created with partial schema
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS role text DEFAULT 'Participating Institution';
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT true;
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS city text DEFAULT 'Bengaluru';
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS state text DEFAULT 'Karnataka';

CREATE INDEX IF NOT EXISTS idx_institutions_published ON public.institutions (is_published);
CREATE INDEX IF NOT EXISTS idx_institutions_sort_order ON public.institutions (sort_order);

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.institutions TO anon, authenticated;
GRANT ALL ON public.institutions TO authenticated;

DROP POLICY IF EXISTS "public_read_institutions" ON public.institutions;
CREATE POLICY "public_read_institutions"
ON public.institutions FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "admin_manage_institutions" ON public.institutions;
CREATE POLICY "admin_manage_institutions"
ON public.institutions FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'event_admin')
  )
);

-- 2. SAFE AUDIT TRIGGER ON INSTITUTIONS
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'institutions'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_institutions ON public.institutions';
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'log_admin_audit'
    ) THEN
      EXECUTE 'CREATE TRIGGER trg_audit_institutions
               AFTER INSERT OR UPDATE OR DELETE ON public.institutions
               FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit()';
    END IF;
  END IF;
END $$;

-- 3. SEED INITIAL CENTENARY & PARTICIPATING INSTITUTIONS
INSERT INTO public.institutions (id, name, role, description, code, institution_type, city, state, sort_order)
VALUES
  ('inst-1', 'The National College, Basavanagudi', 'Host & Autonomous Lead College', 'Centenary campus hosting Science Expo, Animation Showcase and Esports Tournament arenas.', 'NCB', 'college', 'Bengaluru', 'Karnataka', 1),
  ('inst-2', 'The National College, Jayanagar', 'Co-Organising Centenary College', 'Premier degree campus collaborating across science demonstrations and event staging.', 'NCJ', 'college', 'Bengaluru', 'Karnataka', 2),
  ('inst-3', 'National Pre-University College', 'Higher Secondary Science & Commerce', 'Basavanagudi higher secondary students leading physics models, Olympiad prototypes, and volunteer desks.', 'NPUC', 'puc', 'Bengaluru', 'Karnataka', 3),
  ('inst-4', 'National High School, Basavanagudi', 'Secondary Heritage School', 'Historic secondary academy alumni and students presenting science exhibitions and competitive robotics.', 'NHSB', 'school', 'Bengaluru', 'Karnataka', 4),
  ('inst-5', 'National English School', 'Foundational & Middle School', 'Primary and middle school teams presenting environmental inventions and arts models in the Kids Pavilion.', 'NES', 'school', 'Bengaluru', 'Karnataka', 5),
  ('inst-6', 'BMS College of Engineering', 'Invited Engineering Partner', 'Collegiate robotics and tech challenge competitor teams.', 'BMSCE', 'college', 'Bengaluru', 'Karnataka', 6),
  ('inst-7', 'PES University', 'Invited University Partner', 'Collegiate competitive esports rosters and AI project teams.', 'PESU', 'university', 'Bengaluru', 'Karnataka', 7),
  ('inst-8', 'RV College of Engineering', 'Invited Technical Institution', 'Collegiate science project displays and hackathon delegates.', 'RVCE', 'college', 'Bengaluru', 'Karnataka', 8),
  ('inst-9', 'MS Ramaiah Institute of Technology', 'Participating Institution', 'Technical college project and gaming tournament delegates.', 'MSRIT', 'college', 'Bengaluru', 'Karnataka', 9),
  ('inst-10', 'Dayananda Sagar College of Engineering', 'Participating Institution', 'Engineering student exhibitors and competitive gaming squads.', 'DSCE', 'college', 'Bengaluru', 'Karnataka', 10),
  ('inst-11', 'Bangalore Institute of Technology', 'Participating Institution', 'Centenary neighbouring engineering campus delegates.', 'BIT', 'college', 'Bengaluru', 'Karnataka', 11),
  ('inst-12', 'St. Joseph''s University', 'Participating University', 'Higher education animation and digital media participants.', 'SJU', 'university', 'Bengaluru', 'Karnataka', 12),
  ('inst-13', 'Mount Carmel College', 'Participating Institution', 'Science exhibition presenters and collegiate esports teams.', 'MCC', 'college', 'Bengaluru', 'Karnataka', 13),
  ('inst-14', 'Christ University', 'Participating University', 'University student delegates and innovation challenge teams.', 'CHRIST', 'university', 'Bengaluru', 'Karnataka', 14)
ON CONFLICT (name) DO UPDATE SET
  role = EXCLUDED.role,
  description = EXCLUDED.description,
  is_published = true;

-- 4. ENSURE PARTICIPATION_REGISTRATIONS TABLE (IF SKIPPED)
CREATE TABLE IF NOT EXISTS public.participation_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_ref text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  institution text,
  participant_category text NOT NULL,
  participation_area text NOT NULL,
  project_title text,
  project_description text,
  team_members_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.participation_registrations ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.participation_registrations TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.participation_registrations TO authenticated;

-- Ensure sequence reference generator trigger for participation
CREATE OR REPLACE FUNCTION set_participation_registration_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.registration_ref IS NULL OR NEW.registration_ref = '' THEN
    NEW.registration_ref := generate_registration_ref();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_participation_registration_ref ON public.participation_registrations;
CREATE TRIGGER trg_set_participation_registration_ref
BEFORE INSERT ON public.participation_registrations
FOR EACH ROW EXECUTE FUNCTION set_participation_registration_ref();

-- Safe audit trigger on participation_registrations
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'participation_registrations'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_participation_registrations ON public.participation_registrations';
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'log_admin_audit'
    ) THEN
      EXECUTE 'CREATE TRIGGER trg_audit_participation_registrations
               AFTER INSERT OR UPDATE OR DELETE ON public.participation_registrations
               FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit()';
    END IF;
  END IF;
END $$;

-- 5. ENSURE REGISTRATION_CONTROLS TABLE (IF SKIPPED)
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

INSERT INTO public.registration_controls (form_type, is_open, closed_message, opens_at, closes_at, intro_text, consent_text)
VALUES
  (
    'esports',
    true,
    'Esports tournament registrations are closed.',
    null,
    null,
    'Register rosters for VALORANT, FREE FIRE, or BGMI collegiate championships.',
    'I confirm all players are enrolled students and understand the tournament rules and schedule.'
  ),
  (
    'participation',
    true,
    'Project & exhibit registrations are closed.',
    null,
    null,
    'For student innovators, researchers, and animators presenting projects in dedicated festival booths.',
    'I confirm the exhibit contents are student work and agree to festival safety and attendance guidelines.'
  ),
  (
    'visitor',
    true,
    'Visitor registrations are closed.',
    null,
    null,
    'Free festival admission for students, parents, educators, and general visitors across both days.',
    'I understand that visitor entry is subject to campus capacity and event security policies.'
  )
ON CONFLICT (form_type) DO UPDATE SET updated_at = now();

-- Safe audit trigger on registration_controls
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'registration_controls'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_registration_controls ON public.registration_controls';
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'log_admin_audit'
    ) THEN
      EXECUTE 'CREATE TRIGGER trg_audit_registration_controls
               AFTER INSERT OR UPDATE OR DELETE ON public.registration_controls
               FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit()';
    END IF;
  END IF;
END $$;

-- 6. RPC: SUBMIT_PARTICIPATION_REGISTRATION
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
  SELECT is_open, closed_message, opens_at, closes_at INTO v_ctrl
  FROM public.registration_controls
  WHERE form_type = 'participation';

  IF FOUND THEN
    IF v_ctrl.is_open IS NOT TRUE THEN
      RAISE EXCEPTION 'Registrations are closed: %', coalesce(v_ctrl.closed_message, 'Project registrations are currently closed.');
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

-- 7. ENSURE REALTIME PUBLICATION COVERS ALL ACTIVE TABLES
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'matches',
    'announcements',
    'schedule_items',
    'games',
    'sponsors',
    'gallery_items',
    'event_settings',
    'faq_items',
    'site_content',
    'registrations',
    'players',
    'visitor_registrations',
    'participation_registrations',
    'registration_controls',
    'institutions',
    'check_ins'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', v_table);
      END IF;
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL;', v_table);
    END IF;
  END LOOP;
END $$;
