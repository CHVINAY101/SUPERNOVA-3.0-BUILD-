-- Migration 0013: Registration Workflow Enhancements & Check-In Permissions
-- Safe to run multiple times (idempotent)

-- 1. Ensure admin_notes exists on all registration tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'registrations' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE public.registrations ADD COLUMN admin_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visitor_registrations' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE public.visitor_registrations ADD COLUMN admin_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'participation_registrations' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE public.participation_registrations ADD COLUMN admin_notes text;
  END IF;
END $$;

-- 2. Allow checkin_staff to update player check-in status and insert into check_ins
GRANT SELECT, UPDATE ON public.players TO authenticated;
GRANT SELECT, INSERT ON public.check_ins TO authenticated;

DROP POLICY IF EXISTS "checkin_staff_update_players" ON public.players;
CREATE POLICY "checkin_staff_update_players"
ON public.players FOR UPDATE
TO authenticated
USING (public.is_checkin_staff())
WITH CHECK (public.is_checkin_staff());

DROP POLICY IF EXISTS "checkin_staff_insert_check_ins" ON public.check_ins;
CREATE POLICY "checkin_staff_insert_check_ins"
ON public.check_ins FOR INSERT
TO authenticated
WITH CHECK (public.is_checkin_staff());

-- 3. Dedicated RPC for checkin_staff to record player check-ins safely
CREATE OR REPLACE FUNCTION public.check_in_player(
  p_player_id uuid,
  p_status text DEFAULT 'checked_in',
  p_notes text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_id uuid;
BEGIN
  IF NOT public.is_checkin_staff() THEN
    RAISE EXCEPTION 'Unauthorized: check-in staff role required.';
  END IF;

  SELECT registration_id INTO v_reg_id
  FROM public.players
  WHERE id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player not found.';
  END IF;

  UPDATE public.players
  SET
    check_in_status = p_status,
    check_in_at = CASE WHEN p_status = 'checked_in' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_player_id;

  INSERT INTO public.check_ins (registration_id, player_id, check_in_type, checked_in_by, notes)
  VALUES (v_reg_id, p_player_id, 'individual', auth.uid(), nullif(trim(p_notes), ''));

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_in_player(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_player(uuid, text, text) TO authenticated;
