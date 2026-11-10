/*
# Core: Profiles, User Roles, Admin Helper, and Event Settings

1. New Tables
- `profiles`
  - `id` (uuid PK, references auth.users.id on delete cascade)
  - `display_name` (text, nullable)
  - `created_at` (timestamptz, default now())
- `user_roles`
  - `id` (uuid PK)
  - `user_id` (uuid, references auth.users.id on delete cascade)
  - `role` (text, CHECK in: super_admin, event_admin, checkin_staff, score_operator)
  - `created_at` (timestamptz, default now())
  - Unique constraint on (user_id, role)
- `event_settings`
  - `id` (uuid PK)
  - `key` (text, unique, not null)
  - `label` (text, not null) — human-readable label for the admin UI
  - `value` (text, nullable) — configured value; null means "To be announced"
  - `is_published` (boolean, default false) — only published rows show on the public site
  - `category` (text, default 'general') — for grouping in the admin UI
  - `updated_by` (uuid, references auth.users.id, nullable)
  - `updated_at` (timestamptz, default now())

2. Helper Functions
- `is_admin()` — SECURITY DEFINER, STABLE function that returns true if the
  current auth user holds any admin role in user_roles. Used by RLS policies
  across all tables to gate admin-only access. Security definer is required
  because user_roles is not readable by the public role.
- `handle_new_user()` — trigger function that creates a profile row whenever
  a new auth.users row is inserted.

3. Security
- RLS enabled on profiles, user_roles, and event_settings.
- profiles: each authenticated user can read and update their own profile.
  No anon access.
- user_roles: only admin (via is_admin()) can SELECT/INSERT/UPDATE/DELETE.
  No anon or authenticated read — role data is private. The is_admin()
  helper reads it via SECURITY DEFINER so policies can reference it without
  exposing the table.
- event_settings: public (anon, authenticated) can SELECT only published
  rows; any admin role can perform full CRUD.
- Grants match the policies (minimum verbs per role).
- service_role granted on user_roles and event_settings for edge functions.

4. Important Notes
- Only super_admin is intended to be actively assigned in Stage 1; the
  other role values exist in the constraint for future stages.
- is_admin() is created BEFORE the policies that reference it.
*/

-- =========================================================
-- 1. Profiles
-- =========================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Auto-create a profile when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- 2. User Roles
-- =========================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin', 'event_admin', 'checkin_staff', 'score_operator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO service_role;

-- =========================================================
-- 3. Admin helper function — MUST exist before any policy references it
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- =========================================================
-- 4. User Roles policies (now that is_admin() exists)
-- =========================================================
DROP POLICY IF EXISTS "admin_manage_roles_select" ON public.user_roles;
CREATE POLICY "admin_manage_roles_select"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_role" ON public.user_roles;
CREATE POLICY "admin_insert_role"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_role" ON public.user_roles;
CREATE POLICY "admin_update_role"
ON public.user_roles FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_role" ON public.user_roles;
CREATE POLICY "admin_delete_role"
ON public.user_roles FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 5. Event Settings
-- =========================================================
CREATE TABLE IF NOT EXISTS public.event_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  value text,
  is_published boolean NOT NULL DEFAULT false,
  category text NOT NULL DEFAULT 'general',
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.event_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_settings TO service_role;

-- Public can read only published settings
DROP POLICY IF EXISTS "public_read_published_settings" ON public.event_settings;
CREATE POLICY "public_read_published_settings"
ON public.event_settings FOR SELECT
TO anon, authenticated
USING (is_published = true);

-- Admin can read all settings (including drafts)
DROP POLICY IF EXISTS "admin_read_all_settings" ON public.event_settings;
CREATE POLICY "admin_read_all_settings"
ON public.event_settings FOR SELECT
TO authenticated
USING (public.is_admin());

-- Admin can insert/update/delete settings
DROP POLICY IF EXISTS "admin_insert_settings" ON public.event_settings;
CREATE POLICY "admin_insert_settings"
ON public.event_settings FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_settings" ON public.event_settings;
CREATE POLICY "admin_update_settings"
ON public.event_settings FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_settings" ON public.event_settings;
CREATE POLICY "admin_delete_settings"
ON public.event_settings FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 6. Seed event settings with "To be announced" placeholders
-- =========================================================
INSERT INTO public.event_settings (key, label, value, is_published, category) VALUES
  ('event_title', 'Event Title', 'Supernova 3.0', true, 'general'),
  ('event_tagline', 'Event Tagline', 'The Next Generation of Competition', true, 'general'),
  ('event_dates', 'Event Dates', '20-21 November 2026', true, 'general'),
  ('venue', 'Venue', NULL, false, 'general'),
  ('daily_start_time', 'Daily Start Time', NULL, false, 'general'),
  ('daily_end_time', 'Daily End Time', NULL, false, 'general'),
  ('registration_open', 'Registration Opening Date', NULL, false, 'registration'),
  ('registration_close', 'Registration Closing Date', NULL, false, 'registration'),
  ('registration_fee', 'Registration Fee', NULL, false, 'registration'),
  ('eligibility', 'Eligibility', NULL, false, 'registration'),
  ('contact_phone', 'Contact Phone', NULL, false, 'contact'),
  ('contact_whatsapp', 'WhatsApp', NULL, false, 'contact'),
  ('contact_email', 'Contact Email', NULL, false, 'contact'),
  ('organiser_line', 'Organiser Line', 'National Education Society institutions with the Department of Animation', true, 'general'),
  ('privacy_notice', 'Privacy Notice', NULL, false, 'general')
ON CONFLICT (key) DO NOTHING;
