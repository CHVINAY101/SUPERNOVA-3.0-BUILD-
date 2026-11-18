import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessGatePortal,
  formatLastUpdatedIst,
  getGateVerdictPresentation,
  isGateOnlyRole,
} from "./gatePortal.ts";
import { hasCrmPermission, resolveEffectivePermissions } from "./rbac.ts";

describe("Phase 4, 5 & 7 — Gate Portal Access Isolation, Ticket Verdicts & RBAC Boundaries", () => {
  it("Allows gate portal access only for active gate staff, crm_admin, and super_admin", () => {
    // Allowed gate roles
    assert.equal(canAccessGatePortal("registration_staff", "active"), true);
    assert.equal(canAccessGatePortal("esports_entry_staff", "active"), true);
    assert.equal(canAccessGatePortal("checkin_staff", "active"), true);
    assert.equal(canAccessGatePortal("crm_admin", "active"), true);
    assert.equal(canAccessGatePortal("super_admin", "active"), true);

    // Non-gate CRM roles blocked from Gate Portal
    assert.equal(canAccessGatePortal("match_conductor", "active"), false);
    assert.equal(canAccessGatePortal("content_manager", "active"), false);
    assert.equal(canAccessGatePortal("viewer", "active"), false);
    assert.equal(canAccessGatePortal("esports_manager", "active"), false);

    // Inactive / deactivated / invited statuses always blocked
    assert.equal(canAccessGatePortal("registration_staff", "deactivated"), false);
    assert.equal(canAccessGatePortal("esports_entry_staff", "revoked"), false);
    assert.equal(canAccessGatePortal("super_admin", "invited"), false);
  });

  it("Identifies gate-only staff roles so they cannot open /admin* CRM routes", () => {
    assert.equal(isGateOnlyRole("registration_staff"), true);
    assert.equal(isGateOnlyRole("esports_entry_staff"), true);
    assert.equal(isGateOnlyRole("checkin_staff"), true);

    assert.equal(isGateOnlyRole("super_admin"), false);
    assert.equal(isGateOnlyRole("crm_admin"), false);
    assert.equal(isGateOnlyRole("esports_manager"), false);
    assert.equal(isGateOnlyRole("match_conductor"), false);
  });

  it("Maps all 4 gate verification verdicts cleanly including CANCELLED / REVOKED", () => {
    assert.equal(getGateVerdictPresentation("VALID").label, "VALID");
    assert.ok(getGateVerdictPresentation("VALID").badgeClass.includes("emerald"));

    assert.equal(getGateVerdictPresentation("ALREADY USED").label, "ALREADY USED");
    assert.ok(getGateVerdictPresentation("ALREADY USED").badgeClass.includes("amber"));

    assert.equal(getGateVerdictPresentation("CANCELLED / REVOKED").label, "CANCELLED / REVOKED");
    assert.ok(getGateVerdictPresentation("CANCELLED / REVOKED").badgeClass.includes("slate"));

    assert.equal(getGateVerdictPresentation("INVALID").label, "INVALID");
    assert.ok(getGateVerdictPresentation("INVALID").badgeClass.includes("rose"));
  });

  it("Prevents user_management:deactivate alone from unlocking user_management:delete", () => {
    const deactivateOnly = resolveEffectivePermissions("viewer", "active", [
      { permission_key: "user_management:view", allowed: true },
      { permission_key: "user_management:deactivate", allowed: true },
    ]);
    assert.equal(hasCrmPermission(deactivateOnly, "user_management:deactivate", "active"), true);
    assert.equal(hasCrmPermission(deactivateOnly, "user_management:delete", "active"), false);
  });

  it("Formats last-updated timestamps safely in IST and handles empty values", () => {
    assert.equal(formatLastUpdatedIst(null), "Not updated yet");
    assert.equal(formatLastUpdatedIst("invalid-date"), "Not updated yet");
    const formatted = formatLastUpdatedIst("2026-11-18T10:30:00.000Z");
    assert.ok(formatted.endsWith("IST"));
  });
});
