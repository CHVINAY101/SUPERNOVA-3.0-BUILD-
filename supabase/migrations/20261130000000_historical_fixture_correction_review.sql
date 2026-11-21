-- =============================================================================
-- SUPERNOVA 3.0 — SUPERVISED HISTORICAL FIXTURE CORRECTION REVIEW SQL
-- =============================================================================
-- PURPOSE:
--   Review-only reference migration for supervised event-day recovery if a
--   live production RPC (`replace_esports_fixture_team` / `swap_esports_fixture_slots`)
--   rejects an edge-case historical edit after results/progression have landed,
--   and to sync `tournaments.has_started` where live/confirmed matches already exist.
--
-- IMPORTANT CONSTRAINTS:
--   1. Does NOT drop, overwrite, or duplicate the 5 live production RPCs:
--      - rename_esports_team
--      - replace_esports_fixture_team
--      - swap_esports_fixture_slots
--      - preview_esports_fixture_correction
--      - set_esports_team_disqualification
--   2. Wrapped inside explicit BEGIN / COMMIT transactions.
--   3. Preserves strict RLS and RBAC checks (never grants access to match_conductor).
-- =============================================================================

BEGIN;

-- 1. Safe synchronization check: ensure tournaments.has_started reflects reality
--    when confirmed, live, result_submitted, or disputed non-BYE matches exist.
UPDATE public.tournaments t
SET
  has_started = TRUE,
  status = CASE
    WHEN t.champion_team_id IS NOT NULL THEN 'completed'
    WHEN t.status IN ('draft', 'open', 'published') THEN 'in_progress'
    ELSE t.status
  END,
  updated_at = NOW()
WHERE t.has_started = FALSE
  AND EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE (m.tournament_id = t.id OR m.game_id = t.game_id)
      AND COALESCE(m.match_format, '') <> 'BYE'
      AND (
        m.status IN ('live', 'result_submitted', 'completed', 'disputed')
        OR m.winner_id IS NOT NULL
      )
  );

-- 2. Supervised Historical Match Reconfirmation Helper (Review before running)
--    Re-records actual teams & scores on a specific completed fixture while
--    clearing stale downstream winners so operators explicitly reconfirm
--    downstream matches without silently transferring old scores/winners.
CREATE OR REPLACE FUNCTION public.supervised_reconfirm_historical_fixture(
  p_match_id UUID,
  p_actual_team_a_id UUID,
  p_actual_team_b_id UUID,
  p_actual_score_a INTEGER,
  p_actual_score_b INTEGER,
  p_actual_winner_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_role TEXT;
  v_is_active BOOLEAN;
  v_match RECORD;
  v_cleared_downstream UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required.');
  END IF;

  SELECT role, is_active
  INTO v_role, v_is_active
  FROM public.crm_users
  WHERE user_id = v_caller_id;

  IF NOT COALESCE(v_is_active, FALSE)
     OR v_role NOT IN ('super_admin', 'crm_admin', 'event_admin', 'esports_manager', 'score_operator') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Forbidden: only active Admin or Esports Manager roles may execute historical fixture reconfirmation.'
    );
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL OR LENGTH(BTRIM(p_reason)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Audit reason (min 3 characters) is required.');
  END IF;

  IF p_actual_team_a_id IS NOT NULL AND p_actual_team_a_id = p_actual_team_b_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Team A and Team B cannot be the same squad.');
  END IF;

  IF p_actual_winner_id IS NOT NULL
     AND p_actual_winner_id IS DISTINCT FROM p_actual_team_a_id
     AND p_actual_winner_id IS DISTINCT FROM p_actual_team_b_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Winner must be one of the participating teams.');
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Target match not found.');
  END IF;

  -- Update target match with verified actual teams and actual scores
  UPDATE public.matches
  SET
    team_a_id = p_actual_team_a_id,
    team_b_id = p_actual_team_b_id,
    score_a = GREATEST(0, COALESCE(p_actual_score_a, 0)),
    score_b = GREATEST(0, COALESCE(p_actual_score_b, 0)),
    winner_id = p_actual_winner_id,
    status = CASE WHEN p_actual_winner_id IS NOT NULL THEN 'completed' ELSE 'scheduled' END,
    result_status = CASE WHEN p_actual_winner_id IS NOT NULL THEN 'confirmed' ELSE 'pending' END,
    confirmed_by = CASE WHEN p_actual_winner_id IS NOT NULL THEN v_caller_id ELSE NULL END,
    confirmed_at = CASE WHEN p_actual_winner_id IS NOT NULL THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE id = p_match_id;

  -- Sync immediate next match slot with actual winner, clearing stale confirmed outcome if teams changed
  IF v_match.next_match_id IS NOT NULL THEN
    UPDATE public.matches
    SET
      team_a_id = CASE WHEN COALESCE(v_match.next_match_slot, 'a') <> 'b' THEN p_actual_winner_id ELSE team_a_id END,
      team_b_id = CASE WHEN v_match.next_match_slot = 'b' THEN p_actual_winner_id ELSE team_b_id END,
      winner_id = NULL,
      status = CASE WHEN status IN ('completed', 'result_submitted') THEN 'scheduled' ELSE status END,
      result_status = CASE WHEN result_status IN ('confirmed', 'submitted') THEN 'pending' ELSE result_status END,
      updated_at = NOW()
    WHERE id = v_match.next_match_id;

    v_cleared_downstream := array_append(v_cleared_downstream, v_match.next_match_id);
  END IF;

  INSERT INTO public.match_result_history (
    match_id,
    game_id,
    action_type,
    actor_id,
    reason,
    previous_snapshot,
    new_snapshot
  ) VALUES (
    p_match_id,
    v_match.game_id,
    'supervised_historical_correction',
    v_caller_id,
    BTRIM(p_reason),
    jsonb_build_object(
      'team_a_id', v_match.team_a_id,
      'team_b_id', v_match.team_b_id,
      'score_a', v_match.score_a,
      'score_b', v_match.score_b,
      'winner_id', v_match.winner_id,
      'status', v_match.status
    ),
    jsonb_build_object(
      'team_a_id', p_actual_team_a_id,
      'team_b_id', p_actual_team_b_id,
      'score_a', GREATEST(0, COALESCE(p_actual_score_a, 0)),
      'score_b', GREATEST(0, COALESCE(p_actual_score_b, 0)),
      'winner_id', p_actual_winner_id,
      'cleared_downstream_match_ids', v_cleared_downstream
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'match_id', p_match_id,
    'reconfirmation_required_match_ids', v_cleared_downstream
  );
END;
$$;

REVOKE ALL ON FUNCTION public.supervised_reconfirm_historical_fixture(UUID, UUID, UUID, INTEGER, INTEGER, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervised_reconfirm_historical_fixture(UUID, UUID, UUID, INTEGER, INTEGER, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.supervised_reconfirm_historical_fixture(UUID, UUID, UUID, INTEGER, INTEGER, UUID, TEXT) TO authenticated;

COMMIT;
