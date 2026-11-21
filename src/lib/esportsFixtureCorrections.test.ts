import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRenameEsportsTeamParams,
  buildReplaceEsportsFixtureTeamParams,
  buildSetDisqualificationParams,
  buildSupervisedCorrectionAnalysis,
  buildSwapEsportsFixtureSlotsParams,
  canPerformFixtureCorrection,
  canPerformTeamRenameOrDisqualify,
  filterTeamsForGameSearch,
  findTeamAffectedMatches,
  hydrateBrResultsWithLiveTeamNames,
  isConductorOnlyRole,
  isHistoricalFixture,
  normalizeRpcErrorMessage,
  resolveLiveTeamName,
  runTournamentIntegrityAudit,
} from "./esportsFixtureCorrections.ts";
import { resolveEffectivePermissions } from "./rbac.ts";
import type { Game, Match, Registration, Tournament } from "../types/database.ts";

const makeTeam = (overrides: Partial<Registration> & { id: string; team_name: string }): Registration => ({
  registration_ref: `SN-ESP-${overrides.id.slice(0, 4).toUpperCase()}`,
  game_id: "game-val",
  captain_name: "Captain",
  email: "cap@example.com",
  phone: "9999999999",
  institution: "National College",
  status: "confirmed",
  selection_status: "selected",
  selection_reason: null,
  admin_notes: null,
  submitted_at: "2026-11-10T10:00:00Z",
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
  ...overrides,
});

const makeMatch = (overrides: Partial<Match> & { id: string }): Match => ({
  game_id: "game-val",
  round: "Round 1",
  round_number: 1,
  match_number: 1,
  match_code: "M1",
  bracket_side: "knockout",
  team_a_id: null,
  team_b_id: null,
  score_a: 0,
  score_b: 0,
  winner_id: null,
  status: "upcoming",
  is_published: true,
  is_scheduled: false,
  scheduled_start: null,
  scheduled_end: null,
  station: "Main Arena",
  match_format: "BO1",
  notes: null,
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
  ...overrides,
});

describe("Esports Fixture Corrections, RBAC, Supervised Preview & Integrity Audit", () => {
  it("Permits Super Admin, CRM Admin (and event_admin), and Esports Manager (and score_operator), while blocking Match Conductor", () => {
    const superPerms = resolveEffectivePermissions("super_admin", "active");
    const crmAdminPerms = resolveEffectivePermissions("crm_admin", "active");
    const eventAdminPerms = resolveEffectivePermissions("event_admin", "active");
    const esportsMgrPerms = resolveEffectivePermissions("esports_manager", "active");
    const scoreOpPerms = resolveEffectivePermissions("score_operator", "active");
    const conductorPerms = resolveEffectivePermissions("match_conductor", "active");
    const inactiveMgrPerms = resolveEffectivePermissions("esports_manager", "deactivated");

    assert.equal(canPerformFixtureCorrection(superPerms), true);
    assert.equal(canPerformFixtureCorrection(crmAdminPerms), true);
    assert.equal(canPerformFixtureCorrection(eventAdminPerms), true);
    assert.equal(canPerformFixtureCorrection(esportsMgrPerms), true);
    assert.equal(canPerformFixtureCorrection(scoreOpPerms), true);
    assert.equal(canPerformTeamRenameOrDisqualify(esportsMgrPerms), true);

    assert.equal(canPerformFixtureCorrection(conductorPerms), false);
    assert.equal(canPerformTeamRenameOrDisqualify(conductorPerms), false);
    assert.equal(isConductorOnlyRole(conductorPerms), true);
    assert.equal(canPerformFixtureCorrection(inactiveMgrPerms, "deactivated"), false);
  });

  it("Builds exact Supabase production RPC parameter objects with reason & optimistic lock validation", () => {
    const renameBad = buildRenameEsportsTeamParams({
      registrationId: "reg-1",
      expectedName: "Alpha",
      newName: "Alpha",
      reason: "typo",
    });
    assert.equal(renameBad.ok, false);

    const renameOk = buildRenameEsportsTeamParams({
      registrationId: "reg-1",
      expectedName: "Alpha",
      newName: "Alpha Prime",
      reason: "Captain requested roster tag fix",
    });
    assert.equal(renameOk.ok, true);
    if (renameOk.ok) {
      assert.deepEqual(renameOk.params, {
        p_registration_id: "reg-1",
        p_expected_name: "Alpha",
        p_new_name: "Alpha Prime",
        p_reason: "Captain requested roster tag fix",
      });
    }

    const replaceOk = buildReplaceEsportsFixtureTeamParams({
      matchId: "m-1",
      slot: "b",
      expectedTeamId: "reg-2",
      replacementTeamId: "reg-3",
      otherSlotTeamId: "reg-1",
      reason: "Team B no-show replaced with standby squad",
    });
    assert.equal(replaceOk.ok, true);
    if (replaceOk.ok) {
      assert.deepEqual(replaceOk.params, {
        p_match_id: "m-1",
        p_slot: "b",
        p_expected_team_id: "reg-2",
        p_replacement_team_id: "reg-3",
        p_reason: "Team B no-show replaced with standby squad",
      });
    }

    const swapOk = buildSwapEsportsFixtureSlotsParams({
      match1Id: "m-1",
      slot1: "a",
      expectedTeam1Id: "reg-1",
      match2Id: "m-2",
      slot2: "b",
      expectedTeam2Id: "reg-4",
      reason: "Correcting bracket seed crossover",
    });
    assert.equal(swapOk.ok, true);
    if (swapOk.ok) {
      assert.deepEqual(swapOk.params, {
        p_match_1: "m-1",
        p_slot_1: "a",
        p_expected_team_1: "reg-1",
        p_match_2: "m-2",
        p_slot_2: "b",
        p_expected_team_2: "reg-4",
        p_reason: "Correcting bracket seed crossover",
      });
    }

    const dqOk = buildSetDisqualificationParams({
      registrationId: "reg-2",
      currentSelectionStatus: "selected",
      disqualified: true,
      reason: "Roster mismatch during stage check",
    });
    assert.equal(dqOk.ok, true);
    if (dqOk.ok) {
      assert.deepEqual(dqOk.params, {
        p_registration_id: "reg-2",
        p_expected_selection_status: "selected",
        p_disqualified: true,
        p_reason: "Roster mismatch during stage check",
        p_restore_status: null,
      });
    }

    const reinstateOk = buildSetDisqualificationParams({
      registrationId: "reg-2",
      currentSelectionStatus: "disqualified",
      disqualified: false,
      reason: "Appeal upheld after ID check",
      restoreStatus: "selected",
    });
    assert.equal(reinstateOk.ok, true);
    if (reinstateOk.ok) {
      assert.deepEqual(reinstateOk.params, {
        p_registration_id: "reg-2",
        p_expected_selection_status: "disqualified",
        p_disqualified: false,
        p_reason: "Appeal upheld after ID check",
        p_restore_status: "selected",
      });
    }
  });

  it("Flags backend historical lock rejections honestly without suggesting direct client bypass", () => {
    const norm = normalizeRpcErrorMessage(
      "replace_esports_fixture_team",
      { message: "Cannot modify completed match after downstream progression." },
      null
    );
    assert.equal(norm.rejectedByHistoricalLock, true);
    assert.equal(norm.requiresManualReviewSql, true);
  });

  it("Filters teams strictly for the selected game by name, registration_ref, captain, or institution", () => {
    const teams: Registration[] = [
      makeTeam({ id: "t1", game_id: "game-val", team_name: "Phoenix Five", registration_ref: "SN-ESP-101" }),
      makeTeam({ id: "t2", game_id: "game-val", team_name: "Apex Wolves", registration_ref: "SN-ESP-102", selection_status: "disqualified" }),
      makeTeam({ id: "t3", game_id: "game-bgmi", team_name: "Phoenix BGMI", registration_ref: "SN-ESP-201" }),
      makeTeam({ id: "t4", game_id: "game-val", team_name: "Metro Guardians", institution: "St. Josephs", selection_status: "awaiting_selection" }),
    ];

    const valMatches = filterTeamsForGameSearch(teams, "game-val", "phoenix", {
      excludeDisqualified: true,
    });
    assert.equal(valMatches.length, 1);
    assert.equal(valMatches[0].id, "t1");

    const byInst = filterTeamsForGameSearch(teams, "game-val", "josephs");
    assert.equal(byInst.length, 1);
    assert.equal(byInst[0].id, "t4");
  });

  it("Propagates team renames dynamically into Battle Royale rows via team_id", () => {
    const renamed = makeTeam({ id: "t-br-1", game_id: "game-bgmi", team_name: "Renamed Titans" });
    const teamMap = new Map([[renamed.id, renamed]]);

    assert.equal(resolveLiveTeamName("t-br-1", "Old Titans", teamMap), "Renamed Titans");
    const hydrated = hydrateBrResultsWithLiveTeamNames(
      [
        {
          team_id: "t-br-1",
          team_name: "Old Titans",
          placement: 1,
          kills: 8,
          placement_points: 15,
          kill_points: 8,
          total_points: 23,
        },
      ],
      teamMap
    );
    assert.equal(hydrated[0].team_name, "Renamed Titans");
  });

  it("Detects historical fixtures and builds supervised downstream impact without silent score/winner transfer", () => {
    const tA = makeTeam({ id: "tA", team_name: "Team Alpha" });
    const tB = makeTeam({ id: "tB", team_name: "Team Bravo" });
    const tC = makeTeam({ id: "tC", team_name: "Team Charlie" });
    const tSub = makeTeam({ id: "tSub", team_name: "Team Delta Sub" });
    const teamMap = new Map([
      [tA.id, tA],
      [tB.id, tB],
      [tC.id, tC],
      [tSub.id, tSub],
    ]);

    const sf1 = makeMatch({
      id: "m-sf1",
      match_code: "SF1",
      round: "Semi-finals",
      round_number: 1,
      match_number: 1,
      team_a_id: "tA",
      team_b_id: "tB",
      score_a: 13,
      score_b: 9,
      winner_id: "tA",
      status: "completed",
      next_match_id: "m-gf",
      next_match_slot: "a",
    });

    const gf = makeMatch({
      id: "m-gf",
      match_code: "GF",
      round: "Grand Final",
      round_number: 2,
      match_number: 1,
      bracket_side: "grand_final",
      team_a_id: "tA",
      team_b_id: "tC",
      score_a: 2,
      score_b: 1,
      winner_id: "tA",
      status: "completed",
    });

    assert.equal(isHistoricalFixture(sf1, [sf1, gf]), true);

    const analysis = buildSupervisedCorrectionAnalysis({
      targetMatch: sf1,
      allGameMatches: [sf1, gf],
      teamMap,
      proposedTeamAId: "tA",
      proposedTeamBId: "tSub",
      serverPreview: { affected_count: 2, summary: "SF1 and GF will be impacted." },
    });

    assert.equal(analysis.requiresSupervision, true);
    assert.equal(analysis.silentWinnerTransferBlocked, true);
    assert.equal(analysis.existingAssignment.teamBName, "Team Bravo");
    assert.equal(analysis.proposedAssignment.teamBName, "Team Delta Sub");
    assert.equal(analysis.downstreamImpacts.length, 1);
    assert.equal(analysis.downstreamImpacts[0].matchCode, "GF");
    assert.equal(analysis.matchesRequiringReconfirmation.length, 2);
    assert.equal(analysis.serverPreviewSummary, "SF1 and GF will be impacted.");
  });

  it("Finds upcoming vs historical affected fixtures when a team is disqualified", () => {
    const dqUpcoming = makeMatch({ id: "m-up", team_a_id: "dq-1", team_b_id: "t2", status: "scheduled" });
    const dqDone = makeMatch({ id: "m-done", team_a_id: "dq-1", team_b_id: "t3", status: "completed", winner_id: "dq-1" });
    const dqBr = makeMatch({
      id: "m-br",
      bracket_side: "battle_royale",
      status: "upcoming",
      br_results: [
        { team_id: "dq-1", team_name: "DQ Squad", placement: null, kills: 0, placement_points: 0, kill_points: 0, total_points: 0 },
      ],
    });

    const summary = findTeamAffectedMatches([dqUpcoming, dqDone, dqBr], "dq-1");
    assert.equal(summary.upcomingMatches.length, 2);
    assert.equal(summary.historicalMatches.length, 1);
  });

  it("Audits tournament integrity and detects has_started drift, disqualified team presence, and progression gaps", () => {
    const game: Game = {
      id: "game-val",
      title: "VALORANT",
      description: null,
      rules: null,
      team_size: 5,
      match_format: "single_elimination",
      scoring_mode: "round_based",
      is_active: true,
      is_published: true,
      sort_order: 1,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    };
    const tournament: Tournament = {
      id: "tourn-1",
      game_id: "game-val",
      name: "Valorant",
      format: "single_elimination",
      scoring_mode: "round_based",
      seeding_mode: "manual",
      status: "published",
      has_started: false,
      total_rounds: 2,
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    };

    const dqTeam = makeTeam({ id: "t-dq", team_name: "Banned Five", selection_status: "disqualified" });
    const okTeam = makeTeam({ id: "t-ok", team_name: "Clean Five", selection_status: "selected" });

    const m1 = makeMatch({
      id: "m1",
      match_code: "R1-M1",
      team_a_id: "t-ok",
      team_b_id: "t-dq",
      status: "live",
      is_published: true,
      conductor_id: null,
    });

    const cancelledEmpty = makeMatch({
      id: "m-cancelled-4",
      match_code: "VAL-R2-M04",
      team_a_id: null,
      team_b_id: null,
      status: "cancelled",
      is_published: false,
      conductor_id: null,
    });

    const audit = runTournamentIntegrityAudit({
      game,
      tournament,
      matches: [m1, cancelledEmpty],
      teams: [dqTeam, okTeam],
    });

    assert.equal(audit.hasStartedDrift, true);
    assert.ok(audit.findings.some((f) => f.category === "tournament_sync"));
    assert.ok(audit.findings.some((f) => f.category === "disqualification_impact"));
    assert.ok(audit.findings.some((f) => f.category === "schedule_conductor"));
    assert.equal(
      audit.findings.some((f) => (f.matchCodes || []).includes("VAL-R2-M04")),
      false
    );
    assert.ok(audit.criticalCount >= 2);
  });
});
