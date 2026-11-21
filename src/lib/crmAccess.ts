import type { AccountStatus, AdminRole } from "../types/database.ts";
import {
  ALL_PERMISSIONS,
  normalizeRole,
  type CanonicalCrmRole,
  type PermissionKey,
} from "./rbac.ts";

export interface CrmAccessRpcPayload {
  authenticated?: boolean;
  is_staff?: boolean;
  is_active?: boolean;
  user_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  account_status?: string | null;
  is_super_admin?: boolean;
  permissions?: unknown;
  effective_permissions?: unknown;
}

export interface EvaluatedCrmAccess {
  isAdmin: boolean;
  isStaff: boolean;
  isActive: boolean;
  isPendingInvite: boolean;
  role: AdminRole | null;
  canonicalRole: CanonicalCrmRole | null;
  accountStatus: AccountStatus | null;
  permissions: Set<PermissionKey>;
  shouldRedirectToPublic: boolean;
  errorCategory?: "unauthorized_role" | "account_deactivated";
}

const VALID_ACCOUNT_STATUSES: ReadonlySet<AccountStatus> = new Set([
  "invited",
  "active",
  "deactivated",
  "revoked",
]);

function parseAccountStatus(value: unknown): AccountStatus | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim() as AccountStatus;
  return VALID_ACCOUNT_STATUSES.has(trimmed) ? trimmed : null;
}

function extractPermissionSet(rawList: unknown): Set<PermissionKey> {
  if (!Array.isArray(rawList)) return new Set<PermissionKey>();
  const validSet = new Set<PermissionKey>();
  const allowedKeys = new Set<string>(ALL_PERMISSIONS);
  for (const item of rawList) {
    if (typeof item === "string" && allowedKeys.has(item)) {
      validSet.add(item as PermissionKey);
    }
  }
  return validSet;
}

/**
 * Strict, fail-closed evaluation of `get_my_crm_access()` RPC response.
 *
 * Rules:
 * - Allow active staff portal access ONLY when `is_staff === true`, `is_active === true`,
 *   `account_status === "active"` (when present), and a valid authorized staff `role` is returned.
 * - NEVER assign a fallback staff role or fallback permissions.
 * - NEVER infer staff access from an authenticated session, email, or user metadata.
 * - If `role` is null/unrecognized or `is_staff !== true`, deny staff access and flag
 *   `shouldRedirectToPublic = true`.
 */
export function evaluateCrmAccessResponse(result: {
  data: unknown;
  error: unknown;
}): EvaluatedCrmAccess {
  if (result.error || !result.data || typeof result.data !== "object") {
    return {
      isAdmin: false,
      isStaff: false,
      isActive: false,
      isPendingInvite: false,
      role: null,
      canonicalRole: null,
      accountStatus: "revoked",
      permissions: new Set<PermissionKey>(),
      shouldRedirectToPublic: true,
      errorCategory: "unauthorized_role",
    };
  }

  const access = result.data as CrmAccessRpcPayload;

  if (access.authenticated === false) {
    return {
      isAdmin: false,
      isStaff: false,
      isActive: false,
      isPendingInvite: false,
      role: null,
      canonicalRole: null,
      accountStatus: null,
      permissions: new Set<PermissionKey>(),
      shouldRedirectToPublic: false,
    };
  }

  const rawRole = typeof access.role === "string" && access.role.trim() ? access.role.trim() : null;
  const canonicalRole = normalizeRole(rawRole);
  const parsedStatus = parseAccountStatus(access.account_status);
  const isStaffFlag = access.is_staff === true;
  const isActiveFlag = access.is_active === true;

  // Fail closed when role is null/unknown or is_staff is not explicitly true
  if (!isStaffFlag || !rawRole || !canonicalRole) {
    return {
      isAdmin: false,
      isStaff: false,
      isActive: false,
      isPendingInvite: false,
      role: null,
      canonicalRole: null,
      accountStatus: parsedStatus === "deactivated" || parsedStatus === "revoked" ? parsedStatus : null,
      permissions: new Set<PermissionKey>(),
      shouldRedirectToPublic: true,
      errorCategory: "unauthorized_role",
    };
  }

  // Invited staff account awaiting password/invite acceptance
  if (parsedStatus === "invited") {
    return {
      isAdmin: false,
      isStaff: true,
      isActive: false,
      isPendingInvite: true,
      role: rawRole as AdminRole,
      canonicalRole,
      accountStatus: "invited",
      permissions: new Set<PermissionKey>(),
      shouldRedirectToPublic: false,
    };
  }

  // Deactivated / revoked / inactive staff account
  if (!isActiveFlag || parsedStatus === "deactivated" || parsedStatus === "revoked") {
    const blockedStatus: AccountStatus =
      parsedStatus === "deactivated" || parsedStatus === "revoked" ? parsedStatus : "deactivated";
    return {
      isAdmin: false,
      isStaff: true,
      isActive: false,
      isPendingInvite: false,
      role: rawRole as AdminRole,
      canonicalRole,
      accountStatus: blockedStatus,
      permissions: new Set<PermissionKey>(),
      shouldRedirectToPublic: false,
      errorCategory: "account_deactivated",
    };
  }

  // Active authorized staff account: trust effective_permissions strictly from backend RPC
  const rawPerms = Array.isArray(access.effective_permissions)
    ? access.effective_permissions
    : Array.isArray(access.permissions)
    ? access.permissions
    : [];

  return {
    isAdmin: true,
    isStaff: true,
    isActive: true,
    isPendingInvite: false,
    role: rawRole as AdminRole,
    canonicalRole,
    accountStatus: parsedStatus ?? "active",
    permissions: extractPermissionSet(rawPerms),
    shouldRedirectToPublic: false,
  };
}
