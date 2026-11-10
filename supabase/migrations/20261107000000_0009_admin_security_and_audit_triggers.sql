-- Migration 0009: Admin Security, Role Enforcement & Audit Log Triggers
-- Safe to run multiple times (idempotent)

-- 1. Ensure participation_registrations table exists
CREATE TABLE IF NOT EXISTS public.participation_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_ref text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  institution text,
  participant_category text NOT NULL,
  participation_area text NOT NULL,
  project_title text,
  project_description text,
  team_members_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.participation_registrations ENABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.participation_registrations TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.participation_registrations TO authenticated;

-- Trigger: auto-set registration reference if omitted
CREATE OR REPLACE FUNCTION set_participation_registration_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.registration_ref IS NULL OR NEW.registration_ref = '' THEN
    NEW.registration_ref := generate_registration_ref();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_participation_registration_ref ON public.participation_registrations;
CREATE TRIGGER trg_set_participation_registration_ref
BEFORE INSERT ON public.participation_registrations
FOR EACH ROW EXECUTE FUNCTION set_participation_registration_ref();

-- 2. Enhanced Role Checking Helper Functions
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

CREATE OR REPLACE FUNCTION public.is_content_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'event_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_checkin_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'event_admin', 'checkin_staff')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_score_operator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'event_admin', 'score_operator')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_content_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_checkin_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_score_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_content_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_checkin_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_score_operator() TO authenticated;

-- 3. RLS Role Enforcement on Registrations & Content
DROP POLICY IF EXISTS "admin_read_participation_registrations" ON public.participation_registrations;
CREATE POLICY "admin_read_participation_registrations"
ON public.participation_registrations FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_update_participation_registrations" ON public.participation_registrations;
CREATE POLICY "admin_update_participation_registrations"
ON public.participation_registrations FOR UPDATE
TO authenticated
USING (public.is_content_admin())
WITH CHECK (public.is_content_admin());

DROP POLICY IF EXISTS "admin_delete_participation_registrations" ON public.participation_registrations;
CREATE POLICY "admin_delete_participation_registrations"
ON public.participation_registrations FOR DELETE
TO authenticated
USING (public.is_content_admin());

DROP POLICY IF EXISTS "admin_update_visitor_registrations" ON public.visitor_registrations;
CREATE POLICY "admin_update_visitor_registrations"
ON public.visitor_registrations FOR UPDATE
TO authenticated
USING (public.is_checkin_staff())
WITH CHECK (public.is_checkin_staff());

DROP POLICY IF EXISTS "admin_delete_visitor_registrations" ON public.visitor_registrations;
CREATE POLICY "admin_delete_visitor_registrations"
ON public.visitor_registrations FOR DELETE
TO authenticated
USING (public.is_content_admin());

DROP POLICY IF EXISTS "admin_update_registrations" ON public.registrations;
CREATE POLICY "admin_update_registrations"
ON public.registrations FOR UPDATE
TO authenticated
USING (public.is_checkin_staff())
WITH CHECK (public.is_checkin_staff());

DROP POLICY IF EXISTS "admin_delete_registrations" ON public.registrations;
CREATE POLICY "admin_delete_registrations"
ON public.registrations FOR DELETE
TO authenticated
USING (public.is_content_admin());

-- 4. Audit Log Database Trigger Function
CREATE OR REPLACE FUNCTION public.log_admin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action text := TG_OP;
  v_entity_id uuid;
  v_metadata jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    BEGIN
      v_entity_id := OLD.id;
    EXCEPTION WHEN OTHERS THEN
      v_entity_id := NULL;
    END;
    v_metadata := jsonb_build_object(
      'old', to_jsonb(OLD),
      'user_role', (SELECT role FROM public.user_roles WHERE user_id = v_actor LIMIT 1)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    BEGIN
      v_entity_id := NEW.id;
    EXCEPTION WHEN OTHERS THEN
      v_entity_id := NULL;
    END;
    v_metadata := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW),
      'user_role', (SELECT role FROM public.user_roles WHERE user_id = v_actor LIMIT 1)
    );
  ELSE
    BEGIN
      v_entity_id := NEW.id;
    EXCEPTION WHEN OTHERS THEN
      v_entity_id := NULL;
    END;
    v_metadata := jsonb_build_object(
      'new', to_jsonb(NEW),
      'user_role', (SELECT role FROM public.user_roles WHERE user_id = v_actor LIMIT 1)
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at)
  VALUES (v_actor, v_action, TG_TABLE_NAME, v_entity_id, v_metadata, now());

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 5. Attach Audit Triggers to the 12 Managed Tables
DROP TRIGGER IF EXISTS trg_audit_registrations ON public.registrations;
CREATE TRIGGER trg_audit_registrations
AFTER INSERT OR UPDATE OR DELETE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_participation_registrations ON public.participation_registrations;
CREATE TRIGGER trg_audit_participation_registrations
AFTER INSERT OR UPDATE OR DELETE ON public.participation_registrations
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_visitor_registrations ON public.visitor_registrations;
CREATE TRIGGER trg_audit_visitor_registrations
AFTER INSERT OR UPDATE OR DELETE ON public.visitor_registrations
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_announcements ON public.announcements;
CREATE TRIGGER trg_audit_announcements
AFTER INSERT OR UPDATE OR DELETE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_schedule_items ON public.schedule_items;
CREATE TRIGGER trg_audit_schedule_items
AFTER INSERT OR UPDATE OR DELETE ON public.schedule_items
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_sponsors ON public.sponsors;
CREATE TRIGGER trg_audit_sponsors
AFTER INSERT OR UPDATE OR DELETE ON public.sponsors
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_gallery_items ON public.gallery_items;
CREATE TRIGGER trg_audit_gallery_items
AFTER INSERT OR UPDATE OR DELETE ON public.gallery_items
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_faq_items ON public.faq_items;
CREATE TRIGGER trg_audit_faq_items
AFTER INSERT OR UPDATE OR DELETE ON public.faq_items
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_games ON public.games;
CREATE TRIGGER trg_audit_games
AFTER INSERT OR UPDATE OR DELETE ON public.games
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

-- Safe trigger attachment for optional table: institutions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'institutions'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_institutions ON public.institutions';
    EXECUTE 'CREATE TRIGGER trg_audit_institutions
             AFTER INSERT OR UPDATE OR DELETE ON public.institutions
             FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit()';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_audit_site_content ON public.site_content;
CREATE TRIGGER trg_audit_site_content
AFTER INSERT OR UPDATE OR DELETE ON public.site_content
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();

DROP TRIGGER IF EXISTS trg_audit_event_settings ON public.event_settings;
CREATE TRIGGER trg_audit_event_settings
AFTER INSERT OR UPDATE OR DELETE ON public.event_settings
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();
