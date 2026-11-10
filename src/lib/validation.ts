const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(value: string) {
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed);
}

export function isValidPhone(value: string) {
  return /^[0-9]{10,15}$/.test(value.replace(/[\s\-+()]/g, ""));
}

export function isValidName(value: string, max = 80) {
  const length = value.trim().length;
  return length >= 2 && length <= max;
}
