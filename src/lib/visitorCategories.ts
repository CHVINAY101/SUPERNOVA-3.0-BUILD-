import {
  isValidClassCourse,
  isValidDesignation,
  isValidEmail,
  isValidInstitution,
  isValidName,
  isValidPhone,
} from "./validation";

export type VisitorCategoryId = "student" | "faculty" | "general";

export type CanonicalVisitorCategory =
  | "Student Visitor"
  | "Faculty & Institutional Delegates"
  | "General Visitor";

export interface VisitorCategoryCardMeta {
  id: VisitorCategoryId;
  dbValue: CanonicalVisitorCategory;
  title: string;
  shortDescription: string;
  badgeText: string;
}

export const VISITOR_CATEGORY_CARDS: VisitorCategoryCardMeta[] = [
  {
    id: "student",
    dbValue: "Student Visitor",
    title: "STUDENT VISITOR",
    shortDescription: "School, PU, undergraduate & postgraduate students attending the fest",
    badgeText: "Academic Cohort",
  },
  {
    id: "faculty",
    dbValue: "Faculty & Institutional Delegates",
    title: "FACULTY & INSTITUTIONAL DELEGATES",
    shortDescription: "Principals, HODs, lecturers, teachers & official institutional representatives",
    badgeText: "Educator & Delegate",
  },
  {
    id: "general",
    dbValue: "General Visitor",
    title: "GENERAL VISITOR",
    shortDescription: "Parents, alumni, industry guests & general public attendees",
    badgeText: "Open Pass",
  },
];

export const FACULTY_DESIGNATION_OPTIONS = [
  "Principal",
  "Head of Institution",
  "Head of Department (HOD)",
  "Lecturer",
  "Teacher",
  "Institutional Representative",
  "Other",
] as const;

export type FacultyDesignationOption = (typeof FACULTY_DESIGNATION_OPTIONS)[number];

export function getCategoryCardById(id: VisitorCategoryId | null | undefined): VisitorCategoryCardMeta | null {
  if (!id) return null;
  return VISITOR_CATEGORY_CARDS.find((c) => c.id === id) || null;
}

export function getDbCategoryFromId(id: VisitorCategoryId): CanonicalVisitorCategory {
  if (id === "student") return "Student Visitor";
  if (id === "faculty") return "Faculty & Institutional Delegates";
  return "General Visitor";
}

export function getCategoryIdFromDb(category?: string | null): VisitorCategoryId {
  const canonical = normalizeVisitorCategory(category);
  if (canonical === "Student Visitor") return "student";
  if (canonical === "Faculty & Institutional Delegates") return "faculty";
  return "general";
}

/**
 * Normalizes new and historical visitor_category strings into the three canonical categories
 * without mutating existing database rows.
 */
export function normalizeVisitorCategory(
  rawCategory?: string | null,
  studentClass?: string | null,
  designation?: string | null
): CanonicalVisitorCategory {
  const cat = String(rawCategory || "").trim().toLowerCase();
  const desig = String(designation || "").trim();
  const cls = String(studentClass || "").trim();

  if (
    cat.includes("faculty") ||
    cat.includes("delegate") ||
    cat.includes("teacher") ||
    cat.includes("educator") ||
    cat.includes("staff") ||
    cat.includes("principal") ||
    cat.includes("lecturer")
  ) {
    return "Faculty & Institutional Delegates";
  }

  if (cat.includes("student")) {
    return "Student Visitor";
  }

  if (desig && !cls) {
    return "Faculty & Institutional Delegates";
  }

  // Legacy walk-ins or non-faculty rows with a student class stay Student Visitor when explicitly tagged student;
  // explicit General Visitor or legacy Walk-in without student category resolves to General Visitor (or Student if studentClass recorded for Walk-in)
  if (cat.includes("walk") && cls) {
    return "Student Visitor";
  }

  return "General Visitor";
}

export function resolveFacultyDesignationValue(
  designationOption: string,
  customDesignation: string
): string {
  if (designationOption === "Other") {
    return customDesignation.trim();
  }
  return designationOption.trim();
}

export interface VisitorFormValidationInput {
  categoryId: VisitorCategoryId | null;
  fullName: string;
  email: string;
  phone: string;
  studentClass: string;
  designationOption: string;
  customDesignation: string;
  institution: string;
}

export function validateVisitorFormFields(
  input: VisitorFormValidationInput
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.categoryId) {
    errors.category = "Please select one of the three visitor categories.";
  }

  if (!isValidName(input.fullName, 120)) {
    errors.fullName = "Please enter your full name (2 to 120 characters).";
  }

  if (!isValidEmail(input.email)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!isValidPhone(input.phone)) {
    errors.phone =
      "Please enter a valid 10–15 digit contact mobile number (parent or guardian number accepted for younger students).";
  }

  if (input.categoryId === "student") {
    if (!isValidClassCourse(input.studentClass, 120)) {
      errors.studentClass = "Please enter your Class / Course.";
    }
    if (!isValidInstitution(input.institution, 150)) {
      errors.institution = "Please enter your College / Institution Name (at least 2 characters).";
    }
  } else if (input.categoryId === "faculty") {
    if (!input.designationOption.trim()) {
      errors.designationOption = "Please select your Designation / Role.";
    } else if (input.designationOption === "Other") {
      if (!isValidDesignation(input.customDesignation, 120)) {
        errors.customDesignation = "Please specify your Designation / Role (2 to 120 characters).";
      }
    }
    if (!isValidInstitution(input.institution, 150)) {
      errors.institution = "Please enter your College / Institution Name (at least 2 characters).";
    }
  } else if (input.categoryId === "general") {
    const trimmedInst = input.institution.trim();
    if (trimmedInst.length > 0 && !isValidInstitution(trimmedInst, 150)) {
      errors.institution = "College / Institution Name must be 2 to 150 characters when provided.";
    }
  }

  return errors;
}

export function buildVisitorDisplaySubtitle(params: {
  visitorCategory?: string | null;
  studentClass?: string | null;
  designation?: string | null;
}): string {
  const canonical = normalizeVisitorCategory(
    params.visitorCategory,
    params.studentClass,
    params.designation
  );
  if (canonical === "Student Visitor" && params.studentClass?.trim()) {
    return `${canonical} · ${params.studentClass.trim()}`;
  }
  if (canonical === "Faculty & Institutional Delegates" && params.designation?.trim()) {
    return `${canonical} · ${params.designation.trim()}`;
  }
  return canonical;
}
