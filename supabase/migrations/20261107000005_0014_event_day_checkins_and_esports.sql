-- Migration 0014: Event Day Entrance Check-ins and Esports Match Operations
-- Safe to run multiple times (idempotent)

-- 1. Ensure check_ins table exists with proper columns
CREATE TABLE IF NOT EXISTS public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL,
  player_id uuid,
  check_in_type text NOT NULL DEFAULT 'team' CHECK (check_in_type IN ('team', 'individual', 'visitor', 'participant')),
  checked_in_by uuid REFERENCES auth.users(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Ensure matches table exists with proper columns
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  round text,
  team_a_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  team_b_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  scheduled_start timestamptz,
  score_a integer NOT NULL DEFAULT 0,
  score_b integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed', 'postponed', 'cancelled')),
  winner_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Helpful indexes for event-day high-throughput lookups
CREATE INDEX IF NOT EXISTS idx_check_ins_registration ON public.check_ins(registration_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_checked_at ON public.check_ins(checked_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_game_id ON public.matches(game_id);
CREATE INDEX IF NOT EXISTS idx_registrations_ref_lower ON public.registrations(lower(registration_ref));
CREATE INDEX IF NOT EXISTS idx_registrations_phone ON public.registrations(phone);
CREATE INDEX IF NOT EXISTS idx_visitor_ref_lower ON public.visitor_registrations(lower(registration_ref));
CREATE INDEX IF NOT EXISTS idx_visitor_phone ON public.visitor_registrations(phone);
CREATE INDEX IF NOT EXISTS idx_participation_ref_lower ON public.participation_registrations(lower(registration_ref));
CREATE INDEX IF NOT EXISTS idx_participation_phone ON public.participation_registrations(phone);

-- 4. Enable Row Level Security
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- 5. Helper function for score operator role
CREATE OR REPLACE FUNCTION public.is_score_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'event_admin', 'score_operator')
  );
$$;

-- 6. Permissions for check_ins
GRANT SELECT, INSERT, DELETE ON public.check_ins TO authenticated;

DROP POLICY IF EXISTS "admins_all_check_ins" ON public.check_ins;
CREATE POLICY "admins_all_check_ins"
ON public.check_ins FOR ALL
TO authenticated
USING (public.is_content_admin());

DROP POLICY IF EXISTS "checkin_staff_read_check_ins" ON public.check_ins;
CREATE POLICY "checkin_staff_read_check_ins"
ON public.check_ins FOR SELECT
TO authenticated
USING (public.is_checkin_staff());

DROP POLICY IF EXISTS "checkin_staff_insert_check_ins" ON public.check_ins;
CREATE POLICY "checkin_staff_insert_check_ins"
ON public.check_ins FOR INSERT
TO authenticated
WITH CHECK (public.is_checkin_staff());

DROP POLICY IF EXISTS "checkin_staff_delete_check_ins" ON public.check_ins;
CREATE POLICY "checkin_staff_delete_check_ins"
ON public.check_ins FOR DELETE
TO authenticated
USING (public.is_checkin_staff());

-- 7. Permissions for matches (including public live board)
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.matches TO authenticated;

DROP POLICY IF EXISTS "public_read_published_matches" ON public.matches;
CREATE POLICY "public_read_published_matches"
ON public.matches FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "score_operator_read_all_matches" ON public.matches;
CREATE POLICY "score_operator_read_all_matches"
ON public.matches FOR SELECT
TO authenticated
USING (public.is_score_operator());

DROP POLICY IF EXISTS "score_operator_insert_matches" ON public.matches;
CREATE POLICY "score_operator_insert_matches"
ON public.matches FOR INSERT
TO authenticated
WITH CHECK (public.is_score_operator());

DROP POLICY IF EXISTS "score_operator_update_matches" ON public.matches;
CREATE POLICY "score_operator_update_matches"
ON public.matches FOR UPDATE
TO authenticated
USING (public.is_score_operator())
WITH CHECK (public.is_score_operator());

DROP POLICY IF EXISTS "score_operator_delete_matches" ON public.matches;
CREATE POLICY "score_operator_delete_matches"
ON public.matches FOR DELETE
TO authenticated
USING (public.is_content_admin());
