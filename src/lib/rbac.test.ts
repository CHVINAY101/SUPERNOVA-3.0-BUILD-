import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PERMISSIONS,
  canAccessAdminRoute,
  getDefaultAdminRoute,
  hasCrmPermission,
  isDedicatedOperationsRole,
  normalizeRole,
  resolveEffectivePermissions,
  validateCrmUserMutation,
} from "./rbac.ts";

describe("CRM Role-Based Access Control (RBAC) Security Matrix", () => {
  it("Test 1 & 10: Super Admin retains full access to all 13 modules including user management, wristbands & settings", () => {
    const perms = resolveEffectivePermissions("super_admin", "active");
    assert.equal(perms.size, ALL_PERMISSIONS.length);
    assert.equal(hasCrmPermission(perms, "user_management:invite", "active"), true);
    assert.equal(hasCrmPermission(perms, "system_settings:manage", "active"), true);
    assert.equal(hasCrmPermission(perms, "entry:manage_wristbands", "active"), true);
    assert.equal(canAccessAdminRoute("/admin/users", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/settings", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/checkin", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/conductor-matches", perms, "active"), true);
  });

  it("Scenario 21: Entry Staff (registration_staff) can access Event Entry & Verification only; blocked from applications & tournament config", () => {
    const perms = resolveEffectivePermissions("registration_staff", "active");
    assert.equal(isDedicatedOperationsRole("registration_staff"), true);
    assert.equal(getDefaultAdminRoute("registration_staff", perms), "/admin/checkin");
    assert.equal(canAccessAdminRoute("/admin/checkin", perms, "active"), true);
    assert.equal(hasCrmPermission(perms, "entry:scan_visitor", "active"), true);
    assert.equal(hasCrmPermission(perms, "entry:checkin_visitor", "active"), true);
    assert.equal(hasCrmPermission(perms, "entry:issue_wristband", "active"), true);

    assert.equal(canAccessAdminRoute("/admin/esports-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/esports-control", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/participation-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/settings", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/users", perms, "active"), false);
    assert.equal(hasCrmPermission(perms, "entry:override_checkin", "active"), false);
    assert.equal(hasCrmPermission(perms, "entry:manage_wristbands", "active"), false);
    assert.equal(hasCrmPermission(perms, "tournament:build_bracket", "active"), false);
  });

  it("Scenario 22: Esports Entry Staff can verify/check in esports players only; cannot approve teams or modify tournament selection", () => {
    const perms = resolveEffectivePermissions("esports_entry_staff", "active");
    assert.equal(isDedicatedOperationsRole("esports_entry_staff"), true);
    assert.equal(getDefaultAdminRoute("esports_entry_staff", perms), "/admin/checkin");
    assert.equal(canAccessAdminRoute("/admin/checkin", perms, "active"), true);
    assert.equal(hasCrmPermission(perms, "entry:scan_esports", "active"), true);
    assert.equal(hasCrmPermission(perms, "entry:checkin_esports", "active"), true);
    assert.equal(hasCrmPermission(perms, "entry:issue_wristband", "active"), true);

    assert.equal(hasCrmPermission(perms, "esports:approve", "active"), false);
    assert.equal(hasCrmPermission(perms, "esports:reject", "active"), false);
    assert.equal(hasCrmPermission(perms, "tournament:select_teams", "active"), false);
    assert.equal(hasCrmPermission(perms, "tournament:build_bracket", "active"), false);
    assert.equal(canAccessAdminRoute("/admin/visitor-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/participation-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/esports-control", perms, "active"), false);
  });

  it("Scenario 23: Match Conductor has dedicated Match Console only; cannot approve teams, build brackets, or edit tournament settings", () => {
    const perms = resolveEffectivePermissions("match_conductor", "active");
    assert.equal(isDedicatedOperationsRole("match_conductor"), true);
    assert.equal(getDefaultAdminRoute("match_conductor", perms), "/admin/conductor-matches");
    assert.equal(canAccessAdminRoute("/admin/conductor-matches", perms, "active"), true);
    assert.equal(hasCrmPermission(perms, "conductor:view_assigned", "active"), true);
    assert.equal(hasCrmPermission(perms, "conductor:verify_roster", "active"), true);
    assert.equal(hasCrmPermission(perms, "conductor:start_match", "active"), true);
    assert.equal(hasCrmPermission(perms, "conductor:submit_result", "active"), true);
    assert.equal(hasCrmPermission(perms, "conductor:report_dispute", "active"), true);

    assert.equal(canAccessAdminRoute("/admin/esports-control", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/esports-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/checkin", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/games", perms, "active"), false);
    assert.equal(hasCrmPermission(perms, "esports:approve", "active"), false);
    assert.equal(hasCrmPermission(perms, "tournament:select_teams", "active"), false);
    assert.equal(hasCrmPermission(perms, "tournament:confirm_results", "active"), false);
    assert.equal(hasCrmPermission(perms, "tournament:build_bracket", "active"), false);
  });

  it("Test 4: Content Manager cannot access private visitor records or tournament operations", () => {
    const perms = resolveEffectivePermissions("content_manager", "active");
    assert.equal(canAccessAdminRoute("/admin/announcements", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/gallery", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/content", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/visitor-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/participation-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/esports-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/checkin", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/conductor-matches", perms, "active"), false);
    assert.equal(hasCrmPermission(perms, "visitor:view", "active"), false);
  });

  it("Test 5: Esports Manager manages tournament teams, brackets, conductors & results, not unrelated CRM settings", () => {
    const perms = resolveEffectivePermissions("esports_manager", "active");
    assert.equal(canAccessAdminRoute("/admin/esports-registrations", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/esports-control", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/games", perms, "active"), true);
    assert.equal(hasCrmPermission(perms, "tournament:manage_games", "active"), true);
    assert.equal(hasCrmPermission(perms, "tournament:select_teams", "active"), true);
    assert.equal(hasCrmPermission(perms, "tournament:build_bracket", "active"), true);
    assert.equal(hasCrmPermission(perms, "tournament:assign_conductors", "active"), true);
    assert.equal(hasCrmPermission(perms, "tournament:confirm_results", "active"), true);
    assert.equal(hasCrmPermission(perms, "tournament:resolve_disputes", "active"), true);

    assert.equal(canAccessAdminRoute("/admin/visitor-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/participation-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/settings", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/users", perms, "active"), false);
  });

  it("Test 6: Viewer has read-only defaults and zero mutation/export privileges", () => {
    const perms = resolveEffectivePermissions("viewer", "active");
    assert.equal(hasCrmPermission(perms, "visitor:view", "active"), true);
    assert.equal(hasCrmPermission(perms, "esports:view", "active"), true);
    const forbidden = ALL_PERMISSIONS.filter((p) => !p.endsWith(":view"));
    for (const perm of forbidden) {
      assert.equal(hasCrmPermission(perms, perm, "active"), false, `Viewer must not have ${perm}`);
    }
  });

  it("Test 7: Self-modification and last active Super Admin protection enforced", () => {
    assert.equal(
      validateCrmUserMutation({
        actorId: "user-1",
        targetUserId: "user-1",
        nextRole: "super_admin",
        activeSuperAdminCount: 2,
        targetCurrentRole: "crm_admin",
        targetCurrentStatus: "active",
      }).ok,
      false
    );

    assert.equal(
      validateCrmUserMutation({
        actorId: "user-2",
        targetUserId: "user-1",
        nextRole: "crm_admin",
        activeSuperAdminCount: 1,
        targetCurrentRole: "super_admin",
        targetCurrentStatus: "active",
      }).ok,
      false
    );
  });

  it("Test 9: Deactivated, invited, and revoked accounts immediately have zero permissions", () => {
    for (const badStatus of ["deactivated", "revoked", "invited"] as const) {
      const perms = resolveEffectivePermissions("super_admin", badStatus);
      assert.equal(perms.size, 0);
      assert.equal(canAccessAdminRoute("/admin/checkin", perms, badStatus), false);
    }
  });

  it("Test 11: Backwards compatibility for legacy roles + custom overrides", () => {
    assert.equal(normalizeRole("event_admin"), "crm_admin");
    assert.equal(normalizeRole("checkin_staff"), "registration_staff");
    assert.equal(normalizeRole("score_operator"), "esports_manager");

    const customStaff = resolveEffectivePermissions("registration_staff", "active", [
      { permission_key: "visitor:export", allowed: true },
      { permission_key: "visitor:edit", allowed: false },
    ]);
    assert.equal(customStaff.has("visitor:export"), true);
    assert.equal(customStaff.has("visitor:edit"), false);
  });
});
