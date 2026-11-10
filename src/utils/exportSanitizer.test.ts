import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeFormulaInjection,
  escapeCsvField,
  formatCsvRow,
  generateExportFilename,
  filterRecords,
} from "./exportSanitizer";

test("neutralizes formula injection characters", () => {
  assert.equal(sanitizeFormulaInjection("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  assert.equal(sanitizeFormulaInjection("+1234567890"), "'+1234567890");
  assert.equal(sanitizeFormulaInjection("-SUM(A1:B10)"), "'-SUM(A1:B10)");
  assert.equal(sanitizeFormulaInjection("@SUM(A1:B10)"), "'@SUM(A1:B10)");
  assert.equal(sanitizeFormulaInjection("\tDDE"), "'\tDDE");
  assert.equal(sanitizeFormulaInjection("Normal Text"), "Normal Text");
  assert.equal(sanitizeFormulaInjection(1234), "1234");
  assert.equal(sanitizeFormulaInjection(null), "");
  assert.equal(sanitizeFormulaInjection(undefined), "");
});

test("properly escapes CSV fields containing commas and quotes", () => {
  assert.equal(escapeCsvField("Bangalore, Karnataka"), '"Bangalore, Karnataka"');
  assert.equal(escapeCsvField('John "The Falcon" Doe'), '"John ""The Falcon"" Doe"');
  assert.equal(escapeCsvField("Line1\nLine2"), '"Line1\nLine2"');
  assert.equal(escapeCsvField("Simple"), "Simple");
  // Combination with formula trigger
  assert.equal(escapeCsvField("=SUM(1,2)"), '"\'=SUM(1,2)"');
});

test("formats complete CSV rows with escaping", () => {
  const row = ["REF-001", "Alice Smith", "Bangalore, India", "+919876543210"];
  const formatted = formatCsvRow(row);
  assert.equal(formatted, 'REF-001,Alice Smith,"Bangalore, India",\'+919876543210');
});

test("generates standard audit-compliant filenames", () => {
  const mockDate = new Date("2026-11-20T10:00:00Z");
  assert.equal(
    generateExportFilename("visitor", "xlsx", mockDate),
    "SUPERNOVA_3.0_Visitor_Registrations_2026-11-20.xlsx"
  );
  assert.equal(
    generateExportFilename("participation", "csv", mockDate),
    "SUPERNOVA_3.0_Participation_Registrations_2026-11-20.csv"
  );
  assert.equal(
    generateExportFilename("esports_teams", "xlsx", mockDate),
    "SUPERNOVA_3.0_Esports_Team_Registrations_2026-11-20.xlsx"
  );
  assert.equal(
    generateExportFilename("esports_complete", "xlsx", mockDate),
    "SUPERNOVA_3.0_Esports_Complete_Workbook_2026-11-20.xlsx"
  );
});

test("filters records accurately by status, date, and search text", () => {
  const records = [
    {
      id: "1",
      registration_ref: "SN3-001",
      full_name: "Rahul Sharma",
      status: "confirmed",
      submitted_at: "2026-11-01T10:00:00Z",
      institution: "National College",
      visitor_category: "Student",
    },
    {
      id: "2",
      registration_ref: "SN3-002",
      full_name: "Pooja Hegde",
      status: "pending",
      submitted_at: "2026-11-05T12:00:00Z",
      institution: "RV University",
      visitor_category: "Student",
    },
    {
      id: "3",
      registration_ref: "SN3-003",
      full_name: "Dr. K. Rao",
      status: "confirmed",
      submitted_at: "2026-11-08T09:00:00Z",
      institution: "National College",
      visitor_category: "Faculty / Staff",
    },
  ];

  // Filter by status
  const confirmed = filterRecords(records, { status: "confirmed" });
  assert.equal(confirmed.length, 2);

  // Filter by search query
  const searchResult = filterRecords(
    records,
    { searchQuery: "Pooja" },
    ["registration_ref", "full_name"]
  );
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].registration_ref, "SN3-002");

  // Filter by institution
  const nationalCollege = filterRecords(records, { institution: "national" });
  assert.equal(nationalCollege.length, 2);

  // Filter by date range
  const dateFiltered = filterRecords(records, {
    startDate: "2026-11-04",
    endDate: "2026-11-06",
  });
  assert.equal(dateFiltered.length, 1);
  assert.equal(dateFiltered[0].registration_ref, "SN3-002");
});
