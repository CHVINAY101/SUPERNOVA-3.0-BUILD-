import type { AdminRole, GateVerdict } from "../types/database.ts";
import { normalizeRole, type CanonicalCrmRole } from "./rbac.ts";

export const GATE_PORTAL_ROLES: readonly CanonicalCrmRole[] = [
  "checkin_staff",
  "esports_entry_staff",
  "crm_admin",
  "super_admin",
] as const;

export const GATE_ONLY_ROLES: readonly CanonicalCrmRole[] = [
  "checkin_staff",
  "esports_entry_staff",
] as const;

export function isGateOnlyRole(role: string | null | undefined): boolean {
  const canonical = normalizeRole(role);
  return canonical !== null && GATE_ONLY_ROLES.includes(canonical);
}

export function canAccessGatePortal(
  role: AdminRole | string | null | undefined,
  accountStatus: string | null | undefined
): boolean {
  if (accountStatus !== "active") return false;
  const canonical = normalizeRole(role);
  return canonical !== null && GATE_PORTAL_ROLES.includes(canonical);
}

export interface GateVerdictPresentation {
  verdict: GateVerdict;
  containerClass: string;
  badgeClass: string;
  label: string;
}

export function getGateVerdictPresentation(verdict?: GateVerdict | string | null): GateVerdictPresentation {
  switch (verdict) {
    case "VALID":
      return {
        verdict: "VALID",
        containerClass: "bg-emerald-50 border-emerald-400",
        badgeClass: "bg-emerald-700 text-white",
        label: "VALID",
      };
    case "ALREADY USED":
      return {
        verdict: "ALREADY USED",
        containerClass: "bg-amber-50 border-amber-400",
        badgeClass: "bg-amber-700 text-white",
        label: "ALREADY USED",
      };
    case "CANCELLED / REVOKED":
      return {
        verdict: "CANCELLED / REVOKED",
        containerClass: "bg-slate-100 border-slate-400",
        badgeClass: "bg-slate-800 text-white",
        label: "CANCELLED / REVOKED",
      };
    case "INVALID":
    default:
      return {
        verdict: "INVALID",
        containerClass: "bg-rose-50 border-rose-400",
        badgeClass: "bg-rose-700 text-white",
        label: "INVALID",
      };
  }
}

export function formatLastUpdatedIst(isoDate?: string | null): string {
  if (!isoDate) return "Not updated yet";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "Not updated yet";
  return `${d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })} IST`;
}
