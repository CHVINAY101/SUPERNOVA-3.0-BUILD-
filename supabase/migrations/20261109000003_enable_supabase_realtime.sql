-- ============================================================================
-- SUPERNOVA 3.0 — SUPABASE REALTIME PUBLICATION VERIFICATION & MIGRATION
-- Migration Version: 20261109000003_enable_supabase_realtime.sql
-- Targets: https://cirreovughlncadrbvcn.supabase.co
-- Description:
--   Idempotently ensures all target tables are added to the 'supabase_realtime' publication:
--   1. Public Content: matches, announcements, schedule_items, games, sponsors,
--      gallery_items, event_settings, faq_items, site_content
--   2. Private Admin Operations: registrations, players, visitor_registrations, check_ins
--   3. Sets REPLICA IDENTITY FULL where needed for accurate update/delete payloads.
-- ============================================================================

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'matches',
    'announcements',
    'schedule_items',
    'games',
    'sponsors',
    'gallery_items',
    'event_settings',
    'faq_items',
    'site_content',
    'registrations',
    'players',
    'visitor_registrations',
    'participation_registrations',
    'registration_controls',
    'institutions',
    'check_ins'
  ];
BEGIN
  -- 1. Ensure publication exists
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- 2. Add each existing table idempotently
  FOREACH v_table IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      -- Check if table is already in supabase_realtime
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', v_table);
        RAISE NOTICE 'Added table % to supabase_realtime publication', v_table;
      ELSE
        RAISE NOTICE 'Table % is already present in supabase_realtime publication', v_table;
      END IF;

      -- Set REPLICA IDENTITY FULL to ensure Realtime receives complete previous record on UPDATE/DELETE
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL;', v_table);
    END IF;
  END LOOP;
END $$;
