-- ==============================================================================
-- SUPERNOVA 3.0 — UNIFIED REGISTRATION, AUTOMATIC VISITOR ENTRY & EMAIL TICKETING
-- Migration: 20261112000001_unified_registration_and_ticketing.sql
-- ==============================================================================

-- 1. Ensure registration_ref_seq sequence exists
CREATE SEQUENCE IF NOT EXISTS public.registration_ref_seq
  AS integer START 1 INCREMENT 1 MINVALUE 1;

-- 2. Enhanced Ticket Generator with Prefix Support
CREATE OR REPLACE FUNCTION public.generate_ticket_ref(p_prefix text DEFAULT 'SN3-26')
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(p_prefix, 'SN3-26') || '-' || lpad(nextval('public.registration_ref_seq')::text, 6, '0');
$$;

GRANT EXECUTE ON FUNCTION public.generate_ticket_ref(text) TO anon, authenticated;

-- 3. Add Linking & Email Tracking Columns to visitor_registrations
ALTER TABLE public.visitor_registrations
  ADD COLUMN IF NOT EXISTS ticket_ref text,
  ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS linked_registration_ref text,
  ADD COLUMN IF NOT EXISTS linked_team_name text,
  ADD COLUMN IF NOT EXISTS linked_project_title text,
  ADD COLUMN IF NOT EXISTS linked_player_id uuid,
  ADD COLUMN IF NOT EXISTS email_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text;

-- 4. Add Linking & Email Tracking Columns to participation_registrations
ALTER TABLE public.participation_registrations
  ADD COLUMN IF NOT EXISTS visitor_id uuid,
  ADD COLUMN IF NOT EXISTS visitor_ticket_ref text,
  ADD COLUMN IF NOT EXISTS email_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text;

-- 5. Add Linking & Email Tracking Columns to esports registrations
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS captain_ticket_ref text,
  ADD COLUMN IF NOT EXISTS email_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text;

-- 6. Add Ticket Columns to esports players
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS visitor_id uuid,
  ADD COLUMN IF NOT EXISTS visitor_ticket_ref text;

-- 7. Ensure Indexes for Fast Lookup & Deduplication
CREATE INDEX IF NOT EXISTS idx_visitor_ticket_ref ON public.visitor_registrations(ticket_ref);
CREATE INDEX IF NOT EXISTS idx_visitor_linked_ref ON public.visitor_registrations(linked_registration_ref);
CREATE INDEX IF NOT EXISTS idx_visitor_email_lower ON public.visitor_registrations(lower(email));
CREATE INDEX IF NOT EXISTS idx_visitor_source ON public.visitor_registrations(registration_source);
CREATE INDEX IF NOT EXISTS idx_participation_ticket_ref ON public.participation_registrations(visitor_ticket_ref);
CREATE INDEX IF NOT EXISTS idx_players_ticket_ref ON public.players(visitor_ticket_ref);

-- 8. Backfill existing visitor ticket_ref where missing
UPDATE public.visitor_registrations
SET ticket_ref = registration_ref
WHERE ticket_ref IS NULL AND registration_ref IS NOT NULL;

-- 9. Function to Get or Create Deduplicated Visitor Record
CREATE OR REPLACE FUNCTION public.get_or_create_unified_visitor(
  p_full_name text,
  p_email text,
  p_phone text,
  p_institution text,
  p_source text,
  p_linked_ref text,
  p_extra_info jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_phone text := regexp_replace(coalesce(p_phone, ''), '[\s\-+()]', '', 'g');
  v_clean_name text := trim(coalesce(p_full_name, ''));
  v_existing record;
  v_ticket text;
  v_visitor_id uuid;
  v_is_new boolean := false;
BEGIN
  -- 1. Check for genuine existing visitor record (matching email and either phone or name)
  SELECT id, registration_ref, ticket_ref INTO v_existing
  FROM public.visitor_registrations
  WHERE lower(email) = v_clean_email
    AND (
      v_clean_phone = '' 
      OR regexp_replace(phone, '[\s\-+()]', '', 'g') = v_clean_phone
      OR lower(full_name) = lower(v_clean_name)
    )
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    v_visitor_id := v_existing.id;
    v_ticket := coalesce(v_existing.ticket_ref, v_existing.registration_ref);

    -- Ensure ticket_ref is set
    UPDATE public.visitor_registrations
    SET 
      ticket_ref = v_ticket,
      linked_registration_ref = coalesce(linked_registration_ref, p_linked_ref),
      admin_notes = coalesce(admin_notes, '') || ' [LINKED FROM ' || upper(p_source) || ': ' || p_linked_ref || ']'
    WHERE id = v_visitor_id;

    RETURN jsonb_build_object(
      'visitor_id', v_visitor_id,
      'ticket_ref', v_ticket,
      'is_existing', true
    );
  END IF;

  -- 2. Create new visitor ticket
  v_ticket := public.generate_ticket_ref('SN3-26');

  INSERT INTO public.visitor_registrations (
    full_name,
    email,
    phone,
    institution,
    visitor_category,
    visitor_count,
    registration_source,
    linked_registration_ref,
    ticket_ref,
    consent_given,
    status,
    admin_notes,
    metadata
  )
  VALUES (
    v_clean_name,
    v_clean_email,
    v_clean_phone,
    nullif(trim(coalesce(p_institution, '')), ''),
    CASE 
      WHEN p_source = 'participation' THEN 'Project Participant'
      WHEN p_source = 'esports' THEN 'Esports Competitor'
      ELSE 'General Visitor'
    END,
    1,
    p_source,
    p_linked_ref,
    v_ticket,
    true,
    'pending',
    '[AUTO-GENERATED TICKET FOR ' || upper(p_source) || ' REF: ' || p_linked_ref || ']',
    p_extra_info
  )
  RETURNING id INTO v_visitor_id;

  RETURN jsonb_build_object(
    'visitor_id', v_visitor_id,
    'ticket_ref', v_ticket,
    'is_existing', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_unified_visitor(text, text, text, text, text, text, jsonb) TO anon, authenticated;
