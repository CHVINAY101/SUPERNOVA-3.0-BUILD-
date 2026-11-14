-- ==============================================================================
-- SUPERNOVA 3.0 — CRM ROLE-BASED ACCESS CONTROL (RBAC), USER MANAGEMENT,
-- AND EMAIL AUDIT LOG HARDENING
-- Migration: 20261113000000_crm_rbac_and_user_management.sql
-- Idempotent: Safe to run multiple times on existing or partial deployments.
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

-- Backfill existing profiles from auth.users for existing administrators
INSERT INTO public.profiles (id, email, full_name, account_status, activated_at)
SELECT
  u.id,
  lower(u.email),
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  'active',
  coalesce(u.last_sign_in_at, now())
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = coalesce(public.profiles.email, EXCLUDED.email),
  full_name = coalesce(public.profiles.full_name, EXCLUDED.full_name),
  last_login_at = coalesce(public.profiles.last_login_at, (SELECT last_sign_in_at FROM auth.users au WHERE au.id = public.profiles.id));

-- Update handle_new_user() trigger so newly created auth users get email + name synced
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := coalesce(NEW.raw_app_meta_data->>'crm_initial_status', 'active');
BEGIN
  IF v_status NOT IN ('invited', 'active', 'deactivated', 'revoked') THEN
    v_status := 'active';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, display_name, account_status)
  VALUES (
    NEW.id,
    lower(NEW.email),
    coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_status
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = coalesce(public.profiles.full_name, EXCLUDED.full_name),
    updated_at = now();

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Expand public.user_roles to support all 7 canonical roles + legacy aliases
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
    'checkin_staff',
    'participation_manager',
    'esports_manager',
    'score_operator',
    'content_manager',
    'viewer'
  ));

-- ------------------------------------------------------------------------------
-- 3. Granular Permission Overrides & Pending Invitations Tables
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
  role text NOT NULL CHECK (role IN (
    'super_admin',
    'crm_admin',
    'event_admin',
    'registration_staff',
    'checkin_staff',
    'participation_manager',
    'esports_manager',
    'score_operator',
    'content_manager',
    'viewer'
  )),
  permission_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_invitations_email ON public.crm_invitations (lower(email));
CREATE INDEX IF NOT EXISTS idx_crm_invitations_status ON public.crm_invitations (status);

ALTER TABLE public.crm_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_invitations FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_invitations TO authenticated;
GRANT ALL ON public.crm_invitations TO service_role;

-- ------------------------------------------------------------------------------
-- 4. Ensure Email Audit Table & Registration Email/Archive Columns Exist
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  cc text,
  bcc text,
  subject text NOT NULL,
  body_html text NOT NULL,
  sender_email text NOT NULL DEFAULT 'animationthenationalcollege@gmail.com',
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  gmail_message_id text,
  gmail_thread_id text,
  error_message text,
  idempotency_key text UNIQUE,
  provider text DEFAULT 'gmail',
  registration_ref text,
  registration_type text,
  attachment_names jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE public.crm_emails
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'gmail',
  ADD COLUMN IF NOT EXISTS registration_ref text,
  ADD COLUMN IF NOT EXISTS registration_type text,
  ADD COLUMN IF NOT EXISTS attachment_names jsonb;

CREATE INDEX IF NOT EXISTS idx_crm_emails_recipient ON public.crm_emails(recipient);
CREATE INDEX IF NOT EXISTS idx_crm_emails_status ON public.crm_emails(status);
CREATE INDEX IF NOT EXISTS idx_crm_emails_created_at ON public.crm_emails(created_at DESC);

ALTER TABLE public.crm_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_emails FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.crm_emails TO authenticated;
GRANT ALL ON public.crm_emails TO service_role;

ALTER TABLE public.visitor_registrations
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sending_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

ALTER TABLE public.participation_registrations
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sending_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sending_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

-- ------------------------------------------------------------------------------
-- 5. Core RBAC Functions (SECURITY DEFINER, search_path = public)
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
    WHEN 'participation_manager' THEN 'participation_manager'
    WHEN 'esports_manager' THEN 'esports_manager'
    WHEN 'score_operator' THEN 'esports_manager'
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
      'participation:view','participation:create','participation:edit','participation:approve','participation:reject','participation:export',
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'announcements:view','announcements:create','announcements:edit','announcements:publish','announcements:delete',
      'gallery:view','gallery:upload','gallery:edit','gallery:delete',
      'event_info:view','event_info:create','event_info:edit','event_info:publish',
      'social_links:view','social_links:edit',
      'email_centre:view','email_centre:compose','email_centre:send','email_centre:resend',
      'reports:view','reports:export',
      'system_settings:view'
    ]
    WHEN 'registration_staff' THEN ARRAY[
      'visitor:view','visitor:create','visitor:edit'
    ]
    WHEN 'participation_manager' THEN ARRAY[
      'participation:view','participation:create','participation:edit','participation:approve','participation:reject','participation:export',
      'reports:view'
    ]
    WHEN 'esports_manager' THEN ARRAY[
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'reports:view'
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

-- Active administrator check (enforces active account_status)
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
  ORDER BY CASE WHEN ur.role = 'super_admin' THEN 0 ELSE 1 END
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

-- Keep legacy helper functions aligned with active RBAC
CREATE OR REPLACE FUNCTION public.is_content_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('event_info:edit') OR public.has_crm_permission('system_settings:manage');
$$;

CREATE OR REPLACE FUNCTION public.is_checkin_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('visitor:edit') OR public.has_crm_permission('esports:edit');
$$;

CREATE OR REPLACE FUNCTION public.is_score_operator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.has_crm_permission('esports:edit');
$$;

-- Single-round-trip RPC for frontend auth hydration
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
  v_perm text;
  v_ov record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false, 'is_active', false, 'permissions', '[]'::jsonb);
  END IF;

  SELECT coalesce(p.account_status, 'active'), p.email, p.full_name, ur.role
  INTO v_status, v_email, v_full_name, v_role
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.user_id = v_uid
  ORDER BY CASE WHEN ur.role = 'super_admin' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_role IS NULL THEN
    SELECT p.account_status, p.email, p.full_name
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
      'permissions', '[]'::jsonb
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
      'permissions', '[]'::jsonb
    );
  END IF;

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
    'permissions', to_jsonb(coalesce(v_effective, ARRAY[]::text[]))
  );
END;
$$;

-- Invited user activation & login timestamp RPCs
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
REVOKE EXECUTE ON FUNCTION public.is_content_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_checkin_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_score_operator() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_crm_access() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_crm_invite() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_crm_login() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_crm_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_content_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_checkin_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_score_operator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_crm_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_crm_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_crm_login() TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. Database-Enforced Anti-Escalation, Self-Edit, & Last-Super-Admin Triggers
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
  -- Allow direct SQL editor (v_actor IS NULL) or Supabase service_role Edge Functions
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
    IF v_target_status = 'active' AND (TG_OP = 'DELETE' OR NEW.role <> 'super_admin') THEN
      SELECT count(*) INTO v_active_super_count
      FROM public.user_roles ur
      LEFT JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role = 'super_admin'
        AND coalesce(p.account_status, 'active') = 'active'
        AND ur.id <> OLD.id;

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
        SELECT count(*) INTO v_active_super_count
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

-- Audit RBAC changes automatically
DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_crm_user_permissions ON public.crm_user_permissions;
CREATE TRIGGER trg_audit_crm_user_permissions
AFTER INSERT OR UPDATE OR DELETE ON public.crm_user_permissions
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

-- ------------------------------------------------------------------------------
-- 7. Fix archive_registration() to use real audit_logs columns (entity_type, entity_id)
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
    IF NOT public.has_crm_permission('visitor:delete') THEN
      RAISE EXCEPTION 'Forbidden: visitor:delete permission required' USING ERRCODE = '42501';
    END IF;
    v_table := 'visitor_registrations';
    UPDATE public.visitor_registrations
    SET archived_at = pg_catalog.now(), archived_by = v_uid
    WHERE id = p_id AND archived_at IS NULL;
  ELSIF p_type = 'esports' THEN
    IF NOT public.has_crm_permission('esports:edit') THEN
      RAISE EXCEPTION 'Forbidden: esports:edit permission required' USING ERRCODE = '42501';
    END IF;
    v_table := 'registrations';
    UPDATE public.registrations
    SET archived_at = pg_catalog.now(), archived_by = v_uid
    WHERE id = p_id AND archived_at IS NULL;
  ELSIF p_type = 'participation' THEN
    IF NOT public.has_crm_permission('participation:edit') THEN
      RAISE EXCEPTION 'Forbidden: participation:edit permission required' USING ERRCODE = '42501';
    END IF;
    v_table := 'participation_registrations';
    UPDATE public.participation_registrations
    SET archived_at = pg_catalog.now(), archived_by = v_uid
    WHERE id = p_id AND archived_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Invalid registration type: %', p_type;
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

-- ------------------------------------------------------------------------------
-- 8. Explicit Anon Revocation & Strict Permission-Scoped RLS Policies
-- ------------------------------------------------------------------------------
-- Ensure anon CANNOT query any PII or administrative tables
REVOKE SELECT, UPDATE, DELETE ON public.visitor_registrations FROM anon;
REVOKE SELECT, UPDATE, DELETE ON public.participation_registrations FROM anon;
REVOKE SELECT, UPDATE, DELETE ON public.registrations FROM anon;
REVOKE ALL ON public.players FROM anon;
REVOKE ALL ON public.check_ins FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.crm_user_permissions FROM anon;
REVOKE ALL ON public.crm_invitations FROM anon;
REVOKE ALL ON public.crm_emails FROM anon;

-- Keep public registration submission grants intact
GRANT INSERT ON public.visitor_registrations TO anon, authenticated;
GRANT INSERT ON public.participation_registrations TO anon, authenticated;
GRANT INSERT ON public.registrations TO anon, authenticated;

-- profiles: users read own; active Super Admins read/update all
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "super_admin_read_profiles" ON public.profiles;
CREATE POLICY "profiles_select_rbac"
ON public.profiles FOR SELECT
TO authenticated
USING (id = (select auth.uid()) OR public.is_super_admin());

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "super_admin_update_profiles" ON public.profiles;
CREATE POLICY "profiles_update_rbac"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = (select auth.uid()) OR public.is_super_admin())
WITH CHECK (id = (select auth.uid()) OR public.is_super_admin());

-- user_roles: strictly Super Admin (active) only
DROP POLICY IF EXISTS "admin_manage_roles_select" ON public.user_roles;
DROP POLICY IF EXISTS "admin_insert_role" ON public.user_roles;
DROP POLICY IF EXISTS "admin_update_role" ON public.user_roles;
DROP POLICY IF EXISTS "admin_delete_role" ON public.user_roles;

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

-- crm_user_permissions: user can view own, only Super Admin can modify others
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

-- crm_invitations: strictly Super Admin
DROP POLICY IF EXISTS "crm_invitations_rbac" ON public.crm_invitations;
CREATE POLICY "crm_invitations_rbac"
ON public.crm_invitations FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- visitor_registrations: preserve public INSERT; lock SELECT/UPDATE/DELETE to visitor:* permissions
DROP POLICY IF EXISTS "admin_read_visitor_registrations" ON public.visitor_registrations;
CREATE POLICY "admin_read_visitor_registrations"
ON public.visitor_registrations FOR SELECT
TO authenticated
USING (public.has_crm_permission('visitor:view') OR public.has_crm_permission('reports:view'));

DROP POLICY IF EXISTS "admin_update_visitor_registrations" ON public.visitor_registrations;
CREATE POLICY "admin_update_visitor_registrations"
ON public.visitor_registrations FOR UPDATE
TO authenticated
USING (public.has_crm_permission('visitor:edit'))
WITH CHECK (public.has_crm_permission('visitor:edit'));

DROP POLICY IF EXISTS "admin_delete_visitor_registrations" ON public.visitor_registrations;
CREATE POLICY "admin_delete_visitor_registrations"
ON public.visitor_registrations FOR DELETE
TO authenticated
USING (public.has_crm_permission('visitor:delete'));

-- participation_registrations: preserve public INSERT; lock SELECT/UPDATE/DELETE to participation:* permissions
DROP POLICY IF EXISTS "admin_read_participation_registrations" ON public.participation_registrations;
CREATE POLICY "admin_read_participation_registrations"
ON public.participation_registrations FOR SELECT
TO authenticated
USING (public.has_crm_permission('participation:view') OR public.has_crm_permission('reports:view'));

DROP POLICY IF EXISTS "admin_update_participation_registrations" ON public.participation_registrations;
CREATE POLICY "admin_update_participation_registrations"
ON public.participation_registrations FOR UPDATE
TO authenticated
USING (
  public.has_crm_permission('participation:edit')
  OR public.has_crm_permission('participation:approve')
  OR public.has_crm_permission('participation:reject')
)
WITH CHECK (
  public.has_crm_permission('participation:edit')
  OR public.has_crm_permission('participation:approve')
  OR public.has_crm_permission('participation:reject')
);

DROP POLICY IF EXISTS "admin_delete_participation_registrations" ON public.participation_registrations;
CREATE POLICY "admin_delete_participation_registrations"
ON public.participation_registrations FOR DELETE
TO authenticated
USING (public.has_crm_permission('participation:edit'));

-- registrations (esports): preserve public INSERT pending; lock SELECT/UPDATE/DELETE to esports:* permissions
DROP POLICY IF EXISTS "admin_read_registrations" ON public.registrations;
CREATE POLICY "admin_read_registrations"
ON public.registrations FOR SELECT
TO authenticated
USING (public.has_crm_permission('esports:view') OR public.has_crm_permission('reports:view'));

DROP POLICY IF EXISTS "admin_update_registrations" ON public.registrations;
CREATE POLICY "admin_update_registrations"
ON public.registrations FOR UPDATE
TO authenticated
USING (
  public.has_crm_permission('esports:edit')
  OR public.has_crm_permission('esports:approve')
  OR public.has_crm_permission('esports:reject')
)
WITH CHECK (
  public.has_crm_permission('esports:edit')
  OR public.has_crm_permission('esports:approve')
  OR public.has_crm_permission('esports:reject')
);

DROP POLICY IF EXISTS "admin_delete_registrations" ON public.registrations;
CREATE POLICY "admin_delete_registrations"
ON public.registrations FOR DELETE
TO authenticated
USING (public.has_crm_permission('esports:edit'));

-- players
DROP POLICY IF EXISTS "admin_read_players" ON public.players;
CREATE POLICY "admin_read_players"
ON public.players FOR SELECT
TO authenticated
USING (public.has_crm_permission('esports:view') OR public.has_crm_permission('reports:view'));

DROP POLICY IF EXISTS "admin_insert_player" ON public.players;
CREATE POLICY "admin_insert_player"
ON public.players FOR INSERT
TO authenticated
WITH CHECK (public.has_crm_permission('esports:create') OR public.has_crm_permission('esports:edit'));

DROP POLICY IF EXISTS "admin_update_player" ON public.players;
CREATE POLICY "admin_update_player"
ON public.players FOR UPDATE
TO authenticated
USING (public.has_crm_permission('esports:edit'))
WITH CHECK (public.has_crm_permission('esports:edit'));

DROP POLICY IF EXISTS "admin_delete_player" ON public.players;
CREATE POLICY "admin_delete_player"
ON public.players FOR DELETE
TO authenticated
USING (public.has_crm_permission('esports:edit'));

-- check_ins
DROP POLICY IF EXISTS "admin_read_checkins" ON public.check_ins;
CREATE POLICY "admin_read_checkins"
ON public.check_ins FOR SELECT
TO authenticated
USING (public.has_crm_permission('visitor:view') OR public.has_crm_permission('esports:view'));

DROP POLICY IF EXISTS "admin_insert_checkin" ON public.check_ins;
CREATE POLICY "admin_insert_checkin"
ON public.check_ins FOR INSERT
TO authenticated
WITH CHECK (public.has_crm_permission('visitor:edit') OR public.has_crm_permission('esports:edit'));

DROP POLICY IF EXISTS "admin_update_checkin" ON public.check_ins;
CREATE POLICY "admin_update_checkin"
ON public.check_ins FOR UPDATE
TO authenticated
USING (public.has_crm_permission('visitor:edit') OR public.has_crm_permission('esports:edit'))
WITH CHECK (public.has_crm_permission('visitor:edit') OR public.has_crm_permission('esports:edit'));

DROP POLICY IF EXISTS "admin_delete_checkin" ON public.check_ins;
CREATE POLICY "admin_delete_checkin"
ON public.check_ins FOR DELETE
TO authenticated
USING (public.has_crm_permission('visitor:delete'));

-- matches
DROP POLICY IF EXISTS "matches_select_policy" ON public.matches;
CREATE POLICY "matches_select_policy"
ON public.matches FOR SELECT
TO anon, authenticated
USING (is_published = true OR (auth.role() = 'authenticated' AND public.has_crm_permission('esports:view')));

DROP POLICY IF EXISTS "admin_insert_match" ON public.matches;
CREATE POLICY "admin_insert_match"
ON public.matches FOR INSERT
TO authenticated
WITH CHECK (public.has_crm_permission('esports:create') OR public.has_crm_permission('esports:edit'));

DROP POLICY IF EXISTS "admin_update_match" ON public.matches;
CREATE POLICY "admin_update_match"
ON public.matches FOR UPDATE
TO authenticated
USING (public.has_crm_permission('esports:edit'))
WITH CHECK (public.has_crm_permission('esports:edit'));

DROP POLICY IF EXISTS "admin_delete_match" ON public.matches;
CREATE POLICY "admin_delete_match"
ON public.matches FOR DELETE
TO authenticated
USING (public.has_crm_permission('esports:edit'));

-- announcements
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

-- gallery_items
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

-- event_info tables: site_content, schedule_items, faq_items, sponsors, games, institutions
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

DROP POLICY IF EXISTS "games_select_policy" ON public.games;
CREATE POLICY "games_select_policy"
ON public.games FOR SELECT
TO anon, authenticated
USING ((is_published = true AND is_active = true) OR (auth.role() = 'authenticated' AND (public.has_crm_permission('event_info:view') OR public.has_crm_permission('esports:view'))));

DROP POLICY IF EXISTS "admin_insert_game" ON public.games;
CREATE POLICY "admin_insert_game"
ON public.games FOR INSERT
TO authenticated
WITH CHECK (public.has_crm_permission('event_info:create') OR public.has_crm_permission('esports:edit'));

DROP POLICY IF EXISTS "admin_update_game" ON public.games;
CREATE POLICY "admin_update_game"
ON public.games FOR UPDATE
TO authenticated
USING (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('esports:edit'))
WITH CHECK (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('esports:edit'));

DROP POLICY IF EXISTS "admin_delete_game" ON public.games;
CREATE POLICY "admin_delete_game"
ON public.games FOR DELETE
TO authenticated
USING (public.has_crm_permission('event_info:edit'));

DROP POLICY IF EXISTS "admin_manage_institutions" ON public.institutions;
DROP POLICY IF EXISTS "institutions_admin_write" ON public.institutions;
CREATE POLICY "institutions_admin_write"
ON public.institutions FOR ALL
TO authenticated
USING (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:create'))
WITH CHECK (public.has_crm_permission('event_info:edit') OR public.has_crm_permission('event_info:create'));

-- event_settings & system controls
DROP POLICY IF EXISTS "event_settings_select_policy" ON public.event_settings;
CREATE POLICY "event_settings_select_policy"
ON public.event_settings FOR SELECT
TO anon, authenticated
USING (is_published = true OR (auth.role() = 'authenticated' AND public.has_crm_permission('system_settings:view')));

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

DROP POLICY IF EXISTS "admin_update_registration_controls" ON public.registration_controls;
CREATE POLICY "admin_update_registration_controls"
ON public.registration_controls FOR UPDATE
TO authenticated
USING (public.has_crm_permission('system_settings:manage'))
WITH CHECK (public.has_crm_permission('system_settings:manage'));

-- crm_emails
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

-- audit_logs: only system_settings:view can SELECT; active admins can insert operational logs
DROP POLICY IF EXISTS "admin_read_audit_logs" ON public.audit_logs;
CREATE POLICY "admin_read_audit_logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.has_crm_permission('system_settings:view'));

DROP POLICY IF EXISTS "admin_insert_audit_log" ON public.audit_logs;
CREATE POLICY "admin_insert_audit_log"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- Optional tables created by migrations 0011, 0012, 20261112000002 (safe if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'media_items') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_insert_media_items" ON public.media_items';
    EXECUTE 'CREATE POLICY "admin_insert_media_items" ON public.media_items FOR INSERT TO authenticated WITH CHECK (public.has_crm_permission(''gallery:upload''))';
    EXECUTE 'DROP POLICY IF EXISTS "admin_update_media_items" ON public.media_items';
    EXECUTE 'CREATE POLICY "admin_update_media_items" ON public.media_items FOR UPDATE TO authenticated USING (public.has_crm_permission(''gallery:edit'')) WITH CHECK (public.has_crm_permission(''gallery:edit''))';
    EXECUTE 'DROP POLICY IF EXISTS "admin_delete_media_items" ON public.media_items';
    EXECUTE 'CREATE POLICY "admin_delete_media_items" ON public.media_items FOR DELETE TO authenticated USING (public.has_crm_permission(''gallery:delete''))';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'form_options') THEN
    EXECUTE 'DROP POLICY IF EXISTS "admin_insert_form_options" ON public.form_options';
    EXECUTE 'CREATE POLICY "admin_insert_form_options" ON public.form_options FOR INSERT TO authenticated WITH CHECK (public.has_crm_permission(''system_settings:manage''))';
    EXECUTE 'DROP POLICY IF EXISTS "admin_update_form_options" ON public.form_options';
    EXECUTE 'CREATE POLICY "admin_update_form_options" ON public.form_options FOR UPDATE TO authenticated USING (public.has_crm_permission(''system_settings:manage'')) WITH CHECK (public.has_crm_permission(''system_settings:manage''))';
    EXECUTE 'DROP POLICY IF EXISTS "admin_delete_form_options" ON public.form_options';
    EXECUTE 'CREATE POLICY "admin_delete_form_options" ON public.form_options FOR DELETE TO authenticated USING (public.has_crm_permission(''system_settings:manage''))';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'nas_archives') THEN
    EXECUTE 'REVOKE ALL ON public.nas_archives FROM anon';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can view and manage nas_archives" ON public.nas_archives';
    EXECUTE 'CREATE POLICY "Admins can view and manage nas_archives" ON public.nas_archives FOR ALL TO authenticated USING (public.has_crm_permission(''email_centre:view'') OR public.has_crm_permission(''reports:view'')) WITH CHECK (public.has_crm_permission(''email_centre:send'') OR public.has_crm_permission(''system_settings:manage''))';
  END IF;
END $$;
