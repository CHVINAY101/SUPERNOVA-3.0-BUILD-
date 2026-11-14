export type CanonicalCrmRole =
  | "super_admin"
  | "crm_admin"
  | "registration_staff"
  | "participation_manager"
  | "esports_manager"
  | "content_manager"
  | "viewer";

export type LegacyAdminRole = "event_admin" | "checkin_staff" | "score_operator";

export type AdminRole = CanonicalCrmRole | LegacyAdminRole;

export type AccountStatus = "invited" | "active" | "deactivated" | "revoked";

export type PermissionKey =
  | "visitor:view"
  | "visitor:create"
  | "visitor:edit"
  | "visitor:delete"
  | "visitor:export"
  | "participation:view"
  | "participation:create"
  | "participation:edit"
  | "participation:approve"
  | "participation:reject"
  | "participation:export"
  | "esports:view"
  | "esports:create"
  | "esports:edit"
  | "esports:approve"
  | "esports:reject"
  | "esports:export"
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
  | "email_centre:view"
  | "email_centre:compose"
  | "email_centre:send"
  | "email_centre:resend"
  | "reports:view"
  | "reports:export"
  | "user_management:invite"
  | "user_management:edit"
  | "user_management:deactivate"
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
    id: "visitor",
    label: "Visitor Registration",
    description: "Visitor passes, check-in records, and attendee details",
    permissions: [
      { key: "visitor:view", label: "View" },
      { key: "visitor:create", label: "Create" },
      { key: "visitor:edit", label: "Edit" },
      { key: "visitor:delete", label: "Delete / Archive" },
      { key: "visitor:export", label: "Export" },
    ],
  },
  {
    id: "participation",
    label: "Participation Applications",
    description: "Science Expo & exhibit stall project applications",
    permissions: [
      { key: "participation:view", label: "View" },
      { key: "participation:create", label: "Create" },
      { key: "participation:edit", label: "Edit" },
      { key: "participation:approve", label: "Approve" },
      { key: "participation:reject", label: "Reject" },
      { key: "participation:export", label: "Export" },
    ],
  },
  {
    id: "esports",
    label: "Esports Teams & Players",
    description: "Tournament squad rosters, match staging, and brackets",
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
    id: "email_centre",
    label: "Email Centre",
    description: "Gmail dispatch, custom CRM emails, and pass resends",
    permissions: [
      { key: "email_centre:view", label: "View" },
      { key: "email_centre:compose", label: "Compose" },
      { key: "email_centre:send", label: "Send" },
      { key: "email_centre:resend", label: "Resend" },
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
    description: "Invite CRM staff, edit roles, and revoke user access",
    permissions: [
      { key: "user_management:invite", label: "Invite" },
      { key: "user_management:edit", label: "Edit" },
      { key: "user_management:deactivate", label: "Deactivate / Revoke" },
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

export const ROLE_METADATA: Record<
  CanonicalCrmRole,
  { label: string; description: string; badgeTone: string }
> = {
  super_admin: {
    label: "Super Admin",
    description: "Full system access including user management, permissions, and settings.",
    badgeTone: "bg-slate-900 text-white border-slate-900",
  },
  crm_admin: {
    label: "CRM Admin",
    description: "Operational management across registrations, content, esports, and email centre.",
    badgeTone: "bg-blue-50 text-blue-700 border-blue-200",
  },
  registration_staff: {
    label: "Registration Staff",
    description: "Visitor registration and gate check-in desk operations.",
    badgeTone: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  participation_manager: {
    label: "Participation Manager",
    description: "Review, approve, reject, and manage participation project applications.",
    badgeTone: "bg-amber-50 text-amber-800 border-amber-200",
  },
  esports_manager: {
    label: "Esports Manager",
    description: "Manage esports teams, players, approvals, and live tournament matches.",
    badgeTone: "bg-purple-50 text-purple-700 border-purple-200",
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
    case "checkin_staff":
      return "registration_staff";
    case "participation_manager":
      return "participation_manager";
    case "esports_manager":
    case "score_operator":
      return "esports_manager";
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
    "visitor:view",
    "visitor:create",
    "visitor:edit",
    "visitor:delete",
    "visitor:export",
    "participation:view",
    "participation:create",
    "participation:edit",
    "participation:approve",
    "participation:reject",
    "participation:export",
    "esports:view",
    "esports:create",
    "esports:edit",
    "esports:approve",
    "esports:reject",
    "esports:export",
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
    "email_centre:view",
    "email_centre:compose",
    "email_centre:send",
    "email_centre:resend",
    "reports:view",
    "reports:export",
    "system_settings:view",
  ],
  registration_staff: [
    "visitor:view",
    "visitor:create",
    "visitor:edit",
  ],
  participation_manager: [
    "participation:view",
    "participation:create",
    "participation:edit",
    "participation:approve",
    "participation:reject",
    "participation:export",
    "reports:view",
  ],
  esports_manager: [
    "esports:view",
    "esports:create",
    "esports:edit",
    "esports:approve",
    "esports:reject",
    "esports:export",
    "reports:view",
  ],
  content_manager: [
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
    "visitor:view",
    "participation:view",
    "esports:view",
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
  { prefix: "/admin", exact: true, anyOf: ALL_PERMISSIONS, label: "Dashboard" },
  { prefix: "/admin/checkin", anyOf: ["visitor:view", "visitor:edit", "esports:view"], label: "Check-in Desk" },
  { prefix: "/admin/esports-control", anyOf: ["esports:view", "esports:edit"], label: "Esports Control" },
  { prefix: "/admin/esports-registrations", anyOf: ["esports:view"], label: "Esports Teams" },
  { prefix: "/admin/participation-registrations", anyOf: ["participation:view"], label: "Participation" },
  { prefix: "/admin/visitor-registrations", anyOf: ["visitor:view"], label: "Visitors" },
  { prefix: "/admin/crm-emails", anyOf: ["email_centre:view"], label: "Email Centre" },
  { prefix: "/admin/data-exports", anyOf: ["reports:view", "reports:export"], label: "Registration Data Exports" },
  { prefix: "/admin/announcements", anyOf: ["announcements:view"], label: "Announcements" },
  { prefix: "/admin/gallery", anyOf: ["gallery:view"], label: "Gallery" },
  { prefix: "/admin/media", anyOf: ["gallery:view"], label: "Photos & Media" },
  { prefix: "/admin/schedule", anyOf: ["event_info:view"], label: "Schedule" },
  { prefix: "/admin/content", anyOf: ["event_info:view"], label: "Page Text" },
  { prefix: "/admin/sponsors", anyOf: ["event_info:view"], label: "Sponsors" },
  { prefix: "/admin/faqs", anyOf: ["event_info:view"], label: "FAQs" },
  { prefix: "/admin/games", anyOf: ["event_info:view", "esports:view"], label: "Games" },
  { prefix: "/admin/institutions", anyOf: ["event_info:view"], label: "Schools" },
  { prefix: "/admin/registration-controls", anyOf: ["system_settings:manage"], label: "Registration Controls" },
  { prefix: "/admin/settings", anyOf: ["system_settings:view", "system_settings:manage"], label: "Event & System Settings" },
  { prefix: "/admin/form-options", anyOf: ["system_settings:manage"], label: "Form Options" },
  { prefix: "/admin/audit-logs", anyOf: ["system_settings:view"], label: "Activity Log" },
  { prefix: "/admin/system-readiness", anyOf: ["system_settings:view"], label: "System Readiness" },
  {
    prefix: "/admin/users",
    anyOf: [
      "user_management:invite",
      "user_management:edit",
      "user_management:deactivate",
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
    return effectivePermissions.size > 0;
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

export interface CrmUserGuardCheckInput {
  actorId: string;
  targetUserId: string;
  nextRole?: string;
  nextStatus?: AccountStatus;
  activeSuperAdminCount: number;
  targetCurrentRole: string | null;
  targetCurrentStatus: AccountStatus;
}

export function validateCrmUserMutation(
  input: CrmUserGuardCheckInput
): { ok: true } | { ok: false; error: string } {
  if (!input.actorId || !input.targetUserId) {
    return { ok: false, error: "Actor and target user identifiers are required." };
  }

  // Rule: Users cannot modify their own permissions, role, or status
  if (input.actorId === input.targetUserId) {
    return { ok: false, error: "Security policy violation: You cannot modify your own role, permissions, or account status." };
  }

  const isTargetActiveSuperAdmin =
    normalizeRole(input.targetCurrentRole) === "super_admin" &&
    input.targetCurrentStatus === "active";

  if (isTargetActiveSuperAdmin && input.activeSuperAdminCount <= 1) {
    if (input.nextRole && normalizeRole(input.nextRole) !== "super_admin") {
      return { ok: false, error: "Cannot demote the last active Super Admin." };
    }
    if (input.nextStatus && input.nextStatus !== "active") {
      return { ok: false, error: "Cannot deactivate or revoke the last active Super Admin." };
    }
  }

  return { ok: true };
}
