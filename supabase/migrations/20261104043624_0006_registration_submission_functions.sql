CREATE OR REPLACE FUNCTION public.submit_esports_registration(
  p_team_name text,
  p_game_id uuid,
  p_institution text,
  p_captain_name text,
  p_email text,
  p_phone text,
  p_players jsonb,
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
  v_team text := trim(coalesce(p_team_name, ''));
  v_captain text := trim(coalesce(p_captain_name, ''));
  v_team_size integer;
  v_count integer;
  v_ref text;
  v_reg_id uuid;
  v_player jsonb;
BEGIN
  IF coalesce(p_website, '') <> '' THEN
    RAISE EXCEPTION 'Submission rejected';
  END IF;
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'Consent is required';
  END IF;
  IF length(v_team) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Invalid team name';
  END IF;
  IF length(v_captain) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Invalid representative name';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;
  IF v_phone !~ '^[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid mobile number';
  END IF;
  IF p_institution IS NOT NULL AND length(trim(p_institution)) > 120 THEN
    RAISE EXCEPTION 'Invalid institution';
  END IF;

  SELECT team_size INTO v_team_size
  FROM public.games
  WHERE id = p_game_id AND is_active AND is_published;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game is not open for registration';
  END IF;

  IF jsonb_typeof(p_players) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid player list';
  END IF;
  v_count := jsonb_array_length(p_players);
  IF v_count < 1 THEN
    RAISE EXCEPTION 'At least one player is required';
  END IF;
  IF v_team_size IS NOT NULL AND v_count <> v_team_size THEN
    RAISE EXCEPTION 'Player count does not match team size';
  END IF;
  FOR v_player IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    IF length(trim(coalesce(v_player->>'player_name', ''))) NOT BETWEEN 2 AND 80 THEN
      RAISE EXCEPTION 'Invalid player name';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (SELECT 1 FROM public.registrations
             WHERE game_id = p_game_id AND lower(email) = v_email
               AND lower(team_name) = lower(v_team)) THEN
    RAISE EXCEPTION 'Duplicate registration';
  END IF;

  INSERT INTO public.registrations (team_name, game_id, captain_name, email, phone, institution)
  VALUES (v_team, p_game_id, v_captain, v_email, v_phone, nullif(trim(coalesce(p_institution, '')), ''))
  RETURNING id, registration_ref INTO v_reg_id, v_ref;

  INSERT INTO public.players (registration_id, player_name)
  SELECT v_reg_id, trim(p.value->>'player_name')
  FROM jsonb_array_elements(p_players) AS p(value);

  RETURN v_ref;
END;
$$;

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
BEGIN
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
  IF p_institution IS NOT NULL AND length(trim(p_institution)) > 120 THEN
    RAISE EXCEPTION 'Invalid institution';
  END IF;
  IF p_visitor_category NOT IN ('School student', 'College student', 'Teacher or educator',
                                'Parent or guardian', 'Working professional', 'General visitor', 'Other') THEN
    RAISE EXCEPTION 'Invalid visitor category';
  END IF;

  IF (SELECT count(*) FROM public.visitor_registrations
      WHERE lower(email) = v_email AND submitted_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later';
  END IF;

  IF EXISTS (SELECT 1 FROM public.visitor_registrations WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Duplicate registration';
  END IF;

  INSERT INTO public.visitor_registrations (full_name, email, phone, institution, visitor_category, consent_given)
  VALUES (v_name, v_email, v_phone, nullif(trim(coalesce(p_institution, '')), ''), p_visitor_category, true)
  RETURNING registration_ref INTO v_ref;

  RETURN v_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_esports_registration(text, uuid, text, text, text, text, jsonb, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_visitor_registration(text, text, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_esports_registration(text, uuid, text, text, text, text, jsonb, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_visitor_registration(text, text, text, text, text, boolean, text) TO anon, authenticated;

CREATE POLICY "anon_read_open_games" ON public.games FOR SELECT TO anon, authenticated
  USING (is_active AND is_published);
