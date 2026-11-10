import test from "node:test";
import assert from "node:assert/strict";
import { 
  FESTIVAL_CONFIG, 
  getPrimaryButtonLabel, 
  getPrimaryButtonSubtext, 
  getPrimaryButtonHref, 
  calculateCountdown,
  splitWords
} from "../config/festival.ts";

test("REGISTRATIONS_OPEN=true returns 'Register Now' and goes to '/register'", () => {
  assert.equal(FESTIVAL_CONFIG.REGISTRATIONS_OPEN, true);
  assert.equal(getPrimaryButtonLabel(), "Register Now");
  assert.equal(getPrimaryButtonSubtext(), null);
  assert.equal(getPrimaryButtonHref(), "/register");
});

test("calculateCountdown computes exact days, hours, minutes, seconds", () => {
  // Target: 2026-11-20T00:00:00+05:30
  const now = new Date("2026-11-19T00:00:00+05:30").getTime();
  const res = calculateCountdown("2026-11-20T00:00:00+05:30", now);
  assert.equal(res.days, 1);
  assert.equal(res.hours, 0);
  assert.equal(res.minutes, 0);
  assert.equal(res.seconds, 0);
  assert.equal(res.isComplete, false);
});

test("calculateCountdown handles past dates smoothly", () => {
  const now = new Date("2026-11-21T00:00:00+05:30").getTime();
  const res = calculateCountdown("2026-11-20T00:00:00+05:30", now);
  assert.equal(res.days, 0);
  assert.equal(res.hours, 0);
  assert.equal(res.minutes, 0);
  assert.equal(res.seconds, 0);
  assert.equal(res.isComplete, true);
});

test("splitWords splits text without empty tokens", () => {
  const words = splitWords("  DREAM • CREATE • COMPETE  ");
  assert.deepEqual(words, ["DREAM", "•", "CREATE", "•", "COMPETE"]);
});
