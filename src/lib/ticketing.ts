export type TicketCategory = "visitor" | "participation" | "esports";
export type TicketRecordStatus = "active" | "cancelled" | "revoked";
export type GateVerdict = "VALID" | "ALREADY USED" | "INVALID";

export interface SecureQrPayloadData {
  v: 1;
  ref: string;
  token: string;
}

export interface ParsedSecureQrInput {
  ok: boolean;
  ticketRef: string;
  qrToken: string | null;
  rawInput: string;
  ignoredUntrustedClaims: boolean;
  isTokenOnly: boolean;
  error?: string;
}

export interface TicketLikeRecord {
  id?: string;
  ticket_ref: string;
  qr_token: string;
  registration_id: string;
  registration_category: TicketCategory;
  registration_ref: string;
  display_name: string;
  subtitle?: string | null;
  institution?: string | null;
  status: TicketRecordStatus | string;
  issued_at: string;
  checked_in_at?: string | null;
  checked_in_by_email?: string | null;
}

export interface RegistrationEligibilitySubject {
  status: string;
  archived_at?: string | null;
  admin_notes?: string | null;
}

export interface TicketEvaluationResult {
  verdict: GateVerdict;
  canCheckIn: boolean;
  reason: string;
  ticketRef?: string;
  registrationCategory?: TicketCategory;
  displayName?: string;
  checkedInAt?: string | null;
  checkedInBy?: string | null;
}

const TICKET_REF_REGEX = /\b(SN3-[A-Z0-9-]{4,36})\b/i;
const HEX_TOKEN_REGEX = /^[a-f0-9]{32,128}$/i;

/**
 * Builds a minimal, PII-free QR verification payload containing ONLY version,
 * ticket reference, and cryptographically random verification token.
 */
export function buildSecureQrPayload(ticketRef: string, qrToken: string): string {
  const cleanRef = String(ticketRef || "").trim().toUpperCase();
  const cleanToken = String(qrToken || "").trim();
  if (!cleanRef) {
    throw new Error("Ticket reference is required to build QR payload.");
  }
  if (!cleanToken) {
    throw new Error("Secure QR verification token is required to build QR payload.");
  }
  const payload: SecureQrPayloadData = {
    v: 1,
    ref: cleanRef,
    token: cleanToken,
  };
  return JSON.stringify(payload);
}

/**
 * Parses QR scan input or manual ticket search query.
 * Explicitly strips/flags any untrusted status/category/role claims in scanned payloads
 * so gate verification NEVER trusts QR contents without server/DB validation.
 */
export function parseSecureQrPayload(rawInput: string): ParsedSecureQrInput {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) {
    return {
      ok: false,
      ticketRef: "",
      qrToken: null,
      rawInput: trimmed,
      ignoredUntrustedClaims: false,
      isTokenOnly: false,
      error: "Empty ticket code or QR payload.",
    };
  }

  let ignoredUntrustedClaims = false;

  // 1. JSON payload check: {"v":1,"ref":"SN3-...","token":"..."}
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        if (
          "status" in parsed ||
          "eligible" in parsed ||
          "valid" in parsed ||
          "role" in parsed ||
          "selection_status" in parsed ||
          "checked_in" in parsed
        ) {
          ignoredUntrustedClaims = true;
        }
        const rawRef =
          parsed.ref ||
          parsed.ticketRef ||
          parsed.ticket_ref ||
          parsed.registrationRef ||
          parsed.registration_ref ||
          parsed.ticket ||
          "";
        const rawToken = parsed.token || parsed.qrToken || parsed.qr_token || "";
        const refMatch = String(rawRef).toUpperCase().match(TICKET_REF_REGEX);
        const tokenStr = typeof rawToken === "string" && rawToken.trim().length >= 16 ? rawToken.trim() : null;

        if (refMatch || tokenStr) {
          return {
            ok: true,
            ticketRef: refMatch ? refMatch[1] : "",
            qrToken: tokenStr,
            rawInput: trimmed,
            ignoredUntrustedClaims,
            isTokenOnly: !refMatch && Boolean(tokenStr),
          };
        }
      }
    } catch {
      // fall through
    }
  }

  // 2. Pipe-delimited compact token payload: SUPERNOVA3|TICKET|<ref>|<token>
  if (trimmed.startsWith("SUPERNOVA3|")) {
    const parts = trimmed.split("|");
    const refPart = parts[2] || "";
    const tokPart = parts[3] || "";
    const refMatch = refPart.toUpperCase().match(TICKET_REF_REGEX);
    const tokenStr = tokPart.trim().length >= 16 ? tokPart.trim() : null;
    if (refMatch || tokenStr) {
      return {
        ok: true,
        ticketRef: refMatch ? refMatch[1] : "",
        qrToken: tokenStr,
        rawInput: trimmed,
        ignoredUntrustedClaims,
        isTokenOnly: !refMatch && Boolean(tokenStr),
      };
    }
  }

  // 3. URL format: https://.../verify?ref=SN3-...&token=...
  if (trimmed.includes("://") || trimmed.includes("?")) {
    try {
      const url = new URL(
        trimmed.startsWith("http") ? trimmed : `https://verify.local/${trimmed.replace(/^\/+/, "")}`
      );
      if (url.searchParams.has("status") || url.searchParams.has("eligible") || url.searchParams.has("valid")) {
        ignoredUntrustedClaims = true;
      }
      const refCandidate =
        url.searchParams.get("ref") ||
        url.searchParams.get("ticket") ||
        url.searchParams.get("code") ||
        url.pathname;
      const tokCandidate = url.searchParams.get("token") || url.searchParams.get("t");
      const refMatch = String(refCandidate || "").toUpperCase().match(TICKET_REF_REGEX);
      const tokenStr = tokCandidate && tokCandidate.trim().length >= 16 ? tokCandidate.trim() : null;
      if (refMatch || tokenStr) {
        return {
          ok: true,
          ticketRef: refMatch ? refMatch[1] : "",
          qrToken: tokenStr,
          rawInput: trimmed,
          ignoredUntrustedClaims,
          isTokenOnly: !refMatch && Boolean(tokenStr),
        };
      }
    } catch {
      // fall through
    }
  }

  // 4. Raw cryptographic hex token
  if (HEX_TOKEN_REGEX.test(trimmed)) {
    return {
      ok: true,
      ticketRef: "",
      qrToken: trimmed.toLowerCase(),
      rawInput: trimmed,
      ignoredUntrustedClaims: false,
      isTokenOnly: true,
    };
  }

  // 5. Direct ticket reference (SN3-...)
  const refMatch = trimmed.toUpperCase().match(TICKET_REF_REGEX);
  if (refMatch) {
    return {
      ok: true,
      ticketRef: refMatch[1],
      qrToken: null,
      rawInput: trimmed,
      ignoredUntrustedClaims,
      isTokenOnly: false,
    };
  }

  return {
    ok: false,
    ticketRef: trimmed.toUpperCase(),
    qrToken: null,
    rawInput: trimmed,
    ignoredUntrustedClaims,
    isTokenOnly: false,
    error: "Invalid or unrecognized Supernova ticket format.",
  };
}

export function isRegistrationArchivedState(record: {
  archived_at?: string | null;
  admin_notes?: string | null;
}): boolean {
  if (record.archived_at) return true;
  if (record.admin_notes && record.admin_notes.includes("[ARCHIVED")) return true;
  return false;
}

/**
 * Enforces category-specific issuance rules:
 * - Visitor: eligible once confirmed (auto-confirmed on registration submission).
 * - Participation: eligible ONLY after admin approval (status === 'confirmed').
 * - Esports: eligible ONLY after confirmation process succeeds (status === 'confirmed').
 * Pending, declined, correction_requested, withdrawn, or archived records are NEVER eligible.
 */
export function isRegistrationEligibleForTicket(
  category: TicketCategory,
  registration: RegistrationEligibilitySubject | null
): { eligible: boolean; reason?: string } {
  if (!registration) {
    return { eligible: false, reason: "Registration record not found." };
  }
  if (isRegistrationArchivedState(registration)) {
    return { eligible: false, reason: "Registration has been archived." };
  }
  if (registration.status !== "confirmed") {
    const label =
      category === "participation"
        ? "administrator approval"
        : category === "esports"
        ? "esports confirmation"
        : "registration confirmation";
    return {
      eligible: false,
      reason: `Ticket requires ${label} (current status: ${registration.status}).`,
    };
  }
  return { eligible: true };
}

/**
 * Evaluates a ticket and its live registration record into one of three strict verdicts:
 * VALID | ALREADY USED | INVALID
 */
export function evaluateTicketStatus(params: {
  ticket: TicketLikeRecord | null;
  registration: RegistrationEligibilitySubject | null;
  suppliedQrToken?: string | null;
  suppliedTicketRef?: string | null;
}): TicketEvaluationResult {
  const { ticket, registration, suppliedQrToken, suppliedTicketRef } = params;

  if (!ticket) {
    return {
      verdict: "INVALID",
      canCheckIn: false,
      reason: "Ticket not found in database.",
    };
  }

  if (suppliedTicketRef && suppliedTicketRef.trim().toUpperCase() !== ticket.ticket_ref.toUpperCase()) {
    return {
      verdict: "INVALID",
      canCheckIn: false,
      reason: "Ticket reference mismatch.",
      ticketRef: ticket.ticket_ref,
    };
  }

  if (suppliedQrToken && suppliedQrToken.trim() !== ticket.qr_token) {
    return {
      verdict: "INVALID",
      canCheckIn: false,
      reason: "QR verification token mismatch or tampered QR code.",
      ticketRef: ticket.ticket_ref,
    };
  }

  if (ticket.status !== "active") {
    return {
      verdict: "INVALID",
      canCheckIn: false,
      reason: `Ticket is ${ticket.status}.`,
      ticketRef: ticket.ticket_ref,
      registrationCategory: ticket.registration_category,
      displayName: ticket.display_name,
    };
  }

  const eligibility = isRegistrationEligibleForTicket(ticket.registration_category, registration);
  if (!eligibility.eligible) {
    return {
      verdict: "INVALID",
      canCheckIn: false,
      reason: eligibility.reason || "Registration is not approved.",
      ticketRef: ticket.ticket_ref,
      registrationCategory: ticket.registration_category,
      displayName: ticket.display_name,
    };
  }

  if (ticket.checked_in_at) {
    return {
      verdict: "ALREADY USED",
      canCheckIn: false,
      reason: `Ticket was already checked in at ${ticket.checked_in_at}.`,
      ticketRef: ticket.ticket_ref,
      registrationCategory: ticket.registration_category,
      displayName: ticket.display_name,
      checkedInAt: ticket.checked_in_at,
      checkedInBy: ticket.checked_in_by_email || null,
    };
  }

  return {
    verdict: "VALID",
    canCheckIn: true,
    reason: "Verified active ticket eligible for gate admission.",
    ticketRef: ticket.ticket_ref,
    registrationCategory: ticket.registration_category,
    displayName: ticket.display_name,
  };
}

export function normalizePhoneDigits(phone: string): string {
  return String(phone || "").replace(/\D/g, "");
}

/**
 * Anti-IDOR verification helper: prevents accessing another user's ticket
 * solely by altering a URL parameter or registration reference.
 * Requires matching reference AND registered email + phone number.
 */
export function canAccessTicketDetails(
  request: { reference: string; email: string; phone: string },
  stored: { ticketRef?: string | null; registrationRef: string; email: string; phone: string }
): boolean {
  const reqRef = String(request.reference || "").trim().toUpperCase();
  const storedTicketRef = String(stored.ticketRef || "").trim().toUpperCase();
  const storedRegRef = String(stored.registrationRef || "").trim().toUpperCase();

  if (!reqRef || (reqRef !== storedTicketRef && reqRef !== storedRegRef)) {
    return false;
  }

  const reqEmail = String(request.email || "").trim().toLowerCase();
  const storedEmail = String(stored.email || "").trim().toLowerCase();
  if (!reqEmail || reqEmail !== storedEmail) {
    return false;
  }

  const reqDigits = normalizePhoneDigits(request.phone);
  const storedDigits = normalizePhoneDigits(stored.phone);
  if (reqDigits.length < 10 || storedDigits.length < 10) {
    return false;
  }

  return reqDigits === storedDigits || reqDigits.slice(-10) === storedDigits.slice(-10);
}

/**
 * Pure idempotent + atomic in-memory ticket store model used to verify
 * concurrency locking and idempotency invariants in automated tests.
 */
export class InMemoryTicketStore {
  private ticketsByKey = new Map<string, TicketLikeRecord>();
  private ticketsByRef = new Map<string, TicketLikeRecord>();
  private ticketsByToken = new Map<string, TicketLikeRecord>();
  private lockQueue = new Map<string, Promise<void>>();

  private regKey(category: TicketCategory, registrationId: string): string {
    return `${category}:${registrationId}`;
  }

  issueTicket(params: {
    registrationId: string;
    category: TicketCategory;
    registrationRef: string;
    ticketRef: string;
    qrToken: string;
    displayName: string;
    registration: RegistrationEligibilitySubject;
  }): { ok: boolean; ticket?: TicketLikeRecord; created?: boolean; error?: string } {
    const eligibility = isRegistrationEligibleForTicket(params.category, params.registration);
    if (!eligibility.eligible) {
      return { ok: false, error: eligibility.reason };
    }

    const key = this.regKey(params.category, params.registrationId);
    const existing = this.ticketsByKey.get(key);
    if (existing) {
      return { ok: true, ticket: existing, created: false };
    }

    const created: TicketLikeRecord = {
      id: `tkt-${this.ticketsByKey.size + 1}`,
      ticket_ref: params.ticketRef.toUpperCase(),
      qr_token: params.qrToken,
      registration_id: params.registrationId,
      registration_category: params.category,
      registration_ref: params.registrationRef.toUpperCase(),
      display_name: params.displayName,
      status: "active",
      issued_at: new Date().toISOString(),
      checked_in_at: null,
      checked_in_by_email: null,
    };

    this.ticketsByKey.set(key, created);
    this.ticketsByRef.set(created.ticket_ref, created);
    this.ticketsByToken.set(created.qr_token, created);

    return { ok: true, ticket: created, created: true };
  }

  async atomicCheckIn(params: {
    ticketRef: string;
    qrToken?: string | null;
    staffEmail: string;
    registration: RegistrationEligibilitySubject;
  }): Promise<{ ok: boolean; verdict: GateVerdict; checkedInAt?: string; error?: string }> {
    const refKey = params.ticketRef.trim().toUpperCase();
    const prev = this.lockQueue.get(refKey) || Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.lockQueue.set(refKey, prev.then(() => next));

    await prev;
    try {
      const ticket = this.ticketsByRef.get(refKey) || null;
      const evaluation = evaluateTicketStatus({
        ticket,
        registration: params.registration,
        suppliedQrToken: params.qrToken,
        suppliedTicketRef: refKey,
      });

      if (evaluation.verdict !== "VALID" || !ticket) {
        return {
          ok: false,
          verdict: evaluation.verdict,
          checkedInAt: ticket?.checked_in_at || undefined,
          error: evaluation.reason,
        };
      }

      // Simulate async DB write inside the row lock window
      await Promise.resolve();

      const nowIso = new Date().toISOString();
      ticket.checked_in_at = nowIso;
      ticket.checked_in_by_email = params.staffEmail;

      return { ok: true, verdict: "VALID", checkedInAt: nowIso };
    } finally {
      release();
    }
  }
}
