-- ==============================================================================
-- SUPERNOVA 3.0 — CRM EMAILS AND GMAIL AUDIT LOG TABLE
-- Migration: 20261112000000_crm_emails_and_gmail_log.sql
-- ==============================================================================

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
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- Indexes for fast CRM lookup and idempotency deduplication
CREATE INDEX IF NOT EXISTS idx_crm_emails_recipient ON public.crm_emails(recipient);
CREATE INDEX IF NOT EXISTS idx_crm_emails_status ON public.crm_emails(status);
CREATE INDEX IF NOT EXISTS idx_crm_emails_created_at ON public.crm_emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_emails_idempotency_key ON public.crm_emails(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.crm_emails ENABLE ROW LEVEL SECURITY;

-- Administrators can view all sent and attempted CRM communications
CREATE POLICY "Admins can view CRM emails"
  ON public.crm_emails
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Administrators can insert new CRM email logs
CREATE POLICY "Admins can insert CRM emails"
  ON public.crm_emails
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- Administrators can update status (e.g. retries)
CREATE POLICY "Admins can update CRM emails"
  ON public.crm_emails
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
