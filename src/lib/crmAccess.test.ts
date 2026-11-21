import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateCrmAccessResponse } from "./crmAccess.ts";
import { resolveEffectivePermissions } from "./rbac.ts";

describe("evaluateCrmAccessResponse — strict fail-closed get_my_crm_access() contract", () => {
  it("denies access and flags redirect to public site when role is null or is_staff is false", () => {
    const nullRoleRes = evaluateCrmAccessResponse({
      error: null,
      data: {
        authenticated: true,
        is_staff: false,
        is_active: true,
        role: null,
        account_status: "active",
        effective_permissions: [],
      },
    });
    assert.equal(nullRoleRes.isAdmin, false);
    assert.equal(nullRoleRes.isStaff, false);
    assert.equal(nullRoleRes.isActive, false);
    assert.equal(nullRoleRes.role, null);
    assert.equal(nullRoleRes.canonicalRole, null);
    assert.equal(nullRoleRes.permissions.size, 0);
    assert.equal(nullRoleRes.shouldRedirectToPublic, true);
    assert.equal(nullRoleRes.errorCategory, "unauthorized_role");

    const spoofedPermsButNotStaff = evaluateCrmAccessResponse({
      error: null,
      data: {
        authenticated: true,
        is_staff: false,
        is_active: true,
        role: "super_admin",
        account_status: "active",
        effective_permissions: ["dashboard:view", "user_management:view"],
      },
    });
    assert.equal(spoofedPermsButNotStaff.isAdmin, false);
    assert.equal(spoofedPermsButNotStaff.isStaff, false);
    assert.equal(spoofedPermsButNotStaff.permissions.size, 0);
    assert.equal(spoofedPermsButNotStaff.shouldRedirectToPublic, true);

    const unrecognizedRole = evaluateCrmAccessResponse({
      error: null,
      data: {
        authenticated: true,
        is_staff: true,
        is_active: true,
        role: "public_attendee",
        account_status: "active",
        effective_permissions: ["dashboard:view"],
      },
    });
    assert.equal(unrecognizedRole.isAdmin, false);
    assert.equal(unrecognizedRole.isStaff, false);
    assert.equal(unrecognizedRole.shouldRedirectToPublic, true);
  });

  it("fails closed on RPC error, null data, or authenticated=false", () => {
    const rpcErr = evaluateCrmAccessResponse({
      error: { message: "permission denied" },
      data: null,
    });
    assert.equal(rpcErr.isAdmin, false);
    assert.equal(rpcErr.isStaff, false);
    assert.equal(rpcErr.permissions.size, 0);
    assert.equal(rpcErr.shouldRedirectToPublic, true);

    const unauth = evaluateCrmAccessResponse({
      error: null,
      data: { authenticated: false, is_staff: false, is_active: false, role: null },
    });
    assert.equal(unauth.isAdmin, false);
    assert.equal(unauth.isStaff, false);
    assert.equal(unauth.permissions.size, 0);
    assert.equal(unauth.shouldRedirectToPublic, false);
  });

  it("blocks deactivated, revoked, or is_active=false staff without fallback role", () => {
    const deactivated = evaluateCrmAccessResponse({
      error: null,
      data: {
        authenticated: true,
        is_staff: true,
        is_active: false,
        role: "crm_admin",
        account_status: "deactivated",
        effective_permissions: ["dashboard:view"],
      },
    });
    assert.equal(deactivated.isAdmin, false);
    assert.equal(deactivated.isStaff, true);
    assert.equal(deactivated.isActive, false);
    assert.equal(deactivated.accountStatus, "deactivated");
    assert.equal(deactivated.permissions.size, 0);
    assert.equal(deactivated.errorCategory, "account_deactivated");

    const revoked = evaluateCrmAccessResponse({
      error: null,
      data: {
        authenticated: true,
        is_staff: true,
        is_active: true,
        role: "esports_manager",
        account_status: "revoked",
        effective_permissions: ["esports:edit"],
      },
    });
    assert.equal(revoked.isAdmin, false);
    assert.equal(revoked.isActive, false);
    assert.equal(revoked.accountStatus, "revoked");
    assert.equal(revoked.permissions.size, 0);
    assert.equal(revoked.errorCategory, "account_deactivated");
  });

  it("recognizes invited state only when is_staff=true and a valid staff role is assigned", () => {
    const validInvite = evaluateCrmAccessResponse({
      error: null,
      data: {
        authenticated: true,
        is_staff: true,
        is_active: false,
        role: "esports_manager",
        account_status: "invited",
        effective_permissions: [],
      },
    });
    assert.equal(validInvite.isAdmin, false);
    assert.equal(validInvite.isStaff, true);
    assert.equal(validInvite.isPendingInvite, true);
    assert.equal(validInvite.canonicalRole, "esports_manager");
    assert.equal(validInvite.shouldRedirectToPublic, false);

    const nonStaffInvited = evaluateCrmAccessResponse({
      error: null,
      data: {
        authenticated: true,
        is_staff: false,
        is_active: false,
        role: null,
        account_status: "invited",
      },
    });
    assert.equal(nonStaffInvited.isPendingInvite, false);
    assert.equal(nonStaffInvited.isStaff, false);
    assert.equal(nonStaffInvited.shouldRedirectToPublic, true);
  });

  it("grants access strictly from live backend effective_permissions for crm_admin, event_admin, esports_manager, score_operator, and registration_staff", () => {
    const crmAdminPerms = Array.from(resolveEffectivePermissions("crm_admin", "active"));
    const crmEval = evaluateCrmAccessResponse({
      error: null,
      data: {
        authenticated: true,
        is_staff: true,
        is_active: true,
        role: "event_admin",
        account_status: "active",
        effective_permissions: [...crmAdminPerms, "system_settings:manage", "unknown:perm"],
      },
    });
    assert.equal(crmEval.isAdmin, true);
    assert.equal(crmEval.isStaff, true);
    assert.equal(crmEval.isActive, true);
    assert.equal(crmEval.role, "event_admin");
    assert.equal(crmEval.canonicalRole, "crm_admin");
    assert.equal(crmEval.permissions.has("visitor:edit"), true);
    assert.equal(crmEval.permissions.has("esports:edit"), true);
    assert.equal(crmEval.permissions.has("system_settings:manage"), true);
    assert.equal(crmEval.permissions.has("unknown:perm" as any), false);

    const esportsEval = evaluateCrmAccessResponse({
      error: null,
      data: {
        authenticated: true,
        is_staff: true,
        is_active: true,
        role: "score_operator",
        account_status: "active",
        effective_permissions: [
          "dashboard:view",
          "esports:view",
          "esports:edit",
          "esports:approve",
          "tournament:manage_games",
          "tournament:select_teams",
          "tournament:build_bracket",
          "tournament:assign_conductors",
          "tournament:confirm_results",
          "tournament:resolve_disputes",
        ],
      },
    });
    assert.equal(esportsEval.isAdmin, true);
    assert.equal(esportsEval.canonicalRole, "esports_manager");
    assert.equal(esportsEval.permissions.has("tournament:manage_games"), true);
    assert.equal(esportsEval.permissions.has("tournament:confirm_results"), true);

    // Custom RPC effective_permissions for registration_staff are preserved verbatim (never overwritten by client defaults)
    const customDesk = evaluateCrmAccessResponse({
      error: null,
      data: {
        authenticated: true,
        is_staff: true,
        is_active: true,
        role: "registration_staff",
        account_status: "active",
        effective_permissions: ["visitor:view", "visitor:create", "system_settings:manage"],
      },
    });
    assert.equal(customDesk.permissions.has("system_settings:manage"), true);
    assert.equal(customDesk.permissions.has("tickets:manage"), false);
  });
});
