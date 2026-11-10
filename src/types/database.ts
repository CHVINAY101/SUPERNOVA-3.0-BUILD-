export type RegistrationStatus = "pending" | "confirmed" | "declined" | "correction_requested";
export type MatchStatus = "upcoming" | "live" | "completed" | "postponed" | "cancelled";
export type AdminRole = "super_admin" | "event_admin" | "checkin_staff" | "score_operator";
export type CheckInStatus = "not_checked_in" | "checked_in";

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
  check_in_status: CheckInStatus;
  check_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: string;
  game_id: string | null;
  round: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  scheduled_start: string | null;
  score_a: number;
  score_b: number;
  status: MatchStatus;
  winner_id: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
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
  registration_id: string;
  player_id: string | null;
  check_in_type: "team" | "individual";
  checked_in_by: string | null;
  checked_in_at: string;
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
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AdminRole;
  created_at: string;
}
