-- ==============================================================================
-- SUPERNOVA 3.0 — COMPLETE STANDALONE CRM USER MANAGEMENT & RBAC REPAIR
-- Migration: 20261124000000_complete_crm_user_management_and_rbac_repair.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Idempotent & Self-Contained: Safe to apply directly on production databases
-- regardless of whether 20261113 or 20261121 were previously executed.
-- Preserves all existing users, roles, registrations, check-ins, matches, and audit logs.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend public.profiles for CRM User Lifecycle & Backfill Existing Staff
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_account_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('invited', 'active', 'deactivated', 'revoked'));
  END IF;
END $$;

INSERT INTO public.profiles (id, email, full_name, display_name, account_status, activated_at, last_login_at)
SELECT
  u.id,
  lower(u.email),
  coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1)),
  coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1)),
  'active',
  coalesce(u.last_sign_in_at, now()),
  u.last_sign_in_at
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = coalesce(public.profiles.email, EXCLUDED.email),
  full_name = coalesce(public.profiles.full_name, EXCLUDED.full_name),
  display_name = coalesce(public.profiles.display_name, EXCLUDED.display_name),
  last_login_at = coalesce(public.profiles.last_login_at, EXCLUDED.last_login_at),
  updated_at = now();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := coalesce(NEW.raw_app_meta_data->>'crm_initial_status', 'active');
  v_name text := coalesce(nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1));
BEGIN
  IF v_status NOT IN ('invited', 'active', 'deactivated', 'revoked') THEN
    v_status := 'active';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, display_name, account_status)
  VALUES (
    NEW.id,
    lower(NEW.email),
    v_name,
    v_name,
    v_status
  )
  ON CONFLICT (id) DO UPDATE SET
    email = coalesce(public.profiles.email, EXCLUDED.email),
    full_name = coalesce(public.profiles.full_name, EXCLUDED.full_name),
    display_name = coalesce(public.profiles.display_name, EXCLUDED.display_name),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 2. Expand public.user_roles Role Check & Audit Columns
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
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

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

-- ------------------------------------------------------------------------------
-- 3. Ensure Granular Permissions & Invitations Tables Exist
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  allowed boolean NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_user_permissions_user_id ON public.crm_user_permissions (user_id);

ALTER TABLE public.crm_user_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_user_permissions FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_user_permissions TO authenticated;
GRANT ALL ON public.crm_user_permissions TO service_role;

CREATE TABLE IF NOT EXISTS public.crm_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  role text NOT NULL,
  permission_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  invited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_invitations
  ADD COLUMN IF NOT EXISTS invited_at timestamptz;

UPDATE public.crm_invitations
SET invited_at = coalesce(invited_at, created_at, now())
WHERE invited_at IS NULL;

ALTER TABLE public.crm_invitations
  ALTER COLUMN invited_at SET DEFAULT now();

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

CREATE INDEX IF NOT EXISTS idx_crm_invitations_email ON public.crm_invitations (lower(email));
CREATE INDEX IF NOT EXISTS idx_crm_invitations_status ON public.crm_invitations (status);

ALTER TABLE public.crm_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_invitations FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_invitations TO authenticated;
GRANT ALL ON public.crm_invitations TO service_role;

CREATE OR REPLACE FUNCTION public._sync_crm_invitation_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := coalesce(NEW.invited_at, now());
  END IF;
  IF NEW.invited_at IS NULL THEN
    NEW.invited_at := coalesce(NEW.created_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_crm_invitation_timestamps ON public.crm_invitations;
CREATE TRIGGER trg_sync_crm_invitation_timestamps
BEFORE INSERT ON public.crm_invitations
FOR EACH ROW EXECUTE FUNCTION public._sync_crm_invitation_timestamps();

-- ------------------------------------------------------------------------------
-- 4. Core RBAC Functions (SECURITY DEFINER, search_path = public)
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
      'email_centre:view','email_centre:compose','email_centre:send','email_centre:resend',
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
      'email_centre:view','email_centre:compose','email_centre:send','email_centre:resend',
      'reports:view','reports:export',
      'system_settings:view'
    ]
    WHEN 'registration_staff' THEN ARRAY[
      'visitor:view','visitor:create','visitor:edit',
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

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND coalesce(p.account_status, 'active') = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
      AND coalesce(p.account_status, 'active') = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_crm_permission(p_permission text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_status text;
  v_override boolean;
  v_defaults text[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT coalesce(p.account_status, 'active'), ur.role
  INTO v_status, v_role
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.user_id = v_uid
  ORDER BY CASE ur.role
    WHEN 'super_admin' THEN 100
    WHEN 'crm_admin' THEN 90
    WHEN 'event_admin' THEN 85
    WHEN 'esports_manager' THEN 80
    WHEN 'score_operator' THEN 75
    WHEN 'esports_entry_staff' THEN 70
    WHEN 'registration_staff' THEN 65
    WHEN 'checkin_staff' THEN 60
    WHEN 'match_conductor' THEN 55
    WHEN 'content_manager' THEN 50
    WHEN 'participation_manager' THEN 20
    WHEN 'viewer' THEN 10
    ELSE 0
  END DESC
  LIMIT 1;

  IF v_role IS NULL OR v_status <> 'active' THEN
    RETURN false;
  END IF;

  IF v_role = 'super_admin' THEN
    RETURN true;
  END IF;

  SELECT cup.allowed
  INTO v_override
  FROM public.crm_user_permissions cup
  WHERE cup.user_id = v_uid
    AND cup.permission_key = p_permission
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  v_defaults := public.role_default_permissions(v_role);
  RETURN p_permission = ANY(v_defaults);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_crm_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_full_name text;
  v_status text;
  v_role text;
  v_defaults text[];
  v_effective text[];
  v_overrides jsonb := '[]'::jsonb;
  v_ov record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', false,
      'is_active', false,
      'permissions', '[]'::jsonb,
      'effective_permissions', '[]'::jsonb,
      'overrides', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(p.account_status, 'active'), p.email, coalesce(p.full_name, p.display_name), ur.role
  INTO v_status, v_email, v_full_name, v_role
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.user_id = v_uid
  ORDER BY CASE ur.role
    WHEN 'super_admin' THEN 100
    WHEN 'crm_admin' THEN 90
    WHEN 'event_admin' THEN 85
    WHEN 'esports_manager' THEN 80
    WHEN 'score_operator' THEN 75
    WHEN 'esports_entry_staff' THEN 70
    WHEN 'registration_staff' THEN 65
    WHEN 'checkin_staff' THEN 60
    WHEN 'match_conductor' THEN 55
    WHEN 'content_manager' THEN 50
    WHEN 'participation_manager' THEN 20
    WHEN 'viewer' THEN 10
    ELSE 0
  END DESC
  LIMIT 1;

  IF v_role IS NULL THEN
    SELECT p.account_status, p.email, coalesce(p.full_name, p.display_name)
    INTO v_status, v_email, v_full_name
    FROM public.profiles p
    WHERE p.id = v_uid;

    RETURN jsonb_build_object(
      'authenticated', true,
      'user_id', v_uid,
      'email', v_email,
      'full_name', v_full_name,
      'role', NULL,
      'account_status', coalesce(v_status, 'active'),
      'is_active', false,
      'is_super_admin', false,
      'permissions', '[]'::jsonb,
      'effective_permissions', '[]'::jsonb,
      'overrides', '[]'::jsonb
    );
  END IF;

  IF v_status <> 'active' THEN
    RETURN jsonb_build_object(
      'authenticated', true,
      'user_id', v_uid,
      'email', v_email,
      'full_name', v_full_name,
      'role', v_role,
      'account_status', v_status,
      'is_active', false,
      'is_super_admin', false,
      'permissions', '[]'::jsonb,
      'effective_permissions', '[]'::jsonb,
      'overrides', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object('permission_key', cup.permission_key, 'allowed', cup.allowed)),
    '[]'::jsonb
  )
  INTO v_overrides
  FROM public.crm_user_permissions cup
  WHERE cup.user_id = v_uid;

  v_defaults := public.role_default_permissions(v_role);
  IF v_role = 'super_admin' THEN
    v_effective := v_defaults;
  ELSE
    v_effective := v_defaults;
    FOR v_ov IN
      SELECT permission_key, allowed
      FROM public.crm_user_permissions
      WHERE user_id = v_uid
    LOOP
      IF v_ov.allowed THEN
        IF NOT (v_ov.permission_key = ANY(v_effective)) THEN
          v_effective := array_append(v_effective, v_ov.permission_key);
        END IF;
      ELSE
        v_effective := array_remove(v_effective, v_ov.permission_key);
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'authenticated', true,
    'user_id', v_uid,
    'email', v_email,
    'full_name', v_full_name,
    'role', v_role,
    'account_status', v_status,
    'is_active', true,
    'is_super_admin', (v_role = 'super_admin'),
    'permissions', to_jsonb(coalesce(v_effective, ARRAY[]::text[])),
    'effective_permissions', to_jsonb(coalesce(v_effective, ARRAY[]::text[])),
    'overrides', v_overrides
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_crm_invite()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  SELECT account_status INTO v_status FROM public.profiles WHERE id = v_uid;

  IF v_status IN ('deactivated', 'revoked') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account is deactivated or revoked');
  END IF;

  PERFORM set_config('app.crm_self_activate', 'true', true);

  IF v_status = 'invited' THEN
    UPDATE public.profiles
    SET
      account_status = 'active',
      activated_at = coalesce(activated_at, now()),
      last_login_at = now(),
      updated_at = now()
    WHERE id = v_uid;

    UPDATE public.crm_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE lower(email) = v_email AND status = 'pending';

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_uid, 'crm_invite_accepted', 'profiles', v_uid, jsonb_build_object('email', v_email, 'activated_at', now()));
  ELSE
    UPDATE public.profiles
    SET last_login_at = now(), updated_at = now()
    WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_crm_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  PERFORM set_config('app.crm_self_activate', 'true', true);
  UPDATE public.profiles
  SET last_login_at = now(), updated_at = now()
  WHERE id = v_uid AND account_status = 'active';
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
    OR public.has_crm_permission('entry:scan_esports')
    OR public.has_crm_permission('entry:checkin_visitor')
    OR public.has_crm_permission('entry:checkin_esports')
    OR public.has_crm_permission('tickets:view')
    OR public.has_crm_permission('tickets:manage');
$$;

CREATE OR REPLACE FUNCTION public.has_any_user_management_permission()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin()
    OR public.has_crm_permission('user_management:view')
    OR public.has_crm_permission('user_management:invite')
    OR public.has_crm_permission('user_management:edit')
    OR public.has_crm_permission('user_management:deactivate')
    OR public.has_crm_permission('user_management:delete')
    OR public.has_crm_permission('user_management:assign_permissions');
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_crm_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_crm_access() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_crm_invite() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_crm_login() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_entry_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_user_management_permission() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_crm_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_crm_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_crm_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_crm_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_entry_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_user_management_permission() TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. Database-Enforced Self-Edit & Last-Super-Admin Protection Triggers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_crm_role_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_target_uid uuid;
  v_active_super_count integer;
  v_target_status text;
BEGIN
  IF v_actor IS NOT NULL AND v_jwt_role <> 'service_role' THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Forbidden: Only an active Super Admin can manage CRM user roles.' USING ERRCODE = '42501';
    END IF;

    v_target_uid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
    IF v_target_uid = v_actor THEN
      RAISE EXCEPTION 'Security policy violation: You cannot modify your own CRM role.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role = 'super_admin' THEN
    SELECT coalesce(account_status, 'active') INTO v_target_status FROM public.profiles WHERE id = OLD.user_id;
    IF coalesce(v_target_status, 'active') = 'active' AND (TG_OP = 'DELETE' OR NEW.role <> 'super_admin') THEN
      SELECT count(DISTINCT ur.user_id) INTO v_active_super_count
      FROM public.user_roles ur
      LEFT JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role = 'super_admin'
        AND coalesce(p.account_status, 'active') = 'active'
        AND ur.user_id <> OLD.user_id;

      IF v_active_super_count < 1 THEN
        RAISE EXCEPTION 'Security policy violation: Cannot remove or demote the last active Super Admin.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_crm_role_mutation ON public.user_roles;
CREATE TRIGGER trg_guard_crm_role_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_crm_role_mutation();

CREATE OR REPLACE FUNCTION public.guard_crm_permission_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_target_uid uuid;
BEGIN
  IF v_actor IS NOT NULL AND v_jwt_role <> 'service_role' THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Forbidden: Only an active Super Admin can assign custom permissions.' USING ERRCODE = '42501';
    END IF;

    v_target_uid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
    IF v_target_uid = v_actor THEN
      RAISE EXCEPTION 'Security policy violation: You cannot modify your own permissions.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_crm_permission_mutation ON public.crm_user_permissions;
CREATE TRIGGER trg_guard_crm_permission_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.crm_user_permissions
FOR EACH ROW EXECUTE FUNCTION public.guard_crm_permission_mutation();

CREATE OR REPLACE FUNCTION public.guard_profile_status_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_self_activate text := coalesce(current_setting('app.crm_self_activate', true), '');
  v_is_super boolean;
  v_active_super_count integer;
BEGIN
  IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
    IF v_actor IS NOT NULL AND v_jwt_role <> 'service_role' AND v_self_activate <> 'true' THEN
      IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Forbidden: Only an active Super Admin can change user account status.' USING ERRCODE = '42501';
      END IF;
      IF NEW.id = v_actor THEN
        RAISE EXCEPTION 'Security policy violation: You cannot deactivate or revoke your own account.' USING ERRCODE = '42501';
      END IF;
    END IF;

    IF OLD.account_status = 'active' AND NEW.account_status <> 'active' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = OLD.id AND role = 'super_admin'
      ) INTO v_is_super;

      IF v_is_super THEN
        SELECT count(DISTINCT ur.user_id) INTO v_active_super_count
        FROM public.user_roles ur
        LEFT JOIN public.profiles p ON p.id = ur.user_id
        WHERE ur.role = 'super_admin'
          AND coalesce(p.account_status, 'active') = 'active'
          AND ur.user_id <> OLD.id;

        IF v_active_super_count < 1 THEN
          RAISE EXCEPTION 'Security policy violation: Cannot deactivate or revoke the last active Super Admin.' USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;

    IF NEW.account_status = 'deactivated' THEN
      NEW.deactivated_at := coalesce(NEW.deactivated_at, now());
    ELSIF NEW.account_status = 'revoked' THEN
      NEW.revoked_at := coalesce(NEW.revoked_at, now());
    ELSIF NEW.account_status = 'active' THEN
      NEW.activated_at := coalesce(NEW.activated_at, now());
      NEW.deactivated_at := NULL;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_status_mutation ON public.profiles;
CREATE TRIGGER trg_guard_profile_status_mutation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_status_mutation();

CREATE OR REPLACE FUNCTION public.guard_crm_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_super boolean;
  v_active_super_count integer;
BEGIN
  IF v_actor IS NOT NULL AND v_jwt_role <> 'service_role' THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Forbidden: Only an active Super Admin can delete CRM staff profiles.' USING ERRCODE = '42501';
    END IF;
    IF OLD.id = v_actor THEN
      RAISE EXCEPTION 'Security policy violation: You cannot permanently delete your own account.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF coalesce(OLD.account_status, 'active') = 'active' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = OLD.id AND role = 'super_admin'
    ) INTO v_is_super;

    IF v_is_super THEN
      SELECT count(DISTINCT ur.user_id) INTO v_active_super_count
      FROM public.user_roles ur
      LEFT JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role = 'super_admin'
        AND coalesce(p.account_status, 'active') = 'active'
        AND ur.user_id <> OLD.id;

      IF v_active_super_count < 1 THEN
        RAISE EXCEPTION 'Security policy violation: Cannot permanently delete the last active Super Admin.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_crm_profile_delete ON public.profiles;
CREATE TRIGGER trg_guard_crm_profile_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_crm_profile_delete();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_admin_audit'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles';
    EXECUTE 'CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit()';

    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_crm_user_permissions ON public.crm_user_permissions';
    EXECUTE 'CREATE TRIGGER trg_audit_crm_user_permissions AFTER INSERT OR UPDATE OR DELETE ON public.crm_user_permissions FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit()';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. Preserve Historical Event Data on Permanent Staff Deletion (ON DELETE SET NULL)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      c.conname,
      rel.relname AS table_name,
      att.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
    WHERE nsp.nspname = 'public'
      AND c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND array_length(c.conkey, 1) = 1
      AND c.confdeltype IN ('a', 'r')
      AND NOT (
        (rel.relname = 'profiles' AND att.attname = 'id')
        OR (rel.relname = 'user_roles' AND att.attname = 'user_id')
        OR (rel.relname = 'crm_user_permissions' AND att.attname = 'user_id')
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
      r.table_name,
      r.conname,
      r.column_name
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 7. Remove `OR public.is_admin()` RBAC Bypasses from Gate & Ticket Helpers/RLS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gate_has_perm(p_perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT public.has_crm_permission(p_perm) INTO v_allowed;
  RETURN coalesce(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public._gate_has_perm(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._gate_has_perm(text) TO authenticated;

CREATE OR REPLACE FUNCTION public._gate_is_entry_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE public.is_entry_staff()
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
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF p_require_override THEN
    RETURN public.has_crm_permission('entry:override_checkin');
  END IF;

  IF p_subject_type = 'visitor' THEN
    RETURN public.has_crm_permission('entry:checkin_visitor')
        OR public.has_crm_permission('visitor:edit');
  ELSIF p_subject_type = 'esports_player' THEN
    RETURN public.has_crm_permission('entry:checkin_esports')
        OR public.has_crm_permission('esports:edit');
  ELSE
    RETURN public.has_crm_permission('entry:checkin_visitor')
        OR public.has_crm_permission('esports:edit');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._can_perform_checkin(text, boolean) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.tickets') IS NOT NULL THEN
    DROP POLICY IF EXISTS "staff_read_tickets" ON public.tickets;
    CREATE POLICY "staff_read_tickets"
    ON public.tickets FOR SELECT
    TO authenticated
    USING (
      public.has_crm_permission('entry:view')
      OR public.has_crm_permission('entry:scan_visitor')
      OR public.has_crm_permission('entry:scan_esports')
      OR public.has_crm_permission('tickets:view')
      OR public.has_crm_permission('tickets:manage')
      OR public.has_crm_permission('visitor:view')
      OR public.has_crm_permission('esports:view')
      OR public.has_crm_permission('reports:view')
    );

    DROP POLICY IF EXISTS "staff_manage_tickets" ON public.tickets;
    CREATE POLICY "staff_manage_tickets"
    ON public.tickets FOR UPDATE
    TO authenticated
    USING (
      public.has_crm_permission('tickets:manage')
      OR public.has_crm_permission('visitor:edit')
      OR public.has_crm_permission('esports:edit')
    )
    WITH CHECK (
      public.has_crm_permission('tickets:manage')
      OR public.has_crm_permission('visitor:edit')
      OR public.has_crm_permission('esports:edit')
    );
  END IF;

  IF to_regclass('public.check_ins') IS NOT NULL THEN
    DROP POLICY IF EXISTS "checkin_staff_read_check_ins" ON public.check_ins;
    CREATE POLICY "checkin_staff_read_check_ins"
    ON public.check_ins FOR SELECT
    TO authenticated
    USING (
      public.is_entry_staff()
      OR public.has_crm_permission('visitor:view')
      OR public.has_crm_permission('esports:view')
      OR public.has_crm_permission('reports:view')
    );

    DROP POLICY IF EXISTS "checkin_staff_insert_check_ins" ON public.check_ins;
    CREATE POLICY "checkin_staff_insert_check_ins"
    ON public.check_ins FOR INSERT
    TO authenticated
    WITH CHECK (
      public.has_crm_permission('entry:checkin_visitor')
      OR public.has_crm_permission('entry:checkin_esports')
      OR public.has_crm_permission('visitor:edit')
      OR public.has_crm_permission('esports:edit')
    );
  END IF;

  IF to_regclass('public.visitor_registrations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "staff_read_visitor_registrations_gate" ON public.visitor_registrations;
    CREATE POLICY "staff_read_visitor_registrations_gate"
    ON public.visitor_registrations FOR SELECT
    TO authenticated
    USING (
      public.has_crm_permission('entry:scan_visitor')
      OR public.has_crm_permission('entry:checkin_visitor')
      OR public.has_crm_permission('visitor:view')
      OR public.has_crm_permission('reports:view')
    );
  END IF;

  IF to_regclass('public.registrations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "staff_read_registrations_gate" ON public.registrations;
    CREATE POLICY "staff_read_registrations_gate"
    ON public.registrations FOR SELECT
    TO authenticated
    USING (
      public.has_crm_permission('entry:scan_esports')
      OR public.has_crm_permission('entry:checkin_esports')
      OR public.has_crm_permission('esports:view')
      OR public.has_crm_permission('reports:view')
    );
  END IF;

  IF to_regclass('public.players') IS NOT NULL THEN
    DROP POLICY IF EXISTS "staff_read_players_gate" ON public.players;
    CREATE POLICY "staff_read_players_gate"
    ON public.players FOR SELECT
    TO authenticated
    USING (
      public.has_crm_permission('entry:scan_esports')
      OR public.has_crm_permission('entry:checkin_esports')
      OR public.has_crm_permission('esports:view')
      OR public.has_crm_permission('reports:view')
    );
  END IF;

  IF to_regclass('public.wristband_categories') IS NOT NULL THEN
    DROP POLICY IF EXISTS "staff_read_wristband_categories" ON public.wristband_categories;
    CREATE POLICY "staff_read_wristband_categories"
    ON public.wristband_categories FOR SELECT
    TO authenticated
    USING (
      public.is_entry_staff()
      OR public.has_crm_permission('entry:manage_wristbands')
      OR public.has_crm_permission('reports:view')
    );

    DROP POLICY IF EXISTS "admin_manage_wristband_categories" ON public.wristband_categories;
    CREATE POLICY "admin_manage_wristband_categories"
    ON public.wristband_categories FOR ALL
    TO authenticated
    USING (public.has_crm_permission('entry:manage_wristbands'))
    WITH CHECK (public.has_crm_permission('entry:manage_wristbands'));
  END IF;

  IF to_regclass('public.wristband_issuances') IS NOT NULL THEN
    DROP POLICY IF EXISTS "staff_read_wristband_issuances" ON public.wristband_issuances;
    CREATE POLICY "staff_read_wristband_issuances"
    ON public.wristband_issuances FOR SELECT
    TO authenticated
    USING (
      public.is_entry_staff()
      OR public.has_crm_permission('reports:view')
    );

    DROP POLICY IF EXISTS "staff_write_wristband_issuances" ON public.wristband_issuances;
    CREATE POLICY "staff_write_wristband_issuances"
    ON public.wristband_issuances FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('entry:issue_wristband'));

    DROP POLICY IF EXISTS "staff_update_wristband_issuances" ON public.wristband_issuances;
    CREATE POLICY "staff_update_wristband_issuances"
    ON public.wristband_issuances FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('entry:issue_wristband'))
    WITH CHECK (public.has_crm_permission('entry:issue_wristband'));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 8. Remove `OR public.is_admin()` Bypasses Inside Ticket & Gate RPCs
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_issue_ticket_internal'
  ) THEN
    EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.issue_ticket_for_registration(
      p_category text,
      p_registration_id uuid
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    BEGIN
      IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Authentication required.');
      END IF;

      IF p_category = 'visitor' THEN
        IF NOT (
          public.has_crm_permission('visitor:edit')
          OR public.has_crm_permission('visitor:create')
          OR public.has_crm_permission('entry:checkin_visitor')
          OR public.has_crm_permission('tickets:manage')
        ) THEN
          RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: visitor ticket permission required.');
        END IF;
      ELSIF p_category = 'esports' THEN
        IF NOT (
          public.has_crm_permission('esports:approve')
          OR public.has_crm_permission('esports:edit')
          OR public.has_crm_permission('entry:checkin_esports')
          OR public.has_crm_permission('tickets:manage')
        ) THEN
          RETURN jsonb_build_object('ok', false, 'error', 'Forbidden: esports approval or ticket permission required.');
        END IF;
      ELSE
        RETURN jsonb_build_object('ok', false, 'error', 'Invalid or discontinued registration category.');
      END IF;

      RETURN public._issue_ticket_internal(p_category, p_registration_id);
    END;
    $body$;
    $fn$;

    REVOKE ALL ON FUNCTION public.issue_ticket_for_registration(text, uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.issue_ticket_for_registration(text, uuid) TO authenticated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_issue_ticket_internal'
  ) AND EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_is_registration_archived'
  ) AND to_regclass('public.tickets') IS NOT NULL THEN
    EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.verify_gate_ticket(
      p_query text,
      p_qr_token text DEFAULT NULL,
      p_event_day text DEFAULT '2026-11-20'
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
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
            IF public._is_registration_archived(v_fb_vis.archived_at, v_fb_vis.admin_notes) THEN
              RETURN jsonb_build_object('ok', true, 'verdict', 'INVALID', 'can_check_in', false, 'reason', 'Visitor registration ' || v_fb_vis.registration_ref || ' is archived or revoked.');
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
              IF public._is_registration_archived(v_fb_esp.archived_at, v_fb_esp.admin_notes) THEN
                RETURN jsonb_build_object('ok', true, 'verdict', 'INVALID', 'can_check_in', false, 'reason', 'Esports registration ' || v_fb_esp.registration_ref || ' is archived or revoked.');
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
          'verdict', 'INVALID',
          'can_check_in', false,
          'reason', 'Participation tickets have been discontinued.'
        );
      END IF;

      IF v_tkt.registration_category = 'visitor' AND NOT (
        public.has_crm_permission('entry:scan_visitor')
        OR public.has_crm_permission('entry:checkin_visitor')
        OR public.has_crm_permission('visitor:view')
        OR public.has_crm_permission('tickets:view')
        OR public.has_crm_permission('tickets:manage')
      ) THEN
        RETURN jsonb_build_object('ok', false, 'verdict', 'INVALID', 'can_check_in', false, 'error', 'Forbidden: You do not have permission to verify visitor passes.');
      ELSIF v_tkt.registration_category = 'esports' AND NOT (
        public.has_crm_permission('entry:scan_esports')
        OR public.has_crm_permission('entry:checkin_esports')
        OR public.has_crm_permission('esports:view')
        OR public.has_crm_permission('tickets:view')
        OR public.has_crm_permission('tickets:manage')
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

      IF v_tkt.status <> 'active' THEN
        v_verdict := 'INVALID';
        v_reason := 'Ticket status is "' || v_tkt.status || '".';
      ELSIF v_reg_status IS NULL OR public._is_registration_archived(v_archived_at, v_admin_notes) THEN
        v_verdict := 'INVALID';
        v_reason := 'Associated registration is missing or archived.';
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
    $body$;
    $fn$;

    REVOKE ALL ON FUNCTION public.verify_gate_ticket(text, text, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.verify_gate_ticket(text, text, text) TO authenticated;
  END IF;

  IF to_regclass('public.visitor_registrations') IS NOT NULL
     AND to_regclass('public.registration_controls') IS NOT NULL THEN
    EXECUTE $fn$
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
    AS $body$
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
          OR public.has_crm_permission('entry:checkin_visitor')
        ) THEN
          RAISE EXCEPTION 'Forbidden: Authorized visitor creation or gate entry permission required for walk-in registration.';
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
         OR v_raw_cat LIKE '%general%'
         OR (v_source = 'walk_in' AND v_raw_cat LIKE '%walk%') THEN
        v_clean_cat := 'General Visitor';
      ELSE
        RAISE EXCEPTION 'Please select a valid visitor category (Student Visitor, Faculty & Institutional Delegates, or General Visitor).';
      END IF;

      IF length(v_name) NOT BETWEEN 2 AND 120 THEN
        RAISE EXCEPTION 'Full Name is mandatory (2 to 120 characters).';
      END IF;
      IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'A valid Email Address is mandatory.';
      END IF;

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

      IF v_raw_phone IS NOT NULL AND v_raw_phone !~ '^[0-9]{10,15}$' THEN
        RAISE EXCEPTION 'Invalid phone number format.';
      END IF;

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
    $body$;
    $fn$;

    REVOKE EXECUTE ON FUNCTION public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.submit_visitor_registration_v2(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text, text) TO anon, authenticated;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 9. Strict RLS Policies & Grants for Staff Lifecycle Tables
-- ------------------------------------------------------------------------------
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.crm_user_permissions FROM anon;
REVOKE ALL ON public.crm_invitations FROM anon;

GRANT SELECT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "super_admin_read_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_rbac" ON public.profiles;
CREATE POLICY "profiles_select_rbac"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id = (select auth.uid())
  OR public.is_super_admin()
  OR (
    public.has_any_user_management_permission()
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur_super
      WHERE ur_super.user_id = public.profiles.id
        AND ur_super.role = 'super_admin'
    )
  )
);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "super_admin_update_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_rbac" ON public.profiles;
CREATE POLICY "profiles_update_rbac"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = (select auth.uid()) OR public.is_super_admin())
WITH CHECK (id = (select auth.uid()) OR public.is_super_admin());

DROP POLICY IF EXISTS "profiles_delete_rbac" ON public.profiles;
CREATE POLICY "profiles_delete_rbac"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_super_admin() AND id <> (select auth.uid()));

DROP POLICY IF EXISTS "admin_manage_roles_select" ON public.user_roles;
DROP POLICY IF EXISTS "admin_insert_role" ON public.user_roles;
DROP POLICY IF EXISTS "admin_update_role" ON public.user_roles;
DROP POLICY IF EXISTS "admin_delete_role" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_rbac" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_rbac" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_rbac" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_rbac" ON public.user_roles;

CREATE POLICY "user_roles_select_rbac"
ON public.user_roles FOR SELECT
TO authenticated
USING (
  user_id = (select auth.uid())
  OR public.is_super_admin()
  OR (
    public.has_any_user_management_permission()
    AND role <> 'super_admin'
  )
);

CREATE POLICY "user_roles_insert_rbac"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin() AND user_id <> (select auth.uid()));

CREATE POLICY "user_roles_update_rbac"
ON public.user_roles FOR UPDATE
TO authenticated
USING (public.is_super_admin() AND user_id <> (select auth.uid()))
WITH CHECK (public.is_super_admin() AND user_id <> (select auth.uid()));

CREATE POLICY "user_roles_delete_rbac"
ON public.user_roles FOR DELETE
TO authenticated
USING (public.is_super_admin() AND user_id <> (select auth.uid()));

DROP POLICY IF EXISTS "crm_permissions_select_rbac" ON public.crm_user_permissions;
CREATE POLICY "crm_permissions_select_rbac"
ON public.crm_user_permissions FOR SELECT
TO authenticated
USING (
  user_id = (select auth.uid())
  OR public.is_super_admin()
  OR (
    public.has_any_user_management_permission()
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur_super
      WHERE ur_super.user_id = public.crm_user_permissions.user_id
        AND ur_super.role = 'super_admin'
    )
  )
);

DROP POLICY IF EXISTS "crm_permissions_write_rbac" ON public.crm_user_permissions;
CREATE POLICY "crm_permissions_write_rbac"
ON public.crm_user_permissions FOR ALL
TO authenticated
USING (public.is_super_admin() AND user_id <> (select auth.uid()))
WITH CHECK (public.is_super_admin() AND user_id <> (select auth.uid()));

DROP POLICY IF EXISTS "crm_invitations_rbac" ON public.crm_invitations;
DROP POLICY IF EXISTS "crm_invitations_select_rbac" ON public.crm_invitations;
DROP POLICY IF EXISTS "crm_invitations_write_rbac" ON public.crm_invitations;

CREATE POLICY "crm_invitations_select_rbac"
ON public.crm_invitations FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR (
    public.has_any_user_management_permission()
    AND role <> 'super_admin'
  )
);

CREATE POLICY "crm_invitations_write_rbac"
ON public.crm_invitations FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Ensure Realtime publication covers profiles, user_roles & crm_user_permissions
DO $$
DECLARE
  v_tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_tbl IN ARRAY ARRAY['profiles', 'user_roles', 'crm_user_permissions']
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
