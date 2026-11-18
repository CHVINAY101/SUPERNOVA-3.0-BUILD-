import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeGameRegistrationStats,
  getGameClosedDisplayMessage,
  simulateGameControlAction,
} from "./esportsRegistrationControls.ts";
import {
  PRE_EVENT_LIVE_EMPTY_MESSAGE,
  computePreEventLiveBoardState,
} from "./tournamentEngine.ts";
import { validateEsportsRosterWithEducation } from "../utils/esportsRules.ts";
import type { Game, Match, Registration, Tournament } from "../types/database.ts";

const makeGame = (overrides: Partial<Game> & { id: string; title: string }): Game => ({
  team_size: overrides.title === "VALORANT" ? 5 : 4,
  is_active: true,
  is_published: true,
  registration_open: true,
  max_teams: null,
  auto_close_at_capacity: true,
  registration_override_open: false,
  registration_closed_message: null,
  ...overrides,
});

describe("Phase 1 & 2 — Game-Wise Registration Controls, Education Validation & Pre-Event State", () => {
  it("Free Fire closes independently while BGMI and Valorant remain open", () => {
    const games: Game[] = [
      makeGame({
        id: "game-ff",
        title: "FREE FIRE",
        registration_open: false,
        registration_closed_message:
          "Free Fire registrations are currently closed. Teams that have already registered will not be affected.",
        max_teams: 32,
      }),
      makeGame({ id: "game-bgmi", title: "BGMI", registration_open: true, max_teams: 32 }),
      makeGame({ id: "game-val", title: "VALORANT", registration_open: true, max_teams: 16 }),
    ];

    const regs = [
      { id: "r1", game_id: "game-ff", status: "confirmed", admin_notes: null },
      { id: "r2", game_id: "game-ff", status: "pending", admin_notes: null },
      { id: "r3", game_id: "game-bgmi", status: "confirmed", admin_notes: null },
    ] as Pick<Registration, "id" | "game_id" | "status" | "admin_notes">[];

    const stats = computeGameRegistrationStats(games, regs, { is_open: true });
    const ff = stats.find((s) => s.game.id === "game-ff")!;
    const bgmi = stats.find((s) => s.game.id === "game-bgmi")!;
    const val = stats.find((s) => s.game.id === "game-val")!;

    assert.equal(ff.isEffectivelyOpen, false);
    assert.equal(ff.totalRegisteredTeams, 2);
    assert.equal(ff.approvedTeams, 1);
    assert.equal(ff.pendingTeams, 1);
    assert.equal(
      getGameClosedDisplayMessage({
        title: ff.game.title,
        is_effectively_open: ff.isEffectivelyOpen,
        status_reason: ff.statusReason,
        max_teams: ff.game.max_teams ?? null,
        registration_closed_message: ff.game.registration_closed_message ?? null,
      }),
      "Free Fire registrations are currently closed. Teams that have already registered will not be affected."
    );

    assert.equal(bgmi.isEffectivelyOpen, true);
    assert.equal(bgmi.slotsRemaining, 31);
    assert.equal(val.isEffectivelyOpen, true);
    assert.equal(val.slotsRemaining, 16);
  });

  it("Auto-closes at max capacity and allows admin capacity override reopen", () => {
    const fullGame = makeGame({ id: "g-bgmi", title: "BGMI", max_teams: 2 });
    const regs = [
      { id: "r1", game_id: "g-bgmi", status: "confirmed", admin_notes: null },
      { id: "r2", game_id: "g-bgmi", status: "pending", admin_notes: null },
    ] as Pick<Registration, "id" | "game_id" | "status" | "admin_notes">[];

    const [atCap] = computeGameRegistrationStats([fullGame], regs, { is_open: true });
    assert.equal(atCap.isAtCapacity, true);
    assert.equal(atCap.slotsRemaining, 0);
    assert.equal(atCap.isEffectivelyOpen, false);
    assert.equal(atCap.statusReason, "capacity_reached");

    const overriddenGame = simulateGameControlAction(atCap, "reopen_override");
    const [afterOverride] = computeGameRegistrationStats([overriddenGame], regs, { is_open: true });
    assert.equal(afterOverride.isEffectivelyOpen, true);
    assert.equal(afterOverride.statusReason, "open_override");
  });

  it("Enforces all 4 mandatory player education fields per player during registration", () => {
    const incompletePlayers = Array.from({ length: 4 }, (_, i) => ({
      name: `Player ${i + 1}`,
      inGameId: `TAG#${100 + i}`,
      institutionType: i === 2 ? "" : "College",
      institutionName: i === 1 ? "" : "The National College, Basavanagudi",
      courseOrClass: i === 3 ? "" : "BCA",
      currentYearOrClass: i === 0 ? "" : "2nd Year",
    }));

    const failed = validateEsportsRosterWithEducation("BGMI", incompletePlayers);
    assert.equal(failed.isValid, false);
    assert.ok(failed.playerErrors[0]?.currentYearOrClass);
    assert.ok(failed.playerErrors[1]?.institutionName);
    assert.ok(failed.playerErrors[2]?.institutionType);
    assert.ok(failed.playerErrors[3]?.courseOrClass);

    const completePlayers = Array.from({ length: 4 }, (_, i) => ({
      name: `Player ${i + 1}`,
      inGameId: `TAG#${100 + i}`,
      institutionType: "College",
      institutionName: "The National College, Basavanagudi",
      courseOrClass: "BCA",
      currentYearOrClass: "2nd Year",
    }));

    const passed = validateEsportsRosterWithEducation("BGMI", completePlayers);
    assert.equal(passed.isValid, true);
    assert.deepEqual(passed.playerErrors, {});
  });

  it("EsportsLive shows strictly the pre-event empty message before tournaments start and hides 0-pt rows", () => {
    const draftTournaments: Array<
      Pick<Tournament, "game_id" | "status" | "has_started" | "champion_team_id">
    > = [
      { game_id: "g1", status: "draft", has_started: false, champion_team_id: null },
      { game_id: "g2", status: "draft", has_started: false, champion_team_id: null },
    ];
    const noMatches: Array<Pick<Match, "game_id" | "status" | "match_format" | "is_published">> = [];

    const preEvent = computePreEventLiveBoardState({
      tournaments: draftTournaments,
      matches: noMatches,
      selectedGameId: "all",
    });
    assert.equal(preEvent.showPreEventEmptyState, true);
    assert.equal(preEvent.showStandingsOrBracket, false);
    assert.equal(preEvent.emptyStateMessage, PRE_EVENT_LIVE_EMPTY_MESSAGE);

    // Once a tournament starts or live match begins, live boards unlock
    const started = computePreEventLiveBoardState({
      tournaments: [
        { game_id: "g1", status: "in_progress", has_started: true, champion_team_id: null },
      ],
      matches: [{ game_id: "g1", status: "live", match_format: "BO1", is_published: true }],
      selectedGameId: "g1",
    });
    assert.equal(started.showPreEventEmptyState, false);
    assert.equal(started.showStandingsOrBracket, true);
  });
});
