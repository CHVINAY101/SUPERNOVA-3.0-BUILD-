-- ==============================================================================
-- SUPERNOVA 3.0 — GATE CHECK-IN SCHEMA REPAIR, MULTI-DAY VERIFICATION & WALK-IN
-- Migration: 20261118000000_gate_checkin_schema_repair_and_walkin.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Safe & Idempotent:
--   1. Repairs public.check_ins missing columns (including checked_in_by_email,
--      visitor_registration_id, ticket_id, ticket_ref, subject_type, event_day,
--      wristband_category, wristband_id, is_override, override_reason, supervisor_id)
--      and keeps check_ins.registration_id nullable while preserving
--      check_ins_registration_id_fkey.
--   2. Ensures checked_in_by_email exists on tickets, visitor_registrations, and
--      registrations.
--   3. Adds registration_source ('public' | 'walk_in') to public.visitor_registrations
--      without altering historical rows (default 'public').
--   4. Updates submit_visitor_registration_v2 & submit_visitor_and_issue_ticket to
--      support authorized gate walk-in creation + retry idempotency (zero
--      duplicate registrations or duplicate tickets on retry).
--   5. Fixes verify_gate_ticket & checkin_gate_ticket so duplicate detection is
--      scoped per event_day (2026-11-20 vs 2026-11-21) instead of blocking Day 2
--      after Day 1 check-in.
--   6. Reloads PostgREST schema cache (NOTIFY pgrst, 'reload schema').
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Repair public.check_ins schema & preserve FK integrity
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_ins_registration_id_fkey'
      AND conrelid = 'public.check_ins'::regclass
  ) THEN
    ALTER TABLE public.check_ins
      ADD CONSTRAINT check_ins_registration_id_fkey
      FOREIGN KEY (registration_id) REFERENCES public.registrations(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_check_ins_visitor_reg_id ON public.check_ins(visitor_registration_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_ticket_id ON public.check_ins(ticket_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_ticket_ref_day ON public.check_ins(upper(ticket_ref), event_day);
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_in_by_email ON public.check_ins(checked_in_by_email);

-- Ensure check-in tracking columns exist on registration & ticket tables
ALTER TABLE public.visitor_registrations
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text,
  ADD COLUMN IF NOT EXISTS registration_source text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS student_class text,
  ADD COLUMN IF NOT EXISTS student_id text,
  ADD COLUMN IF NOT EXISTS ticket_ref text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text;

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

-- Backfill registration_source = 'walk_in' cleanly for any prior walk-in records
UPDATE public.visitor_registrations
SET registration_source = 'walk_in'
WHERE registration_source = 'public'
  AND (
    lower(coalesce(visitor_category, '')) LIKE '%walk%'
    OR coalesce(admin_notes, '') ILIKE '%[WALK_IN]%'
    OR coalesce(admin_notes, '') ILIKE '%walk-in%'
    OR upper(coalesce(registration_ref, '')) LIKE 'SN3-VIS-WALK-%'
  );

-- ------------------------------------------------------------------------------
-- 2. Update _issue_ticket_internal to include registration_source in metadata
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
      nullif(trim(coalesce(v_vis.visitor_category, '')), ''),
      'General Visitor'
    );
    v_institution := v_vis.institution;
    v_meta := jsonb_build_object(
      'days_attending', coalesce(v_vis.days_attending, 'Both'),
      'visitor_category', coalesce(v_vis.visitor_category, 'Student'),
      'student_class', v_vis.student_class,
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
    v_qr_token := encode(extensions.gen_random_bytes(32), 'hex');

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
      v_ticket_ref,
      v_qr_token,
      p_registration_id,
      p_category,
      v_reg_ref,
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

-- ------------------------------------------------------------------------------
-- 3. Visitor Registration + Walk-In RPCs (Canonical 18-param with p_registration_source)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text);

CREATE OR REPLACE FUNCTION public.submit_visitor_registration_v2(
  p_full_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_institution text DEFAULT NULL,
  p_visitor_category text DEFAULT 'Student',
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
  v_student_class text := trim(coalesce(p_student_class, ''));
  v_institution text := trim(coalesce(p_institution, ''));
  v_source text := CASE WHEN lower(trim(coalesce(p_registration_source, 'public'))) = 'walk_in' THEN 'walk_in' ELSE 'public' END;
  v_ref text;
  v_existing_walkin_ref text;
  v_ctrl record;
  v_clean_cat text;
  v_actor_email text;
  v_meta jsonb := '{}'::jsonb;
BEGIN
  IF v_source = 'walk_in' THEN
    IF v_uid IS NULL OR NOT (
      public.has_crm_permission('visitor:create')
      OR public.is_entry_staff()
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
  IF length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Full Name is mandatory (2 to 120 characters).';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'A valid Email Address is mandatory.';
  END IF;
  IF length(v_student_class) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Class / Course is mandatory.';
  END IF;
  IF length(v_institution) NOT BETWEEN 2 AND 150 THEN
    RAISE EXCEPTION 'College / Institution Name is mandatory.';
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

  v_clean_cat := CASE
    WHEN v_source = 'walk_in' THEN 'Walk-in Visitor'
    ELSE coalesce(nullif(trim(coalesce(p_visitor_category, '')), ''), 'Student')
  END;

  IF v_source = 'walk_in' THEN
    SELECT coalesce(
      nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''),
      (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
      'gate-staff@supernova'
    ) INTO v_actor_email;
  END IF;

  v_meta := jsonb_build_object(
    'student_class', v_student_class,
    'institution', v_institution,
    'registration_source', v_source,
    'designation', nullif(trim(coalesce(p_designation, '')), ''),
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
    nullif(trim(coalesce(p_designation, '')), ''),
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
  p_visitor_category text DEFAULT 'Student',
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

-- ------------------------------------------------------------------------------
-- 4. Multi-Day Aware Gate Verification & Check-In RPCs
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
    public.is_entry_staff()
    OR public.has_crm_permission('visitor:view')
    OR public.has_crm_permission('esports:view')
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
    public.has_crm_permission('entry:scan_visitor') OR public.has_crm_permission('visitor:view')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: You do not have permission to verify visitor passes.');
  ELSIF v_tkt.registration_category = 'esports' AND NOT (
    public.has_crm_permission('entry:scan_esports') OR public.has_crm_permission('esports:view')
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
      OR (v_tkt.registration_category = 'esports' AND registration_id = v_tkt.registration_id AND subject_type IN ('esports_player', 'esports_team'))
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
      'checked_in_at', coalesce(v_existing_ci.checked_in_at, v_tkt.checked_in_at),
      'checked_in_by', v_tkt.checked_in_by,
      'checked_in_by_email', coalesce(v_existing_ci.staff_ref, v_tkt.checked_in_by_email)
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
$$;

REVOKE ALL ON FUNCTION public.checkin_gate_ticket(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkin_gate_ticket(text, text, text, text, text, text) TO authenticated;

-- Reload PostgREST schema cache so newly repaired columns/RPCs take effect immediately
NOTIFY pgrst, 'reload schema';
