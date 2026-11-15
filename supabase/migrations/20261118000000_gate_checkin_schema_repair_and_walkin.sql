-- ==============================================================================
-- SUPERNOVA 3.0 — GATE CHECK-IN SCHEMA REPAIR, MULTI-DAY VERIFICATION & WALK-IN
-- Migration: 20261118000000_gate_checkin_schema_repair_and_walkin.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Safe, Self-Contained & Idempotent:
--   1. Ensures prerequisite extensions, sequences, helper functions, and
--      public.tickets table (including issued_by & check-in email tracking)
--      exist even if prior optional migrations have not been applied yet.
--   2. Repairs public.check_ins missing columns (including checked_in_by_email,
--      visitor_registration_id, ticket_id, ticket_ref, subject_type, event_day,
--      wristband_category, wristband_id, is_override, override_reason, supervisor_id)
--      and keeps check_ins.registration_id nullable while preserving
--      check_ins_registration_id_fkey.
--   3. Ensures check-in, email, archive, and visitor category columns exist on
--      visitor_registrations, registrations, players, and tickets.
--   4. Safely backfills & normalizes visitor_registrations.registration_source
--      ('public' | 'walk_in') BEFORE adding the CHECK constraint so legacy
--      'direct' / NULL rows never fail migration.
--   5. Upgrades _issue_ticket_internal, issue_ticket_for_registration,
--      lookup_public_ticket, submit_visitor_registration_v2, and
--      submit_visitor_and_issue_ticket for 3 visitor categories + walk-in
--      gate issuance + retry idempotency.
--   6. Repairs verify_gate_ticket (3-arg), checkin_gate_ticket (6-arg), and
--      perform_event_checkin (8-arg) with per-day duplicate checks, safe
--      RBAC/is_admin() guards, and zero stale Day-1 metadata on Day-2 scans.
--   7. Reloads PostgREST schema cache (NOTIFY pgrst, 'reload schema').
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS public.registration_ref_seq
  AS integer START 1 INCREMENT 1 MINVALUE 1;

CREATE OR REPLACE FUNCTION public.generate_ticket_ref(p_prefix text DEFAULT 'SN3-26')
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(p_prefix, 'SN3-26') || '-' || lpad(nextval('public.registration_ref_seq')::text, 6, '0');
$$;

GRANT EXECUTE ON FUNCTION public.generate_ticket_ref(text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 1. Safe Permission & Archive Helpers (Work with OR without 20261113/20261114 RBAC)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gate_has_perm(p_perm text)
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

REVOKE ALL ON FUNCTION public._gate_has_perm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._gate_has_perm(text) TO authenticated;

CREATE OR REPLACE FUNCTION public._gate_is_entry_staff()
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

  IF to_regprocedure('public.is_entry_staff()') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_entry_staff()' INTO v_allowed;
    RETURN coalesce(v_allowed, false);
  END IF;

  IF to_regprocedure('public.is_checkin_staff()') IS NOT NULL THEN
    EXECUTE 'SELECT public.is_checkin_staff()' INTO v_allowed;
    IF coalesce(v_allowed, false) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN public.is_admin();
END;
$$;

REVOKE ALL ON FUNCTION public._gate_is_entry_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._gate_is_entry_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public._is_registration_archived(
  p_archived_at timestamptz,
  p_admin_notes text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_archived_at IS NOT NULL OR coalesce(p_admin_notes, '') LIKE '%[ARCHIVED%';
$$;

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
  v_has_perm_fn boolean := (to_regprocedure('public.has_crm_permission(text)') IS NOT NULL);
  v_has_checkin_fn boolean := (to_regprocedure('public.is_checkin_staff()') IS NOT NULL);
  v_allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
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

  IF v_has_checkin_fn THEN
    EXECUTE 'SELECT public.is_checkin_staff()' INTO v_allowed;
    RETURN coalesce(v_allowed, false) OR public.is_admin();
  END IF;

  RETURN public.is_admin();
END;
$$;

REVOKE ALL ON FUNCTION public._can_perform_checkin(text, boolean) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Ensure Registration & Player Prerequisite Columns Exist Safely
-- ------------------------------------------------------------------------------
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
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ticket_ref text,
  ADD COLUMN IF NOT EXISTS linked_registration_ref text,
  ADD COLUMN IF NOT EXISTS linked_team_name text,
  ADD COLUMN IF NOT EXISTS linked_project_title text,
  ADD COLUMN IF NOT EXISTS linked_player_id uuid,
  ADD COLUMN IF NOT EXISTS registration_source text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text,
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sending_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.visitor_registrations
  ALTER COLUMN phone DROP NOT NULL,
  ALTER COLUMN institution DROP NOT NULL,
  ALTER COLUMN student_class DROP NOT NULL;

-- Drop any legacy restrictive CHECK constraint on visitor_category if present
DO $$
DECLARE
  v_con record;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.visitor_registrations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%visitor_category%'
  LOOP
    EXECUTE format('ALTER TABLE public.visitor_registrations DROP CONSTRAINT %I', v_con.conname);
  END LOOP;
END $$;

-- Backfill walk-ins first, then normalize any legacy values ('direct', etc.)
-- BEFORE adding the CHECK constraint so existing rows never cause a failure.
UPDATE public.visitor_registrations
SET registration_source = 'walk_in'
WHERE coalesce(registration_source, '') <> 'walk_in'
  AND (
    lower(coalesce(visitor_category, '')) LIKE '%walk%'
    OR coalesce(admin_notes, '') ILIKE '%[WALK_IN]%'
    OR coalesce(admin_notes, '') ILIKE '%walk-in%'
    OR upper(coalesce(registration_ref, '')) LIKE 'SN3-VIS-WALK-%'
  );

UPDATE public.visitor_registrations
SET registration_source = 'public'
WHERE registration_source IS NULL
   OR registration_source NOT IN ('public', 'walk_in');

UPDATE public.visitor_registrations
SET ticket_ref = registration_ref
WHERE (ticket_ref IS NULL OR ticket_ref = '')
  AND registration_ref IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'visitor_registrations_registration_source_check'
      AND conrelid = 'public.visitor_registrations'::regclass
  ) THEN
    ALTER TABLE public.visitor_registrations
      ADD CONSTRAINT visitor_registrations_registration_source_check
      CHECK (registration_source IN ('public', 'walk_in'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_visitor_registrations_source ON public.visitor_registrations(registration_source);
CREATE INDEX IF NOT EXISTS idx_visitor_registrations_category ON public.visitor_registrations(visitor_category);
CREATE INDEX IF NOT EXISTS idx_visitor_ticket_ref ON public.visitor_registrations(ticket_ref);

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS captain_ticket_ref text,
  ADD COLUMN IF NOT EXISTS selection_status text NOT NULL DEFAULT 'awaiting_selection',
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text,
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sending_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS visitor_id uuid,
  ADD COLUMN IF NOT EXISTS visitor_ticket_ref text,
  ADD COLUMN IF NOT EXISTS player_ticket_ref text,
  ADD COLUMN IF NOT EXISTS roster_role text DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public._sync_registration_checkin_fields(
  p_table_name text,
  p_reg_id uuid,
  p_now timestamptz,
  p_uid uuid,
  p_actor_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col_type text;
  v_has_email_col boolean := false;
BEGIN
  IF p_table_name NOT IN ('visitor_registrations', 'participation_registrations', 'registrations') OR p_reg_id IS NULL THEN
    RETURN;
  END IF;

  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = p_table_name
    AND column_name = 'checked_in_by';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = 'checked_in_by_email'
  ) INTO v_has_email_col;

  IF v_col_type = 'uuid' THEN
    IF v_has_email_col THEN
      EXECUTE format(
        'UPDATE public.%I SET check_in_status = ''checked_in'', checked_in_at = coalesce(checked_in_at, $1), checked_in_by = coalesce(checked_in_by, $2), checked_in_by_email = coalesce(checked_in_by_email, $3) WHERE id = $4',
        p_table_name
      ) USING p_now, p_uid, p_actor_email, p_reg_id;
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET check_in_status = ''checked_in'', checked_in_at = coalesce(checked_in_at, $1), checked_in_by = coalesce(checked_in_by, $2) WHERE id = $3',
        p_table_name
      ) USING p_now, p_uid, p_reg_id;
    END IF;
  ELSIF v_col_type IS NOT NULL THEN
    IF v_has_email_col THEN
      EXECUTE format(
        'UPDATE public.%I SET check_in_status = ''checked_in'', checked_in_at = coalesce(checked_in_at, $1), checked_in_by = coalesce(checked_in_by, $2), checked_in_by_email = coalesce(checked_in_by_email, $3) WHERE id = $4',
        p_table_name
      ) USING p_now, coalesce(p_actor_email, p_uid::text), p_actor_email, p_reg_id;
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET check_in_status = ''checked_in'', checked_in_at = coalesce(checked_in_at, $1), checked_in_by = coalesce(checked_in_by, $2) WHERE id = $3',
        p_table_name
      ) USING p_now, coalesce(p_actor_email, p_uid::text), p_reg_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._sync_registration_checkin_fields(text, uuid, timestamptz, uuid, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. Ensure public.tickets Exists BEFORE check_ins.ticket_id & RPC Compilation
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_ref text NOT NULL UNIQUE,
  qr_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  registration_id uuid NOT NULL,
  registration_category text NOT NULL CHECK (registration_category IN ('visitor', 'participation', 'esports')),
  registration_ref text NOT NULL,
  display_name text NOT NULL,
  subtitle text,
  institution text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'revoked')),
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  checked_in_at timestamptz,
  checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_in_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tickets_category_registration UNIQUE (registration_category, registration_id)
);

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text;

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_ref ON public.tickets (upper(ticket_ref));
CREATE INDEX IF NOT EXISTS idx_tickets_qr_token ON public.tickets (qr_token);
CREATE INDEX IF NOT EXISTS idx_tickets_reg_lookup ON public.tickets (registration_category, registration_id);
CREATE INDEX IF NOT EXISTS idx_tickets_reg_ref ON public.tickets (upper(registration_ref));
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_checked_in_by ON public.tickets (checked_in_by);

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON public.tickets;
CREATE TRIGGER trg_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.tickets FROM anon, PUBLIC;
GRANT SELECT ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;

DROP POLICY IF EXISTS "staff_read_tickets" ON public.tickets;
CREATE POLICY "staff_read_tickets"
ON public.tickets FOR SELECT
TO authenticated
USING (
  public._gate_has_perm('entry:view')
  OR public._gate_has_perm('entry:scan_visitor')
  OR public._gate_has_perm('entry:scan_esports')
  OR public._gate_has_perm('visitor:view')
  OR public._gate_has_perm('esports:view')
  OR public._gate_has_perm('reports:view')
  OR public.is_admin()
);

-- ------------------------------------------------------------------------------
-- 4. Repair public.check_ins Schema & Preserve FK Integrity
-- ------------------------------------------------------------------------------
ALTER TABLE public.check_ins
  ALTER COLUMN registration_id DROP NOT NULL;

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS visitor_registration_id uuid REFERENCES public.visitor_registrations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ticket_ref text,
  ADD COLUMN IF NOT EXISTS subject_type text DEFAULT 'visitor',
  ADD COLUMN IF NOT EXISTS event_day text NOT NULL DEFAULT '2026-11-20',
  ADD COLUMN IF NOT EXISTS wristband_category text,
  ADD COLUMN IF NOT EXISTS wristband_id text,
  ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text;

-- Repair any stray non-esports registration_id entries before confirming FK
DO $$
BEGIN
  UPDATE public.check_ins ci
  SET
    visitor_registration_id = v.id,
    registration_id = NULL
  FROM public.visitor_registrations v
  WHERE ci.visitor_registration_id IS NULL
    AND (
      (ci.registration_id = v.id AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = ci.registration_id))
      OR (
        ci.registration_id IS NOT NULL
        AND coalesce(ci.subject_type, 'visitor') = 'visitor'
        AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = ci.registration_id)
        AND (
          upper(coalesce(ci.ticket_ref, '')) = upper(v.registration_ref)
          OR upper(coalesce(ci.ticket_ref, '')) = upper(coalesce(v.ticket_ref, ''))
        )
      )
    );

  UPDATE public.check_ins ci
  SET registration_id = NULL
  WHERE ci.registration_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = ci.registration_id);
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_ins_registration_id_fkey'
      AND conrelid = 'public.check_ins'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE public.check_ins
      ADD CONSTRAINT check_ins_registration_id_fkey
      FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_check_ins_registration ON public.check_ins USING btree (registration_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_visitor_reg_id ON public.check_ins(visitor_registration_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_ticket_id ON public.check_ins(ticket_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_ticket_ref_day ON public.check_ins(upper(ticket_ref), event_day);
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_in_by ON public.check_ins(checked_in_by);
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_in_by_email ON public.check_ins(checked_in_by_email);
CREATE INDEX IF NOT EXISTS idx_check_ins_event_day ON public.check_ins(event_day);

CREATE UNIQUE INDEX IF NOT EXISTS idx_check_ins_unique_daily_entry
  ON public.check_ins (ticket_ref, event_day, subject_type)
  WHERE is_override = false AND ticket_ref IS NOT NULL;

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.check_ins FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.check_ins TO authenticated;
GRANT ALL ON public.check_ins TO service_role;

DROP POLICY IF EXISTS "checkin_staff_read_check_ins" ON public.check_ins;
CREATE POLICY "checkin_staff_read_check_ins"
ON public.check_ins FOR SELECT
TO authenticated
USING (
  public._gate_is_entry_staff()
  OR public._gate_has_perm('entry:view')
  OR public._gate_has_perm('visitor:view')
  OR public._gate_has_perm('esports:view')
  OR public.is_admin()
);

DROP POLICY IF EXISTS "checkin_staff_insert_check_ins" ON public.check_ins;
CREATE POLICY "checkin_staff_insert_check_ins"
ON public.check_ins FOR INSERT
TO authenticated
WITH CHECK (
  public._gate_has_perm('entry:checkin_visitor')
  OR public._gate_has_perm('entry:checkin_esports')
  OR public._gate_has_perm('visitor:edit')
  OR public._gate_has_perm('esports:edit')
  OR public.is_admin()
);

-- Ensure gate/entry staff can read registrations & players in AdminCheckin directory
DROP POLICY IF EXISTS "staff_read_visitor_registrations_gate" ON public.visitor_registrations;
CREATE POLICY "staff_read_visitor_registrations_gate"
ON public.visitor_registrations FOR SELECT
TO authenticated
USING (
  public._gate_is_entry_staff()
  OR public._gate_has_perm('visitor:view')
  OR public.is_admin()
);

DROP POLICY IF EXISTS "staff_read_registrations_gate" ON public.registrations;
CREATE POLICY "staff_read_registrations_gate"
ON public.registrations FOR SELECT
TO authenticated
USING (
  public._gate_is_entry_staff()
  OR public._gate_has_perm('esports:view')
  OR public.is_admin()
);

DROP POLICY IF EXISTS "staff_read_players_gate" ON public.players;
CREATE POLICY "staff_read_players_gate"
ON public.players FOR SELECT
TO authenticated
USING (
  public._gate_is_entry_staff()
  OR public._gate_has_perm('esports:view')
  OR public.is_admin()
);

-- Ensure wristband tables exist & default categories are seeded cleanly
CREATE TABLE IF NOT EXISTS public.wristband_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  audience text NOT NULL DEFAULT 'general',
  color_hex text NOT NULL DEFAULT '#2563EB',
  badge_label text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wristband_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wristband_categories FROM anon, PUBLIC;
GRANT SELECT ON public.wristband_categories TO authenticated;
GRANT INSERT, UPDATE ON public.wristband_categories TO authenticated;
GRANT ALL ON public.wristband_categories TO service_role;

DROP POLICY IF EXISTS "staff_read_wristband_categories" ON public.wristband_categories;
CREATE POLICY "staff_read_wristband_categories"
ON public.wristband_categories FOR SELECT
TO authenticated
USING (public._gate_is_entry_staff() OR public.is_admin());

DROP POLICY IF EXISTS "admin_manage_wristband_categories" ON public.wristband_categories;
CREATE POLICY "admin_manage_wristband_categories"
ON public.wristband_categories FOR ALL
TO authenticated
USING (public._gate_has_perm('entry:manage_wristbands') OR public.is_admin())
WITH CHECK (public._gate_has_perm('entry:manage_wristbands') OR public.is_admin());

INSERT INTO public.wristband_categories (name, slug, audience, color_hex, badge_label, description, is_active, sort_order)
VALUES
  ('General Visitor', 'general-visitor', 'visitor', '#2563EB', 'VISITOR', 'Standard visitor entry pass', true, 1),
  ('Esports Participant', 'esports-participant', 'esports', '#7C3AED', 'ESPORTS', 'Verified tournament competitor', true, 2)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wristband_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.wristband_categories(id) ON DELETE SET NULL,
  category_name text NOT NULL,
  ticket_ref text NOT NULL,
  registration_id uuid,
  holder_name text,
  subject_type text NOT NULL DEFAULT 'visitor',
  event_day text NOT NULL DEFAULT '2026-11-20',
  wristband_code text,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_by_email text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced', 'voided')),
  replaced_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  replaced_by_id uuid,
  replaced_at timestamptz,
  replacement_reason text
);

CREATE INDEX IF NOT EXISTS idx_wristband_issuances_ticket_day ON public.wristband_issuances (ticket_ref, event_day);
ALTER TABLE public.wristband_issuances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wristband_issuances FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.wristband_issuances TO authenticated;
GRANT ALL ON public.wristband_issuances TO service_role;

DROP POLICY IF EXISTS "staff_read_wristband_issuances" ON public.wristband_issuances;
CREATE POLICY "staff_read_wristband_issuances"
ON public.wristband_issuances FOR SELECT
TO authenticated
USING (public._gate_is_entry_staff() OR public.is_admin());

DROP POLICY IF EXISTS "staff_write_wristband_issuances" ON public.wristband_issuances;
CREATE POLICY "staff_write_wristband_issuances"
ON public.wristband_issuances FOR INSERT
TO authenticated
WITH CHECK (public._gate_has_perm('entry:issue_wristband') OR public.is_admin());

DROP POLICY IF EXISTS "staff_update_wristband_issuances" ON public.wristband_issuances;
CREATE POLICY "staff_update_wristband_issuances"
ON public.wristband_issuances FOR UPDATE
TO authenticated
USING (public._gate_has_perm('entry:issue_wristband') OR public.is_admin())
WITH CHECK (public._gate_has_perm('entry:issue_wristband') OR public.is_admin());

-- ------------------------------------------------------------------------------
-- 5. Ticket Issuance Engine & Registration Triggers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._issue_ticket_internal(
  p_category text,
  p_registration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_vis public.visitor_registrations%ROWTYPE;
  v_esp public.registrations%ROWTYPE;
  v_tkt public.tickets%ROWTYPE;
  v_game_title text;
  v_reg_ref text;
  v_display_name text;
  v_subtitle text;
  v_institution text;
  v_meta jsonb := '{}'::jsonb;
  v_ticket_ref text;
  v_qr_token text;
  v_created boolean := false;
BEGIN
  IF p_category = 'participation' THEN
    RETURN jsonb_build_object('ok', false, 'eligible', false, 'error', 'Participation module has been discontinued.');
  END IF;

  IF p_category NOT IN ('visitor', 'esports') THEN
    RETURN jsonb_build_object('ok', false, 'eligible', false, 'error', 'Invalid ticket category: ' || coalesce(p_category, 'null'));
  END IF;

  IF p_category = 'visitor' THEN
    SELECT * INTO v_vis FROM public.visitor_registrations WHERE id = p_registration_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'eligible', false, 'error', 'Visitor registration not found.');
    END IF;
    IF public._is_registration_archived(v_vis.archived_at, v_vis.admin_notes) THEN
      RETURN jsonb_build_object('ok', false, 'eligible', false, 'error', 'Visitor registration is archived.');
    END IF;
    IF v_vis.status <> 'confirmed' THEN
      RETURN jsonb_build_object('ok', false, 'eligible', false, 'error', 'Visitor registration is not confirmed.');
    END IF;

    v_reg_ref := v_vis.registration_ref;
    v_ticket_ref := coalesce(nullif(trim(v_vis.ticket_ref), ''), v_vis.registration_ref);
    v_display_name := v_vis.full_name;
    v_subtitle := coalesce(
      nullif(trim(coalesce(v_vis.student_class, '')), ''),
      nullif(trim(coalesce(v_vis.designation, '')), ''),
      nullif(trim(coalesce(v_vis.visitor_category, '')), ''),
      'General Visitor'
    );
    v_institution := nullif(trim(coalesce(v_vis.institution, '')), '');
    v_meta := jsonb_build_object(
      'days_attending', coalesce(v_vis.days_attending, 'Both'),
      'visitor_category', coalesce(nullif(trim(coalesce(v_vis.visitor_category, '')), ''), 'General Visitor'),
      'student_class', nullif(trim(coalesce(v_vis.student_class, '')), ''),
      'designation', nullif(trim(coalesce(v_vis.designation, '')), ''),
      'registration_source', coalesce(v_vis.registration_source, 'public')
    );
  ELSE
    SELECT * INTO v_esp FROM public.registrations WHERE id = p_registration_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'eligible', false, 'error', 'Esports registration not found.');
    END IF;
    IF public._is_registration_archived(v_esp.archived_at, v_esp.admin_notes) THEN
      RETURN jsonb_build_object('ok', false, 'eligible', false, 'error', 'Esports registration is archived.');
    END IF;
    IF v_esp.status <> 'confirmed' THEN
      RETURN jsonb_build_object('ok', false, 'eligible', false, 'error', 'Esports registration must be confirmed before issuing a ticket.');
    END IF;

    SELECT title INTO v_game_title FROM public.games WHERE id = v_esp.game_id;
    v_reg_ref := v_esp.registration_ref;
    v_ticket_ref := coalesce(nullif(trim(v_esp.captain_ticket_ref), ''), v_esp.registration_ref);
    v_display_name := v_esp.team_name;
    v_subtitle := trim(coalesce(v_game_title, 'Esports Championship') || ' · Capt: ' || v_esp.captain_name);
    v_institution := v_esp.institution;
    v_meta := jsonb_build_object(
      'captain_name', v_esp.captain_name,
      'game_title', coalesce(v_game_title, ''),
      'selection_status', coalesce(v_esp.selection_status, 'awaiting_selection')
    );
  END IF;

  SELECT * INTO v_tkt
  FROM public.tickets
  WHERE registration_category = p_category
    AND registration_id = p_registration_id;

  IF NOT FOUND THEN
    IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL THEN
      v_qr_token := encode(extensions.gen_random_bytes(32), 'hex');
    ELSIF to_regprocedure('public.gen_random_bytes(integer)') IS NOT NULL THEN
      v_qr_token := encode(public.gen_random_bytes(32), 'hex');
    ELSE
      v_qr_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    END IF;

    INSERT INTO public.tickets (
      ticket_ref,
      qr_token,
      registration_id,
      registration_category,
      registration_ref,
      display_name,
      subtitle,
      institution,
      metadata,
      status,
      issued_by
    )
    VALUES (
      upper(v_ticket_ref),
      v_qr_token,
      p_registration_id,
      p_category,
      upper(v_reg_ref),
      v_display_name,
      v_subtitle,
      v_institution,
      v_meta,
      'active',
      v_actor
    )
    ON CONFLICT (registration_category, registration_id) DO NOTHING
    RETURNING * INTO v_tkt;

    IF v_tkt.id IS NOT NULL THEN
      v_created := true;
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
        VALUES (
          v_actor,
          'ticket_issued',
          'tickets',
          v_tkt.id,
          jsonb_build_object(
            'ticket_ref', v_tkt.ticket_ref,
            'registration_category', p_category,
            'registration_id', p_registration_id,
            'registration_ref', v_reg_ref
          )
        );
      END IF;
    ELSE
      SELECT * INTO v_tkt
      FROM public.tickets
      WHERE registration_category = p_category
        AND registration_id = p_registration_id;
    END IF;
  END IF;

  IF p_category = 'visitor' THEN
    UPDATE public.visitor_registrations
    SET ticket_ref = v_tkt.ticket_ref
    WHERE id = p_registration_id AND (ticket_ref IS NULL OR ticket_ref = '');
  ELSE
    UPDATE public.registrations
    SET captain_ticket_ref = coalesce(nullif(captain_ticket_ref, ''), v_tkt.ticket_ref)
    WHERE id = p_registration_id AND (captain_ticket_ref IS NULL OR captain_ticket_ref = '');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'eligible', true,
    'created', v_created,
    'ticket', jsonb_build_object(
      'id', v_tkt.id,
      'ticket_ref', v_tkt.ticket_ref,
      'qr_token', v_tkt.qr_token,
      'registration_id', v_tkt.registration_id,
      'registration_category', v_tkt.registration_category,
      'registration_ref', v_tkt.registration_ref,
      'display_name', v_tkt.display_name,
      'subtitle', v_tkt.subtitle,
      'institution', v_tkt.institution,
      'metadata', v_tkt.metadata,
      'status', v_tkt.status,
      'issued_at', v_tkt.issued_at,
      'checked_in_at', v_tkt.checked_in_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public._issue_ticket_internal(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_ticket_for_registration(
  p_category text,
  p_registration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required.');
  END IF;

  IF p_category = 'visitor' THEN
    IF NOT (
      public._gate_has_perm('visitor:edit')
      OR public._gate_has_perm('visitor:create')
      OR public._gate_has_perm('entry:checkin_visitor')
      OR public.is_admin()
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: visitor permission required.');
    END IF;
  ELSIF p_category = 'esports' THEN
    IF NOT (
      public._gate_has_perm('esports:approve')
      OR public._gate_has_perm('esports:edit')
      OR public.is_admin()
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: esports approval permission required.');
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or discontinued registration category.');
  END IF;

  RETURN public._issue_ticket_internal(p_category, p_registration_id);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_ticket_for_registration(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_ticket_for_registration(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._trg_sync_ticket_on_registration_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category text := TG_ARGV[0];
BEGIN
  IF v_category NOT IN ('visitor', 'esports') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'confirmed' AND NOT public._is_registration_archived(NEW.archived_at, NEW.admin_notes) THEN
    PERFORM public._issue_ticket_internal(v_category, NEW.id);
  ELSE
    UPDATE public.tickets
    SET status = 'revoked', updated_at = now()
    WHERE registration_category = v_category
      AND registration_id = NEW.id
      AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._trg_sync_ticket_on_registration_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_visitor_sync_ticket ON public.visitor_registrations;
CREATE TRIGGER trg_visitor_sync_ticket
AFTER INSERT OR UPDATE OF status, archived_at, admin_notes ON public.visitor_registrations
FOR EACH ROW EXECUTE FUNCTION public._trg_sync_ticket_on_registration_change('visitor');

DO $$
BEGIN
  IF to_regclass('public.participation_registrations') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_participation_sync_ticket ON public.participation_registrations;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_esports_sync_ticket ON public.registrations;
CREATE TRIGGER trg_esports_sync_ticket
AFTER INSERT OR UPDATE OF status, archived_at, admin_notes ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public._trg_sync_ticket_on_registration_change('esports');

-- ------------------------------------------------------------------------------
-- 6. Visitor Registration + Walk-In RPCs (Canonical 18-param + 3 Categories)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text);

CREATE OR REPLACE FUNCTION public.submit_visitor_registration_v2(
  p_full_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_institution text DEFAULT NULL,
  p_visitor_category text DEFAULT 'Student Visitor',
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
  p_website text DEFAULT '',
  p_registration_source text DEFAULT 'public'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_raw_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s\-+()]', '', 'g'), '');
  v_name text := trim(coalesce(p_full_name, ''));
  v_raw_cat text := lower(trim(coalesce(p_visitor_category, '')));
  v_clean_cat text;
  v_student_class text := nullif(trim(coalesce(p_student_class, '')), '');
  v_designation text := nullif(trim(coalesce(p_designation, '')), '');
  v_institution text := nullif(trim(coalesce(p_institution, '')), '');
  v_source text := CASE WHEN lower(trim(coalesce(p_registration_source, 'public'))) = 'walk_in' THEN 'walk_in' ELSE 'public' END;
  v_ref text;
  v_existing_walkin_ref text;
  v_ctrl record;
  v_actor_email text;
  v_meta jsonb := '{}'::jsonb;
BEGIN
  IF v_source = 'walk_in' THEN
    IF v_uid IS NULL OR NOT (
      public._gate_has_perm('visitor:create')
      OR public._gate_is_entry_staff()
      OR public.is_admin()
    ) THEN
      RAISE EXCEPTION 'Forbidden: Authorized gate staff permission required for walk-in registration.';
    END IF;
  ELSE
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
  END IF;

  IF coalesce(p_website, '') <> '' THEN
    RAISE EXCEPTION 'Submission rejected';
  END IF;
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'Consent is required';
  END IF;

  IF v_raw_cat IN ('student', 'student visitor', 'school student', 'college student')
     OR v_raw_cat LIKE '%student%' THEN
    v_clean_cat := 'Student Visitor';
  ELSIF v_raw_cat IN (
      'faculty',
      'faculty / staff',
      'faculty & institutional delegates',
      'faculty and institutional delegates',
      'teacher or educator',
      'institutional delegate'
    )
    OR v_raw_cat LIKE '%faculty%'
    OR v_raw_cat LIKE '%delegate%'
    OR v_raw_cat LIKE '%teacher%'
    OR v_raw_cat LIKE '%educator%' THEN
    v_clean_cat := 'Faculty & Institutional Delegates';
  ELSIF v_raw_cat IN ('general', 'general visitor', 'walk-in visitor')
     OR v_raw_cat LIKE '%general%'
     OR (v_source = 'walk_in' AND v_raw_cat LIKE '%walk%') THEN
    v_clean_cat := 'General Visitor';
  ELSE
    RAISE EXCEPTION 'Please select a valid visitor category (Student Visitor, Faculty & Institutional Delegates, or General Visitor).';
  END IF;

  IF length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Full Name is mandatory (2 to 120 characters).';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'A valid Email Address is mandatory.';
  END IF;

  IF v_clean_cat = 'Student Visitor' THEN
    IF v_student_class IS NULL OR length(v_student_class) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Class / Course is mandatory for Student Visitor registrations.';
    END IF;
    IF v_institution IS NULL OR length(v_institution) NOT BETWEEN 2 AND 150 THEN
      RAISE EXCEPTION 'College / Institution Name is mandatory for Student Visitor registrations.';
    END IF;
    v_designation := NULL;
  ELSIF v_clean_cat = 'Faculty & Institutional Delegates' THEN
    IF v_designation IS NULL OR length(v_designation) NOT BETWEEN 2 AND 120 THEN
      RAISE EXCEPTION 'Designation / Role is mandatory for Faculty & Institutional Delegates.';
    END IF;
    IF v_institution IS NULL OR length(v_institution) NOT BETWEEN 2 AND 150 THEN
      RAISE EXCEPTION 'College / Institution Name is mandatory for Faculty & Institutional Delegates.';
    END IF;
    v_student_class := NULL;
  ELSE
    v_student_class := NULL;
    v_designation := NULL;
    IF v_institution IS NOT NULL AND length(v_institution) NOT BETWEEN 2 AND 150 THEN
      RAISE EXCEPTION 'College / Institution Name must be between 2 and 150 characters when provided.';
    END IF;
  END IF;

  IF v_raw_phone IS NOT NULL AND v_raw_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid phone number format.';
  END IF;

  -- Idempotency protection on rapid retries of walk-in submission
  IF v_source = 'walk_in' THEN
    SELECT registration_ref INTO v_existing_walkin_ref
    FROM public.visitor_registrations
    WHERE lower(email) = v_email
      AND lower(trim(full_name)) = lower(v_name)
      AND registration_source = 'walk_in'
      AND archived_at IS NULL
      AND submitted_at > now() - interval '5 minutes'
    ORDER BY submitted_at DESC
    LIMIT 1;

    IF v_existing_walkin_ref IS NOT NULL THEN
      RETURN v_existing_walkin_ref;
    END IF;
  END IF;

  IF v_source = 'public' AND (SELECT count(*) FROM public.visitor_registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (SELECT 1 FROM public.visitor_registrations WHERE lower(email) = v_email AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'A visitor registration already exists for this email address.';
  END IF;

  IF v_source = 'walk_in' THEN
    SELECT coalesce(
      nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
      (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
      'gate-staff@supernova'
    ) INTO v_actor_email;
  END IF;

  v_meta := jsonb_build_object(
    'visitor_category', v_clean_cat,
    'student_class', v_student_class,
    'designation', v_designation,
    'institution', v_institution,
    'registration_source', v_source,
    'esports_interest', coalesce(p_esports_interest, false),
    'preferred_game', nullif(trim(coalesce(p_preferred_game, '')), ''),
    'esports_intent', nullif(trim(coalesce(p_esports_intent, '')), ''),
    'in_game_id', nullif(trim(coalesce(p_in_game_id, '')), ''),
    'team_name', nullif(trim(coalesce(p_team_name, '')), ''),
    'competition_notes', nullif(trim(coalesce(p_competition_notes, '')), ''),
    'days_attending', coalesce(nullif(trim(coalesce(p_days_attending, '')), ''), 'Both')
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
    registration_source,
    admin_notes,
    metadata,
    status,
    consent_given
  )
  VALUES (
    v_name,
    v_email,
    v_raw_phone,
    v_institution,
    v_clean_cat,
    1,
    v_student_class,
    NULL,
    v_designation,
    coalesce(p_esports_interest, false),
    nullif(trim(coalesce(p_preferred_game, '')), ''),
    nullif(trim(coalesce(p_esports_intent, '')), ''),
    nullif(trim(coalesce(p_in_game_id, '')), ''),
    nullif(trim(coalesce(p_team_name, '')), ''),
    nullif(trim(coalesce(p_competition_notes, '')), ''),
    coalesce(nullif(trim(coalesce(p_days_attending, '')), ''), 'Both'),
    v_source,
    CASE WHEN v_source = 'walk_in' THEN '[WALK_IN] Registered at Gate Entry by ' || coalesce(v_actor_email, 'staff') ELSE NULL END,
    v_meta,
    'confirmed',
    true
  )
  RETURNING registration_ref INTO v_ref;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_visitor_and_issue_ticket(
  p_full_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_institution text DEFAULT NULL,
  p_visitor_category text DEFAULT 'Student Visitor',
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
  p_website text DEFAULT '',
  p_registration_source text DEFAULT 'public'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_reg_id uuid;
  v_ticket_res jsonb;
BEGIN
  v_ref := public.submit_visitor_registration_v2(
    p_full_name, p_email, p_phone, p_institution, p_visitor_category,
    p_student_class, NULL, p_designation, p_esports_interest,
    p_preferred_game, p_esports_intent, p_in_game_id, p_team_name,
    p_competition_notes, p_days_attending, p_consent, p_website,
    p_registration_source
  );

  SELECT id INTO v_reg_id
  FROM public.visitor_registrations
  WHERE registration_ref = v_ref
  LIMIT 1;

  v_ticket_res := public._issue_ticket_internal('visitor', v_reg_id);

  RETURN jsonb_build_object(
    'ok', true,
    'registration_id', v_reg_id,
    'registration_ref', v_ref,
    'ticket', v_ticket_res->'ticket'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text) TO anon, authenticated;

-- Anti-IDOR Public Ticket Retrieval RPC (Visitor: Ref + Email; Esports: Ref + Email + Phone)
CREATE OR REPLACE FUNCTION public.lookup_public_ticket(
  p_reference text,
  p_email text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text := upper(trim(coalesce(p_reference, '')));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_phone10 text := CASE WHEN length(v_phone) >= 10 THEN right(v_phone, 10) ELSE '' END;
  v_vis public.visitor_registrations%ROWTYPE;
  v_esp public.registrations%ROWTYPE;
  v_tkt public.tickets%ROWTYPE;
  v_issued jsonb;
BEGIN
  IF v_ref = '' OR v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'invalid_input',
      'error', 'Please enter your Ticket / Registration Reference and registered email address.'
    );
  END IF;

  SELECT * INTO v_tkt
  FROM public.tickets
  WHERE upper(ticket_ref) = v_ref OR upper(registration_ref) = v_ref
  LIMIT 1;

  IF FOUND THEN
    IF v_tkt.registration_category = 'visitor' THEN
      SELECT * INTO v_vis FROM public.visitor_registrations WHERE id = v_tkt.registration_id;
      IF FOUND AND lower(trim(v_vis.email)) = v_email THEN
        IF v_vis.status <> 'confirmed' OR public._is_registration_archived(v_vis.archived_at, v_vis.admin_notes) OR v_tkt.status <> 'active' THEN
          RETURN jsonb_build_object('ok', false, 'status', 'not_eligible', 'error', 'This ticket is not currently active.');
        END IF;
        RETURN jsonb_build_object(
          'ok', true,
          'status', 'issued',
          'ticket', jsonb_build_object(
            'id', v_tkt.id,
            'ticket_ref', v_tkt.ticket_ref,
            'qr_token', v_tkt.qr_token,
            'registration_id', v_tkt.registration_id,
            'registration_category', v_tkt.registration_category,
            'registration_ref', v_tkt.registration_ref,
            'display_name', v_tkt.display_name,
            'subtitle', v_tkt.subtitle,
            'institution', v_tkt.institution,
            'metadata', v_tkt.metadata,
            'status', v_tkt.status,
            'issued_at', v_tkt.issued_at,
            'checked_in_at', v_tkt.checked_in_at
          )
        );
      END IF;
    ELSIF v_tkt.registration_category = 'esports' THEN
      SELECT * INTO v_esp FROM public.registrations WHERE id = v_tkt.registration_id;
      IF FOUND AND lower(trim(v_esp.email)) = v_email THEN
        IF v_phone10 = '' OR right(regexp_replace(coalesce(v_esp.phone, ''), '[^0-9]', '', 'g'), 10) <> v_phone10 THEN
          RETURN jsonb_build_object(
            'ok', false,
            'status', 'invalid_input',
            'error', 'Esports pass retrieval requires the registered 10-digit team phone number along with reference and email.'
          );
        END IF;
        IF v_esp.status <> 'confirmed' OR public._is_registration_archived(v_esp.archived_at, v_esp.admin_notes) OR v_tkt.status <> 'active' THEN
          RETURN jsonb_build_object('ok', false, 'status', 'not_eligible', 'error', 'This esports pass is not currently active.');
        END IF;
        RETURN jsonb_build_object(
          'ok', true,
          'status', 'issued',
          'ticket', jsonb_build_object(
            'id', v_tkt.id,
            'ticket_ref', v_tkt.ticket_ref,
            'qr_token', v_tkt.qr_token,
            'registration_id', v_tkt.registration_id,
            'registration_category', v_tkt.registration_category,
            'registration_ref', v_tkt.registration_ref,
            'display_name', v_tkt.display_name,
            'subtitle', v_tkt.subtitle,
            'institution', v_tkt.institution,
            'metadata', v_tkt.metadata,
            'status', v_tkt.status,
            'issued_at', v_tkt.issued_at,
            'checked_in_at', v_tkt.checked_in_at
          )
        );
      END IF;
    ELSIF v_tkt.registration_category = 'participation' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'not_eligible',
        'error', 'The participation module has been discontinued.'
      );
    END IF;
  END IF;

  SELECT * INTO v_esp
  FROM public.registrations
  WHERE (upper(registration_ref) = v_ref OR upper(coalesce(captain_ticket_ref, '')) = v_ref)
    AND lower(trim(email)) = v_email
  LIMIT 1;

  IF FOUND THEN
    IF v_phone10 = '' OR right(regexp_replace(coalesce(v_esp.phone, ''), '[^0-9]', '', 'g'), 10) <> v_phone10 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'invalid_input',
        'error', 'Esports pass retrieval requires the registered 10-digit team phone number along with reference and email.'
      );
    END IF;
    IF public._is_registration_archived(v_esp.archived_at, v_esp.admin_notes) OR v_esp.status IN ('declined', 'withdrawn') THEN
      RETURN jsonb_build_object('ok', false, 'status', 'not_eligible', 'error', 'This esports team registration is not eligible for ticket issuance.');
    END IF;
    IF v_esp.status <> 'confirmed' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'pending_approval',
        'registration_category', 'esports',
        'registration_status', v_esp.status,
        'error', 'Your esports team registration is awaiting tournament confirmation. Your official ticket will be issued once confirmed.'
      );
    END IF;
    v_issued := public._issue_ticket_internal('esports', v_esp.id);
    IF coalesce((v_issued->>'ok')::boolean, false) THEN
      RETURN jsonb_build_object('ok', true, 'status', 'issued', 'ticket', v_issued->'ticket');
    END IF;
  END IF;

  SELECT * INTO v_vis
  FROM public.visitor_registrations
  WHERE (upper(registration_ref) = v_ref OR upper(coalesce(ticket_ref, '')) = v_ref)
    AND lower(trim(email)) = v_email
  LIMIT 1;

  IF FOUND THEN
    IF public._is_registration_archived(v_vis.archived_at, v_vis.admin_notes) OR v_vis.status IN ('declined', 'withdrawn') THEN
      RETURN jsonb_build_object('ok', false, 'status', 'not_eligible', 'error', 'This visitor pass is not active.');
    END IF;
    IF v_vis.status <> 'confirmed' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'pending_approval',
        'registration_category', 'visitor',
        'registration_status', v_vis.status,
        'error', 'This visitor registration is pending confirmation.'
      );
    END IF;
    v_issued := public._issue_ticket_internal('visitor', v_vis.id);
    IF coalesce((v_issued->>'ok')::boolean, false) THEN
      RETURN jsonb_build_object('ok', true, 'status', 'issued', 'ticket', v_issued->'ticket');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'status', 'not_found',
    'error', 'No matching active registration found for the provided reference and credentials.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_public_ticket(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_public_ticket(text, text, text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. Multi-Day Aware Gate Verification, Ticket Check-In & Event Check-In RPCs
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_gate_ticket(text, text);
DROP FUNCTION IF EXISTS public.verify_gate_ticket(text, text, text);

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

  IF NOT (
    public._gate_is_entry_staff()
    OR public._gate_has_perm('visitor:view')
    OR public._gate_has_perm('esports:view')
    OR public.is_admin()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: Gate verification permission required.');
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
        IF public._is_registration_archived(v_fb_vis.archived_at, v_fb_vis.admin_notes) THEN
          RETURN jsonb_build_object('ok', true, 'verdict', 'INVALID', 'can_check_in', false, 'reason', 'Visitor registration ' || v_fb_vis.registration_ref || ' is archived or revoked.');
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
          IF public._is_registration_archived(v_fb_esp.archived_at, v_fb_esp.admin_notes) THEN
            RETURN jsonb_build_object('ok', true, 'verdict', 'INVALID', 'can_check_in', false, 'reason', 'Esports registration ' || v_fb_esp.registration_ref || ' is archived or revoked.');
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
      'verdict', 'INVALID',
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

  -- Check per-day usage in check_ins (supports Day 1 & Day 2 separately while blocking duplicate scans on the same day)
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

  IF v_tkt.status <> 'active' THEN
    v_verdict := 'INVALID';
    v_reason := 'Ticket status is "' || v_tkt.status || '".';
  ELSIF v_reg_status IS NULL OR public._is_registration_archived(v_archived_at, v_admin_notes) THEN
    v_verdict := 'INVALID';
    v_reason := 'Associated registration is missing or archived.';
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

CREATE OR REPLACE FUNCTION public.checkin_gate_ticket(
  p_ticket_ref text,
  p_qr_token text DEFAULT NULL,
  p_event_day text DEFAULT '2026-11-20',
  p_wristband_category text DEFAULT NULL,
  p_wristband_code text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_email text;
  v_tkt public.tickets%ROWTYPE;
  v_reg_status text;
  v_archived_at timestamptz;
  v_admin_notes text;
  v_linked_ref text;
  v_now timestamptz := now();
  v_checkin_id uuid;
  v_subject_type text;
  v_cat_id uuid;
  v_esports_reg_id uuid := NULL;
  v_visitor_reg_id uuid := NULL;
  v_event_day text := CASE WHEN trim(coalesce(p_event_day, '')) = '2026-11-21' THEN '2026-11-21' ELSE '2026-11-20' END;
  v_has_wristbands_table boolean := false;
  v_can_issue_band boolean := false;
  v_existing_ci record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Authentication required.');
  END IF;

  SELECT * INTO v_tkt
  FROM public.tickets
  WHERE upper(ticket_ref) = upper(trim(coalesce(p_ticket_ref, '')))
     OR upper(registration_ref) = upper(trim(coalesce(p_ticket_ref, '')))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Ticket not found.');
  END IF;

  IF v_tkt.registration_category = 'participation' THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Participation module has been discontinued.');
  END IF;

  IF v_tkt.registration_category = 'visitor' THEN
    v_subject_type := 'visitor';
  ELSE
    v_subject_type := 'esports_player';
  END IF;

  IF NOT public._can_perform_checkin(v_subject_type, false) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: check-in permission required.');
  END IF;

  IF p_qr_token IS NOT NULL AND trim(p_qr_token) <> '' AND v_tkt.qr_token <> trim(p_qr_token) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'QR token mismatch.');
  END IF;

  IF v_tkt.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Ticket is ' || v_tkt.status || '.');
  END IF;

  IF v_tkt.registration_category = 'visitor' THEN
    SELECT status, archived_at, admin_notes, linked_registration_ref
    INTO v_reg_status, v_archived_at, v_admin_notes, v_linked_ref
    FROM public.visitor_registrations WHERE id = v_tkt.registration_id;
    v_visitor_reg_id := v_tkt.registration_id;
    IF nullif(trim(coalesce(v_linked_ref, '')), '') IS NOT NULL THEN
      SELECT id INTO v_esports_reg_id
      FROM public.registrations
      WHERE upper(registration_ref) = upper(trim(v_linked_ref))
      LIMIT 1;
    END IF;
  ELSE
    SELECT status, archived_at, admin_notes INTO v_reg_status, v_archived_at, v_admin_notes
    FROM public.registrations WHERE id = v_tkt.registration_id;
    IF FOUND THEN
      v_esports_reg_id := v_tkt.registration_id;
    END IF;
  END IF;

  IF v_reg_status IS NULL OR public._is_registration_archived(v_archived_at, v_admin_notes) OR v_reg_status <> 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Registration is not active or confirmed.');
  END IF;

  -- Check per-day duplicate against check_ins (allows Day 1 & Day 2 separately)
  SELECT id, checked_in_at, coalesce(checked_in_by_email, checked_in_by::text) AS staff_ref
  INTO v_existing_ci
  FROM public.check_ins
  WHERE event_day = v_event_day
    AND coalesce(is_override, false) = false
    AND (
      ticket_id = v_tkt.id
      OR upper(coalesce(ticket_ref, '')) = upper(v_tkt.ticket_ref)
      OR upper(coalesce(ticket_ref, '')) = upper(v_tkt.registration_ref)
      OR (v_visitor_reg_id IS NOT NULL AND visitor_registration_id = v_visitor_reg_id)
    )
  ORDER BY checked_in_at DESC
  LIMIT 1;

  IF v_existing_ci.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'verdict', 'ALREADY USED',
      'can_check_in', false,
      'duplicate', true,
      'checked_in_at', v_existing_ci.checked_in_at,
      'checked_in_by', v_existing_ci.staff_ref,
      'error', 'Ticket has already been used for gate entry on ' || v_event_day || '.'
    );
  END IF;

  SELECT coalesce(
    nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
    (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
    'staff@supernova'
  ) INTO v_actor_email;

  UPDATE public.tickets
  SET
    checked_in_at = coalesce(checked_in_at, v_now),
    checked_in_by = coalesce(checked_in_by, v_uid),
    checked_in_by_email = coalesce(checked_in_by_email, v_actor_email),
    updated_at = v_now
  WHERE id = v_tkt.id;

  IF v_tkt.registration_category = 'visitor' THEN
    PERFORM public._sync_registration_checkin_fields('visitor_registrations', v_tkt.registration_id, v_now, v_uid, v_actor_email);
  ELSE
    PERFORM public._sync_registration_checkin_fields('registrations', v_tkt.registration_id, v_now, v_uid, v_actor_email);
  END IF;

  INSERT INTO public.check_ins (
    registration_id,
    visitor_registration_id,
    ticket_id,
    ticket_ref,
    subject_type,
    event_day,
    check_in_type,
    checked_in_by,
    checked_in_by_email,
    checked_in_at,
    wristband_category,
    wristband_id,
    is_override,
    notes
  )
  VALUES (
    v_esports_reg_id,
    v_visitor_reg_id,
    v_tkt.id,
    upper(v_tkt.ticket_ref),
    v_subject_type,
    v_event_day,
    CASE WHEN v_tkt.registration_category = 'esports' THEN 'team' ELSE 'individual' END,
    v_uid,
    v_actor_email,
    v_now,
    p_wristband_category,
    p_wristband_code,
    false,
    coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'Verified ticket gate entry (' || v_tkt.registration_category || ')')
  )
  RETURNING id INTO v_checkin_id;

  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wristband_issuances')
    INTO v_has_wristbands_table;
  IF p_wristband_category IS NOT NULL AND v_has_wristbands_table THEN
    v_can_issue_band := public._gate_has_perm('entry:issue_wristband');
    IF v_can_issue_band THEN
      SELECT id INTO v_cat_id FROM public.wristband_categories WHERE name = p_wristband_category LIMIT 1;
      INSERT INTO public.wristband_issuances (
        ticket_ref, registration_id, subject_type, event_day, category_id, category_name, wristband_code, issued_by, issued_by_email, issued_at, status
      )
      VALUES (
        upper(v_tkt.ticket_ref), v_tkt.registration_id, v_subject_type, v_event_day, v_cat_id,
        p_wristband_category, p_wristband_code, v_uid, v_actor_email, v_now, 'active'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_uid,
      'gate_ticket_checked_in',
      'tickets',
      v_tkt.id,
      jsonb_build_object(
        'ticket_ref', v_tkt.ticket_ref,
        'registration_category', v_tkt.registration_category,
        'registration_id', v_esports_reg_id,
        'visitor_registration_id', v_visitor_reg_id,
        'event_day', v_event_day,
        'checked_in_by', v_actor_email,
        'checked_in_by_id', v_uid,
        'checked_in_at', v_now
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'verdict', 'VALID',
    'can_check_in', false,
    'checked_in_at', v_now,
    'checked_in_by', v_actor_email,
    'ticket_ref', v_tkt.ticket_ref,
    'checkin_id', v_checkin_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.checkin_gate_ticket(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkin_gate_ticket(text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.perform_event_checkin(
  p_ticket_ref text,
  p_subject_type text,
  p_event_day text DEFAULT '2026-11-20',
  p_registration_id uuid DEFAULT NULL,
  p_wristband_category text DEFAULT NULL,
  p_wristband_code text DEFAULT NULL,
  p_is_override boolean DEFAULT false,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_email text;
  v_clean_ref text := upper(trim(coalesce(p_ticket_ref, '')));
  v_raw_subject text := lower(trim(coalesce(p_subject_type, 'visitor')));
  v_norm_subject text;
  v_event_day text := CASE WHEN trim(coalesce(p_event_day, '')) = '2026-11-21' THEN '2026-11-21' ELSE '2026-11-20' END;
  v_existing record;
  v_checkin_id uuid;
  v_cat_id uuid;
  v_now timestamptz := now();

  v_esports_reg_id uuid := NULL;
  v_visitor_reg_id uuid := NULL;
  v_player_id uuid := NULL;
  v_ticket_id uuid := NULL;
  v_canonical_ref text := v_clean_ref;

  v_vis record;
  v_esp record;
  v_player record;
  v_has_tickets_table boolean := false;
  v_has_wristbands_table boolean := false;
  v_has_audit_table boolean := false;
  v_can_issue_band boolean := false;
  v_tkt_id uuid;
  v_tkt_reg_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  IF v_raw_subject = 'participation' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Participation module has been discontinued.');
  END IF;

  v_norm_subject := CASE
    WHEN v_raw_subject IN ('esports', 'esports_player', 'esports_team') THEN 'esports_player'
    ELSE 'visitor'
  END;

  IF NOT public._can_perform_checkin(v_norm_subject, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: check-in permission required for ' || v_norm_subject);
  END IF;

  IF p_is_override AND NOT public._can_perform_checkin(v_norm_subject, true) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: Supervisor override permission required');
  END IF;

  IF p_is_override AND coalesce(trim(p_override_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Override reason is mandatory');
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tickets')
    INTO v_has_tickets_table;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wristband_issuances')
    INTO v_has_wristbands_table;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs')
    INTO v_has_audit_table;

  IF v_norm_subject = 'visitor' THEN
    SELECT * INTO v_vis
    FROM public.visitor_registrations
    WHERE (p_registration_id IS NOT NULL AND id = p_registration_id)
       OR (v_clean_ref <> '' AND (upper(registration_ref) = v_clean_ref OR upper(coalesce(ticket_ref, '')) = v_clean_ref))
    ORDER BY (CASE WHEN upper(registration_ref) = v_clean_ref OR upper(coalesce(ticket_ref, '')) = v_clean_ref THEN 0 ELSE 1 END)
    LIMIT 1;

    IF NOT FOUND AND v_has_tickets_table AND v_clean_ref <> '' THEN
      SELECT id, registration_id INTO v_tkt_id, v_tkt_reg_id
      FROM public.tickets
      WHERE registration_category = 'visitor'
        AND (upper(ticket_ref) = v_clean_ref OR upper(registration_ref) = v_clean_ref)
      LIMIT 1;

      IF v_tkt_reg_id IS NOT NULL THEN
        SELECT * INTO v_vis FROM public.visitor_registrations WHERE id = v_tkt_reg_id LIMIT 1;
      END IF;
    END IF;

    IF v_vis.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Visitor registration not found for ticket reference.');
    END IF;

    IF public._is_registration_archived(v_vis.archived_at, v_vis.admin_notes) OR v_vis.status <> 'confirmed' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Visitor pass is not confirmed or has been archived.');
    END IF;

    v_visitor_reg_id := v_vis.id;
    v_canonical_ref := coalesce(nullif(upper(trim(coalesce(v_vis.ticket_ref, ''))), ''), upper(v_vis.registration_ref));

    IF nullif(trim(coalesce(v_vis.linked_registration_ref, '')), '') IS NOT NULL THEN
      SELECT id INTO v_esports_reg_id
      FROM public.registrations
      WHERE upper(registration_ref) = upper(trim(v_vis.linked_registration_ref))
      LIMIT 1;
    END IF;

    IF v_has_tickets_table THEN
      SELECT id INTO v_ticket_id
      FROM public.tickets
      WHERE registration_category = 'visitor' AND registration_id = v_vis.id
      LIMIT 1;
    END IF;
  ELSE
    IF v_clean_ref <> '' THEN
      SELECT * INTO v_player
      FROM public.players
      WHERE upper(coalesce(player_ticket_ref, '')) = v_clean_ref
         OR upper(coalesce(visitor_ticket_ref, '')) = v_clean_ref
      LIMIT 1;
    END IF;

    IF v_player.id IS NULL AND p_registration_id IS NOT NULL THEN
      SELECT * INTO v_player FROM public.players WHERE id = p_registration_id LIMIT 1;
    END IF;

    IF v_player.id IS NOT NULL THEN
      v_player_id := v_player.id;
      SELECT * INTO v_esp FROM public.registrations WHERE id = v_player.registration_id LIMIT 1;
    ELSE
      SELECT * INTO v_esp
      FROM public.registrations
      WHERE (p_registration_id IS NOT NULL AND id = p_registration_id)
         OR (v_clean_ref <> '' AND (upper(registration_ref) = v_clean_ref OR upper(coalesce(captain_ticket_ref, '')) = v_clean_ref))
      LIMIT 1;
    END IF;

    IF v_esp.id IS NULL AND v_has_tickets_table AND v_clean_ref <> '' THEN
      SELECT id, registration_id INTO v_tkt_id, v_tkt_reg_id
      FROM public.tickets
      WHERE registration_category = 'esports'
        AND (upper(ticket_ref) = v_clean_ref OR upper(registration_ref) = v_clean_ref)
      LIMIT 1;

      IF v_tkt_reg_id IS NOT NULL THEN
        SELECT * INTO v_esp FROM public.registrations WHERE id = v_tkt_reg_id LIMIT 1;
      END IF;
    END IF;

    IF v_esp.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Esports team registration not found for ticket.');
    END IF;

    IF public._is_registration_archived(v_esp.archived_at, v_esp.admin_notes) OR v_esp.status <> 'confirmed' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Esports registration is not confirmed or has been archived.');
    END IF;

    IF coalesce(v_esp.selection_status, 'awaiting_selection') = 'disqualified' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Esports team is disqualified from tournament entry.');
    END IF;

    v_esports_reg_id := v_esp.id;
    v_canonical_ref := coalesce(
      nullif(upper(trim(coalesce(v_player.player_ticket_ref, ''))), ''),
      nullif(v_clean_ref, ''),
      upper(v_esp.registration_ref)
    );

    IF v_has_tickets_table THEN
      SELECT id INTO v_ticket_id
      FROM public.tickets
      WHERE registration_category = 'esports' AND registration_id = v_esp.id
      LIMIT 1;
    END IF;
  END IF;

  SELECT coalesce(
    nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
    (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
    'staff@supernova'
  ) INTO v_actor_email;

  SELECT id, checked_in_at, coalesce(checked_in_by_email, checked_in_by::text) AS prior_staff
  INTO v_existing
  FROM public.check_ins
  WHERE event_day = v_event_day
    AND subject_type = v_norm_subject
    AND coalesce(is_override, false) = false
    AND (
      upper(coalesce(ticket_ref, '')) = upper(v_canonical_ref)
      OR (v_clean_ref <> '' AND upper(coalesce(ticket_ref, '')) = v_clean_ref)
      OR (v_norm_subject = 'visitor' AND v_visitor_reg_id IS NOT NULL AND visitor_registration_id = v_visitor_reg_id)
      OR (v_norm_subject = 'esports_player' AND v_player_id IS NOT NULL AND player_id = v_player_id)
      OR (v_norm_subject = 'esports_player' AND v_player_id IS NULL AND v_esports_reg_id IS NOT NULL AND registration_id = v_esports_reg_id AND player_id IS NULL)
    )
  ORDER BY checked_in_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL AND NOT p_is_override THEN
    RETURN jsonb_build_object(
      'ok', false,
      'duplicate', true,
      'error', 'ALREADY CHECKED IN',
      'checked_in_at', v_existing.checked_in_at,
      'checked_in_by', v_existing.prior_staff
    );
  END IF;

  INSERT INTO public.check_ins (
    registration_id,
    visitor_registration_id,
    player_id,
    ticket_id,
    ticket_ref,
    subject_type,
    event_day,
    check_in_type,
    checked_in_by,
    checked_in_by_email,
    checked_in_at,
    wristband_category,
    wristband_id,
    is_override,
    override_reason,
    supervisor_id,
    notes
  )
  VALUES (
    v_esports_reg_id,
    v_visitor_reg_id,
    v_player_id,
    v_ticket_id,
    v_canonical_ref,
    v_norm_subject,
    v_event_day,
    CASE WHEN v_norm_subject = 'esports_player' AND v_player_id IS NULL THEN 'team' ELSE 'individual' END,
    v_uid,
    v_actor_email,
    v_now,
    p_wristband_category,
    p_wristband_code,
    p_is_override,
    p_override_reason,
    CASE WHEN p_is_override THEN v_uid ELSE NULL END,
    CASE WHEN p_is_override THEN 'Supervisor override: ' || p_override_reason ELSE 'Verified gate check-in (' || v_event_day || ')' END
  )
  RETURNING id INTO v_checkin_id;

  IF p_wristband_category IS NOT NULL AND v_has_wristbands_table THEN
    v_can_issue_band := public._gate_has_perm('entry:issue_wristband');
    IF v_can_issue_band THEN
      SELECT id INTO v_cat_id FROM public.wristband_categories WHERE name = p_wristband_category LIMIT 1;
      INSERT INTO public.wristband_issuances (
        ticket_ref, registration_id, subject_type, event_day, category_id, category_name, wristband_code, issued_by, issued_by_email, issued_at, status
      )
      VALUES (
        v_canonical_ref,
        coalesce(v_visitor_reg_id, v_esports_reg_id),
        v_norm_subject,
        v_event_day,
        v_cat_id,
        p_wristband_category,
        p_wristband_code,
        v_uid,
        v_actor_email,
        v_now,
        'active'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF v_visitor_reg_id IS NOT NULL THEN
    PERFORM public._sync_registration_checkin_fields('visitor_registrations', v_visitor_reg_id, v_now, v_uid, v_actor_email);
  END IF;
  IF v_esports_reg_id IS NOT NULL THEN
    PERFORM public._sync_registration_checkin_fields('registrations', v_esports_reg_id, v_now, v_uid, v_actor_email);
  END IF;
  IF v_player_id IS NOT NULL THEN
    UPDATE public.players
    SET check_in_status = 'checked_in', check_in_at = coalesce(check_in_at, v_now), updated_at = v_now
    WHERE id = v_player_id;
  END IF;
  IF v_ticket_id IS NOT NULL AND v_has_tickets_table THEN
    UPDATE public.tickets
    SET
      checked_in_at = coalesce(checked_in_at, v_now),
      checked_in_by = coalesce(checked_in_by, v_uid),
      checked_in_by_email = coalesce(checked_in_by_email, v_actor_email),
      updated_at = v_now
    WHERE id = v_ticket_id;
  END IF;

  IF v_has_audit_table THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_uid,
      CASE WHEN p_is_override THEN 'checkin_supervisor_override' ELSE 'event_checkin' END,
      'check_ins',
      v_checkin_id,
      jsonb_build_object(
        'ticket_ref', v_canonical_ref,
        'subject_type', v_norm_subject,
        'event_day', v_event_day,
        'registration_id', v_esports_reg_id,
        'visitor_registration_id', v_visitor_reg_id,
        'player_id', v_player_id,
        'wristband_category', p_wristband_category,
        'is_override', p_is_override,
        'override_reason', p_override_reason,
        'checked_in_by_email', v_actor_email
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'checkin_id', v_checkin_id,
    'ticket_ref', v_canonical_ref,
    'checked_in_at', v_now,
    'checked_in_by', v_actor_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_event_checkin(text, text, text, uuid, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_event_checkin(text, text, text, uuid, text, text, boolean, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. Safe Idempotent Ticket Backfill for Existing Confirmed Registrations
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT id FROM public.visitor_registrations
    WHERE status = 'confirmed'
      AND NOT public._is_registration_archived(archived_at, admin_notes)
  LOOP
    PERFORM public._issue_ticket_internal('visitor', v_row.id);
  END LOOP;

  FOR v_row IN
    SELECT id FROM public.registrations
    WHERE status = 'confirmed'
      AND NOT public._is_registration_archived(archived_at, admin_notes)
  LOOP
    PERFORM public._issue_ticket_internal('esports', v_row.id);
  END LOOP;
END $$;

-- Reload PostgREST schema cache so newly repaired columns/RPCs take effect immediately
NOTIFY pgrst, 'reload schema';
