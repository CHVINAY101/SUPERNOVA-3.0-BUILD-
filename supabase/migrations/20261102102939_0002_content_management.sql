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
