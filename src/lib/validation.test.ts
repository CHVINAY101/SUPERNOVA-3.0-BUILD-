import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isValidClassCourse,
  isValidEmail,
  isValidInstitution,
  isValidName,
  isValidPhone,
  normalizeContactPhone,
} from "./validation.ts";

describe("Visitor Registration Validation & Contact Mobile Number Rules", () => {
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

  it("accepts 10–15 digit mobile numbers including country codes, formatting, and parent/guardian numbers", () => {
    assert.equal(isValidPhone("9876543210"), true);
    assert.equal(isValidPhone("+91 98765 43210"), true);
    assert.equal(isValidPhone("+1 (415) 555-0199"), true);
    assert.equal(isValidPhone("919876543210123"), true); // 15 digits max
    assert.equal(normalizeContactPhone("+91 98765-43210"), "919876543210");
    assert.equal(normalizeContactPhone("+44 (20) 7946.0921"), "442079460921");
  });

  it("rejects missing, short (<10 digits), long (>15 digits), or non-numeric contact numbers", () => {
    assert.equal(isValidPhone(""), false);
    assert.equal(isValidPhone("   "), false);
    assert.equal(isValidPhone("123456789"), false); // 9 digits
    assert.equal(isValidPhone("1234567890123456"), false); // 16 digits
    assert.equal(isValidPhone("98765abcde"), false);
  });
});
