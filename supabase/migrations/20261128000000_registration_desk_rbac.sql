-- ==============================================================================
-- SUPERNOVA 3.0 — REGISTRATION DESK RBAC MIGRATION
-- Idempotent migration that repurposes `registration_staff` to the dedicated
-- Registration Desk Portal while keeping `checkin_staff` and `esports_entry_staff`
-- assigned to their appropriate Gate Operations.
-- Does NOT alter any live game or portal registration_open settings.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.normalize_crm_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'super_admin' THEN 'super_admin'
    WHEN 'crm_admin' THEN 'crm_admin'
    WHEN 'event_admin' THEN 'crm_admin'
    WHEN 'registration_staff' THEN 'registration_staff'
    WHEN 'checkin_staff' THEN 'checkin_staff'
    WHEN 'esports_entry_staff' THEN 'esports_entry_staff'
    WHEN 'participation_manager' THEN 'viewer'
    WHEN 'esports_manager' THEN 'esports_manager'
    WHEN 'score_operator' THEN 'esports_manager'
    WHEN 'match_conductor' THEN 'match_conductor'
    WHEN 'content_manager' THEN 'content_manager'
    WHEN 'viewer' THEN 'viewer'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.role_default_permissions(p_role text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE public.normalize_crm_role(p_role)
    WHEN 'super_admin' THEN ARRAY[
      'dashboard:view',
      'visitor:view','visitor:create','visitor:edit','visitor:delete','visitor:export',
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'entry:view','entry:scan_visitor','entry:checkin_visitor','entry:scan_esports','entry:checkin_esports','entry:issue_wristband','entry:override_checkin','entry:manage_wristbands',
      'tickets:view','tickets:manage',
      'tournament:manage_games','tournament:select_teams','tournament:build_bracket','tournament:assign_conductors','tournament:confirm_results','tournament:resolve_disputes',
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute',
      'announcements:view','announcements:create','announcements:edit','announcements:publish','announcements:delete',
      'gallery:view','gallery:upload','gallery:edit','gallery:delete',
      'event_info:view','event_info:create','event_info:edit','event_info:publish',
      'social_links:view','social_links:edit',
      'reports:view','reports:export',
      'user_management:view','user_management:invite','user_management:edit','user_management:deactivate','user_management:delete','user_management:assign_permissions',
      'system_settings:view','system_settings:manage'
    ]
    WHEN 'crm_admin' THEN ARRAY[
      'dashboard:view',
      'visitor:view','visitor:create','visitor:edit','visitor:delete','visitor:export',
      'entry:view','entry:scan_visitor','entry:checkin_visitor','entry:scan_esports','entry:checkin_esports','entry:issue_wristband','entry:override_checkin',
      'tickets:view','tickets:manage',
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'tournament:manage_games','tournament:select_teams','tournament:build_bracket','tournament:assign_conductors','tournament:confirm_results','tournament:resolve_disputes',
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute',
      'announcements:view','announcements:create','announcements:edit','announcements:publish','announcements:delete',
      'gallery:view','gallery:upload','gallery:edit','gallery:delete',
      'event_info:view','event_info:create','event_info:edit','event_info:publish',
      'social_links:view','social_links:edit',
      'reports:view','reports:export',
      'system_settings:view'
    ]
    WHEN 'registration_staff' THEN ARRAY[
      'visitor:view','visitor:create','visitor:edit',
      'esports:view','esports:create',
      'tickets:view','tickets:manage'
    ]
    WHEN 'checkin_staff' THEN ARRAY[
      'visitor:view',
      'entry:view','entry:scan_visitor','entry:checkin_visitor','entry:issue_wristband',
      'tickets:view','tickets:manage'
    ]
    WHEN 'esports_entry_staff' THEN ARRAY[
      'entry:view','entry:scan_esports','entry:checkin_esports','entry:issue_wristband',
      'tickets:view','tickets:manage'
    ]
    WHEN 'esports_manager' THEN ARRAY[
      'dashboard:view',
      'esports:view','esports:create','esports:edit','esports:approve','esports:reject','esports:export',
      'tournament:manage_games','tournament:select_teams','tournament:build_bracket','tournament:assign_conductors','tournament:confirm_results','tournament:resolve_disputes',
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute',
      'entry:scan_esports','tickets:view','tickets:manage','reports:view'
    ]
    WHEN 'match_conductor' THEN ARRAY[
      'conductor:view_assigned','conductor:verify_roster','conductor:start_match','conductor:submit_result','conductor:report_dispute'
    ]
    WHEN 'content_manager' THEN ARRAY[
      'dashboard:view',
      'announcements:view','announcements:create','announcements:edit','announcements:publish','announcements:delete',
      'gallery:view','gallery:upload','gallery:edit','gallery:delete',
      'event_info:view','event_info:create','event_info:edit','event_info:publish',
      'social_links:view','social_links:edit'
    ]
    WHEN 'viewer' THEN ARRAY[
      'dashboard:view',
      'visitor:view','esports:view','tickets:view',
      'announcements:view','gallery:view','event_info:view','social_links:view',
      'reports:view'
    ]
    ELSE ARRAY[]::text[]
  END;
$$;
