export type CanonicalCrmRole =
  | "super_admin"
  | "crm_admin"
  | "registration_staff"
  | "checkin_staff"
  | "esports_entry_staff"
  | "esports_manager"
  | "match_conductor"
  | "content_manager"
  | "viewer";

export type LegacyAdminRole = "event_admin" | "score_operator";

export type AdminRole = CanonicalCrmRole | LegacyAdminRole;

export type AccountStatus = "invited" | "active" | "deactivated" | "revoked";

export type PermissionKey =
  | "dashboard:view"
  | "visitor:view"
  | "visitor:create"
  | "visitor:edit"
  | "visitor:delete"
  | "visitor:export"
  | "esports:view"
  | "esports:create"
  | "esports:edit"
  | "esports:approve"
  | "esports:reject"
  | "esports:export"
  | "entry:view"
  | "entry:scan_visitor"
  | "entry:checkin_visitor"
  | "entry:scan_esports"
  | "entry:checkin_esports"
  | "entry:issue_wristband"
  | "entry:override_checkin"
  | "entry:manage_wristbands"
  | "tickets:view"
  | "tickets:manage"
  | "tournament:manage_games"
  | "tournament:select_teams"
  | "tournament:build_bracket"
  | "tournament:assign_conductors"
  | "tournament:confirm_results"
  | "tournament:resolve_disputes"
  | "conductor:view_assigned"
  | "conductor:verify_roster"
  | "conductor:start_match"
  | "conductor:submit_result"
  | "conductor:report_dispute"
  | "announcements:view"
  | "announcements:create"
  | "announcements:edit"
  | "announcements:publish"
  | "announcements:delete"
  | "gallery:view"
  | "gallery:upload"
  | "gallery:edit"
  | "gallery:delete"
  | "event_info:view"
  | "event_info:create"
  | "event_info:edit"
  | "event_info:publish"
  | "social_links:view"
  | "social_links:edit"
  | "reports:view"
  | "reports:export"
  | "user_management:view"
  | "user_management:invite"
  | "user_management:edit"
  | "user_management:deactivate"
  | "user_management:delete"
  | "user_management:assign_permissions"
  | "system_settings:view"
  | "system_settings:manage";

export interface PermissionGroupDefinition {
  id: string;
  label: string;
  description: string;
  permissions: { key: PermissionKey; label: string }[];
}

export const PERMISSION_GROUPS: PermissionGroupDefinition[] = [
  {
    id: "dashboard",
    label: "CRM Dashboard",
    description: "Main command center overview and live festival telemetry",
    permissions: [{ key: "dashboard:view", label: "View Dashboard" }],
  },
  {
    id: "visitor",
    label: "Visitor Registration",
    description: "Visitor passes, walk-in records, and attendee details",
    permissions: [
      { key: "visitor:view", label: "View" },
      { key: "visitor:create", label: "Create" },
      { key: "visitor:edit", label: "Edit" },
      { key: "visitor:delete", label: "Delete / Archive" },
      { key: "visitor:export", label: "Export" },
    ],
  },
  {
    id: "entry",
    label: "Event Entry, Tickets & Wristbands",
    description: "QR scanning, gate verification, ticket management, check-in, wristbands, and overrides",
    permissions: [
      { key: "entry:view", label: "View Entry Desk" },
      { key: "entry:scan_visitor", label: "Scan Visitor Passes" },
      { key: "entry:checkin_visitor", label: "Check In Visitors" },
      { key: "entry:scan_esports", label: "Scan Esports Passes" },
      { key: "entry:checkin_esports", label: "Check In Esports Players" },
      { key: "entry:issue_wristband", label: "Issue Wristbands" },
      { key: "entry:override_checkin", label: "Supervisor Override" },
      { key: "entry:manage_wristbands", label: "Configure Wristbands" },
      { key: "tickets:view", label: "View Tickets" },
      { key: "tickets:manage", label: "Issue / Manage Tickets" },
    ],
  },
  {
    id: "esports",
    label: "Esports Teams & Players",
    description: "Tournament squad rosters, approvals, and exports",
    permissions: [
      { key: "esports:view", label: "View" },
      { key: "esports:create", label: "Create" },
      { key: "esports:edit", label: "Edit" },
      { key: "esports:approve", label: "Approve" },
      { key: "esports:reject", label: "Reject" },
      { key: "esports:export", label: "Export" },
    ],
  },
  {
    id: "tournament",
    label: "Esports Tournament & Conductor Ops",
    description: "Game configuration, bracket builder, conductor scoring, and disputes",
    permissions: [
      { key: "tournament:manage_games", label: "Configure Games" },
      { key: "tournament:select_teams", label: "Select Tournament Teams" },
      { key: "tournament:build_bracket", label: "Build Brackets" },
      { key: "tournament:assign_conductors", label: "Assign Conductors" },
      { key: "tournament:confirm_results", label: "Confirm Results" },
      { key: "tournament:resolve_disputes", label: "Resolve Disputes" },
      { key: "conductor:view_assigned", label: "View Assigned Matches" },
      { key: "conductor:verify_roster", label: "Verify Match Rosters" },
      { key: "conductor:start_match", label: "Start Assigned Matches" },
      { key: "conductor:submit_result", label: "Submit Match Results" },
      { key: "conductor:report_dispute", label: "Escalate Disputes" },
    ],
  },
  {
    id: "announcements",
    label: "Announcements",
    description: "Official portal updates, alerts, and pinned notices",
    permissions: [
      { key: "announcements:view", label: "View" },
      { key: "announcements:create", label: "Create" },
      { key: "announcements:edit", label: "Edit" },
      { key: "announcements:publish", label: "Publish" },
      { key: "announcements:delete", label: "Delete" },
    ],
  },
  {
    id: "gallery",
    label: "Gallery & Media",
    description: "Festival photo uploads, captions, and media library",
    permissions: [
      { key: "gallery:view", label: "View" },
      { key: "gallery:upload", label: "Upload" },
      { key: "gallery:edit", label: "Edit" },
      { key: "gallery:delete", label: "Delete" },
    ],
  },
  {
    id: "event_info",
    label: "Event Information",
    description: "Schedule, page copy, sponsors, FAQs, games, and schools",
    permissions: [
      { key: "event_info:view", label: "View" },
      { key: "event_info:create", label: "Create" },
      { key: "event_info:edit", label: "Edit" },
      { key: "event_info:publish", label: "Publish" },
    ],
  },
  {
    id: "social_links",
    label: "Social Links",
    description: "Public festival contact channels and social handles",
    permissions: [
      { key: "social_links:view", label: "View" },
      { key: "social_links:edit", label: "Edit" },
    ],
  },
  {
    id: "reports",
    label: "Reports & Data Exports",
    description: "Attendance analytics and registration CSV/Excel exports",
    permissions: [
      { key: "reports:view", label: "View" },
      { key: "reports:export", label: "Export" },
    ],
  },
  {
    id: "user_management",
    label: "User Management",
    description: "View staff directory, add/invite CRM users, edit roles, deactivate, or delete accounts",
    permissions: [
      { key: "user_management:view", label: "View Directory" },
      { key: "user_management:invite", label: "Add / Invite Users" },
      { key: "user_management:edit", label: "Edit User & Role" },
      { key: "user_management:deactivate", label: "Deactivate / Reactivate" },
      { key: "user_management:delete", label: "Delete Account" },
      { key: "user_management:assign_permissions", label: "Assign Permissions" },
    ],
  },
  {
    id: "system_settings",
    label: "System Settings",
    description: "Event settings, form options, registration switches, audit logs",
    permissions: [
      { key: "system_settings:view", label: "View" },
      { key: "system_settings:manage", label: "Manage" },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key)
);

export const ROLE_PRIORITY: Record<string, number> = {
  super_admin: 100,
  crm_admin: 90,
  event_admin: 85,
  esports_manager: 80,
  score_operator: 75,
  esports_entry_staff: 70,
  registration_staff: 65,
  checkin_staff: 60,
  match_conductor: 55,
  content_manager: 50,
  participation_manager: 20,
  viewer: 10,
};

export const ROLE_METADATA: Record<
  CanonicalCrmRole,
  { label: string; description: string; badgeTone: string }
> = {
  super_admin: {
    label: "Super Admin",
    description: "Full system access including user management, wristband config, and settings.",
    badgeTone: "bg-slate-900 text-white border-slate-900",
  },
  crm_admin: {
    label: "CRM Admin",
    description: "Operational management across registrations, entry, tournaments, and event content.",
    badgeTone: "bg-blue-50 text-blue-700 border-blue-200",
  },
  registration_staff: {
    label: "Registration Staff",
    description: "Dedicated Registration Desk Portal for walk-in visitor passes, esports squad intake, search, and read-only capacity monitoring.",
    badgeTone: "bg-sky-50 text-sky-800 border-sky-200",
  },
  checkin_staff: {
    label: "Entry Staff (Visitors)",
    description: "Event Entry & Verification Centre for visitor QR scanning, check-in, and wristbands.",
    badgeTone: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  esports_entry_staff: {
    label: "Esports Entry Staff",
    description: "Esports gate verification: scan player passes, verify team eligibility, issue esports wristbands.",
    badgeTone: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  esports_manager: {
    label: "Esports Manager",
    description: "Review teams, select tournament squads, configure games, build brackets, and confirm results.",
    badgeTone: "bg-purple-50 text-purple-700 border-purple-200",
  },
  match_conductor: {
    label: "Match Conductor",
    description: "Operate assigned matches only: verify rosters, record attendance, start matches, and submit scores.",
    badgeTone: "bg-orange-50 text-orange-800 border-orange-200",
  },
  content_manager: {
    label: "Content Manager",
    description: "Manage website announcements, gallery photos, event info, and social links.",
    badgeTone: "bg-cyan-50 text-cyan-800 border-cyan-200",
  },
  viewer: {
    label: "Viewer",
    description: "Explicitly granted read-only access with zero edit or delete privileges.",
    badgeTone: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

export function normalizeRole(role: string | null | undefined): CanonicalCrmRole | null {
  if (!role) return null;
  switch (role) {
    case "super_admin":
      return "super_admin";
    case "crm_admin":
    case "event_admin":
      return "crm_admin";
    case "registration_staff":
      return "registration_staff";
    case "checkin_staff":
      return "checkin_staff";
    case "esports_entry_staff":
      return "esports_entry_staff";
    case "participation_manager":
      return "viewer";
    case "esports_manager":
    case "score_operator":
      return "esports_manager";
    case "match_conductor":
      return "match_conductor";
    case "content_manager":
      return "content_manager";
    case "viewer":
      return "viewer";
    default:
      return null;
  }
}

export function getRoleLabel(role: string | null | undefined): string {
  const canonical = normalizeRole(role);
  return canonical ? ROLE_METADATA[canonical].label : "Restricted";
}

export const ROLE_DEFAULT_PERMISSIONS: Record<CanonicalCrmRole, PermissionKey[]> = {
  super_admin: [...ALL_PERMISSIONS],
  crm_admin: [
    "dashboard:view",
    "visitor:view",
    "visitor:create",
    "visitor:edit",
    "visitor:delete",
    "visitor:export",
    "entry:view",
    "entry:scan_visitor",
    "entry:checkin_visitor",
    "entry:scan_esports",
    "entry:checkin_esports",
    "entry:issue_wristband",
    "entry:override_checkin",
    "tickets:view",
    "tickets:manage",
    "esports:view",
    "esports:create",
    "esports:edit",
    "esports:approve",
    "esports:reject",
    "esports:export",
    "tournament:manage_games",
    "tournament:select_teams",
    "tournament:build_bracket",
    "tournament:assign_conductors",
    "tournament:confirm_results",
    "tournament:resolve_disputes",
    "conductor:view_assigned",
    "conductor:verify_roster",
    "conductor:start_match",
    "conductor:submit_result",
    "conductor:report_dispute",
    "announcements:view",
    "announcements:create",
    "announcements:edit",
    "announcements:publish",
    "announcements:delete",
    "gallery:view",
    "gallery:upload",
    "gallery:edit",
    "gallery:delete",
    "event_info:view",
    "event_info:create",
    "event_info:edit",
    "event_info:publish",
    "social_links:view",
    "social_links:edit",
    "reports:view",
    "reports:export",
    "system_settings:view",
  ],
  registration_staff: [
    "visitor:view",
    "visitor:create",
    "visitor:edit",
    "esports:view",
    "esports:create",
    "tickets:view",
    "tickets:manage",
  ],
  checkin_staff: [
    "visitor:view",
    "entry:view",
    "entry:scan_visitor",
    "entry:checkin_visitor",
    "entry:issue_wristband",
    "tickets:view",
    "tickets:manage",
  ],
  esports_entry_staff: [
    "entry:view",
    "entry:scan_esports",
    "entry:checkin_esports",
    "entry:issue_wristband",
    "tickets:view",
    "tickets:manage",
  ],
  esports_manager: [
    "dashboard:view",
    "esports:view",
    "esports:create",
    "esports:edit",
    "esports:approve",
    "esports:reject",
    "esports:export",
    "tournament:manage_games",
    "tournament:select_teams",
    "tournament:build_bracket",
    "tournament:assign_conductors",
    "tournament:confirm_results",
    "tournament:resolve_disputes",
    "conductor:view_assigned",
    "conductor:verify_roster",
    "conductor:start_match",
    "conductor:submit_result",
    "conductor:report_dispute",
    "entry:scan_esports",
    "tickets:view",
    "tickets:manage",
    "reports:view",
  ],
  match_conductor: [
    "conductor:view_assigned",
    "conductor:verify_roster",
    "conductor:start_match",
    "conductor:submit_result",
    "conductor:report_dispute",
  ],
  content_manager: [
    "dashboard:view",
    "announcements:view",
    "announcements:create",
    "announcements:edit",
    "announcements:publish",
    "announcements:delete",
    "gallery:view",
    "gallery:upload",
    "gallery:edit",
    "gallery:delete",
    "event_info:view",
    "event_info:create",
    "event_info:edit",
    "event_info:publish",
    "social_links:view",
    "social_links:edit",
  ],
  viewer: [
    "dashboard:view",
    "visitor:view",
    "esports:view",
    "tickets:view",
    "announcements:view",
    "gallery:view",
    "event_info:view",
    "social_links:view",
    "reports:view",
  ],
};

export interface PermissionOverride {
  permission_key: PermissionKey | string;
  allowed: boolean;
}

export function resolveEffectivePermissions(
  role: string | null | undefined,
  accountStatus: AccountStatus | string | null | undefined,
  overrides: PermissionOverride[] = []
): Set<PermissionKey> {
  if (accountStatus !== "active") {
    return new Set<PermissionKey>();
  }

  const canonical = normalizeRole(role);
  if (!canonical) {
    return new Set<PermissionKey>();
  }

  if (canonical === "super_admin") {
    return new Set<PermissionKey>(ALL_PERMISSIONS);
  }

  const effective = new Set<PermissionKey>(ROLE_DEFAULT_PERMISSIONS[canonical] || []);
  for (const ov of overrides) {
    if (!ALL_PERMISSIONS.includes(ov.permission_key as PermissionKey)) continue;
    const key = ov.permission_key as PermissionKey;
    if (ov.allowed) {
      effective.add(key);
    } else {
      effective.delete(key);
    }
  }
  return effective;
}

export function hasCrmPermission(
  effectivePermissions: Set<PermissionKey>,
  required: PermissionKey | PermissionKey[],
  accountStatus: AccountStatus | string | null | undefined = "active"
): boolean {
  if (accountStatus !== "active") return false;
  if (Array.isArray(required)) {
    return required.some((perm) => effectivePermissions.has(perm));
  }
  return effectivePermissions.has(required);
}

/**
 * Route-level permission map for AdminLayout sidebar and AdminGuard enforcement.
 * A route is permitted if the user holds AT LEAST ONE of the listed permissions.
 */
export const ROUTE_PERMISSIONS: { prefix: string; exact?: boolean; anyOf: PermissionKey[]; label: string }[] = [
  {
    prefix: "/admin",
    exact: true,
    anyOf: ["dashboard:view", "reports:view", "system_settings:view"],
    label: "Dashboard",
  },
  {
    prefix: "/admin/checkin",
    anyOf: [
      "entry:view",
      "entry:scan_visitor",
      "entry:checkin_visitor",
      "entry:scan_esports",
      "entry:checkin_esports",
      "tickets:view",
      "tickets:manage",
      "visitor:view",
      "visitor:edit",
    ],
    label: "Event Entry & Verification",
  },
  {
    prefix: "/admin/conductor-matches",
    anyOf: ["conductor:view_assigned", "tournament:confirm_results", "esports:edit"],
    label: "Conductor Match Console",
  },
  {
    prefix: "/admin/esports-control",
    anyOf: [
      "esports:edit",
      "tournament:manage_games",
      "tournament:select_teams",
      "tournament:build_bracket",
      "tournament:assign_conductors",
      "tournament:confirm_results",
      "tournament:resolve_disputes",
    ],
    label: "Esports Operations Centre",
  },
  {
    prefix: "/admin/esports-registrations",
    anyOf: ["esports:view", "tournament:select_teams"],
    label: "Esports Teams",
  },
  { prefix: "/admin/visitor-registrations", anyOf: ["visitor:view"], label: "Visitors" },
  { prefix: "/admin/data-exports", anyOf: ["reports:view", "reports:export"], label: "Registration Data Exports" },
  { prefix: "/admin/announcements", anyOf: ["announcements:view"], label: "Announcements" },
  { prefix: "/admin/gallery", anyOf: ["gallery:view"], label: "Gallery" },
  { prefix: "/admin/media", anyOf: ["gallery:view"], label: "Photos & Media" },
  { prefix: "/admin/schedule", anyOf: ["event_info:view"], label: "Schedule" },
  { prefix: "/admin/content", anyOf: ["event_info:view"], label: "Page Text" },
  { prefix: "/admin/sponsors", anyOf: ["event_info:view"], label: "Sponsors" },
  { prefix: "/admin/faqs", anyOf: ["event_info:view"], label: "FAQs" },
  {
    prefix: "/admin/games",
    anyOf: ["event_info:view", "esports:view", "tournament:manage_games"],
    label: "Tournament Games",
  },
  { prefix: "/admin/institutions", anyOf: ["event_info:view"], label: "Schools" },
  { prefix: "/admin/registration-controls", anyOf: ["system_settings:manage"], label: "Registration Controls" },
  { prefix: "/admin/settings", anyOf: ["system_settings:view", "system_settings:manage"], label: "Event & System Settings" },
  { prefix: "/admin/form-options", anyOf: ["system_settings:manage"], label: "Form Options" },
  { prefix: "/admin/audit-logs", anyOf: ["system_settings:view"], label: "Activity Log" },
  { prefix: "/admin/system-readiness", anyOf: ["system_settings:view"], label: "System Readiness" },
  {
    prefix: "/admin/users",
    anyOf: [
      "user_management:view",
      "user_management:invite",
      "user_management:edit",
      "user_management:deactivate",
      "user_management:delete",
      "user_management:assign_permissions",
    ],
    label: "User Management",
  },
];

export function canAccessAdminRoute(
  pathname: string,
  effectivePermissions: Set<PermissionKey>,
  accountStatus: AccountStatus | string | null | undefined = "active"
): boolean {
  if (accountStatus !== "active" || effectivePermissions.size === 0) {
    return false;
  }

  const normalizedPath = pathname.replace(/\/+$/, "") || "/admin";
  if (normalizedPath === "/admin") {
    const dashRoute = ROUTE_PERMISSIONS.find((r) => r.exact && r.prefix === "/admin");
    return Boolean(dashRoute?.anyOf.some((p) => effectivePermissions.has(p)));
  }

  // Match longest prefix first (excluding exact /admin)
  const matched = ROUTE_PERMISSIONS.find(
    (r) => !r.exact && (normalizedPath === r.prefix || normalizedPath.startsWith(`${r.prefix}/`))
  );

  if (!matched) {
    // Unknown sub-route requires super-admin-level system_settings:manage
    return effectivePermissions.has("system_settings:manage");
  }

  return matched.anyOf.some((perm) => effectivePermissions.has(perm));
}

export function isDedicatedOperationsRole(role: string | null | undefined): boolean {
  const canonical = normalizeRole(role);
  return (
    canonical === "registration_staff" ||
    canonical === "checkin_staff" ||
    canonical === "esports_entry_staff" ||
    canonical === "match_conductor"
  );
}

export function getDefaultAdminRoute(
  role: string | null | undefined,
  effectivePermissions: Set<PermissionKey>
): string {
  const canonical = normalizeRole(role);
  if (canonical === "registration_staff") {
    return "/registration-desk";
  }
  if (canonical === "checkin_staff" || canonical === "esports_entry_staff") {
    return "/gate";
  }
  if (canonical === "match_conductor") {
    return "/admin/conductor-matches";
  }
  if (
    effectivePermissions.has("dashboard:view") ||
    effectivePermissions.has("reports:view") ||
    effectivePermissions.has("system_settings:view")
  ) {
    return "/admin";
  }
  const firstPermitted = ROUTE_PERMISSIONS.find(
    (r) => !r.exact && r.anyOf.some((p) => effectivePermissions.has(p))
  );
  return firstPermitted?.prefix || "/admin";
}

export interface CrmUserGuardCheckInput {
  actorId: string;
  targetUserId: string;
  action?: "update" | "delete";
  nextRole?: string;
  nextStatus?: AccountStatus;
  activeSuperAdminCount: number;
  targetCurrentRole: string | null;
  targetCurrentStatus: AccountStatus;
}

export function isLastActiveSuperAdmin(
  role: string | null | undefined,
  accountStatus: AccountStatus | string | null | undefined,
  activeSuperAdminCount: number
): boolean {
  return (
    normalizeRole(role) === "super_admin" &&
    accountStatus === "active" &&
    activeSuperAdminCount <= 1
  );
}

export function getCrmDeactivateEligibility(params: {
  actorId?: string | null;
  targetUserId: string;
  targetRole: string | null | undefined;
  targetStatus: AccountStatus;
  activeSuperAdminCount: number;
}): { eligible: boolean; reason?: string } {
  if (params.actorId && params.actorId === params.targetUserId) {
    return { eligible: false, reason: "Cannot deactivate your own account" };
  }
  if (isLastActiveSuperAdmin(params.targetRole, params.targetStatus, params.activeSuperAdminCount)) {
    return { eligible: false, reason: "Cannot deactivate the last active Super Admin" };
  }
  if (params.targetStatus !== "active" && params.targetStatus !== "invited") {
    return { eligible: false, reason: "Account is already deactivated or revoked" };
  }
  return { eligible: true };
}

export function getCrmReactivateEligibility(params: {
  actorId?: string | null;
  targetUserId: string;
  targetStatus: AccountStatus;
}): { eligible: boolean; reason?: string } {
  if (params.actorId && params.actorId === params.targetUserId) {
    return { eligible: false, reason: "Cannot modify your own account status" };
  }
  if (params.targetStatus !== "deactivated" && params.targetStatus !== "revoked") {
    return { eligible: false, reason: "Only deactivated or revoked accounts can be reactivated" };
  }
  return { eligible: true };
}

export function getCrmDeleteEligibility(params: {
  actorId?: string | null;
  targetUserId: string;
  targetRole: string | null | undefined;
  targetStatus: AccountStatus;
  activeSuperAdminCount: number;
}): { eligible: boolean; reason?: string } {
  if (params.actorId && params.actorId === params.targetUserId) {
    return { eligible: false, reason: "Cannot permanently delete your own account" };
  }
  if (isLastActiveSuperAdmin(params.targetRole, params.targetStatus, params.activeSuperAdminCount)) {
    return { eligible: false, reason: "Cannot permanently delete the last active Super Admin" };
  }
  return { eligible: true };
}

export function validateCrmUserMutation(
  input: CrmUserGuardCheckInput
): { ok: true } | { ok: false; error: string } {
  if (!input.actorId || !input.targetUserId) {
    return { ok: false, error: "Actor and target user identifiers are required." };
  }

  // Rule: Users cannot modify, deactivate, or delete their own account
  if (input.actorId === input.targetUserId) {
    return {
      ok: false,
      error: "Security policy violation: You cannot modify, deactivate, or delete your own account.",
    };
  }

  const isTargetLastActiveSuper = isLastActiveSuperAdmin(
    input.targetCurrentRole,
    input.targetCurrentStatus,
    input.activeSuperAdminCount
  );

  if (isTargetLastActiveSuper) {
    if (input.action === "delete") {
      return { ok: false, error: "Cannot delete the last active Super Admin." };
    }
    if (input.nextRole && normalizeRole(input.nextRole) !== "super_admin") {
      return { ok: false, error: "Cannot demote the last active Super Admin." };
    }
    if (input.nextStatus && input.nextStatus !== "active") {
      return { ok: false, error: "Cannot deactivate or revoke the last active Super Admin." };
    }
  }

  return { ok: true };
}

export const CRM_EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

export function canDelegateRoleAndPermissions(params: {
  actorIsSuperAdmin: boolean;
  actorPermissions: Set<PermissionKey>;
  targetRole: string | null | undefined;
  selectedPermissions: Set<PermissionKey>;
}): { ok: true } | { ok: false; error: string } {
  if (params.actorIsSuperAdmin) return { ok: true };
  const canonical = normalizeRole(params.targetRole);
  if (!canonical) {
    return { ok: false, error: "Invalid CRM role specified." };
  }
  if (canonical === "super_admin") {
    return { ok: false, error: "Only a Super Admin can assign or create Super Admin accounts." };
  }
  for (const perm of params.selectedPermissions) {
    if (!params.actorPermissions.has(perm)) {
      return {
        ok: false,
        error: `Cannot grant "${perm}" because your own CRM account does not hold it.`,
      };
    }
  }
  return { ok: true };
}

export function validateNewCrmUserInput(params: {
  mode: "direct" | "invite";
  fullName: string;
  email: string;
  password?: string;
  confirmPassword?: string;
  role: string;
  existingEmails?: string[];
  actorIsSuperAdmin: boolean;
  actorPermissions: Set<PermissionKey>;
  selectedPermissions: Set<PermissionKey>;
}): { ok: true; normalizedEmail: string; normalizedName: string } | { ok: false; error: string } {
  const normalizedName = params.fullName.trim();
  const normalizedEmail = params.email.trim().toLowerCase();

  if (normalizedName.length < 2 || normalizedName.length > 120) {
    return { ok: false, error: "Full Name must be between 2 and 120 characters." };
  }
  if (!CRM_EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > 254) {
    return { ok: false, error: "Please enter a valid work or college email address." };
  }
  if (
    params.existingEmails?.some((e) => e.trim().toLowerCase() === normalizedEmail)
  ) {
    return {
      ok: false,
      error: `A CRM account with email ${normalizedEmail} already exists.`,
    };
  }
  if (!normalizeRole(params.role)) {
    return { ok: false, error: "Please select a valid CRM operational role." };
  }
  if (params.mode === "direct") {
    const pwd = params.password || "";
    const confirmPwd = params.confirmPassword ?? pwd;
    if (pwd.length < 8) {
      return { ok: false, error: "Initial password must be at least 8 characters long." };
    }
    if (pwd !== confirmPwd) {
      return { ok: false, error: "Passwords do not match." };
    }
  }

  const delegationCheck = canDelegateRoleAndPermissions({
    actorIsSuperAdmin: params.actorIsSuperAdmin,
    actorPermissions: params.actorPermissions,
    targetRole: params.role,
    selectedPermissions: params.selectedPermissions,
  });
  if (!delegationCheck.ok) return delegationCheck;

  return { ok: true, normalizedEmail, normalizedName };
}
