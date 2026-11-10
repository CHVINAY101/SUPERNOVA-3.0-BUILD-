-- ============================================================================
-- SUPERNOVA 3.0 — ROLLBACK MIGRATION
-- Migration Version: 20261109000002_rollback_advisor_remediation.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Description:
--   Fully restores the exact original policies, function grants, and names
--   in case 20261109000001 needs to be completely undone.
-- ============================================================================

-- 1. Restore function execution grants
GRANT EXECUTE ON FUNCTION public.set_visitor_registration_ref() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 2. Restore profiles policies
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. Restore announcements policies
DROP POLICY IF EXISTS "announcements_select_policy" ON public.announcements;

DROP POLICY IF EXISTS "public_read_published_announcements" ON public.announcements;
CREATE POLICY "public_read_published_announcements"
ON public.announcements FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_announcements" ON public.announcements;
CREATE POLICY "admin_read_all_announcements"
ON public.announcements FOR SELECT
TO authenticated
USING (public.is_admin());

-- 4. Restore event_settings policies
DROP POLICY IF EXISTS "event_settings_select_policy" ON public.event_settings;

DROP POLICY IF EXISTS "public_read_published_settings" ON public.event_settings;
CREATE POLICY "public_read_published_settings"
ON public.event_settings FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_settings" ON public.event_settings;
CREATE POLICY "admin_read_all_settings"
ON public.event_settings FOR SELECT
TO authenticated
USING (public.is_admin());

-- 5. Restore faq_items policies
DROP POLICY IF EXISTS "faq_items_select_policy" ON public.faq_items;

DROP POLICY IF EXISTS "public_read_published_faqs" ON public.faq_items;
CREATE POLICY "public_read_published_faqs"
ON public.faq_items FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_faqs" ON public.faq_items;
CREATE POLICY "admin_read_all_faqs"
ON public.faq_items FOR SELECT
TO authenticated
USING (public.is_admin());

-- 6. Restore gallery_items policies
DROP POLICY IF EXISTS "gallery_items_select_policy" ON public.gallery_items;

DROP POLICY IF EXISTS "public_read_published_gallery" ON public.gallery_items;
CREATE POLICY "public_read_published_gallery"
ON public.gallery_items FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_gallery" ON public.gallery_items;
CREATE POLICY "admin_read_all_gallery"
ON public.gallery_items FOR SELECT
TO authenticated
USING (public.is_admin());

-- 7. Restore games policies
DROP POLICY IF EXISTS "games_select_policy" ON public.games;

DROP POLICY IF EXISTS "public_read_published_games" ON public.games;
CREATE POLICY "public_read_published_games"
ON public.games FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_games" ON public.games;
CREATE POLICY "admin_read_all_games"
ON public.games FOR SELECT
TO authenticated
USING (public.is_admin());

-- 8. Restore matches policies
DROP POLICY IF EXISTS "matches_select_policy" ON public.matches;

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

-- 9. Restore schedule_items policies
DROP POLICY IF EXISTS "schedule_items_select_policy" ON public.schedule_items;

DROP POLICY IF EXISTS "public_read_published_schedule" ON public.schedule_items;
CREATE POLICY "public_read_published_schedule"
ON public.schedule_items FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_schedule" ON public.schedule_items;
CREATE POLICY "admin_read_all_schedule"
ON public.schedule_items FOR SELECT
TO authenticated
USING (public.is_admin());

-- 10. Restore site_content policies
DROP POLICY IF EXISTS "site_content_select_policy" ON public.site_content;

DROP POLICY IF EXISTS "public_read_published_content" ON public.site_content;
CREATE POLICY "public_read_published_content"
ON public.site_content FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_content" ON public.site_content;
CREATE POLICY "admin_read_all_content"
ON public.site_content FOR SELECT
TO authenticated
USING (public.is_admin());

-- 11. Restore sponsors policies
DROP POLICY IF EXISTS "sponsors_select_policy" ON public.sponsors;

DROP POLICY IF EXISTS "public_read_published_sponsors" ON public.sponsors;
CREATE POLICY "public_read_published_sponsors"
ON public.sponsors FOR SELECT
TO anon, authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "admin_read_all_sponsors" ON public.sponsors;
CREATE POLICY "admin_read_all_sponsors"
ON public.sponsors FOR SELECT
TO authenticated
USING (public.is_admin());
