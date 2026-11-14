import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryTicketStore,
  buildSecureQrPayload,
  canAccessTicketDetails,
  evaluateTicketStatus,
  isRegistrationEligibleForTicket,
  parseSecureQrPayload,
  type TicketLikeRecord,
} from "./ticketing.ts";

const makeTicket = (overrides: Partial<TicketLikeRecord> = {}): TicketLikeRecord => ({
  id: "tkt-1",
  ticket_ref: "SN3-26-000101",
  qr_token: "a".repeat(64),
  registration_id: "reg-1",
  registration_category: "visitor",
  registration_ref: "SN3-26-000101",
  display_name: "Aarav Sharma",
  institution: "The National College, Basavanagudi",
  status: "active",
  issued_at: "2026-11-15T09:00:00.000Z",
  checked_in_at: null,
  checked_in_by_email: null,
  ...overrides,
});

describe("Supernova 3.0 Ticketing & Gate Verification Domain", () => {
  it("builds PII-free QR payload containing only version, ticket ref, and token", () => {
    const raw = buildSecureQrPayload("sn3-26-000101", "deadbeef".repeat(8));
    const parsed = JSON.parse(raw);

    assert.equal(parsed.v, 1);
    assert.equal(parsed.ref, "SN3-26-000101");
    assert.equal(parsed.token, "deadbeef".repeat(8));
    assert.equal("email" in parsed, false);
    assert.equal("phone" in parsed, false);
    assert.equal("status" in parsed, false);
  });

  it("parses secure QR JSON, token-only strings, and ignores untrusted status claims", () => {
    const secure = parseSecureQrPayload(
      JSON.stringify({
        v: 1,
        ref: "SN3-26-000101",
        token: "f".repeat(64),
        status: "confirmed",
        eligible: true,
      })
    );
    assert.equal(secure.ok, true);
    assert.equal(secure.ticketRef, "SN3-26-000101");
    assert.equal(secure.qrToken, "f".repeat(64));
    assert.equal(secure.ignoredUntrustedClaims, true);

    const tokenOnly = parseSecureQrPayload("b".repeat(64));
    assert.equal(tokenOnly.ok, true);
    assert.equal(tokenOnly.isTokenOnly, true);
    assert.equal(tokenOnly.qrToken, "b".repeat(64));
  });

  it("enforces category approval gating: pending/declined participation & esports cannot issue tickets", () => {
    assert.equal(
      isRegistrationEligibleForTicket("visitor", { status: "confirmed" }).eligible,
      true
    );
    assert.equal(
      isRegistrationEligibleForTicket("participation", { status: "pending" }).eligible,
      false
    );
    assert.equal(
      isRegistrationEligibleForTicket("participation", { status: "declined" }).eligible,
      false
    );
    assert.equal(
      isRegistrationEligibleForTicket("participation", { status: "confirmed" }).eligible,
      true
    );
    assert.equal(
      isRegistrationEligibleForTicket("esports", { status: "pending" }).eligible,
      false
    );
    assert.equal(
      isRegistrationEligibleForTicket("esports", { status: "correction_requested" }).eligible,
      false
    );
    assert.equal(
      isRegistrationEligibleForTicket("esports", { status: "confirmed" }).eligible,
      true
    );
    assert.equal(
      isRegistrationEligibleForTicket("participation", {
        status: "confirmed",
        archived_at: "2026-11-15T10:00:00Z",
      }).eligible,
      false
    );
  });

  it("is idempotent: repeated issuance requests return the exact same ticket and never duplicate", () => {
    const store = new InMemoryTicketStore();
    const first = store.issueTicket({
      registrationId: "part-1",
      category: "participation",
      registrationRef: "SN3-26-000201",
      ticketRef: "SN3-26-000201",
      qrToken: "1".repeat(64),
      displayName: "Solar Rover Project",
      registration: { status: "confirmed" },
    });
    const second = store.issueTicket({
      registrationId: "part-1",
      category: "participation",
      registrationRef: "SN3-26-000201",
      ticketRef: "SN3-26-000201",
      qrToken: "2".repeat(64),
      displayName: "Solar Rover Project",
      registration: { status: "confirmed" },
    });

    assert.equal(first.ok, true);
    assert.equal(first.created, true);
    assert.equal(second.ok, true);
    assert.equal(second.created, false);
    assert.equal(second.ticket?.id, first.ticket?.id);
    assert.equal(second.ticket?.qr_token, first.ticket?.qr_token);
  });

  it("evaluates VALID, ALREADY USED, and INVALID ticket states strictly against DB records", () => {
    const activeTicket = makeTicket();
    const valid = evaluateTicketStatus({
      ticket: activeTicket,
      registration: { status: "confirmed" },
      suppliedQrToken: activeTicket.qr_token,
      suppliedTicketRef: activeTicket.ticket_ref,
    });
    assert.equal(valid.verdict, "VALID");
    assert.equal(valid.canCheckIn, true);

    const used = evaluateTicketStatus({
      ticket: makeTicket({ checked_in_at: "2026-11-20T09:15:00Z", checked_in_by_email: "gate@nc.edu" }),
      registration: { status: "confirmed" },
      suppliedQrToken: activeTicket.qr_token,
    });
    assert.equal(used.verdict, "ALREADY USED");
    assert.equal(used.canCheckIn, false);

    const tamperedToken = evaluateTicketStatus({
      ticket: activeTicket,
      registration: { status: "confirmed" },
      suppliedQrToken: "z".repeat(64),
    });
    assert.equal(tamperedToken.verdict, "INVALID");
    assert.equal(tamperedToken.canCheckIn, false);

    const revoked = evaluateTicketStatus({
      ticket: makeTicket({ status: "revoked" }),
      registration: { status: "confirmed" },
    });
    assert.equal(revoked.verdict, "INVALID");

    const declinedReg = evaluateTicketStatus({
      ticket: activeTicket,
      registration: { status: "declined" },
    });
    assert.equal(declinedReg.verdict, "INVALID");
  });

  it("prevents concurrent check-in race conditions so two staff members cannot check in the same ticket twice", async () => {
    const store = new InMemoryTicketStore();
    const token = "c".repeat(64);
    store.issueTicket({
      registrationId: "vis-99",
      category: "visitor",
      registrationRef: "SN3-26-000999",
      ticketRef: "SN3-26-000999",
      qrToken: token,
      displayName: "Meera Nair",
      registration: { status: "confirmed" },
    });

    const [staffA, staffB] = await Promise.all([
      store.atomicCheckIn({
        ticketRef: "SN3-26-000999",
        qrToken: token,
        staffEmail: "gate1@supernova.edu",
        registration: { status: "confirmed" },
      }),
      store.atomicCheckIn({
        ticketRef: "SN3-26-000999",
        qrToken: token,
        staffEmail: "gate2@supernova.edu",
        registration: { status: "confirmed" },
      }),
    ]);

    const successes = [staffA, staffB].filter((r) => r.ok);
    const duplicates = [staffA, staffB].filter((r) => !r.ok && r.verdict === "ALREADY USED");

    assert.equal(successes.length, 1);
    assert.equal(duplicates.length, 1);
  });

  it("blocks IDOR attempts when looking up public ticket without matching email and phone", () => {
    const stored = {
      ticketRef: "SN3-26-000101",
      registrationRef: "SN3-26-000101",
      email: "aarav@example.com",
      phone: "+91 98765 43210",
    };

    assert.equal(
      canAccessTicketDetails(
        { reference: "SN3-26-000101", email: "aarav@example.com", phone: "9876543210" },
        stored
      ),
      true
    );

    assert.equal(
      canAccessTicketDetails(
        { reference: "SN3-26-000102", email: "aarav@example.com", phone: "9876543210" },
        stored
      ),
      false
    );

    assert.equal(
      canAccessTicketDetails(
        { reference: "SN3-26-000101", email: "attacker@example.com", phone: "9876543210" },
        stored
      ),
      false
    );

    assert.equal(
      canAccessTicketDetails(
        { reference: "SN3-26-000101", email: "aarav@example.com", phone: "9999999999" },
        stored
      ),
      false
    );
  });
});
