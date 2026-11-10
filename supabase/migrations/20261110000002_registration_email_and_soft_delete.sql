-- Idempotent migration for registration confirmation email tracking & soft-delete/archiving

ALTER TABLE public.visitor_registrations
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
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_type = 'visitor' THEN
    v_table := 'visitor_registrations';
    UPDATE public.visitor_registrations
    SET archived_at = pg_catalog.now(), archived_by = v_uid
    WHERE id = p_id AND archived_at IS NULL;
  ELSIF p_type = 'esports' THEN
    v_table := 'registrations';
    UPDATE public.registrations
    SET archived_at = pg_catalog.now(), archived_by = v_uid
    WHERE id = p_id AND archived_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Invalid registration type: %', p_type;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Record not found or already archived');
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, metadata)
  VALUES (
    v_uid,
    'archive_registration',
    v_table,
    p_id::text,
    jsonb_build_object('registration_type', p_type, 'archived_at', pg_catalog.now())
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_registration(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_registration(text, uuid) TO authenticated;
