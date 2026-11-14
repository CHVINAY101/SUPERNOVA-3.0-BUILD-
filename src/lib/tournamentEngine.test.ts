import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeConductorMatchOperation,
  calculateBattleRoyaleStandings,
  calculateGroupStandings,
  calculateRoundBasedOutcome,
  canRegenerateBracket,
  canTeamEnterTournament,
  confirmAndAdvanceMatchResult,
  escalateMatchDispute,
  generateTournamentMatches,
  resolveMatchDispute,
  submitMatchResultDraft,
  validateSelectionUpdate,
} from "./tournamentEngine.ts";
import { resolveEffectivePermissions } from "./rbac.ts";
import type { Match, Registration, Tournament } from "../types/database.ts";

const makeTeam = (id: string, name: string, overrides: Partial<Registration> = {}): Registration => ({
  id,
  registration_ref: `SN3-26-${id}`,
  team_name: name,
  game_id: "game-1",
  captain_name: `Captain ${name}`,
  email: `${id}@team.edu`,
  phone: "9999999999",
  institution: "National College",
  status: "confirmed",
  selection_status: "selected",
  seed_number: null,
  admin_notes: null,
  submitted_at: `2026-11-01T10:00:0${id.slice(-1)}Z`,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  ...overrides,
});

const makeTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: "tour-1",
  game_id: "game-1",
  name: "VALORANT Main Event",
  format: "single_elimination",
  scoring_mode: "round_based",
  seeding_mode: "registration_order",
  require_manager_confirmation: true,
  status: "draft",
  has_started: false,
  created_by: "mgr-1",
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
  ...overrides,
});

describe("Esports Tournament Operations Engine (Scenarios 10–20)", () => {
  it("Scenario 11 & 12: Independent Approval vs Tournament Selection — only selected teams enter brackets", () => {
    const pendingTeam = makeTeam("1", "Pending", { status: "pending", selection_status: "awaiting_selection" });
    const approvedNotSelected = makeTeam("2", "Approved Only", { status: "confirmed", selection_status: "not_selected" });
    const waitlistedTeam = makeTeam("3", "Waitlist", { status: "confirmed", selection_status: "waitlisted" });
    const selectedA = makeTeam("4", "Alpha", { status: "confirmed", selection_status: "selected" });
    const selectedB = makeTeam("5", "Bravo", { status: "confirmed", selection_status: "selected" });

    assert.equal(canTeamEnterTournament(pendingTeam).ok, false);
    assert.equal(canTeamEnterTournament(approvedNotSelected).ok, false);
    assert.equal(canTeamEnterTournament(waitlistedTeam).ok, false);
    assert.equal(canTeamEnterTournament(selectedA).ok, true);

    assert.equal(
      validateSelectionUpdate({ team: pendingTeam, nextSelection: "selected" }).ok,
      false
    );

    const built = generateTournamentMatches({
      tournamentId: "tour-1",
      gameId: "game-1",
      format: "single_elimination",
      teams: [pendingTeam, approvedNotSelected, waitlistedTeam, selectedA, selectedB],
      seedingMode: "registration_order",
    });

    assert.equal(built.ok, true);
    if (built.ok) {
      assert.equal(built.teamCount, 2);
      assert.equal(built.matches.length, 1);
      assert.equal(built.matches[0].team_a_id, "4");
      assert.equal(built.matches[0].team_b_id, "5");
    }
  });

  it("Scenario 13 & 14: Bracket Builder handles Single Elim with Byes, Double Elim, Round Robin, Group+Knockout, and blocks duplicate regeneration", () => {
    const teams3 = [makeTeam("1", "T1"), makeTeam("2", "T2"), makeTeam("3", "T3")];
    const single = generateTournamentMatches({
      tournamentId: "tour-se",
      gameId: "game-1",
      format: "single_elimination",
      teams: teams3,
      seedingMode: "registration_order",
    });
    assert.equal(single.ok, true);
    if (single.ok) {
      // 3 teams -> bracket of 4 -> 2 Semis + 1 Final = 3 matches; 1 Bye auto-advances T3 into Final
      assert.equal(single.matches.length, 3);
      const byeMatch = single.matches.find((m) => m.round_number === 1 && m.status === "completed");
      assert.ok(byeMatch);
      assert.equal(byeMatch?.winner_id, "3");
      const finalMatch = single.matches.find((m) => m.round === "Grand Final");
      assert.equal(finalMatch?.team_b_id, "3");
    }

    const teams4 = [makeTeam("1", "T1"), makeTeam("2", "T2"), makeTeam("3", "T3"), makeTeam("4", "T4")];
    const dbl = generateTournamentMatches({
      tournamentId: "tour-de",
      gameId: "game-1",
      format: "double_elimination",
      teams: teams4,
      seedingMode: "registration_order",
    });
    assert.equal(dbl.ok, true);
    if (dbl.ok) {
      assert.ok(dbl.matches.some((m) => m.bracket_side === "losers"));
      assert.ok(dbl.matches.some((m) => m.bracket_side === "grand_final"));
    }

    const rr = generateTournamentMatches({
      tournamentId: "tour-rr",
      gameId: "game-1",
      format: "round_robin",
      teams: teams4,
      seedingMode: "registration_order",
    });
    assert.equal(rr.ok, true);
    if (rr.ok) {
      // 4 teams Round Robin = 4*3/2 = 6 matches
      assert.equal(rr.matches.length, 6);
    }

    const gk = generateTournamentMatches({
      tournamentId: "tour-gk",
      gameId: "game-1",
      format: "group_knockout",
      teams: teams4,
      seedingMode: "registration_order",
      groupCount: 2,
    });
    assert.equal(gk.ok, true);
    if (gk.ok) {
      assert.ok(gk.matches.some((m) => m.group_name === "Group A"));
      assert.ok(gk.matches.some((m) => m.group_name === "Group B"));
      assert.ok(gk.matches.some((m) => m.bracket_side === "grand_final"));
    }

    // Regeneration lock check
    const tour = makeTournament({ has_started: true });
    const regenBlocked = canRegenerateBracket({
      tournament: tour,
      existingMatches: (single.ok ? single.matches : []) as unknown as Match[],
      confirmedStructuralOverride: false,
    });
    assert.equal(regenBlocked.ok, false);
  });

  it("Scenario 15 & 16: Conductor Authorization — Match Conductor operates ONLY assigned matches; cannot touch unassigned/other matches", () => {
    const conductorPerms = resolveEffectivePermissions("match_conductor", "active");
    const myMatch: Match = {
      id: "m-1",
      game_id: "g-1",
      round: "Semifinal 1",
      team_a_id: "t1",
      team_b_id: "t2",
      scheduled_start: null,
      score_a: 0,
      score_b: 0,
      status: "live",
      winner_id: null,
      conductor_id: "conductor-A",
      is_published: true,
      created_at: "",
      updated_at: "",
    };
    const otherMatch: Match = { ...myMatch, id: "m-2", conductor_id: "conductor-B" };

    assert.equal(
      authorizeConductorMatchOperation({
        match: myMatch,
        actorUserId: "conductor-A",
        permissions: conductorPerms,
      }).ok,
      true
    );
    assert.equal(
      authorizeConductorMatchOperation({
        match: otherMatch,
        actorUserId: "conductor-A",
        permissions: conductorPerms,
      }).ok,
      false
    );

    // Conductor submits result -> awaiting confirmation ('result_submitted'), NOT immediately advancing bracket
    const draft = submitMatchResultDraft({
      match: myMatch,
      actorUserId: "conductor-A",
      permissions: conductorPerms,
      scoreA: 13,
      scoreB: 9,
      winnerId: "t1",
      requireManagerConfirmation: true,
    });
    assert.equal(draft.ok, true);
    if (draft.ok) {
      assert.equal(draft.updatedMatch.status, "result_submitted");
      assert.equal(draft.updatedMatch.result_status, "submitted");
    }

    // Conductor CANNOT confirm official result & advance bracket
    const illegalConfirm = confirmAndAdvanceMatchResult({
      matches: [draft.ok ? draft.updatedMatch : myMatch],
      matchId: "m-1",
      managerUserId: "conductor-A",
      permissions: conductorPerms,
    });
    assert.equal(illegalConfirm.ok, false);
  });

  it("Scenario 17 & 18: Game-specific scoring (Round-Based, Battle Royale, Group Standings) & Double-Advancement Guard", () => {
    const rb = calculateRoundBasedOutcome({
      teamAId: "t1",
      teamBId: "t2",
      maps: [
        { mapName: "Ascent", scoreA: 13, scoreB: 8 },
        { mapName: "Bind", scoreA: 10, scoreB: 13 },
        { mapName: "Haven", scoreA: 13, scoreB: 11 },
      ],
    });
    assert.equal(rb.scoreA, 2);
    assert.equal(rb.scoreB, 1);
    assert.equal(rb.winnerId, "t1");

    const br = calculateBattleRoyaleStandings([
      { teamId: "t1", teamName: "Squad A", placement: 2, kills: 10 }, // 12 + 10 = 22
      { teamId: "t2", teamName: "Squad B", placement: 1, kills: 7 },  // 15 + 7 = 22 -> higher placement points wins tiebreaker!
      { teamId: "t3", teamName: "Squad C", placement: 3, kills: 4 },  // 10 + 4 = 14
    ]);
    assert.equal(br[0].teamId, "t2");
    assert.equal(br[0].rank, 1);
    assert.equal(br[1].teamId, "t1");

    const grp = calculateGroupStandings(["t1", "t2"], [
      {
        id: "gm-1",
        game_id: "g-1",
        round: "Group A",
        team_a_id: "t1",
        team_b_id: "t2",
        scheduled_start: null,
        score_a: 2,
        score_b: 0,
        status: "completed",
        winner_id: "t1",
        is_published: true,
        created_at: "",
        updated_at: "",
      },
    ]);
    assert.equal(grp[0].teamId, "t1");
    assert.equal(grp[0].points, 3);

    // Manager confirmation advances winner once & blocks duplicate advancement
    const mgrPerms = resolveEffectivePermissions("esports_manager", "active");
    const matches: Match[] = [
      {
        id: "semi-1",
        game_id: "g-1",
        round: "Semifinal 1",
        team_a_id: "t1",
        team_b_id: "t2",
        scheduled_start: null,
        score_a: 2,
        score_b: 1,
        status: "result_submitted",
        winner_id: "t1",
        next_match_id: "final-1",
        next_match_slot: "a",
        is_published: true,
        created_at: "",
        updated_at: "",
      },
      {
        id: "final-1",
        game_id: "g-1",
        round: "Grand Final",
        team_a_id: null,
        team_b_id: null,
        scheduled_start: null,
        score_a: 0,
        score_b: 0,
        status: "scheduled",
        winner_id: null,
        is_published: true,
        created_at: "",
        updated_at: "",
      },
    ];

    const firstConfirm = confirmAndAdvanceMatchResult({
      matches,
      matchId: "semi-1",
      managerUserId: "mgr-1",
      permissions: mgrPerms,
    });
    assert.equal(firstConfirm.ok, true);
    if (firstConfirm.ok) {
      assert.equal(firstConfirm.matches[1].team_a_id, "t1");
      assert.ok(firstConfirm.matches[0].bracket_advanced_at);

      const secondConfirm = confirmAndAdvanceMatchResult({
        matches: firstConfirm.matches,
        matchId: "semi-1",
        managerUserId: "mgr-1",
        permissions: mgrPerms,
      });
      assert.equal(secondConfirm.ok, false);
    }
  });

  it("Scenario 19: Dispute escalation freezes progression, preserves original submission, and resolves cleanly", () => {
    const mgrPerms = resolveEffectivePermissions("esports_manager", "active");
    const match: Match = {
      id: "m-disp",
      game_id: "g-1",
      round: "Semifinal 2",
      team_a_id: "t3",
      team_b_id: "t4",
      scheduled_start: null,
      score_a: 11,
      score_b: 13,
      status: "result_submitted",
      winner_id: "t4",
      submitted_by: "conductor-A",
      next_match_id: "final-1",
      next_match_slot: "b",
      is_published: true,
      created_at: "",
      updated_at: "",
    };
    const finalMatch: Match = {
      id: "final-1",
      game_id: "g-1",
      round: "Grand Final",
      team_a_id: "t1",
      team_b_id: null,
      scheduled_start: null,
      score_a: 0,
      score_b: 0,
      status: "scheduled",
      winner_id: null,
      is_published: true,
      created_at: "",
      updated_at: "",
    };

    const escalated = escalateMatchDispute({
      match,
      reporterUserId: "conductor-A",
      reason: "Round 22 disconnect protested by Team T3 captain",
    });
    assert.equal(escalated.ok, true);
    if (!escalated.ok) return;

    assert.equal(escalated.updatedMatch.status, "disputed");
    assert.equal((escalated.dispute.original_submission as any).winner_id, "t4");

    // Frozen: confirmation must fail while disputed
    const blocked = confirmAndAdvanceMatchResult({
      matches: [escalated.updatedMatch, finalMatch],
      matchId: "m-disp",
      managerUserId: "mgr-1",
      permissions: mgrPerms,
    });
    assert.equal(blocked.ok, false);

    // Resolve dispute with corrected score & winner -> advances cleanly
    const resolved = resolveMatchDispute({
      matches: [escalated.updatedMatch, finalMatch],
      dispute: escalated.dispute,
      managerUserId: "mgr-1",
      permissions: mgrPerms,
      correctedScoreA: 13,
      correctedScoreB: 11,
      correctedWinnerId: "t3",
      resolutionNotes: "Verified replay round 22; awarded technical round to T3",
    });
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.resolvedDispute.status, "resolved");
      assert.equal(resolved.matches[0].status, "completed");
      assert.equal(resolved.matches[1].team_b_id, "t3");
    }
  });
});
