import { supabase } from "@/lib/supabase";
import type { CrmEmail, CrmEmailStatus } from "@/types/database";

export interface SendCrmEmailParams {
  recipient: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  idempotencyKey?: string;
}

export interface GmailConnectionStatus {
  ok: boolean;
  configured: boolean;
  senderEmail: string;
  gmailAccount?: string;
  messagesTotal?: number;
  missingSecrets?: string[];
  error?: string;
  message?: string;
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

/**
 * Checks live Gmail API connectivity & OAuth token validity via Supabase Edge Function
 */
export async function checkGmailConnectionStatus(): Promise<GmailConnectionStatus> {
  try {
    const { data, error } = await supabase.functions.invoke("send-crm-email", {
      body: { action: "status" },
    });

    if (error) {
      return {
        ok: false,
        configured: false,
        senderEmail: "animationthenationalcollege@gmail.com",
        error: error.message || "Failed to reach send-crm-email Edge Function",
      };
    }

    return {
      ok: Boolean(data?.ok),
      configured: Boolean(data?.configured),
      senderEmail: data?.senderEmail || "animationthenationalcollege@gmail.com",
      gmailAccount: data?.gmailAccount,
      messagesTotal: data?.messagesTotal,
      missingSecrets: data?.missingSecrets,
      error: data?.error,
      message: data?.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      configured: false,
      senderEmail: "animationthenationalcollege@gmail.com",
      error: err?.message || "Edge Function invocation exception",
    };
  }
}

/**
 * Sends a CRM email using the official college Gmail account via Supabase Edge Function
 */
export async function sendCrmEmail(
  params: SendCrmEmailParams
): Promise<{ ok: boolean; messageId?: string; threadId?: string; error?: string; skipped?: boolean }> {
  const idempotencyKey =
    params.idempotencyKey ||
    `crm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const tempId = crypto.randomUUID ? crypto.randomUUID() : `temp-${Date.now()}`;
  const nowIso = new Date().toISOString();

  // Optimistic entry in local cache
  const pendingRecord: CrmEmail = {
    id: tempId,
    recipient: params.recipient.trim(),
    cc: params.cc?.trim() || null,
    bcc: params.bcc?.trim() || null,
    subject: params.subject.trim(),
    body_html: params.bodyHtml,
    sender_email: "animationthenationalcollege@gmail.com",
    status: "sending" as CrmEmailStatus,
    idempotency_key: idempotencyKey,
    created_at: nowIso,
  };
  saveLocalCrmEmail(pendingRecord);

  try {
    const { data, error } = await supabase.functions.invoke("send-crm-email", {
      body: {
        action: "send",
        recipient: params.recipient.trim(),
        cc: params.cc?.trim(),
        bcc: params.bcc?.trim(),
        subject: params.subject.trim(),
        bodyHtml: params.bodyHtml,
        idempotencyKey,
      },
    });

    if (error) {
      const failedRecord: CrmEmail = {
        ...pendingRecord,
        status: "failed",
        error_message: error.message || "Edge function failed",
      };
      saveLocalCrmEmail(failedRecord);
      return { ok: false, error: error.message || "Failed to invoke Gmail sending service" };
    }

    if (data?.ok === false || data?.error) {
      const failedRecord: CrmEmail = {
        ...pendingRecord,
        status: "failed",
        error_message: data?.error || "Gmail API returned delivery error",
      };
      saveLocalCrmEmail(failedRecord);
      return { ok: false, error: data.error };
    }

    // Success
    const successRecord: CrmEmail = {
      ...pendingRecord,
      status: "sent",
      gmail_message_id: data.messageId,
      gmail_thread_id: data.threadId,
      sent_at: data.sentAt || new Date().toISOString(),
      error_message: null,
    };
    saveLocalCrmEmail(successRecord);

    return {
      ok: true,
      messageId: data.messageId,
      threadId: data.threadId,
      skipped: data.skipped,
    };
  } catch (err: any) {
    const failedRecord: CrmEmail = {
      ...pendingRecord,
      status: "failed",
      error_message: err.message || "Unexpected exception during email dispatch",
    };
    saveLocalCrmEmail(failedRecord);
    return { ok: false, error: err.message || "Unexpected dispatch error" };
  }
}

/**
 * Loads CRM email history from Supabase crm_emails table, with graceful fallback to local cache
 */
export async function getCrmEmailHistory(): Promise<CrmEmail[]> {
  try {
    const { data, error } = await supabase
      .from("crm_emails")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && Array.isArray(data) && data.length > 0) {
      // Merge with any local unsynced records
      const local = getLocalCrmEmails();
      const dbIds = new Set(data.map((d: any) => d.id || d.idempotency_key));
      const unsynced = local.filter(
        (l) => !dbIds.has(l.id) && !dbIds.has(l.idempotency_key || "")
      );
      return [...unsynced, ...data];
    }
  } catch {
    // Table not migrated yet; fall through to local cache
  }

  return getLocalCrmEmails();
}

/**
 * Fetches registrant emails from registrations, visitor_registrations, and participation_registrations
 * to populate the autocomplete / quick-pick recipient selector in the CRM.
 */
export async function getSuggestedRecipients(): Promise<RecipientSuggestion[]> {
  const suggestions: RecipientSuggestion[] = [];
  const seen = new Set<string>();

  try {
    // 1. Visitor Registrations
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

    // 2. Esports Captains
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

    // 3. Project Participation Registrations
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

/**
 * Pre-defined official college email templates
 */
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
    bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #191936; background: #0B1120; color: #F8FAFC; padding: 28px; border: 2px solid #38BDF8; border-radius: 16px;">
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
