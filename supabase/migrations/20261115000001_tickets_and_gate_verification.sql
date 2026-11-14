-- ==============================================================================
-- SUPERNOVA 3.0 — TICKET GENERATION, CRYPTOGRAPHIC QR TOKENS & GATE VERIFICATION
-- Migration: 20261115000001_tickets_and_gate_verification.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Safe to run multiple times (idempotent) & preserves all existing data.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. Authoritative public.tickets Table
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
  public.has_crm_permission('entry:view')
  OR public.has_crm_permission('entry:scan_visitor')
  OR public.has_crm_permission('entry:scan_esports')
  OR public.has_crm_permission('visitor:view')
  OR public.has_crm_permission('participation:view')
  OR public.has_crm_permission('esports:view')
  OR public.has_crm_permission('reports:view')
);

-- ------------------------------------------------------------------------------
-- 2. Helper: Check Archive State
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

-- ------------------------------------------------------------------------------
-- 3. Internal Idempotent Ticket Issuance Engine (SECURITY DEFINER)
--    - Only issues when status = 'confirmed' AND not archived.
--    - Enforces UNIQUE (registration_category, registration_id) via ON CONFLICT.
--    - Never callable directly by anon/unprivileged callers.
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
  v_existing public.tickets%ROWTYPE;
  v_reg_ref text;
  v_candidate_ref text;
  v_display_name text;
  v_subtitle text;
  v_institution text;
  v_status text;
  v_archived_at timestamptz;
  v_admin_notes text;
  v_metadata jsonb := '{}'::jsonb;
  v_game_title text;
  v_created boolean := false;
  v_ticket public.tickets%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  IF p_category NOT IN ('visitor', 'participation', 'esports') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid registration category.');
  END IF;

  IF p_registration_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Registration ID is required.');
  END IF;

  IF p_category = 'visitor' THEN
    SELECT
      registration_ref,
      coalesce(nullif(trim(ticket_ref), ''), registration_ref),
      full_name,
      coalesce(visitor_category, 'General Visitor'),
      institution,
      status,
      archived_at,
      admin_notes,
      jsonb_build_object(
        'days_attending', coalesce(days_attending, 'Both'),
        'visitor_count', coalesce(visitor_count, 1)
      )
    INTO
      v_reg_ref, v_candidate_ref, v_display_name, v_subtitle,
      v_institution, v_status, v_archived_at, v_admin_notes, v_metadata
    FROM public.visitor_registrations
    WHERE id = p_registration_id;
  ELSIF p_category = 'participation' THEN
    SELECT
      registration_ref,
      registration_ref,
      full_name,
      coalesce(project_title, participation_area, 'Project Exhibit'),
      institution,
      status,
      archived_at,
      admin_notes,
      jsonb_build_object(
        'project_title', project_title,
        'participation_area', participation_area,
        'team_members_count', coalesce(team_members_count, 1)
      )
    INTO
      v_reg_ref, v_candidate_ref, v_display_name, v_subtitle,
      v_institution, v_status, v_archived_at, v_admin_notes, v_metadata
    FROM public.participation_registrations
    WHERE id = p_registration_id;
  ELSE
    SELECT
      r.registration_ref,
      r.registration_ref,
      r.team_name,
      coalesce(g.title, 'Esports Tournament') || ' · Capt: ' || r.captain_name,
      r.institution,
      r.status,
      r.archived_at,
      r.admin_notes,
      jsonb_build_object(
        'team_name', r.team_name,
        'captain_name', r.captain_name,
        'game_title', coalesce(g.title, 'Esports'),
        'selection_status', coalesce(r.selection_status, 'awaiting_selection')
      )
    INTO
      v_reg_ref, v_candidate_ref, v_display_name, v_subtitle,
      v_institution, v_status, v_archived_at, v_admin_notes, v_metadata
    FROM public.registrations r
    LEFT JOIN public.games g ON g.id = r.game_id
    WHERE r.id = p_registration_id;
  END IF;

  IF v_reg_ref IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'eligible', false, 'error', 'Registration record not found.');
  END IF;

  IF public._is_registration_archived(v_archived_at, v_admin_notes) OR v_status <> 'confirmed' THEN
    UPDATE public.tickets
    SET status = 'revoked', updated_at = now()
    WHERE registration_category = p_category
      AND registration_id = p_registration_id
      AND status = 'active';

    RETURN jsonb_build_object(
      'ok', false,
      'eligible', false,
      'status', v_status,
      'error', 'Ticket cannot be issued unless registration is confirmed and active.'
    );
  END IF;

  -- Check if ticket already exists for this registration (idempotent path)
  SELECT * INTO v_existing
  FROM public.tickets
  WHERE registration_category = p_category
    AND registration_id = p_registration_id;

  IF FOUND THEN
    IF v_existing.status <> 'active' THEN
      UPDATE public.tickets
      SET
        status = 'active',
        display_name = v_display_name,
        subtitle = v_subtitle,
        institution = v_institution,
        metadata = v_metadata,
        updated_at = now()
      WHERE id = v_existing.id
      RETURNING * INTO v_ticket;
    ELSE
      v_ticket := v_existing;
    END IF;
  ELSE
    -- Ensure globally unique ticket_ref in case a legacy column collided
    IF EXISTS (SELECT 1 FROM public.tickets WHERE upper(ticket_ref) = upper(v_candidate_ref)) THEN
      v_candidate_ref := public.generate_ticket_ref('SN3-TKT');
    END IF;

    INSERT INTO public.tickets (
      ticket_ref,
      registration_id,
      registration_category,
      registration_ref,
      display_name,
      subtitle,
      institution,
      metadata,
      status
    )
    VALUES (
      upper(v_candidate_ref),
      p_registration_id,
      p_category,
      upper(v_reg_ref),
      v_display_name,
      v_subtitle,
      v_institution,
      coalesce(v_metadata, '{}'::jsonb),
      'active'
    )
    ON CONFLICT (registration_category, registration_id) DO NOTHING
    RETURNING * INTO v_ticket;

    IF v_ticket.id IS NOT NULL THEN
      v_created := true;
      INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
      VALUES (
        v_actor,
        'ticket_issued',
        'tickets',
        v_ticket.id,
        jsonb_build_object(
          'ticket_ref', v_ticket.ticket_ref,
          'registration_category', p_category,
          'registration_id', p_registration_id,
          'registration_ref', v_reg_ref
        )
      );
    ELSE
      SELECT * INTO v_ticket
      FROM public.tickets
      WHERE registration_category = p_category
        AND registration_id = p_registration_id;
    END IF;
  END IF;

  -- Sync ticket_ref back onto registration row cleanly
  IF p_category = 'visitor' THEN
    UPDATE public.visitor_registrations
    SET ticket_ref = v_ticket.ticket_ref
    WHERE id = p_registration_id AND (ticket_ref IS NULL OR ticket_ref = '');
  ELSIF p_category = 'participation' THEN
    UPDATE public.participation_registrations
    SET visitor_ticket_ref = coalesce(nullif(visitor_ticket_ref, ''), v_ticket.ticket_ref)
    WHERE id = p_registration_id AND (visitor_ticket_ref IS NULL OR visitor_ticket_ref = '');
  ELSE
    UPDATE public.registrations
    SET captain_ticket_ref = coalesce(nullif(captain_ticket_ref, ''), v_ticket.ticket_ref)
    WHERE id = p_registration_id AND (captain_ticket_ref IS NULL OR captain_ticket_ref = '');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'eligible', true,
    'created', v_created,
    'ticket', jsonb_build_object(
      'id', v_ticket.id,
      'ticket_ref', v_ticket.ticket_ref,
      'qr_token', v_ticket.qr_token,
      'registration_id', v_ticket.registration_id,
      'registration_category', v_ticket.registration_category,
      'registration_ref', v_ticket.registration_ref,
      'display_name', v_ticket.display_name,
      'subtitle', v_ticket.subtitle,
      'institution', v_ticket.institution,
      'metadata', v_ticket.metadata,
      'status', v_ticket.status,
      'issued_at', v_ticket.issued_at,
      'checked_in_at', v_ticket.checked_in_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public._issue_ticket_internal(text, uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. Staff-Callable Idempotent Ticket Issuance RPC (RBAC-Enforced)
-- ------------------------------------------------------------------------------
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
      public.has_crm_permission('visitor:edit')
      OR public.has_crm_permission('visitor:create')
      OR public.has_crm_permission('entry:checkin_visitor')
      OR public.is_admin()
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: visitor permission required.');
    END IF;
  ELSIF p_category = 'participation' THEN
    IF NOT (
      public.has_crm_permission('participation:approve')
      OR public.has_crm_permission('participation:edit')
      OR public.is_admin()
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: participation approval permission required.');
    END IF;
  ELSIF p_category = 'esports' THEN
    IF NOT (
      public.has_crm_permission('esports:approve')
      OR public.has_crm_permission('esports:edit')
      OR public.is_admin()
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: esports approval permission required.');
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid registration category.');
  END IF;

  RETURN public._issue_ticket_internal(p_category, p_registration_id);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_ticket_for_registration(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_ticket_for_registration(text, uuid) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. Automatic Triggers on Registration Tables
--    - Issues ticket immediately when status becomes 'confirmed' (and not archived).
--    - Revokes active ticket if registration is declined/withdrawn/archived.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._trg_sync_ticket_on_registration_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category text := TG_ARGV[0];
BEGIN
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

DROP TRIGGER IF EXISTS trg_participation_sync_ticket ON public.participation_registrations;
CREATE TRIGGER trg_participation_sync_ticket
AFTER INSERT OR UPDATE OF status, archived_at, admin_notes ON public.participation_registrations
FOR EACH ROW EXECUTE FUNCTION public._trg_sync_ticket_on_registration_change('participation');

DROP TRIGGER IF EXISTS trg_esports_sync_ticket ON public.registrations;
CREATE TRIGGER trg_esports_sync_ticket
AFTER INSERT OR UPDATE OF status, archived_at, admin_notes ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public._trg_sync_ticket_on_registration_change('esports');

-- ------------------------------------------------------------------------------
-- 6. Update Visitor Submission RPCs: Immediate Visitor Confirmation + Ticket Issue
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_visitor_registration_v2(
  p_full_name text,
  p_email text,
  p_phone text,
  p_institution text,
  p_visitor_category text,
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
  v_clean_cat text := trim(coalesce(p_visitor_category, 'General Visitor'));
  v_meta jsonb := '{}'::jsonb;
BEGIN
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
    RAISE EXCEPTION 'Enter a valid name between 2 and 120 characters';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address';
  END IF;
  IF v_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Enter a valid mobile number (10 to 15 digits)';
  END IF;

  IF (SELECT count(*) FROM public.visitor_registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (SELECT 1 FROM public.visitor_registrations WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'A visitor registration already exists for this email address.';
  END IF;

  v_meta := jsonb_build_object(
    'student_class', nullif(trim(coalesce(p_student_class, '')), ''),
    'student_id', nullif(trim(coalesce(p_student_id, '')), ''),
    'designation', nullif(trim(coalesce(p_designation, '')), ''),
    'esports_interest', coalesce(p_esports_interest, false),
    'preferred_game', nullif(trim(coalesce(p_preferred_game, '')), ''),
    'esports_intent', nullif(trim(coalesce(p_esports_intent, '')), ''),
    'in_game_id', nullif(trim(coalesce(p_in_game_id, '')), ''),
    'team_name', nullif(trim(coalesce(p_team_name, '')), ''),
    'competition_notes', nullif(trim(coalesce(p_competition_notes, '')), ''),
    'days_attending', coalesce(p_days_attending, 'Both')
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
    metadata,
    status,
    consent_given
  )
  VALUES (
    v_name,
    v_email,
    v_phone,
    nullif(trim(coalesce(p_institution, '')), ''),
    v_clean_cat,
    1,
    nullif(trim(coalesce(p_student_class, '')), ''),
    nullif(trim(coalesce(p_student_id, '')), ''),
    nullif(trim(coalesce(p_designation, '')), ''),
    coalesce(p_esports_interest, false),
    nullif(trim(coalesce(p_preferred_game, '')), ''),
    nullif(trim(coalesce(p_esports_intent, '')), ''),
    nullif(trim(coalesce(p_in_game_id, '')), ''),
    nullif(trim(coalesce(p_team_name, '')), ''),
    nullif(trim(coalesce(p_competition_notes, '')), ''),
    coalesce(p_days_attending, 'Both'),
    v_meta,
    'confirmed',
    true
  )
  RETURNING registration_ref INTO v_ref;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_visitor_registration_v2 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_registration_v2 TO anon, authenticated;

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

  IF (SELECT count(*) FROM public.visitor_registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (SELECT 1 FROM public.visitor_registrations WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Duplicate registration';
  END IF;

  INSERT INTO public.visitor_registrations (
    full_name,
    email,
    phone,
    institution,
    visitor_category,
    status,
    consent_given
  )
  VALUES (
    v_name,
    v_email,
    v_phone,
    nullif(trim(coalesce(p_institution, '')), ''),
    p_visitor_category,
    'confirmed',
    true
  )
  RETURNING registration_ref INTO v_ref;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_visitor_registration(text, text, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_registration(text, text, text, text, text, boolean, text) TO anon, authenticated;

-- Dedicated RPC returning full visitor ticket + QR token directly to the submitting session
CREATE OR REPLACE FUNCTION public.submit_visitor_and_issue_ticket(
  p_full_name text,
  p_email text,
  p_phone text,
  p_institution text,
  p_visitor_category text,
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
  p_website text DEFAULT ''
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
    p_student_class, p_student_id, p_designation, p_esports_interest,
    p_preferred_game, p_esports_intent, p_in_game_id, p_team_name,
    p_competition_notes, p_days_attending, p_consent, p_website
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

REVOKE ALL ON FUNCTION public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. Anti-IDOR Public Ticket Retrieval RPC (Reference + Email + Phone Required)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_public_ticket(
  p_reference text,
  p_email text,
  p_phone text
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
  v_phone10 text;
  v_vis public.visitor_registrations%ROWTYPE;
  v_part public.participation_registrations%ROWTYPE;
  v_esp public.registrations%ROWTYPE;
  v_tkt public.tickets%ROWTYPE;
  v_issued jsonb;
BEGIN
  IF v_ref = '' OR v_email = '' OR length(v_phone) < 10 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'invalid_input',
      'error', 'Please enter your Registration / Ticket Reference, registered email, and 10-digit mobile number.'
    );
  END IF;

  v_phone10 := right(v_phone, 10);

  -- 1. Check direct ticket match first
  SELECT * INTO v_tkt
  FROM public.tickets
  WHERE upper(ticket_ref) = v_ref OR upper(registration_ref) = v_ref
  LIMIT 1;

  IF FOUND THEN
    IF v_tkt.registration_category = 'visitor' THEN
      SELECT * INTO v_vis FROM public.visitor_registrations WHERE id = v_tkt.registration_id;
      IF FOUND
        AND lower(trim(v_vis.email)) = v_email
        AND right(regexp_replace(coalesce(v_vis.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone10
      THEN
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
    ELSIF v_tkt.registration_category = 'participation' THEN
      SELECT * INTO v_part FROM public.participation_registrations WHERE id = v_tkt.registration_id;
      IF FOUND
        AND lower(trim(v_part.email)) = v_email
        AND right(regexp_replace(coalesce(v_part.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone10
      THEN
        IF v_part.status <> 'confirmed' OR public._is_registration_archived(v_part.archived_at, v_part.admin_notes) OR v_tkt.status <> 'active' THEN
          RETURN jsonb_build_object('ok', false, 'status', 'not_eligible', 'error', 'This participation pass is not currently active.');
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
    ELSE
      SELECT * INTO v_esp FROM public.registrations WHERE id = v_tkt.registration_id;
      IF FOUND
        AND lower(trim(v_esp.email)) = v_email
        AND right(regexp_replace(coalesce(v_esp.phone, ''), '[^0-9]', '', 'g'), 10) = v_phone10
      THEN
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
    END IF;
  END IF;

  -- 2. Fallback check against registration tables (handles pending / awaiting approval / unbackfilled confirmed)
  SELECT * INTO v_part
  FROM public.participation_registrations
  WHERE (upper(registration_ref) = v_ref OR upper(coalesce(visitor_ticket_ref, '')) = v_ref)
    AND lower(trim(email)) = v_email
    AND right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = v_phone10
  LIMIT 1;

  IF FOUND THEN
    IF public._is_registration_archived(v_part.archived_at, v_part.admin_notes) OR v_part.status IN ('declined', 'withdrawn') THEN
      RETURN jsonb_build_object('ok', false, 'status', 'not_eligible', 'error', 'This participation application is not eligible for ticket issuance.');
    END IF;
    IF v_part.status <> 'confirmed' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'pending_approval',
        'registration_category', 'participation',
        'registration_status', v_part.status,
        'error', 'Your participation application is awaiting administrator approval. Your official ticket will be issued once approved.'
      );
    END IF;
    v_issued := public._issue_ticket_internal('participation', v_part.id);
    IF coalesce((v_issued->>'ok')::boolean, false) THEN
      RETURN jsonb_build_object('ok', true, 'status', 'issued', 'ticket', v_issued->'ticket');
    END IF;
  END IF;

  SELECT * INTO v_esp
  FROM public.registrations
  WHERE (upper(registration_ref) = v_ref OR upper(coalesce(captain_ticket_ref, '')) = v_ref)
    AND lower(trim(email)) = v_email
    AND right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = v_phone10
  LIMIT 1;

  IF FOUND THEN
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
    AND right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = v_phone10
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
    'error', 'No matching registration found for the provided reference, email, and phone number.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_public_ticket(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_public_ticket(text, text, text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 8. Staff Gate Verification & Atomic Check-In RPCs (RBAC-Enforced)
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
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Authentication required.');
  END IF;

  IF NOT (
    public.is_entry_staff()
    OR public.has_crm_permission('visitor:view')
    OR public.has_crm_permission('participation:view')
    OR public.has_crm_permission('esports:view')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Forbidden: Gate verification permission required.');
  END IF;

  IF v_clean_query = '' AND v_clean_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'reason', 'Ticket reference or QR token is required.');
  END IF;

  -- Locate ticket by token first (if provided or hex token passed as query), else by ticket_ref / registration_ref
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

  -- Enforce stream-level read permission
  IF v_tkt.registration_category = 'visitor' AND NOT (
    public.has_crm_permission('entry:scan_visitor') OR public.has_crm_permission('visitor:view')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Forbidden: You do not have permission to verify visitor passes.');
  ELSIF v_tkt.registration_category = 'esports' AND NOT (
    public.has_crm_permission('entry:scan_esports') OR public.has_crm_permission('esports:view')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Forbidden: You do not have permission to verify esports passes.');
  ELSIF v_tkt.registration_category = 'participation' AND NOT (
    public.has_crm_permission('entry:scan_visitor') OR public.has_crm_permission('participation:view') OR public.has_crm_permission('entry:view')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Forbidden: You do not have permission to verify participation passes.');
  END IF;

  -- If both ticket_ref and qr_token were supplied, verify exact cryptographic match
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

  -- Load live registration approval status
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
      'checked_in_by_email', v_tkt.checked_in_by_email
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_gate_ticket(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_gate_ticket(text, text) TO authenticated;

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
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Authentication required.');
  END IF;

  -- Lock the authoritative ticket row so concurrent scans serialize atomically
  SELECT * INTO v_tkt
  FROM public.tickets
  WHERE upper(ticket_ref) = upper(trim(coalesce(p_ticket_ref, '')))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Ticket not found.');
  END IF;

  -- Category-scoped check-in permission enforcement
  IF v_tkt.registration_category = 'visitor' THEN
    IF NOT (public.has_crm_permission('entry:checkin_visitor') OR public.has_crm_permission('visitor:edit')) THEN
      RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Forbidden: visitor check-in permission required.');
    END IF;
    v_subject_type := 'visitor';
  ELSIF v_tkt.registration_category = 'esports' THEN
    IF NOT (public.has_crm_permission('entry:checkin_esports') OR public.has_crm_permission('esports:edit')) THEN
      RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Forbidden: esports check-in permission required.');
    END IF;
    v_subject_type := 'esports_player';
  ELSE
    IF NOT (public.has_crm_permission('entry:checkin_visitor') OR public.has_crm_permission('participation:edit')) THEN
      RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Forbidden: participation check-in permission required.');
    END IF;
    v_subject_type := 'participation';
  END IF;

  IF p_qr_token IS NOT NULL AND trim(p_qr_token) <> '' AND v_tkt.qr_token <> trim(p_qr_token) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'QR token mismatch.');
  END IF;

  IF v_tkt.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Ticket is ' || v_tkt.status || '.');
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
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'error', 'Registration is not active or confirmed.');
  END IF;

  -- Strict single-use check-in enforcement
  IF v_tkt.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'verdict', 'ALREADY USED',
      'duplicate', true,
      'checked_in_at', v_tkt.checked_in_at,
      'checked_in_by', v_tkt.checked_in_by_email,
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

  -- Sync registration table check-in fields
  IF v_tkt.registration_category = 'visitor' THEN
    UPDATE public.visitor_registrations
    SET check_in_status = 'checked_in', checked_in_at = v_now, checked_in_by = v_actor_email
    WHERE id = v_tkt.registration_id;
  ELSIF v_tkt.registration_category = 'participation' THEN
    UPDATE public.participation_registrations
    SET check_in_status = 'checked_in', checked_in_at = v_now, checked_in_by = v_actor_email
    WHERE id = v_tkt.registration_id;
  ELSE
    UPDATE public.registrations
    SET check_in_status = 'checked_in', checked_in_at = v_now, checked_in_by = v_actor_email
    WHERE id = v_tkt.registration_id;
  END IF;

  INSERT INTO public.check_ins (
    registration_id, ticket_ref, subject_type, event_day, check_in_type,
    checked_in_by, checked_in_by_email, checked_in_at,
    wristband_category, wristband_id, is_override, notes
  )
  VALUES (
    v_tkt.registration_id, v_tkt.ticket_ref, v_subject_type, coalesce(p_event_day, '2026-11-20'), 'individual',
    coalesce(v_actor_email, v_uid::text), v_actor_email, v_now,
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
      'checked_in_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'verdict', 'VALID',
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
-- 9. Idempotent Backfill for Existing Confirmed Registrations
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.visitor_registrations
    WHERE status = 'confirmed' AND NOT public._is_registration_archived(archived_at, admin_notes)
  LOOP
    PERFORM public._issue_ticket_internal('visitor', r.id);
  END LOOP;

  FOR r IN
    SELECT id FROM public.participation_registrations
    WHERE status = 'confirmed' AND NOT public._is_registration_archived(archived_at, admin_notes)
  LOOP
    PERFORM public._issue_ticket_internal('participation', r.id);
  END LOOP;

  FOR r IN
    SELECT id FROM public.registrations
    WHERE status = 'confirmed' AND NOT public._is_registration_archived(archived_at, admin_notes)
  LOOP
    PERFORM public._issue_ticket_internal('esports', r.id);
  END LOOP;
END $$;
