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
/*
# Content Management: Site Content, Games, Sponsors, Gallery, Schedule, FAQs

1. New Tables
- `site_content`
  - `id` (uuid PK)
  - `section` (text, not null) — e.g. home, about, science_expo,
    school_exhibition, animation, esports, visitor_info
  - `title` (text, not null)
  - `body` (text, nullable) — markdown or plain text content
  - `is_published` (boolean, default false)
  - `sort_order` (integer, default 0)
  - `updated_by` (uuid, references auth.users.id)
  - `updated_at` (timestamptz, default now())
  - Unique constraint on (section, sort_order) is NOT enforced to allow
    flexible ordering; instead a simple index is added.
- `games`
  - `id` (uuid PK)
  - `title` (text, not null)
  - `description` (text, nullable)
  - `rules` (text, nullable)
  - `team_size` (integer, nullable until organisers confirm)
  - `is_active` (boolean, default true)
  - `is_published` (boolean, default false)
  - `sort_order` (integer, default 0)
  - `created_at` / `updated_at` (timestamptz)
- `sponsors`
  - `id` (uuid PK)
  - `name` (text, not null)
  - `tier` (text, nullable) — e.g. Platinum, Gold, Silver, Partner
  - `description` (text, nullable)
  - `logo_url` (text, nullable) — Supabase Storage public URL
  - `link_url` (text, nullable) — sponsor website
  - `is_published` (boolean, default false)
  - `sort_order` (integer, default 0)
  - `created_at` / `updated_at`
- `gallery_items`
  - `id` (uuid PK)
  - `title` (text, nullable)
  - `description` (text, nullable)
  - `image_url` (text, not null) — Supabase Storage public URL
  - `category` (text, nullable) — e.g. 'promo', 'previous_edition', 'event_day'
  - `is_published` (boolean, default false)
  - `sort_order` (integer, default 0)
  - `created_at` / `updated_at`
- `schedule_items`
  - `id` (uuid PK)
  - `event_date` (date, not null) — the calendar date
  - `start_time` (time, nullable) — nullable until confirmed
  - `end_time` (time, nullable)
  - `title` (text, not null)
  - `description` (text, nullable)
  - `venue` (text, nullable)
  - `component` (text, nullable) — which event area: science_expo, school_exhibition, animation, esports, general
  - `is_published` (boolean, default false)
  - `sort_order` (integer, default 0)
  - `created_at` / `updated_at`
- `faq_items`
  - `id` (uuid PK)
  - `question` (text, not null)
  - `answer` (text, not null)
  - `category` (text, nullable)
  - `is_published` (boolean, default false)
  - `sort_order` (integer, default 0)
  - `created_at` / `updated_at`

2. Security
- RLS enabled on every table.
- Public (anon, authenticated) can SELECT only published rows.
- Any admin role can perform full CRUD (gated via is_admin()).
- Grants: SELECT to anon + authenticated; full CRUD to service_role.

3. Important Notes
- All content tables use is_published to control public visibility. Draft
  content is never exposed to the public site.
- No sensitive data is stored in these tables — only event information.
- Gallery images reference Supabase Storage URLs; the actual storage buckets
  will be configured in a later stage.
*/

-- =========================================================
-- 1. Site Content
-- =========================================================
CREATE TABLE IF NOT EXISTS public.site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  title text NOT NULL,
  body text,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_content_section ON public.site_content (section);
CREATE INDEX IF NOT EXISTS idx_site_content_published ON public.site_content (is_published);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.site_content TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content TO service_role;

DROP POLICY IF EXISTS "public_read_published_content" ON public.site_content;
CREATE POLICY "public_read_published_content"
ON public.site_content FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_content" ON public.site_content;
CREATE POLICY "admin_read_all_content"
ON public.site_content FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_content" ON public.site_content;
CREATE POLICY "admin_insert_content"
ON public.site_content FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_content" ON public.site_content;
CREATE POLICY "admin_update_content"
ON public.site_content FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_content" ON public.site_content;
CREATE POLICY "admin_delete_content"
ON public.site_content FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 2. Games
-- =========================================================
CREATE TABLE IF NOT EXISTS public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  rules text,
  team_size integer,
  is_active boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_games_published ON public.games (is_published);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.games TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO service_role;

DROP POLICY IF EXISTS "public_read_published_games" ON public.games;
CREATE POLICY "public_read_published_games"
ON public.games FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_games" ON public.games;
CREATE POLICY "admin_read_all_games"
ON public.games FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_game" ON public.games;
CREATE POLICY "admin_insert_game"
ON public.games FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_game" ON public.games;
CREATE POLICY "admin_update_game"
ON public.games FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_game" ON public.games;
CREATE POLICY "admin_delete_game"
ON public.games FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 3. Sponsors
-- =========================================================
CREATE TABLE IF NOT EXISTS public.sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tier text,
  description text,
  logo_url text,
  link_url text,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsors_published ON public.sponsors (is_published);

ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.sponsors TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsors TO service_role;

DROP POLICY IF EXISTS "public_read_published_sponsors" ON public.sponsors;
CREATE POLICY "public_read_published_sponsors"
ON public.sponsors FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_sponsors" ON public.sponsors;
CREATE POLICY "admin_read_all_sponsors"
ON public.sponsors FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_sponsor" ON public.sponsors;
CREATE POLICY "admin_insert_sponsor"
ON public.sponsors FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_sponsor" ON public.sponsors;
CREATE POLICY "admin_update_sponsor"
ON public.sponsors FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_sponsor" ON public.sponsors;
CREATE POLICY "admin_delete_sponsor"
ON public.sponsors FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 4. Gallery Items
-- =========================================================
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  description text,
  image_url text NOT NULL,
  category text,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_published ON public.gallery_items (is_published);
CREATE INDEX IF NOT EXISTS idx_gallery_category ON public.gallery_items (category);

ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.gallery_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gallery_items TO service_role;

DROP POLICY IF EXISTS "public_read_published_gallery" ON public.gallery_items;
CREATE POLICY "public_read_published_gallery"
ON public.gallery_items FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_gallery" ON public.gallery_items;
CREATE POLICY "admin_read_all_gallery"
ON public.gallery_items FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_gallery" ON public.gallery_items;
CREATE POLICY "admin_insert_gallery"
ON public.gallery_items FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_gallery" ON public.gallery_items;
CREATE POLICY "admin_update_gallery"
ON public.gallery_items FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_gallery" ON public.gallery_items;
CREATE POLICY "admin_delete_gallery"
ON public.gallery_items FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 5. Schedule Items
-- =========================================================
CREATE TABLE IF NOT EXISTS public.schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL,
  start_time time,
  end_time time,
  title text NOT NULL,
  description text,
  venue text,
  component text,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_date ON public.schedule_items (event_date);
CREATE INDEX IF NOT EXISTS idx_schedule_published ON public.schedule_items (is_published);

ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.schedule_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_items TO service_role;

DROP POLICY IF EXISTS "public_read_published_schedule" ON public.schedule_items;
CREATE POLICY "public_read_published_schedule"
ON public.schedule_items FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_schedule" ON public.schedule_items;
CREATE POLICY "admin_read_all_schedule"
ON public.schedule_items FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_schedule" ON public.schedule_items;
CREATE POLICY "admin_insert_schedule"
ON public.schedule_items FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_schedule" ON public.schedule_items;
CREATE POLICY "admin_update_schedule"
ON public.schedule_items FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_schedule" ON public.schedule_items;
CREATE POLICY "admin_delete_schedule"
ON public.schedule_items FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 6. FAQ Items
-- =========================================================
CREATE TABLE IF NOT EXISTS public.faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  category text,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faq_published ON public.faq_items (is_published);

ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.faq_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faq_items TO service_role;

DROP POLICY IF EXISTS "public_read_published_faqs" ON public.faq_items;
CREATE POLICY "public_read_published_faqs"
ON public.faq_items FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_faqs" ON public.faq_items;
CREATE POLICY "admin_read_all_faqs"
ON public.faq_items FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_faq" ON public.faq_items;
CREATE POLICY "admin_insert_faq"
ON public.faq_items FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_faq" ON public.faq_items;
CREATE POLICY "admin_update_faq"
ON public.faq_items FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_faq" ON public.faq_items;
CREATE POLICY "admin_delete_faq"
ON public.faq_items FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 7. Participating Schools & Institutions
-- =========================================================
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

-- Seed initial centenary and partner institutions
INSERT INTO public.institutions (id, name, role, description, code, institution_type, city, state, sort_order)
VALUES
  ('inst-1', 'The National College, Basavanagudi', 'Host & Autonomous Lead College', 'Centenary campus hosting Science Expo, Animation Showcase and Esports Tournament arenas.', 'NCB', 'college', 'Bengaluru', 'Karnataka', 1),
  ('inst-2', 'The National College, Jayanagar', 'Co-Organising Centenary College', 'Premier degree campus collaborating across science demonstrations and event staging.', 'NCJ', 'college', 'Bengaluru', 'Karnataka', 2),
  ('inst-3', 'National Pre-University College', 'Higher Secondary Science & Commerce', 'Basavanagudi higher secondary students leading physics models, Olympiad prototypes, and volunteer desks.', 'NPUC', 'puc', 'Bengaluru', 'Karnataka', 3),
  ('inst-4', 'National High School, Basavanagudi', 'Secondary Heritage School', 'Historic secondary academy alumni and students presenting science exhibitions and competitive robotics.', 'NHSB', 'school', 'Bengaluru', 'Karnataka', 4),
  ('inst-5', 'National English School', 'Foundational & Middle School', 'Primary and middle school teams presenting environmental inventions and arts models in the Kids Pavilion.', 'NES', 'school', 'Bengaluru', 'Karnataka', 5),
  ('inst-6', 'BMS College of Engineering', 'Invited Engineering Partner', 'Collegiate robotics and tech challenge competitor teams.', 'BMSCE', 'college', 'Bengaluru', 'Karnataka', 6),
  ('inst-7', 'PES University', 'Invited University Partner', 'Collegiate competitive esports rosters and AI project teams.', 'PESU', 'university', 'Bengaluru', 'Karnataka', 7),
  ('inst-8', 'RV College of Engineering', 'Invited Technical Institution', 'Collegiate science project displays and hackathon delegates.', 'RVCE', 'college', 'Bengaluru', 'Karnataka', 8)
ON CONFLICT (name) DO NOTHING;

/*
# Esports Operations: Registrations, Players, Matches, Check-ins, Announcements, Audit Logs

1. New Tables
- `registrations`
  - `id` (uuid PK)
  - `registration_ref` (text, unique, not null) — human-readable reference
    like SN3-26-000123, generated safely by database (see function below)
  - `team_name` (text, not null)
  - `game_id` (uuid, references games, on delete restrict)
  - `captain_name` (text, not null)
  - `email` (text, not null)
  - `phone` (text, not null)
  - `institution` (text, nullable)
  - `status` (text, CHECK in pending, confirmed, declined, correction_requested;
    DEFAULT pending)
  - `admin_notes` (text, nullable)
  - `submitted_at` (timestamptz, default now())
  - `created_at` / `updated_at`
  - Unique index on registration_ref.
- `players`
  - `id` (uuid PK)
  - `registration_id` (uuid, references registrations on delete cascade)
  - `player_name` (text, not null)
  - `gamer_tag` (text, nullable)
  - `check_in_status` (text, CHECK in not_checked_in, checked_in;
    default not_checked_in)
  - `check_in_at` (timestamptz, nullable)
  - `created_at` / `updated_at`
- `matches`
  - `id` (uuid PK)
  - `game_id` (uuid, references games)
  - `round` (text, nullable) — e.g. Quarterfinal, Semifinal, Final
  - `team_a_id` (uuid, references registrations, nullable)
  - `team_b_id` (uuid, references registrations, nullable)
  - `scheduled_start` (timestamptz, nullable)
  - `score_a` (integer, default 0)
  - `score_b` (integer, default 0)
  - `status` (text, CHECK in upcoming, live, completed, postponed, cancelled;
    default upcoming)
  - `winner_id` (uuid, references registrations, nullable)
  - `is_published` (boolean, default false)
  - `created_at` / `updated_at`
- `announcements`
  - `id` (uuid PK)
  - `title` (text, not null)
  - `body` (text, not null)
  - `is_pinned` (boolean, default false)
  - `is_published` (boolean, default false)
  - `author_id` (uuid, references auth.users.id)
  - `published_at` (timestamptz, nullable)
  - `created_at` / `updated_at`
- `check_ins`
  - `id` (uuid PK)
  - `registration_id` (uuid, references registrations)
  - `player_id` (uuid, references players, nullable)
  - `check_in_type` (text, CHECK in team, individual)
  - `checked_in_by` (uuid, references auth.users.id)
  - `checked_in_at` (timestamptz, default now())
  - `notes` (text, nullable)
  - `created_at`
- `audit_logs`
  - `id` (uuid PK)
  - `actor_id` (uuid, references auth.users.id, nullable)
  - `action` (text, not null) — e.g. 'registration_approved', 'score_updated'
  - `entity_type` (text, not null)
  - `entity_id` (uuid, nullable)
  - `metadata` (jsonb, nullable) — before/after metadata
  - `created_at` (timestamptz, default now())

2. Registration Reference Generation
- `generate_registration_ref()` — SECURITY DEFINER function that atomically
  generates the next reference in the sequence SN3-26-000001, SN3-26-000002,
  etc., using a sequence. Returns the new reference string.
- A trigger on registrations calls this function BEFORE INSERT and sets
  new.registration_ref, ensuring collision-safe generation in the database.

3. updated_at triggers
- `update_updated_at()` — generic trigger function that sets updated_at to
  now() on any UPDATE. Applied to registrations, players, matches,
  announcements, games, sponsors, gallery_items, schedule_items, faq_items,
  event_settings.

4. Security
- RLS on every table.
- registrations: public can INSERT only with status='pending' (cannot set
  confirmed/declined). Only admin can SELECT/UPDATE/DELETE. Public cannot
  read any registration data.
- players: admin-only CRUD. No public access at all.
- matches: public can SELECT only published matches. Admin full CRUD.
- announcements: public can SELECT only published. Admin full CRUD.
- check_ins: admin-only. No public access.
- audit_logs: admin-only (insert via service_role/edge functions; admin
  can read). No public access.
- service_role granted on all for edge functions.

5. Important Notes
- The registration insert policy enforces status='pending' via WITH CHECK,
  so a public user cannot self-approve.
- Registration reference generation is atomic and collision-safe via a
  database sequence.
- audit_logs metadata stores before/after as jsonb; avoid storing sensitive
  data in metadata.
*/

-- =========================================================
-- 1. Sequences and helper functions
-- =========================================================
CREATE SEQUENCE IF NOT EXISTS public.registration_ref_seq
  AS integer START 1 INCREMENT 1 MINVALUE 1;

CREATE OR REPLACE FUNCTION public.generate_registration_ref()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'SN3-26-' || lpad(nextval('public.registration_ref_seq')::text, 6, '0');
$$;

REVOKE EXECUTE ON FUNCTION public.generate_registration_ref() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_registration_ref() TO authenticated;

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- 2. Registrations
-- =========================================================
CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_ref text UNIQUE NOT NULL,
  team_name text NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE RESTRICT,
  captain_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  institution text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'declined', 'correction_requested')),
  admin_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registrations_ref ON public.registrations (registration_ref);
CREATE INDEX IF NOT EXISTS idx_registrations_team_name ON public.registrations (team_name);
CREATE INDEX IF NOT EXISTS idx_registrations_captain ON public.registrations (captain_name);
CREATE INDEX IF NOT EXISTS idx_registrations_email ON public.registrations (email);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.registrations (status);
CREATE INDEX IF NOT EXISTS idx_registrations_game ON public.registrations (game_id);
CREATE INDEX IF NOT EXISTS idx_registrations_submitted_at ON public.registrations (submitted_at);

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO service_role;
GRANT USAGE ON SEQUENCE public.registration_ref_seq TO authenticated;

-- Registration ref generation trigger
CREATE OR REPLACE FUNCTION public.set_registration_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.registration_ref IS NULL THEN
    NEW.registration_ref := public.generate_registration_ref();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_registration_ref ON public.registrations;
CREATE TRIGGER trg_set_registration_ref
BEFORE INSERT ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.set_registration_ref();

DROP TRIGGER IF EXISTS trg_registrations_updated_at ON public.registrations;
CREATE TRIGGER trg_registrations_updated_at
BEFORE UPDATE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Public can INSERT only pending registrations; cannot SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS "public_insert_pending_registration" ON public.registrations;
CREATE POLICY "public_insert_pending_registration"
ON public.registrations FOR INSERT
TO anon, authenticated
WITH CHECK (status = 'pending');

-- Admin can SELECT all registrations
DROP POLICY IF EXISTS "admin_read_registrations" ON public.registrations;
CREATE POLICY "admin_read_registrations"
ON public.registrations FOR SELECT
TO authenticated
USING (public.is_admin());

-- Admin can UPDATE registrations (change status, notes, etc.)
DROP POLICY IF EXISTS "admin_update_registrations" ON public.registrations;
CREATE POLICY "admin_update_registrations"
ON public.registrations FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Admin can DELETE registrations
DROP POLICY IF EXISTS "admin_delete_registrations" ON public.registrations;
CREATE POLICY "admin_delete_registrations"
ON public.registrations FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 3. Players
-- =========================================================
CREATE TABLE IF NOT EXISTS public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  gamer_tag text,
  check_in_status text NOT NULL DEFAULT 'not_checked_in'
    CHECK (check_in_status IN ('not_checked_in', 'checked_in')),
  check_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_players_registration ON public.players (registration_id);

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO service_role;

DROP POLICY IF EXISTS "admin_read_players" ON public.players;
CREATE POLICY "admin_read_players"
ON public.players FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_player" ON public.players;
CREATE POLICY "admin_insert_player"
ON public.players FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_player" ON public.players;
CREATE POLICY "admin_update_player"
ON public.players FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_player" ON public.players;
CREATE POLICY "admin_delete_player"
ON public.players FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 4. Matches
-- =========================================================
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  round text,
  team_a_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  team_b_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  scheduled_start timestamptz,
  score_a integer NOT NULL DEFAULT 0 CHECK (score_a >= 0),
  score_b integer NOT NULL DEFAULT 0 CHECK (score_b >= 0),
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'live', 'completed', 'postponed', 'cancelled')),
  winner_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches (status);
CREATE INDEX IF NOT EXISTS idx_matches_scheduled ON public.matches (scheduled_start);
CREATE INDEX IF NOT EXISTS idx_matches_game ON public.matches (game_id);
CREATE INDEX IF NOT EXISTS idx_matches_published ON public.matches (is_published);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.matches TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO service_role;

-- Public can read only published matches
DROP POLICY IF EXISTS "public_read_published_matches" ON public.matches;
CREATE POLICY "public_read_published_matches"
ON public.matches FOR SELECT
TO anon, authenticated
USING (is_published = true);

-- Admin can read all matches
DROP POLICY IF EXISTS "admin_read_all_matches" ON public.matches;
CREATE POLICY "admin_read_all_matches"
ON public.matches FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_match" ON public.matches;
CREATE POLICY "admin_insert_match"
ON public.matches FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_match" ON public.matches;
CREATE POLICY "admin_update_match"
ON public.matches FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_match" ON public.matches;
CREATE POLICY "admin_delete_match"
ON public.matches FOR DELETE
TO authenticated
USING (public.is_admin());

DROP TRIGGER IF EXISTS trg_matches_updated_at ON public.matches;
CREATE TRIGGER trg_matches_updated_at
BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =========================================================
-- 5. Announcements
-- =========================================================
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  author_id uuid REFERENCES auth.users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_published ON public.announcements (is_published);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON public.announcements (is_pinned);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO service_role;

-- Public can read only published announcements
DROP POLICY IF EXISTS "public_read_published_announcements" ON public.announcements;
CREATE POLICY "public_read_published_announcements"
ON public.announcements FOR SELECT
TO anon, authenticated
USING (is_published = true);

-- Admin can read all announcements
DROP POLICY IF EXISTS "admin_read_all_announcements" ON public.announcements;
CREATE POLICY "admin_read_all_announcements"
ON public.announcements FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_announcement" ON public.announcements;
CREATE POLICY "admin_insert_announcement"
ON public.announcements FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_announcement" ON public.announcements;
CREATE POLICY "admin_update_announcement"
ON public.announcements FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_announcement" ON public.announcements;
CREATE POLICY "admin_delete_announcement"
ON public.announcements FOR DELETE
TO authenticated
USING (public.is_admin());

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =========================================================
-- 6. Check-ins
-- =========================================================
CREATE TABLE IF NOT EXISTS public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  check_in_type text NOT NULL CHECK (check_in_type IN ('team', 'individual')),
  checked_in_by uuid REFERENCES auth.users(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkins_registration ON public.check_ins (registration_id);

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.check_ins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.check_ins TO service_role;

DROP POLICY IF EXISTS "admin_read_checkins" ON public.check_ins;
CREATE POLICY "admin_read_checkins"
ON public.check_ins FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_checkin" ON public.check_ins;
CREATE POLICY "admin_insert_checkin"
ON public.check_ins FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_checkin" ON public.check_ins;
CREATE POLICY "admin_update_checkin"
ON public.check_ins FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_checkin" ON public.check_ins;
CREATE POLICY "admin_delete_checkin"
ON public.check_ins FOR DELETE
TO authenticated
USING (public.is_admin());

-- =========================================================
-- 7. Audit Logs
-- =========================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs (actor_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO service_role;

DROP POLICY IF EXISTS "admin_read_audit_logs" ON public.audit_logs;
CREATE POLICY "admin_read_audit_logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_audit_log" ON public.audit_logs;
CREATE POLICY "admin_insert_audit_log"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- =========================================================
-- 8. updated_at triggers for content tables (from migration 0002)
-- =========================================================
DROP TRIGGER IF EXISTS trg_games_updated_at ON public.games;
CREATE TRIGGER trg_games_updated_at
BEFORE UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_sponsors_updated_at ON public.sponsors;
CREATE TRIGGER trg_sponsors_updated_at
BEFORE UPDATE ON public.sponsors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_gallery_updated_at ON public.gallery_items;
CREATE TRIGGER trg_gallery_updated_at
BEFORE UPDATE ON public.gallery_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_schedule_updated_at ON public.schedule_items;
CREATE TRIGGER trg_schedule_updated_at
BEFORE UPDATE ON public.schedule_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_faq_updated_at ON public.faq_items;
CREATE TRIGGER trg_faq_updated_at
BEFORE UPDATE ON public.faq_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_site_content_updated_at ON public.site_content;
CREATE TRIGGER trg_site_content_updated_at
BEFORE UPDATE ON public.site_content
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_event_settings_updated_at ON public.event_settings;
CREATE TRIGGER trg_event_settings_updated_at
BEFORE UPDATE ON public.event_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
/*
# Fix Security Advisor Findings on Functions

1. Changes
- `update_updated_at()`: add `SET search_path = public` to fix the mutable
  search_path warning.
- `handle_new_user()`: REVOKE EXECUTE from PUBLIC, anon, and authenticated.
  This is a trigger function and should never be callable via RPC.
- `set_registration_ref()`: REVOKE EXECUTE from PUBLIC, anon, and
  authenticated. This is a trigger function and should never be callable
  via RPC.
- `generate_registration_ref()`: REVOKE EXECUTE from authenticated (already
  revoked from PUBLIC and anon). It is only called internally by the
  set_registration_ref trigger, which runs as SECURITY DEFINER (owner), so
  no role needs direct EXECUTE.

2. Security
- is_admin() remains executable by authenticated only — this is intentional.
  The frontend calls it to check if the current user has an admin role.
- All trigger functions are now not callable via the REST API by any role.

3. Important Notes
- These changes do NOT affect trigger functionality. Triggers execute
  their functions regardless of EXECUTE privileges.
*/

-- Fix mutable search_path on update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Revoke direct RPC access on trigger-only functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_registration_ref() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_registration_ref() FROM PUBLIC, anon, authenticated;
/*
# Add visitor_registrations table

1. New Tables
- `visitor_registrations`
  - `id` (uuid, primary key)
  - `registration_ref` (text, unique, not null) — generated server-side via generate_registration_ref()
  - `full_name` (text, not null) — visitor's full name
  - `email` (text, not null) — visitor's contact email
  - `phone` (text, not null) — visitor's mobile number
  - `institution` (text, nullable) — optional institution/organisation
  - `visitor_category` (text, nullable) — configured by organisers
  - `visitor_count` (integer, default 1) — number of visitors if group registration
  - `status` (text, not null, default 'pending') — always inserted as pending; client cannot set
  - `admin_notes` (text, nullable) — admin-only notes
  - `consent_given` (boolean, not null, default true) — privacy notice consent
  - `submitted_at` (timestamptz, default now())
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `visitor_registrations`.
- Grant INSERT to anon, authenticated so visitors can submit without signing in.
- Grant SELECT, UPDATE, DELETE to authenticated (admin-only via is_admin() policies).
- Public INSERT policy forces status = 'pending' (clients cannot self-approve).
- Admin-only SELECT, UPDATE, DELETE via is_admin() check.
- Reference generated server-side via trigger calling generate_registration_ref().

3. Important notes
- This table is ADDITIVE — no existing tables are modified or dropped.
- The existing `registrations` table continues to serve esports team registrations.
- Visitor and esports registrations are kept completely separate.
- Registration references are generated server-side via the existing generate_registration_ref() function.
*/

CREATE TABLE IF NOT EXISTS visitor_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_ref text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  institution text,
  visitor_category text,
  visitor_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  consent_given boolean NOT NULL DEFAULT true,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE visitor_registrations ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON visitor_registrations TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON visitor_registrations TO authenticated;

DROP POLICY IF EXISTS "public_insert_pending_visitor_registration" ON visitor_registrations;
CREATE POLICY "public_insert_pending_visitor_registration"
ON visitor_registrations FOR INSERT
TO anon, authenticated
WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS "admin_read_visitor_registrations" ON visitor_registrations;
CREATE POLICY "admin_read_visitor_registrations"
ON visitor_registrations FOR SELECT
TO authenticated
USING (is_admin());

DROP POLICY IF EXISTS "admin_update_visitor_registrations" ON visitor_registrations;
CREATE POLICY "admin_update_visitor_registrations"
ON visitor_registrations FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_visitor_registrations" ON visitor_registrations;
CREATE POLICY "admin_delete_visitor_registrations"
ON visitor_registrations FOR DELETE
TO authenticated
USING (is_admin());

-- Trigger: generate registration reference server-side
CREATE OR REPLACE FUNCTION set_visitor_registration_ref()
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

REVOKE EXECUTE ON FUNCTION set_visitor_registration_ref() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_set_visitor_registration_ref ON visitor_registrations;
CREATE TRIGGER trg_set_visitor_registration_ref
BEFORE INSERT ON visitor_registrations
FOR EACH ROW EXECUTE FUNCTION set_visitor_registration_ref();

-- updated_at trigger
CREATE TRIGGER trg_visitor_registrations_updated_at
BEFORE UPDATE ON visitor_registrations
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
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
BEGIN
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

  INSERT INTO public.players (registration_id, player_name)
  SELECT v_reg_id, trim(p.value->>'player_name')
  FROM jsonb_array_elements(p_players) AS p(value);

  RETURN v_ref;
END;
$$;

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
BEGIN
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
  IF p_visitor_category NOT IN ('School student', 'College student', 'Teacher or educator',
                                'Parent or guardian', 'Working professional', 'General visitor', 'Other') THEN
    RAISE EXCEPTION 'Invalid visitor category';
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

REVOKE EXECUTE ON FUNCTION public.submit_esports_registration(text, uuid, text, text, text, text, jsonb, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_visitor_registration(text, text, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_esports_registration(text, uuid, text, text, text, text, jsonb, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_visitor_registration(text, text, text, text, text, boolean, text) TO anon, authenticated;

CREATE POLICY "anon_read_open_games" ON public.games FOR SELECT TO anon, authenticated
  USING (is_active AND is_published);
INSERT INTO public.games (title, team_size, is_active, is_published, sort_order)
SELECT v.title, v.team_size, true, true, v.sort_order
FROM (VALUES ('VALORANT', 5, 1), ('FREE FIRE', 4, 2), ('BGMI', 4, 3)) AS v(title, team_size, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.games g WHERE g.title = v.title);

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
BEGIN
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
    IF length(trim(coalesce(v_player->>'gamer_tag', ''))) NOT BETWEEN 2 AND 40 THEN
      RAISE EXCEPTION 'Invalid player ID';
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
  SELECT v_reg_id, trim(p.value->>'player_name'), trim(p.value->>'gamer_tag')
  FROM jsonb_array_elements(p_players) AS p(value);

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_esports_registration(text, uuid, text, text, text, text, jsonb, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_esports_registration(text, uuid, text, text, text, text, jsonb, boolean, text) TO anon, authenticated;
DROP POLICY IF EXISTS "anon_read_open_games" ON public.games;-- Migration 0009: Admin Security, Role Enforcement & Audit Log Triggers
-- Safe to run multiple times (idempotent)

-- 1. Ensure participation_registrations table exists
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

-- Trigger: auto-set registration reference if omitted
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

-- 2. Enhanced Role Checking Helper Functions
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

CREATE OR REPLACE FUNCTION public.is_content_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'event_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_checkin_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'event_admin', 'checkin_staff')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_score_operator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'event_admin', 'score_operator')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_content_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_checkin_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_score_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_content_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_checkin_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_score_operator() TO authenticated;

-- 3. RLS Role Enforcement on Registrations & Content
DROP POLICY IF EXISTS "admin_read_participation_registrations" ON public.participation_registrations;
CREATE POLICY "admin_read_participation_registrations"
ON public.participation_registrations FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_update_participation_registrations" ON public.participation_registrations;
CREATE POLICY "admin_update_participation_registrations"
ON public.participation_registrations FOR UPDATE
TO authenticated
USING (public.is_content_admin())
WITH CHECK (public.is_content_admin());

DROP POLICY IF EXISTS "admin_delete_participation_registrations" ON public.participation_registrations;
CREATE POLICY "admin_delete_participation_registrations"
ON public.participation_registrations FOR DELETE
TO authenticated
USING (public.is_content_admin());

DROP POLICY IF EXISTS "admin_update_visitor_registrations" ON public.visitor_registrations;
CREATE POLICY "admin_update_visitor_registrations"
ON public.visitor_registrations FOR UPDATE
TO authenticated
USING (public.is_checkin_staff())
WITH CHECK (public.is_checkin_staff());

DROP POLICY IF EXISTS "admin_delete_visitor_registrations" ON public.visitor_registrations;
CREATE POLICY "admin_delete_visitor_registrations"
ON public.visitor_registrations FOR DELETE
TO authenticated
USING (public.is_content_admin());

DROP POLICY IF EXISTS "admin_update_registrations" ON public.registrations;
CREATE POLICY "admin_update_registrations"
ON public.registrations FOR UPDATE
TO authenticated
USING (public.is_checkin_staff())
WITH CHECK (public.is_checkin_staff());

DROP POLICY IF EXISTS "admin_delete_registrations" ON public.registrations;
CREATE POLICY "admin_delete_registrations"
ON public.registrations FOR DELETE
TO authenticated
USING (public.is_content_admin());

-- 4. Audit Log Database Trigger Function
CREATE OR REPLACE FUNCTION public.log_admin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action text := TG_OP;
  v_entity_id uuid;
  v_metadata jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    BEGIN
      v_entity_id := OLD.id;
    EXCEPTION WHEN OTHERS THEN
      v_entity_id := NULL;
    END;
    v_metadata := jsonb_build_object(
      'old', to_jsonb(OLD),
      'user_role', (SELECT role FROM public.user_roles WHERE user_id = v_actor LIMIT 1)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    BEGIN
      v_entity_id := NEW.id;
    EXCEPTION WHEN OTHERS THEN
      v_entity_id := NULL;
    END;
    v_metadata := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW),
      'user_role', (SELECT role FROM public.user_roles WHERE user_id = v_actor LIMIT 1)
    );
  ELSE
    BEGIN
      v_entity_id := NEW.id;
    EXCEPTION WHEN OTHERS THEN
      v_entity_id := NULL;
    END;
    v_metadata := jsonb_build_object(
      'new', to_jsonb(NEW),
      'user_role', (SELECT role FROM public.user_roles WHERE user_id = v_actor LIMIT 1)
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at)
  VALUES (v_actor, v_action, TG_TABLE_NAME, v_entity_id, v_metadata, now());

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 5. Attach Audit Triggers to the 12 Managed Tables
DROP TRIGGER IF EXISTS trg_audit_registrations ON public.registrations;
CREATE TRIGGER trg_audit_registrations
AFTER INSERT OR UPDATE OR DELETE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_participation_registrations ON public.participation_registrations;
CREATE TRIGGER trg_audit_participation_registrations
AFTER INSERT OR UPDATE OR DELETE ON public.participation_registrations
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_visitor_registrations ON public.visitor_registrations;
CREATE TRIGGER trg_audit_visitor_registrations
AFTER INSERT OR UPDATE OR DELETE ON public.visitor_registrations
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_announcements ON public.announcements;
CREATE TRIGGER trg_audit_announcements
AFTER INSERT OR UPDATE OR DELETE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_schedule_items ON public.schedule_items;
CREATE TRIGGER trg_audit_schedule_items
AFTER INSERT OR UPDATE OR DELETE ON public.schedule_items
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_sponsors ON public.sponsors;
CREATE TRIGGER trg_audit_sponsors
AFTER INSERT OR UPDATE OR DELETE ON public.sponsors
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_gallery_items ON public.gallery_items;
CREATE TRIGGER trg_audit_gallery_items
AFTER INSERT OR UPDATE OR DELETE ON public.gallery_items
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_faq_items ON public.faq_items;
CREATE TRIGGER trg_audit_faq_items
AFTER INSERT OR UPDATE OR DELETE ON public.faq_items
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_games ON public.games;
CREATE TRIGGER trg_audit_games
AFTER INSERT OR UPDATE OR DELETE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

-- Safe trigger attachment for optional table: institutions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'institutions'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_institutions ON public.institutions';
    EXECUTE 'CREATE TRIGGER trg_audit_institutions
             AFTER INSERT OR UPDATE OR DELETE ON public.institutions
             FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit()';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_audit_site_content ON public.site_content;
CREATE TRIGGER trg_audit_site_content
AFTER INSERT OR UPDATE OR DELETE ON public.site_content
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_event_settings ON public.event_settings;
CREATE TRIGGER trg_audit_event_settings
AFTER INSERT OR UPDATE OR DELETE ON public.event_settings
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();
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
-- Migration 0011: Public Storage Bucket (site-media) and Media Items Table
-- Safe to run multiple times (idempotent)

-- 1. Ensure Storage Bucket site-media exists in storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-media',
  'site-media',
  true,
  5242880, -- 5 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

-- Storage bucket RLS policies on storage.objects
DROP POLICY IF EXISTS "public_read_site_media" ON storage.objects;
CREATE POLICY "public_read_site_media"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'site-media');

DROP POLICY IF EXISTS "admin_upload_site_media" ON storage.objects;
CREATE POLICY "admin_upload_site_media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'site-media' AND public.is_content_admin());

DROP POLICY IF EXISTS "admin_update_site_media" ON storage.objects;
CREATE POLICY "admin_update_site_media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'site-media' AND public.is_content_admin())
WITH CHECK (bucket_id = 'site-media' AND public.is_content_admin());

DROP POLICY IF EXISTS "admin_delete_site_media" ON storage.objects;
CREATE POLICY "admin_delete_site_media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'site-media' AND public.is_content_admin());

-- 2. Create media_items metadata table
CREATE TABLE IF NOT EXISTS public.media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text NOT NULL,
  storage_path text,
  alt_text text,
  caption text,
  file_size text,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.media_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.media_items TO authenticated;

DROP POLICY IF EXISTS "public_read_media_items" ON public.media_items;
CREATE POLICY "public_read_media_items"
ON public.media_items FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "admin_insert_media_items" ON public.media_items;
CREATE POLICY "admin_insert_media_items"
ON public.media_items FOR INSERT
TO authenticated
WITH CHECK (public.is_content_admin());

DROP POLICY IF EXISTS "admin_update_media_items" ON public.media_items;
CREATE POLICY "admin_update_media_items"
ON public.media_items FOR UPDATE
TO authenticated
USING (public.is_content_admin())
WITH CHECK (public.is_content_admin());

DROP POLICY IF EXISTS "admin_delete_media_items" ON public.media_items;
CREATE POLICY "admin_delete_media_items"
ON public.media_items FOR DELETE
TO authenticated
USING (public.is_content_admin());

-- Attach audit logging trigger
DROP TRIGGER IF EXISTS trg_audit_media_items ON public.media_items;
CREATE TRIGGER trg_audit_media_items
AFTER INSERT OR UPDATE OR DELETE ON public.media_items
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();
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
-- Migration 0013: Registration Workflow Enhancements & Check-In Permissions
-- Safe to run multiple times (idempotent)

-- 1. Ensure admin_notes exists on all registration tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'registrations' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE public.registrations ADD COLUMN admin_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visitor_registrations' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE public.visitor_registrations ADD COLUMN admin_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participation_registrations' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE public.participation_registrations ADD COLUMN admin_notes text;
  END IF;
END $$;

-- 2. Allow checkin_staff to update player check-in status and insert into check_ins
GRANT SELECT, UPDATE ON public.players TO authenticated;
GRANT SELECT, INSERT ON public.check_ins TO authenticated;

DROP POLICY IF EXISTS "checkin_staff_update_players" ON public.players;
CREATE POLICY "checkin_staff_update_players"
ON public.players FOR UPDATE
TO authenticated
USING (public.is_checkin_staff())
WITH CHECK (public.is_checkin_staff());

DROP POLICY IF EXISTS "checkin_staff_insert_check_ins" ON public.check_ins;
CREATE POLICY "checkin_staff_insert_check_ins"
ON public.check_ins FOR INSERT
TO authenticated
WITH CHECK (public.is_checkin_staff());

-- 3. Dedicated RPC for checkin_staff to record player check-ins safely
CREATE OR REPLACE FUNCTION public.check_in_player(
  p_player_id uuid,
  p_status text DEFAULT 'checked_in',
  p_notes text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_id uuid;
BEGIN
  IF NOT public.is_checkin_staff() THEN
    RAISE EXCEPTION 'Unauthorized: check-in staff role required.';
  END IF;

  SELECT registration_id INTO v_reg_id
  FROM public.players
  WHERE id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found.';
  END IF;

  UPDATE public.players
  SET
    check_in_status = p_status,
    check_in_at = CASE WHEN p_status = 'checked_in' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_player_id;

  INSERT INTO public.check_ins (registration_id, player_id, check_in_type, checked_in_by, notes)
  VALUES (v_reg_id, p_player_id, 'individual', auth.uid(), nullif(trim(p_notes), ''));

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_in_player(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_player(uuid, text, text) TO authenticated;
-- Migration 0014: Event Day Entrance Check-ins and Esports Match Operations
-- Safe to run multiple times (idempotent)

-- 1. Ensure check_ins table exists with proper columns
CREATE TABLE IF NOT EXISTS public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL,
  player_id uuid,
  check_in_type text NOT NULL DEFAULT 'team' CHECK (check_in_type IN ('team', 'individual', 'visitor', 'participant')),
  checked_in_by uuid REFERENCES auth.users(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Ensure matches table exists with proper columns
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  round text,
  team_a_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  team_b_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  scheduled_start timestamptz,
  score_a integer NOT NULL DEFAULT 0,
  score_b integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed', 'postponed', 'cancelled')),
  winner_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Helpful indexes for event-day high-throughput lookups
CREATE INDEX IF NOT EXISTS idx_check_ins_registration ON public.check_ins(registration_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_at ON public.check_ins(checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_game_id ON public.matches(game_id);
CREATE INDEX IF NOT EXISTS idx_registrations_ref_lower ON public.registrations(lower(registration_ref));
CREATE INDEX IF NOT EXISTS idx_registrations_phone ON public.registrations(phone);
CREATE INDEX IF NOT EXISTS idx_visitor_ref_lower ON public.visitor_registrations(lower(registration_ref));
CREATE INDEX IF NOT EXISTS idx_visitor_phone ON public.visitor_registrations(phone);
CREATE INDEX IF NOT EXISTS idx_participation_ref_lower ON public.participation_registrations(lower(registration_ref));
CREATE INDEX IF NOT EXISTS idx_participation_phone ON public.participation_registrations(phone);

-- 4. Enable Row Level Security
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- 5. Helper function for score operator role
CREATE OR REPLACE FUNCTION public.is_score_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'event_admin', 'score_operator')
  );
$$;

-- 6. Permissions for check_ins
GRANT SELECT, INSERT, DELETE ON public.check_ins TO authenticated;

DROP POLICY IF EXISTS "admins_all_check_ins" ON public.check_ins;
CREATE POLICY "admins_all_check_ins"
ON public.check_ins FOR ALL
TO authenticated
USING (public.is_content_admin());

DROP POLICY IF EXISTS "checkin_staff_read_check_ins" ON public.check_ins;
CREATE POLICY "checkin_staff_read_check_ins"
ON public.check_ins FOR SELECT
TO authenticated
USING (public.is_checkin_staff());

DROP POLICY IF EXISTS "checkin_staff_insert_check_ins" ON public.check_ins;
CREATE POLICY "checkin_staff_insert_check_ins"
ON public.check_ins FOR INSERT
TO authenticated
WITH CHECK (public.is_checkin_staff());

DROP POLICY IF EXISTS "checkin_staff_delete_check_ins" ON public.check_ins;
CREATE POLICY "checkin_staff_delete_check_ins"
ON public.check_ins FOR DELETE
TO authenticated
USING (public.is_checkin_staff());

-- 7. Permissions for matches (including public live board)
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.matches TO authenticated;

DROP POLICY IF EXISTS "public_read_published_matches" ON public.matches;
CREATE POLICY "public_read_published_matches"
ON public.matches FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "score_operator_read_all_matches" ON public.matches;
CREATE POLICY "score_operator_read_all_matches"
ON public.matches FOR SELECT
TO authenticated
USING (public.is_score_operator());

DROP POLICY IF EXISTS "score_operator_insert_matches" ON public.matches;
CREATE POLICY "score_operator_insert_matches"
ON public.matches FOR INSERT
TO authenticated
WITH CHECK (public.is_score_operator());

DROP POLICY IF EXISTS "score_operator_update_matches" ON public.matches;
CREATE POLICY "score_operator_update_matches"
ON public.matches FOR UPDATE
TO authenticated
USING (public.is_score_operator())
WITH CHECK (public.is_score_operator());

DROP POLICY IF EXISTS "score_operator_delete_matches" ON public.matches;
CREATE POLICY "score_operator_delete_matches"
ON public.matches FOR DELETE
TO authenticated
USING (public.is_content_admin());
