-- ==============================================================================
-- SUPERNOVA 3.0 — FIX CHECK-IN FOREIGN KEY MAPPING ACROSS VISITOR, PARTICIPATION & ESPORTS
-- Migration: 20261116000000_fix_checkins_fk_registration_mapping.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Safe & Idempotent:
--   - PRESERVES check_ins_registration_id_fkey (registration_id -> public.registrations(id)).
--   - Does NOT drop foreign-key constraints, disable RLS, or delete records.
--   - Makes check_ins.registration_id nullable so Visitor and Participation
--     check-ins NEVER write visitor_registrations.id or participation_registrations.id
--     into check_ins.registration_id.
--   - Adds visitor_registration_id & participation_registration_id FKs + indexes.
--   - Fixes perform_event_checkin and checkin_gate_ticket to resolve tickets to
--     their true underlying registration table & FK column.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. Ensure additive linking/check-in columns exist on registration tables
-- ------------------------------------------------------------------------------
ALTER TABLE public.visitor_registrations
  ADD COLUMN IF NOT EXISTS ticket_ref text,
  ADD COLUMN IF NOT EXISTS linked_registration_ref text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text;

ALTER TABLE public.participation_registrations
  ADD COLUMN IF NOT EXISTS visitor_id uuid,
  ADD COLUMN IF NOT EXISTS visitor_ticket_ref text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS captain_ticket_ref text,
  ADD COLUMN IF NOT EXISTS selection_status text NOT NULL DEFAULT 'awaiting_selection',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS player_ticket_ref text,
  ADD COLUMN IF NOT EXISTS visitor_ticket_ref text;

-- ------------------------------------------------------------------------------
-- 2. Preserve check_ins_registration_id_fkey & add category-specific FK columns
-- ------------------------------------------------------------------------------
ALTER TABLE public.check_ins
  ALTER COLUMN registration_id DROP NOT NULL;

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS visitor_registration_id uuid REFERENCES public.visitor_registrations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS participation_registration_id uuid REFERENCES public.participation_registrations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ticket_ref text,
  ADD COLUMN IF NOT EXISTS subject_type text DEFAULT 'visitor',
  ADD COLUMN IF NOT EXISTS event_day text NOT NULL DEFAULT '2026-11-20',
  ADD COLUMN IF NOT EXISTS checked_in_by_email text,
  ADD COLUMN IF NOT EXISTS wristband_category text,
  ADD COLUMN IF NOT EXISTS wristband_id text,
  ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tickets'
  ) THEN
    ALTER TABLE public.check_ins
      ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Repair any pre-existing non-esports registration_id entries only if an earlier
-- environment dropped the FK and stored visitor/participation UUIDs in registration_id.
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
  SET
    participation_registration_id = p.id,
    registration_id = NULL
  FROM public.participation_registrations p
  WHERE ci.participation_registration_id IS NULL
    AND (
      (ci.registration_id = p.id AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = ci.registration_id))
      OR (
        ci.registration_id IS NOT NULL
        AND ci.subject_type = 'participation'
        AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = ci.registration_id)
        AND upper(coalesce(ci.ticket_ref, '')) = upper(p.registration_ref)
      )
    );

  UPDATE public.check_ins ci
  SET registration_id = NULL
  WHERE ci.registration_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = ci.registration_id);
END $$;

-- Ensure check_ins_registration_id_fkey exists referencing public.registrations(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.check_ins'::regclass
      AND conname = 'check_ins_registration_id_fkey'
      AND contype = 'f'
  ) THEN
    ALTER TABLE public.check_ins
      ADD CONSTRAINT check_ins_registration_id_fkey
      FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure every check_ins row has at least one authoritative subject link
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.check_ins'::regclass
      AND conname = 'check_ins_subject_link_check'
  ) THEN
    ALTER TABLE public.check_ins
      ADD CONSTRAINT check_ins_subject_link_check
      CHECK (
        registration_id IS NOT NULL
        OR visitor_registration_id IS NOT NULL
        OR participation_registration_id IS NOT NULL
        OR ticket_ref IS NOT NULL
      );
  END IF;
END $$;

-- Covering indexes for all FK & lookup columns (performance-advisor compliant)
CREATE INDEX IF NOT EXISTS idx_check_ins_registration
  ON public.check_ins USING btree (registration_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_visitor_registration_id
  ON public.check_ins USING btree (visitor_registration_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_participation_registration_id
  ON public.check_ins USING btree (participation_registration_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_in_by
  ON public.check_ins USING btree (checked_in_by);
CREATE INDEX IF NOT EXISTS idx_check_ins_player_id
  ON public.check_ins USING btree (player_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_supervisor_id
  ON public.check_ins USING btree (supervisor_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_ticket_ref
  ON public.check_ins (upper(ticket_ref));
CREATE INDEX IF NOT EXISTS idx_check_ins_event_day
  ON public.check_ins (event_day);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'check_ins' AND column_name = 'ticket_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_check_ins_ticket_id
      ON public.check_ins USING btree (ticket_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_check_ins_unique_daily_entry
  ON public.check_ins (ticket_ref, event_day, subject_type)
  WHERE is_override = false AND ticket_ref IS NOT NULL;

-- Preserve RLS on check_ins & keep RBAC / staff policies intact
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.check_ins FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.check_ins TO authenticated;
GRANT ALL ON public.check_ins TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.has_crm_permission(text)') IS NOT NULL
     AND to_regprocedure('public.is_entry_staff()') IS NOT NULL
     AND to_regprocedure('public.is_checkin_staff()') IS NOT NULL THEN
    DROP POLICY IF EXISTS "checkin_staff_read_check_ins" ON public.check_ins;
    CREATE POLICY "checkin_staff_read_check_ins"
    ON public.check_ins FOR SELECT
    TO authenticated
    USING (
      public.is_entry_staff()
      OR public.is_checkin_staff()
      OR public.has_crm_permission('entry:view')
      OR public.has_crm_permission('visitor:view')
      OR public.has_crm_permission('participation:view')
      OR public.has_crm_permission('esports:view')
      OR public.is_admin()
    );

    DROP POLICY IF EXISTS "checkin_staff_insert_check_ins" ON public.check_ins;
    CREATE POLICY "checkin_staff_insert_check_ins"
    ON public.check_ins FOR INSERT
    TO authenticated
    WITH CHECK (
      public.has_crm_permission('entry:checkin_visitor')
      OR public.has_crm_permission('entry:checkin_esports')
      OR public.has_crm_permission('visitor:edit')
      OR public.has_crm_permission('participation:edit')
      OR public.has_crm_permission('esports:edit')
      OR public.is_checkin_staff()
      OR public.is_admin()
    );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Helper Functions
-- ------------------------------------------------------------------------------
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
        'UPDATE public.%I SET check_in_status = ''checked_in'', checked_in_at = $1, checked_in_by = $2, checked_in_by_email = $3 WHERE id = $4',
        p_table_name
      ) USING p_now, p_uid, p_actor_email, p_reg_id;
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET check_in_status = ''checked_in'', checked_in_at = $1, checked_in_by = $2 WHERE id = $3',
        p_table_name
      ) USING p_now, p_uid, p_reg_id;
    END IF;
  ELSIF v_col_type IS NOT NULL THEN
    IF v_has_email_col THEN
      EXECUTE format(
        'UPDATE public.%I SET check_in_status = ''checked_in'', checked_in_at = $1, checked_in_by = $2, checked_in_by_email = $3 WHERE id = $4',
        p_table_name
      ) USING p_now, coalesce(p_actor_email, p_uid::text), p_actor_email, p_reg_id;
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET check_in_status = ''checked_in'', checked_in_at = $1, checked_in_by = $2 WHERE id = $3',
        p_table_name
      ) USING p_now, coalesce(p_actor_email, p_uid::text), p_reg_id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._sync_registration_checkin_fields(text, uuid, timestamptz, uuid, text) FROM PUBLIC, anon, authenticated;

-- Internal permission helper resilient across RBAC & legacy admin schemas
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
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF p_require_override THEN
    IF v_has_perm_fn THEN
      RETURN public.has_crm_permission('entry:override_checkin');
    END IF;
    RETURN public.is_admin();
  END IF;

  IF v_has_perm_fn THEN
    IF p_subject_type = 'visitor' THEN
      RETURN public.has_crm_permission('entry:checkin_visitor')
          OR public.has_crm_permission('visitor:edit')
          OR public.is_admin();
    ELSIF p_subject_type = 'esports_player' THEN
      RETURN public.has_crm_permission('entry:checkin_esports')
          OR public.has_crm_permission('esports:edit')
          OR public.is_admin();
    ELSE
      RETURN public.has_crm_permission('entry:checkin_visitor')
          OR public.has_crm_permission('participation:edit')
          OR public.is_admin();
    END IF;
  END IF;

  IF v_has_checkin_fn THEN
    RETURN public.is_checkin_staff() OR public.is_admin();
  END IF;

  RETURN public.is_admin();
END;
$$;

REVOKE ALL ON FUNCTION public._can_perform_checkin(text, boolean) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. Fixed perform_event_checkin RPC (Strict FK ID Resolution)
-- ------------------------------------------------------------------------------
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
  v_norm_subject text := CASE
    WHEN lower(trim(coalesce(p_subject_type, 'visitor'))) IN ('esports', 'esports_player', 'esports_team') THEN 'esports_player'
    WHEN lower(trim(coalesce(p_subject_type, 'visitor'))) = 'participation' THEN 'participation'
    ELSE 'visitor'
  END;
  v_event_day text := coalesce(nullif(trim(coalesce(p_event_day, '')), ''), '2026-11-20');
  v_existing record;
  v_checkin_id uuid;
  v_cat_id uuid;
  v_now timestamptz := now();

  -- Resolved underlying record IDs (strictly separated per FK target table)
  v_esports_reg_id uuid := NULL;
  v_visitor_reg_id uuid := NULL;
  v_part_reg_id uuid := NULL;
  v_player_id uuid := NULL;
  v_ticket_id uuid := NULL;
  v_canonical_ref text := v_clean_ref;

  v_vis record;
  v_part record;
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

  IF v_event_day NOT IN ('2026-11-20', '2026-11-21') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid event day session.');
  END IF;

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

  -- Resolve the authoritative record by category so visitor/participation UUIDs
  -- are NEVER passed into check_ins.registration_id (which references public.registrations).
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

    -- Only populate check_ins.registration_id if linked_registration_ref resolves to a real public.registrations row
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

  ELSIF v_norm_subject = 'participation' THEN
    SELECT * INTO v_part
    FROM public.participation_registrations
    WHERE (p_registration_id IS NOT NULL AND id = p_registration_id)
       OR (v_clean_ref <> '' AND (upper(registration_ref) = v_clean_ref OR upper(coalesce(visitor_ticket_ref, '')) = v_clean_ref))
    ORDER BY (CASE WHEN upper(registration_ref) = v_clean_ref THEN 0 ELSE 1 END)
    LIMIT 1;

    IF NOT FOUND AND v_has_tickets_table AND v_clean_ref <> '' THEN
      SELECT id, registration_id INTO v_tkt_id, v_tkt_reg_id
      FROM public.tickets
      WHERE registration_category = 'participation'
        AND (upper(ticket_ref) = v_clean_ref OR upper(registration_ref) = v_clean_ref)
      LIMIT 1;

      IF v_tkt_reg_id IS NOT NULL THEN
        SELECT * INTO v_part FROM public.participation_registrations WHERE id = v_tkt_reg_id LIMIT 1;
      END IF;
    END IF;

    IF v_part.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Participation registration not found for ticket reference.');
    END IF;

    IF public._is_registration_archived(v_part.archived_at, v_part.admin_notes) OR v_part.status <> 'confirmed' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Participation pass is not confirmed or has been archived.');
    END IF;

    v_part_reg_id := v_part.id;
    v_esports_reg_id := NULL;
    v_canonical_ref := coalesce(nullif(upper(trim(coalesce(v_part.visitor_ticket_ref, ''))), ''), upper(v_part.registration_ref));

    IF v_part.visitor_id IS NOT NULL THEN
      SELECT id INTO v_visitor_reg_id FROM public.visitor_registrations WHERE id = v_part.visitor_id LIMIT 1;
    END IF;

    IF v_has_tickets_table THEN
      SELECT id INTO v_ticket_id
      FROM public.tickets
      WHERE registration_category = 'participation' AND registration_id = v_part.id
      LIMIT 1;
    END IF;

  ELSE
    -- Esports: resolve player first (if individual player ticket), then team registration in public.registrations
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
    AND is_override = false
    AND (
      upper(coalesce(ticket_ref, '')) = upper(v_canonical_ref)
      OR (v_clean_ref <> '' AND upper(coalesce(ticket_ref, '')) = v_clean_ref)
      OR (v_norm_subject = 'visitor' AND v_visitor_reg_id IS NOT NULL AND visitor_registration_id = v_visitor_reg_id)
      OR (v_norm_subject = 'participation' AND v_part_reg_id IS NOT NULL AND participation_registration_id = v_part_reg_id)
      OR (v_norm_subject = 'esports_player' AND v_player_id IS NOT NULL AND player_id = v_player_id)
      OR (v_norm_subject = 'esports_player' AND v_player_id IS NULL AND v_esports_reg_id IS NOT NULL AND registration_id = v_esports_reg_id)
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

  IF v_has_tickets_table THEN
    INSERT INTO public.check_ins (
      registration_id,
      visitor_registration_id,
      participation_registration_id,
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
      v_part_reg_id,
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
  ELSE
    INSERT INTO public.check_ins (
      registration_id,
      visitor_registration_id,
      participation_registration_id,
      player_id,
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
      v_part_reg_id,
      v_player_id,
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
  END IF;

  IF p_wristband_category IS NOT NULL AND v_has_wristbands_table THEN
    IF to_regprocedure('public.has_crm_permission(text)') IS NOT NULL THEN
      v_can_issue_band := public.has_crm_permission('entry:issue_wristband');
    ELSE
      v_can_issue_band := public.is_admin();
    END IF;

    IF v_can_issue_band THEN
      SELECT id INTO v_cat_id FROM public.wristband_categories WHERE name = p_wristband_category LIMIT 1;
      INSERT INTO public.wristband_issuances (
        ticket_ref, registration_id, subject_type, event_day, category_id, category_name, wristband_code, issued_by, issued_by_email, issued_at, status
      )
      VALUES (
        v_canonical_ref,
        coalesce(v_visitor_reg_id, v_part_reg_id, v_esports_reg_id),
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
  IF v_part_reg_id IS NOT NULL THEN
    PERFORM public._sync_registration_checkin_fields('participation_registrations', v_part_reg_id, v_now, v_uid, v_actor_email);
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
        'participation_registration_id', v_part_reg_id,
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
-- 5. Fixed checkin_gate_ticket RPC (Updates cleanly when public.tickets exists)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tickets'
  ) THEN
    EXECUTE $fn$
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
    AS $body$
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
      v_part_reg_id uuid := NULL;
      v_event_day text := coalesce(nullif(trim(coalesce(p_event_day, '')), ''), '2026-11-20');
      v_has_wristbands_table boolean := false;
      v_can_issue_band boolean := false;
    BEGIN
      IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Authentication required.');
      END IF;

      SELECT * INTO v_tkt
      FROM public.tickets
      WHERE upper(ticket_ref) = upper(trim(coalesce(p_ticket_ref, '')))
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Ticket not found.');
      END IF;

      IF v_tkt.registration_category = 'visitor' THEN
        v_subject_type := 'visitor';
      ELSIF v_tkt.registration_category = 'esports' THEN
        v_subject_type := 'esports_player';
      ELSE
        v_subject_type := 'participation';
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
      ELSIF v_tkt.registration_category = 'participation' THEN
        SELECT status, archived_at, admin_notes INTO v_reg_status, v_archived_at, v_admin_notes
        FROM public.participation_registrations WHERE id = v_tkt.registration_id;
        v_part_reg_id := v_tkt.registration_id;
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

      IF v_tkt.checked_in_at IS NOT NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'verdict', 'ALREADY USED',
          'can_check_in', false,
          'duplicate', true,
          'checked_in_at', v_tkt.checked_in_at,
          'checked_in_by', coalesce(v_tkt.checked_in_by_email, v_tkt.checked_in_by::text),
          'error', 'Ticket has already been used for gate entry.'
        );
      END IF;

      SELECT coalesce(
        nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
        (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
        'staff@supernova'
      ) INTO v_actor_email;

      UPDATE public.tickets
      SET
        checked_in_at = v_now,
        checked_in_by = v_uid,
        checked_in_by_email = v_actor_email,
        updated_at = v_now
      WHERE id = v_tkt.id;

      IF v_tkt.registration_category = 'visitor' THEN
        PERFORM public._sync_registration_checkin_fields('visitor_registrations', v_tkt.registration_id, v_now, v_uid, v_actor_email);
      ELSIF v_tkt.registration_category = 'participation' THEN
        PERFORM public._sync_registration_checkin_fields('participation_registrations', v_tkt.registration_id, v_now, v_uid, v_actor_email);
      ELSE
        PERFORM public._sync_registration_checkin_fields('registrations', v_tkt.registration_id, v_now, v_uid, v_actor_email);
      END IF;

      INSERT INTO public.check_ins (
        registration_id,
        visitor_registration_id,
        participation_registration_id,
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
        v_part_reg_id,
        v_tkt.id,
        v_tkt.ticket_ref,
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
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_checkin_id;

      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wristband_issuances')
        INTO v_has_wristbands_table;
      IF p_wristband_category IS NOT NULL AND v_has_wristbands_table THEN
        IF to_regprocedure('public.has_crm_permission(text)') IS NOT NULL THEN
          v_can_issue_band := public.has_crm_permission('entry:issue_wristband');
        ELSE
          v_can_issue_band := public.is_admin();
        END IF;
        IF v_can_issue_band THEN
          SELECT id INTO v_cat_id FROM public.wristband_categories WHERE name = p_wristband_category LIMIT 1;
          INSERT INTO public.wristband_issuances (
            ticket_ref, registration_id, subject_type, event_day, category_id, category_name, wristband_code, issued_by, issued_by_email, issued_at, status
          )
          VALUES (
            v_tkt.ticket_ref, v_tkt.registration_id, v_subject_type, v_event_day, v_cat_id,
            p_wristband_category, p_wristband_code, v_uid, v_actor_email, v_now, 'active'
          )
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;

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
          'participation_registration_id', v_part_reg_id,
          'event_day', v_event_day,
          'checked_in_by', v_actor_email,
          'checked_in_by_id', v_uid,
          'checked_in_at', v_now
        )
      );

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
    $body$;
    $fn$;

    REVOKE ALL ON FUNCTION public.checkin_gate_ticket(text, text, text, text, text, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.checkin_gate_ticket(text, text, text, text, text, text) TO authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
