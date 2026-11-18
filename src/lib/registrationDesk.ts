import type { AdminRole } from "../types/database.ts";
import { normalizeRole, type CanonicalCrmRole, type PermissionKey } from "./rbac.ts";

export const REGISTRATION_DESK_PORTAL_ROLES: readonly CanonicalCrmRole[] = [
  "registration_staff",
  "crm_admin",
  "super_admin",
] as const;

export const REGISTRATION_DESK_ONLY_ROLES: readonly CanonicalCrmRole[] = [
  "registration_staff",
] as const;

export function isRegistrationDeskOnlyRole(role: string | null | undefined): boolean {
  const canonical = normalizeRole(role);
  return canonical !== null && REGISTRATION_DESK_ONLY_ROLES.includes(canonical);
}

export function canAccessRegistrationDesk(
  role: AdminRole | string | null | undefined,
  accountStatus: string | null | undefined
): boolean {
  if (accountStatus !== "active") return false;
  const canonical = normalizeRole(role);
  return canonical !== null && REGISTRATION_DESK_PORTAL_ROLES.includes(canonical);
}

/**
 * Registration Controls open/close actions are permitted ONLY for a Super Admin
 * or an active staff user explicitly authorized by a Super Admin via system_settings:manage.
 */
export function canToggleRegistrationControls(
  role: AdminRole | string | null | undefined,
  accountStatus: string | null | undefined,
  permissions?: Set<PermissionKey> | null
): boolean {
  if (accountStatus !== "active") return false;
  const canonical = normalizeRole(role);
  if (canonical === "super_admin") return true;
  if (!canAccessRegistrationDesk(role, accountStatus)) return false;
  return Boolean(permissions?.has("system_settings:manage"));
}

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getIstDateKey(isoOrDate?: string | Date | null): string | null {
  if (!isoOrDate) return null;
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return null;
  return IST_DATE_FORMATTER.format(d);
}

export function isRegisteredTodayIst(
  createdAt?: string | null,
  now: Date = new Date()
): boolean {
  const rowDay = getIstDateKey(createdAt);
  const todayDay = getIstDateKey(now);
  return Boolean(rowDay && todayDay && rowDay === todayDay);
}

export function formatIstTimestamp(isoDate?: string | null): string {
  if (!isoDate) return "—";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })} IST`;
}

export interface DeskTodayMetrics {
  visitorsToday: number;
  visitorsTotal: number;
  esportsToday: number;
  esportsTotal: number;
}

export function computeDeskTodayMetrics(input: {
  visitors: Array<{ created_at?: string | null }>;
  esports: Array<{ submitted_at?: string | null; admin_notes?: string | null; archived_at?: string | null }>;
  now?: Date;
}): DeskTodayMetrics {
  const now = input.now ?? new Date();
  let visitorsToday = 0;
  for (const v of input.visitors) {
    if (isRegisteredTodayIst(v.created_at, now)) visitorsToday += 1;
  }

  const activeEsports = input.esports.filter(
    (e) =>
      !e.archived_at &&
      !(typeof e.admin_notes === "string" && e.admin_notes.includes("[ARCHIVED"))
  );
  let esportsToday = 0;
  for (const e of activeEsports) {
    if (isRegisteredTodayIst(e.submitted_at, now)) esportsToday += 1;
  }

  return {
    visitorsToday,
    visitorsTotal: input.visitors.length,
    esportsToday,
    esportsTotal: activeEsports.length,
  };
}
