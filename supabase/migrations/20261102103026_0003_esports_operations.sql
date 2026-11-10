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
