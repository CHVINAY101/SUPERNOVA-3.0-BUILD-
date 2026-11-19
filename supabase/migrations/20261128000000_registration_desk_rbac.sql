-- ==============================================================================
-- SUPERNOVA 3.0 — REGISTRATION DESK RBAC MIGRATION
-- Idempotent migration that repurposes `registration_staff` to the dedicated
-- Registration Desk Portal while keeping `checkin_staff` and `esports_entry_staff`
-- assigned to their appropriate Gate Operations.
-- Does NOT alter any live game or portal registration_open settings.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.normalize_crm_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'super_admin' THEN 'super_admin'
    WHEN 'crm_admin' THEN 'crm_admin'
    WHEN 'event_admin' THEN 'crm_admin'
    WHEN 'registration_staff' THEN 'registration_staff'
    WHEN 'checkin_staff' THEN 'checkin_staff'
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
SET search_path = public
AS $$
  SELECT CASE public.normalize_crm_role(p_role)
    WHEN 'super_admin' THEN ARRAY[
      'dashboard:view',
      'visitor:view','visitor:create','visitor:edit','visitor:delete','visitor:export',
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'entry:view','entry:scan_visitor','entry:checkin_visitor','entry:scan_esports','entry:checkin_esports','entry:issue_wristband','entry:override_checkin','entry:manage_wristbands',
      'tickets:view','tickets:manage',
      'tournament:manage_games','tournament:select_teams','tournament:build_bracket','tournament:assign_conductors','tournament:confirm_results','tournament:resolve_disputes',
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute',
      'announcements:view','announcements:create','announcements:edit','announcements:publish','announcements:delete',
      'gallery:view','gallery:upload','gallery:edit','gallery:delete',
      'event_info:view','event_info:create','event_info:edit','event_info:publish',
      'social_links:view','social_links:edit',
      'reports:view','reports:export',
      'user_management:view','user_management:invite','user_management:edit','user_management:deactivate','user_management:delete','user_management:assign_permissions',
      'system_settings:view','system_settings:manage'
    ]
    WHEN 'crm_admin' THEN ARRAY[
      'dashboard:view',
      'visitor:view','visitor:create','visitor:edit','visitor:delete','visitor:export',
      'entry:view','entry:scan_visitor','entry:checkin_visitor','entry:scan_esports','entry:checkin_esports','entry:issue_wristband','entry:override_checkin',
      'tickets:view','tickets:manage',
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'tournament:manage_games','tournament:select_teams','tournament:build_bracket','tournament:assign_conductors','tournament:confirm_results','tournament:resolve_disputes',
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute',
      'announcements:view','announcements:create','announcements:edit','announcements:publish','announcements:delete',
      'gallery:view','gallery:upload','gallery:edit','gallery:delete',
      'event_info:view','event_info:create','event_info:edit','event_info:publish',
      'social_links:view','social_links:edit',
      'reports:view','reports:export',
      'system_settings:view'
    ]
    WHEN 'registration_staff' THEN ARRAY[
      'visitor:view','visitor:create','visitor:edit',
      'esports:view','esports:create',
      'tickets:view','tickets:manage'
    ]
    WHEN 'checkin_staff' THEN ARRAY[
      'visitor:view',
      'entry:view','entry:scan_visitor','entry:checkin_visitor','entry:issue_wristband',
      'tickets:view','tickets:manage'
    ]
    WHEN 'esports_entry_staff' THEN ARRAY[
      'entry:view','entry:scan_esports','entry:checkin_esports','entry:issue_wristband',
      'tickets:view','tickets:manage'
    ]
    WHEN 'esports_manager' THEN ARRAY[
      'dashboard:view',
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'tournament:manage_games','tournament:select_teams','tournament:build_bracket','tournament:assign_conductors','tournament:confirm_results','tournament:resolve_disputes',
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute',
      'entry:scan_esports','tickets:view','tickets:manage','reports:view'
    ]
    WHEN 'match_conductor' THEN ARRAY[
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute'
    ]
    WHEN 'content_manager' THEN ARRAY[
      'dashboard:view',
      'announcements:view','announcements:create','announcements:edit','announcements:publish','announcements:delete',
      'gallery:view','gallery:upload','gallery:edit','gallery:delete',
      'event_info:view','event_info:create','event_info:edit','event_info:publish',
      'social_links:view','social_links:edit'
    ]
    WHEN 'viewer' THEN ARRAY[
      'dashboard:view',
      'visitor:view','esports:view','tickets:view',
      'announcements:view','gallery:view','event_info:view','social_links:view',
      'reports:view'
    ]
    ELSE ARRAY[]::text[]
  END;
$$;

-- Remove tickets:view / tickets:manage and visitor:edit / esports:edit leakage from gate entry helpers
CREATE OR REPLACE FUNCTION public.is_entry_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('entry:view')
    OR public.has_crm_permission('entry:scan_visitor')
    OR public.has_crm_permission('entry:scan_esports')
    OR public.has_crm_permission('entry:checkin_visitor')
    OR public.has_crm_permission('entry:checkin_esports');
$$;

CREATE OR REPLACE FUNCTION public.is_checkin_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('entry:checkin_visitor')
    OR public.has_crm_permission('entry:checkin_esports');
$$;

CREATE OR REPLACE FUNCTION public._gate_is_entry_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean := false;
  v_has_status boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'account_status'
  ) INTO v_has_status;

  IF v_has_status THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = v_uid
        AND p.account_status = 'active'
        AND (
          ur.role IN ('super_admin', 'crm_admin', 'event_admin', 'checkin_staff', 'esports_entry_staff')
          OR public.is_entry_staff()
        )
    ) INTO v_ok;
    RETURN coalesce(v_ok, false);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND (
        ur.role IN ('super_admin', 'crm_admin', 'event_admin', 'checkin_staff', 'esports_entry_staff')
        OR public.is_entry_staff()
      )
  ) INTO v_ok;
  RETURN coalesce(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public._gate_is_entry_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._gate_is_entry_staff() TO authenticated;

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
  v_uid uuid := auth.uid();
  v_has_perm_fn boolean := (to_regprocedure('public.has_crm_permission(text)') IS NOT NULL);
BEGIN
  IF v_uid IS NULL OR NOT public._gate_is_entry_staff() THEN
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
          OR public.is_admin();
    ELSIF p_subject_type = 'esports_player' THEN
      RETURN public._gate_has_perm('entry:checkin_esports')
          OR public.is_admin();
    ELSE
      RETURN public._gate_has_perm('entry:checkin_visitor')
          OR public._gate_has_perm('entry:checkin_esports')
          OR public.is_admin();
    END IF;
  END IF;

  RETURN public._gate_is_entry_staff();
END;
$$;

REVOKE ALL ON FUNCTION public._can_perform_checkin(text, boolean) FROM PUBLIC, anon, authenticated;

-- Upgrade verify_gate_ticket so visitor:view / esports:view alone do not authorize gate scanning
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

  IF NOT public._gate_is_entry_staff() THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: Authorized Gate Entry Staff or Admin access required.');
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
        IF public._is_registration_archived(v_fb_vis.archived_at, v_fb_vis.admin_notes) OR v_fb_vis.status IN ('declined', 'withdrawn') THEN
          RETURN jsonb_build_object('ok', true, 'verdict', 'CANCELLED / REVOKED', 'can_check_in', false, 'reason', 'Visitor pass ' || v_fb_vis.registration_ref || ' has been cancelled or revoked.');
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
          IF public._is_registration_archived(v_fb_esp.archived_at, v_fb_esp.admin_notes) OR v_fb_esp.status IN ('declined', 'withdrawn') THEN
            RETURN jsonb_build_object('ok', true, 'verdict', 'CANCELLED / REVOKED', 'can_check_in', false, 'reason', 'Esports pass ' || v_fb_esp.registration_ref || ' has been cancelled, declined, or revoked.');
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
      'verdict', 'CANCELLED / REVOKED',
      'can_check_in', false,
      'reason', 'Participation tickets have been discontinued.'
    );
  END IF;

  IF v_tkt.registration_category = 'visitor' AND NOT (
    public._gate_has_perm('entry:scan_visitor') OR public.is_admin()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: You do not have permission to verify visitor passes.');
  ELSIF v_tkt.registration_category = 'esports' AND NOT (
    public._gate_has_perm('entry:scan_esports') OR public.is_admin()
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

  IF v_tkt.status IN ('cancelled', 'revoked') THEN
    v_verdict := 'CANCELLED / REVOKED';
    v_reason := 'Ticket has been ' || v_tkt.status || ' and cannot be used for admission.';
  ELSIF v_tkt.status <> 'active' THEN
    v_verdict := 'INVALID';
    v_reason := 'Ticket status is "' || v_tkt.status || '".';
  ELSIF v_reg_status IS NULL THEN
    v_verdict := 'INVALID';
    v_reason := 'Associated registration record is missing.';
  ELSIF public._is_registration_archived(v_archived_at, v_admin_notes) OR v_reg_status IN ('declined', 'withdrawn') THEN
    v_verdict := 'CANCELLED / REVOKED';
    v_reason := 'Associated registration was archived, declined, or withdrawn.';
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

-- Upgrade checkin_gate_ticket so visitor:edit / esports:edit alone cannot perform gate check-in
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
    IF NOT (public.has_crm_permission('entry:checkin_visitor') OR public.is_admin()) THEN
      RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: visitor check-in permission required.');
    END IF;
    v_subject_type := 'visitor';
  ELSIF v_tkt.registration_category = 'esports' THEN
    IF NOT (public.has_crm_permission('entry:checkin_esports') OR public.is_admin()) THEN
      RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: esports check-in permission required.');
    END IF;
    v_subject_type := 'esports_player';
  ELSE
    RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Participation tickets have been discontinued.');
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

-- Tighten check_ins write policies so registration_staff (visitor:edit) cannot write gate check-ins directly
DO $$
BEGIN
  IF to_regclass('public.check_ins') IS NOT NULL THEN
    DROP POLICY IF EXISTS "checkin_staff_insert_check_ins" ON public.check_ins;
    DROP POLICY IF EXISTS "admin_insert_checkin" ON public.check_ins;
    CREATE POLICY "admin_insert_checkin"
    ON public.check_ins FOR INSERT
    TO authenticated
    WITH CHECK (
      public.has_crm_permission('entry:checkin_visitor')
      OR public.has_crm_permission('entry:checkin_esports')
      OR public.has_crm_permission('entry:override_checkin')
    );

    DROP POLICY IF EXISTS "admin_update_checkin" ON public.check_ins;
    CREATE POLICY "admin_update_checkin"
    ON public.check_ins FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('entry:override_checkin'))
    WITH CHECK (public.has_crm_permission('entry:override_checkin'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
