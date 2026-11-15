import test from "node:test";
import assert from "node:assert/strict";
import {
  FACULTY_DESIGNATION_OPTIONS,
  VISITOR_CATEGORY_CARDS,
  buildVisitorDisplaySubtitle,
  getDbCategoryFromId,
  normalizeVisitorCategory,
  resolveFacultyDesignationValue,
  validateVisitorFormFields,
} from "./visitorCategories";

test("defines exactly three required visitor categories with clear descriptions", () => {
  assert.equal(VISITOR_CATEGORY_CARDS.length, 3);
  assert.deepEqual(
    VISITOR_CATEGORY_CARDS.map((c) => c.title),
    ["STUDENT VISITOR", "FACULTY & INSTITUTIONAL DELEGATES", "GENERAL VISITOR"]
  );
  assert.equal(getDbCategoryFromId("student"), "Student Visitor");
  assert.equal(getDbCategoryFromId("faculty"), "Faculty & Institutional Delegates");
  assert.equal(getDbCategoryFromId("general"), "General Visitor");
});

test("exposes all seven faculty designation options including Other", () => {
  assert.deepEqual([...FACULTY_DESIGNATION_OPTIONS], [
    "Principal",
    "Head of Institution",
    "Head of Department (HOD)",
    "Lecturer",
    "Teacher",
    "Institutional Representative",
    "Other",
  ]);
  assert.equal(resolveFacultyDesignationValue("Principal", "ignored"), "Principal");
  assert.equal(resolveFacultyDesignationValue("Other", "  Dean of Research  "), "Dean of Research");
});

test("validates Student Visitor conditional mandatory fields strictly", () => {
  const emptyErrors = validateVisitorFormFields({
    categoryId: "student",
    fullName: "",
    email: "bad-email",
    studentClass: "",
    designationOption: "",
    customDesignation: "",
    institution: "",
  });
  assert.ok(emptyErrors.fullName);
  assert.ok(emptyErrors.email);
  assert.ok(emptyErrors.studentClass);
  assert.ok(emptyErrors.institution);

  const validErrors = validateVisitorFormFields({
    categoryId: "student",
    fullName: "Aarav Kulkarni",
    email: "aarav@example.edu",
    studentClass: "II PUC Science",
    designationOption: "",
    customDesignation: "",
    institution: "The National College, Basavanagudi",
  });
  assert.deepEqual(validErrors, {});
});

test("validates Faculty & Institutional Delegates designation, Other custom field, and institution", () => {
  const missingDesig = validateVisitorFormFields({
    categoryId: "faculty",
    fullName: "Prof. Meenakshi Rao",
    email: "meenakshi@college.edu",
    studentClass: "",
    designationOption: "",
    customDesignation: "",
    institution: "National Degree College",
  });
  assert.ok(missingDesig.designationOption);
  assert.equal(missingDesig.studentClass, undefined);

  const missingOther = validateVisitorFormFields({
    categoryId: "faculty",
    fullName: "Prof. Meenakshi Rao",
    email: "meenakshi@college.edu",
    studentClass: "",
    designationOption: "Other",
    customDesignation: " ",
    institution: "National Degree College",
  });
  assert.ok(missingOther.customDesignation);

  const validOther = validateVisitorFormFields({
    categoryId: "faculty",
    fullName: "Prof. Meenakshi Rao",
    email: "meenakshi@college.edu",
    studentClass: "",
    designationOption: "Other",
    customDesignation: "Academic Dean",
    institution: "National Degree College",
  });
  assert.deepEqual(validOther, {});
});

test("validates General Visitor without class/course and treats institution as optional", () => {
  const validWithoutInstitution = validateVisitorFormFields({
    categoryId: "general",
    fullName: "Ramesh Gowda",
    email: "ramesh@example.com",
    studentClass: "",
    designationOption: "",
    customDesignation: "",
    institution: "",
  });
  assert.deepEqual(validWithoutInstitution, {});

  const invalidShortInstitution = validateVisitorFormFields({
    categoryId: "general",
    fullName: "Ramesh Gowda",
    email: "ramesh@example.com",
    studentClass: "",
    designationOption: "",
    customDesignation: "",
    institution: "A",
  });
  assert.ok(invalidShortInstitution.institution);
});

test("requires selecting one of the three categories before submission", () => {
  const errors = validateVisitorFormFields({
    categoryId: null,
    fullName: "Ananya Verma",
    email: "ananya@example.com",
    studentClass: "",
    designationOption: "",
    customDesignation: "",
    institution: "",
  });
  assert.ok(errors.category);
});

test("normalizes both canonical and historical visitor categories cleanly", () => {
  assert.equal(normalizeVisitorCategory("Student Visitor"), "Student Visitor");
  assert.equal(normalizeVisitorCategory("School student"), "Student Visitor");
  assert.equal(normalizeVisitorCategory("College student"), "Student Visitor");
  assert.equal(
    normalizeVisitorCategory("Faculty & Institutional Delegates"),
    "Faculty & Institutional Delegates"
  );
  assert.equal(
    normalizeVisitorCategory("Faculty / Staff"),
    "Faculty & Institutional Delegates"
  );
  assert.equal(
    normalizeVisitorCategory("Teacher or educator"),
    "Faculty & Institutional Delegates"
  );
  assert.equal(normalizeVisitorCategory("General Visitor"), "General Visitor");
  assert.equal(normalizeVisitorCategory("General visitor"), "General Visitor");
  assert.equal(normalizeVisitorCategory("Walk-in Visitor", "B.Sc CS", null), "Student Visitor");
  assert.equal(normalizeVisitorCategory("Walk-in Visitor", null, null), "General Visitor");
});

test("builds accurate visitor display subtitles for passes and CRM", () => {
  assert.equal(
    buildVisitorDisplaySubtitle({
      visitorCategory: "Student Visitor",
      studentClass: "B.Sc. Computer Science",
    }),
    "Student Visitor · B.Sc. Computer Science"
  );
  assert.equal(
    buildVisitorDisplaySubtitle({
      visitorCategory: "Faculty & Institutional Delegates",
      designation: "Head of Department (HOD)",
    }),
    "Faculty & Institutional Delegates · Head of Department (HOD)"
  );
  assert.equal(
    buildVisitorDisplaySubtitle({
      visitorCategory: "General Visitor",
    }),
    "General Visitor"
  );
});
