import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG, getInstagramDisplay } from "./config";
import { calculateTimeRemaining, computeCountdown } from "./hooks/useCountdown";

test("CONFIG has confirmed facts correctly set", () => {
  assert.equal(CONFIG.EVENT_NAME, "SUPERNOVA 3.0");
  assert.equal(CONFIG.REGISTRATION_OPEN, true);
  assert.equal(CONFIG.EVENT_START, "2026-11-20T00:00:00+05:30");
  assert.equal(CONFIG.INSTITUTIONS.length, 2);
  assert.equal(CONFIG.INSTITUTIONS[0].campus, "Basavanagudi campus");
  assert.equal(CONFIG.INSTITUTIONS[0].schools.length, 4);
  assert.equal(CONFIG.INSTITUTIONS[1].campus, "Jayanagar campus");
  assert.equal(CONFIG.INSTITUTIONS[1].schools.length, 3);
  assert.equal(CONFIG.HELPDESK_EMAIL, "animationthenationalcollege@gmail.com");
  assert.equal(CONFIG.ESPORTS_GAMES.length, 3);
  assert.equal(CONFIG.ESPORTS_TEAM_SIZE, null);
});

test("Empty Instagram URL renders as disabled placeholder, never invented", () => {
  const insta = getInstagramDisplay("nationalCollegeBasavanagudi");
  assert.equal(insta.url, null);
  assert.equal(insta.label, "Details coming soon");
});

test("calculateTimeRemaining computes days, hours, minutes, and seconds accurately", () => {
  // 1 day, 2 hours, 3 minutes, 4 seconds = 93784000 ms
  const target = 100000000;
  const current = target - (1 * 86400 + 2 * 3600 + 3 * 60 + 4) * 1000;
  const res = calculateTimeRemaining(target, current);

  assert.equal(res.days, 1);
  assert.equal(res.hours, 2);
  assert.equal(res.mins, 3);
  assert.equal(res.secs, 4);
  assert.equal(res.isZero, false);
});

test("calculateTimeRemaining clamps negative diff to zero", () => {
  const target = 50000;
  const current = 60000; // Past target
  const res = calculateTimeRemaining(target, current);

  assert.equal(res.days, 0);
  assert.equal(res.hours, 0);
  assert.equal(res.mins, 0);
  assert.equal(res.secs, 0);
  assert.equal(res.isZero, true);
});

test("computeCountdown returns LIVE when within event window", () => {
  // During Day 1: 2026-11-20T12:00:00+05:30
  const midEventMs = Date.parse("2026-11-20T12:00:00+05:30");
  const res = computeCountdown(midEventMs);

  assert.equal(res.state, "LIVE");
  assert.equal(res.liveDay, "DAY 1");
  assert.match(res.accessibleText, /SUPERNOVA 3\.0 IS LIVE/);
});

test("computeCountdown returns AFTER when event is over", () => {
  const afterEventMs = Date.parse("2026-11-22T08:00:00+05:30");
  const res = computeCountdown(afterEventMs);

  assert.equal(res.state, "AFTER");
  assert.match(res.accessibleText, /concluded/);
});
