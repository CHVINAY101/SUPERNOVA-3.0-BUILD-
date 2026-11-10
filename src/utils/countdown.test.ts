import test from "node:test";
import assert from "node:assert/strict";
import { calculateTimeRemaining, computeCountdown } from "../hooks/useCountdown.ts";

test("calculateTimeRemaining returns correct days, hours, mins, secs", () => {
  const target = 1000 * 60 * 60 * 24 * 5 + 1000 * 60 * 60 * 3 + 1000 * 60 * 15 + 1000 * 45; // 5d 3h 15m 45s
  const now = 0;
  const res = calculateTimeRemaining(target, now);

  assert.equal(res.days, 5);
  assert.equal(res.hours, 3);
  assert.equal(res.mins, 15);
  assert.equal(res.secs, 45);
  assert.equal(res.isZero, false);
});

test("calculateTimeRemaining clamps past times safely to 0", () => {
  const target = 100000;
  const now = 200000;
  const res = calculateTimeRemaining(target, now);

  assert.equal(res.days, 0);
  assert.equal(res.hours, 0);
  assert.equal(res.mins, 0);
  assert.equal(res.secs, 0);
  assert.equal(res.isZero, true);
});

test("computeCountdown correctly reports BEFORE state before Nov 20, 2026", () => {
  // Test with arbitrary date before Nov 20, 2026
  const pastDateMs = new Date("2026-10-01T00:00:00Z").getTime();
  const res = computeCountdown(pastDateMs);

  assert.equal(res.state, "BEFORE");
  assert.ok(res.days > 0);
  assert.ok(res.accessibleText.includes("days"));
});
