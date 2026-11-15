import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckInInsertPayload,
  buildRegistrationCheckInPatch,
  computeEntryStatistics,
  DEFAULT_WRISTBAND_CATEGORIES,
  evaluateEsportsPlayerEntry,
  evaluateVisitorEntry,
  formatCheckInDatabaseError,
  isUuidString,
  parseTicketQrPayload,
  toUuidOrNull,
  validateWristbandIssuance,
} from "./entryOperations.ts";
import type {
  CheckIn,
  Player,
  Registration,
  VisitorRegistration,
  WristbandIssuance,
} from "../types/database.ts";

const makeVisitor = (overrides: Partial<VisitorRegistration> = {}): VisitorRegistration => ({
  id: "vis-1",
  registration_ref: "SN3-VIS-100001",
  full_name: "Aarav Sharma",
  email: "aarav@college.edu",
  phone: null,
  student_class: "B.Sc. Animation — Sem 3",
  institution: "National College",
  visitor_category: "Student",
  visitor_count: 1,
  status: "confirmed",
  admin_notes: null,
  submitted_at: "2026-11-10T10:00:00Z",
  ...overrides,
});

const makeTeam = (overrides: Partial<Registration> = {}): Registration => ({
  id: "team-1",
  registration_ref: "SN3-26-000101",
  team_name: "Bengaluru Titans",
  game_id: "game-val",
  captain_name: "Rohan Verma",
  email: "rohan@titans.gg",
  phone: "9123456789",
  institution: "TNC Basavanagudi",
  status: "confirmed",
  selection_status: "selected",
  admin_notes: null,
  submitted_at: "2026-11-10T10:00:00Z",
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
  ...overrides,
});

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: "player-1",
  registration_id: "team-1",
  player_name: "Rohan Verma",
  gamer_tag: "Vortex#IN",
  player_ticket_ref: "SN3-26-000101-P1",
  roster_role: "captain",
  check_in_status: "not_checked_in",
  check_in_at: null,
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
  ...overrides,
});

describe("Event Entry, QR Verification & Wristband Operations (Scenarios 1–9)", () => {
  it("Scenario 1 & 24: QR ticket parsing extracts ref and ignores forged QR status/role claims", () => {
    const forgedJson = JSON.stringify({
      ticketRef: "SN3-VIS-100001",
      status: "confirmed",
      eligible: true,
      role: "super_admin",
    });
    const parsed = parseTicketQrPayload(forgedJson);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.ticketRef, "SN3-VIS-100001");
    assert.equal(parsed.ignoredUntrustedClaims, true);

    const urlQr = parseTicketQrPayload("https://supernova.edu/verify?ticket=SN3-26-000101-P1&status=confirmed");
    assert.equal(urlQr.ok, true);
    assert.equal(urlQr.ticketRef, "SN3-26-000101-P1");
    assert.equal(urlQr.ignoredUntrustedClaims, true);

    const pendingVisitor = makeVisitor({ status: "pending" });
    const decision = evaluateVisitorEntry({
      visitor: pendingVisitor,
      checkIns: [],
      eventDay: "2026-11-20",
    });
    assert.equal(decision.decision, "denied");
  });

  it("Scenario 1 & 2: Valid Visitor QR Check-In succeeds once, then blocks duplicate with prior staff & timestamp", () => {
    const visitor = makeVisitor();
    const first = evaluateVisitorEntry({
      visitor,
      checkIns: [],
      eventDay: "2026-11-20",
    });
    assert.equal(first.decision, "eligible");
    assert.equal(first.recommendedWristbandSlug, "general-visitor");

    const day1CheckIn: CheckIn = {
      id: "ci-1",
      registration_id: visitor.id,
      player_id: null,
      ticket_ref: visitor.registration_ref,
      subject_type: "visitor",
      event_day: "2026-11-20",
      check_in_type: "individual",
      checked_in_by: "staff-1",
      checked_in_by_email: "gate1@supernova.edu",
      checked_in_at: "2026-11-20T09:15:00Z",
      notes: "Gate A",
      created_at: "2026-11-20T09:15:00Z",
    };

    const duplicate = evaluateVisitorEntry({
      visitor,
      checkIns: [day1CheckIn],
      eventDay: "2026-11-20",
    });
    assert.equal(duplicate.decision, "already_checked_in");
    assert.match(duplicate.reason, /ALREADY CHECKED IN/);
    assert.equal(duplicate.priorCheckIn?.checkedInBy, "gate1@supernova.edu");
    assert.equal(duplicate.priorCheckIn?.checkedInAt, "2026-11-20T09:15:00Z");
  });

  it("Scenario 3: Visitor ticket cannot qualify for Esports entry", () => {
    const visitor = makeVisitor();
    const crossCheck = evaluateVisitorEntry({
      visitor,
      checkIns: [],
      eventDay: "2026-11-20",
      requestedTrack: "esports",
    });
    assert.equal(crossCheck.decision, "denied");
    assert.equal(crossCheck.tournamentEligible, false);
  });

  it("Scenario 4 & 5: Valid Selected Esports Player succeeds; Pending, Declined, Withdrawn & Disqualified fail", () => {
    const team = makeTeam();
    const player = makePlayer();
    const ok = evaluateEsportsPlayerEntry({
      team,
      player,
      playerTicketRef: "SN3-26-000101-P1",
      gameTitle: "VALORANT",
      checkIns: [],
      eventDay: "2026-11-20",
    });
    assert.equal(ok.decision, "eligible");
    assert.equal(ok.tournamentEligible, true);
    assert.equal(ok.recommendedWristbandSlug, "esports-participant");

    for (const badStatus of ["pending", "declined", "withdrawn"] as const) {
      const denied = evaluateEsportsPlayerEntry({
        team: makeTeam({ status: badStatus }),
        player,
        playerTicketRef: "SN3-26-000101-P1",
        gameTitle: "VALORANT",
        checkIns: [],
        eventDay: "2026-11-20",
      });
      assert.equal(denied.decision, "denied");
      assert.equal(denied.tournamentEligible, false);
    }

    const disqualified = evaluateEsportsPlayerEntry({
      team: makeTeam({ status: "confirmed", selection_status: "disqualified" }),
      player,
      playerTicketRef: "SN3-26-000101-P1",
      gameTitle: "VALORANT",
      checkIns: [],
      eventDay: "2026-11-20",
    });
    assert.equal(disqualified.decision, "denied");
  });

  it("Scenario 6: Approved-but-not-selected team player gets general entry only (or denied if strict) and NEVER tournament eligibility", () => {
    const approvedNotSelected = makeTeam({ status: "confirmed", selection_status: "not_selected" });
    const player = makePlayer();

    const entryOnly = evaluateEsportsPlayerEntry({
      team: approvedNotSelected,
      player,
      playerTicketRef: "SN3-26-000101-P1",
      gameTitle: "BGMI",
      checkIns: [],
      eventDay: "2026-11-20",
      allowApprovedUnselectedEntryOnly: true,
    });
    assert.equal(entryOnly.decision, "entry_only_no_tournament");
    assert.equal(entryOnly.tournamentEligible, false);
    assert.equal(entryOnly.recommendedWristbandSlug, "general-visitor");

    const strictDenied = evaluateEsportsPlayerEntry({
      team: approvedNotSelected,
      player,
      playerTicketRef: "SN3-26-000101-P1",
      gameTitle: "BGMI",
      checkIns: [],
      eventDay: "2026-11-20",
      allowApprovedUnselectedEntryOnly: false,
    });
    assert.equal(strictDenied.decision, "denied");
  });

  it("Scenario 7: Wristband issuance records category, blocks duplicates, and supports documented replacement", () => {
    const first = validateWristbandIssuance({
      categories: DEFAULT_WRISTBAND_CATEGORIES,
      existingIssuances: [],
      categoryIdOrSlug: "general-visitor",
      ticketRef: "SN3-VIS-100001",
      eventDay: "2026-11-20",
    });
    assert.equal(first.ok, true);

    const activeIssuance: WristbandIssuance = {
      id: "wbi-1",
      category_id: "wb-general-visitor",
      category_name: "General Visitor",
      ticket_ref: "SN3-VIS-100001",
      holder_name: "Aarav Sharma",
      subject_type: "visitor",
      event_day: "2026-11-20",
      issued_by: "staff-1",
      issued_at: "2026-11-20T09:15:00Z",
      status: "active",
    };

    const dup = validateWristbandIssuance({
      categories: DEFAULT_WRISTBAND_CATEGORIES,
      existingIssuances: [activeIssuance],
      categoryIdOrSlug: "general-visitor",
      ticketRef: "SN3-VIS-100001",
      eventDay: "2026-11-20",
    });
    assert.equal(dup.ok, false);

    const replace = validateWristbandIssuance({
      categories: DEFAULT_WRISTBAND_CATEGORIES,
      existingIssuances: [activeIssuance],
      categoryIdOrSlug: "general-visitor",
      ticketRef: "SN3-VIS-100001",
      eventDay: "2026-11-20",
      isReplacement: true,
      replacementReason: "Original band torn at auditorium gate",
    });
    assert.equal(replace.ok, true);
  });

  it("Scenario 8: Multi-Day Check-In allows Day 1 and Day 2 without duplicating visitor registration", () => {
    const visitor = makeVisitor();
    const day1: CheckIn = {
      id: "ci-d1",
      registration_id: visitor.id,
      player_id: null,
      ticket_ref: visitor.registration_ref,
      subject_type: "visitor",
      event_day: "2026-11-20",
      check_in_type: "individual",
      checked_in_by: "staff-1",
      checked_in_at: "2026-11-20T10:00:00Z",
      notes: null,
      created_at: "2026-11-20T10:00:00Z",
    };

    const day2Check = evaluateVisitorEntry({
      visitor,
      checkIns: [day1],
      eventDay: "2026-11-21",
    });
    assert.equal(day2Check.decision, "eligible");
  });

  it("Scenario 9: Entry statistics accurately separate visitors from auto-linked esports players without double-counting", () => {
    const standaloneVisitor = makeVisitor({ id: "v1", registration_ref: "SN3-VIS-1" });
    const autoLinkedEsportsVisitor = makeVisitor({
      id: "v2",
      registration_ref: "SN3-VIS-2",
      email: "rohan@titans.gg",
      visitor_category: "Esports Player",
      admin_notes: "[AUTO_LINKED_ESPORTS_PLAYER: SN3-26-000101]",
    });

    const team = makeTeam({ id: "team-1", status: "confirmed", selection_status: "selected" });
    const players = [
      makePlayer({ id: "p1", registration_id: "team-1", player_ticket_ref: "SN3-26-000101-P1" }),
      makePlayer({ id: "p2", registration_id: "team-1", player_ticket_ref: "SN3-26-000101-P2" }),
    ];

    const checkIns: CheckIn[] = [
      {
        id: "ci-1",
        registration_id: "v1",
        player_id: null,
        ticket_ref: "SN3-VIS-1",
        subject_type: "visitor",
        event_day: "2026-11-20",
        check_in_type: "individual",
        checked_in_by: "s1",
        checked_in_by_email: "staffA@supernova.edu",
        checked_in_at: "2026-11-20T09:00:00Z",
        notes: null,
        created_at: "2026-11-20T09:00:00Z",
      },
      {
        id: "ci-2",
        registration_id: "team-1",
        player_id: "p1",
        ticket_ref: "SN3-26-000101-P1",
        subject_type: "esports_player",
        event_day: "2026-11-20",
        check_in_type: "individual",
        checked_in_by: "s2",
        checked_in_by_email: "staffB@supernova.edu",
        checked_in_at: "2026-11-20T09:10:00Z",
        notes: null,
        created_at: "2026-11-20T09:10:00Z",
      },
    ];

    const stats = computeEntryStatistics({
      visitors: [standaloneVisitor, autoLinkedEsportsVisitor],
      esportsTeams: [team],
      players,
      checkIns,
      wristbands: [],
    });

    assert.equal(stats.totalRegisteredVisitors, 1);
    assert.equal(stats.totalVisitorsCheckedIn, 1);
    assert.equal(stats.totalEsportsPlayersExpected, 2);
    assert.equal(stats.totalEsportsPlayersCheckedIn, 1);
    assert.equal(stats.entriesByDay["2026-11-20"], 2);
    assert.equal(stats.checkInsByStaff["staffA@supernova.edu"], 1);
    assert.equal(stats.checkInsByStaff["staffB@supernova.edu"], 1);
  });

  it("Scenario 10: UUID-safe check-in payloads NEVER pass staff email into checked_in_by UUID columns", () => {
    const validUuid = "550e8400-e29b-41d4-a716-446655440000";
    const staffEmail = "animationthenationalcollege@gmail.com";

    assert.equal(isUuidString(validUuid), true);
    assert.equal(isUuidString(staffEmail), false);
    assert.equal(toUuidOrNull(validUuid), validUuid);
    assert.equal(toUuidOrNull(staffEmail), null);
    assert.equal(toUuidOrNull(undefined), null);

    // When actorUserId is mistakenly an email or missing, checked_in_by becomes null (never the email)
    const fallbackWithEmailId = buildCheckInInsertPayload({
      registrationId: validUuid,
      ticketRef: "SN3-VIS-100001",
      subjectType: "visitor",
      eventDay: "2026-11-20",
      actorUserId: staffEmail,
      actorEmail: staffEmail,
    });
    assert.equal(fallbackWithEmailId.checked_in_by, null);
    assert.equal(fallbackWithEmailId.checked_in_by_email, staffEmail);

    // When actorUserId is a valid UUID, checked_in_by preserves UUID and checked_in_by_email preserves email
    const validPayload = buildCheckInInsertPayload({
      registrationId: validUuid,
      ticketRef: "SN3-VIS-100001",
      subjectType: "visitor",
      eventDay: "2026-11-20",
      actorUserId: validUuid,
      actorEmail: staffEmail,
      wristbandCategory: "General Visitor",
    });
    assert.equal(validPayload.checked_in_by, validUuid);
    assert.equal(validPayload.checked_in_by_email, staffEmail);

    // Registration patch also protects UUID column checked_in_by
    const regPatchBadId = buildRegistrationCheckInPatch({
      checkedIn: true,
      actorUserId: staffEmail,
      actorEmail: staffEmail,
      includeEmailColumn: true,
    });
    assert.equal(regPatchBadId.checked_in_by, null);
    assert.equal(regPatchBadId.checked_in_by_email, staffEmail);

    const regPatchValidId = buildRegistrationCheckInPatch({
      checkedIn: true,
      actorUserId: validUuid,
      actorEmail: staffEmail,
      includeEmailColumn: false,
    });
    assert.equal(regPatchValidId.checked_in_by, validUuid);
    assert.equal("checked_in_by_email" in regPatchValidId, false);
  });

  it("Scenario 11 (FK Fix): Visitor check-ins NEVER write their IDs into check_ins.registration_id", () => {
    const visitorUuid = "11111111-1111-4111-8111-111111111111";
    const esportsTeamUuid = "33333333-3333-4333-8333-333333333333";
    const esportsPlayerUuid = "44444444-4444-4444-8444-444444444444";
    const staffUuid = "55555555-5555-4555-8555-555555555555";

    // Visitor (e.g. VINAY SN3-26-000051): registration_id MUST be null; visitor_registration_id carries visitorUuid
    const visitorPayload = buildCheckInInsertPayload({
      registrationId: visitorUuid, // even if mistakenly passed, buildCheckInInsertPayload blocks it!
      visitorRegistrationId: visitorUuid,
      ticketRef: "SN3-26-000051",
      subjectType: "visitor",
      eventDay: "2026-11-20",
      actorUserId: staffUuid,
      actorEmail: "gate@supernova.edu",
    });
    assert.equal(visitorPayload.registration_id, null);
    assert.equal(visitorPayload.visitor_registration_id, visitorUuid);
    assert.equal(visitorPayload.player_id, null);
    assert.equal(visitorPayload.ticket_ref, "SN3-26-000051");

    // Esports player: registration_id MUST be esportsTeamUuid (public.registrations.id) & player_id = esportsPlayerUuid
    const esportsPayload = buildCheckInInsertPayload({
      registrationId: esportsTeamUuid,
      playerId: esportsPlayerUuid,
      ticketRef: "SN3-26-000101-P1",
      subjectType: "esports_player",
      eventDay: "2026-11-20",
      actorUserId: staffUuid,
      actorEmail: "esports@supernova.edu",
    });
    assert.equal(esportsPayload.registration_id, esportsTeamUuid);
    assert.equal(esportsPayload.player_id, esportsPlayerUuid);
    assert.equal(esportsPayload.visitor_registration_id, undefined);
  });

  it("Scenario 12: Visitor entry supports simplified visitors without phone and Day 1 / Day 2 duplicate guards", () => {
    const vinay = makeVisitor({
      id: "vinay-uuid",
      registration_ref: "SN3-26-000051",
      full_name: "VINAY",
      phone: null,
      student_class: "II PUC Science",
      institution: "The National College, Basavanagudi",
    });
    const vinayD1CheckIn: CheckIn = {
      id: "ci-vinay-1",
      registration_id: null,
      visitor_registration_id: vinay.id,
      player_id: null,
      ticket_ref: "SN3-26-000051",
      subject_type: "visitor",
      event_day: "2026-11-20",
      check_in_type: "individual",
      checked_in_by: "staff-1",
      checked_in_at: "2026-11-20T09:30:00Z",
      notes: null,
      created_at: "2026-11-20T09:30:00Z",
    };
    assert.equal(
      evaluateVisitorEntry({ visitor: vinay, checkIns: [vinayD1CheckIn], eventDay: "2026-11-20" }).decision,
      "already_checked_in"
    );
    assert.equal(
      evaluateVisitorEntry({ visitor: vinay, checkIns: [vinayD1CheckIn], eventDay: "2026-11-21" }).decision,
      "eligible"
    );

    // Clear migration guidance if DB FK migration isn't applied yet
    const fkHint = formatCheckInDatabaseError({
      message: 'insert or update on table "check_ins" violates foreign key constraint "check_ins_registration_id_fkey"',
    });
    assert.match(fkHint, /20261116000000_fix_checkins_fk_registration_mapping\.sql/);
  });

  it("Scenario 13: PGRST204 / checked_in_by_email schema cache errors return clear 20261118 migration guidance", () => {
    const schemaCacheHint = formatCheckInDatabaseError({
      code: "PGRST204",
      message: "Could not find the 'checked_in_by_email' column of 'check_ins' in the schema cache",
    });
    assert.match(schemaCacheHint, /20261118000000_gate_checkin_schema_repair_and_walkin\.sql/);
    assert.match(schemaCacheHint, /checked_in_by_email/);
  });
});
