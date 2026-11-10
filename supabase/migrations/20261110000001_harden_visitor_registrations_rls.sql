-- Idempotent RLS hardening for public.visitor_registrations
-- Ensures anonymous users cannot SELECT, UPDATE, or DELETE visitor_registrations,
-- while preserving public visitor registration INSERT and admin-only SELECT/UPDATE/DELETE.

ALTER TABLE public.visitor_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_registrations FORCE ROW LEVEL SECURITY;

REVOKE SELECT, UPDATE, DELETE ON public.visitor_registrations FROM anon;
GRANT INSERT ON public.visitor_registrations TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.visitor_registrations TO authenticated;

DROP POLICY IF EXISTS "admin_read_visitor_registrations" ON public.visitor_registrations;
CREATE POLICY "admin_read_visitor_registrations"
ON public.visitor_registrations FOR SELECT
TO authenticated
USING (public.is_admin());
