import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeConductorMatchOperation,
  buildConnectedBracketLayout,
  calculateBattleRoyaleStandings,
  calculateCumulativeBattleRoyaleStandings,
  calculateGroupStandings,
  calculateRoundBasedOutcome,
  canRegenerateBracket,
  canTeamEnterTournament,
  confirmAndAdvanceMatchResult,
  deriveTournamentWizardState,
  escalateMatchDispute,
  findDependentDownstreamMatches,
  generateTournamentMatches,
  reassignTeamsInMatch,
  resolveMatchDispute,
  submitMatchResultDraft,
  undoMatchResultAndRewind,
  validateBattleRoyaleRows,
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

  it("Scenario 21: Odd-team brackets (5, 6, 7 teams) produce zero empty (null, null) matches and leave fixtures unscheduled when requested", () => {
    for (const count of [5, 6, 7]) {
      const cohort = Array.from({ length: count }, (_, i) => makeTeam(`${i + 1}`, `Squad ${i + 1}`));
      const built = generateTournamentMatches({
        tournamentId: `tour-${count}`,
        gameId: "g-val",
        gameTitle: "VALORANT",
        format: "single_elimination",
        teams: cohort,
        seedingMode: "registration_order",
        leaveUnscheduled: true,
      });
      assert.equal(built.ok, true);
      if (!built.ok) continue;

      const r1 = built.matches.filter((m) => m.round_number === 1);
      assert.equal(r1.length, 4);
      // Zero empty (null, null) matches allowed
      assert.equal(r1.some((m) => !m.team_a_id && !m.team_b_id), false);
      // Real matches count matches n - 4, and remaining (8 - n) are Byes
      const realMatches = r1.filter((m) => m.team_a_id && m.team_b_id);
      const byeMatches = r1.filter((m) => m.match_format === "BYE");
      assert.equal(realMatches.length, count - 4);
      assert.equal(byeMatches.length, 8 - count);
      // Unscheduled non-bye matches stay unscheduled
      assert.equal(realMatches.every((m) => !m.is_scheduled && m.scheduled_start === null && m.status === "upcoming"), true);
      assert.ok(realMatches[0].match_code.startsWith("VAL-R1-"));
    }
  });

  it("Scenario 22: Battle Royale (BGMI / Free Fire) multi-round lobbies aggregate cumulative points without H2H bracket advancement", () => {
    const squads = [makeTeam("1", "Alpha"), makeTeam("2", "Bravo"), makeTeam("3", "Charlie")];
    const brTour = generateTournamentMatches({
      tournamentId: "tour-bgmi",
      gameId: "g-bgmi",
      gameTitle: "BGMI",
      format: "battle_royale",
      teams: squads,
      seedingMode: "registration_order",
      totalRounds: 2,
      leaveUnscheduled: true,
    });
    assert.equal(brTour.ok, true);
    if (!brTour.ok) return;

    assert.equal(brTour.matches.length, 2);
    assert.equal(brTour.matches[0].bracket_side, "battle_royale");
    assert.equal(brTour.matches[0].br_results.length, 3);
    assert.equal(brTour.matches[0].match_code, "BGMI-R01-L01");

    const mgrPerms = resolveEffectivePermissions("esports_manager", "active");
    const r1Confirmed = confirmAndAdvanceMatchResult({
      matches: brTour.matches as unknown as Match[],
      matchId: brTour.matches[0].id,
      managerUserId: "mgr-1",
      permissions: mgrPerms,
      overrideBrResults: [
        { team_id: "1", team_name: "Alpha", placement: 1, kills: 6, placement_points: 15, kill_points: 6, total_points: 21 },
        { team_id: "2", team_name: "Bravo", placement: 2, kills: 10, placement_points: 12, kill_points: 10, total_points: 22 },
        { team_id: "3", team_name: "Charlie", placement: 3, kills: 2, placement_points: 10, kill_points: 2, total_points: 12 },
      ],
    });
    assert.equal(r1Confirmed.ok, true);
    if (!r1Confirmed.ok) return;
    assert.equal(r1Confirmed.advancedToMatchId, null);

    const r2Confirmed = confirmAndAdvanceMatchResult({
      matches: r1Confirmed.matches,
      matchId: brTour.matches[1].id,
      managerUserId: "mgr-1",
      permissions: mgrPerms,
      overrideBrResults: [
        { team_id: "1", team_name: "Alpha", placement: 1, kills: 8, placement_points: 15, kill_points: 8, total_points: 23 },
        { team_id: "2", team_name: "Bravo", placement: 4, kills: 2, placement_points: 8, kill_points: 2, total_points: 10 },
        { team_id: "3", team_name: "Charlie", placement: 2, kills: 5, placement_points: 12, kill_points: 5, total_points: 17 },
      ],
    });
    assert.equal(r2Confirmed.ok, true);
    if (!r2Confirmed.ok) return;

    const cum = calculateCumulativeBattleRoyaleStandings({
      teams: squads,
      matches: r2Confirmed.matches,
    });
    // Alpha: 21 + 23 = 44; Bravo: 22 + 10 = 32; Charlie: 12 + 17 = 29
    assert.equal(cum[0].teamId, "1");
    assert.equal(cum[0].totalPoints, 44);
    assert.equal(cum[0].wins, 2);
    assert.equal(cum[1].teamId, "2");
    assert.equal(cum[1].totalPoints, 32);
  });

  it("Scenario 23: Undo/Rewind clears propagated slots downstream, blocks unconfirmed cascade when downstream is live/completed, and supports pre-play remap", () => {
    const mgrPerms = resolveEffectivePermissions("esports_manager", "active");
    const semi: Match = {
      id: "semi-a",
      game_id: "g-1",
      match_code: "VAL-R1-M01",
      round: "Semifinal 1",
      team_a_id: "t1",
      team_b_id: "t2",
      scheduled_start: null,
      score_a: 2,
      score_b: 0,
      status: "completed",
      result_status: "confirmed",
      winner_id: "t1",
      next_match_id: "gf-1",
      next_match_slot: "a",
      bracket_advanced_at: "2026-11-20T06:00:00Z",
      is_published: true,
      created_at: "",
      updated_at: "",
    };
    const finalCompleted: Match = {
      id: "gf-1",
      game_id: "g-1",
      match_code: "VAL-R2-M01",
      round: "Grand Final",
      team_a_id: "t1",
      team_b_id: "t3",
      scheduled_start: null,
      score_a: 1,
      score_b: 2,
      status: "completed",
      winner_id: "t3",
      is_published: true,
      created_at: "",
      updated_at: "",
    };

    const deps = findDependentDownstreamMatches([semi, finalCompleted], "semi-a");
    assert.equal(deps.startedDownstream.length, 1);

    // Without forceCascade -> blocked safely
    const blocked = undoMatchResultAndRewind({
      matches: [semi, finalCompleted],
      matchId: "semi-a",
      managerUserId: "mgr-1",
      permissions: mgrPerms,
      reason: "Wrong winner clicked during confirmation",
      forceCascade: false,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.requiresCascade, true);
    }

    // With forceCascade -> clears semi AND resets final cleanly
    const rewound = undoMatchResultAndRewind({
      matches: [semi, finalCompleted],
      matchId: "semi-a",
      managerUserId: "mgr-1",
      permissions: mgrPerms,
      reason: "Wrong winner clicked during confirmation",
      forceCascade: true,
    });
    assert.equal(rewound.ok, true);
    if (!rewound.ok) return;
    assert.equal(rewound.matches[0].status, "upcoming");
    assert.equal(rewound.matches[0].winner_id, null);
    assert.equal(rewound.matches[0].undo_count, 1);
    assert.equal(rewound.matches[1].team_a_id, null);
    assert.equal(rewound.matches[1].status, "upcoming");

    // Remap teams on rewound match
    const remapped = reassignTeamsInMatch({
      matches: rewound.matches,
      matchId: "semi-a",
      teamAId: "t2",
      teamBId: "t1",
    });
    assert.equal(remapped.ok, true);
    if (remapped.ok) {
      assert.equal(remapped.matches[0].team_a_id, "t2");
      assert.equal(remapped.matches[0].team_b_id, "t1");
    }
  });

  it("Scenario 24: Free Fire Battle Royale automatic multi-lobby allocation, IST schedule separation, FF scoring & cumulative champion ranking", () => {
    const ffTeams = Array.from({ length: 24 }, (_, idx) =>
      makeTeam(`ff-${idx + 1}`, `FF Squad ${idx + 1}`, {
        submitted_at: `2026-11-01T10:${String(idx).padStart(2, "0")}:00Z`,
      })
    );

    const ffPlacementTable: Record<number, number> = {
      1: 12,
      2: 9,
      3: 8,
      4: 7,
      5: 6,
      6: 5,
      7: 4,
      8: 3,
      9: 2,
      10: 1,
      11: 0,
      12: 0,
    };

    const built = generateTournamentMatches({
      tournamentId: "tour-ff-br",
      gameId: "g-ff",
      gameTitle: "FREE FIRE",
      format: "battle_royale",
      teams: ffTeams,
      seedingMode: "registration_order",
      totalRounds: 3,
      teamsPerLobby: 12,
      leaveUnscheduled: true,
    });

    assert.equal(built.ok, true);
    if (!built.ok) return;

    // 24 teams ÷ 12 per lobby = 2 lobbies/round × 3 rounds = 6 unique BR matches
    assert.equal(built.teamCount, 24);
    assert.equal(built.matches.length, 6);
    assert.deepEqual(
      built.matches.map((m) => m.match_code),
      ["FF-R01-L01", "FF-R01-L02", "FF-R02-L01", "FF-R02-L02", "FF-R03-L01", "FF-R03-L02"]
    );
    assert.equal(built.matches[0].group_name, "Lobby 1");
    assert.equal(built.matches[1].group_name, "Lobby 2");
    assert.equal(built.matches[0].br_results.length, 12);
    assert.equal(built.matches[1].br_results.length, 12);
    assert.equal(built.matches.every((m) => m.next_match_id === null && !m.is_scheduled), true);

    // Every round assigns all 24 unique teams with zero overlap across lobbies in the same round
    for (let r = 1; r <= 3; r++) {
      const roundLobbies = built.matches.filter((m) => m.round_number === r);
      const assignedIds = new Set(roundLobbies.flatMap((m) => m.br_results.map((row) => row.team_id)));
      assert.equal(assignedIds.size, 24);
    }

    // Score and confirm all 6 lobbies using Free Fire placement table + 1 pt/kill
    const mgrPerms = resolveEffectivePermissions("esports_manager", "active");
    let currentMatches = built.matches as unknown as Match[];

    for (const m of built.matches) {
      const hasFf1 = m.br_results.some((r) => r.team_id === "ff-1");
      const hasFf2 = m.br_results.some((r) => r.team_id === "ff-2");
      let nextRank = 1;
      const scoredRows = m.br_results.map((row, idx) => {
        let placement: number;
        let kills = idx % 2;
        if (row.team_id === "ff-1") {
          placement = 1;
          kills = 8;
        } else if (row.team_id === "ff-2") {
          placement = 2;
          kills = 5;
        } else {
          if (hasFf1 && nextRank === 1) nextRank += 1;
          if (hasFf2 && nextRank === 2) nextRank += 1;
          placement = nextRank++;
        }
        const pp = ffPlacementTable[placement] ?? 0;
        const kp = kills * 1;
        return {
          ...row,
          placement,
          kills,
          placement_points: pp,
          kill_points: kp,
          total_points: pp + kp,
        };
      });

      const confirmed = confirmAndAdvanceMatchResult({
        matches: currentMatches,
        matchId: m.id,
        managerUserId: "mgr-1",
        permissions: mgrPerms,
        overrideBrResults: scoredRows,
      });
      assert.equal(confirmed.ok, true);
      if (!confirmed.ok) return;
      assert.equal(confirmed.advancedToMatchId, null);
      currentMatches = confirmed.matches;
    }

    const cumulative = calculateCumulativeBattleRoyaleStandings({
      teams: ffTeams,
      matches: currentMatches,
      placementPointsTable: ffPlacementTable,
      pointsPerKill: 1,
    });

    // ff-1 played 3 rounds with #1 (12 pts) + 8 kills = 20 pts/round => 60 pts total, 3 Booyah wins
    assert.equal(cumulative[0].teamId, "ff-1");
    assert.equal(cumulative[0].rank, 1);
    assert.equal(cumulative[0].roundsPlayed, 3);
    assert.equal(cumulative[0].wins, 3);
    assert.equal(cumulative[0].totalPoints, 60);

    // ff-2 played 3 rounds with #2 (9 pts) + 5 kills = 14 pts/round => 42 pts total
    assert.equal(cumulative[1].teamId, "ff-2");
    assert.equal(cumulative[1].totalPoints, 42);
  });

  it("Scenario 25: Full 8-team Double Elimination bracket links Winners, Multi-Round Losers & Grand Final cleanly", () => {
    const squads8 = Array.from({ length: 8 }, (_, idx) => makeTeam(`de-${idx + 1}`, `Team ${idx + 1}`));
    const built = generateTournamentMatches({
      tournamentId: "tour-de-8",
      gameId: "g-val",
      gameTitle: "VALORANT",
      format: "double_elimination",
      teams: squads8,
      seedingMode: "registration_order",
      leaveUnscheduled: true,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const winners = built.matches.filter((m) => m.bracket_side === "winners");
    const losers = built.matches.filter((m) => m.bracket_side === "losers");
    const gf = built.matches.filter((m) => m.bracket_side === "grand_final");

    // 8 teams => W1(4) + W2(2) + W3(1) = 7 winners; LR1(2)+LR2(2)+LR3(1)+LR4(1) = 6 losers; 1 Grand Final = 14 total
    assert.equal(winners.length, 7);
    assert.equal(losers.length, 6);
    assert.equal(gf.length, 1);

    // Winners Round 1 feeds into Winners R2 and drops losers into LR1
    const wr1 = winners.filter((m) => m.round_number === 1);
    assert.equal(wr1.every((m) => Boolean(m.next_match_id) && Boolean(m.loser_next_match_id)), true);
    // Losers Final feeds into Grand Final slot 'b'
    const losersFinal = losers.find((m) => m.round === "Losers Final");
    assert.ok(losersFinal);
    assert.equal(losersFinal?.next_match_id, gf[0].id);
    assert.equal(losersFinal?.next_match_slot, "b");

    // Connected bracket layout computes separate Winners + Losers tracks with awaiting labels
    const teamNameById = new Map(squads8.map((t) => [t.id, t.team_name]));
    const layout = buildConnectedBracketLayout({
      matches: built.matches as unknown as Match[],
      teamNameById,
      format: "double_elimination",
    });
    assert.equal(layout.hasConnectedBracket, true);
    assert.equal(layout.tracks.length, 2);
    assert.equal(layout.tracks[0].id, "winners");
    assert.equal(layout.tracks[1].id, "losers");
    assert.ok(layout.tracks[0].championCard);
    assert.ok(layout.tracks[0].edges.length >= 6);
    assert.ok(layout.tracks[1].edges.length >= 4);
    const lr1Card = layout.tracks[1].columns[0].cards[0];
    assert.ok(lr1Card.teamALabel.startsWith("Loser of VAL-WR1-M"));
  });

  it("Scenario 26: 6-step Tournament Setup Wizard derives accurate step progress & next CTA", () => {
    const baseTournament = makeTournament({ has_started: false, status: "draft" });
    const s1 = deriveTournamentWizardState({
      tournament: baseTournament,
      hasPersistedTournament: false,
      selectedTeamCount: 1,
      approvedTeamCount: 4,
      matches: [],
    });
    assert.equal(s1.currentStepNumber, 1);
    assert.equal(s1.currentStepId, "select_teams");

    const s2 = deriveTournamentWizardState({
      tournament: baseTournament,
      hasPersistedTournament: false,
      selectedTeamCount: 4,
      approvedTeamCount: 4,
      matches: [],
    });
    assert.equal(s2.currentStepNumber, 2);
    assert.equal(s2.currentStepId, "choose_format");

    const s4 = deriveTournamentWizardState({
      tournament: makeTournament({ status: "open", has_started: false }),
      hasPersistedTournament: true,
      selectedTeamCount: 4,
      approvedTeamCount: 4,
      matches: [],
    });
    assert.equal(s4.currentStepNumber, 4);
    assert.equal(s4.currentStepId, "generate_matches");

    const s5 = deriveTournamentWizardState({
      tournament: makeTournament({ status: "open", has_started: false }),
      hasPersistedTournament: true,
      selectedTeamCount: 4,
      approvedTeamCount: 4,
      matches: [{ status: "upcoming", match_format: "BO1", is_published: false }],
    });
    assert.equal(s5.currentStepNumber, 5);
    assert.equal(s5.currentStepId, "publish_tournament");

    const s6 = deriveTournamentWizardState({
      tournament: makeTournament({ status: "published", has_started: false }),
      hasPersistedTournament: true,
      selectedTeamCount: 4,
      approvedTeamCount: 4,
      matches: [{ status: "scheduled", match_format: "BO1", is_published: true }],
    });
    assert.equal(s6.currentStepNumber, 6);
    assert.equal(s6.currentStepId, "start_tournament");

    const done = deriveTournamentWizardState({
      tournament: makeTournament({ status: "in_progress", has_started: true }),
      hasPersistedTournament: true,
      selectedTeamCount: 4,
      approvedTeamCount: 4,
      matches: [{ status: "live", match_format: "BO1", is_published: true }],
    });
    assert.equal(done.allCompleted, true);
  });

  it("Scenario 27: BR Validation flags duplicate/missing placements & H2H allows League Draw + Forfeit", () => {
    const brCheck = validateBattleRoyaleRows([
      { team_id: "a", team_name: "Alpha", placement: 1, kills: 5, placement_points: 15, kill_points: 5, total_points: 20 },
      { team_id: "b", team_name: "Bravo", placement: 1, kills: 2, placement_points: 15, kill_points: 2, total_points: 17 },
      { team_id: "c", team_name: "Charlie", placement: null, kills: 0, placement_points: 0, kill_points: 0, total_points: 0 },
    ]);
    assert.equal(brCheck.isValid, false);
    assert.deepEqual(brCheck.duplicatePlacements, [1]);
    assert.equal(brCheck.missingCount, 1);
    assert.equal(brCheck.duplicateTeamIds.has("a"), true);
    assert.equal(brCheck.duplicateTeamIds.has("b"), true);
    assert.equal(brCheck.missingTeamIds.has("c"), true);

    const mgrPerms = resolveEffectivePermissions("esports_manager", "active");
    const rrMatch: Match = {
      id: "rr-1",
      game_id: "g-1",
      round: "Round 1",
      team_a_id: "t1",
      team_b_id: "t2",
      scheduled_start: null,
      score_a: 1,
      score_b: 1,
      status: "live",
      winner_id: null,
      is_published: true,
      created_at: "",
      updated_at: "",
    };

    const drawConfirmed = confirmAndAdvanceMatchResult({
      matches: [rrMatch],
      matchId: "rr-1",
      managerUserId: "mgr-1",
      permissions: mgrPerms,
      overrideScoreA: 1,
      overrideScoreB: 1,
      overrideWinnerId: null,
      allowDraw: true,
    });
    assert.equal(drawConfirmed.ok, true);
    if (drawConfirmed.ok) {
      assert.equal(drawConfirmed.matches[0].status, "completed");
      assert.equal(drawConfirmed.matches[0].winner_id, null);
    }

    const forfeitConfirmed = confirmAndAdvanceMatchResult({
      matches: [{ ...rrMatch, id: "ff-forf", score_a: 0, score_b: 0 }],
      matchId: "ff-forf",
      managerUserId: "mgr-1",
      permissions: mgrPerms,
      overrideScoreA: 0,
      overrideScoreB: 1,
      forfeitTeamId: "t1",
    });
    assert.equal(forfeitConfirmed.ok, true);
    if (forfeitConfirmed.ok) {
      assert.equal(forfeitConfirmed.matches[0].winner_id, "t2");
      assert.equal((forfeitConfirmed.matches[0].detailed_scores as any)?.forfeit_team_id, "t1");
    }
  });
});
