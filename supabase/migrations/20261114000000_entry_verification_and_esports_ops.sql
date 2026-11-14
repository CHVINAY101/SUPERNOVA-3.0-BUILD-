-- ==============================================================================
-- SUPERNOVA 3.0 — EVENT ENTRY VERIFICATION & ESPORTS TOURNAMENT OPERATIONS
-- Migration: 20261114000000_entry_verification_and_esports_ops.sql
-- Idempotent & backward-compatible upgrade preserving all existing records.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Expand Roles (9 Canonical Roles + Legacy Aliases) & Permissions
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN (
    'super_admin',
    'crm_admin',
    'event_admin',
    'registration_staff',
    'esports_entry_staff',
    'checkin_staff',
    'participation_manager',
    'esports_manager',
    'match_conductor',
    'score_operator',
    'content_manager',
    'viewer'
  ));

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.crm_invitations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.crm_invitations DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.crm_invitations
  ADD CONSTRAINT crm_invitations_role_check
  CHECK (role IN (
    'super_admin',
    'crm_admin',
    'event_admin',
    'registration_staff',
    'esports_entry_staff',
    'checkin_staff',
    'participation_manager',
    'esports_manager',
    'match_conductor',
    'score_operator',
    'content_manager',
    'viewer'
  ));

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
    WHEN 'participation_manager' THEN 'participation_manager'
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
      'participation:view','participation:create','participation:edit','participation:approve','participation:reject','participation:export',
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
      'participation:view','participation:create','participation:edit','participation:approve','participation:reject','participation:export',
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
    WHEN 'participation_manager' THEN ARRAY[
      'participation:view','participation:create','participation:edit','participation:approve','participation:reject','participation:export',
      'reports:view'
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
      'visitor:view','participation:view','esports:view',
      'announcements:view','gallery:view','event_info:view','social_links:view',
      'reports:view'
    ]
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_entry_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('entry:view')
    OR public.has_crm_permission('entry:scan_visitor')
    OR public.has_crm_permission('entry:scan_esports');
$$;

CREATE OR REPLACE FUNCTION public.is_checkin_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_entry_staff()
    OR public.has_crm_permission('visitor:edit')
    OR public.has_crm_permission('esports:edit');
$$;

CREATE OR REPLACE FUNCTION public.is_match_conductor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('conductor:view_assigned');
$$;

CREATE OR REPLACE FUNCTION public.is_score_operator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('esports:edit')
    OR public.has_crm_permission('tournament:confirm_results')
    OR public.has_crm_permission('conductor:submit_result');
$$;

REVOKE EXECUTE ON FUNCTION public.is_entry_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_match_conductor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_entry_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_match_conductor() TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. Wristband Categories & Issuance History
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wristband_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  color_hex text NOT NULL DEFAULT '#2563EB',
  badge_label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.wristband_categories (name, slug, color_hex, badge_label, description, is_active, sort_order)
VALUES
  ('General Visitor', 'general-visitor', '#2563EB', 'VISITOR', 'Standard general campus access wristband for confirmed visitors and parents.', true, 1),
  ('Esports Participant', 'esports-participant', '#7C3AED', 'ESPORTS', 'Verified esports arena participant band for approved squad players.', true, 2)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wristband_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_ref text NOT NULL,
  registration_id uuid,
  subject_type text NOT NULL CHECK (subject_type IN ('visitor', 'esports_player', 'participation')),
  event_day text NOT NULL DEFAULT '2026-11-20' CHECK (event_day IN ('2026-11-20', '2026-11-21')),
  category_id uuid REFERENCES public.wristband_categories(id) ON DELETE SET NULL,
  category_name text NOT NULL,
  wristband_code text,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_by_email text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'replaced')),
  replacement_reason text,
  replaced_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  replaced_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wristband_active_per_day
  ON public.wristband_issuances (ticket_ref, event_day)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_wristband_ticket_ref ON public.wristband_issuances (ticket_ref);

ALTER TABLE public.wristband_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wristband_issuances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wristband_categories FROM anon, PUBLIC;
REVOKE ALL ON public.wristband_issuances FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wristband_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.wristband_issuances TO authenticated;
GRANT ALL ON public.wristband_categories TO service_role;
GRANT ALL ON public.wristband_issuances TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Multi-Day Check-In & Supervisor Override Support on public.check_ins
-- ------------------------------------------------------------------------------
-- Drop strict FK if check_ins.registration_id referenced only registrations(id)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.check_ins'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) ILIKE '%registration_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.check_ins DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.check_ins
  ALTER COLUMN registration_id DROP NOT NULL;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_check_ins_unique_daily_entry
  ON public.check_ins (ticket_ref, event_day, subject_type)
  WHERE is_override = false AND ticket_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_check_ins_ticket_ref ON public.check_ins (ticket_ref);
CREATE INDEX IF NOT EXISTS idx_check_ins_event_day ON public.check_ins (event_day);

-- ------------------------------------------------------------------------------
-- 4. Upgrade Games, Registrations, Team Status History & Players
-- ------------------------------------------------------------------------------
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS substitutes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_teams integer,
  ADD COLUMN IF NOT EXISTS match_format text NOT NULL DEFAULT 'single_elimination',
  ADD COLUMN IF NOT EXISTS scoring_mode text NOT NULL DEFAULT 'round_based',
  ADD COLUMN IF NOT EXISTS scoring_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS match_duration_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tournament_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS assigned_conductor_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.registrations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND conname NOT ILIKE '%selection%'
  LOOP
    EXECUTE format('ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_status_check
  CHECK (status IN ('pending', 'confirmed', 'declined', 'withdrawn', 'correction_requested'));

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS selection_status text NOT NULL DEFAULT 'awaiting_selection',
  ADD COLUMN IF NOT EXISTS selection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS seed_number integer,
  ADD COLUMN IF NOT EXISTS group_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_selection_status_check'
      AND conrelid = 'public.registrations'::regclass
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_selection_status_check
      CHECK (selection_status IN ('awaiting_selection', 'selected', 'not_selected', 'waitlisted', 'disqualified'));
  END IF;
END $$;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS player_ticket_ref text,
  ADD COLUMN IF NOT EXISTS roster_role text NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.team_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('registration_status', 'selection_status')),
  previous_value text,
  next_value text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_status_history_reg_id ON public.team_status_history (registration_id, created_at DESC);

ALTER TABLE public.team_status_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_status_history FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.team_status_history TO authenticated;
GRANT ALL ON public.team_status_history TO service_role;

-- ------------------------------------------------------------------------------
-- 5. Tournaments, Matches, Match Attendance & Disputes
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name text NOT NULL,
  format text NOT NULL DEFAULT 'single_elimination' CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin', 'group_knockout')),
  scoring_mode text NOT NULL DEFAULT 'round_based' CHECK (scoring_mode IN ('round_based', 'battle_royale', 'group_points', 'custom')),
  scoring_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'in_progress', 'completed')),
  is_structure_locked boolean NOT NULL DEFAULT false,
  allow_unselected_entry boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_game_id ON public.tournaments (game_id);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tournaments FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.matches'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND conname NOT ILIKE '%result_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS round_number integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS match_number integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS bracket_side text DEFAULT 'winners',
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS station text,
  ADD COLUMN IF NOT EXISTS conductor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conductor_email text,
  ADD COLUMN IF NOT EXISTS match_format text DEFAULT 'BO1',
  ADD COLUMN IF NOT EXISTS detailed_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS next_match_id uuid,
  ADD COLUMN IF NOT EXISTS next_match_slot text,
  ADD COLUMN IF NOT EXISTS loser_next_match_id uuid,
  ADD COLUMN IF NOT EXISTS loser_next_match_slot text,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS bracket_advanced_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_status_check
  CHECK (status IN ('upcoming', 'scheduled', 'check_in', 'ready', 'live', 'result_submitted', 'completed', 'disputed'));

CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON public.matches (tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_conductor_id ON public.matches (conductor_id);

CREATE TABLE IF NOT EXISTS public.match_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  present boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz DEFAULT now(),
  notes text,
  UNIQUE (match_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.match_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by_email text,
  reason text NOT NULL,
  original_submission jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved')),
  resolution_notes text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_attendance_match_id ON public.match_attendance (match_id);
CREATE INDEX IF NOT EXISTS idx_match_disputes_match_id ON public.match_disputes (match_id);

ALTER TABLE public.match_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_attendance FROM anon, PUBLIC;
REVOKE ALL ON public.match_disputes FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.match_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.match_disputes TO authenticated;
GRANT ALL ON public.match_attendance TO service_role;
GRANT ALL ON public.match_disputes TO service_role;

-- ------------------------------------------------------------------------------
-- 6. Strict Permission-Scoped RLS Policies
-- ------------------------------------------------------------------------------
-- Visitors: entry scanners can inspect visitor passes at the gate
DROP POLICY IF EXISTS "admin_read_visitor_registrations" ON public.visitor_registrations;
CREATE POLICY "admin_read_visitor_registrations"
ON public.visitor_registrations FOR SELECT
TO authenticated
USING (
  public.has_crm_permission('visitor:view')
  OR public.has_crm_permission('entry:scan_visitor')
  OR public.has_crm_permission('reports:view')
);

DROP POLICY IF EXISTS "admin_update_visitor_registrations" ON public.visitor_registrations;
CREATE POLICY "admin_update_visitor_registrations"
ON public.visitor_registrations FOR UPDATE
TO authenticated
USING (public.has_crm_permission('visitor:edit') OR public.has_crm_permission('entry:checkin_visitor'))
WITH CHECK (public.has_crm_permission('visitor:edit') OR public.has_crm_permission('entry:checkin_visitor'));

-- Esports Registrations & Players: entry staff & match conductors can verify assigned/approved records
DROP POLICY IF EXISTS "admin_read_registrations" ON public.registrations;
CREATE POLICY "admin_read_registrations"
ON public.registrations FOR SELECT
TO authenticated
USING (
  public.has_crm_permission('esports:view')
  OR public.has_crm_permission('entry:scan_esports')
  OR public.has_crm_permission('tournament:select_teams')
  OR public.has_crm_permission('conductor:view_assigned')
  OR public.has_crm_permission('reports:view')
);

DROP POLICY IF EXISTS "admin_update_registrations" ON public.registrations;
CREATE POLICY "admin_update_registrations"
ON public.registrations FOR UPDATE
TO authenticated
USING (
  public.has_crm_permission('esports:edit')
  OR public.has_crm_permission('esports:approve')
  OR public.has_crm_permission('esports:reject')
  OR public.has_crm_permission('tournament:select_teams')
  OR public.has_crm_permission('entry:checkin_esports')
)
WITH CHECK (
  public.has_crm_permission('esports:edit')
  OR public.has_crm_permission('esports:approve')
  OR public.has_crm_permission('esports:reject')
  OR public.has_crm_permission('tournament:select_teams')
  OR public.has_crm_permission('entry:checkin_esports')
);

DROP POLICY IF EXISTS "admin_read_players" ON public.players;
CREATE POLICY "admin_read_players"
ON public.players FOR SELECT
TO authenticated
USING (
  public.has_crm_permission('esports:view')
  OR public.has_crm_permission('entry:scan_esports')
  OR public.has_crm_permission('conductor:verify_roster')
  OR public.has_crm_permission('reports:view')
);

DROP POLICY IF EXISTS "admin_update_player" ON public.players;
CREATE POLICY "admin_update_player"
ON public.players FOR UPDATE
TO authenticated
USING (
  public.has_crm_permission('esports:edit')
  OR public.has_crm_permission('entry:checkin_esports')
  OR public.has_crm_permission('conductor:verify_roster')
)
WITH CHECK (
  public.has_crm_permission('esports:edit')
  OR public.has_crm_permission('entry:checkin_esports')
  OR public.has_crm_permission('conductor:verify_roster')
);

-- Check-ins: scoped to entry/checkin staff
DROP POLICY IF EXISTS "admin_read_checkins" ON public.check_ins;
CREATE POLICY "admin_read_checkins"
ON public.check_ins FOR SELECT
TO authenticated
USING (
  public.has_crm_permission('entry:view')
  OR public.has_crm_permission('visitor:view')
  OR public.has_crm_permission('esports:view')
  OR public.has_crm_permission('reports:view')
);

DROP POLICY IF EXISTS "admin_insert_checkin" ON public.check_ins;
CREATE POLICY "admin_insert_checkin"
ON public.check_ins FOR INSERT
TO authenticated
WITH CHECK (
  public.has_crm_permission('entry:checkin_visitor')
  OR public.has_crm_permission('entry:checkin_esports')
  OR public.has_crm_permission('entry:override_checkin')
  OR public.has_crm_permission('visitor:edit')
  OR public.has_crm_permission('esports:edit')
);

DROP POLICY IF EXISTS "admin_update_checkin" ON public.check_ins;
CREATE POLICY "admin_update_checkin"
ON public.check_ins FOR UPDATE
TO authenticated
USING (
  public.has_crm_permission('entry:override_checkin')
  OR public.has_crm_permission('visitor:edit')
  OR public.has_crm_permission('esports:edit')
)
WITH CHECK (
  public.has_crm_permission('entry:override_checkin')
  OR public.has_crm_permission('visitor:edit')
  OR public.has_crm_permission('esports:edit')
);

-- Wristband Categories & Issuances
DROP POLICY IF EXISTS "wristband_categories_select" ON public.wristband_categories;
CREATE POLICY "wristband_categories_select"
ON public.wristband_categories FOR SELECT
TO authenticated
USING (public.is_entry_staff() OR public.is_admin());

DROP POLICY IF EXISTS "wristband_categories_manage" ON public.wristband_categories;
CREATE POLICY "wristband_categories_manage"
ON public.wristband_categories FOR ALL
TO authenticated
USING (public.has_crm_permission('entry:manage_wristbands') OR public.is_super_admin())
WITH CHECK (public.has_crm_permission('entry:manage_wristbands') OR public.is_super_admin());

DROP POLICY IF EXISTS "wristband_issuances_select" ON public.wristband_issuances;
CREATE POLICY "wristband_issuances_select"
ON public.wristband_issuances FOR SELECT
TO authenticated
USING (public.is_entry_staff() OR public.has_crm_permission('reports:view'));

DROP POLICY IF EXISTS "wristband_issuances_insert" ON public.wristband_issuances;
CREATE POLICY "wristband_issuances_insert"
ON public.wristband_issuances FOR INSERT
TO authenticated
WITH CHECK (public.has_crm_permission('entry:issue_wristband'));

DROP POLICY IF EXISTS "wristband_issuances_update" ON public.wristband_issuances;
CREATE POLICY "wristband_issuances_update"
ON public.wristband_issuances FOR UPDATE
TO authenticated
USING (public.has_crm_permission('entry:issue_wristband'))
WITH CHECK (public.has_crm_permission('entry:issue_wristband'));

-- Team Status History
DROP POLICY IF EXISTS "team_status_history_select" ON public.team_status_history;
CREATE POLICY "team_status_history_select"
ON public.team_status_history FOR SELECT
TO authenticated
USING (
  public.has_crm_permission('esports:view')
  OR public.has_crm_permission('tournament:select_teams')
  OR public.has_crm_permission('reports:view')
);

DROP POLICY IF EXISTS "team_status_history_insert" ON public.team_status_history;
CREATE POLICY "team_status_history_insert"
ON public.team_status_history FOR INSERT
TO authenticated
WITH CHECK (
  public.has_crm_permission('esports:edit')
  OR public.has_crm_permission('esports:approve')
  OR public.has_crm_permission('esports:reject')
  OR public.has_crm_permission('tournament:select_teams')
);

-- Games: esports managers can edit tournament configs
DROP POLICY IF EXISTS "admin_update_games_rbac" ON public.games;
CREATE POLICY "admin_update_games_rbac"
ON public.games FOR UPDATE
TO authenticated
USING (
  public.has_crm_permission('event_info:edit')
  OR public.has_crm_permission('tournament:manage_games')
  OR public.has_crm_permission('esports:edit')
)
WITH CHECK (
  public.has_crm_permission('event_info:edit')
  OR public.has_crm_permission('tournament:manage_games')
  OR public.has_crm_permission('esports:edit')
);

-- Tournaments
DROP POLICY IF EXISTS "tournaments_select_rbac" ON public.tournaments;
CREATE POLICY "tournaments_select_rbac"
ON public.tournaments FOR SELECT
TO authenticated
USING (
  public.has_crm_permission('esports:view')
  OR public.has_crm_permission('tournament:build_bracket')
  OR public.has_crm_permission('conductor:view_assigned')
);

DROP POLICY IF EXISTS "tournaments_write_rbac" ON public.tournaments;
CREATE POLICY "tournaments_write_rbac"
ON public.tournaments FOR ALL
TO authenticated
USING (
  public.has_crm_permission('tournament:build_bracket')
  OR public.has_crm_permission('tournament:manage_games')
)
WITH CHECK (
  public.has_crm_permission('tournament:build_bracket')
  OR public.has_crm_permission('tournament:manage_games')
);

-- Matches: Match Conductors ONLY see/update their assigned matches!
DROP POLICY IF EXISTS "matches_select_policy" ON public.matches;
CREATE POLICY "matches_select_policy"
ON public.matches FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR (
    auth.role() = 'authenticated'
    AND (
      public.has_crm_permission('esports:view')
      OR public.has_crm_permission('tournament:confirm_results')
      OR (public.has_crm_permission('conductor:view_assigned') AND conductor_id = (select auth.uid()))
    )
  )
);

DROP POLICY IF EXISTS "admin_insert_match" ON public.matches;
CREATE POLICY "admin_insert_match"
ON public.matches FOR INSERT
TO authenticated
WITH CHECK (
  public.has_crm_permission('tournament:build_bracket')
  OR public.has_crm_permission('esports:create')
  OR public.has_crm_permission('esports:edit')
);

DROP POLICY IF EXISTS "admin_update_match" ON public.matches;
CREATE POLICY "admin_update_match"
ON public.matches FOR UPDATE
TO authenticated
USING (
  public.has_crm_permission('esports:edit')
  OR public.has_crm_permission('tournament:assign_conductors')
  OR public.has_crm_permission('tournament:confirm_results')
  OR public.has_crm_permission('tournament:resolve_disputes')
  OR (public.has_crm_permission('conductor:submit_result') AND conductor_id = (select auth.uid()))
)
WITH CHECK (
  public.has_crm_permission('esports:edit')
  OR public.has_crm_permission('tournament:assign_conductors')
  OR public.has_crm_permission('tournament:confirm_results')
  OR public.has_crm_permission('tournament:resolve_disputes')
  OR (
    public.has_crm_permission('conductor:submit_result')
    AND conductor_id = (select auth.uid())
    AND status IN ('scheduled', 'check_in', 'ready', 'live', 'result_submitted', 'disputed')
  )
);

DROP POLICY IF EXISTS "admin_delete_match" ON public.matches;
CREATE POLICY "admin_delete_match"
ON public.matches FOR DELETE
TO authenticated
USING (
  public.has_crm_permission('tournament:build_bracket')
  OR public.has_crm_permission('esports:edit')
);

-- Match Attendance
DROP POLICY IF EXISTS "match_attendance_select" ON public.match_attendance;
CREATE POLICY "match_attendance_select"
ON public.match_attendance FOR SELECT
TO authenticated
USING (
  public.has_crm_permission('esports:view')
  OR public.has_crm_permission('conductor:verify_roster')
);

DROP POLICY IF EXISTS "match_attendance_write" ON public.match_attendance;
CREATE POLICY "match_attendance_write"
ON public.match_attendance FOR ALL
TO authenticated
USING (
  public.has_crm_permission('esports:edit')
  OR (
    public.has_crm_permission('conductor:verify_roster')
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_attendance.match_id
        AND m.conductor_id = (select auth.uid())
    )
  )
)
WITH CHECK (
  public.has_crm_permission('esports:edit')
  OR (
    public.has_crm_permission('conductor:verify_roster')
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_attendance.match_id
        AND m.conductor_id = (select auth.uid())
    )
  )
);

-- Match Disputes
DROP POLICY IF EXISTS "match_disputes_select" ON public.match_disputes;
CREATE POLICY "match_disputes_select"
ON public.match_disputes FOR SELECT
TO authenticated
USING (
  public.has_crm_permission('tournament:resolve_disputes')
  OR public.has_crm_permission('esports:view')
  OR reported_by = (select auth.uid())
);

DROP POLICY IF EXISTS "match_disputes_insert" ON public.match_disputes;
CREATE POLICY "match_disputes_insert"
ON public.match_disputes FOR INSERT
TO authenticated
WITH CHECK (
  public.has_crm_permission('conductor:report_dispute')
  OR public.has_crm_permission('tournament:resolve_disputes')
);

DROP POLICY IF EXISTS "match_disputes_update" ON public.match_disputes;
CREATE POLICY "match_disputes_update"
ON public.match_disputes FOR UPDATE
TO authenticated
USING (public.has_crm_permission('tournament:resolve_disputes'))
WITH CHECK (public.has_crm_permission('tournament:resolve_disputes'));

-- ------------------------------------------------------------------------------
-- 7. Transactional SECURITY DEFINER RPCs
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

  SELECT coalesce(email, full_name, 'staff@supernova') INTO v_actor_email FROM public.profiles WHERE id = v_uid;

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
      'override_reason', p_override_reason
    )
  );

  RETURN jsonb_build_object('ok', true, 'checkin_id', v_checkin_id, 'checked_in_at', v_now);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_match_result_and_advance(
  p_match_id uuid,
  p_winner_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_detailed_scores jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match record;
  v_loser_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL OR NOT public.has_crm_permission('tournament:confirm_results') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: tournament:confirm_results permission required');
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Match not found');
  END IF;

  IF v_match.status = 'disputed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Match is disputed and frozen. Resolve dispute first.');
  END IF;

  IF v_match.bracket_advanced_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Double-advancement blocked: bracket progression already executed.');
  END IF;

  IF p_winner_id IS NULL OR (p_winner_id <> v_match.team_a_id AND p_winner_id <> v_match.team_b_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Winner must be one of the match teams.');
  END IF;

  v_loser_id := CASE WHEN p_winner_id = v_match.team_a_id THEN v_match.team_b_id ELSE v_match.team_a_id END;

  UPDATE public.matches
  SET
    score_a = p_score_a,
    score_b = p_score_b,
    detailed_scores = coalesce(p_detailed_scores, detailed_scores),
    winner_id = p_winner_id,
    status = 'completed',
    result_status = 'confirmed',
    confirmed_by = v_uid,
    confirmed_at = v_now,
    bracket_advanced_at = v_now
  WHERE id = p_match_id;

  IF v_match.next_match_id IS NOT NULL THEN
    IF v_match.next_match_slot = 'B' THEN
      UPDATE public.matches SET team_b_id = p_winner_id WHERE id = v_match.next_match_id;
    ELSE
      UPDATE public.matches SET team_a_id = p_winner_id WHERE id = v_match.next_match_id;
    END IF;
  END IF;

  IF v_match.loser_next_match_id IS NOT NULL AND v_loser_id IS NOT NULL THEN
    IF v_match.loser_next_match_slot = 'B' THEN
      UPDATE public.matches SET team_b_id = v_loser_id WHERE id = v_match.loser_next_match_id;
    ELSE
      UPDATE public.matches SET team_a_id = v_loser_id WHERE id = v_match.loser_next_match_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid,
    'match_result_confirmed_and_advanced',
    'matches',
    p_match_id,
    jsonb_build_object(
      'winner_id', p_winner_id,
      'loser_id', v_loser_id,
      'score_a', p_score_a,
      'score_b', p_score_b,
      'next_match_id', v_match.next_match_id
    )
  );

  RETURN jsonb_build_object('ok', true, 'confirmed_at', v_now);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.perform_event_checkin(text, text, text, uuid, text, text, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_event_checkin(text, text, text, uuid, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_match_result_and_advance(uuid, uuid, integer, integer, jsonb) TO authenticated;
