const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

export interface EmailAttachmentInput {
  filename: string;
  contentType: string;
  base64Content: string; // raw base64 or data URI
}

export interface EmailMimeParams {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  attachments?: EmailAttachmentInput[];
}

export interface RecipientValidationResult {
  valid: boolean;
  normalizedEmail?: string;
  error?: string;
}

export function containsHeaderInjection(value: string): boolean {
  return /[\r\n]/.test(value);
}

export function validateRecipientEmail(email: string | null | undefined): RecipientValidationResult {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Recipient email address is missing." };
  }
  if (containsHeaderInjection(email)) {
    return { valid: false, error: "Invalid characters detected in email address." };
  }
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254 || !STRICT_EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: `Invalid recipient email address: "${email.trim()}"` };
  }
  return { valid: true, normalizedEmail: trimmed };
}

export function validateEmailList(raw: string | null | undefined): { valid: boolean; list: string[]; error?: string } {
  if (!raw || !raw.trim()) return { valid: true, list: [] };
  if (containsHeaderInjection(raw)) {
    return { valid: false, list: [], error: "Invalid newline characters in email header." };
  }
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const normalized: string[] = [];
  for (const part of parts) {
    const check = validateRecipientEmail(part);
    if (!check.valid || !check.normalizedEmail) {
      return { valid: false, list: [], error: check.error };
    }
    normalized.push(check.normalizedEmail);
  }
  return { valid: true, list: normalized };
}

export function stripDataUriPrefix(base64OrDataUri: string): string {
  const idx = base64OrDataUri.indexOf("base64,");
  if (idx !== -1) {
    return base64OrDataUri.slice(idx + "base64,".length).replace(/\s+/g, "");
  }
  return base64OrDataUri.replace(/\s+/g, "");
}

export function wrapBase6476(b64: string): string {
  const clean = b64.replace(/\s+/g, "");
  const lines: string[] = [];
  for (let i = 0; i < clean.length; i += 76) {
    lines.push(clean.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

export function encodeUtf8BytesToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function encodeMimeSubject(subject: string): string {
  const clean = subject.replace(/[\r\n]+/g, " ").trim();
  return `=?utf-8?B?${encodeUtf8BytesToBase64(clean)}?=`;
}

export function base64UrlEncodeMime(rawMime: string): string {
  return encodeUtf8BytesToBase64(rawMime)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function sanitizeAttachmentFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_").slice(0, 120) || "attachment.pdf";
}

export function buildRfc2822MimeMessage(params: EmailMimeParams): string {
  const cleanFrom = params.from.replace(/[\r\n]+/g, "").trim();
  const cleanTo = params.to.replace(/[\r\n]+/g, "").trim();
  const headers: string[] = [
    `From: ${cleanFrom}`,
    `To: ${cleanTo}`,
  ];

  if (params.cc && params.cc.trim()) {
    headers.push(`Cc: ${params.cc.replace(/[\r\n]+/g, "").trim()}`);
  }
  if (params.bcc && params.bcc.trim()) {
    headers.push(`Bcc: ${params.bcc.replace(/[\r\n]+/g, "").trim()}`);
  }

  headers.push(`Subject: ${encodeMimeSubject(params.subject)}`);
  headers.push(`MIME-Version: 1.0`);

  const attachments = (params.attachments || []).filter((a) => Boolean(a.base64Content));

  if (attachments.length === 0) {
    headers.push(`Content-Type: text/html; charset=utf-8`);
    headers.push(`Content-Transfer-Encoding: base64`);
    return `${headers.join("\r\n")}\r\n\r\n${wrapBase6476(encodeUtf8BytesToBase64(params.bodyHtml))}`;
  }

  const boundary = `supernova_mixed_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [];

  // HTML part
  parts.push(
    [
      `--${boundary}`,
      `Content-Type: text/html; charset="utf-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      wrapBase6476(encodeUtf8BytesToBase64(params.bodyHtml)),
    ].join("\r\n")
  );

  // Attachment parts
  for (const att of attachments) {
    const safeName = sanitizeAttachmentFilename(att.filename);
    const rawB64 = stripDataUriPrefix(att.base64Content);
    parts.push(
      [
        `--${boundary}`,
        `Content-Type: ${att.contentType}; name="${safeName}"`,
        `Content-Disposition: attachment; filename="${safeName}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        wrapBase6476(rawB64),
      ].join("\r\n")
    );
  }

  parts.push(`--${boundary}--`);

  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

export interface RawProviderResponse {
  httpOk: boolean;
  statusCode: number;
  okFlag?: boolean;
  simulated?: boolean;
  messageId?: string | null;
  error?: string | null;
}

/**
 * Honest delivery evaluator: NEVER reports "sent" unless an external mail provider
 * returned a real 2xx confirmation and a real provider messageId (or explicit skipped duplicate).
 */
export function evaluateProviderDelivery(res: RawProviderResponse): {
  delivered: boolean;
  status: "sent" | "failed";
  error?: string;
} {
  if (!res.httpOk || res.statusCode < 200 || res.statusCode >= 300) {
    return {
      delivered: false,
      status: "failed",
      error: res.error || `Email service returned HTTP ${res.statusCode}`,
    };
  }
  if (res.simulated) {
    return {
      delivered: false,
      status: "failed",
      error: "Provider secrets are not configured; simulated sends cannot be treated as delivered.",
    };
  }
  if (res.okFlag === false || !res.messageId) {
    return {
      delivered: false,
      status: "failed",
      error: res.error || "Email provider did not return a confirmed message ID.",
    };
  }
  return { delivered: true, status: "sent" };
}

export function redactSensitiveText(input: string): string {
  return String(input || "")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[REDACTED_OAUTH_TOKEN]")
    .replace(/1\/\/[A-Za-z0-9._-]+/g, "[REDACTED_REFRESH_TOKEN]")
    .replace(/re_[A-Za-z0-9_-]{12,}/g, "[REDACTED_RESEND_KEY]")
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, "[REDACTED_JWT]")
    .replace(/(client_secret|refresh_token|access_token)=([^&\s]+)/gi, "$1=[REDACTED]");
}
