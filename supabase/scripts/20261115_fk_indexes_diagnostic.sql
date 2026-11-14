-- ==============================================================================
-- SUPERNOVA 3.0 — LIVE DATABASE DIAGNOSTIC SCRIPT (READ-ONLY)
-- Target Project: https://cirreovughlncadrbvcn.supabase.co
-- Purpose:
--   Run this READ-ONLY script first in Supabase SQL Editor or psql before
--   applying index changes, to verify live schema, FK definitions, existing
--   indexes, invalid indexes, duplicate indexes, and live pg_stat usage.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Verify all 9 reported foreign-key constraints, exact column types,
--    ON DELETE actions, and whether any valid non-partial B-tree index covers them
-- ------------------------------------------------------------------------------
WITH fk_targets AS (
  SELECT unnest(ARRAY[
    'announcements_author_id_fkey',
    'check_ins_checked_in_by_fkey',
    'check_ins_player_id_fkey',
    'event_settings_updated_by_fkey',
    'matches_team_a_id_fkey',
    'matches_team_b_id_fkey',
    'matches_winner_id_fkey',
    'registration_controls_updated_by_fkey',
    'site_content_updated_by_fkey'
  ]) AS constraint_name
),
fk_info AS (
  SELECT
    c.conname AS constraint_name,
    n.nspname AS table_schema,
    cl.relname AS table_name,
    c.conrelid,
    c.conkey,
    c.confdeltype,
    fn.nspname || '.' || fcl.relname AS referenced_table,
    array_agg(a.attname ORDER BY u.ord) AS fk_columns,
    array_agg(format_type(a.atttypid, a.atttypmod) ORDER BY u.ord) AS fk_column_types
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  JOIN pg_class fcl ON fcl.oid = c.confrelid
  JOIN pg_namespace fn ON fn.oid = fcl.relnamespace
  JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
  WHERE c.contype = 'f'
    AND n.nspname = 'public'
    AND c.conname IN (SELECT constraint_name FROM fk_targets)
  GROUP BY c.conname, n.nspname, cl.relname, c.conrelid, c.conkey, c.confdeltype, fn.nspname, fcl.relname
)
SELECT
  f.constraint_name,
  f.table_schema || '.' || f.table_name AS table_fqn,
  f.fk_columns,
  f.fk_column_types,
  f.referenced_table,
  CASE f.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE f.confdeltype::text
  END AS on_delete_action,
  COALESCE(
    (
      SELECT array_agg(ic.relname ORDER BY ic.relname)
      FROM pg_index i
      JOIN pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_am am ON am.oid = ic.relam
      WHERE i.indrelid = f.conrelid
        AND i.indisvalid = true
        AND i.indisready = true
        AND i.indpred IS NULL
        AND am.amname = 'btree'
        AND (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(f.conkey, 1)] = f.conkey
    ),
    ARRAY[]::name[]
  ) AS covering_btree_indexes
FROM fk_info f
ORDER BY f.table_name, f.constraint_name;

-- ------------------------------------------------------------------------------
-- 2. Inspect ALL existing indexes on tables involved in Part A and Part B
-- ------------------------------------------------------------------------------
SELECT
  pi.schemaname,
  pi.tablename,
  pi.indexname,
  i.indisunique,
  i.indisprimary,
  i.indisvalid,
  i.indisready,
  pg_size_pretty(pg_relation_size(ic.oid)) AS index_size,
  pi.indexdef
FROM pg_indexes pi
JOIN pg_namespace n ON n.nspname = pi.schemaname
JOIN pg_class ic ON ic.relname = pi.indexname AND ic.relnamespace = n.oid
JOIN pg_index i ON i.indexrelid = ic.oid
WHERE pi.schemaname = 'public'
  AND pi.tablename IN (
    'announcements',
    'check_ins',
    'event_settings',
    'matches',
    'registration_controls',
    'site_content',
    'sponsors',
    'gallery_items',
    'registrations',
    'audit_logs',
    'institutions'
  )
ORDER BY pi.tablename, pi.indexname;

-- ------------------------------------------------------------------------------
-- 3. Detect exact duplicate / redundant B-tree indexes in public schema
-- ------------------------------------------------------------------------------
SELECT
  n.nspname AS schema_name,
  t.relname AS table_name,
  array_agg(ic.relname ORDER BY i.indisprimary DESC, i.indisunique DESC, ic.relname) AS duplicate_indexes,
  pg_get_indexdef(min(ic.oid)) AS sample_index_def,
  sum(pg_relation_size(ic.oid)) AS total_bytes,
  pg_size_pretty(sum(pg_relation_size(ic.oid))) AS total_size
FROM pg_index i
JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_class ic ON ic.oid = i.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND i.indisvalid
GROUP BY
  n.nspname,
  t.relname,
  i.indrelid,
  i.indkey::text,
  i.indclass::text,
  i.indcollation::text,
  i.indoption::text,
  COALESCE(pg_get_expr(i.indexprs, i.indrelid), ''),
  COALESCE(pg_get_expr(i.indpred, i.indrelid), '')
HAVING count(*) > 1
ORDER BY t.relname;

-- ------------------------------------------------------------------------------
-- 4. Inspect live usage stats & stats reset age for the 13 reported unused indexes
-- ------------------------------------------------------------------------------
SELECT
  (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()) AS db_stats_reset_at,
  s.relname AS table_name,
  s.indexrelname AS index_name,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  ut.n_live_tup AS est_live_rows,
  ut.seq_scan AS table_seq_scans,
  ut.idx_scan AS table_idx_scans,
  ut.n_tup_ins + ut.n_tup_upd + ut.n_tup_del AS total_table_writes,
  pg_get_indexdef(s.indexrelid) AS index_def
FROM pg_stat_user_indexes s
JOIN pg_stat_user_tables ut ON ut.relid = s.relid
WHERE s.schemaname = 'public'
  AND s.indexrelname IN (
    'idx_site_content_published',
    'idx_sponsors_published',
    'idx_gallery_category',
    'idx_registrations_ref',
    'idx_registrations_team_name',
    'idx_registrations_captain',
    'idx_registrations_email',
    'idx_registrations_status',
    'idx_matches_game',
    'idx_matches_published',
    'idx_announcements_published',
    'idx_audit_entity',
    'idx_institutions_published',
    -- Also inspect sibling/unique indexes for comparison:
    'registrations_registration_ref_key',
    'idx_registrations_ref_lower',
    'idx_matches_game_id'
  )
ORDER BY s.relname, s.indexrelname;
