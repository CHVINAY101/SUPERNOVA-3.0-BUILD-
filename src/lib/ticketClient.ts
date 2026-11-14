import { supabase } from "./supabase";
import { parseSecureQrPayload } from "./ticketing";
import type {
  GateVerificationResult,
  PublicTicketLookupResult,
  TicketCategory,
  TicketRecord,
} from "@/types/database";

export interface VisitorTicketSubmitPayload {
  fullName: string;
  email: string;
  phone: string;
  institution: string;
  visitorCategory: string;
  studentClass?: string | null;
  studentId?: string | null;
  designation?: string | null;
  esportsInterest?: boolean;
  preferredGame?: string | null;
  esportsIntent?: string | null;
  inGameId?: string | null;
  teamName?: string | null;
  competitionNotes?: string | null;
  daysAttending?: string;
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
 * Submits a visitor registration, confirms it immediately, and issues its unique
 * cryptographic ticket when the ticketing RPC is deployed.
 * Falls back cleanly to submit_visitor_registration_v2 / submit_visitor_registration
 * if the 20261115 migration has not yet been applied in Supabase.
 */
export async function submitVisitorAndIssueTicket(
  payload: VisitorTicketSubmitPayload
): Promise<VisitorTicketSubmitResult> {
  const rpcArgs = {
    p_full_name: payload.fullName.trim(),
    p_email: payload.email.trim().toLowerCase(),
    p_phone: payload.phone.trim(),
    p_institution: payload.institution.trim(),
    p_visitor_category: payload.visitorCategory,
    p_student_class: payload.studentClass || null,
    p_student_id: payload.studentId || null,
    p_designation: payload.designation || null,
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

  // 1. Primary unified RPC returning registration_ref + authoritative ticket + qr_token
  const { data: ticketRpcData, error: ticketRpcErr } = await supabase.rpc(
    "submit_visitor_and_issue_ticket",
    rpcArgs
  );

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
  const { data: v2Data, error: v2Error } = await supabase.rpc(
    "submit_visitor_registration_v2",
    rpcArgs
  );

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
  if (payload.visitorCategory === "Student") {
    fallbackCat =
      payload.studentClass?.includes("PUC") || payload.studentClass?.includes("Degree")
        ? "College student"
        : "School student";
  } else if (payload.visitorCategory === "Faculty / Staff") {
    fallbackCat = "Teacher or educator";
  }

  const { data: v1Data, error: v1Error } = await supabase.rpc("submit_visitor_registration", {
    p_full_name: payload.fullName.trim(),
    p_email: payload.email.trim().toLowerCase(),
    p_phone: payload.phone.trim(),
    p_institution: payload.institution.trim(),
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
 * reference + registered email + 10-digit phone number.
 */
export async function lookupPublicTicket(params: {
  reference: string;
  email: string;
  phone: string;
}): Promise<PublicTicketLookupResult> {
  const { data, error } = await supabase.rpc("lookup_public_ticket", {
    p_reference: params.reference.trim(),
    p_email: params.email.trim().toLowerCase(),
    p_phone: params.phone.trim(),
  });

  if (error) {
    if (isMissingRpcError(error)) {
      return {
        ok: false,
        status: "error",
        error:
          "Public ticket lookup RPC is not deployed in Supabase yet. Apply migration 20261115000001_tickets_and_gate_verification.sql to enable instant pass lookup.",
      };
    }
    return { ok: false, status: "error", error: error.message };
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
export async function verifyGateTicket(rawInput: string): Promise<GateVerificationResult> {
  const parsed = parseSecureQrPayload(rawInput);
  const queryArg = parsed.ticketRef || (parsed.isTokenOnly ? "" : rawInput.trim());
  const tokenArg = parsed.qrToken;

  const { data, error } = await supabase.rpc("verify_gate_ticket", {
    p_query: queryArg,
    p_qr_token: tokenArg,
  });

  if (error) {
    return {
      ok: false,
      verdict: "INVALID",
      can_check_in: false,
      error: isMissingRpcError(error)
        ? "Gate verification RPC (verify_gate_ticket) is not yet deployed in Supabase."
        : error.message,
      reason: error.message,
    };
  }

  return data as GateVerificationResult;
}

/**
 * Atomic single-use DB check-in using SELECT ... FOR UPDATE row lock.
 */
export async function checkinGateTicket(params: {
  ticketRef: string;
  qrToken?: string | null;
  eventDay?: string;
  wristbandCategory?: string | null;
  wristbandCode?: string | null;
  notes?: string | null;
}): Promise<GateVerificationResult & { duplicate?: boolean }> {
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
      error: error.message,
      reason: error.message,
    };
  }

  return data as GateVerificationResult & { duplicate?: boolean };
}
