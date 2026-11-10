/*
# Fix Security Advisor Findings on Functions

1. Changes
- `update_updated_at()`: add `SET search_path = public` to fix the mutable
  search_path warning.
- `handle_new_user()`: REVOKE EXECUTE from PUBLIC, anon, and authenticated.
  This is a trigger function and should never be callable via RPC.
- `set_registration_ref()`: REVOKE EXECUTE from PUBLIC, anon, and
  authenticated. This is a trigger function and should never be callable
  via RPC.
- `generate_registration_ref()`: REVOKE EXECUTE from authenticated (already
  revoked from PUBLIC and anon). It is only called internally by the
  set_registration_ref trigger, which runs as SECURITY DEFINER (owner), so
  no role needs direct EXECUTE.

2. Security
- is_admin() remains executable by authenticated only — this is intentional.
  The frontend calls it to check if the current user has an admin role.
- All trigger functions are now not callable via the REST API by any role.

3. Important Notes
- These changes do NOT affect trigger functionality. Triggers execute
  their functions regardless of EXECUTE privileges.
*/

-- Fix mutable search_path on update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Revoke direct RPC access on trigger-only functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_registration_ref() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_registration_ref() FROM PUBLIC, anon, authenticated;
