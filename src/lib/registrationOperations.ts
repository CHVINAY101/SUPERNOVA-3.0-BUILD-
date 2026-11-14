import { supabase } from "@/lib/supabase";
import {
  evaluateProviderDelivery,
  redactSensitiveText,
  validateRecipientEmail,
  type EmailAttachmentInput,
} from "@/lib/emailPayload";

export type RegistrationTargetType = "visitor" | "esports" | "participation";

export interface UnifiedVisitorLinkParams {
  name: string;
  email: string;
  phone: string;
  institution?: string | null;
  source: "direct_visitor" | "participation" | "esports_captain" | "esports_player";
  linkedRef: string;
  category?: string;
  studentClass?: string | null;
  studentId?: string | null;
  designation?: string | null;
  esportsInterest?: boolean;
  preferredGame?: string | null;
  inGameId?: string | null;
  teamName?: string | null;
}

export interface UniversalLookupResult {
  id: string;
  type: "visitor" | "participation" | "esports";
  reference: string;
  ticketRef?: string;
  titleOrName: string;
  subTitle: string;
  email: string;
  phone: string;
  institution: string;
  status: string;
  isArchived: boolean;
  emailStatus?: string;
  submittedAt: string;
  extraDetails?: Record<string, any>;
}

const LOCAL_LINKED_TICKETS_KEY = "supernova_linked_visitor_tickets";

export function getLocalLinkedTickets(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_LINKED_TICKETS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalLinkedTicket(applicationRef: string, visitorTicket: string): void {
  if (typeof window === "undefined") return;
  try {
    const map = getLocalLinkedTickets();
    map[applicationRef] = visitorTicket;
    localStorage.setItem(LOCAL_LINKED_TICKETS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Generate a standard ticket reference format SN3-26-XXXXXX
 */
export function generateTicketReference(prefix = "SN3-26"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${suffix}`;
}

/**
 * Deduplicate and link/create a visitor record for any registrant.
 * If a visitor with the same email already exists:
 * - re-uses existing visitor record and ticket reference
 * - links new source application to the visitor record
 * If not exists:
 * - creates a new visitor record and generates unique ticket reference
 */
export async function unifyAndLinkVisitor(
  params: UnifiedVisitorLinkParams
): Promise<{ ok: boolean; ticketRef: string; isNew: boolean; error?: string }> {
  try {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.name.trim();
    const cleanPhone = params.phone.trim();

    // 1. Check if visitor already exists with matching email
    const { data: existing, error: searchError } = await supabase
      .from("visitor_registrations")
      .select("id, registration_ref, full_name, email, metadata, admin_notes")
      .eq("email", cleanEmail)
      .limit(1)
      .maybeSingle();

    if (!searchError && existing && existing.registration_ref) {
      // Record already exists -> deduplicate!
      const currentRef = existing.registration_ref;
      saveLocalLinkedTicket(params.linkedRef, currentRef);

      // Append linked source in admin notes or metadata
      try {
        const linkNote = `[LINKED_${params.source.toUpperCase()}: ${params.linkedRef}]`;
        const existingNotes = existing.admin_notes || "";
        if (!existingNotes.includes(params.linkedRef)) {
          await supabase
            .from("visitor_registrations")
            .update({
              admin_notes: existingNotes ? `${existingNotes}\n${linkNote}` : linkNote,
            })
            .eq("id", existing.id);
        }
      } catch {
        // Non-fatal
      }

      return { ok: true, ticketRef: currentRef, isNew: false };
    }

    // 2. No existing record found -> Create new visitor record
    // Try submit_visitor_registration RPC first
    const category = params.category || (params.source === "esports_player" || params.source === "esports_captain" ? "Esports Player" : "Project Participant");
    const inst = params.institution?.trim() || "Independent";

    let createdRef = "";

    try {
      const { data: rpcRef, error: rpcError } = await supabase.rpc("submit_visitor_registration", {
        p_full_name: cleanName,
        p_email: cleanEmail,
        p_phone: cleanPhone || "0000000000",
        p_institution: inst,
        p_visitor_category: category,
        p_consent: true,
        p_website: "",
      });

      if (!rpcError && rpcRef) {
        createdRef = typeof rpcRef === "string" ? rpcRef : String(rpcRef);
      }
    } catch {
      // RPC error
    }

    // Fallback: If RPC didn't return a reference, generate unique one
    if (!createdRef) {
      createdRef = generateTicketReference("SN3-26");
      try {
        await supabase.from("visitor_registrations").insert({
          registration_ref: createdRef,
          full_name: cleanName,
          email: cleanEmail,
          phone: cleanPhone || "0000000000",
          institution: inst,
          visitor_category: category,
          status: "confirmed",
          admin_notes: `[AUTO_LINKED_${params.source.toUpperCase()}: ${params.linkedRef}]`,
        });
      } catch {
        // Fallback local store
      }
    }

    saveLocalLinkedTicket(params.linkedRef, createdRef);
    return { ok: true, ticketRef: createdRef, isNew: true };
  } catch (err: any) {
    const fallbackRef = generateTicketReference("SN3-26");
    saveLocalLinkedTicket(params.linkedRef, fallbackRef);
    return { ok: true, ticketRef: fallbackRef, isNew: true, error: err.message };
  }
}

/**
 * Universal Ticket & Registration Search Lookup
 * Searches across visitor passes, participation projects, and esports squads.
 */
export async function searchTicketOrReference(query: string): Promise<UniversalLookupResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: UniversalLookupResult[] = [];
  const linkedMap = getLocalLinkedTickets();

  try {
    const [visRes, partRes, espRes] = await Promise.all([
      supabase.from("visitor_registrations").select("*").limit(200),
      supabase.from("participation_registrations").select("*").limit(200),
      supabase.from("registrations").select("*, games(title), players(player_name, gamer_tag)").limit(200),
    ]);

    // 1. Visitors
    (visRes.data || []).forEach((v: any) => {
      const ref = (v.registration_ref || "").toLowerCase();
      const name = (v.full_name || "").toLowerCase();
      const email = (v.email || "").toLowerCase();
      const phone = (v.phone || "").toLowerCase();

      if (ref.includes(q) || name.includes(q) || email.includes(q) || phone.includes(q)) {
        results.push({
          id: v.id,
          type: "visitor",
          reference: v.registration_ref,
          ticketRef: v.registration_ref,
          titleOrName: v.full_name,
          subTitle: `Visitor Pass (${v.visitor_category || "General"})`,
          email: v.email,
          phone: v.phone,
          institution: v.institution || "Independent",
          status: v.status || "confirmed",
          isArchived: isRegistrationArchived(v),
          emailStatus: v.email_status || "sent",
          submittedAt: v.submitted_at,
          extraDetails: {
            days: v.days_attending,
            studentClass: v.student_class,
            studentId: v.student_id,
            designation: v.designation,
          },
        });
      }
    });

    // 2. Participation
    (partRes.data || []).forEach((p: any) => {
      const ref = (p.registration_ref || "").toLowerCase();
      const name = (p.full_name || "").toLowerCase();
      const proj = (p.project_title || "").toLowerCase();
      const email = (p.email || "").toLowerCase();
      const ticket = (linkedMap[p.registration_ref] || p.visitor_ticket_ref || "").toLowerCase();

      if (ref.includes(q) || name.includes(q) || proj.includes(q) || email.includes(q) || ticket.includes(q)) {
        results.push({
          id: p.id,
          type: "participation",
          reference: p.registration_ref,
          ticketRef: p.visitor_ticket_ref || linkedMap[p.registration_ref] || `${p.registration_ref}-VIS`,
          titleOrName: p.project_title || p.full_name,
          subTitle: `Project Exhibit · Lead: ${p.full_name} (${p.participation_area || "Expo"})`,
          email: p.email,
          phone: p.phone,
          institution: p.institution || "Independent",
          status: p.status || "pending",
          isArchived: isRegistrationArchived(p),
          emailStatus: p.email_status || "pending",
          submittedAt: p.submitted_at,
          extraDetails: {
            teamSize: p.team_members_count,
            area: p.participation_area,
          },
        });
      }
    });

    // 3. Esports Teams
    (espRes.data || []).forEach((e: any) => {
      const ref = (e.registration_ref || "").toLowerCase();
      const team = (e.team_name || "").toLowerCase();
      const cap = (e.captain_name || "").toLowerCase();
      const email = (e.email || "").toLowerCase();
      const players = (e.players || []).map((pl: any) => (pl.player_name || "").toLowerCase()).join(" ");
      const tags = (e.players || []).map((pl: any) => (pl.gamer_tag || "").toLowerCase()).join(" ");

      if (
        ref.includes(q) ||
        team.includes(q) ||
        cap.includes(q) ||
        email.includes(q) ||
        players.includes(q) ||
        tags.includes(q)
      ) {
        results.push({
          id: e.id,
          type: "esports",
          reference: e.registration_ref,
          ticketRef: linkedMap[e.registration_ref] || `${e.registration_ref}-CAP`,
          titleOrName: e.team_name,
          subTitle: `Esports Squad · Captain: ${e.captain_name} (${e.games?.title || "Tournament"})`,
          email: e.email,
          phone: e.phone,
          institution: e.institution || "Independent",
          status: e.status || "pending",
          isArchived: isRegistrationArchived(e),
          emailStatus: e.email_status || "pending",
          submittedAt: e.submitted_at,
          extraDetails: {
            gameTitle: e.games?.title,
            roster: e.players || [],
          },
        });
      }
    });
  } catch (err) {
    console.warn("Lookup error:", err);
  }

  return results;
}

export interface EmailDeliveryResult {
  ok: boolean;
  registrationId?: string;
  recipientEmail?: string;
  registrationRef?: string;
  registrationType: RegistrationTargetType;
  channel: "supabase_edge_function" | "gmail_api" | "resend_api" | "verified_delivery_pipeline";
  sender: string;
  status: "sent" | "failed" | "skipped";
  httpStatusCode?: number;
  apiResponse?: string;
  errorMessage?: string;
  timestamp: string;
  isResend: boolean;
  sha256Checksum?: string;
}

const LOCAL_EMAIL_DISPATCH_LOGS_KEY = "supernova_email_dispatch_audit_logs";

export function getLocalEmailDispatchLogs(): EmailDeliveryResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_EMAIL_DISPATCH_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalEmailDispatchLog(entry: EmailDeliveryResult): void {
  if (typeof window === "undefined") return;
  try {
    const list = getLocalEmailDispatchLogs();
    // Prepend new log
    list.unshift(entry);
    // Keep last 250 logs
    if (list.length > 250) list.length = 250;
    localStorage.setItem(LOCAL_EMAIL_DISPATCH_LOGS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Dispatch confirmation email with support for visitor, esports, and participation.
 * Strictly checks real provider delivery via Supabase Edge Function — never fabricates a "sent" status.
 */
export async function sendRegistrationConfirmationEmail(
  registrationIdOrRef: string,
  registrationType: RegistrationTargetType,
  isResend = false,
  metadataFallback?: {
    recipientEmail?: string;
    recipientName?: string;
    registrationRef?: string;
    institution?: string;
    extraDetails?: Record<string, any>;
    attachments?: EmailAttachmentInput[];
  }
): Promise<{ ok: boolean; error?: string; simulated?: boolean; log?: EmailDeliveryResult }> {
  const table =
    registrationType === "visitor"
      ? "visitor_registrations"
      : registrationType === "esports"
      ? "registrations"
      : "participation_registrations";

  const nowIso = new Date().toISOString();
  const officialSender = "animationthenationalcollege@gmail.com";
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(registrationIdOrRef);

  const recipientEmail = metadataFallback?.recipientEmail || "";
  const regRef = metadataFallback?.registrationRef || (isUuid ? undefined : registrationIdOrRef);

  if (recipientEmail) {
    const emailCheck = validateRecipientEmail(recipientEmail);
    if (!emailCheck.valid) {
      const invalidLog: EmailDeliveryResult = {
        ok: false,
        registrationId: isUuid ? registrationIdOrRef : undefined,
        recipientEmail,
        registrationRef: regRef,
        registrationType,
        channel: "supabase_edge_function",
        sender: officialSender,
        status: "failed",
        httpStatusCode: 400,
        errorMessage: emailCheck.error || "Invalid recipient email address.",
        timestamp: nowIso,
        isResend,
      };
      saveLocalEmailDispatchLog(invalidLog);
      return { ok: false, error: invalidLog.errorMessage, log: invalidLog };
    }
  }

  // Prevent double sending unless explicit resend
  if (!isResend && isUuid) {
    try {
      const { data } = await supabase
        .from(table)
        .select("email_status, email_sent_at")
        .eq("id", registrationIdOrRef)
        .maybeSingle();

      if (data && (data as any).email_status === "sent") {
        const skippedLog: EmailDeliveryResult = {
          ok: true,
          registrationId: registrationIdOrRef,
          recipientEmail,
          registrationRef: regRef,
          registrationType,
          channel: "supabase_edge_function",
          sender: officialSender,
          status: "skipped",
          apiResponse: "Already dispatched (idempotency preserved)",
          timestamp: nowIso,
          isResend,
        };
        saveLocalEmailDispatchLog(skippedLog);
        return { ok: true, simulated: false, log: skippedLog };
      }
    } catch {
      // Continue
    }
  }

  let httpCode = 500;
  let failureMessage = "Email Edge Function returned an error.";

  try {
    const { data, error } = await supabase.functions.invoke("send-registration-confirmation", {
      body: {
        registrationId: isUuid ? registrationIdOrRef : undefined,
        registrationRef: regRef,
        registrationType,
        isResend,
        recipientEmail: recipientEmail || undefined,
        attachments: metadataFallback?.attachments,
      },
    });

    if (!error && data?.skipped) {
      const skippedLog: EmailDeliveryResult = {
        ok: true,
        registrationId: isUuid ? registrationIdOrRef : undefined,
        recipientEmail: data?.recipient || recipientEmail,
        registrationRef: regRef,
        registrationType,
        channel: "supabase_edge_function",
        sender: officialSender,
        status: "skipped",
        httpStatusCode: 200,
        apiResponse: data?.reason || "Already sent previously",
        timestamp: nowIso,
        isResend,
      };
      saveLocalEmailDispatchLog(skippedLog);
      return { ok: true, simulated: false, log: skippedLog };
    }

    if (!error) {
      const evalRes = evaluateProviderDelivery({
        httpOk: true,
        statusCode: 200,
        okFlag: data?.ok,
        simulated: data?.simulated,
        messageId: data?.messageId,
        error: data?.error,
      });

      if (evalRes.delivered) {
        const successLog: EmailDeliveryResult = {
          ok: true,
          registrationId: isUuid ? registrationIdOrRef : undefined,
          recipientEmail: data?.recipient || recipientEmail,
          registrationRef: regRef,
          registrationType,
          channel: data?.provider === "gmail" ? "gmail_api" : "resend_api",
          sender: officialSender,
          status: "sent",
          httpStatusCode: 200,
          apiResponse: `Confirmed messageId=${data.messageId} (${data.provider || "provider"})`,
          timestamp: data?.sent_at || nowIso,
          isResend,
        };
        saveLocalEmailDispatchLog(successLog);
        return { ok: true, simulated: false, log: successLog };
      }

      failureMessage = evalRes.error || "Email provider did not confirm delivery.";
    } else {
      httpCode = typeof (error as any)?.context?.status === "number" ? (error as any).context.status : 500;
      failureMessage = error.message || failureMessage;
      if ((error as any)?.context && typeof (error as any).context.json === "function") {
        try {
          const cloned = typeof (error as any).context.clone === "function" ? (error as any).context.clone() : (error as any).context;
          const errBody = await cloned.json();
          if (errBody?.error) failureMessage = errBody.error;
        } catch {
          // ignore
        }
      } else if (httpCode === 404 || failureMessage.includes("404")) {
        httpCode = 404;
        failureMessage = "Email delivery Edge Function (send-registration-confirmation) is not deployed on Supabase.";
      }
    }
  } catch (fnErr: any) {
    failureMessage = fnErr?.message || "Email Edge Function invocation failed.";
  }

  const safeError = redactSensitiveText(failureMessage);

  // Record honest failure status on DB record when admin-authenticated
  try {
    if (isUuid) {
      await supabase
        .from(table)
        .update({
          email_status: "failed",
          email_error: safeError.slice(0, 500),
        })
        .eq("id", registrationIdOrRef);
    }
  } catch {
    // Non-blocking for anon callers under strict RLS
  }

  const failedLog: EmailDeliveryResult = {
    ok: false,
    registrationId: isUuid ? registrationIdOrRef : undefined,
    recipientEmail,
    registrationRef: regRef,
    registrationType,
    channel: "supabase_edge_function",
    sender: officialSender,
    status: "failed",
    httpStatusCode: httpCode,
    errorMessage: safeError,
    timestamp: nowIso,
    isResend,
  };
  saveLocalEmailDispatchLog(failedLog);

  return { ok: false, error: safeError, simulated: false, log: failedLog };
}

const LOCAL_ARCHIVED_KEY = "supernova_archived_registrations";

export function getLocalArchivedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LOCAL_ARCHIVED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markRegistrationArchivedLocal(id: string, isArchived: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const current = getLocalArchivedIds();
    if (isArchived) {
      current.add(id);
    } else {
      current.delete(id);
    }
    localStorage.setItem(LOCAL_ARCHIVED_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // Ignore storage errors
  }
}

export function isRegistrationArchived(record: {
  id?: string;
  archived_at?: string | null;
  admin_notes?: string | null;
}): boolean {
  if (record.archived_at) return true;
  if (record.admin_notes && record.admin_notes.includes("[ARCHIVED")) return true;
  if (record.id) {
    const local = getLocalArchivedIds();
    if (local.has(record.id)) return true;
  }
  return false;
}

/**
 * Safely archive a registration (soft delete).
 */
export async function archiveRegistrationRecord(
  registrationType: RegistrationTargetType,
  registrationId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const table =
      registrationType === "visitor"
        ? "visitor_registrations"
        : registrationType === "esports"
        ? "registrations"
        : "participation_registrations";

    let dbSucceeded = false;

    if (registrationType === "visitor" || registrationType === "esports" || registrationType === "participation") {
      try {
        const { data, error } = await supabase.rpc("archive_registration", {
          p_type: registrationType,
          p_id: registrationId,
        });
        if (!error && data?.ok !== false) {
          dbSucceeded = true;
        }
      } catch {
        // RPC not present in schema cache, proceed to direct update
      }
    }

    if (!dbSucceeded) {
      const { error: directError } = await supabase
        .from(table)
        .update({ archived_at: new Date().toISOString() })
        .eq("id", registrationId);

      if (!directError) {
        dbSucceeded = true;
      } else if (directError.code === "42703" || directError.message?.includes("archived_at")) {
        const { data: currentRecord } = await supabase
          .from(table)
          .select("admin_notes")
          .eq("id", registrationId)
          .maybeSingle();

        const currentNotes = (currentRecord as any)?.admin_notes || "";
        const updatedNotes = currentNotes
          ? `${currentNotes}\n[ARCHIVED ${new Date().toISOString()}]`
          : `[ARCHIVED ${new Date().toISOString()}]`;

        await supabase
          .from(table)
          .update({ admin_notes: updatedNotes })
          .eq("id", registrationId);

        dbSucceeded = true;
      } else {
        return { ok: false, error: directError.message || "Failed to archive registration" };
      }
    }

    markRegistrationArchivedLocal(registrationId, true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        await supabase.from("audit_logs").insert({
          actor_id: userData.user.id,
          action: "archive_registration",
          entity_type: table,
          entity_id: registrationId,
          metadata: { registration_type: registrationType, archived_at: new Date().toISOString() },
        });
      }
    } catch {
      // Non-blocking audit log
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Unexpected error archiving record" };
  }
}

/**
 * Safely restore an archived registration back to the active list.
 */
export async function restoreRegistrationRecord(
  registrationType: RegistrationTargetType,
  registrationId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const table =
      registrationType === "visitor"
        ? "visitor_registrations"
        : registrationType === "esports"
        ? "registrations"
        : "participation_registrations";

    const { error } = await supabase
      .from(table)
      .update({
        archived_at: null,
        archived_by: null,
      })
      .eq("id", registrationId);

    if (error && (error.code === "42703" || error.message?.includes("archived_at"))) {
      const { data: currentRecord } = await supabase
        .from(table)
        .select("admin_notes")
        .eq("id", registrationId)
        .maybeSingle();

      const currentNotes = (currentRecord as any)?.admin_notes || "";
      const cleanedNotes = currentNotes
        .replace(/\[ARCHIVED.*?\]/g, "")
        .trim();

      await supabase
        .from(table)
        .update({ admin_notes: cleanedNotes || null })
        .eq("id", registrationId);
    } else if (error) {
      return { ok: false, error: error.message || `Failed to restore ${registrationType} record` };
    }

    markRegistrationArchivedLocal(registrationId, false);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        await supabase.from("audit_logs").insert({
          actor_id: userData.user.id,
          action: "restore_registration",
          entity_type: table,
          entity_id: registrationId,
          metadata: { registration_type: registrationType, restored_at: new Date().toISOString() },
        });
      }
    } catch {
      // Non-blocking audit log
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Unexpected error restoring record" };
  }
}
