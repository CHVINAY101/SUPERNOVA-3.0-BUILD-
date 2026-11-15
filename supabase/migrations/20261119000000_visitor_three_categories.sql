-- ==============================================================================
-- SUPERNOVA 3.0 — THREE VISITOR CATEGORIES UPGRADE
-- (1. Student Visitor · 2. Faculty & Institutional Delegates · 3. General Visitor)
-- ==============================================================================
-- Target project: cirreovughlncadrbvcn
-- Safe & Additive:
--   - Preserves all existing historical visitor_registrations, tickets, check_ins,
--     and esports records without deleting or mutating past rows.
--   - Relaxes institution / student_class / phone NOT NULL constraints so
--     Faculty & General Visitors store clean NULLs instead of placeholders.
--   - Upgrades _issue_ticket_internal and submit_visitor_registration_v2 to support
--     canonical category validation + optional institution for General Visitors +
--     mandatory Designation/Role & Institution for Faculty & Institutional Delegates +
--     preserving canonical visitor_category for Walk-In gate registrations.
-- ==============================================================================

-- 1. Schema Safety on public.visitor_registrations
ALTER TABLE public.visitor_registrations
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS student_class text,
  ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'public';

ALTER TABLE public.visitor_registrations
  ALTER COLUMN institution DROP NOT NULL,
  ALTER COLUMN student_class DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_visitor_registrations_category
  ON public.visitor_registrations(visitor_category);

-- 2. Update internal ticket issuer so Visitor pass subtitle supports student_class -> designation -> visitor_category
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

-- 3. Upgrade submit_visitor_registration_v2 for 3 Categories & Conditional Validation
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

  -- Map incoming category to canonical 3 visitor categories
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
     OR v_raw_cat LIKE '%general%' THEN
    v_clean_cat := 'General Visitor';
  ELSE
    RAISE EXCEPTION 'Please select a valid visitor category (Student Visitor, Faculty & Institutional Delegates, or General Visitor).';
  END IF;

  -- Common mandatory fields for ALL categories
  IF length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Full Name is mandatory (2 to 120 characters).';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'A valid Email Address is mandatory.';
  END IF;

  -- Conditional category validation
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
    -- General Visitor: Class / Course not collected; College / Institution optional
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

-- Re-assert submit_visitor_and_issue_ticket permissions
REVOKE ALL ON FUNCTION public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
