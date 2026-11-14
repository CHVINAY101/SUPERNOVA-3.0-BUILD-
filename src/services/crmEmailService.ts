import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { CrmEmail, CrmEmailStatus } from "@/types/database";
import {
  EMAIL_DELIVERY_ENABLED,
  EMAIL_UNAVAILABLE_MESSAGE,
  classifyEdgeFunctionError,
  containsHeaderInjection,
  evaluateProviderDelivery,
  redactSensitiveText,
  validateEmailList,
  validateRecipientEmail,
  type EmailAttachmentInput,
} from "@/lib/emailPayload";

export interface SendCrmEmailParams {
  recipient: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  idempotencyKey?: string;
  registrationRef?: string;
  registrationType?: string;
  attachments?: EmailAttachmentInput[];
}

export interface EmailDeliveryStatus {
  ok: boolean;
  configured: boolean;
  unavailable: boolean;
  status: "unavailable" | "configured";
  senderEmail: string;
  message: string;
  error?: string;
  httpStatus?: number;
}

export interface RecipientSuggestion {
  email: string;
  name: string;
  type: "visitor" | "esports" | "participation";
  ref?: string;
}

const LOCAL_CRM_CACHE_KEY = "supernova_crm_emails_cache";

function getLocalCrmEmails(): CrmEmail[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_CRM_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCrmEmail(email: CrmEmail) {
  if (typeof window === "undefined") return;
  try {
    const existing = getLocalCrmEmails();
    const updated = [email, ...existing.filter((e) => e.id !== email.id)].slice(0, 100);
    localStorage.setItem(LOCAL_CRM_CACHE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }
}

async function getAdminInvokeHeaders(): Promise<Record<string, string>> {
  const apiKey = (
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ""
  ).trim();
  const headers: Record<string, string> = {};
  if (apiKey) headers["apikey"] = apiKey;
  try {
    const { data } = await supabase.auth.getSession();
    let session = data?.session ?? null;
    if (session?.expires_at && session.expires_at * 1000 - Date.now() < 60_000) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.data?.session) session = refreshed.data.session;
    }
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  } catch {
    // fallback to supabase-js default auth header
  }
  return headers;
}

async function extractEdgeFunctionError(error: any, data: any): Promise<{ message: string; status: number }> {
  const ctx = error?.context;
  const httpStatus = typeof ctx?.status === "number" ? ctx.status : undefined;
  let bodyError: string | undefined = typeof data?.error === "string" ? data.error : undefined;
  let bodyCode: string | undefined;

  if (ctx && typeof ctx.json === "function") {
    try {
      const cloned = typeof ctx.clone === "function" ? ctx.clone() : ctx;
      const body = await cloned.json();
      if (typeof body?.error === "string") bodyError = body.error;
      else if (typeof body?.message === "string") bodyError = body.message;
      if (typeof body?.code === "string") bodyCode = body.code;
    } catch {
      // ignore body parse issues
    }
  }

  const isFetchErr =
    error instanceof FunctionsFetchError ||
    error?.name === "FunctionsFetchError" ||
    String(error?.message || "").includes("Failed to send a request to the Edge Function");
  const isRelayErr = error instanceof FunctionsRelayError || error?.name === "FunctionsRelayError";
  const isHttpErr = error instanceof FunctionsHttpError || error?.name === "FunctionsHttpError";

  let probeStatus: number | undefined;
  let probeCode: string | undefined;
  if (isFetchErr) {
    try {
      const baseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
      if (baseUrl) {
        const res = await fetch(`${baseUrl}/functions/v1/send-crm-email`, { method: "GET" });
        probeStatus = res.status;
        const j = await res.json().catch(() => null);
        if (typeof j?.code === "string") probeCode = j.code;
      }
    } catch {
      // ignore probe failure
    }
  }

  const classified = classifyEdgeFunctionError({
    errorName: isFetchErr
      ? "FunctionsFetchError"
      : isRelayErr
      ? "FunctionsRelayError"
      : isHttpErr
      ? "FunctionsHttpError"
      : error?.name,
    errorMessage: error?.message,
    httpStatus,
    bodyError,
    bodyCode,
    functionName: "send-crm-email",
    probeStatus,
    probeCode,
  });

  return { message: classified.message, status: classified.httpStatusCode };
}

/**
 * Reports current CRM email delivery availability without relying on Gmail OAuth.
 */
export async function getEmailDeliveryStatus(): Promise<EmailDeliveryStatus> {
  if (!EMAIL_DELIVERY_ENABLED) {
    return {
      ok: false,
      configured: false,
      unavailable: true,
      status: "unavailable",
      senderEmail: "animationthenationalcollege@gmail.com",
      message: EMAIL_UNAVAILABLE_MESSAGE,
      error: EMAIL_UNAVAILABLE_MESSAGE,
      httpStatus: 200,
    };
  }

  try {
    const invokeHeaders = await getAdminInvokeHeaders();
    const { data, error } = await supabase.functions.invoke("send-crm-email", {
      headers: invokeHeaders,
      body: { action: "status" },
    });

    if (error) {
      const extracted = await extractEdgeFunctionError(error, data);
      return {
        ok: false,
        configured: false,
        unavailable: true,
        status: "unavailable",
        senderEmail: "animationthenationalcollege@gmail.com",
        message: extracted.message,
        error: extracted.message,
        httpStatus: extracted.status,
      };
    }

    const unavailable = Boolean(data?.unavailable || data?.status === "unavailable" || !data?.configured);
    return {
      ok: Boolean(data?.ok) && !unavailable,
      configured: Boolean(data?.configured),
      unavailable,
      status: unavailable ? "unavailable" : "configured",
      senderEmail: data?.senderEmail || "animationthenationalcollege@gmail.com",
      error: data?.error ? redactSensitiveText(data.error) : unavailable ? EMAIL_UNAVAILABLE_MESSAGE : undefined,
      message: data?.message || EMAIL_UNAVAILABLE_MESSAGE,
      httpStatus: 200,
    };
  } catch (err: any) {
    const msg = redactSensitiveText(err?.message || EMAIL_UNAVAILABLE_MESSAGE);
    return {
      ok: false,
      configured: false,
      unavailable: true,
      status: "unavailable",
      senderEmail: "animationthenationalcollege@gmail.com",
      message: msg,
      error: msg,
      httpStatus: 500,
    };
  }
}

/**
 * Sends a CRM email via Supabase Edge Function when email delivery is enabled.
 * When disabled, safely returns "Email delivery unavailable" without fabricating a "sent" status.
 */
export async function sendCrmEmail(
  params: SendCrmEmailParams
): Promise<{
  ok: boolean;
  unavailable?: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
  skipped?: boolean;
}> {
  const recipientCheck = validateRecipientEmail(params.recipient);
  if (!recipientCheck.valid || !recipientCheck.normalizedEmail) {
    return { ok: false, error: recipientCheck.error || "Invalid recipient email address." };
  }

  const ccCheck = validateEmailList(params.cc);
  if (!ccCheck.valid) return { ok: false, error: `Invalid CC: ${ccCheck.error}` };

  const bccCheck = validateEmailList(params.bcc);
  if (!bccCheck.valid) return { ok: false, error: `Invalid BCC: ${bccCheck.error}` };

  const cleanSubject = params.subject.trim();
  if (!cleanSubject || containsHeaderInjection(cleanSubject)) {
    return { ok: false, error: "A valid subject is required." };
  }

  if (!params.bodyHtml || !params.bodyHtml.trim()) {
    return { ok: false, error: "Email message body is required." };
  }

  if (!EMAIL_DELIVERY_ENABLED) {
    return { ok: false, unavailable: true, error: EMAIL_UNAVAILABLE_MESSAGE };
  }

  const idempotencyKey =
    params.idempotencyKey ||
    `crm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const tempId = crypto.randomUUID ? crypto.randomUUID() : `temp-${Date.now()}`;
  const nowIso = new Date().toISOString();

  const pendingRecord: CrmEmail = {
    id: tempId,
    recipient: recipientCheck.normalizedEmail,
    cc: ccCheck.list.join(", ") || null,
    bcc: bccCheck.list.join(", ") || null,
    subject: cleanSubject,
    body_html: params.bodyHtml,
    sender_email: "animationthenationalcollege@gmail.com",
    status: "sending" as CrmEmailStatus,
    idempotency_key: idempotencyKey,
    created_at: nowIso,
  };
  saveLocalCrmEmail(pendingRecord);

  try {
    const invokeHeaders = await getAdminInvokeHeaders();
    if (!invokeHeaders["Authorization"]) {
      const authMsg = "Admin session missing or expired (HTTP 401). Please sign in again.";
      saveLocalCrmEmail({ ...pendingRecord, status: "failed", error_message: authMsg });
      return { ok: false, error: authMsg };
    }
    const { data, error } = await supabase.functions.invoke("send-crm-email", {
      headers: invokeHeaders,
      body: {
        action: "send",
        recipient: recipientCheck.normalizedEmail,
        cc: ccCheck.list.join(", ") || undefined,
        bcc: bccCheck.list.join(", ") || undefined,
        subject: cleanSubject,
        bodyHtml: params.bodyHtml,
        idempotencyKey,
        registrationRef: params.registrationRef,
        registrationType: params.registrationType,
        attachments: params.attachments,
      },
    });

    if (error) {
      const extracted = await extractEdgeFunctionError(error, data);
      saveLocalCrmEmail({
        ...pendingRecord,
        status: "failed",
        error_message: extracted.message,
      });
      return { ok: false, error: extracted.message };
    }

    if (data?.skipped) {
      saveLocalCrmEmail({
        ...pendingRecord,
        status: "sent",
        gmail_message_id: data.messageId,
        sent_at: data.sentAt || nowIso,
      });
      return { ok: true, messageId: data.messageId, skipped: true };
    }

    const evaluation = evaluateProviderDelivery({
      httpOk: true,
      statusCode: 200,
      okFlag: data?.ok,
      simulated: data?.simulated,
      unavailable: data?.unavailable || data?.status === "unavailable",
      messageId: data?.messageId,
      error: data?.error,
    });

    if (!evaluation.delivered) {
      const safeErr = redactSensitiveText(evaluation.error || EMAIL_UNAVAILABLE_MESSAGE);
      saveLocalCrmEmail({
        ...pendingRecord,
        status: "failed",
        error_message: safeErr,
      });
      return {
        ok: false,
        unavailable: evaluation.status === "unavailable",
        error: safeErr,
      };
    }

    saveLocalCrmEmail({
      ...pendingRecord,
      status: "sent",
      gmail_message_id: data.messageId,
      gmail_thread_id: data.threadId,
      sent_at: data.sentAt || new Date().toISOString(),
      error_message: null,
    });

    return {
      ok: true,
      messageId: data.messageId,
      threadId: data.threadId,
    };
  } catch (err: any) {
    const safeErr = redactSensitiveText(err?.message || "Unexpected exception during email dispatch");
    saveLocalCrmEmail({
      ...pendingRecord,
      status: "failed",
      error_message: safeErr,
    });
    return { ok: false, error: safeErr };
  }
}

/**
 * Loads CRM email history from Supabase crm_emails table, merged with local cache
 */
export async function getCrmEmailHistory(): Promise<CrmEmail[]> {
  try {
    const { data, error } = await supabase
      .from("crm_emails")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && Array.isArray(data)) {
      const local = getLocalCrmEmails();
      const dbKeys = new Set(data.map((d: any) => d.id || d.idempotency_key));
      const unsynced = local.filter(
        (l) => !dbKeys.has(l.id) && !dbKeys.has(l.idempotency_key || "")
      );
      return [...unsynced, ...data];
    }
  } catch {
    // Fall through to local cache
  }

  return getLocalCrmEmails();
}

/**
 * Fetches registrant emails from registrations, visitor_registrations, and participation_registrations
 */
export async function getSuggestedRecipients(): Promise<RecipientSuggestion[]> {
  const suggestions: RecipientSuggestion[] = [];
  const seen = new Set<string>();

  try {
    const { data: visitors } = await supabase
      .from("visitor_registrations")
      .select("email, full_name, registration_ref")
      .not("email", "is", null)
      .limit(60);

    if (visitors) {
      for (const v of visitors) {
        if (v.email && !seen.has(v.email.toLowerCase())) {
          seen.add(v.email.toLowerCase());
          suggestions.push({
            email: v.email.toLowerCase().trim(),
            name: v.full_name || "Visitor",
            type: "visitor",
            ref: v.registration_ref,
          });
        }
      }
    }

    const { data: esports } = await supabase
      .from("registrations")
      .select("email, captain_name, team_name, registration_ref")
      .not("email", "is", null)
      .limit(60);

    if (esports) {
      for (const e of esports) {
        if (e.email && !seen.has(e.email.toLowerCase())) {
          seen.add(e.email.toLowerCase());
          suggestions.push({
            email: e.email.toLowerCase().trim(),
            name: `${e.captain_name} (${e.team_name || "Esports"})`,
            type: "esports",
            ref: e.registration_ref,
          });
        }
      }
    }

    const { data: participants } = await supabase
      .from("participation_registrations")
      .select("email, full_name, registration_ref")
      .not("email", "is", null)
      .limit(60);

    if (participants) {
      for (const p of participants) {
        if (p.email && !seen.has(p.email.toLowerCase())) {
          seen.add(p.email.toLowerCase());
          suggestions.push({
            email: p.email.toLowerCase().trim(),
            name: p.full_name || "Participant",
            type: "participation",
            ref: p.registration_ref,
          });
        }
      }
    }
  } catch (err) {
    console.warn("Could not load suggested recipients:", err);
  }

  return suggestions;
}

export const CRM_EMAIL_TEMPLATES = [
  {
    id: "festival_schedule",
    name: "Festival Schedule & Entry Pass Advisory",
    subject: "Supernova 3.0 — Festival Schedule & Entry Guidelines",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #191936; background: #FAF9F4; padding: 28px; border: 2px solid #191936; border-radius: 16px;">
  <div style="border-bottom: 2px solid #191936; padding-bottom: 16px; margin-bottom: 20px;">
    <span style="font-size: 11px; font-weight: bold; letter-spacing: 0.15em; text-transform: uppercase; color: #4549D8;">THE NATIONAL COLLEGE · BASAVANAGUDI</span>
    <h1 style="font-size: 22px; font-weight: 800; margin: 6px 0 0; color: #191936;">SUPERNOVA 3.0 — Schedule &amp; Entry Advisory</h1>
  </div>
  <p>Dear Participant / Visitor,</p>
  <p>We are delighted to welcome you to <strong>Supernova 3.0</strong> on <strong>20–21 November 2026</strong> at The National College, Basavanagudi, Bengaluru.</p>
  <div style="background: #FFFFFF; border: 1.5px solid #191936; border-radius: 12px; padding: 16px; margin: 18px 0;">
    <h3 style="margin: 0 0 10px; font-size: 14px; text-transform: uppercase; color: #191936;">Important Event Timings</h3>
    <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8;">
      <li><strong>Gates &amp; Check-in Open:</strong> 08:30 AM</li>
      <li><strong>Inauguration Ceremony:</strong> 09:30 AM (College Auditorium)</li>
      <li><strong>Exhibition &amp; Animation Zones:</strong> 10:00 AM – 05:30 PM</li>
      <li><strong>Esports Arena Tournament Matches:</strong> 10:30 AM onwards</li>
    </ul>
  </div>
  <p style="font-size: 13px; line-height: 1.6;">Please keep your registration reference code handy on your mobile phone for fast check-in at the entrance desk.</p>
  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #EAEAF2; font-size: 12px; color: #64748B;">
    <p style="margin: 0;">Department of Animation &amp; Computer Science · Supernova 3.0 Organising Committee</p>
    <p style="margin: 4px 0 0;">animationthenationalcollege@gmail.com · Basavanagudi, Bengaluru - 560004</p>
  </div>
</div>`,
  },
  {
    id: "esports_match",
    name: "Esports Arena — Fixtures & Reporting Timings",
    subject: "Supernova 3.0 Esports Arena — Match Briefing & Check-in",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #F8FAFC; background: #0B1120; padding: 28px; border: 2px solid #38BDF8; border-radius: 16px;">
  <div style="border-bottom: 1px solid #1E293B; padding-bottom: 16px; margin-bottom: 20px;">
    <span style="font-size: 11px; font-weight: bold; letter-spacing: 0.15em; text-transform: uppercase; color: #38BDF8;">SUPERNOVA 3.0 ESPORTS ARENA</span>
    <h1 style="font-size: 22px; font-weight: 800; margin: 6px 0 0; color: #FFFFFF;">Tournament Fixtures &amp; Check-in Call</h1>
  </div>
  <p>Attention Team Captain and Squad Members,</p>
  <p>Your team is registered for the Supernova 3.0 Esports Tournament. Please review the mandatory pre-match requirements:</p>
  <div style="background: #020617; border: 1.5px solid #1E293B; border-radius: 12px; padding: 16px; margin: 18px 0;">
    <h3 style="margin: 0 0 10px; font-size: 13px; text-transform: uppercase; color: #D5F542;">Tournament Check-in Rules</h3>
    <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8; color: #CBD5E1;">
      <li>All registered team members must report <strong>45 minutes prior</strong> to match time at the Esports Desk.</li>
      <li>Carry valid student college ID cards for in-person verification.</li>
      <li>PC players (VALORANT) may bring personal peripherals (mouse, keyboard, headset).</li>
      <li>Mobile players (BGMI / Free Fire) must use standard handheld mobile devices only. Emulators, iPads, and triggers are strictly prohibited.</li>
    </ul>
  </div>
  <p style="font-size: 13px; color: #94A3B8;">Brackets and live match streams will be updated on the tournament control screen.</p>
  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1E293B; font-size: 12px; color: #64748B;">
    <p style="margin: 0; color: #94A3B8;">Supernova 3.0 Esports Operations · Department of Animation</p>
    <p style="margin: 4px 0 0; color: #64748B;">animationthenationalcollege@gmail.com</p>
  </div>
</div>`,
  },
  {
    id: "general_inquiry",
    name: "General Inquiry / Official Response",
    subject: "Supernova 3.0 — Response to Your Festival Inquiry",
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #191936; background: #FAF9F4; padding: 28px; border: 2px solid #191936; border-radius: 16px;">
  <div style="border-bottom: 2px solid #191936; padding-bottom: 16px; margin-bottom: 20px;">
    <span style="font-size: 11px; font-weight: bold; letter-spacing: 0.15em; text-transform: uppercase; color: #4549D8;">THE NATIONAL COLLEGE · BASAVANAGUDI</span>
    <h1 style="font-size: 20px; font-weight: 800; margin: 6px 0 0; color: #191936;">Supernova 3.0 Festival Support</h1>
  </div>
  <p>Dear Student / Participant,</p>
  <p>Thank you for contacting the Supernova 3.0 organising team.</p>
  <p style="line-height: 1.6;">[Write your message here...]</p>
  <p>If you have further questions regarding zones, workshops, or parking arrangements, please reply to this email or visit our helpdesk on campus.</p>
  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #EAEAF2; font-size: 12px; color: #64748B;">
    <p style="margin: 0; font-weight: bold; color: #191936;">Supernova 3.0 Coordination Desk</p>
    <p style="margin: 2px 0 0;">animationthenationalcollege@gmail.com</p>
    <p style="margin: 2px 0 0;">The National College, Basavanagudi, Bengaluru</p>
  </div>
</div>`,
  },
];
