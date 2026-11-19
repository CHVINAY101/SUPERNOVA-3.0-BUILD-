-- ==============================================================================
-- SUPERNOVA 3.0 — EVENT-DAY AUDIT REPAIRS & PRODUCTION COMPATIBILITY MIGRATION
-- Target Project: cirreovughlncadrbvcn
-- Safe, Additive & Idempotent:
--   1. Repairs historical BYE matches stuck in result_status = 'pending'.
--   2. Adds promo_consent boolean DEFAULT false to visitor_registrations while
--      keeping phone nullable for existing historical visitor rows.
--   3. Replaces legacy 17/18-arg visitor submission overloads cleanly with the
--      canonical 19-arg submit_visitor_registration_v2 & submit_visitor_and_issue_ticket
--      requiring a valid 10-15 digit phone number on new registrations and
--      persisting p_promo_consent cleanly (zero PGRST203 ambiguity).
--   4. Unifies confirm_match_result_and_advance to one canonical 7-arg signature
--      supporting p_detailed_scores, p_br_results, and optional p_notes while
--      excluding BYE rows from BR tournament completion checks.
--   5. Repairs archive_registration(text, uuid) permission checks & audit_logs
--      insert columns cleanly.
--   6. Reloads PostgREST schema cache (NOTIFY pgrst, 'reload schema').
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Repair existing BYE matches in public.matches
-- ------------------------------------------------------------------------------
UPDATE public.matches
SET
  status = 'completed',
  result_status = 'confirmed'
WHERE match_format = 'BYE'
  AND (status <> 'completed' OR result_status IS DISTINCT FROM 'confirmed');

-- ------------------------------------------------------------------------------
-- 2. Visitor promo_consent column (preserve nullable phone for historical rows)
-- ------------------------------------------------------------------------------
ALTER TABLE public.visitor_registrations
  ADD COLUMN IF NOT EXISTS promo_consent boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------------------------
-- 3. Drop legacy overloads & recreate canonical 19-arg Visitor submission RPCs
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text);
DROP FUNCTION IF EXISTS public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text, boolean);

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
  p_registration_source text DEFAULT 'public',
  p_promo_consent boolean DEFAULT false
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
  v_promo_consent boolean := coalesce(p_promo_consent, false);
  v_ref text;
  v_existing_walkin_ref text;
  v_ctrl record;
  v_actor_email text;
  v_meta jsonb := '{}'::jsonb;
BEGIN
  IF v_source = 'walk_in' THEN
    IF v_uid IS NULL OR NOT (
      CASE
        WHEN to_regprocedure('public._gate_has_perm(text)') IS NOT NULL
          THEN public._gate_has_perm('visitor:create') OR public._gate_is_entry_staff() OR public.is_admin()
        WHEN to_regprocedure('public.has_crm_permission(text)') IS NOT NULL
          THEN public.has_crm_permission('visitor:create') OR public.is_entry_staff() OR public.is_admin()
        ELSE public.is_admin()
      END
    ) THEN
      RAISE EXCEPTION 'Forbidden: Authorized registration or gate staff permission required for walk-in registration.';
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
  IF v_raw_phone IS NULL OR v_raw_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'A valid 10 to 15 digit Contact Mobile Number is mandatory (parent or guardian number accepted for younger students).';
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
    v_student_class := NULL;
    v_designation := NULL;
    IF v_institution IS NOT NULL AND length(v_institution) NOT BETWEEN 2 AND 150 THEN
      RAISE EXCEPTION 'College / Institution Name must be between 2 and 150 characters when provided.';
    END IF;
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
      'desk-staff@supernova'
    ) INTO v_actor_email;
  END IF;

  v_meta := jsonb_build_object(
    'visitor_category', v_clean_cat,
    'student_class', v_student_class,
    'designation', v_designation,
    'institution', v_institution,
    'registration_source', v_source,
    'promo_consent', v_promo_consent,
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
    promo_consent,
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
    v_promo_consent,
    CASE WHEN v_source = 'walk_in' THEN '[WALK_IN] Registered by ' || coalesce(v_actor_email, 'staff') ELSE NULL END,
    v_meta,
    'confirmed',
    true
  )
  RETURNING registration_ref INTO v_ref;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text, boolean) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text);
DROP FUNCTION IF EXISTS public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text, boolean);

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
  p_registration_source text DEFAULT 'public',
  p_promo_consent boolean DEFAULT false
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
    p_registration_source, p_promo_consent
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

REVOKE ALL ON FUNCTION public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text, boolean) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. Unified canonical confirm_match_result_and_advance (7-arg w/ DEFAULTs)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb);
DROP FUNCTION IF EXISTS public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb, jsonb, text);

CREATE OR REPLACE FUNCTION public.confirm_match_result_and_advance(
  p_match_id uuid,
  p_winner_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_detailed_scores jsonb DEFAULT '{}'::jsonb,
  p_br_results jsonb DEFAULT NULL,
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
  v_match record;
  v_loser_id uuid;
  v_now timestamptz := now();
  v_is_br boolean := false;
  v_prev_snapshot jsonb;
  v_top_br_team_id uuid;
  v_clean_notes text := nullif(trim(coalesce(p_notes, '')), '');
BEGIN
  IF v_uid IS NULL OR NOT (
    public._esports_has_perm('tournament:confirm_results')
    OR public._esports_has_perm('esports:edit')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: tournament:confirm_results permission required');
  END IF;

  SELECT email INTO v_actor_email FROM public.profiles WHERE id = v_uid;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Match not found');
  END IF;

  IF v_match.status = 'disputed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Match is disputed and frozen. Resolve dispute first.');
  END IF;

  IF v_match.status = 'completed' AND v_match.bracket_advanced_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Double-advancement blocked: match result has already been confirmed.');
  END IF;

  v_is_br := (
    v_match.bracket_side = 'battle_royale'
    OR coalesce(v_match.match_format, '') ILIKE '%BR%'
    OR (p_br_results IS NOT NULL AND jsonb_typeof(p_br_results) = 'array' AND jsonb_array_length(p_br_results) > 0)
  );

  v_prev_snapshot := jsonb_build_object(
    'status', v_match.status,
    'result_status', v_match.result_status,
    'score_a', v_match.score_a,
    'score_b', v_match.score_b,
    'winner_id', v_match.winner_id,
    'br_results', v_match.br_results,
    'detailed_scores', v_match.detailed_scores,
    'confirmed_by', v_match.confirmed_by,
    'confirmed_at', v_match.confirmed_at,
    'bracket_advanced_at', v_match.bracket_advanced_at
  );

  IF v_is_br THEN
    IF p_br_results IS NULL OR jsonb_typeof(p_br_results) <> 'array' OR jsonb_array_length(p_br_results) = 0 THEN
      IF v_match.br_results IS NULL OR jsonb_typeof(v_match.br_results) <> 'array' OR jsonb_array_length(v_match.br_results) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Battle Royale match requires at least one team placement & kills entry.');
      END IF;
    END IF;

    SELECT NULLIF(elem->>'team_id', '')::uuid
    INTO v_top_br_team_id
    FROM jsonb_array_elements(coalesce(p_br_results, v_match.br_results)) AS elem
    ORDER BY coalesce((elem->>'total_points')::integer, 0) DESC, coalesce((elem->>'placement')::integer, 999) ASC
    LIMIT 1;

    UPDATE public.matches
    SET
      br_results = coalesce(p_br_results, br_results, '[]'::jsonb),
      detailed_scores = coalesce(p_detailed_scores, detailed_scores, '{}'::jsonb),
      notes = coalesce(v_clean_notes, notes),
      winner_id = coalesce(p_winner_id, v_top_br_team_id),
      status = 'completed',
      result_status = 'confirmed',
      confirmed_by = v_uid,
      confirmed_at = v_now,
      bracket_advanced_at = v_now
    WHERE id = p_match_id;

    IF v_match.tournament_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.matches m2
      WHERE m2.tournament_id = v_match.tournament_id
        AND coalesce(m2.match_format, '') <> 'BYE'
        AND m2.status <> 'completed'
        AND m2.status <> 'cancelled'
    ) THEN
      DECLARE
        v_cum_champ uuid;
      BEGIN
        SELECT NULLIF(elem->>'team_id', '')::uuid
        INTO v_cum_champ
        FROM public.matches m_all,
             jsonb_array_elements(coalesce(m_all.br_results, '[]'::jsonb)) AS elem
        WHERE m_all.tournament_id = v_match.tournament_id
          AND m_all.status = 'completed'
          AND NULLIF(elem->>'team_id', '') IS NOT NULL
        GROUP BY NULLIF(elem->>'team_id', '')::uuid
        ORDER BY
          sum(coalesce((elem->>'total_points')::integer, 0)) DESC,
          sum(CASE WHEN (elem->>'placement')::integer = 1 THEN 1 ELSE 0 END) DESC,
          sum(coalesce((elem->>'placement_points')::integer, 0)) DESC,
          sum(coalesce((elem->>'kills')::integer, 0)) DESC
        LIMIT 1;

        IF v_cum_champ IS NOT NULL THEN
          UPDATE public.tournaments
          SET
            champion_team_id = v_cum_champ,
            status = 'completed',
            updated_at = v_now
          WHERE id = v_match.tournament_id;
        END IF;
      END;
    END IF;
  ELSE
    IF p_winner_id IS NULL OR (p_winner_id <> v_match.team_a_id AND p_winner_id <> v_match.team_b_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Winner must be one of the match teams.');
    END IF;

    v_loser_id := CASE WHEN p_winner_id = v_match.team_a_id THEN v_match.team_b_id ELSE v_match.team_a_id END;

    UPDATE public.matches
    SET
      score_a = greatest(0, coalesce(p_score_a, 0)),
      score_b = greatest(0, coalesce(p_score_b, 0)),
      detailed_scores = coalesce(p_detailed_scores, detailed_scores, '{}'::jsonb),
      notes = coalesce(v_clean_notes, notes),
      winner_id = p_winner_id,
      status = 'completed',
      result_status = 'confirmed',
      confirmed_by = v_uid,
      confirmed_at = v_now,
      bracket_advanced_at = v_now
    WHERE id = p_match_id;

    IF v_match.next_match_id IS NOT NULL THEN
      IF upper(coalesce(v_match.next_match_slot, 'A')) = 'B' THEN
        UPDATE public.matches SET team_b_id = p_winner_id WHERE id = v_match.next_match_id;
      ELSE
        UPDATE public.matches SET team_a_id = p_winner_id WHERE id = v_match.next_match_id;
      END IF;
    END IF;

    IF v_match.loser_next_match_id IS NOT NULL AND v_loser_id IS NOT NULL THEN
      IF upper(coalesce(v_match.loser_next_match_slot, 'A')) = 'B' THEN
        UPDATE public.matches SET team_b_id = v_loser_id WHERE id = v_match.loser_next_match_id;
      ELSE
        UPDATE public.matches SET team_a_id = v_loser_id WHERE id = v_match.loser_next_match_id;
      END IF;
    END IF;

    IF v_match.tournament_id IS NOT NULL
       AND v_match.next_match_id IS NULL
       AND (v_match.bracket_side = 'grand_final' OR lower(coalesce(v_match.round, '')) LIKE '%final%')
    THEN
      UPDATE public.tournaments
      SET
        champion_team_id = p_winner_id,
        status = 'completed',
        updated_at = v_now
      WHERE id = v_match.tournament_id;
    END IF;
  END IF;

  INSERT INTO public.match_result_history (
    match_id, tournament_id, game_id, action_type, previous_state, next_state, actor_id, actor_email, reason
  )
  VALUES (
    p_match_id,
    v_match.tournament_id,
    v_match.game_id,
    'result_confirmed',
    v_prev_snapshot,
    jsonb_build_object(
      'status', 'completed',
      'winner_id', coalesce(p_winner_id, v_top_br_team_id),
      'score_a', greatest(0, coalesce(p_score_a, 0)),
      'score_b', greatest(0, coalesce(p_score_b, 0)),
      'is_br', v_is_br
    ),
    v_uid,
    v_actor_email,
    coalesce(v_clean_notes, 'Official match result confirmed')
  );

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid,
    'match_result_confirmed_and_advanced',
    'matches',
    p_match_id,
    jsonb_build_object(
      'winner_id', coalesce(p_winner_id, v_top_br_team_id),
      'loser_id', v_loser_id,
      'score_a', p_score_a,
      'score_b', p_score_b,
      'next_match_id', v_match.next_match_id,
      'is_br', v_is_br
    )
  );

  RETURN jsonb_build_object('ok', true, 'confirmed_at', v_now, 'is_br', v_is_br);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb, jsonb, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. Safe Archive Registration RPC
-- ------------------------------------------------------------------------------
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
    IF NOT (public.has_crm_permission('visitor:delete') OR public.is_admin()) THEN
      RAISE EXCEPTION 'Forbidden: visitor:delete permission required' USING ERRCODE = '42501';
    END IF;
    v_table := 'visitor_registrations';
    UPDATE public.visitor_registrations
    SET archived_at = pg_catalog.now(), archived_by = v_uid
    WHERE id = p_id AND archived_at IS NULL;
  ELSIF p_type = 'esports' THEN
    IF NOT (
      public.has_crm_permission('esports:delete')
      OR public.has_crm_permission('esports:edit')
      OR public.is_admin()
    ) THEN
      RAISE EXCEPTION 'Forbidden: esports:delete or esports:edit permission required' USING ERRCODE = '42501';
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
