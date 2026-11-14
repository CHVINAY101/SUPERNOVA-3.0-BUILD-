-- ==============================================================================
-- SUPERNOVA 3.0 — GATE VERIFICATION HOTFIX (UUID/EMAIL MISMATCH & SCHEMA CACHE)
-- Migration: 20261115000003_fix_gate_verification_uuid_and_schema_cache.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Idempotent: Safe to run multiple times without disturbing existing data.
-- Fixes:
--   1. Ensures public.tickets & public.verify_gate_ticket(p_query, p_qr_token)
--      exist and refreshes PostgREST schema cache (NOTIFY pgrst, 'reload schema').
--   2. Fixes "invalid input syntax for type uuid" caused by writing staff email
--      strings into uuid checked_in_by columns in perform_event_checkin and
--      checkin_gate_ticket (stores auth.uid() in checked_in_by and email in
--      checked_in_by_email).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. Ensure public.tickets & check_ins / registration check-in columns exist
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_ref text NOT NULL UNIQUE,
  qr_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  registration_id uuid NOT NULL,
  registration_category text NOT NULL CHECK (registration_category IN ('visitor', 'participation', 'esports')),
  registration_ref text NOT NULL,
  display_name text NOT NULL,
  subtitle text,
  institution text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'revoked')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  checked_in_at timestamptz,
  checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_in_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tickets_category_registration UNIQUE (registration_category, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_ref ON public.tickets (upper(ticket_ref));
CREATE INDEX IF NOT EXISTS idx_tickets_qr_token ON public.tickets (qr_token);
CREATE INDEX IF NOT EXISTS idx_tickets_reg_lookup ON public.tickets (registration_category, registration_id);
CREATE INDEX IF NOT EXISTS idx_tickets_reg_ref ON public.tickets (upper(registration_ref));
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_checked_in_by ON public.tickets (checked_in_by);

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
  public.has_crm_permission('entry:view')
  OR public.has_crm_permission('entry:scan_visitor')
  OR public.has_crm_permission('entry:scan_esports')
  OR public.has_crm_permission('visitor:view')
  OR public.has_crm_permission('participation:view')
  OR public.has_crm_permission('esports:view')
  OR public.has_crm_permission('reports:view')
);

ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS ticket_ref text,
  ADD COLUMN IF NOT EXISTS subject_type text DEFAULT 'visitor',
  ADD COLUMN IF NOT EXISTS event_day text NOT NULL DEFAULT '2026-11-20',
  ADD COLUMN IF NOT EXISTS checked_in_by_email text,
  ADD COLUMN IF NOT EXISTS wristband_category text,
  ADD COLUMN IF NOT EXISTS wristband_id text,
  ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.visitor_registrations
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text;

ALTER TABLE public.participation_registrations
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS checked_in_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_by_email text;

-- ------------------------------------------------------------------------------
-- 2. Helper Functions
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

-- Safely updates check_in_status/checked_in_at/checked_in_by/checked_in_by_email
-- regardless of whether an older schema defined checked_in_by as uuid or text.
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
  IF p_table_name NOT IN ('visitor_registrations', 'participation_registrations', 'registrations') THEN
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

-- ------------------------------------------------------------------------------
-- 3. Fixed perform_event_checkin (UUID stored in checked_in_by; email in checked_in_by_email)
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
  v_existing record;
  v_checkin_id uuid;
  v_cat_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  IF p_subject_type = 'visitor' THEN
    IF NOT (public.has_crm_permission('entry:checkin_visitor') OR public.has_crm_permission('visitor:edit')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: visitor check-in permission required');
    END IF;
  ELSIF p_subject_type = 'esports_player' THEN
    IF NOT (public.has_crm_permission('entry:checkin_esports') OR public.has_crm_permission('esports:edit')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: esports check-in permission required');
    END IF;
  ELSE
    IF NOT (public.has_crm_permission('entry:checkin_visitor') OR public.has_crm_permission('participation:edit')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: check-in permission required');
    END IF;
  END IF;

  IF p_is_override AND NOT public.has_crm_permission('entry:override_checkin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: Supervisor override permission required');
  END IF;

  IF p_is_override AND coalesce(trim(p_override_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Override reason is mandatory');
  END IF;

  SELECT coalesce(email, full_name, 'staff@supernova') INTO v_actor_email
  FROM public.profiles WHERE id = v_uid;

  SELECT id, checked_in_at, coalesce(checked_in_by_email, checked_in_by::text) AS prior_staff
  INTO v_existing
  FROM public.check_ins
  WHERE ticket_ref = p_ticket_ref
    AND event_day = p_event_day
    AND subject_type = p_subject_type
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
    p_registration_id,
    p_ticket_ref,
    p_subject_type,
    p_event_day,
    'individual',
    v_uid,
    v_actor_email,
    v_now,
    p_wristband_category,
    p_wristband_code,
    p_is_override,
    p_override_reason,
    CASE WHEN p_is_override THEN v_uid ELSE NULL END,
    CASE WHEN p_is_override THEN 'Supervisor override: ' || p_override_reason ELSE 'Verified gate check-in (' || p_event_day || ')' END
  )
  RETURNING id INTO v_checkin_id;

  IF p_wristband_category IS NOT NULL AND public.has_crm_permission('entry:issue_wristband') THEN
    SELECT id INTO v_cat_id FROM public.wristband_categories WHERE name = p_wristband_category LIMIT 1;
    INSERT INTO public.wristband_issuances (
      ticket_ref, registration_id, subject_type, event_day, category_id, category_name, wristband_code, issued_by, issued_by_email, issued_at, status
    )
    VALUES (
      p_ticket_ref, p_registration_id, p_subject_type, p_event_day, v_cat_id, p_wristband_category, p_wristband_code, v_uid, v_actor_email, v_now, 'active'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_registration_id IS NOT NULL THEN
    IF p_subject_type = 'visitor' THEN
      PERFORM public._sync_registration_checkin_fields('visitor_registrations', p_registration_id, v_now, v_uid, v_actor_email);
    ELSIF p_subject_type = 'participation' THEN
      PERFORM public._sync_registration_checkin_fields('participation_registrations', p_registration_id, v_now, v_uid, v_actor_email);
    ELSIF p_subject_type = 'esports_player' THEN
      PERFORM public._sync_registration_checkin_fields('registrations', p_registration_id, v_now, v_uid, v_actor_email);
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid,
    CASE WHEN p_is_override THEN 'checkin_supervisor_override' ELSE 'event_checkin' END,
    'check_ins',
    v_checkin_id,
    jsonb_build_object(
      'ticket_ref', p_ticket_ref,
      'subject_type', p_subject_type,
      'event_day', p_event_day,
      'wristband_category', p_wristband_category,
      'is_override', p_is_override,
      'override_reason', p_override_reason,
      'checked_in_by_email', v_actor_email
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'checkin_id', v_checkin_id,
    'checked_in_at', v_now,
    'checked_in_by', v_actor_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_event_checkin(text, text, text, uuid, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_event_checkin(text, text, text, uuid, text, text, boolean, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. Authoritative Gate Ticket Verification RPC: verify_gate_ticket(p_query, p_qr_token)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_gate_ticket(
  p_query text,
  p_qr_token text DEFAULT NULL
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
  v_tkt public.tickets%ROWTYPE;
  v_reg_status text;
  v_archived_at timestamptz;
  v_admin_notes text;
  v_verdict text := 'INVALID';
  v_reason text := 'Ticket not found.';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Authentication required.');
  END IF;

  IF NOT (
    public.is_entry_staff()
    OR public.has_crm_permission('visitor:view')
    OR public.has_crm_permission('participation:view')
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

  IF v_tkt.registration_category = 'visitor' AND NOT (
    public.has_crm_permission('entry:scan_visitor') OR public.has_crm_permission('visitor:view')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: You do not have permission to verify visitor passes.');
  ELSIF v_tkt.registration_category = 'esports' AND NOT (
    public.has_crm_permission('entry:scan_esports') OR public.has_crm_permission('esports:view')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: You do not have permission to verify esports passes.');
  ELSIF v_tkt.registration_category = 'participation' AND NOT (
    public.has_crm_permission('entry:scan_visitor') OR public.has_crm_permission('participation:view') OR public.has_crm_permission('entry:view')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: You do not have permission to verify participation passes.');
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
  ELSIF v_tkt.registration_category = 'participation' THEN
    SELECT status, archived_at, admin_notes INTO v_reg_status, v_archived_at, v_admin_notes
    FROM public.participation_registrations WHERE id = v_tkt.registration_id;
  ELSE
    SELECT status, archived_at, admin_notes INTO v_reg_status, v_archived_at, v_admin_notes
    FROM public.registrations WHERE id = v_tkt.registration_id;
  END IF;

  IF v_tkt.status <> 'active' THEN
    v_verdict := 'INVALID';
    v_reason := 'Ticket status is "' || v_tkt.status || '".';
  ELSIF v_reg_status IS NULL OR public._is_registration_archived(v_archived_at, v_admin_notes) THEN
    v_verdict := 'INVALID';
    v_reason := 'Associated registration is missing or archived.';
  ELSIF v_reg_status <> 'confirmed' THEN
    v_verdict := 'INVALID';
    v_reason := 'Associated registration status is "' || v_reg_status || '" (not confirmed).';
  ELSIF v_tkt.checked_in_at IS NOT NULL THEN
    v_verdict := 'ALREADY USED';
    v_reason := 'Ticket already checked in at ' || to_char(v_tkt.checked_in_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH12:MI AM') || ' IST.';
  ELSE
    v_verdict := 'VALID';
    v_reason := 'Authentic confirmed ticket eligible for gate admission.';
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
      'checked_in_at', v_tkt.checked_in_at,
      'checked_in_by', v_tkt.checked_in_by,
      'checked_in_by_email', v_tkt.checked_in_by_email
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_gate_ticket(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_gate_ticket(text, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. Atomic Single-Use Gate Check-In RPC: checkin_gate_ticket(...)
-- ------------------------------------------------------------------------------
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
  v_now timestamptz := now();
  v_checkin_id uuid;
  v_subject_type text;
  v_cat_id uuid;
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
    IF NOT (public.has_crm_permission('entry:checkin_visitor') OR public.has_crm_permission('visitor:edit')) THEN
      RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: visitor check-in permission required.');
    END IF;
    v_subject_type := 'visitor';
  ELSIF v_tkt.registration_category = 'esports' THEN
    IF NOT (public.has_crm_permission('entry:checkin_esports') OR public.has_crm_permission('esports:edit')) THEN
      RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: esports check-in permission required.');
    END IF;
    v_subject_type := 'esports_player';
  ELSE
    IF NOT (public.has_crm_permission('entry:checkin_visitor') OR public.has_crm_permission('participation:edit')) THEN
      RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: participation check-in permission required.');
    END IF;
    v_subject_type := 'participation';
  END IF;

  IF p_qr_token IS NOT NULL AND trim(p_qr_token) <> '' AND v_tkt.qr_token <> trim(p_qr_token) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'QR token mismatch.');
  END IF;

  IF v_tkt.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Ticket is ' || v_tkt.status || '.');
  END IF;

  IF v_tkt.registration_category = 'visitor' THEN
    SELECT status, archived_at, admin_notes INTO v_reg_status, v_archived_at, v_admin_notes
    FROM public.visitor_registrations WHERE id = v_tkt.registration_id;
  ELSIF v_tkt.registration_category = 'participation' THEN
    SELECT status, archived_at, admin_notes INTO v_reg_status, v_archived_at, v_admin_notes
    FROM public.participation_registrations WHERE id = v_tkt.registration_id;
  ELSE
    SELECT status, archived_at, admin_notes INTO v_reg_status, v_archived_at, v_admin_notes
    FROM public.registrations WHERE id = v_tkt.registration_id;
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

  SELECT coalesce(email, full_name, 'staff@supernova') INTO v_actor_email
  FROM public.profiles WHERE id = v_uid;

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
    registration_id, ticket_ref, subject_type, event_day, check_in_type,
    checked_in_by, checked_in_by_email, checked_in_at,
    wristband_category, wristband_id, is_override, notes
  )
  VALUES (
    v_tkt.registration_id, v_tkt.ticket_ref, v_subject_type, coalesce(p_event_day, '2026-11-20'), 'individual',
    v_uid, v_actor_email, v_now,
    p_wristband_category, p_wristband_code, false,
    coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'Verified ticket gate entry (' || v_tkt.registration_category || ')')
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_checkin_id;

  IF p_wristband_category IS NOT NULL AND public.has_crm_permission('entry:issue_wristband') THEN
    SELECT id INTO v_cat_id FROM public.wristband_categories WHERE name = p_wristband_category LIMIT 1;
    INSERT INTO public.wristband_issuances (
      ticket_ref, registration_id, subject_type, event_day, category_id, category_name, wristband_code, issued_by, issued_by_email, issued_at, status
    )
    VALUES (
      v_tkt.ticket_ref, v_tkt.registration_id, v_subject_type, coalesce(p_event_day, '2026-11-20'), v_cat_id,
      p_wristband_category, p_wristband_code, v_uid, v_actor_email, v_now, 'active'
    )
    ON CONFLICT DO NOTHING;
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
      'registration_id', v_tkt.registration_id,
      'event_day', coalesce(p_event_day, '2026-11-20'),
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

-- ------------------------------------------------------------------------------
-- 6. Reload PostgREST Schema Cache Immediately
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
