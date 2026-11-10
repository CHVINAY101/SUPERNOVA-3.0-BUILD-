-- Migration 0011: Public Storage Bucket (site-media) and Media Items Table
-- Safe to run multiple times (idempotent)

-- 1. Ensure Storage Bucket site-media exists in storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-media',
  'site-media',
  true,
  5242880, -- 5 MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

-- Storage bucket RLS policies on storage.objects
DROP POLICY IF EXISTS "public_read_site_media" ON storage.objects;
CREATE POLICY "public_read_site_media"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'site-media');

DROP POLICY IF EXISTS "admin_upload_site_media" ON storage.objects;
CREATE POLICY "admin_upload_site_media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'site-media' AND public.is_content_admin());

DROP POLICY IF EXISTS "admin_update_site_media" ON storage.objects;
CREATE POLICY "admin_update_site_media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'site-media' AND public.is_content_admin())
WITH CHECK (bucket_id = 'site-media' AND public.is_content_admin());

DROP POLICY IF EXISTS "admin_delete_site_media" ON storage.objects;
CREATE POLICY "admin_delete_site_media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'site-media' AND public.is_content_admin());

-- 2. Create media_items metadata table
CREATE TABLE IF NOT EXISTS public.media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text NOT NULL,
  storage_path text,
  alt_text text,
  caption text,
  file_size text,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.media_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.media_items TO authenticated;

DROP POLICY IF EXISTS "public_read_media_items" ON public.media_items;
CREATE POLICY "public_read_media_items"
ON public.media_items FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "admin_insert_media_items" ON public.media_items;
CREATE POLICY "admin_insert_media_items"
ON public.media_items FOR INSERT
TO authenticated
WITH CHECK (public.is_content_admin());

DROP POLICY IF EXISTS "admin_update_media_items" ON public.media_items;
CREATE POLICY "admin_update_media_items"
ON public.media_items FOR UPDATE
TO authenticated
USING (public.is_content_admin())
WITH CHECK (public.is_content_admin());

DROP POLICY IF EXISTS "admin_delete_media_items" ON public.media_items;
CREATE POLICY "admin_delete_media_items"
ON public.media_items FOR DELETE
TO authenticated
USING (public.is_content_admin());

-- Attach audit logging trigger
DROP TRIGGER IF EXISTS trg_audit_media_items ON public.media_items;
CREATE TRIGGER trg_audit_media_items
AFTER INSERT OR UPDATE OR DELETE ON public.media_items
FOR EACH ROW EXECUTE FUNCTION public.log_admin_audit();
