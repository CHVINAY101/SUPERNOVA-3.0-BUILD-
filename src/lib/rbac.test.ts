import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PERMISSIONS,
  canAccessAdminRoute,
  hasCrmPermission,
  normalizeRole,
  resolveEffectivePermissions,
  validateCrmUserMutation,
} from "./rbac.ts";

describe("CRM Role-Based Access Control (RBAC) Security Matrix", () => {
  it("Test 1 & 10: Super Admin retains full access to all 11 modules including user management & settings", () => {
    const perms = resolveEffectivePermissions("super_admin", "active");
    assert.equal(perms.size, ALL_PERMISSIONS.length);
    assert.equal(hasCrmPermission(perms, "user_management:invite", "active"), true);
    assert.equal(hasCrmPermission(perms, "system_settings:manage", "active"), true);
    assert.equal(canAccessAdminRoute("/admin/users", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/settings", perms, "active"), true);
  });

  it("Test 3: Registration Staff cannot access system settings or unrelated modules", () => {
    const perms = resolveEffectivePermissions("registration_staff", "active");
    assert.equal(canAccessAdminRoute("/admin/visitor-registrations", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/checkin", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/settings", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/registration-controls", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/users", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/audit-logs", perms, "active"), false);
    assert.equal(hasCrmPermission(perms, "system_settings:view", "active"), false);
    assert.equal(hasCrmPermission(perms, "visitor:delete", "active"), false);
  });

  it("Test 4: Content Manager cannot access private visitor records or registration PII", () => {
    const perms = resolveEffectivePermissions("content_manager", "active");
    assert.equal(canAccessAdminRoute("/admin/announcements", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/gallery", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/content", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/visitor-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/participation-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/esports-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/data-exports", perms, "active"), false);
    assert.equal(hasCrmPermission(perms, "visitor:view", "active"), false);
  });

  it("Test 5: Esports Manager cannot access unrelated administrative modules", () => {
    const perms = resolveEffectivePermissions("esports_manager", "active");
    assert.equal(canAccessAdminRoute("/admin/esports-registrations", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/esports-control", perms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/visitor-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/participation-registrations", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/settings", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/users", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/crm-emails", perms, "active"), false);
  });

  it("Test 6: Viewer cannot edit, approve, reject, export, publish, or delete information", () => {
    const perms = resolveEffectivePermissions("viewer", "active");
    assert.equal(hasCrmPermission(perms, "visitor:view", "active"), true);
    assert.equal(hasCrmPermission(perms, "participation:view", "active"), true);
    assert.equal(hasCrmPermission(perms, "esports:view", "active"), true);
    assert.equal(hasCrmPermission(perms, "reports:view", "active"), true);

    const forbidden = ALL_PERMISSIONS.filter((p) => !p.endsWith(":view"));
    for (const perm of forbidden) {
      assert.equal(hasCrmPermission(perms, perm, "active"), false, `Viewer must not have ${perm}`);
    }
    assert.equal(canAccessAdminRoute("/admin/users", perms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/settings", perms, "active"), false);
  });

  it("Test 7: Users cannot modify their own permissions, role, or status; last active Super Admin is protected", () => {
    const selfEdit = validateCrmUserMutation({
      actorId: "user-1",
      targetUserId: "user-1",
      nextRole: "super_admin",
      activeSuperAdminCount: 2,
      targetCurrentRole: "crm_admin",
      targetCurrentStatus: "active",
    });
    assert.equal(selfEdit.ok, false);

    const demoteLastSuperAdmin = validateCrmUserMutation({
      actorId: "user-2",
      targetUserId: "user-1",
      nextRole: "crm_admin",
      activeSuperAdminCount: 1,
      targetCurrentRole: "super_admin",
      targetCurrentStatus: "active",
    });
    assert.equal(demoteLastSuperAdmin.ok, false);

    const deactivateLastSuperAdmin = validateCrmUserMutation({
      actorId: "user-2",
      targetUserId: "user-1",
      nextStatus: "deactivated",
      activeSuperAdminCount: 1,
      targetCurrentRole: "super_admin",
      targetCurrentStatus: "active",
    });
    assert.equal(deactivateLastSuperAdmin.ok, false);

    const validEdit = validateCrmUserMutation({
      actorId: "user-1",
      targetUserId: "user-2",
      nextRole: "esports_manager",
      activeSuperAdminCount: 2,
      targetCurrentRole: "viewer",
      targetCurrentStatus: "active",
    });
    assert.equal(validEdit.ok, true);
  });

  it("Test 9: Deactivated, invited, and revoked accounts immediately have zero permissions", () => {
    for (const badStatus of ["deactivated", "revoked", "invited"] as const) {
      const perms = resolveEffectivePermissions("super_admin", badStatus);
      assert.equal(perms.size, 0, `${badStatus} status must yield 0 permissions`);
      assert.equal(canAccessAdminRoute("/admin", perms, badStatus), false);
      assert.equal(hasCrmPermission(perms, "visitor:view", badStatus), false);
    }
  });

  it("Test 11: Backwards compatibility for legacy roles + custom per-user permission overrides", () => {
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
