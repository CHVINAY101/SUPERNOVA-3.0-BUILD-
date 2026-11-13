-- ==============================================================================
-- SUPERNOVA 3.0 — AUTOMATED DIGITAL TICKET GENERATION, EMAIL DELIVERY & NAS BACKUP
-- Migration: 20261112000002_ticket_generation_and_nas_archival.sql
-- ==============================================================================

-- 1. Create dedicated NAS Archives Table
CREATE TABLE IF NOT EXISTS public.nas_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_ref text NOT NULL,
  registration_type text NOT NULL CHECK (registration_type IN ('visitor', 'participation', 'esports_team', 'esports_player')),
  registration_id uuid,
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  file_name text NOT NULL,
  nas_folder text NOT NULL,
  nas_relative_path text NOT NULL,
  file_size_bytes integer,
  sha256_checksum text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message text,
  retry_count integer DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_nas_archive_ticket UNIQUE (ticket_ref, file_name)
);

-- Indexes for rapid lookup
CREATE INDEX IF NOT EXISTS idx_nas_archives_ticket_ref ON public.nas_archives(ticket_ref);
CREATE INDEX IF NOT EXISTS idx_nas_archives_status ON public.nas_archives(status);
CREATE INDEX IF NOT EXISTS idx_nas_archives_type ON public.nas_archives(registration_type);
CREATE INDEX IF NOT EXISTS idx_nas_archives_email ON public.nas_archives(recipient_email);

-- Enable RLS
ALTER TABLE public.nas_archives ENABLE ROW LEVEL SECURITY;

-- Only authenticated admins can view and manage archives
DROP POLICY IF EXISTS "Admins can view and manage nas_archives" ON public.nas_archives;
CREATE POLICY "Admins can view and manage nas_archives"
  ON public.nas_archives
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admins
      WHERE admins.user_id = auth.uid()
        AND admins.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admins
      WHERE admins.user_id = auth.uid()
        AND admins.is_active = true
    )
  );

-- Service role bypass for Edge Functions & RPCs
GRANT ALL ON public.nas_archives TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.nas_archives TO authenticated;

-- 2. Add NAS Archival & PDF Columns to visitor_registrations
ALTER TABLE public.visitor_registrations
  ADD COLUMN IF NOT EXISTS ticket_pdf_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ticket_pdf_url text,
  ADD COLUMN IF NOT EXISTS nas_backup_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS nas_backup_path text,
  ADD COLUMN IF NOT EXISTS nas_backup_at timestamptz,
  ADD COLUMN IF NOT EXISTS nas_backup_error text;

-- 3. Add NAS Archival & PDF Columns to participation_registrations
ALTER TABLE public.participation_registrations
  ADD COLUMN IF NOT EXISTS ticket_pdf_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ticket_pdf_url text,
  ADD COLUMN IF NOT EXISTS nas_backup_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS nas_backup_path text,
  ADD COLUMN IF NOT EXISTS nas_backup_at timestamptz,
  ADD COLUMN IF NOT EXISTS nas_backup_error text;

-- 4. Add NAS Archival & PDF Columns to registrations (Esports)
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS ticket_pdf_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ticket_pdf_url text,
  ADD COLUMN IF NOT EXISTS nas_backup_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS nas_backup_path text,
  ADD COLUMN IF NOT EXISTS nas_backup_at timestamptz,
  ADD COLUMN IF NOT EXISTS nas_backup_error text;

-- 5. Function to Record or Update NAS Archival Entry (Idempotent)
CREATE OR REPLACE FUNCTION public.record_nas_archive_entry(
  p_ticket_ref text,
  p_registration_type text,
  p_registration_id uuid,
  p_recipient_name text,
  p_recipient_email text,
  p_file_name text,
  p_nas_folder text,
  p_nas_relative_path text,
  p_file_size_bytes integer,
  p_sha256_checksum text,
  p_status text,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_archive_id uuid;
  v_now timestamptz := now();
  v_archived_at timestamptz := CASE WHEN p_status = 'completed' THEN v_now ELSE NULL END;
BEGIN
  INSERT INTO public.nas_archives (
    ticket_ref,
    registration_type,
    registration_id,
    recipient_name,
    recipient_email,
    file_name,
    nas_folder,
    nas_relative_path,
    file_size_bytes,
    sha256_checksum,
    status,
    error_message,
    archived_at,
    created_at,
    updated_at
  )
  VALUES (
    p_ticket_ref,
    p_registration_type,
    p_registration_id,
    p_recipient_name,
    p_recipient_email,
    p_file_name,
    p_nas_folder,
    p_nas_relative_path,
    p_file_size_bytes,
    p_sha256_checksum,
    p_status,
    p_error_message,
    v_archived_at,
    v_now,
    v_now
  )
  ON CONFLICT (ticket_ref, file_name)
  DO UPDATE SET
    status = EXCLUDED.status,
    error_message = EXCLUDED.error_message,
    file_size_bytes = coalesce(EXCLUDED.file_size_bytes, nas_archives.file_size_bytes),
    sha256_checksum = coalesce(EXCLUDED.sha256_checksum, nas_archives.sha256_checksum),
    nas_relative_path = coalesce(EXCLUDED.nas_relative_path, nas_archives.nas_relative_path),
    archived_at = CASE WHEN EXCLUDED.status = 'completed' THEN coalesce(nas_archives.archived_at, v_now) ELSE nas_archives.archived_at END,
    retry_count = nas_archives.retry_count + 1,
    updated_at = v_now
  RETURNING id INTO v_archive_id;

  -- Sync back to respective registration table
  IF p_registration_type = 'visitor' AND p_registration_id IS NOT NULL THEN
    UPDATE public.visitor_registrations
    SET
      ticket_pdf_generated = true,
      nas_backup_status = p_status,
      nas_backup_path = p_nas_relative_path,
      nas_backup_at = CASE WHEN p_status = 'completed' THEN v_now ELSE nas_backup_at END,
      nas_backup_error = p_error_message
    WHERE id = p_registration_id;
  ELSIF p_registration_type = 'participation' AND p_registration_id IS NOT NULL THEN
    UPDATE public.participation_registrations
    SET
      ticket_pdf_generated = true,
      nas_backup_status = p_status,
      nas_backup_path = p_nas_relative_path,
      nas_backup_at = CASE WHEN p_status = 'completed' THEN v_now ELSE nas_backup_at END,
      nas_backup_error = p_error_message
    WHERE id = p_registration_id;
  ELSIF p_registration_type = 'esports_team' AND p_registration_id IS NOT NULL THEN
    UPDATE public.registrations
    SET
      ticket_pdf_generated = true,
      nas_backup_status = p_status,
      nas_backup_path = p_nas_relative_path,
      nas_backup_at = CASE WHEN p_status = 'completed' THEN v_now ELSE nas_backup_at END,
      nas_backup_error = p_error_message
    WHERE id = p_registration_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'archive_id', v_archive_id,
    'status', p_status,
    'path', p_nas_relative_path
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_nas_archive_entry(text, text, uuid, text, text, text, text, text, integer, text, text, text) TO authenticated, service_role;
