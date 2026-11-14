export type RegistrationStatus =
  | "pending"
  | "confirmed"
  | "declined"
  | "withdrawn"
  | "correction_requested";

export type TournamentSelectionStatus =
  | "awaiting_selection"
  | "selected"
  | "not_selected"
  | "waitlisted"
  | "disqualified";

export type MatchStatus =
  | "upcoming"
  | "scheduled"
  | "check_in"
  | "ready"
  | "live"
  | "result_submitted"
  | "completed"
  | "disputed"
  | "postponed"
  | "cancelled";

export type EventDaySession = "2026-11-20" | "2026-11-21";

export type TournamentFormat =
  | "single_elimination"
  | "double_elimination"
  | "round_robin"
  | "group_knockout"
  | "custom";

export type TournamentScoringMode =
  | "round_based"
  | "battle_royale"
  | "group_points"
  | "custom";

export type AdminRole =
  | "super_admin"
  | "crm_admin"
  | "registration_staff"
  | "esports_entry_staff"
  | "participation_manager"
  | "esports_manager"
  | "match_conductor"
  | "content_manager"
  | "viewer"
  | "event_admin"
  | "checkin_staff"
  | "score_operator";
export type AccountStatus = "invited" | "active" | "deactivated" | "revoked";
export type CheckInStatus = "not_checked_in" | "checked_in";

export interface CrmUserSummary {
  user_id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
  account_status: AccountStatus;
  created_at: string;
  last_login_at?: string | null;
  invited_at?: string | null;
  activated_at?: string | null;
  deactivated_at?: string | null;
  overrides: { permission_key: string; allowed: boolean }[];
}

export interface CrmInvitation {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_at: string;
  accepted_at?: string | null;
  custom_permissions?: Record<string, boolean> | null;
}

export interface EventSetting {
  id: string;
  key: string;
  label: string;
  value: string | null;
  is_published: boolean;
  category: string;
  updated_by: string | null;
  updated_at: string;
}

export interface SiteContent {
  id: string;
  section: string;
  title: string;
  body: string | null;
  is_published: boolean;
  sort_order: number;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export interface Game {
  id: string;
  title: string;
  description: string | null;
  rules: string | null;
  team_size: number | null;
  substitutes_count?: number;
  max_teams?: number | null;
  match_format?: string | null;
  scoring_mode?: TournamentScoringMode;
  scoring_config?: Record<string, unknown> | null;
  match_duration_minutes?: number | null;
  tournament_status?: "draft" | "open" | "bracket_ready" | "in_progress" | "completed";
  assigned_conductor_ids?: string[] | null;
  is_active: boolean;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Sponsor {
  id: string;
  name: string;
  tier: string | null;
  description: string | null;
  logo_url: string | null;
  link_url: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface GalleryItem {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string;
  category: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduleItem {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  description: string | null;
  venue: string | null;
  component: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Registration {
  id: string;
  registration_ref: string;
  team_name: string;
  game_id: string;
  captain_name: string;
  email: string;
  phone: string;
  institution: string | null;
  status: RegistrationStatus;
  selection_status?: TournamentSelectionStatus;
  selection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  seed_number?: number | null;
  group_name?: string | null;
  check_in_status?: CheckInStatus;
  checked_in_at?: string | null;
  checked_in_by?: string | null;
  admin_notes: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface ParticipationRegistration {
  id: string;
  registration_ref: string;
  full_name: string;
  email: string;
  phone: string;
  institution: string | null;
  participant_category: string;
  participation_area: string;
  project_title: string | null;
  project_description: string | null;
  team_members_count: number;
  status: RegistrationStatus;
  admin_notes: string | null;
  submitted_at: string;
}

export interface VisitorRegistration {
  id: string;
  registration_ref: string;
  full_name: string;
  email: string;
  phone: string;
  institution: string | null;
  visitor_category: string;
  visitor_count: number;
  status: RegistrationStatus;
  check_in_status?: CheckInStatus;
  checked_in_at?: string | null;
  checked_in_by?: string | null;
  admin_notes: string | null;
  submitted_at: string;
}

export interface InstitutionItem {
  id: string;
  name: string;
  role: string;
  description: string | null;
  is_published: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface RegistrationControl {
  form_type: "esports" | "participation" | "visitor";
  is_open: boolean;
  closed_message: string | null;
  opens_at: string | null;
  closes_at: string | null;
  intro_text: string | null;
  consent_text: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface FormOption {
  id: string;
  form_type: "esports" | "participation" | "visitor";
  field_key: string;
  label: string;
  value: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MediaItem {
  id: string;
  title: string;
  url: string;
  storage_path?: string | null;
  alt_text: string | null;
  caption: string | null;
  file_size: string;
  mime_type?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface Player {
  id: string;
  registration_id: string;
  player_name: string;
  gamer_tag: string | null;
  player_ticket_ref?: string | null;
  roster_role?: "captain" | "starter" | "substitute";
  is_verified?: boolean;
  check_in_status: CheckInStatus;
  check_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: string;
  tournament_id?: string | null;
  game_id: string | null;
  round: string | null;
  round_number?: number;
  match_number?: number;
  bracket_side?: "winners" | "losers" | "grand_final" | "group" | "knockout";
  group_name?: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  scheduled_start: string | null;
  station?: string | null;
  conductor_id?: string | null;
  conductor_email?: string | null;
  match_format?: string | null;
  score_a: number;
  score_b: number;
  detailed_scores?: Record<string, unknown> | null;
  status: MatchStatus;
  result_status?: "pending" | "submitted" | "confirmed" | "rejected" | "disputed";
  winner_id: string | null;
  next_match_id?: string | null;
  next_match_slot?: "a" | "b" | null;
  loser_next_match_id?: string | null;
  loser_next_match_slot?: "a" | "b" | null;
  submitted_by?: string | null;
  submitted_at?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  bracket_advanced_at?: string | null;
  notes?: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tournament {
  id: string;
  game_id: string;
  name: string;
  format: TournamentFormat;
  scoring_mode: TournamentScoringMode;
  seeding_mode: "manual" | "random" | "registration_order";
  require_manager_confirmation: boolean;
  rules_snapshot?: Record<string, unknown> | null;
  status: "draft" | "published" | "locked" | "completed";
  has_started: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchAttendance {
  id: string;
  match_id: string;
  registration_id: string;
  player_id?: string | null;
  present: boolean;
  verified_by?: string | null;
  verified_at?: string | null;
  notes?: string | null;
}

export interface MatchDispute {
  id: string;
  match_id: string;
  reported_by: string | null;
  reported_by_email?: string | null;
  reason: string;
  status: "open" | "under_review" | "resolved" | "dismissed";
  original_submission?: Record<string, unknown> | null;
  resolution_notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface WristbandCategory {
  id: string;
  name: string;
  slug: string;
  audience: "visitor" | "esports" | "general";
  color_hex: string;
  badge_label?: string | null;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

export interface TeamStatusHistoryEntry {
  id: string;
  registration_id: string;
  change_type: "registration_status" | "selection_status";
  previous_value: string | null;
  next_value: string;
  reason: string | null;
  changed_by: string | null;
  changed_by_email?: string | null;
  created_at: string;
}

export interface WristbandIssuance {
  id: string;
  category_id: string;
  category_name: string;
  ticket_ref: string;
  holder_name: string;
  subject_type: "visitor" | "esports_player" | "esports_team";
  event_day: EventDaySession;
  wristband_code?: string | null;
  issued_by: string | null;
  issued_by_email?: string | null;
  issued_at: string;
  status: "active" | "replaced" | "voided";
  replaced_by_id?: string | null;
  replacement_reason?: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category?: string | null;
  is_pinned: boolean;
  is_published: boolean;
  author_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckIn {
  id: string;
  registration_id: string | null;
  player_id: string | null;
  ticket_ref?: string | null;
  subject_type?: "visitor" | "esports_player" | "esports_team" | "participation";
  event_day?: EventDaySession;
  check_in_type: "team" | "individual";
  checked_in_by: string | null;
  checked_in_by_email?: string | null;
  checked_in_at: string;
  wristband_category?: string | null;
  wristband_id?: string | null;
  is_override?: boolean;
  override_reason?: string | null;
  supervisor_id?: string | null;
  notes: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  full_name?: string | null;
  email?: string | null;
  account_status?: AccountStatus;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AdminRole;
  created_at: string;
}

export type CrmEmailStatus = "pending" | "sending" | "sent" | "failed";

export interface CrmEmail {
  id: string;
  recipient: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  body_html: string;
  sender_email: string;
  sent_by?: string | null;
  sent_by_email?: string | null;
  status: CrmEmailStatus;
  gmail_message_id?: string | null;
  gmail_thread_id?: string | null;
  error_message?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  sent_at?: string | null;
}

export type TicketCategory = "visitor" | "participation" | "esports";
export type TicketRecordStatus = "active" | "cancelled" | "revoked";
export type GateVerdict = "VALID" | "ALREADY USED" | "INVALID";

export interface TicketRecord {
  id: string;
  ticket_ref: string;
  qr_token: string;
  registration_id: string;
  registration_category: TicketCategory;
  registration_ref: string;
  display_name: string;
  subtitle?: string | null;
  institution?: string | null;
  metadata?: Record<string, unknown> | null;
  status: TicketRecordStatus | string;
  registration_status?: string | null;
  issued_at: string;
  checked_in_at?: string | null;
  checked_in_by?: string | null;
  checked_in_by_email?: string | null;
}

export interface GateVerificationResult {
  ok: boolean;
  verdict: GateVerdict;
  can_check_in: boolean;
  reason?: string;
  error?: string;
  ticket?: Omit<TicketRecord, "qr_token"> & { qr_token?: string };
}

export interface PublicTicketLookupResult {
  ok: boolean;
  status: "issued" | "pending_approval" | "not_eligible" | "not_found" | "invalid_input" | "error";
  registration_category?: TicketCategory;
  registration_status?: string;
  error?: string;
  ticket?: TicketRecord;
}

