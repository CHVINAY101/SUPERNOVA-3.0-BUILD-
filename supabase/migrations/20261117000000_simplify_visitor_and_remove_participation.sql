-- ==============================================================================
-- SUPERNOVA 3.0 — VISITOR REGISTRATION SIMPLIFICATION & PARTICIPATION REMOVAL
-- Migration: 20261117000000_simplify_visitor_and_remove_participation.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Safe & Idempotent:
--   - PRESERVES all historical records, tables, columns, FKs, and RLS policies.
--   - Does NOT drop public.participation_registrations or delete existing rows.
--   - Makes visitor_registrations.phone nullable so new visitors store NULL.
--   - Enforces Full Name, Email, Class/Course, and College/Institution on visitor
--     submissions (no phone or registration number required; no dummy values).
--   - Updates lookup_public_ticket so Visitor passes retrieve via Reference + Email
--     (Esports passes continue verifying Reference + Email + Phone).
--   - Discontinues active Participation issuance, check-in, archival, and triggers.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Relax visitor_registrations.phone NOT NULL & ensure required columns exist
-- ------------------------------------------------------------------------------
ALTER TABLE public.visitor_registrations
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.visitor_registrations
  ADD COLUMN IF NOT EXISTS student_class text,
  ADD COLUMN IF NOT EXISTS student_id text,
  ADD COLUMN IF NOT EXISTS ticket_ref text,
  ADD COLUMN IF NOT EXISTS check_in_status text NOT NULL DEFAULT 'not_checked_in',
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Disable public participation form switch cleanly (without dropping table/rows)
UPDATE public.registration_controls
SET
  is_open = false,
  closed_message = 'Participation applications have been discontinued for Supernova 3.0. Please register as a Visitor or Esports Team.',
  updated_at = now()
WHERE form_type = 'participation';

-- Stop automatic ticket generation trigger on historical participation table
DROP TRIGGER IF EXISTS trg_participation_sync_ticket ON public.participation_registrations;

-- ------------------------------------------------------------------------------
-- 2. Remove Participation Module from Active RBAC Role Defaults
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_crm_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'super_admin' THEN 'super_admin'
    WHEN 'crm_admin' THEN 'crm_admin'
    WHEN 'event_admin' THEN 'crm_admin'
    WHEN 'registration_staff' THEN 'registration_staff'
    WHEN 'checkin_staff' THEN 'registration_staff'
    WHEN 'esports_entry_staff' THEN 'esports_entry_staff'
    WHEN 'participation_manager' THEN 'viewer'
    WHEN 'esports_manager' THEN 'esports_manager'
    WHEN 'score_operator' THEN 'esports_manager'
    WHEN 'match_conductor' THEN 'match_conductor'
    WHEN 'content_manager' THEN 'content_manager'
    WHEN 'viewer' THEN 'viewer'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.role_default_permissions(p_role text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE public.normalize_crm_role(p_role)
    WHEN 'super_admin' THEN ARRAY[
      'visitor:view','visitor:create','visitor:edit','visitor:delete','visitor:export',
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'entry:view','entry:scan_visitor','entry:checkin_visitor','entry:scan_esports','entry:checkin_esports','entry:issue_wristband','entry:override_checkin','entry:manage_wristbands',
      'tournament:manage_games','tournament:select_teams','tournament:build_bracket','tournament:assign_conductors','tournament:confirm_results','tournament:resolve_disputes',
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute',
      'announcements:view','announcements:create','announcements:edit','announcements:publish','announcements:delete',
      'gallery:view','gallery:upload','gallery:edit','gallery:delete',
      'event_info:view','event_info:create','event_info:edit','event_info:publish',
      'social_links:view','social_links:edit',
      'email_centre:view','email_centre:compose','email_centre:send','email_centre:resend',
      'reports:view','reports:export',
      'user_management:invite','user_management:edit','user_management:deactivate','user_management:assign_permissions',
      'system_settings:view','system_settings:manage'
    ]
    WHEN 'crm_admin' THEN ARRAY[
      'visitor:view','visitor:create','visitor:edit','visitor:delete','visitor:export',
      'entry:view','entry:scan_visitor','entry:checkin_visitor','entry:scan_esports','entry:checkin_esports','entry:issue_wristband','entry:override_checkin',
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'tournament:manage_games','tournament:select_teams','tournament:build_bracket','tournament:assign_conductors','tournament:confirm_results','tournament:resolve_disputes',
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute',
      'announcements:view','announcements:create','announcements:edit','announcements:publish','announcements:delete',
      'gallery:view','gallery:upload','gallery:edit','gallery:delete',
      'event_info:view','event_info:create','event_info:edit','event_info:publish',
      'social_links:view','social_links:edit',
      'email_centre:view','email_centre:compose','email_centre:send','email_centre:resend',
      'reports:view','reports:export',
      'system_settings:view'
    ]
    WHEN 'registration_staff' THEN ARRAY[
      'visitor:view','visitor:create','visitor:edit',
      'entry:view','entry:scan_visitor','entry:checkin_visitor','entry:issue_wristband'
    ]
    WHEN 'esports_entry_staff' THEN ARRAY[
      'entry:view','entry:scan_esports','entry:checkin_esports','entry:issue_wristband'
    ]
    WHEN 'esports_manager' THEN ARRAY[
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'tournament:manage_games','tournament:select_teams','tournament:build_bracket','tournament:assign_conductors','tournament:confirm_results','tournament:resolve_disputes',
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute',
      'entry:scan_esports','reports:view'
    ]
    WHEN 'match_conductor' THEN ARRAY[
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute'
    ]
    WHEN 'content_manager' THEN ARRAY[
      'announcements:view','announcements:create','announcements:edit','announcements:publish','announcements:delete',
      'gallery:view','gallery:upload','gallery:edit','gallery:delete',
      'event_info:view','event_info:create','event_info:edit','event_info:publish',
      'social_links:view','social_links:edit'
    ]
    WHEN 'viewer' THEN ARRAY[
      'visitor:view','esports:view',
      'announcements:view','gallery:view','event_info:view','social_links:view',
      'reports:view'
    ]
    ELSE ARRAY[]::text[]
  END;
$$;

DELETE FROM public.crm_user_permissions WHERE permission_key LIKE 'participation:%';

-- ------------------------------------------------------------------------------
-- 3. Simplified Visitor Registration RPCs (No Phone / No Registration Number)
--    Mandatory: Full Name, Email Address, Class / Course, College / Institution
-- ------------------------------------------------------------------------------
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
  p_website text DEFAULT ''
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_raw_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s\-+()]', '', 'g'), '');
  v_name text := trim(coalesce(p_full_name, ''));
  v_student_class text := trim(coalesce(p_student_class, ''));
  v_institution text := trim(coalesce(p_institution, ''));
  v_ref text;
  v_ctrl record;
  v_clean_cat text := coalesce(nullif(trim(coalesce(p_visitor_category, '')), ''), 'Student');
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

  -- If an explicit non-empty phone is ever passed by legacy callers, validate it; otherwise keep NULL (no dummy fallback).
  IF v_raw_phone IS NOT NULL AND v_raw_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid phone number format.';
  END IF;

  IF (SELECT count(*) FROM public.visitor_registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (SELECT 1 FROM public.visitor_registrations WHERE lower(email) = v_email AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'A visitor registration already exists for this email address.';
  END IF;

  v_meta := jsonb_build_object(
    'student_class', v_student_class,
    'institution', v_institution,
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
  p_phone text DEFAULT NULL,
  p_institution text DEFAULT NULL,
  p_visitor_category text DEFAULT 'Student',
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
  v_raw_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s\-+()]', '', 'g'), '');
  v_name text := trim(coalesce(p_full_name, ''));
  v_institution text := trim(coalesce(p_institution, ''));
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
    RAISE EXCEPTION 'Full Name is mandatory (2 to 120 characters).';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'A valid Email Address is mandatory.';
  END IF;
  IF length(v_institution) NOT BETWEEN 2 AND 150 THEN
    RAISE EXCEPTION 'College / Institution Name is mandatory.';
  END IF;
  IF v_raw_phone IS NOT NULL AND v_raw_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid phone number format.';
  END IF;

  IF (SELECT count(*) FROM public.visitor_registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (SELECT 1 FROM public.visitor_registrations WHERE lower(email) = v_email AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Duplicate registration';
  END IF;

  INSERT INTO public.visitor_registrations (
    full_name,
    email,
    phone,
    institution,
    visitor_category,
    student_id,
    status,
    consent_given
  )
  VALUES (
    v_name,
    v_email,
    v_raw_phone,
    v_institution,
    coalesce(nullif(trim(coalesce(p_visitor_category, '')), ''), 'Student'),
    NULL,
    'confirmed',
    true
  )
  RETURNING registration_ref INTO v_ref;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_visitor_registration(text, text, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_registration(text, text, text, text, text, boolean, text) TO anon, authenticated;

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
    p_student_class, NULL, p_designation, p_esports_interest,
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
-- 4. Update Ticketing, Gate Verification, Check-In & Archival (Visitor & Esports Only)
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
      'student_class', v_vis.student_class
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
  ELSIF p_category = 'esports' THEN
    IF NOT (
      public.has_crm_permission('esports:approve')
      OR public.has_crm_permission('esports:edit')
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

-- ------------------------------------------------------------------------------
-- 5. Anti-IDOR Public Ticket Retrieval RPC
--    - Visitor passes: Reference + Email (no phone required)
--    - Esports passes: Reference + Email + Phone
-- ------------------------------------------------------------------------------
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

  -- 1. Check direct ticket match first
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

  -- 2. Fallback check against Esports team registrations (Reference + Email + Phone)
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

  -- 3. Fallback check against Visitor registrations (Reference + Email only)
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
-- 6. Remove Participation from Gate Verification, Check-In & Archival
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
  v_event_day text := coalesce(nullif(trim(coalesce(p_event_day, '')), ''), '2026-11-20');
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
    AND is_override = false
    AND (
      upper(coalesce(ticket_ref, '')) = upper(v_canonical_ref)
      OR (v_clean_ref <> '' AND upper(coalesce(ticket_ref, '')) = v_clean_ref)
      OR (v_norm_subject = 'visitor' AND v_visitor_reg_id IS NOT NULL AND visitor_registration_id = v_visitor_reg_id)
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

CREATE OR REPLACE FUNCTION public.archive_registration(
  p_type text,
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_table text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_type = 'visitor' THEN
    IF NOT public.has_crm_permission('visitor:delete') THEN
      RAISE EXCEPTION 'Forbidden: visitor:delete permission required' USING ERRCODE = '42501';
    END IF;
    v_table := 'visitor_registrations';
    UPDATE public.visitor_registrations
    SET archived_at = pg_catalog.now(), archived_by = v_uid
    WHERE id = p_id AND archived_at IS NULL;
  ELSIF p_type = 'esports' THEN
    IF NOT public.has_crm_permission('esports:edit') THEN
      RAISE EXCEPTION 'Forbidden: esports:edit permission required' USING ERRCODE = '42501';
    END IF;
    v_table := 'registrations';
    UPDATE public.registrations
    SET archived_at = pg_catalog.now(), archived_by = v_uid
    WHERE id = p_id AND archived_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Invalid or discontinued registration type: %', p_type;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Record not found or already archived');
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid,
    'archive_registration',
    v_table,
    p_id,
    pg_catalog.jsonb_build_object('registration_type', p_type, 'archived_at', pg_catalog.now())
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_registration(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_registration(text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
