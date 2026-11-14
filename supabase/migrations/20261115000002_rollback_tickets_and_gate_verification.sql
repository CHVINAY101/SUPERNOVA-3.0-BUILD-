-- ==============================================================================
-- ROLLBACK: 20261115000001_tickets_and_gate_verification.sql
-- Safely removes ticket triggers, RPCs, and public.tickets table without touching
-- existing visitor_registrations, participation_registrations, or registrations data.
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_visitor_sync_ticket ON public.visitor_registrations;
DROP TRIGGER IF EXISTS trg_participation_sync_ticket ON public.participation_registrations;
DROP TRIGGER IF EXISTS trg_esports_sync_ticket ON public.registrations;

DROP FUNCTION IF EXISTS public._trg_sync_ticket_on_registration_change();
DROP FUNCTION IF EXISTS public.checkin_gate_ticket(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.verify_gate_ticket(text, text);
DROP FUNCTION IF EXISTS public.lookup_public_ticket(text, text, text);
DROP FUNCTION IF EXISTS public.submit_visitor_and_issue_ticket(text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.issue_ticket_for_registration(text, uuid);
DROP FUNCTION IF EXISTS public._issue_ticket_internal(text, uuid);
DROP FUNCTION IF EXISTS public._is_registration_archived(timestamptz, text);

DROP TABLE IF EXISTS public.tickets;
