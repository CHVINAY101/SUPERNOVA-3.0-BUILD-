const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(value: string) {
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed);
}

export function normalizeContactPhone(value: string): string {
  return String(value || "").replace(/[\s\u00A0\-–—+().]/g, "");
}

export function isValidPhone(value: string) {
  return /^[0-9]{10,15}$/.test(normalizeContactPhone(value));
}

export function isValidName(value: string, max = 80) {
  const length = value.trim().length;
  return length >= 2 && length <= max;
}

export function isValidClassCourse(value: string, max = 120) {
  const length = value.trim().length;
  return length >= 1 && length <= max;
}

export function isValidInstitution(value: string, max = 150) {
  const length = value.trim().length;
  return length >= 2 && length <= max;
}

export function isValidDesignation(value: string, max = 120) {
  const length = value.trim().length;
  return length >= 2 && length <= max;
}

