import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeEndIso,
  detectScheduleConflicts,
  formatIstDateTime,
  isMatchScheduled,
  istInputsToIso,
  toIstDateInput,
  toIstTimeInput,
} from "./scheduling.ts";
import type { Match } from "../types/database.ts";

describe("IST Scheduling & Conflict Detection", () => {
  it("converts Asia/Kolkata (IST) inputs to UTC ISO cleanly and formats back", () => {
    const iso = istInputsToIso("2026-11-20", "10:30");
    assert.equal(iso, "2026-11-20T05:00:00.000Z");
    assert.equal(toIstDateInput(iso), "2026-11-20");
    assert.equal(toIstTimeInput(iso), "10:30");
    assert.match(formatIstDateTime(iso), /IST/);

    const endIso = computeEndIso(iso!, 45);
    assert.equal(endIso, "2026-11-20T05:45:00.000Z");
  });

  it("blocks team time overlaps across H2H and BR matches while warning on conductor/arena overlaps", () => {
    const existing: Match[] = [
      {
        id: "m-1",
        game_id: "g-1",
        match_code: "VAL-R1-M01",
        round: "Quarterfinal 1",
        team_a_id: "t1",
        team_b_id: "t2",
        scheduled_start: "2026-11-20T05:00:00.000Z", // 10:30 IST - 11:00 IST
        scheduled_end: "2026-11-20T05:30:00.000Z",
        duration_minutes: 30,
        is_scheduled: true,
        station: "Main Arena Stage",
        conductor_id: "cond-1",
        score_a: 0,
        score_b: 0,
        status: "scheduled",
        winner_id: null,
        is_published: true,
        created_at: "",
        updated_at: "",
      },
    ];

    assert.equal(isMatchScheduled(existing[0]), true);
    assert.equal(isMatchScheduled({ ...existing[0], scheduled_start: null, is_scheduled: false }), false);

    // Same team overlapping -> hard blocking conflict
    const teamOverlap = detectScheduleConflicts(
      {
        matchId: "m-2",
        startIso: "2026-11-20T05:15:00.000Z", // 10:45 IST
        durationMinutes: 30,
        teamAId: "t1",
        teamBId: "t3",
        conductorId: "cond-2",
        station: "Stage 2",
      },
      existing
    );
    assert.equal(teamOverlap.hasBlockingConflict, true);
    assert.equal(teamOverlap.teamConflicts.length, 1);

    // Different teams, same conductor + same stage -> non-blocking warning
    const staffWarning = detectScheduleConflicts(
      {
        matchId: "m-3",
        startIso: "2026-11-20T05:15:00.000Z",
        durationMinutes: 30,
        teamAId: "t3",
        teamBId: "t4",
        conductorId: "cond-1",
        station: "Main Arena Stage",
      },
      existing
    );
    assert.equal(staffWarning.hasBlockingConflict, false);
    assert.equal(staffWarning.hasWarning, true);
    assert.equal(staffWarning.conductorConflicts.length, 1);
    assert.equal(staffWarning.stationConflicts.length, 1);

    // Next sequential slot right at 11:00 IST -> zero conflict
    const cleanNextSlot = detectScheduleConflicts(
      {
        matchId: "m-4",
        startIso: "2026-11-20T05:30:00.000Z",
        durationMinutes: 30,
        teamAId: "t1",
        teamBId: "t4",
        conductorId: "cond-1",
        station: "Main Arena Stage",
      },
      existing
    );
    assert.equal(cleanNextSlot.hasBlockingConflict, false);
    assert.equal(cleanNextSlot.hasWarning, false);
  });
});
