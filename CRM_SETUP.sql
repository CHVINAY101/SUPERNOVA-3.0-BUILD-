-- ==============================================================================
-- SUPERNOVA 3.0 — BROWSER-ONLY CRM USER MANAGEMENT & RBAC SETUP (CRM_SETUP.sql)
-- Target Supabase Project: cirreovughlncadrbvcn (https://cirreovughlncadrbvcn.supabase.co)
--
-- SAFE FOR PRODUCTION:
--   * Idempotent: Safe to run multiple times in Supabase Dashboard -> SQL Editor.
--   * Preserves ALL existing users, roles, permissions, registrations, tickets,
--     check-ins, esports matches, and historical audit logs.
--   * Enforces fail-closed RBAC across all helper functions, triggers, RPCs, and
--     RLS policies.
--   * Does NOT reset tables, disable RLS, or alter visitor/ticket/gate RPCs.
-- ==============================================================================

BEGIN;

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
  v_status text := coalesce(
    NEW.raw_app_meta_data->>'crm_initial_status',
    CASE WHEN NEW.invited_at IS NOT NULL THEN 'invited' ELSE 'active' END
  );
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

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
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
-- 3. Ensure Granular Permissions, Invitations & Email Audit Tables Exist
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

ALTER TABLE public.crm_invitations DROP CONSTRAINT IF EXISTS crm_invitations_role_check;
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
-- 4. Core Fail-Closed RBAC Functions (SECURITY DEFINER, search_path = public)
-- ------------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.crm_is_valid_permission_key(p_permission text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_permission IS NOT NULL
    AND p_permission = ANY(public.role_default_permissions('super_admin'));
$$;

-- Preserves the original administrator scope of is_admin():
-- ONLY active administrator roles (super_admin, crm_admin, event_admin).
-- Requires an existing profile with account_status = 'active' (fail-closed).
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
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin', 'crm_admin', 'event_admin')
      AND p.account_status = 'active'
  );
$$;

-- Active Super Admin check (requires existing profile with account_status = 'active')
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
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'
      AND p.account_status = 'active'
  );
$$;

-- Fail-closed permission check (requires existing profile, account_status = 'active', and valid CRM role)
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
  IF v_uid IS NULL OR NOT public.crm_is_valid_permission_key(p_permission) THEN
    RETURN false;
  END IF;

  SELECT p.account_status, ur.role
  INTO v_status, v_role
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
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

  IF NOT FOUND OR v_role IS NULL OR public.normalize_crm_role(v_role) IS NULL OR v_status IS DISTINCT FROM 'active' THEN
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

  SELECT p.account_status, p.email, coalesce(p.full_name, p.display_name), ur.role
  INTO v_status, v_email, v_full_name, v_role
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
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

  IF NOT FOUND OR v_role IS NULL OR public.normalize_crm_role(v_role) IS NULL THEN
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
      'account_status', coalesce(v_status, 'revoked'),
      'is_active', false,
      'is_super_admin', false,
      'permissions', '[]'::jsonb,
      'effective_permissions', '[]'::jsonb,
      'overrides', '[]'::jsonb
    );
  END IF;

  IF v_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'authenticated', true,
      'user_id', v_uid,
      'email', v_email,
      'full_name', v_full_name,
      'role', v_role,
      'account_status', coalesce(v_status, 'revoked'),
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
      IF NOT public.crm_is_valid_permission_key(v_ov.permission_key) THEN
        CONTINUE;
      END IF;
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

-- Validates invitation status = 'pending' and expires_at > now() before activating profile
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
  v_has_role boolean := false;
  v_invite record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authenticated user email record not found');
  END IF;

  SELECT account_status INTO v_status
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND OR v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CRM staff profile not found');
  END IF;

  IF v_status IN ('deactivated', 'revoked') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Account is deactivated or revoked');
  END IF;

  IF v_status NOT IN ('invited', 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid account status');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND public.normalize_crm_role(ur.role) IS NOT NULL
  ) INTO v_has_role;

  IF NOT v_has_role THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No CRM staff role assigned to this account');
  END IF;

  IF v_status = 'invited' THEN
    UPDATE public.crm_invitations
    SET status = 'expired'
    WHERE lower(email) = v_email
      AND status = 'pending'
      AND expires_at <= now();

    SELECT id, role, expires_at
    INTO v_invite
    FROM public.crm_invitations
    WHERE lower(email) = v_email
      AND status = 'pending'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'No valid pending invitation found or your CRM invitation has expired.'
      );
    END IF;

    PERFORM set_config('app.crm_self_activate', 'true', true);

    UPDATE public.profiles
    SET
      account_status = 'active',
      activated_at = coalesce(activated_at, now()),
      last_login_at = now(),
      updated_at = now()
    WHERE id = v_uid;

    UPDATE public.crm_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = v_invite.id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_uid,
      'crm_invite_accepted',
      'profiles',
      v_uid,
      jsonb_build_object('email', v_email, 'invitation_id', v_invite.id, 'activated_at', now())
    );
  ELSE
    PERFORM set_config('app.crm_self_activate', 'true', true);

    UPDATE public.profiles
    SET last_login_at = now(), updated_at = now()
    WHERE id = v_uid AND account_status = 'active';
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
    OR public.has_crm_permission('entry:checkin_esports');
$$;

CREATE OR REPLACE FUNCTION public.is_content_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('event_info:edit')
    OR public.has_crm_permission('announcements:edit')
    OR public.has_crm_permission('gallery:edit')
    OR public.has_crm_permission('system_settings:manage');
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

CREATE OR REPLACE FUNCTION public.is_score_operator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('tournament:confirm_results')
    OR public.has_crm_permission('esports:edit');
$$;

CREATE OR REPLACE FUNCTION public.is_match_conductor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('conductor:view_assigned')
    OR public.has_crm_permission('conductor:submit_result');
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

CREATE OR REPLACE FUNCTION public._gate_has_perm(p_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE coalesce(public.has_crm_permission(p_perm), false)
  END;
$$;

CREATE OR REPLACE FUNCTION public._gate_is_entry_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE coalesce(public.is_entry_staff(), false)
  END;
$$;

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
    RETURN public.has_crm_permission('entry:checkin_visitor');
  ELSIF p_subject_type = 'esports_player' THEN
    RETURN public.has_crm_permission('entry:checkin_esports');
  ELSE
    RETURN public.has_crm_permission('entry:checkin_visitor')
        OR public.has_crm_permission('entry:checkin_esports');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._esports_has_perm(p_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE coalesce(public.has_crm_permission(p_perm), false)
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_crm_role(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.role_default_permissions(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crm_is_valid_permission_key(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_crm_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_crm_access() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_crm_invite() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_crm_login() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_entry_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_content_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_checkin_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_score_operator() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_match_conductor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_user_management_permission() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._gate_has_perm(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._gate_is_entry_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._can_perform_checkin(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._esports_has_perm(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_crm_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_crm_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_crm_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_crm_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_entry_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_content_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_checkin_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_score_operator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_match_conductor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_user_management_permission() TO authenticated;
GRANT EXECUTE ON FUNCTION public._gate_has_perm(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._gate_is_entry_staff() TO authenticated;
-- Matches RLS policy runs for anon & authenticated; _esports_has_perm returns false immediately when auth.uid() IS NULL
GRANT EXECUTE ON FUNCTION public._esports_has_perm(text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. Concurrency-Safe Database Guards (Self-Edit & Last-Super-Admin Lock)
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
    PERFORM pg_advisory_xact_lock(hashtext('crm_super_admin_guard'));

    SELECT account_status INTO v_target_status
    FROM public.profiles
    WHERE id = OLD.user_id
    FOR UPDATE;

    IF v_target_status = 'active' AND (TG_OP = 'DELETE' OR NEW.role <> 'super_admin') THEN
      SELECT count(DISTINCT ur.user_id) INTO v_active_super_count
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role = 'super_admin'
        AND p.account_status = 'active'
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

  IF NOT public.crm_is_valid_permission_key(NEW.permission_key) THEN
    RAISE EXCEPTION 'Invalid CRM permission key: %', NEW.permission_key USING ERRCODE = '22023';
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
      PERFORM pg_advisory_xact_lock(hashtext('crm_super_admin_guard'));

      SELECT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = OLD.id AND role = 'super_admin'
      ) INTO v_is_super;

      IF v_is_super THEN
        SELECT count(DISTINCT ur.user_id) INTO v_active_super_count
        FROM public.user_roles ur
        JOIN public.profiles p ON p.id = ur.user_id
        WHERE ur.role = 'super_admin'
          AND p.account_status = 'active'
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

  IF OLD.account_status = 'active' THEN
    PERFORM pg_advisory_xact_lock(hashtext('crm_super_admin_guard'));

    SELECT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = OLD.id AND role = 'super_admin'
    ) INTO v_is_super;

    IF v_is_super THEN
      SELECT count(DISTINCT ur.user_id) INTO v_active_super_count
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role = 'super_admin'
        AND p.account_status = 'active'
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
-- 6. Service-Role-Only Atomic CRM User Management RPCs
--    (Single-transaction role/permission/status/delete mutations with lock)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_admin_provision_user_tx(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text,
  p_mode text,
  p_overrides jsonb DEFAULT '[]'::jsonb,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_name text := trim(coalesce(p_full_name, ''));
  v_next_status text := CASE WHEN p_mode = 'direct' THEN 'active' ELSE 'invited' END;
  v_canonical_role text := public.normalize_crm_role(p_role);
  v_ov jsonb;
  v_perm_key text;
  v_allowed boolean;
  v_ov_count integer := 0;
BEGIN
  IF v_jwt_role <> 'service_role' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden: service_role required.' USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Actor and target user IDs are required.');
  END IF;
  IF v_canonical_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid CRM role specified.');
  END IF;
  IF p_mode NOT IN ('direct', 'invite') THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid provisioning mode.');
  END IF;
  IF v_clean_email = '' OR length(v_clean_name) NOT BETWEEN 2 AND 120 THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Valid email and full name (2-120 chars) required.');
  END IF;

  INSERT INTO public.profiles (
    id, email, full_name, display_name, account_status, invited_by, invited_at, activated_at, updated_at
  )
  VALUES (
    p_target_user_id,
    v_clean_email,
    v_clean_name,
    v_clean_name,
    v_next_status,
    p_actor_id,
    p_now,
    CASE WHEN p_mode = 'direct' THEN p_now ELSE NULL END,
    p_now
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    display_name = EXCLUDED.display_name,
    account_status = EXCLUDED.account_status,
    invited_by = EXCLUDED.invited_by,
    invited_at = EXCLUDED.invited_at,
    activated_at = EXCLUDED.activated_at,
    deactivated_at = NULL,
    revoked_at = NULL,
    updated_at = p_now;

  DELETE FROM public.user_roles WHERE user_id = p_target_user_id;
  INSERT INTO public.user_roles (user_id, role, assigned_by, updated_at)
  VALUES (p_target_user_id, p_role, p_actor_id, p_now);

  DELETE FROM public.crm_user_permissions WHERE user_id = p_target_user_id;

  IF v_canonical_role <> 'super_admin' AND p_overrides IS NOT NULL AND jsonb_typeof(p_overrides) = 'array' THEN
    FOR v_ov IN SELECT value FROM jsonb_array_elements(p_overrides)
    LOOP
      v_perm_key := trim(coalesce(v_ov->>'permission_key', ''));
      IF NOT public.crm_is_valid_permission_key(v_perm_key) THEN
        RAISE EXCEPTION 'Invalid CRM permission key: %', v_perm_key USING ERRCODE = '22023';
      END IF;
      v_allowed := coalesce((v_ov->>'allowed')::boolean, false);
      INSERT INTO public.crm_user_permissions (user_id, permission_key, allowed, updated_by, updated_at)
      VALUES (p_target_user_id, v_perm_key, v_allowed, p_actor_id, p_now)
      ON CONFLICT (user_id, permission_key) DO UPDATE SET
        allowed = EXCLUDED.allowed,
        updated_by = EXCLUDED.updated_by,
        updated_at = p_now;
      v_ov_count := v_ov_count + 1;
    END LOOP;
  END IF;

  UPDATE public.crm_invitations
  SET status = 'revoked'
  WHERE lower(email) = v_clean_email
    AND status = 'pending';

  IF p_mode = 'invite' THEN
    INSERT INTO public.crm_invitations (
      email, full_name, role, permission_overrides, status, invited_by, invited_at, created_at
    )
    VALUES (
      v_clean_email,
      v_clean_name,
      p_role,
      coalesce(p_overrides, '[]'::jsonb),
      'pending',
      p_actor_id,
      p_now,
      p_now
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_actor_id,
    CASE WHEN p_mode = 'direct' THEN 'crm_user_created' ELSE 'crm_user_invited' END,
    'user_roles',
    p_target_user_id,
    jsonb_build_object(
      'email', v_clean_email,
      'full_name', v_clean_name,
      'role', p_role,
      'mode', p_mode,
      'status', v_next_status,
      'overrides_count', v_ov_count
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'userId', p_target_user_id,
    'email', v_clean_email,
    'fullName', v_clean_name,
    'role', p_role,
    'mode', p_mode,
    'status', v_next_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_update_user_tx(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_update_name boolean DEFAULT false,
  p_role text DEFAULT NULL,
  p_update_role boolean DEFAULT false,
  p_overrides jsonb DEFAULT '[]'::jsonb,
  p_update_overrides boolean DEFAULT false,
  p_audit_action text DEFAULT 'crm_user_updated',
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_prof public.profiles%ROWTYPE;
  v_current_role text;
  v_next_role text;
  v_canonical_next text;
  v_clean_name text;
  v_active_super_count integer;
  v_ov jsonb;
  v_perm_key text;
  v_allowed boolean;
  v_result_overrides jsonb := '[]'::jsonb;
BEGIN
  IF v_jwt_role <> 'service_role' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden: service_role required.' USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Actor and target user IDs are required.');
  END IF;
  IF p_actor_id = p_target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'status', 403, 'error', 'Security policy violation: You cannot modify your own account.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('crm_super_admin_guard'));

  SELECT * INTO v_prof
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_prof.account_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 404, 'error', 'Target user is not a confirmed CRM staff account.');
  END IF;

  SELECT ur.role INTO v_current_role
  FROM public.user_roles ur
  WHERE ur.user_id = p_target_user_id
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
  LIMIT 1
  FOR UPDATE;

  IF v_current_role IS NULL OR public.normalize_crm_role(v_current_role) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 404, 'error', 'Target user has no confirmed CRM staff role.');
  END IF;

  v_next_role := CASE WHEN p_update_role THEN trim(coalesce(p_role, '')) ELSE v_current_role END;
  v_canonical_next := public.normalize_crm_role(v_next_role);
  IF v_canonical_next IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid CRM role specified.');
  END IF;

  IF p_update_name THEN
    v_clean_name := trim(coalesce(p_full_name, ''));
    IF length(v_clean_name) NOT BETWEEN 2 AND 120 THEN
      RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Full name must be between 2 and 120 characters.');
    END IF;
  ELSE
    v_clean_name := v_prof.full_name;
  END IF;

  IF v_prof.account_status = 'active'
     AND public.normalize_crm_role(v_current_role) = 'super_admin'
     AND v_canonical_next <> 'super_admin' THEN
    SELECT count(DISTINCT ur.user_id) INTO v_active_super_count
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'super_admin'
      AND p.account_status = 'active'
      AND ur.user_id <> p_target_user_id;

    IF v_active_super_count < 1 THEN
      RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'Cannot demote the last active Super Admin.');
    END IF;
  END IF;

  IF p_update_name THEN
    UPDATE public.profiles
    SET
      full_name = v_clean_name,
      display_name = v_clean_name,
      updated_at = p_now
    WHERE id = p_target_user_id;
  END IF;

  IF p_update_role AND v_next_role IS DISTINCT FROM v_current_role THEN
    DELETE FROM public.user_roles WHERE user_id = p_target_user_id;
    INSERT INTO public.user_roles (user_id, role, assigned_by, updated_at)
    VALUES (p_target_user_id, v_next_role, p_actor_id, p_now);
  END IF;

  IF p_update_overrides OR v_canonical_next = 'super_admin' THEN
    DELETE FROM public.crm_user_permissions WHERE user_id = p_target_user_id;
    IF v_canonical_next <> 'super_admin' AND p_overrides IS NOT NULL AND jsonb_typeof(p_overrides) = 'array' THEN
      FOR v_ov IN SELECT value FROM jsonb_array_elements(p_overrides)
      LOOP
        v_perm_key := trim(coalesce(v_ov->>'permission_key', ''));
        IF NOT public.crm_is_valid_permission_key(v_perm_key) THEN
          RAISE EXCEPTION 'Invalid CRM permission key: %', v_perm_key USING ERRCODE = '22023';
        END IF;
        v_allowed := coalesce((v_ov->>'allowed')::boolean, false);
        INSERT INTO public.crm_user_permissions (user_id, permission_key, allowed, updated_by, updated_at)
        VALUES (p_target_user_id, v_perm_key, v_allowed, p_actor_id, p_now)
        ON CONFLICT (user_id, permission_key) DO UPDATE SET
          allowed = EXCLUDED.allowed,
          updated_by = EXCLUDED.updated_by,
          updated_at = p_now;
      END LOOP;
    END IF;
  END IF;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object('permission_key', cup.permission_key, 'allowed', cup.allowed) ORDER BY cup.permission_key),
    '[]'::jsonb
  )
  INTO v_result_overrides
  FROM public.crm_user_permissions cup
  WHERE cup.user_id = p_target_user_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_actor_id,
    coalesce(nullif(trim(p_audit_action), ''), 'crm_user_updated'),
    'profiles',
    p_target_user_id,
    jsonb_build_object(
      'full_name', v_clean_name,
      'previous_role', v_current_role,
      'next_role', v_next_role,
      'overrides', v_result_overrides
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'userId', p_target_user_id,
    'fullName', v_clean_name,
    'role', v_next_role,
    'overrides', v_result_overrides
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_update_status_tx(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_next_status text,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_prof public.profiles%ROWTYPE;
  v_current_role text;
  v_active_super_count integer;
BEGIN
  IF v_jwt_role <> 'service_role' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden: service_role required.' USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Actor and target user IDs are required.');
  END IF;
  IF p_actor_id = p_target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'status', 403, 'error', 'Security policy violation: You cannot deactivate or revoke your own account.');
  END IF;
  IF p_next_status NOT IN ('invited', 'active', 'deactivated', 'revoked') THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Invalid account status.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('crm_super_admin_guard'));

  SELECT * INTO v_prof
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_prof.account_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 404, 'error', 'Target user is not a confirmed CRM staff account.');
  END IF;

  SELECT ur.role INTO v_current_role
  FROM public.user_roles ur
  WHERE ur.user_id = p_target_user_id
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
  LIMIT 1
  FOR UPDATE;

  IF v_current_role IS NULL OR public.normalize_crm_role(v_current_role) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 404, 'error', 'Target user has no confirmed CRM staff role.');
  END IF;

  IF v_prof.account_status = 'active'
     AND p_next_status <> 'active'
     AND public.normalize_crm_role(v_current_role) = 'super_admin' THEN
    SELECT count(DISTINCT ur.user_id) INTO v_active_super_count
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'super_admin'
      AND p.account_status = 'active'
      AND ur.user_id <> p_target_user_id;

    IF v_active_super_count < 1 THEN
      RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'Cannot deactivate or revoke the last active Super Admin.');
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    account_status = p_next_status,
    deactivated_at = CASE
      WHEN p_next_status = 'deactivated' THEN p_now
      WHEN p_next_status = 'active' THEN NULL
      ELSE deactivated_at
    END,
    revoked_at = CASE
      WHEN p_next_status = 'revoked' THEN p_now
      ELSE revoked_at
    END,
    activated_at = CASE
      WHEN p_next_status = 'active' THEN p_now
      ELSE activated_at
    END,
    updated_at = p_now
  WHERE id = p_target_user_id;

  IF p_next_status = 'revoked' AND v_prof.email IS NOT NULL THEN
    UPDATE public.crm_invitations
    SET status = 'revoked'
    WHERE lower(email) = lower(v_prof.email)
      AND status = 'pending';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_actor_id,
    'crm_user_status_' || p_next_status,
    'profiles',
    p_target_user_id,
    jsonb_build_object(
      'email', v_prof.email,
      'previous_status', v_prof.account_status,
      'next_status', p_next_status,
      'updated_at', p_now
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'userId', p_target_user_id,
    'email', v_prof.email,
    'accountStatus', p_next_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_admin_delete_user_tx(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_prof public.profiles%ROWTYPE;
  v_roles text[];
  v_active_super_count integer;
BEGIN
  IF v_jwt_role <> 'service_role' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden: service_role required.' USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', 'Actor and target user IDs are required.');
  END IF;
  IF p_actor_id = p_target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'status', 403, 'error', 'Security policy violation: You cannot permanently delete your own account.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('crm_super_admin_guard'));

  SELECT * INTO v_prof
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_prof.account_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 404, 'error', 'Target user is not a confirmed CRM staff account.');
  END IF;

  SELECT array_agg(ur.role) INTO v_roles
  FROM public.user_roles ur
  WHERE ur.user_id = p_target_user_id;

  IF v_roles IS NULL OR array_length(v_roles, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'status', 404, 'error', 'Target user has no confirmed CRM staff role.');
  END IF;

  IF v_prof.account_status = 'active' AND 'super_admin' = ANY(v_roles) THEN
    SELECT count(DISTINCT ur.user_id) INTO v_active_super_count
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'super_admin'
      AND p.account_status = 'active'
      AND ur.user_id <> p_target_user_id;

    IF v_active_super_count < 1 THEN
      RETURN jsonb_build_object('ok', false, 'status', 409, 'error', 'Cannot permanently delete the last active Super Admin.');
    END IF;
  END IF;

  IF v_prof.email IS NOT NULL THEN
    UPDATE public.crm_invitations
    SET status = 'revoked'
    WHERE lower(email) = lower(v_prof.email)
      AND status = 'pending';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_actor_id,
    'crm_user_deleted',
    'profiles',
    p_target_user_id,
    jsonb_build_object(
      'deleted_user_id', p_target_user_id,
      'deleted_email', v_prof.email,
      'deleted_name', coalesce(v_prof.full_name, v_prof.display_name),
      'deleted_roles', v_roles,
      'deleted_at', p_now,
      'historical_data_preserved', true
    )
  );

  DELETE FROM public.crm_user_permissions WHERE user_id = p_target_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_target_user_id;
  DELETE FROM public.profiles WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deletedUserId', p_target_user_id,
    'email', v_prof.email,
    'deletedRoles', v_roles
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_admin_provision_user_tx(uuid, uuid, text, text, text, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_update_user_tx(uuid, uuid, text, boolean, text, boolean, jsonb, boolean, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_update_status_tx(uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_admin_delete_user_tx(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.crm_admin_provision_user_tx(uuid, uuid, text, text, text, text, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_admin_update_user_tx(uuid, uuid, text, boolean, text, boolean, jsonb, boolean, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_admin_update_status_tx(uuid, uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_admin_delete_user_tx(uuid, uuid, timestamptz) TO service_role;

-- ------------------------------------------------------------------------------
-- 7. Individually Reviewed Staff-Reference FKs (Preserve Historical Records)
--    ONLY updates the 7 legacy nullable operational metadata columns originally
--    defined without ON DELETE SET NULL so permanent staff deletion does not
--    fail with FK 23503. Leaves audit_logs and all other FKs untouched.
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
      AND att.attnotnull = false
      AND c.confdeltype IN ('a', 'r')
      AND (rel.relname, att.attname) IN (
        ('event_settings', 'updated_by'),
        ('site_content', 'updated_by'),
        ('announcements', 'author_id'),
        ('check_ins', 'checked_in_by'),
        ('registration_controls', 'updated_by'),
        ('institutions', 'updated_by'),
        ('media_items', 'created_by')
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
-- 8. Explicit Anon Revocation & Permission-Scoped RLS Across All Tables
--    Ensures restricted is_admin() and fail-closed permission checks lock down
--    every table cleanly for active staff while blocking deactivated/viewer users.
-- ------------------------------------------------------------------------------
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.crm_user_permissions FROM anon;
REVOKE ALL ON public.crm_invitations FROM anon;

GRANT SELECT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- profiles
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
  OR (
    (
      public.has_crm_permission('tournament:assign_conductors')
      OR public.has_crm_permission('tournament:manage_games')
      OR public.has_crm_permission('esports:edit')
    )
    AND account_status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur_ops
      WHERE ur_ops.user_id = public.profiles.id
        AND ur_ops.role IN ('match_conductor', 'esports_manager', 'crm_admin', 'event_admin', 'super_admin')
    )
  )
);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "super_admin_update_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_rbac" ON public.profiles;
CREATE POLICY "profiles_update_rbac"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  (id = (select auth.uid()) AND account_status = 'active')
  OR public.is_super_admin()
)
WITH CHECK (
  (id = (select auth.uid()) AND account_status = 'active')
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "profiles_delete_rbac" ON public.profiles;
CREATE POLICY "profiles_delete_rbac"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_super_admin() AND id <> (select auth.uid()));

-- user_roles
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
  OR (
    (
      public.has_crm_permission('tournament:assign_conductors')
      OR public.has_crm_permission('tournament:manage_games')
      OR public.has_crm_permission('esports:edit')
    )
    AND role IN ('match_conductor', 'esports_manager', 'crm_admin', 'event_admin', 'super_admin')
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

-- crm_user_permissions
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

-- crm_invitations
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

-- Gate, Tickets, Registrations, Players, Content, Settings, Emails & Audit RLS
DO $$
BEGIN
  -- visitor_registrations
  IF to_regclass('public.visitor_registrations') IS NOT NULL THEN
    REVOKE SELECT, UPDATE, DELETE ON public.visitor_registrations FROM anon;
    GRANT INSERT ON public.visitor_registrations TO anon, authenticated;

    DROP POLICY IF EXISTS "staff_read_visitor_registrations_gate" ON public.visitor_registrations;
    DROP POLICY IF EXISTS "admin_read_visitor_registrations" ON public.visitor_registrations;
    CREATE POLICY "admin_read_visitor_registrations"
    ON public.visitor_registrations FOR SELECT
    TO authenticated
    USING (
      public.has_crm_permission('visitor:view')
      OR public.has_crm_permission('entry:scan_visitor')
      OR public.has_crm_permission('entry:checkin_visitor')
      OR public.has_crm_permission('reports:view')
    );

    DROP POLICY IF EXISTS "admin_update_visitor_registrations" ON public.visitor_registrations;
    CREATE POLICY "admin_update_visitor_registrations"
    ON public.visitor_registrations FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('visitor:edit') OR public.has_crm_permission('entry:checkin_visitor'))
    WITH CHECK (public.has_crm_permission('visitor:edit') OR public.has_crm_permission('entry:checkin_visitor'));

    DROP POLICY IF EXISTS "admin_delete_visitor_registrations" ON public.visitor_registrations;
    CREATE POLICY "admin_delete_visitor_registrations"
    ON public.visitor_registrations FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('visitor:delete'));
  END IF;

  -- participation_registrations (legacy historical table if present)
  IF to_regclass('public.participation_registrations') IS NOT NULL THEN
    REVOKE SELECT, UPDATE, DELETE ON public.participation_registrations FROM anon;

    DROP POLICY IF EXISTS "admin_read_participation_registrations" ON public.participation_registrations;
    CREATE POLICY "admin_read_participation_registrations"
    ON public.participation_registrations FOR SELECT
    TO authenticated
    USING (public.is_admin() OR public.has_crm_permission('reports:view'));

    DROP POLICY IF EXISTS "admin_update_participation_registrations" ON public.participation_registrations;
    CREATE POLICY "admin_update_participation_registrations"
    ON public.participation_registrations FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

    DROP POLICY IF EXISTS "admin_delete_participation_registrations" ON public.participation_registrations;
    CREATE POLICY "admin_delete_participation_registrations"
    ON public.participation_registrations FOR DELETE
    TO authenticated
    USING (public.is_admin());
  END IF;

  -- registrations (Esports teams)
  IF to_regclass('public.registrations') IS NOT NULL THEN
    REVOKE SELECT, UPDATE, DELETE ON public.registrations FROM anon;
    GRANT INSERT ON public.registrations TO anon, authenticated;

    DROP POLICY IF EXISTS "staff_read_registrations_gate" ON public.registrations;
    DROP POLICY IF EXISTS "admin_read_registrations" ON public.registrations;
    CREATE POLICY "admin_read_registrations"
    ON public.registrations FOR SELECT
    TO authenticated
    USING (
      public.has_crm_permission('esports:view')
      OR public.has_crm_permission('entry:scan_esports')
      OR public.has_crm_permission('entry:checkin_esports')
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

    DROP POLICY IF EXISTS "admin_delete_registrations" ON public.registrations;
    CREATE POLICY "admin_delete_registrations"
    ON public.registrations FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('esports:edit'));
  END IF;

  -- players
  IF to_regclass('public.players') IS NOT NULL THEN
    REVOKE ALL ON public.players FROM anon;

    DROP POLICY IF EXISTS "staff_read_players_gate" ON public.players;
    DROP POLICY IF EXISTS "admin_read_players" ON public.players;
    CREATE POLICY "admin_read_players"
    ON public.players FOR SELECT
    TO authenticated
    USING (
      public.has_crm_permission('esports:view')
      OR public.has_crm_permission('entry:scan_esports')
      OR public.has_crm_permission('entry:checkin_esports')
      OR public.has_crm_permission('conductor:verify_roster')
      OR public.has_crm_permission('reports:view')
    );

    DROP POLICY IF EXISTS "admin_insert_player" ON public.players;
    CREATE POLICY "admin_insert_player"
    ON public.players FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('esports:create') OR public.has_crm_permission('esports:edit'));

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

    DROP POLICY IF EXISTS "admin_delete_player" ON public.players;
    CREATE POLICY "admin_delete_player"
    ON public.players FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('esports:edit'));
  END IF;

  -- tickets
  IF to_regclass('public.tickets') IS NOT NULL THEN
    REVOKE ALL ON public.tickets FROM anon;

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

  -- check_ins
  IF to_regclass('public.check_ins') IS NOT NULL THEN
    REVOKE ALL ON public.check_ins FROM anon;

    DROP POLICY IF EXISTS "checkin_staff_read_check_ins" ON public.check_ins;
    DROP POLICY IF EXISTS "admin_read_checkins" ON public.check_ins;
    CREATE POLICY "admin_read_checkins"
    ON public.check_ins FOR SELECT
    TO authenticated
    USING (
      public.is_entry_staff()
      OR public.has_crm_permission('visitor:view')
      OR public.has_crm_permission('esports:view')
      OR public.has_crm_permission('reports:view')
    );

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

    DROP POLICY IF EXISTS "admin_delete_checkin" ON public.check_ins;
    CREATE POLICY "admin_delete_checkin"
    ON public.check_ins FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('visitor:delete') OR public.has_crm_permission('entry:override_checkin'));
  END IF;

  -- wristband_categories
  IF to_regclass('public.wristband_categories') IS NOT NULL THEN
    DROP POLICY IF EXISTS "wristband_categories_select" ON public.wristband_categories;
    DROP POLICY IF EXISTS "staff_read_wristband_categories" ON public.wristband_categories;
    CREATE POLICY "staff_read_wristband_categories"
    ON public.wristband_categories FOR SELECT
    TO authenticated
    USING (
      public.is_entry_staff()
      OR public.has_crm_permission('entry:manage_wristbands')
      OR public.has_crm_permission('reports:view')
    );

    DROP POLICY IF EXISTS "wristband_categories_manage" ON public.wristband_categories;
    DROP POLICY IF EXISTS "admin_manage_wristband_categories" ON public.wristband_categories;
    CREATE POLICY "admin_manage_wristband_categories"
    ON public.wristband_categories FOR ALL
    TO authenticated
    USING (public.has_crm_permission('entry:manage_wristbands'))
    WITH CHECK (public.has_crm_permission('entry:manage_wristbands'));
  END IF;

  -- wristband_issuances
  IF to_regclass('public.wristband_issuances') IS NOT NULL THEN
    DROP POLICY IF EXISTS "wristband_issuances_select" ON public.wristband_issuances;
    DROP POLICY IF EXISTS "staff_read_wristband_issuances" ON public.wristband_issuances;
    CREATE POLICY "staff_read_wristband_issuances"
    ON public.wristband_issuances FOR SELECT
    TO authenticated
    USING (
      public.is_entry_staff()
      OR public.has_crm_permission('reports:view')
    );

    DROP POLICY IF EXISTS "wristband_issuances_insert" ON public.wristband_issuances;
    DROP POLICY IF EXISTS "staff_write_wristband_issuances" ON public.wristband_issuances;
    CREATE POLICY "staff_write_wristband_issuances"
    ON public.wristband_issuances FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('entry:issue_wristband'));

    DROP POLICY IF EXISTS "wristband_issuances_update" ON public.wristband_issuances;
    DROP POLICY IF EXISTS "staff_update_wristband_issuances" ON public.wristband_issuances;
    CREATE POLICY "staff_update_wristband_issuances"
    ON public.wristband_issuances FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('entry:issue_wristband'))
    WITH CHECK (public.has_crm_permission('entry:issue_wristband'));
  END IF;

  -- announcements
  IF to_regclass('public.announcements') IS NOT NULL THEN
    DROP POLICY IF EXISTS "public_read_published_announcements" ON public.announcements;
    DROP POLICY IF EXISTS "admin_read_all_announcements" ON public.announcements;
    DROP POLICY IF EXISTS "announcements_select_policy" ON public.announcements;
    CREATE POLICY "announcements_select_policy"
    ON public.announcements FOR SELECT
    TO anon, authenticated
    USING (is_published = true OR (auth.role() = 'authenticated' AND public.has_crm_permission('announcements:view')));

    DROP POLICY IF EXISTS "admin_insert_announcement" ON public.announcements;
    CREATE POLICY "admin_insert_announcement"
    ON public.announcements FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('announcements:create'));

    DROP POLICY IF EXISTS "admin_update_announcement" ON public.announcements;
    CREATE POLICY "admin_update_announcement"
    ON public.announcements FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('announcements:edit') OR public.has_crm_permission('announcements:publish'))
    WITH CHECK (public.has_crm_permission('announcements:edit') OR public.has_crm_permission('announcements:publish'));

    DROP POLICY IF EXISTS "admin_delete_announcement" ON public.announcements;
    CREATE POLICY "admin_delete_announcement"
    ON public.announcements FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('announcements:delete'));
  END IF;

  -- gallery_items
  IF to_regclass('public.gallery_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "public_read_published_gallery" ON public.gallery_items;
    DROP POLICY IF EXISTS "admin_read_all_gallery" ON public.gallery_items;
    DROP POLICY IF EXISTS "gallery_items_select_policy" ON public.gallery_items;
    CREATE POLICY "gallery_items_select_policy"
    ON public.gallery_items FOR SELECT
    TO anon, authenticated
    USING (is_published = true OR (auth.role() = 'authenticated' AND public.has_crm_permission('gallery:view')));

    DROP POLICY IF EXISTS "admin_insert_gallery" ON public.gallery_items;
    CREATE POLICY "admin_insert_gallery"
    ON public.gallery_items FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('gallery:upload'));

    DROP POLICY IF EXISTS "admin_update_gallery" ON public.gallery_items;
    CREATE POLICY "admin_update_gallery"
    ON public.gallery_items FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('gallery:edit'))
    WITH CHECK (public.has_crm_permission('gallery:edit'));

    DROP POLICY IF EXISTS "admin_delete_gallery" ON public.gallery_items;
    CREATE POLICY "admin_delete_gallery"
    ON public.gallery_items FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('gallery:delete'));
  END IF;

  -- site_content
  IF to_regclass('public.site_content') IS NOT NULL THEN
    DROP POLICY IF EXISTS "public_read_published_content" ON public.site_content;
    DROP POLICY IF EXISTS "admin_read_all_content" ON public.site_content;
    DROP POLICY IF EXISTS "site_content_select_policy" ON public.site_content;
    CREATE POLICY "site_content_select_policy"
    ON public.site_content FOR SELECT
    TO anon, authenticated
    USING (is_published = true OR (auth.role() = 'authenticated' AND public.has_crm_permission('event_info:view')));

    DROP POLICY IF EXISTS "admin_insert_content" ON public.site_content;
    CREATE POLICY "admin_insert_content"
    ON public.site_content FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('event_info:create'));

    DROP POLICY IF EXISTS "admin_update_content" ON public.site_content;
    CREATE POLICY "admin_update_content"
    ON public.site_content FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:publish'))
    WITH CHECK (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:publish'));

    DROP POLICY IF EXISTS "admin_delete_content" ON public.site_content;
    CREATE POLICY "admin_delete_content"
    ON public.site_content FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('event_info:edit'));
  END IF;

  -- schedule_items
  IF to_regclass('public.schedule_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "public_read_published_schedule" ON public.schedule_items;
    DROP POLICY IF EXISTS "admin_read_all_schedule" ON public.schedule_items;
    DROP POLICY IF EXISTS "schedule_items_select_policy" ON public.schedule_items;
    CREATE POLICY "schedule_items_select_policy"
    ON public.schedule_items FOR SELECT
    TO anon, authenticated
    USING (is_published = true OR (auth.role() = 'authenticated' AND public.has_crm_permission('event_info:view')));

    DROP POLICY IF EXISTS "admin_insert_schedule" ON public.schedule_items;
    CREATE POLICY "admin_insert_schedule"
    ON public.schedule_items FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('event_info:create'));

    DROP POLICY IF EXISTS "admin_update_schedule" ON public.schedule_items;
    CREATE POLICY "admin_update_schedule"
    ON public.schedule_items FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:publish'))
    WITH CHECK (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:publish'));

    DROP POLICY IF EXISTS "admin_delete_schedule" ON public.schedule_items;
    CREATE POLICY "admin_delete_schedule"
    ON public.schedule_items FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('event_info:edit'));
  END IF;

  -- faq_items
  IF to_regclass('public.faq_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "public_read_published_faqs" ON public.faq_items;
    DROP POLICY IF EXISTS "admin_read_all_faqs" ON public.faq_items;
    DROP POLICY IF EXISTS "faq_items_select_policy" ON public.faq_items;
    CREATE POLICY "faq_items_select_policy"
    ON public.faq_items FOR SELECT
    TO anon, authenticated
    USING (is_published = true OR (auth.role() = 'authenticated' AND public.has_crm_permission('event_info:view')));

    DROP POLICY IF EXISTS "admin_insert_faq" ON public.faq_items;
    CREATE POLICY "admin_insert_faq"
    ON public.faq_items FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('event_info:create'));

    DROP POLICY IF EXISTS "admin_update_faq" ON public.faq_items;
    CREATE POLICY "admin_update_faq"
    ON public.faq_items FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:publish'))
    WITH CHECK (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:publish'));

    DROP POLICY IF EXISTS "admin_delete_faq" ON public.faq_items;
    CREATE POLICY "admin_delete_faq"
    ON public.faq_items FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('event_info:edit'));
  END IF;

  -- sponsors
  IF to_regclass('public.sponsors') IS NOT NULL THEN
    DROP POLICY IF EXISTS "public_read_published_sponsors" ON public.sponsors;
    DROP POLICY IF EXISTS "admin_read_all_sponsors" ON public.sponsors;
    DROP POLICY IF EXISTS "sponsors_select_policy" ON public.sponsors;
    CREATE POLICY "sponsors_select_policy"
    ON public.sponsors FOR SELECT
    TO anon, authenticated
    USING (is_published = true OR (auth.role() = 'authenticated' AND public.has_crm_permission('event_info:view')));

    DROP POLICY IF EXISTS "admin_insert_sponsor" ON public.sponsors;
    CREATE POLICY "admin_insert_sponsor"
    ON public.sponsors FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('event_info:create'));

    DROP POLICY IF EXISTS "admin_update_sponsor" ON public.sponsors;
    CREATE POLICY "admin_update_sponsor"
    ON public.sponsors FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:publish'))
    WITH CHECK (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:publish'));

    DROP POLICY IF EXISTS "admin_delete_sponsor" ON public.sponsors;
    CREATE POLICY "admin_delete_sponsor"
    ON public.sponsors FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('event_info:edit'));
  END IF;

  -- games
  IF to_regclass('public.games') IS NOT NULL THEN
    DROP POLICY IF EXISTS "public_read_published_games" ON public.games;
    DROP POLICY IF EXISTS "admin_read_all_games" ON public.games;
    DROP POLICY IF EXISTS "anon_read_open_games" ON public.games;
    DROP POLICY IF EXISTS "games_select_policy" ON public.games;
    CREATE POLICY "games_select_policy"
    ON public.games FOR SELECT
    TO anon, authenticated
    USING (
      (is_published = true AND is_active = true)
      OR (
        auth.role() = 'authenticated'
        AND (
          public.has_crm_permission('event_info:view')
          OR public.has_crm_permission('esports:view')
          OR public.has_crm_permission('tournament:manage_games')
        )
      )
    );

    DROP POLICY IF EXISTS "admin_insert_game" ON public.games;
    CREATE POLICY "admin_insert_game"
    ON public.games FOR INSERT
    TO authenticated
    WITH CHECK (
      public.has_crm_permission('event_info:create')
      OR public.has_crm_permission('tournament:manage_games')
      OR public.has_crm_permission('esports:edit')
    );

    DROP POLICY IF EXISTS "admin_update_game" ON public.games;
    DROP POLICY IF EXISTS "admin_update_games_rbac" ON public.games;
    CREATE POLICY "admin_update_games_rbac"
    ON public.games FOR UPDATE
    TO authenticated
    USING (
      public.has_crm_permission('event_info:edit')
      OR public.has_crm_permission('tournament:manage_games')
      OR public.has_crm_permission('esports:edit')
      OR public.has_crm_permission('system_settings:manage')
    )
    WITH CHECK (
      public.has_crm_permission('event_info:edit')
      OR public.has_crm_permission('tournament:manage_games')
      OR public.has_crm_permission('esports:edit')
      OR public.has_crm_permission('system_settings:manage')
    );

    DROP POLICY IF EXISTS "admin_delete_game" ON public.games;
    CREATE POLICY "admin_delete_game"
    ON public.games FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('tournament:manage_games'));
  END IF;

  -- institutions
  IF to_regclass('public.institutions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admin_manage_institutions" ON public.institutions;
    DROP POLICY IF EXISTS "institutions_admin_write" ON public.institutions;
    CREATE POLICY "institutions_admin_write"
    ON public.institutions FOR ALL
    TO authenticated
    USING (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:create'))
    WITH CHECK (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:create'));
  END IF;

  -- event_settings
  IF to_regclass('public.event_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "public_read_published_settings" ON public.event_settings;
    DROP POLICY IF EXISTS "admin_read_all_settings" ON public.event_settings;
    DROP POLICY IF EXISTS "event_settings_select_policy" ON public.event_settings;
    CREATE POLICY "event_settings_select_policy"
    ON public.event_settings FOR SELECT
    TO anon, authenticated
    USING (
      is_published = true
      OR (
        auth.role() = 'authenticated'
        AND (public.has_crm_permission('system_settings:view') OR public.has_crm_permission('social_links:view'))
      )
    );

    DROP POLICY IF EXISTS "admin_insert_settings" ON public.event_settings;
    CREATE POLICY "admin_insert_settings"
    ON public.event_settings FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('system_settings:manage'));

    DROP POLICY IF EXISTS "admin_update_settings" ON public.event_settings;
    CREATE POLICY "admin_update_settings"
    ON public.event_settings FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('system_settings:manage') OR (category = 'social' AND public.has_crm_permission('social_links:edit')))
    WITH CHECK (public.has_crm_permission('system_settings:manage') OR (category = 'social' AND public.has_crm_permission('social_links:edit')));

    DROP POLICY IF EXISTS "admin_delete_settings" ON public.event_settings;
    CREATE POLICY "admin_delete_settings"
    ON public.event_settings FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('system_settings:manage'));
  END IF;

  -- registration_controls
  IF to_regclass('public.registration_controls') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admin_update_registration_controls" ON public.registration_controls;
    CREATE POLICY "admin_update_registration_controls"
    ON public.registration_controls FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('system_settings:manage'))
    WITH CHECK (public.has_crm_permission('system_settings:manage'));
  END IF;

  -- crm_emails
  IF to_regclass('public.crm_emails') IS NOT NULL THEN
    REVOKE ALL ON public.crm_emails FROM anon;

    DROP POLICY IF EXISTS "Admins can view CRM emails" ON public.crm_emails;
    CREATE POLICY "Admins can view CRM emails"
    ON public.crm_emails FOR SELECT
    TO authenticated
    USING (public.has_crm_permission('email_centre:view'));

    DROP POLICY IF EXISTS "Admins can insert CRM emails" ON public.crm_emails;
    CREATE POLICY "Admins can insert CRM emails"
    ON public.crm_emails FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('email_centre:send') OR public.has_crm_permission('email_centre:resend'));

    DROP POLICY IF EXISTS "Admins can update CRM emails" ON public.crm_emails;
    CREATE POLICY "Admins can update CRM emails"
    ON public.crm_emails FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('email_centre:send') OR public.has_crm_permission('email_centre:resend'))
    WITH CHECK (public.has_crm_permission('email_centre:send') OR public.has_crm_permission('email_centre:resend'));
  END IF;

  -- audit_logs: only system_settings:view (plus esports match/tournament audit timeline) may SELECT;
  -- only active admins or active operational staff with export/checkin/esports-edit may INSERT with actor_id = auth.uid()
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    REVOKE ALL ON public.audit_logs FROM anon;
    GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

    DROP POLICY IF EXISTS "admin_read_audit_logs" ON public.audit_logs;
    CREATE POLICY "admin_read_audit_logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (
      public.has_crm_permission('system_settings:view')
      OR (
        entity_type IN ('matches', 'tournaments')
        AND (
          public.has_crm_permission('tournament:confirm_results')
          OR public.has_crm_permission('esports:view')
        )
      )
    );

    DROP POLICY IF EXISTS "admin_insert_audit_log" ON public.audit_logs;
    CREATE POLICY "admin_insert_audit_log"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (
      actor_id = (select auth.uid())
      AND (
        public.is_admin()
        OR public.has_crm_permission('entry:checkin_visitor')
        OR public.has_crm_permission('entry:checkin_esports')
        OR public.has_crm_permission('visitor:export')
        OR public.has_crm_permission('esports:export')
        OR public.has_crm_permission('reports:export')
        OR public.has_crm_permission('esports:edit')
      )
    );
  END IF;

  -- media_items
  IF to_regclass('public.media_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admin_insert_media_items" ON public.media_items;
    CREATE POLICY "admin_insert_media_items"
    ON public.media_items FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('gallery:upload'));

    DROP POLICY IF EXISTS "admin_update_media_items" ON public.media_items;
    CREATE POLICY "admin_update_media_items"
    ON public.media_items FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('gallery:edit'))
    WITH CHECK (public.has_crm_permission('gallery:edit'));

    DROP POLICY IF EXISTS "admin_delete_media_items" ON public.media_items;
    CREATE POLICY "admin_delete_media_items"
    ON public.media_items FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('gallery:delete'));
  END IF;

  -- form_options
  IF to_regclass('public.form_options') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admin_insert_form_options" ON public.form_options;
    CREATE POLICY "admin_insert_form_options"
    ON public.form_options FOR INSERT
    TO authenticated
    WITH CHECK (public.has_crm_permission('system_settings:manage'));

    DROP POLICY IF EXISTS "admin_update_form_options" ON public.form_options;
    CREATE POLICY "admin_update_form_options"
    ON public.form_options FOR UPDATE
    TO authenticated
    USING (public.has_crm_permission('system_settings:manage'))
    WITH CHECK (public.has_crm_permission('system_settings:manage'));

    DROP POLICY IF EXISTS "admin_delete_form_options" ON public.form_options;
    CREATE POLICY "admin_delete_form_options"
    ON public.form_options FOR DELETE
    TO authenticated
    USING (public.has_crm_permission('system_settings:manage'));
  END IF;

  -- nas_archives
  IF to_regclass('public.nas_archives') IS NOT NULL THEN
    REVOKE ALL ON public.nas_archives FROM anon;
    DROP POLICY IF EXISTS "Admins can view and manage nas_archives" ON public.nas_archives;
    CREATE POLICY "Admins can view and manage nas_archives"
    ON public.nas_archives FOR ALL
    TO authenticated
    USING (
      public.has_crm_permission('email_centre:view')
      OR public.has_crm_permission('reports:view')
      OR public.has_crm_permission('visitor:export')
      OR public.has_crm_permission('esports:export')
    )
    WITH CHECK (
      public.has_crm_permission('email_centre:send')
      OR public.has_crm_permission('system_settings:manage')
    );
  END IF;

  -- storage.objects policies for site-media bucket
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admin_upload_site_media" ON storage.objects;
    CREATE POLICY "admin_upload_site_media"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'site-media' AND public.has_crm_permission('gallery:upload'));

    DROP POLICY IF EXISTS "admin_update_site_media" ON storage.objects;
    CREATE POLICY "admin_update_site_media"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'site-media' AND public.has_crm_permission('gallery:edit'))
    WITH CHECK (bucket_id = 'site-media' AND public.has_crm_permission('gallery:edit'));

    DROP POLICY IF EXISTS "admin_delete_site_media" ON storage.objects;
    CREATE POLICY "admin_delete_site_media"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'site-media' AND public.has_crm_permission('gallery:delete'));
  END IF;
END $$;

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

COMMIT;
