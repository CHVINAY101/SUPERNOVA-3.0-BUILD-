import { supabase } from "./supabase";
import { formatCheckInDatabaseError } from "./entryOperations";
import { parseSecureQrPayload } from "./ticketing";
import { isValidPhone, normalizeContactPhone } from "./validation";
import type {
  GateVerificationResult,
  PublicTicketLookupResult,
  TicketCategory,
  TicketRecord,
} from "@/types/database";

export interface VisitorTicketSubmitPayload {
  fullName: string;
  email: string;
  phone?: string | null;
  institution?: string | null;
  visitorCategory: string;
  studentClass?: string | null;
  designation?: string | null;
  esportsInterest?: boolean;
  preferredGame?: string | null;
  esportsIntent?: string | null;
  inGameId?: string | null;
  teamName?: string | null;
  competitionNotes?: string | null;
  daysAttending?: string;
  registrationSource?: "public" | "walk_in";
  promoConsent?: boolean;
}

export interface VisitorTicketSubmitResult {
  ok: boolean;
  registrationId?: string;
  registrationRef: string;
  ticket?: TicketRecord | null;
  error?: string;
}

function isMissingRpcError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || "").toLowerCase();
  const code = String((err as any)?.code || "");
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

/**
 * Normalizes Supabase / Postgres errors from visitor registration RPCs into clear user-facing copy
 * without mislabeling validation errors as gate-ticket errors.
 */
export function extractVisitorRegistrationError(err: unknown): string {
  if (!err) return "Registration could not be completed. Please try again.";
  if (typeof err === "string") return err.trim() || "Registration could not be completed. Please try again.";
  const raw = String((err as any)?.message || "").trim();
  if (!raw) return "Registration could not be completed. Please try again.";
  if (/row-level security|permission denied/i.test(raw)) {
    return "Registration is currently unavailable due to permission restrictions. Please contact the helpdesk.";
  }
  return raw;
}

/**
 * Submits a visitor registration, confirms it immediately, and issues its unique
 * cryptographic ticket via submit_visitor_and_issue_ticket.
 * Calls the 18-argument signature matching live production Supabase first so zero 404s occur,
 * and falls back cleanly if an older signature is active.
 */
export async function submitVisitorAndIssueTicket(
  payload: VisitorTicketSubmitPayload
): Promise<VisitorTicketSubmitResult> {
  const rawPhone = String(payload.phone || "").trim();
  if (!rawPhone || !isValidPhone(rawPhone)) {
    throw new Error(
      "Please enter a valid 10–15 digit Contact Mobile Number (country codes and parent or guardian numbers accepted)."
    );
  }

  const cleanPhone = normalizeContactPhone(rawPhone);
  const cleanInstitution = payload.institution?.trim() || null;
  const cleanStudentClass = payload.studentClass?.trim() || null;
  const cleanDesignation = payload.designation?.trim() || null;

  const baseRpcArgs = {
    p_full_name: payload.fullName.trim(),
    p_email: payload.email.trim().toLowerCase(),
    p_phone: cleanPhone,
    p_institution: cleanInstitution,
    p_visitor_category: payload.visitorCategory,
    p_student_class: cleanStudentClass,
    p_student_id: null,
    p_designation: cleanDesignation,
    p_esports_interest: Boolean(payload.esportsInterest),
    p_preferred_game: payload.preferredGame || null,
    p_esports_intent: payload.esportsIntent || null,
    p_in_game_id: payload.inGameId || null,
    p_team_name: payload.teamName || null,
    p_competition_notes: payload.competitionNotes || null,
    p_days_attending: payload.daysAttending || "Both",
    p_consent: true,
    p_website: "",
  };
  const rpcArgsWithSource = {
    ...baseRpcArgs,
    p_registration_source: payload.registrationSource || "public",
  };
  const rpcArgsWithPromo = {
    ...rpcArgsWithSource,
    p_promo_consent: Boolean(payload.promoConsent),
  };

  // 1. Primary unified RPC matching production signature (18 args — also compatible with DEFAULT promo_consent)
  let { data: ticketRpcData, error: ticketRpcErr } = await supabase.rpc(
    "submit_visitor_and_issue_ticket",
    rpcArgsWithSource
  );

  // Fallback to 19-arg explicit signature only if required by schema
  if (ticketRpcErr && isMissingRpcError(ticketRpcErr)) {
    const promoTry = await supabase.rpc("submit_visitor_and_issue_ticket", rpcArgsWithPromo);
    ticketRpcData = promoTry.data;
    ticketRpcErr = promoTry.error;
  }

  // Fallback to 17-param signature if 20261118 migration has not been applied
  if (ticketRpcErr && isMissingRpcError(ticketRpcErr)) {
    const legacyTry = await supabase.rpc("submit_visitor_and_issue_ticket", baseRpcArgs);
    ticketRpcData = legacyTry.data;
    ticketRpcErr = legacyTry.error;
  }

  if (!ticketRpcErr && ticketRpcData && (ticketRpcData as any).ok) {
    const res = ticketRpcData as any;
    return {
      ok: true,
      registrationId: res.registration_id,
      registrationRef: res.registration_ref,
      ticket: (res.ticket as TicketRecord) || null,
    };
  }

  if (ticketRpcErr && !isMissingRpcError(ticketRpcErr)) {
    throw ticketRpcErr;
  }

  // 2. Fallback to submit_visitor_registration_v2
  let { data: v2Data, error: v2Error } = await supabase.rpc(
    "submit_visitor_registration_v2",
    rpcArgsWithSource
  );
  if (v2Error && isMissingRpcError(v2Error)) {
    const promoV2 = await supabase.rpc("submit_visitor_registration_v2", rpcArgsWithPromo);
    v2Data = promoV2.data;
    v2Error = promoV2.error;
  }
  if (v2Error && isMissingRpcError(v2Error)) {
    const legacyV2 = await supabase.rpc("submit_visitor_registration_v2", baseRpcArgs);
    v2Data = legacyV2.data;
    v2Error = legacyV2.error;
  }

  if (!v2Error && v2Data) {
    return {
      ok: true,
      registrationRef: typeof v2Data === "string" ? v2Data : String(v2Data),
      ticket: null,
    };
  }

  if (v2Error && !isMissingRpcError(v2Error)) {
    throw v2Error;
  }

  // 3. Fallback to legacy submit_visitor_registration
  let fallbackCat = "General visitor";
  const lowerCat = payload.visitorCategory.toLowerCase();
  if (lowerCat.includes("student")) {
    fallbackCat =
      cleanStudentClass?.includes("PUC") || cleanStudentClass?.includes("Degree")
        ? "College student"
        : "School student";
  } else if (lowerCat.includes("faculty") || lowerCat.includes("delegate")) {
    fallbackCat = "Teacher or educator";
  }

  const { data: v1Data, error: v1Error } = await supabase.rpc("submit_visitor_registration", {
    p_full_name: payload.fullName.trim(),
    p_email: payload.email.trim().toLowerCase(),
    p_phone: cleanPhone,
    p_institution: cleanInstitution || "",
    p_visitor_category: fallbackCat,
    p_consent: true,
    p_website: "",
  });

  if (v1Error) throw v1Error;

  return {
    ok: true,
    registrationRef: typeof v1Data === "string" ? v1Data : String(v1Data || "SN3-26-REG"),
    ticket: null,
  };
}

/**
 * Staff-only idempotent ticket issuance for an approved registration.
 */
export async function issueTicketForRegistration(
  category: TicketCategory,
  registrationId: string
): Promise<{ ok: boolean; ticket?: TicketRecord; error?: string }> {
  const { data, error } = await supabase.rpc("issue_ticket_for_registration", {
    p_category: category,
    p_registration_id: registrationId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const res = data as any;
  if (!res?.ok) {
    return { ok: false, error: res?.error || "Ticket could not be issued." };
  }

  return { ok: true, ticket: res.ticket as TicketRecord };
}

/**
 * Staff-only query to load an already-issued ticket by registration.
 */
export async function fetchTicketByRegistration(
  category: TicketCategory,
  registrationId: string
): Promise<TicketRecord | null> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("registration_category", category)
    .eq("registration_id", registrationId)
    .maybeSingle();

  if (error || !data) return null;
  return data as TicketRecord;
}

/**
 * Anti-IDOR public ticket retrieval / status check requiring matching
 * reference + registered email (plus 10-digit phone for Esports teams).
 */
export async function lookupPublicTicket(params: {
  reference: string;
  email: string;
  phone?: string | null;
}): Promise<PublicTicketLookupResult> {
  const { data, error } = await supabase.rpc("lookup_public_ticket", {
    p_reference: params.reference.trim(),
    p_email: params.email.trim().toLowerCase(),
    p_phone: params.phone?.trim() || null,
  });

  if (error) {
    return {
      ok: false,
      status: "error",
      error: formatCheckInDatabaseError(error),
    };
  }

  return (data as PublicTicketLookupResult) || {
    ok: false,
    status: "not_found",
    error: "No matching ticket found.",
  };
}

/**
 * Authoritative staff-only DB verification of a QR scan or manual ticket code.
 * Never trusts client claims in QR payloads; validates qr_token + registration status on DB.
 */
export async function verifyGateTicket(
  rawInput: string,
  eventDay = "2026-11-20"
): Promise<GateVerificationResult> {
  const parsed = parseSecureQrPayload(rawInput);
  const queryArg = parsed.ticketRef || (parsed.isTokenOnly ? "" : rawInput.trim());
  const tokenArg = parsed.qrToken;

  let { data, error } = await supabase.rpc("verify_gate_ticket", {
    p_query: queryArg,
    p_qr_token: tokenArg,
    p_event_day: eventDay,
  });

  if (error && isMissingRpcError(error)) {
    const legacyVerify = await supabase.rpc("verify_gate_ticket", {
      p_query: queryArg,
      p_qr_token: tokenArg,
    });
    data = legacyVerify.data;
    error = legacyVerify.error;
  }

  if (error) {
    return {
      ok: false,
      verdict: "INVALID",
      can_check_in: false,
      error: formatCheckInDatabaseError(error),
      reason: error.message,
    };
  }

  return data as GateVerificationResult;
}

/**
 * Atomic single-use DB check-in using SELECT ... FOR UPDATE row lock.
 */
export interface GateCheckinResult extends GateVerificationResult {
  duplicate?: boolean;
  checked_in_at?: string | null;
  checked_in_by?: string | null;
  ticket_ref?: string;
  checkin_id?: string | null;
}

export async function checkinGateTicket(params: {
  ticketRef: string;
  qrToken?: string | null;
  eventDay?: string;
  wristbandCategory?: string | null;
  wristbandCode?: string | null;
  notes?: string | null;
}): Promise<GateCheckinResult> {
  const { data, error } = await supabase.rpc("checkin_gate_ticket", {
    p_ticket_ref: params.ticketRef.trim(),
    p_qr_token: params.qrToken || null,
    p_event_day: params.eventDay || "2026-11-20",
    p_wristband_category: params.wristbandCategory || null,
    p_wristband_code: params.wristbandCode || null,
    p_notes: params.notes || null,
  });

  if (error) {
    return {
      ok: false,
      verdict: "INVALID",
      can_check_in: false,
      error: formatCheckInDatabaseError(error),
      reason: error.message,
    };
  }

  return data as GateCheckinResult;
}
