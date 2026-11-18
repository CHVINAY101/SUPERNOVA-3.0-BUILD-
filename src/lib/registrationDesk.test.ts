import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessRegistrationDesk,
  canToggleRegistrationControls,
  computeDeskTodayMetrics,
  getIstDateKey,
  isRegistrationDeskOnlyRole,
} from "./registrationDesk.ts";
import { resolveEffectivePermissions } from "./rbac.ts";

describe("Registration Desk Portal Access Isolation, Super Admin Control Lock & IST Metrics", () => {
  it("Allows /registration-desk access for active registration_staff, crm_admin, and super_admin only", () => {
    assert.equal(canAccessRegistrationDesk("registration_staff", "active"), true);
    assert.equal(canAccessRegistrationDesk("crm_admin", "active"), true);
    assert.equal(canAccessRegistrationDesk("super_admin", "active"), true);

    // Gate-only, conductor, content, esports_manager, and viewer roles blocked
    assert.equal(canAccessRegistrationDesk("checkin_staff", "active"), false);
    assert.equal(canAccessRegistrationDesk("esports_entry_staff", "active"), false);
    assert.equal(canAccessRegistrationDesk("match_conductor", "active"), false);
    assert.equal(canAccessRegistrationDesk("esports_manager", "active"), false);
    assert.equal(canAccessRegistrationDesk("content_manager", "active"), false);
    assert.equal(canAccessRegistrationDesk("viewer", "active"), false);

    // Non-active account statuses always denied
    assert.equal(canAccessRegistrationDesk("registration_staff", "invited"), false);
    assert.equal(canAccessRegistrationDesk("registration_staff", "deactivated"), false);
    assert.equal(canAccessRegistrationDesk("super_admin", "revoked"), false);
  });

  it("Identifies registration_staff as desk-only so they are blocked from Admin CRM", () => {
    assert.equal(isRegistrationDeskOnlyRole("registration_staff"), true);
    assert.equal(isRegistrationDeskOnlyRole("checkin_staff"), false);
    assert.equal(isRegistrationDeskOnlyRole("esports_entry_staff"), false);
    assert.equal(isRegistrationDeskOnlyRole("crm_admin"), false);
    assert.equal(isRegistrationDeskOnlyRole("super_admin"), false);
  });

  it("Locks Registration Controls open/close toggles unless Super Admin or explicit system_settings:manage override", () => {
    const defaultDeskPerms = resolveEffectivePermissions("registration_staff", "active");
    const defaultCrmAdminPerms = resolveEffectivePermissions("crm_admin", "active");
    const superAdminPerms = resolveEffectivePermissions("super_admin", "active");
    const authorizedDeskPerms = resolveEffectivePermissions("registration_staff", "active", [
      { permission_key: "system_settings:manage", allowed: true },
    ]);

    assert.equal(canToggleRegistrationControls("registration_staff", "active", defaultDeskPerms), false);
    assert.equal(canToggleRegistrationControls("crm_admin", "active", defaultCrmAdminPerms), false);
    assert.equal(canToggleRegistrationControls("super_admin", "active", superAdminPerms), true);
    assert.equal(canToggleRegistrationControls("registration_staff", "active", authorizedDeskPerms), true);
    assert.equal(canToggleRegistrationControls("super_admin", "deactivated", superAdminPerms), false);
  });

  it("Computes IST today counts accurately and excludes archived esports rows", () => {
    // 2026-11-20T18:45:00Z is 2026-11-21T00:15:00+05:30 (already Nov 21 in IST)
    const now = new Date("2026-11-20T18:45:00.000Z");
    assert.equal(getIstDateKey(now), "2026-11-21");

    const metrics = computeDeskTodayMetrics({
      now,
      visitors: [
        { created_at: "2026-11-20T18:35:00.000Z" }, // Nov 21 00:05 IST -> today
        { created_at: "2026-11-20T18:20:00.000Z" }, // Nov 20 23:50 IST -> yesterday
      ],
      esports: [
        { submitted_at: "2026-11-21T03:00:00.000Z", admin_notes: null, archived_at: null }, // today
        { submitted_at: "2026-11-21T04:00:00.000Z", admin_notes: "[ARCHIVED test]", archived_at: null }, // archived
        { submitted_at: "2026-11-19T12:00:00.000Z", admin_notes: null, archived_at: null }, // earlier
      ],
    });

    assert.equal(metrics.visitorsToday, 1);
    assert.equal(metrics.visitorsTotal, 2);
    assert.equal(metrics.esportsToday, 1);
    assert.equal(metrics.esportsTotal, 2);
  });
});
