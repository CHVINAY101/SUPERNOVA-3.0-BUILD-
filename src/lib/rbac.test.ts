import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_PERMISSIONS,
  canAccessAdminRoute,
  canDelegateRoleAndPermissions,
  getCrmDeactivateEligibility,
  getCrmDeleteEligibility,
  getCrmReactivateEligibility,
  getDefaultAdminRoute,
  getRoleLabel,
  hasCrmPermission,
  isDedicatedOperationsRole,
  isLastActiveSuperAdmin,
  normalizeRole,
  resolveEffectivePermissions,
  ROLE_METADATA,
  ROUTE_PERMISSIONS,
  validateCrmUserMutation,
  validateNewCrmUserInput,
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

  it("Scenario 21: Registration Desk Clerk (registration_staff) has Registration Desk permissions only; Entry Staff (checkin_staff) retains Gate Entry permissions", () => {
    assert.equal(Object.keys(ROLE_METADATA).includes("registration_staff"), true);
    assert.equal(ROLE_METADATA.registration_staff.label, "Registration Desk Clerk");
    assert.equal(getRoleLabel("registration_staff"), "Registration Desk Clerk");

    const deskPerms = resolveEffectivePermissions("registration_staff", "active");
    assert.equal(isDedicatedOperationsRole("registration_staff"), true);
    assert.equal(getDefaultAdminRoute("registration_staff", deskPerms), "/registration-desk");
    assert.equal(hasCrmPermission(deskPerms, "visitor:view", "active"), true);
    assert.equal(hasCrmPermission(deskPerms, "visitor:create", "active"), true);
    assert.equal(hasCrmPermission(deskPerms, "visitor:edit", "active"), true);
    assert.equal(hasCrmPermission(deskPerms, "esports:view", "active"), true);
    assert.equal(hasCrmPermission(deskPerms, "esports:create", "active"), true);
    assert.equal(hasCrmPermission(deskPerms, "tickets:view", "active"), true);
    assert.equal(hasCrmPermission(deskPerms, "tickets:manage", "active"), true);

    const allowedDeskDefaults = new Set([
      "visitor:view",
      "visitor:create",
      "visitor:edit",
      "esports:view",
      "esports:create",
      "tickets:view",
      "tickets:manage",
    ]);
    for (const perm of ALL_PERMISSIONS) {
      if (!allowedDeskDefaults.has(perm)) {
        assert.equal(
          hasCrmPermission(deskPerms, perm, "active"),
          false,
          `Registration Desk Clerk must not have default permission ${perm}`
        );
      }
    }

    assert.equal(canAccessAdminRoute("/admin/conductor-matches", deskPerms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/esports-control", deskPerms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/registration-controls", deskPerms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/settings", deskPerms, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/users", deskPerms, "active"), false);
    assert.equal(hasCrmPermission(deskPerms, "tournament:build_bracket", "active"), false);

    const gatePerms = resolveEffectivePermissions("checkin_staff", "active");
    assert.equal(isDedicatedOperationsRole("checkin_staff"), true);
    assert.equal(getDefaultAdminRoute("checkin_staff", gatePerms), "/gate");
    assert.equal(canAccessAdminRoute("/admin/checkin", gatePerms, "active"), true);
    assert.equal(hasCrmPermission(gatePerms, "entry:scan_visitor", "active"), true);
    assert.equal(hasCrmPermission(gatePerms, "entry:checkin_visitor", "active"), true);
    assert.equal(hasCrmPermission(gatePerms, "entry:issue_wristband", "active"), true);
    assert.equal(canAccessAdminRoute("/admin/esports-control", gatePerms, "active"), false);
    assert.equal(hasCrmPermission(gatePerms, "entry:override_checkin", "active"), false);
    assert.equal(hasCrmPermission(gatePerms, "entry:manage_wristbands", "active"), false);
  });

  it("Scenario 22: Esports Entry Staff can verify/check in esports players only; cannot approve teams or modify tournament selection", () => {
    const perms = resolveEffectivePermissions("esports_entry_staff", "active");
    assert.equal(isDedicatedOperationsRole("esports_entry_staff"), true);
    assert.equal(getDefaultAdminRoute("esports_entry_staff", perms), "/gate");
    assert.equal(canAccessAdminRoute("/admin/checkin", perms, "active"), true);
    assert.equal(hasCrmPermission(perms, "entry:scan_esports", "active"), true);
    assert.equal(hasCrmPermission(perms, "entry:checkin_esports", "active"), true);
    assert.equal(hasCrmPermission(perms, "entry:issue_wristband", "active"), true);

    assert.equal(hasCrmPermission(perms, "esports:approve", "active"), false);
    assert.equal(hasCrmPermission(perms, "esports:reject", "active"), false);
    assert.equal(hasCrmPermission(perms, "tournament:select_teams", "active"), false);
    assert.equal(hasCrmPermission(perms, "tournament:build_bracket", "active"), false);
    assert.equal(canAccessAdminRoute("/admin/visitor-registrations", perms, "active"), false);
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
    assert.equal(normalizeRole("checkin_staff"), "checkin_staff");
    assert.equal(normalizeRole("registration_staff"), "registration_staff");
    assert.equal(normalizeRole("score_operator"), "esports_manager");
    assert.equal(normalizeRole("participation_manager"), "viewer");

    const customStaff = resolveEffectivePermissions("registration_staff", "active", [
      { permission_key: "visitor:export", allowed: true },
      { permission_key: "visitor:edit", allowed: false },
    ]);
    assert.equal(customStaff.has("visitor:export"), true);
    assert.equal(customStaff.has("visitor:edit"), false);
  });

  it("CRM User Lifecycle: Deactivate/Reactivate/Delete eligible for staff, blocked for self & last Super Admin", () => {
    // Current Super Admin cannot deactivate or delete self
    assert.equal(
      validateCrmUserMutation({
        actorId: "super-1",
        targetUserId: "super-1",
        nextStatus: "deactivated",
        activeSuperAdminCount: 2,
        targetCurrentRole: "super_admin",
        targetCurrentStatus: "active",
      }).ok,
      false
    );
    assert.equal(
      validateCrmUserMutation({
        actorId: "super-1",
        targetUserId: "super-1",
        action: "delete",
        activeSuperAdminCount: 2,
        targetCurrentRole: "super_admin",
        targetCurrentStatus: "active",
      }).ok,
      false
    );

    // Last active Super Admin cannot be deactivated or deleted by another user
    assert.equal(
      validateCrmUserMutation({
        actorId: "super-2",
        targetUserId: "super-1",
        nextStatus: "deactivated",
        activeSuperAdminCount: 1,
        targetCurrentRole: "super_admin",
        targetCurrentStatus: "active",
      }).ok,
      false
    );
    assert.equal(
      validateCrmUserMutation({
        actorId: "super-2",
        targetUserId: "super-1",
        action: "delete",
        activeSuperAdminCount: 1,
        targetCurrentRole: "super_admin",
        targetCurrentStatus: "active",
      }).ok,
      false
    );

    // Separate active CRM staff account (registration_staff, esports_manager, or second super_admin) IS eligible
    for (const staffRole of [
      "registration_staff",
      "esports_entry_staff",
      "esports_manager",
      "match_conductor",
      "crm_admin",
      "content_manager",
      "viewer",
      "checkin_staff",
      "score_operator",
    ]) {
      assert.equal(
        validateCrmUserMutation({
          actorId: "super-1",
          targetUserId: "staff-1",
          nextStatus: "deactivated",
          activeSuperAdminCount: 1,
          targetCurrentRole: staffRole,
          targetCurrentStatus: "active",
        }).ok,
        true,
        `Expected ${staffRole} to be eligible for deactivation`
      );
      assert.equal(
        validateCrmUserMutation({
          actorId: "super-1",
          targetUserId: "staff-1",
          nextStatus: "active",
          activeSuperAdminCount: 1,
          targetCurrentRole: staffRole,
          targetCurrentStatus: "deactivated",
        }).ok,
        true,
        `Expected ${staffRole} to be eligible for reactivation`
      );
      assert.equal(
        validateCrmUserMutation({
          actorId: "super-1",
          targetUserId: "staff-1",
          action: "delete",
          activeSuperAdminCount: 1,
          targetCurrentRole: staffRole,
          targetCurrentStatus: "active",
        }).ok,
        true,
        `Expected ${staffRole} to be eligible for permanent deletion`
      );
    }
  });

  it("CRM UI Eligibility Helpers: Deactivate, Reactivate, and Delete button rules", () => {
    assert.equal(isLastActiveSuperAdmin("super_admin", "active", 1), true);
    assert.equal(isLastActiveSuperAdmin("super_admin", "active", 2), false);
    assert.equal(isLastActiveSuperAdmin("registration_staff", "active", 1), false);

    // Self-protection
    assert.equal(
      getCrmDeactivateEligibility({
        actorId: "super-1",
        targetUserId: "super-1",
        targetRole: "super_admin",
        targetStatus: "active",
        activeSuperAdminCount: 2,
      }).eligible,
      false
    );
    assert.equal(
      getCrmDeleteEligibility({
        actorId: "super-1",
        targetUserId: "super-1",
        targetRole: "super_admin",
        targetStatus: "active",
        activeSuperAdminCount: 2,
      }).eligible,
      false
    );

    // Last active Super Admin protection
    assert.equal(
      getCrmDeactivateEligibility({
        actorId: "super-2",
        targetUserId: "super-1",
        targetRole: "super_admin",
        targetStatus: "active",
        activeSuperAdminCount: 1,
      }).eligible,
      false
    );
    assert.equal(
      getCrmDeleteEligibility({
        actorId: "super-2",
        targetUserId: "super-1",
        targetRole: "super_admin",
        targetStatus: "active",
        activeSuperAdminCount: 1,
      }).eligible,
      false
    );

    // Eligible separate staff account (active -> deactivate & delete enabled)
    assert.equal(
      getCrmDeactivateEligibility({
        actorId: "super-1",
        targetUserId: "staff-1",
        targetRole: "registration_staff",
        targetStatus: "active",
        activeSuperAdminCount: 1,
      }).eligible,
      true
    );
    assert.equal(
      getCrmDeleteEligibility({
        actorId: "super-1",
        targetUserId: "staff-1",
        targetRole: "registration_staff",
        targetStatus: "active",
        activeSuperAdminCount: 1,
      }).eligible,
      true
    );

    // Deactivated staff account -> reactivate & delete enabled
    assert.equal(
      getCrmReactivateEligibility({
        actorId: "super-1",
        targetUserId: "staff-1",
        targetStatus: "deactivated",
      }).eligible,
      true
    );
    assert.equal(
      getCrmDeleteEligibility({
        actorId: "super-1",
        targetUserId: "staff-1",
        targetRole: "registration_staff",
        targetStatus: "deactivated",
        activeSuperAdminCount: 1,
      }).eligible,
      true
    );

    // Second active Super Admin -> eligible for deactivate & delete
    assert.equal(
      getCrmDeactivateEligibility({
        actorId: "super-1",
        targetUserId: "super-2",
        targetRole: "super_admin",
        targetStatus: "active",
        activeSuperAdminCount: 2,
      }).eligible,
      true
    );
    assert.equal(
      getCrmDeleteEligibility({
        actorId: "super-1",
        targetUserId: "super-2",
        targetRole: "super_admin",
        targetStatus: "active",
        activeSuperAdminCount: 2,
      }).eligible,
      true
    );
  });

  it("Granular dashboard:view, tickets:*, and user_management:view/delete permissions & custom overrides", () => {
    const viewerPerms = resolveEffectivePermissions("viewer", "active");
    assert.equal(viewerPerms.has("dashboard:view"), true);
    assert.equal(viewerPerms.has("tickets:view"), true);
    assert.equal(viewerPerms.has("tickets:manage"), false);
    assert.equal(canAccessAdminRoute("/admin", viewerPerms, "active"), true);
    assert.equal(canAccessAdminRoute("/admin/checkin", viewerPerms, "active"), true);

    const customNoDash = resolveEffectivePermissions("viewer", "active", [
      { permission_key: "dashboard:view", allowed: false },
      { permission_key: "reports:view", allowed: false },
      { permission_key: "tickets:view", allowed: false },
      { permission_key: "visitor:view", allowed: false },
      { permission_key: "user_management:view", allowed: true },
    ]);
    assert.equal(canAccessAdminRoute("/admin", customNoDash, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/checkin", customNoDash, "active"), false);
    assert.equal(canAccessAdminRoute("/admin/users", customNoDash, "active"), true);
    assert.equal(getDefaultAdminRoute("viewer", customNoDash), "/admin/esports-registrations");
  });

  it("Delegation anti-escalation & Add User validation (direct password + invite modes)", () => {
    const crmAdminPerms = resolveEffectivePermissions("crm_admin", "active");

    assert.equal(
      canDelegateRoleAndPermissions({
        actorIsSuperAdmin: false,
        actorPermissions: crmAdminPerms,
        targetRole: "super_admin",
        selectedPermissions: crmAdminPerms,
      }).ok,
      false
    );

    const escalatedSet = new Set(crmAdminPerms);
    escalatedSet.add("system_settings:manage");
    assert.equal(
      canDelegateRoleAndPermissions({
        actorIsSuperAdmin: false,
        actorPermissions: crmAdminPerms,
        targetRole: "crm_admin",
        selectedPermissions: escalatedSet,
      }).ok,
      false
    );

    const staffSubset = resolveEffectivePermissions("registration_staff", "active");
    assert.equal(
      canDelegateRoleAndPermissions({
        actorIsSuperAdmin: false,
        actorPermissions: crmAdminPerms,
        targetRole: "registration_staff",
        selectedPermissions: staffSubset,
      }).ok,
      true
    );

    // Direct user creation validation
    assert.equal(
      validateNewCrmUserInput({
        mode: "direct",
        fullName: "Ananya Rao",
        email: "ananya@college.edu",
        password: "short",
        confirmPassword: "short",
        role: "registration_staff",
        actorIsSuperAdmin: true,
        actorPermissions: resolveEffectivePermissions("super_admin", "active"),
        selectedPermissions: staffSubset,
      }).ok,
      false
    );

    assert.equal(
      validateNewCrmUserInput({
        mode: "direct",
        fullName: "Ananya Rao",
        email: "ananya@college.edu",
        password: "StrongPassword123!",
        confirmPassword: "DifferentPassword123!",
        role: "registration_staff",
        actorIsSuperAdmin: true,
        actorPermissions: resolveEffectivePermissions("super_admin", "active"),
        selectedPermissions: staffSubset,
      }).ok,
      false
    );

    assert.equal(
      validateNewCrmUserInput({
        mode: "direct",
        fullName: "Ananya Rao",
        email: "ananya@college.edu",
        password: "StrongPassword123!",
        confirmPassword: "StrongPassword123!",
        role: "registration_staff",
        existingEmails: ["ANANYA@college.edu"],
        actorIsSuperAdmin: true,
        actorPermissions: resolveEffectivePermissions("super_admin", "active"),
        selectedPermissions: staffSubset,
      }).ok,
      false
    );

    const validDirect = validateNewCrmUserInput({
      mode: "direct",
      fullName: "  Ananya Rao  ",
      email: "  Ananya@College.EDU  ",
      password: "StrongPassword123!",
      confirmPassword: "StrongPassword123!",
      role: "registration_staff",
      existingEmails: ["other@college.edu"],
      actorIsSuperAdmin: true,
      actorPermissions: resolveEffectivePermissions("super_admin", "active"),
      selectedPermissions: staffSubset,
    });
    assert.equal(validDirect.ok, true);
    if (validDirect.ok) {
      assert.equal(validDirect.normalizedEmail, "ananya@college.edu");
      assert.equal(validDirect.normalizedName, "Ananya Rao");
    }

    const validInvite = validateNewCrmUserInput({
      mode: "invite",
      fullName: "Vikram Desai",
      email: "vikram@college.edu",
      role: "registration_staff",
      actorIsSuperAdmin: true,
      actorPermissions: resolveEffectivePermissions("super_admin", "active"),
      selectedPermissions: staffSubset,
    });
    assert.equal(validInvite.ok, true);
  });

  it("External Email Centre permissions and routes are completely removed", () => {
    const emailPerms = ALL_PERMISSIONS.filter((p) => String(p).startsWith("email_centre:"));
    assert.equal(emailPerms.length, 0);
    assert.equal(
      ROUTE_PERMISSIONS.some((r) => r.prefix === "/admin/crm-emails"),
      false
    );

    const adminPerms = resolveEffectivePermissions("crm_admin", "active", [
      { permission_key: "email_centre:send" as any, allowed: true },
    ]);
    assert.equal(adminPerms.has("email_centre:send" as any), false);
    assert.equal(canAccessAdminRoute("/admin/crm-emails", adminPerms, "active"), false);
  });

  it("CRM Admin (crm_admin / event_admin) and Esports Coordinator (esports_manager / score_operator) access operational routes & game registration controls", () => {
    for (const roleName of ["crm_admin", "event_admin"] as const) {
      const perms = resolveEffectivePermissions(roleName, "active");
      assert.equal(canAccessAdminRoute("/admin", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/visitor-registrations", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/esports-registrations", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/esports-control", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/registration-controls", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/games", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/checkin", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/users", perms, "active"), false);
    }

    for (const coordRole of ["esports_manager", "score_operator"] as const) {
      const perms = resolveEffectivePermissions(coordRole, "active");
      assert.equal(canAccessAdminRoute("/admin", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/esports-control", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/esports-registrations", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/games", perms, "active"), true);
      assert.equal(canAccessAdminRoute("/admin/registration-controls", perms, "active"), true);
      assert.equal(hasCrmPermission(perms, "esports:approve", "active"), true);
      assert.equal(hasCrmPermission(perms, "esports:reject", "active"), true);
      assert.equal(hasCrmPermission(perms, "esports:edit", "active"), true);
      assert.equal(hasCrmPermission(perms, "tournament:manage_games", "active"), true);
      assert.equal(hasCrmPermission(perms, "tournament:select_teams", "active"), true);
      assert.equal(hasCrmPermission(perms, "tournament:build_bracket", "active"), true);
      assert.equal(hasCrmPermission(perms, "tournament:assign_conductors", "active"), true);
      assert.equal(hasCrmPermission(perms, "tournament:confirm_results", "active"), true);
      assert.equal(hasCrmPermission(perms, "tournament:resolve_disputes", "active"), true);
      assert.equal(canAccessAdminRoute("/admin/users", perms, "active"), false);
    }
  });
});
