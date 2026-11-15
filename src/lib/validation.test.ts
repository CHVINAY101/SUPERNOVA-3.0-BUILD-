import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidClassCourse,
  isValidEmail,
  isValidInstitution,
  isValidName,
} from "./validation.ts";

describe("Simplified Visitor Registration Validation (4 Mandatory Fields)", () => {
  it("accepts valid Full Name, Email Address, Class / Course, and College / Institution Name", () => {
    assert.equal(isValidName("Aarav Sharma", 120), true);
    assert.equal(isValidEmail("aarav.sharma@college.edu"), true);
    assert.equal(isValidClassCourse("II PUC Science", 120), true);
    assert.equal(isValidInstitution("The National College, Basavanagudi", 150), true);
  });

  it("rejects empty or invalid mandatory Visitor fields", () => {
    assert.equal(isValidName(" ", 120), false);
    assert.equal(isValidName("A", 120), false);
    assert.equal(isValidEmail(""), false);
    assert.equal(isValidEmail("not-an-email"), false);
    assert.equal(isValidClassCourse("   ", 120), false);
    assert.equal(isValidInstitution("", 150), false);
    assert.equal(isValidInstitution("X", 150), false);
  });
});
