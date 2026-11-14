import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-region",
  "Access-Control-Max-Age": "86400",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function redactSecrets(text: string): string {
  return String(text || "")
    .replace(/Bearer\s+[A-Za-z0-9._\-/+]+/gi, "Bearer [REDACTED]")
    .replace(/(ya29\.[A-Za-z0-9_\-]+)/g, "[REDACTED_OAUTH_TOKEN]")
    .replace(/(1\/\/[A-Za-z0-9_\-]+)/g, "[REDACTED_REFRESH_TOKEN]")
    .replace(/(re_[A-Za-z0-9_]+)/g, "[REDACTED_RESEND_KEY]");
}

function hasHeaderInjection(val: string): boolean {
  return /[\r\n\0]/.test(val);
}

function validateEmailAddress(raw: string): string | null {
  const clean = String(raw || "").trim();
  if (!clean || clean.length > 254 || hasHeaderInjection(clean) || !EMAIL_REGEX.test(clean)) {
    return null;
  }
  return clean;
}

function chunkBase64(b64: string, width = 76): string {
  const clean = b64.replace(/\s+/g, "");
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += width) {
    out.push(clean.slice(i, i + width));
  }
  return out.join("\r\n");
}

function encodeUtf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64UrlEncode(str: string): string {
  return encodeUtf8ToBase64(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeSubject(subject: string): string {
  return `=?utf-8?B?${encodeUtf8ToBase64(subject)}?=`;
}

interface AttachmentInput {
  filename: string;
  contentType?: string;
  base64Content: string;
}

interface RequestPayload {
  registrationId?: string;
  registrationRef?: string;
  registrationType: "visitor" | "esports" | "participation";
  isResend?: boolean;
  recipientEmail?: string;
  attachments?: AttachmentInput[];
}

function stripDataUrlPrefix(b64: string): string {
  const idx = b64.indexOf("base64,");
  return idx >= 0 ? b64.slice(idx + 7) : b64;
}

function buildMimeWithAttachments(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments: AttachmentInput[];
}): string {
  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeSubject(params.subject)}`,
    `MIME-Version: 1.0`,
  ];

  const encodedHtml = chunkBase64(encodeUtf8ToBase64(params.html));

  if (!params.attachments.length) {
    headers.push(`Content-Type: text/html; charset=utf-8`, `Content-Transfer-Encoding: base64`);
    return `${headers.join("\r\n")}\r\n\r\n${encodedHtml}`;
  }

  const boundary = `----=_Supernova_Confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [
    `--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodedHtml}`,
  ];

  for (const att of params.attachments) {
    const safeName = att.filename.replace(/["\r\n\\/]/g, "_").slice(0, 120) || "ticket.pdf";
    const cType = att.contentType || "application/pdf";
    const rawB64 = stripDataUrlPrefix(att.base64Content);
    parts.push(
      `--${boundary}\r\nContent-Type: ${cType}; name="${safeName}"\r\nContent-Disposition: attachment; filename="${safeName}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${chunkBase64(rawB64)}`
    );
  }

  parts.push(`--${boundary}--`);
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

function resolveProvider(env: {
  explicitProvider: string;
  hasGmailCreds: boolean;
  hasResendKey: boolean;
}): "gmail" | "resend" {
  const explicit = env.explicitProvider.trim().toLowerCase();
  if (explicit === "gmail") return "gmail";
  if (explicit === "resend") return "resend";
  if (env.hasGmailCreds) return "gmail";
  if (env.hasResendKey) return "resend";
  // Default to Gmail (project's primary configured provider); never silently substitute Resend
  return "gmail";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    const explicitProvider = Deno.env.get("EMAIL_PROVIDER") ?? "";
    const hasGmailCreds = Boolean(
      Deno.env.get("GMAIL_CLIENT_ID") &&
        Deno.env.get("GMAIL_CLIENT_SECRET") &&
        Deno.env.get("GMAIL_REFRESH_TOKEN")
    );
    const hasResendKey = Boolean(Deno.env.get("RESEND_API_KEY"));
    const provider = resolveProvider({ explicitProvider, hasGmailCreds, hasResendKey });
    const configured = provider === "gmail" ? hasGmailCreds : hasResendKey;
    return jsonResponse({
      ok: true,
      function: "send-registration-confirmation",
      provider,
      configured,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: `Method ${req.method} not allowed` }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { ok: false, error: "Supabase runtime environment keys missing in Edge Function." },
        503
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    let body: RequestPayload;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON request body" }, 400);
    }

    const {
      registrationId,
      registrationRef,
      registrationType,
      isResend = false,
      recipientEmail: claimedRecipientEmail,
      attachments = [],
    } = body || ({} as RequestPayload);

    if (
      (!registrationId && !registrationRef) ||
      (registrationId && (typeof registrationId !== "string" || !UUID_REGEX.test(registrationId))) ||
      !["visitor", "esports", "participation"].includes(registrationType) ||
      typeof isResend !== "boolean"
    ) {
      return jsonResponse({ ok: false, error: "Invalid confirmation email payload" }, 400);
    }

    // Check caller authentication & RBAC permission
    const authHeader = req.headers.get("Authorization") ?? "";
    let actorId: string | null = null;
    let actorEmail: string | null = null;
    let isAuthorizedAdmin = false;

    if (authHeader && supabaseAnonKey) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        actorId = user.id;
        actorEmail = user.email ?? null;
        const requiredPerm = isResend ? "email_centre:resend" : "email_centre:send";
        const { data: hasPerm, error: permErr } = await userClient.rpc("has_crm_permission", {
          p_permission: requiredPerm,
        });
        if (!permErr) {
          isAuthorizedAdmin = Boolean(hasPerm);
        } else {
          // Compatibility fallback if 20261113 RBAC migration hasn't been applied yet
          const { data: isAdm } = await userClient.rpc("is_admin");
          isAuthorizedAdmin = Boolean(isAdm);
        }
      }
    }

    // Only admins may resend or trigger participation/esports emails; public visitors may only trigger initial visitor pass immediately after submitting
    const isPublicVisitorInitial =
      !isAuthorizedAdmin && registrationType === "visitor" && !isResend && actorId === null;

    if (!isAuthorizedAdmin && !isPublicVisitorInitial) {
      return new Response(
        JSON.stringify({ ok: false, error: "Forbidden: email_centre permission required" }),
        { status: actorId ? 403 : 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const table =
      registrationType === "visitor"
        ? "visitor_registrations"
        : registrationType === "esports"
        ? "registrations"
        : "participation_registrations";

    let record: any = null;
    let playersList: any[] = [];
    let gameTitle = "Esports Tournament";

    if (registrationType === "esports") {
      let query = adminClient.from("registrations").select(`
        *,
        games (id, title, team_size),
        players (id, player_name, gamer_tag)
      `);
      query = registrationId ? query.eq("id", registrationId) : query.eq("registration_ref", registrationRef!);
      const { data, error } = await query.maybeSingle();
      if (error || !data) {
        return new Response(JSON.stringify({ ok: false, error: "Registration not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      record = data;
      playersList = data.players || [];
      gameTitle = data.games?.title || "Esports Tournament";
    } else {
      let query = adminClient.from(table).select("*");
      query = registrationId ? query.eq("id", registrationId) : query.eq("registration_ref", registrationRef!);
      const { data, error } = await query.maybeSingle();
      if (error || !data) {
        return new Response(JSON.stringify({ ok: false, error: "Registration not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      record = data;
    }

    const targetId: string = record.id;

    // Extra anti-abuse guard for unauthenticated initial visitor confirmation triggers
    if (isPublicVisitorInitial) {
      if (
        claimedRecipientEmail &&
        String(claimedRecipientEmail).trim().toLowerCase() !== String(record.email || "").trim().toLowerCase()
      ) {
        return new Response(JSON.stringify({ ok: false, error: "Visitor email verification mismatch" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const submittedAtMs = record.submitted_at ? new Date(record.submitted_at).getTime() : Date.now();
      if (Date.now() - submittedAtMs > 30 * 60 * 1000) {
        return new Response(
          JSON.stringify({ ok: false, error: "Public confirmation window expired; an admin must resend this pass." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (record.archived_at) {
      return new Response(JSON.stringify({ ok: false, error: "Cannot send email for an archived registration" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (record.status !== "confirmed") {
      return new Response(
        JSON.stringify({ ok: false, error: "Registration must be confirmed before sending confirmation email" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isResend && record.email_status === "sent") {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "Already sent" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRecipient = validateEmailAddress(record.email || record.captain_email || "");
    if (!validRecipient) {
      await adminClient
        .from(table)
        .update({ email_status: "failed", email_error: "Missing or invalid recipient email" })
        .eq("id", targetId);

      return jsonResponse({ ok: false, error: "Invalid recipient email address" }, 400);
    }

    // Resolve configured provider BEFORE claiming email_status = "sending" so missing secrets preserve the existing record state cleanly
    const explicitProvider = Deno.env.get("EMAIL_PROVIDER") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const fromEmail = Deno.env.get("SUPERNOVA_FROM_EMAIL") ?? "Supernova 3.0 <animationthenationalcollege@gmail.com>";
    const gmailClientId = Deno.env.get("GMAIL_CLIENT_ID") ?? "";
    const gmailClientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";
    const gmailRefreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN") ?? "";
    const gmailSenderEmail = Deno.env.get("GMAIL_SENDER_EMAIL") ?? "animationthenationalcollege@gmail.com";

    const activeProvider = resolveProvider({
      explicitProvider,
      hasGmailCreds: Boolean(gmailClientId && gmailClientSecret && gmailRefreshToken),
      hasResendKey: Boolean(resendApiKey),
    });

    if (activeProvider === "gmail" && (!gmailClientId || !gmailClientSecret || !gmailRefreshToken)) {
      const missingSecrets = [
        !gmailClientId ? "GMAIL_CLIENT_ID" : null,
        !gmailClientSecret ? "GMAIL_CLIENT_SECRET" : null,
        !gmailRefreshToken ? "GMAIL_REFRESH_TOKEN" : null,
      ].filter(Boolean);
      return jsonResponse(
        {
          ok: false,
          provider: "gmail",
          missingSecrets,
          error: `Gmail OAuth secrets (${missingSecrets.join(", ")}) are not configured on Supabase Edge Functions. Registration record preserved.`,
        },
        503
      );
    }

    if (activeProvider === "resend" && !resendApiKey) {
      return jsonResponse(
        {
          ok: false,
          provider: "resend",
          missingSecrets: ["RESEND_API_KEY"],
          error: "RESEND_API_KEY is not configured in Supabase Edge Function secrets (simulated delivery disabled).",
        },
        503
      );
    }

    // Atomic claim to prevent duplicate concurrent dispatches
    const nowIso = new Date().toISOString();
    const staleThresholdIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const previousEmailStatus: string = record.email_status || "not_sent";

    const statusFilter = isResend
      ? `email_status.is.null,email_status.neq.sending,email_sending_started_at.lt.${staleThresholdIso}`
      : `email_status.is.null,and(email_status.neq.sending,email_status.neq.sent),and(email_status.eq.sending,email_sending_started_at.lt.${staleThresholdIso})`;

    let claimResult = await adminClient
      .from(table)
      .update({ email_status: "sending", email_sending_started_at: nowIso, email_error: null })
      .eq("id", targetId)
      .is("archived_at", null)
      .eq("status", "confirmed")
      .or(statusFilter)
      .select("id")
      .maybeSingle();

    // Compatibility fallback if email_sending_started_at column hasn't been added to this table yet
    if (claimResult.error && (claimResult.error.code === "42703" || String(claimResult.error.message || "").includes("email_sending_started_at"))) {
      const fallbackFilter = isResend
        ? "email_status.is.null,email_status.neq.sending"
        : "email_status.is.null,and(email_status.neq.sending,email_status.neq.sent)";
      claimResult = await adminClient
        .from(table)
        .update({ email_status: "sending", email_error: null })
        .eq("id", targetId)
        .is("archived_at", null)
        .eq("status", "confirmed")
        .or(fallbackFilter)
        .select("id")
        .maybeSingle();
    }

    if (claimResult.error || !claimResult.data) {
      return jsonResponse(
        {
          ok: false,
          error: claimResult.error
            ? redactSecrets(claimResult.error.message)
            : "Email is already being processed or was already sent.",
        },
        claimResult.error ? 500 : 409
      );
    }

    const recipientName = escapeHtml(String(record.full_name || record.captain_name || record.team_name || "Participant"));
    const regRefRaw = String(record.registration_ref || record.registration_code || record.id.slice(0, 8).toUpperCase());
    const regRef = escapeHtml(regRefRaw);

    let specificHtml = "";
    let emailSubject = `Supernova 3.0 Registration Confirmed (${regRefRaw})`;

    if (registrationType === "visitor") {
      emailSubject = `Supernova 3.0 Visitor Pass Confirmed (${regRefRaw})`;
      specificHtml = `
        <div style="background: #FFFFFF; border: 2px dashed #4549D8; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
          <span style="font-family: monospace; font-size: 11px; text-transform: uppercase; color: #4549D8; font-weight: bold; letter-spacing: 1px;">Official Visitor Ticket Pass</span>
          <div style="font-family: monospace; font-size: 28px; font-weight: 900; color: #0F172A; margin: 10px 0; letter-spacing: 2px;">${regRef}</div>
          <p style="margin: 4px 0; font-size: 13px; color: #475569;">Attendee: <strong>${recipientName}</strong></p>
          <p style="margin: 4px 0; font-size: 13px; color: #475569;">Institution: <strong>${escapeHtml(record.institution || "Independent")}</strong></p>
          <p style="margin: 4px 0; font-size: 13px; color: #475569;">Dates: <strong>${escapeHtml(record.days_attending || "20 & 21 November 2026")}</strong></p>
        </div>
      `;
    } else if (registrationType === "participation") {
      emailSubject = `Supernova 3.0 Project Approved & Entry Pass (${regRefRaw})`;
      const projTitle = escapeHtml(record.project_title || "Project Exhibit");
      const area = escapeHtml(record.participation_area || "Science & Innovation");
      specificHtml = `
        <div style="background: #FFFFFF; border: 2px solid #10B981; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <div style="display: inline-block; background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; font-weight: bold; text-transform: uppercase;">Project Approved & Confirmed</div>
          <h3 style="margin: 12px 0 4px; font-size: 18px; color: #0F172A;">${projTitle}</h3>
          <p style="margin: 2px 0 16px; font-size: 13px; color: #475569;">Exhibition Zone: <strong>${area}</strong> · Institution: <strong>${escapeHtml(record.institution || "Independent")}</strong></p>
          <div style="background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px; padding: 12px 16px; margin-top: 12px;">
            <p style="margin: 2px 0; font-size: 12px; color: #64748B; font-family: monospace;">PROJECT REFERENCE: <strong style="color: #0F172A; font-size: 14px;">${regRef}</strong></p>
            <p style="margin: 2px 0; font-size: 12px; color: #64748B; font-family: monospace;">VISITOR ENTRY PASS: <strong style="color: #4549D8; font-size: 14px;">${escapeHtml(record.visitor_ticket_ref || regRefRaw)}</strong></p>
          </div>
        </div>
      `;
    } else {
      emailSubject = `Supernova 3.0 Esports Squad Confirmed — ${String(record.team_name || "Team")} (${regRefRaw})`;
      const teamName = escapeHtml(record.team_name || "Team");
      const playersHtml = playersList
        .map(
          (p, idx) => `
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 8px 12px; font-size: 13px; color: #0F172A;">${idx + 1}. <strong>${escapeHtml(p.player_name)}</strong></td>
          <td style="padding: 8px 12px; font-size: 13px; color: #64748B; font-family: monospace;">${escapeHtml(p.gamer_tag || "—")}</td>
          <td style="padding: 8px 12px; font-size: 12px; color: #4549D8; font-family: monospace; font-weight: bold;">${escapeHtml(p.visitor_ticket_ref || `${regRefRaw}-P${idx + 1}`)}</td>
        </tr>
      `
        )
        .join("");

      specificHtml = `
        <div style="background: #FFFFFF; border: 2px solid #8B5CF6; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <span style="font-family: monospace; font-size: 11px; text-transform: uppercase; color: #8B5CF6; font-weight: bold; letter-spacing: 1px;">Tournament Squad Approved</span>
          <h3 style="margin: 8px 0 2px; font-size: 20px; color: #0F172A;">${teamName}</h3>
          <p style="margin: 2px 0 16px; font-size: 13px; color: #475569;">Game Title: <strong>${escapeHtml(gameTitle)}</strong> · Captain: <strong>${recipientName}</strong></p>
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; margin-top: 14px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #F1F5F9; font-size: 11px; font-family: monospace; color: #475569; text-transform: uppercase;">
                  <th style="padding: 8px 12px;">Player Name</th>
                  <th style="padding: 8px 12px;">Gamer Tag</th>
                  <th style="padding: 8px 12px;">Visitor Ticket</th>
                </tr>
              </thead>
              <tbody>
                ${playersHtml || '<tr><td colspan="3" style="padding: 8px 12px; font-size: 12px; color: #94A3B8;">Roster recorded</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 24px; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
        <div style="max-width: 620px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background: #0B1120; padding: 32px 28px; text-align: center; border-bottom: 4px solid #4549D8;">
            <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: 1px; color: #FFFFFF; text-transform: uppercase;">SUPERNOVA 3.0</h1>
            <p style="margin: 8px 0 0; font-size: 13px; font-family: monospace; color: #38BDF8; font-weight: 600; letter-spacing: 0.5px;">20–21 NOVEMBER 2026 · THE NATIONAL COLLEGE, BENGALURU</p>
          </div>
          <div style="padding: 32px 28px;">
            <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 1.6;">Hello <strong>${recipientName}</strong>,</p>
            <p style="margin: 0 0 20px; font-size: 15px; color: #334155; line-height: 1.6;">
              Your registration for <strong>SUPERNOVA 3.0</strong> has been officially <strong>CONFIRMED</strong>. Your entry details and campus credentials are provided below:
            </p>
            ${specificHtml}
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px; margin: 24px 0;">
              <h4 style="margin: 0 0 10px; font-size: 12px; font-family: monospace; text-transform: uppercase; color: #475569; letter-spacing: 0.5px;">Event Location & Schedule</h4>
              <p style="margin: 4px 0; font-size: 13px; color: #1E293B;"><strong>Dates:</strong> 20–21 November 2026</p>
              <p style="margin: 4px 0; font-size: 13px; color: #1E293B;"><strong>Venue:</strong> The National College, Basavanagudi, Bengaluru – 560004</p>
              <p style="margin: 4px 0; font-size: 13px; color: #1E293B;"><strong>Reporting Desk:</strong> Main Auditorium Gates / Registration Counter</p>
            </div>
            <p style="margin: 20px 0 0; font-size: 13px; color: #64748B; line-height: 1.5;">
              Please present this confirmation email, the attached official PDF ticket (when included), or your reference code (<strong>${regRef}</strong>) at the reception desk.
            </p>
          </div>
          <div style="background: #F1F5F9; padding: 20px 28px; text-align: center; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B;">
            <p style="margin: 0 0 4px;">Organized by <strong>The Department of Animation</strong>, The National College, Basavanagudi.</p>
            <p style="margin: 0;">Inquiries: <a href="mailto:animationthenationalcollege@gmail.com" style="color: #4549D8; text-decoration: none;">animationthenationalcollege@gmail.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Sanitize attachments (up to 3 PDF files)
    const cleanAttachments: AttachmentInput[] = Array.isArray(attachments)
      ? attachments
          .filter((a) => a && typeof a.filename === "string" && typeof a.base64Content === "string" && a.base64Content.length > 0)
          .slice(0, 3)
      : [];

    const idempotencyKey = isResend
      ? `supernova-resend-${registrationType}-${targetId}-${Date.now()}`
      : `supernova-confirm-${registrationType}-${targetId}`;

    let providerMessageId = "";
    let providerThreadId: string | null = null;

    const recordFailure = async (status: number, reason: string) => {
      const safeReason = redactSecrets(reason).slice(0, 500);
      // On resend of an already-sent ticket, preserve "sent" status if provider failed; otherwise mark "failed"
      const nextStatus = isResend && previousEmailStatus === "sent" ? "sent" : "failed";
      const failUpd = await adminClient
        .from(table)
        .update({ email_status: nextStatus, email_sending_started_at: null, email_error: safeReason })
        .eq("id", targetId);
      if (failUpd.error && (failUpd.error.code === "42703" || String(failUpd.error.message || "").includes("email_sending_started_at"))) {
        await adminClient
          .from(table)
          .update({ email_status: nextStatus, email_error: safeReason })
          .eq("id", targetId);
      }

      try {
        await adminClient.from("crm_emails").insert({
          recipient: validRecipient,
          subject: emailSubject,
          body_html: html,
          sender_email: activeProvider === "gmail" ? gmailSenderEmail : fromEmail,
          sent_by: actorId,
          sent_by_email: actorEmail,
          status: "failed",
          error_message: safeReason,
          idempotency_key: idempotencyKey,
          provider: activeProvider,
          registration_ref: regRefRaw,
          registration_type: registrationType,
          attachment_names: cleanAttachments.map((a) => a.filename),
        });
      } catch {
        // Non-blocking if crm_emails migration pending
      }

      return jsonResponse({ ok: false, error: safeReason, provider: activeProvider }, status);
    };

    if (activeProvider === "gmail") {

      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: gmailClientId,
          client_secret: gmailClientSecret,
          refresh_token: gmailRefreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!tokenResp.ok) {
        const errData = await tokenResp.json().catch(() => ({}));
        return await recordFailure(502, `Gmail OAuth token refresh failed: ${errData.error_description || tokenResp.statusText}`);
      }

      const { access_token: accessToken } = await tokenResp.json();
      const rawMime = buildMimeWithAttachments({
        from: `Supernova 3.0 <${gmailSenderEmail}>`,
        to: validRecipient,
        subject: emailSubject,
        html,
        attachments: cleanAttachments,
      });

      const sendResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: base64UrlEncode(rawMime) }),
      });

      if (!sendResp.ok) {
        const errText = await sendResp.text();
        return await recordFailure(502, `Gmail API delivery failed (${sendResp.status}): ${errText}`);
      }

      const gmailResult = await sendResp.json();
      if (!gmailResult?.id) {
        return await recordFailure(502, "Gmail API did not return a message ID.");
      }
      providerMessageId = gmailResult.id;
      providerThreadId = gmailResult.threadId ?? null;
    } else {
      // Configured provider is Resend (strictly required — NO simulation fallback)
      if (!resendApiKey) {
        return await recordFailure(
          503,
          "Email delivery failed: RESEND_API_KEY is not configured in Supabase Edge Function secrets (simulated delivery disabled)."
        );
      }

      const resendPayload: Record<string, unknown> = {
        from: fromEmail,
        to: [validRecipient],
        subject: emailSubject,
        html,
      };
      if (cleanAttachments.length > 0) {
        resendPayload.attachments = cleanAttachments.map((a) => ({
          filename: a.filename,
          content: stripDataUrlPrefix(a.base64Content),
        }));
      }

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(resendPayload),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        return await recordFailure(502, `Resend API delivery failed (${emailRes.status}): ${errText}`);
      }

      const resendResult = await emailRes.json();
      if (!resendResult?.id) {
        return await recordFailure(502, "Resend API did not return a message ID.");
      }
      providerMessageId = resendResult.id;
    }

    const sentAt = new Date().toISOString();
    const sentUpd = await adminClient
      .from(table)
      .update({ email_status: "sent", email_sent_at: sentAt, email_sending_started_at: null, email_error: null })
      .eq("id", targetId);
    if (sentUpd.error && (sentUpd.error.code === "42703" || String(sentUpd.error.message || "").includes("email_sending_started_at"))) {
      await adminClient
        .from(table)
        .update({ email_status: "sent", email_sent_at: sentAt, email_error: null })
        .eq("id", targetId);
    }

    try {
      await adminClient.from("crm_emails").insert({
        recipient: validRecipient,
        subject: emailSubject,
        body_html: html,
        sender_email: activeProvider === "gmail" ? gmailSenderEmail : fromEmail,
        sent_by: actorId,
        sent_by_email: actorEmail,
        status: "sent",
        gmail_message_id: providerMessageId,
        gmail_thread_id: providerThreadId,
        idempotency_key: idempotencyKey,
        provider: activeProvider,
        registration_ref: regRefRaw,
        registration_type: registrationType,
        attachment_names: cleanAttachments.map((a) => a.filename),
        sent_at: sentAt,
      });
    } catch {
      // Non-blocking
    }

    try {
      await adminClient.from("audit_logs").insert({
        actor_id: actorId,
        action: isResend ? "resend_confirmation_email" : "send_confirmation_email",
        entity_type: table,
        entity_id: targetId,
        metadata: {
          registration_type: registrationType,
          registration_ref: regRefRaw,
          sent_at: sentAt,
          provider: activeProvider,
          message_id: providerMessageId,
          recipient: validRecipient,
          attachments: cleanAttachments.map((a) => a.filename),
        },
      });
    } catch {
      // Non-blocking
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent_at: sentAt,
        messageId: providerMessageId,
        threadId: providerThreadId,
        provider: activeProvider,
        recipient: validRecipient,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: redactSecrets(String(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
