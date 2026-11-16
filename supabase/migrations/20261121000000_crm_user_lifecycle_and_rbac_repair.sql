-- ==============================================================================
-- SUPERNOVA 3.0 — CRM USER LIFECYCLE (DEACTIVATE / REACTIVATE / DELETE) & RBAC REPAIR
-- Migration: 20261121000000_crm_user_lifecycle_and_rbac_repair.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Idempotent: Safe to run on live production DB regardless of prior partial migrations.
-- Preserves all historical event data (registrations, check-ins, matches, audit logs).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend public.profiles for CRM User Lifecycle & Status Tracking
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

-- Backfill missing profiles from auth.users without altering existing statuses
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

-- Keep handle_new_user() synced with email, full_name, display_name, and account_status
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

-- ------------------------------------------------------------------------------
-- 2. Expand public.user_roles for all canonical CRM roles + legacy aliases
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
  created_at timestamptz NOT NULL DEFAULT now()
);

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

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_crm_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_crm_access() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_crm_invite() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_crm_login() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_crm_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_crm_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_crm_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_crm_login() TO authenticated;

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

-- Attach RBAC audit triggers cleanly if log_admin_audit() exists
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
--    Replaces any legacy NO ACTION / RESTRICT FKs referencing auth.users(id)
--    (e.g., event_settings.updated_by, site_content.updated_by, announcements.author_id,
--    check_ins.checked_in_by, registration_controls.updated_by, media_items.created_by,
--    institutions.updated_by) so auth.admin.deleteUser() never fails with FK 23503
--    and never cascades into deleting historical event records.
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
-- 7. Strict RLS Policies & Grants for Staff Lifecycle Tables
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
USING (id = (select auth.uid()) OR public.is_super_admin());

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
USING (user_id = (select auth.uid()) OR public.is_super_admin());

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
USING (user_id = (select auth.uid()) OR public.is_super_admin());

DROP POLICY IF EXISTS "crm_permissions_write_rbac" ON public.crm_user_permissions;
CREATE POLICY "crm_permissions_write_rbac"
ON public.crm_user_permissions FOR ALL
TO authenticated
USING (public.is_super_admin() AND user_id <> (select auth.uid()))
WITH CHECK (public.is_super_admin() AND user_id <> (select auth.uid()));

DROP POLICY IF EXISTS "crm_invitations_rbac" ON public.crm_invitations;
CREATE POLICY "crm_invitations_rbac"
ON public.crm_invitations FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
