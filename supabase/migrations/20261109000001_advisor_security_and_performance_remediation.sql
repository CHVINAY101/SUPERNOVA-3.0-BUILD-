-- ============================================================================
-- SUPERNOVA 3.0 — SECURITY & PERFORMANCE ADVISOR RESOLUTION MIGRATION
-- Migration Version: 20261109000001_advisor_security_and_performance_remediation.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Description:
--   1. Addresses Security Advisor warning: Revokes direct EXECUTE on trigger function
--      set_visitor_registration_ref() from authenticated users (triggers run without direct call grant).
--   2. Addresses Performance Advisor warning on profiles:
--      Optimizes "select_own_profile" and "update_own_profile" by wrapping auth.uid()
--      in a scalar subquery (select auth.uid()) to avoid re-evaluating the plan per row.
--   3. Addresses Performance Advisor "Multiple Permissive Policies" on content tables:
--      Consolidates public read + admin read into clean single SELECT policies per table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: Function Execution Hardening
-- ----------------------------------------------------------------------------

-- Revoke direct execute on trigger functions from all non-superusers.
-- PostgreSQL trigger functions execute automatically under table trigger events;
-- direct invocation by authenticated users is unnecessary and triggers Security Advisor warnings.
REVOKE EXECUTE ON FUNCTION public.set_visitor_registration_ref() FROM PUBLIC, anon, authenticated;

-- Ensure is_admin() cannot be called by public or anon
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ----------------------------------------------------------------------------
-- PART 2: Performance Advisor — Auth RLS Initialization Plan on profiles
-- ----------------------------------------------------------------------------

-- Replace auth.uid() = id with (select auth.uid()) = id
-- This prevents the query planner from re-evaluating auth.uid() for every candidate row.
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = (select auth.uid()))
WITH CHECK (id = (select auth.uid()));


-- ----------------------------------------------------------------------------
-- PART 3: Performance Advisor — Multiple Permissive Policies Consolidation
-- ----------------------------------------------------------------------------
-- Consolidates separate (public_read + admin_read) into a unified SELECT policy.
-- Preserves EXACT logic:
-- - Unauthenticated (anon): sees published items (is_published = true).
-- - Authenticated users with admin role (public.is_admin() = true): see all items (including drafts).
-- - Regular authenticated users: see published items (is_published = true).

-- 1. announcements
DROP POLICY IF EXISTS "public_read_published_announcements" ON public.announcements;
DROP POLICY IF EXISTS "admin_read_all_announcements" ON public.announcements;
DROP POLICY IF EXISTS "announcements_select_policy" ON public.announcements;

CREATE POLICY "announcements_select_policy"
ON public.announcements FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR
  (auth.role() = 'authenticated' AND public.is_admin())
);

-- 2. event_settings
DROP POLICY IF EXISTS "public_read_published_settings" ON public.event_settings;
DROP POLICY IF EXISTS "admin_read_all_settings" ON public.event_settings;
DROP POLICY IF EXISTS "event_settings_select_policy" ON public.event_settings;

CREATE POLICY "event_settings_select_policy"
ON public.event_settings FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR
  (auth.role() = 'authenticated' AND public.is_admin())
);

-- 3. faq_items
DROP POLICY IF EXISTS "public_read_published_faqs" ON public.faq_items;
DROP POLICY IF EXISTS "admin_read_all_faqs" ON public.faq_items;
DROP POLICY IF EXISTS "faq_items_select_policy" ON public.faq_items;

CREATE POLICY "faq_items_select_policy"
ON public.faq_items FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR
  (auth.role() = 'authenticated' AND public.is_admin())
);

-- 4. gallery_items
DROP POLICY IF EXISTS "public_read_published_gallery" ON public.gallery_items;
DROP POLICY IF EXISTS "admin_read_all_gallery" ON public.gallery_items;
DROP POLICY IF EXISTS "gallery_items_select_policy" ON public.gallery_items;

CREATE POLICY "gallery_items_select_policy"
ON public.gallery_items FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR
  (auth.role() = 'authenticated' AND public.is_admin())
);

-- 5. games
DROP POLICY IF EXISTS "public_read_published_games" ON public.games;
DROP POLICY IF EXISTS "admin_read_all_games" ON public.games;
DROP POLICY IF EXISTS "anon_read_open_games" ON public.games;
DROP POLICY IF EXISTS "games_select_policy" ON public.games;

CREATE POLICY "games_select_policy"
ON public.games FOR SELECT
TO anon, authenticated
USING (
  (is_published = true AND is_active = true)
  OR
  (auth.role() = 'authenticated' AND public.is_admin())
);

-- 6. matches
DROP POLICY IF EXISTS "public_read_published_matches" ON public.matches;
DROP POLICY IF EXISTS "admin_read_all_matches" ON public.matches;
DROP POLICY IF EXISTS "score_operator_read_all_matches" ON public.matches;
DROP POLICY IF EXISTS "matches_select_policy" ON public.matches;

CREATE POLICY "matches_select_policy"
ON public.matches FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR
  (auth.role() = 'authenticated' AND (public.is_admin() OR public.is_score_operator()))
);

-- 7. schedule_items
DROP POLICY IF EXISTS "public_read_published_schedule" ON public.schedule_items;
DROP POLICY IF EXISTS "admin_read_all_schedule" ON public.schedule_items;
DROP POLICY IF EXISTS "schedule_items_select_policy" ON public.schedule_items;

CREATE POLICY "schedule_items_select_policy"
ON public.schedule_items FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR
  (auth.role() = 'authenticated' AND public.is_admin())
);

-- 8. site_content
DROP POLICY IF EXISTS "public_read_published_content" ON public.site_content;
DROP POLICY IF EXISTS "admin_read_all_content" ON public.site_content;
DROP POLICY IF EXISTS "site_content_select_policy" ON public.site_content;

CREATE POLICY "site_content_select_policy"
ON public.site_content FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR
  (auth.role() = 'authenticated' AND public.is_admin())
);

-- 9. sponsors
DROP POLICY IF EXISTS "public_read_published_sponsors" ON public.sponsors;
DROP POLICY IF EXISTS "admin_read_all_sponsors" ON public.sponsors;
DROP POLICY IF EXISTS "sponsors_select_policy" ON public.sponsors;

CREATE POLICY "sponsors_select_policy"
ON public.sponsors FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  OR
  (auth.role() = 'authenticated' AND public.is_admin())
);
