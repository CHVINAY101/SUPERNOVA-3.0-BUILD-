import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMatchInsertPayload,
  CANONICAL_MATCH_STATUSES,
  formatMatchDatabaseError,
  isValidMatchStatus,
  validateCreateMatchInput,
} from "./matchOperations.ts";

describe("Esports Match Operations & Status Alignment", () => {
  it("supports all 10 canonical MatchStatus values", () => {
    for (const s of [
      "upcoming",
      "scheduled",
      "check_in",
      "ready",
      "live",
      "result_submitted",
      "completed",
      "disputed",
      "postponed",
      "cancelled",
    ]) {
      assert.equal(isValidMatchStatus(s), true, `Expected ${s} to be valid`);
    }
    assert.equal(CANONICAL_MATCH_STATUSES.length, 10);
    assert.equal(isValidMatchStatus("invalid_status"), false);
  });

  it("validates Add Match inputs and builds payloads for Valorant, Free Fire, and BGMI", () => {
    const gameId = "2757504c-2466-4515-8a7d-997e5e170139";
    const teamA = "11111111-1111-4111-8111-111111111111";
    const teamB = "22222222-2222-4222-8222-222222222222";
    const condId = "33333333-3333-4333-8333-333333333333";

    assert.equal(
      validateCreateMatchInput({
        gameId,
        roundName: "Quarterfinal 1",
        roundNumber: 1,
        matchNumber: 1,
        teamAId: teamA,
        teamBId: teamA,
        status: "scheduled",
      }).ok,
      false
    );

    const valid = validateCreateMatchInput({
      gameId,
      roundName: "Quarterfinal 1",
      roundNumber: 1,
      matchNumber: 2,
      teamAId: teamA,
      teamBId: teamB,
      scheduledStart: "2026-11-20T11:30",
      station: "Main Arena Stage",
      conductorId: condId,
      conductorEmail: "conductor@supernova.edu",
      matchFormat: "BO3",
      status: "scheduled",
      isPublished: true,
    });
    assert.equal(valid.ok, true);

    const payload = buildMatchInsertPayload({
      gameId,
      roundName: "Quarterfinal 1",
      roundNumber: 1,
      matchNumber: 2,
      teamAId: teamA,
      teamBId: teamB,
      scheduledStart: "2026-11-20T11:30",
      station: "Main Arena Stage",
      conductorId: condId,
      conductorEmail: "conductor@supernova.edu",
      matchFormat: "BO3",
      status: "scheduled",
      isPublished: true,
    });

    assert.equal(payload.game_id, gameId);
    assert.equal(payload.team_a_id, teamA);
    assert.equal(payload.team_b_id, teamB);
    assert.equal(payload.match_number, 2);
    assert.equal(payload.round_number, 1);
    assert.equal(payload.station, "Main Arena Stage");
    assert.equal(payload.conductor_id, condId);
    assert.equal(payload.conductor_email, "conductor@supernova.edu");
    assert.equal(payload.match_format, "BO3");
    assert.equal(payload.status, "scheduled");
    assert.equal(payload.is_published, true);
  });

  it("formats matches_status_check, missing column, FK, and RLS errors clearly", () => {
    const checkErr = formatMatchDatabaseError(
      {
        code: "23514",
        message: 'new row for relation "matches" violates check constraint "matches_status_check"',
      },
      "scheduled"
    );
    assert.match(checkErr, /matches_status_check/);
    assert.match(checkErr, /20261120000000/);

    const colErr = formatMatchDatabaseError({
      code: "PGRST204",
      message: "Could not find the 'match_number' column of 'matches' in the schema cache",
    });
    assert.match(colErr, /Missing database column \(match_number\)/);

    const fkErr = formatMatchDatabaseError({
      code: "23503",
      message: 'insert or update on table "matches" violates foreign key constraint "matches_team_a_id_fkey"',
    });
    assert.match(fkErr, /Invalid team, game, tournament, or conductor reference/);

    const rlsErr = formatMatchDatabaseError({
      code: "42501",
      message: 'new row violates row-level security policy for table "matches"',
    });
    assert.match(rlsErr, /Permission denied/);
  });

  it("supports unscheduled H2H fixtures and Battle Royale multi-squad lobby payloads", () => {
    const gameId = "2757504c-2466-4515-8a7d-997e5e170139";
    const teamA = "11111111-1111-4111-8111-111111111111";
    const teamB = "22222222-2222-4222-8222-222222222222";

    const unschedPayload = buildMatchInsertPayload({
      gameId,
      matchCode: "VAL-R1-M01",
      roundName: "Quarterfinal 1",
      teamAId: teamA,
      teamBId: teamB,
      scheduledStart: null,
      isScheduled: false,
      status: "upcoming",
    });
    assert.equal(unschedPayload.scheduled_start, null);
    assert.equal(unschedPayload.scheduled_end, null);
    assert.equal(unschedPayload.is_scheduled, false);
    assert.equal(unschedPayload.match_code, "VAL-R1-M01");

    const brValid = validateCreateMatchInput({
      gameId,
      roundName: "Match 1 (Lobby Points)",
      bracketSide: "battle_royale",
      matchFormat: "BR Lobby",
      brResults: [
        { team_id: teamA, team_name: "Squad 1", placement: null, kills: 0, placement_points: 0, kill_points: 0, total_points: 0 },
        { team_id: teamB, team_name: "Squad 2", placement: null, kills: 0, placement_points: 0, kill_points: 0, total_points: 0 },
      ],
      status: "upcoming",
    });
    assert.equal(brValid.ok, true);

    const brPayload = buildMatchInsertPayload({
      gameId,
      matchCode: "BGMI-BR-R01",
      roundName: "Match 1 (Lobby Points)",
      bracketSide: "battle_royale",
      matchFormat: "BR Lobby",
      brResults: [
        { team_id: teamA, team_name: "Squad 1", placement: null, kills: 0, placement_points: 0, kill_points: 0, total_points: 0 },
        { team_id: teamB, team_name: "Squad 2", placement: null, kills: 0, placement_points: 0, kill_points: 0, total_points: 0 },
      ],
      status: "upcoming",
    });
    assert.equal(brPayload.bracket_side, "battle_royale");
    assert.equal(brPayload.team_a_id, null);
    assert.equal(brPayload.team_b_id, null);
    assert.equal(brPayload.br_results.length, 2);
  });
});
