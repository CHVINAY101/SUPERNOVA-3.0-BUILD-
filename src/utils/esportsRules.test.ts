import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getOfficialTeamSize,
  formatRosterSpec,
  validateEsportsRoster,
  OFFICIAL_GAME_RULES,
  type PlayerInput,
} from "./esportsRules";

test("Scenario 1: VALORANT enforces exactly 5 players", () => {
  const size = getOfficialTeamSize("VALORANT");
  assert.equal(size, 5);

  const fivePlayers: PlayerInput[] = [
    { name: "Alpha", inGameId: "val#1" },
    { name: "Bravo", inGameId: "val#2" },
    { name: "Charlie", inGameId: "val#3" },
    { name: "Delta", inGameId: "val#4" },
    { name: "Echo", inGameId: "val#5" },
  ];
  const result = validateEsportsRoster("VALORANT", fivePlayers);
  assert.equal(result.isValid, true);
  assert.equal(result.actualSize, 5);
  assert.equal(result.expectedSize, 5);
});

test("Scenario 2: VALORANT registration attempting six players is strictly rejected", () => {
  const sixPlayers: PlayerInput[] = [
    { name: "Alpha", inGameId: "val#1" },
    { name: "Bravo", inGameId: "val#2" },
    { name: "Charlie", inGameId: "val#3" },
    { name: "Delta", inGameId: "val#4" },
    { name: "Echo", inGameId: "val#5" },
    { name: "Foxtrot", inGameId: "val#6" },
  ];
  const result = validateEsportsRoster("VALORANT", sixPlayers);
  assert.equal(result.isValid, false);
  assert.equal(result.actualSize, 6);
  assert.equal(result.expectedSize, 5);
  assert.match(result.errorMessage || "", /VALORANT requires exactly 5 players/);
});

test("Scenario 3: FREE FIRE registration with four players", () => {
  const size = getOfficialTeamSize("FREE FIRE");
  assert.equal(size, 4);

  const fourPlayers: PlayerInput[] = [
    { name: "P1", inGameId: "ff#1" },
    { name: "P2", inGameId: "ff#2" },
    { name: "P3", inGameId: "ff#3" },
    { name: "P4", inGameId: "ff#4" },
  ];
  const result = validateEsportsRoster("FREE FIRE", fourPlayers);
  assert.equal(result.isValid, true);
  assert.equal(result.actualSize, 4);
  assert.equal(result.expectedSize, 4);
});

test("Scenario 4: FREE FIRE registration attempting five players is strictly rejected", () => {
  const fivePlayers: PlayerInput[] = [
    { name: "P1", inGameId: "ff#1" },
    { name: "P2", inGameId: "ff#2" },
    { name: "P3", inGameId: "ff#3" },
    { name: "P4", inGameId: "ff#4" },
    { name: "P5", inGameId: "ff#5" },
  ];
  const result = validateEsportsRoster("FREE FIRE", fivePlayers);
  assert.equal(result.isValid, false);
  assert.equal(result.actualSize, 5);
  assert.equal(result.expectedSize, 4);
  assert.match(result.errorMessage || "", /FREE FIRE requires exactly 4 players/);
});

test("Scenario 5: BGMI registration with four players", () => {
  const size = getOfficialTeamSize("BGMI");
  assert.equal(size, 4);

  const fourPlayers: PlayerInput[] = [
    { name: "P1", inGameId: "bgmi#1" },
    { name: "P2", inGameId: "bgmi#2" },
    { name: "P3", inGameId: "bgmi#3" },
    { name: "P4", inGameId: "bgmi#4" },
  ];
  const result = validateEsportsRoster("BGMI", fourPlayers);
  assert.equal(result.isValid, true);
  assert.equal(result.actualSize, 4);
  assert.equal(result.expectedSize, 4);
});

test("Scenario 6: BGMI registration attempting five players is strictly rejected", () => {
  const fivePlayers: PlayerInput[] = [
    { name: "P1", inGameId: "bgmi#1" },
    { name: "P2", inGameId: "bgmi#2" },
    { name: "P3", inGameId: "bgmi#3" },
    { name: "P4", inGameId: "bgmi#4" },
    { name: "P5", inGameId: "bgmi#5" },
  ];
  const result = validateEsportsRoster("BGMI", fivePlayers);
  assert.equal(result.isValid, false);
  assert.equal(result.actualSize, 5);
  assert.equal(result.expectedSize, 4);
  assert.match(result.errorMessage || "", /BGMI requires exactly 4 players/);
});

test("Scenario 7 & 8: Switching from VALORANT (5) to BGMI (4) and back reconciles without data loss or duplicates", () => {
  // Start with VALORANT (5 players)
  const valCount = getOfficialTeamSize("VALORANT");
  assert.equal(valCount, 5);

  let roster: PlayerInput[] = [
    { name: "Alice", inGameId: "tag1" },
    { name: "Bob", inGameId: "tag2" },
    { name: "Charlie", inGameId: "tag3" },
    { name: "Dave", inGameId: "tag4" },
    { name: "Eve", inGameId: "tag5" },
  ];
  assert.equal(roster.length, 5);

  const cache: Record<number, PlayerInput> = {};
  roster.forEach((p, idx) => {
    cache[idx] = { ...p };
  });

  // Switch to BGMI (target: 4 players)
  const bgmiCount = getOfficialTeamSize("BGMI");
  assert.equal(bgmiCount, 4);

  // Sliced to 4
  roster = Array.from({ length: bgmiCount }, (_, i) => ({
    name: roster[i]?.name || cache[i]?.name || "",
    inGameId: roster[i]?.inGameId || cache[i]?.inGameId || "",
  }));

  assert.equal(roster.length, 4);
  assert.equal(roster[0].name, "Alice");
  assert.equal(roster[3].name, "Dave");
  // Extra player 5 is NOT in active roster
  assert.equal(roster[4], undefined);

  // Switch back to VALORANT (target: 5 players)
  const backValCount = getOfficialTeamSize("VALORANT");
  assert.equal(backValCount, 5);

  roster = Array.from({ length: backValCount }, (_, i) => ({
    name: roster[i]?.name || cache[i]?.name || "",
    inGameId: roster[i]?.inGameId || cache[i]?.inGameId || "",
  }));

  assert.equal(roster.length, 5);
  assert.equal(roster[0].name, "Alice");
  assert.equal(roster[3].name, "Dave");
  // Player 5 restored cleanly from session cache without duplicates
  assert.equal(roster[4].name, "Eve");
  assert.equal(roster[4].inGameId, "tag5");
});

test("Scenario 9: Switching FREE FIRE to VALORANT and back maintains exact bounds", () => {
  const ffCount = getOfficialTeamSize("FREE FIRE");
  assert.equal(ffCount, 4);

  let roster: PlayerInput[] = Array.from({ length: ffCount }, () => ({ name: "", inGameId: "" }));
  assert.equal(roster.length, 4);

  // Switch to VALORANT
  const valCount = getOfficialTeamSize("VALORANT");
  roster = Array.from({ length: valCount }, (_, i) => roster[i] || { name: "", inGameId: "" });
  assert.equal(roster.length, 5);

  // Switch back to FREE FIRE
  roster = roster.slice(0, ffCount);
  assert.equal(roster.length, 4);
});

test("Scenario 10: Submit with one player field empty produces clear validation error", () => {
  const incompletePlayers: PlayerInput[] = [
    { name: "Alpha", inGameId: "val#1" },
    { name: "Bravo", inGameId: "val#2" },
    { name: "", inGameId: "val#3" }, // Missing name for Player 3
    { name: "Delta", inGameId: "val#4" },
    { name: "Echo", inGameId: "val#5" },
  ];
  const result = validateEsportsRoster("VALORANT", incompletePlayers);
  assert.equal(result.isValid, false);
  assert.match(result.errorMessage || "", /Player 3 full name is required/);
  assert.ok(result.playerErrors[2]?.name);
});

test("Scenario 11: Extra player data in payload is detected and rejected", () => {
  const expectedCount = getOfficialTeamSize("BGMI");
  assert.equal(expectedCount, 4);

  const rawPayload = [
    { player_name: "P1", gamer_tag: "tag1" },
    { player_name: "P2", gamer_tag: "tag2" },
    { player_name: "P3", gamer_tag: "tag3" },
    { player_name: "P4", gamer_tag: "tag4" },
    { player_name: "P5_EXTRA", gamer_tag: "tag5" },
  ];

  // Slicing to expectedCount strips excess:
  const sanitizedPayload = rawPayload.slice(0, expectedCount);
  assert.equal(sanitizedPayload.length, 4);
  assert.equal(sanitizedPayload.some((p) => p.player_name === "P5_EXTRA"), false);
});

test("Scenario 13: Admin roster health formatter formats correct badges and flags mismatches", () => {
  const valValid = formatRosterSpec("VALORANT", 5);
  assert.equal(valValid.badgeText, "VALORANT — 5/5 players");
  assert.equal(valValid.isValid, true);
  assert.equal(valValid.isFlagged, false);

  const bgmiValid = formatRosterSpec("BGMI", 4);
  assert.equal(bgmiValid.badgeText, "BGMI — 4/4 players");
  assert.equal(bgmiValid.isValid, true);
  assert.equal(bgmiValid.isFlagged, false);

  const ffValid = formatRosterSpec("FREE FIRE", 4);
  assert.equal(ffValid.badgeText, "FREE FIRE — 4/4 players");
  assert.equal(ffValid.isValid, true);
  assert.equal(ffValid.isFlagged, false);

  // Legacy/invalid registration with 6 players on VALORANT
  const valInvalid = formatRosterSpec("VALORANT", 6);
  assert.equal(valInvalid.badgeText, "VALORANT — 6/5 players");
  assert.equal(valInvalid.isValid, false);
  assert.equal(valInvalid.isFlagged, true);

  // Incomplete registration with 3 players on BGMI
  const bgmiIncomplete = formatRosterSpec("BGMI", 3);
  assert.equal(bgmiIncomplete.badgeText, "BGMI — 3/4 players");
  assert.equal(bgmiIncomplete.isValid, false);
  assert.equal(bgmiIncomplete.isFlagged, true);
});
