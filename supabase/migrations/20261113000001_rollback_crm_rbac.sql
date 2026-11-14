-- ==============================================================================
-- SUPERNOVA 3.0 — ROLLBACK FOR RBAC & USER MANAGEMENT MIGRATION
-- Rollback Script for: 20261113000000_crm_rbac_and_user_management.sql
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_audit_crm_user_permissions ON public.crm_user_permissions;
DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
DROP TRIGGER IF EXISTS trg_guard_profile_status_mutation ON public.profiles;
DROP TRIGGER IF EXISTS trg_guard_crm_permission_mutation ON public.crm_user_permissions;
DROP TRIGGER IF EXISTS trg_guard_crm_role_mutation ON public.user_roles;

DROP FUNCTION IF EXISTS public.guard_profile_status_mutation();
DROP FUNCTION IF EXISTS public.guard_crm_permission_mutation();
DROP FUNCTION IF EXISTS public.guard_crm_role_mutation();
DROP FUNCTION IF EXISTS public.record_crm_login();
DROP FUNCTION IF EXISTS public.accept_crm_invite();
DROP FUNCTION IF EXISTS public.get_my_crm_access();
DROP FUNCTION IF EXISTS public.has_crm_permission(text);
DROP FUNCTION IF EXISTS public.is_super_admin();
DROP FUNCTION IF EXISTS public.role_default_permissions(text);
DROP FUNCTION IF EXISTS public.normalize_crm_role(text);

DROP TABLE IF EXISTS public.crm_invitations;
DROP TABLE IF EXISTS public.crm_user_permissions;

-- Restore basic is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
  );
$$;
