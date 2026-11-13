import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface RequestPayload {
  registrationId: string;
  registrationType: "visitor" | "esports" | "participation";
  isResend?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const fromEmail = Deno.env.get("SUPERNOVA_FROM_EMAIL") ?? "Supernova 3.0 <animationthenationalcollege@gmail.com>";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin, error: roleErr } = await userClient.rpc("is_admin");
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestPayload = await req.json();
    const { registrationId, registrationType, isResend = false } = body;

    if (
      typeof registrationId !== "string" ||
      !UUID_REGEX.test(registrationId) ||
      !["visitor", "esports", "participation"].includes(registrationType) ||
      typeof isResend !== "boolean"
    ) {
      return new Response(JSON.stringify({ error: "Invalid request payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
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
      const { data, error } = await adminClient
        .from("registrations")
        .select(`
          *,
          games (
            id,
            title,
            team_size
          ),
          players (
            id,
            player_name,
            gamer_tag
          )
        `)
        .eq("id", registrationId)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: "Registration not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      record = data;
      playersList = data.players || [];
      gameTitle = data.games?.title || "Esports Tournament";
    } else {
      const { data, error } = await adminClient
        .from(table)
        .select("*")
        .eq("id", registrationId)
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ error: "Registration not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      record = data;
    }

    if (record.archived_at) {
      return new Response(JSON.stringify({ error: "Cannot send email for an archived registration" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (record.status !== "confirmed") {
      return new Response(JSON.stringify({ error: "Registration must be confirmed before sending confirmation email" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isResend && record.email_status === "sent") {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "Already sent" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomic claim: prevent concurrent sends; allow recovery if 'sending' is older than 5 minutes
    const nowIso = new Date().toISOString();
    const staleThresholdIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    let claimQuery = adminClient
      .from(table)
      .update({ email_status: "sending", email_sending_started_at: nowIso, email_error: null })
      .eq("id", registrationId)
      .is("archived_at", null)
      .eq("status", "confirmed")
      .or(`email_status.neq.sending,email_sending_started_at.lt.${staleThresholdIso}`);

    if (!isResend) {
      claimQuery = claimQuery.neq("email_status", "sent");
    }

    const { data: claimed, error: claimErr } = await claimQuery.select("id").maybeSingle();
    if (claimErr || !claimed) {
      return new Response(JSON.stringify({ error: "Email is already being processed or already sent" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipientEmail: string = record.email || record.captain_email || "";
    const recipientName = escapeHtml(String(record.full_name || record.captain_name || record.team_name || "Participant"));
    const regRef = escapeHtml(String(record.registration_ref || record.registration_code || record.id.slice(0, 8).toUpperCase()));

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      await adminClient
        .from(table)
        .update({ email_status: "failed", email_sending_started_at: null, email_error: "Missing or invalid recipient email" })
        .eq("id", registrationId);

      return new Response(JSON.stringify({ error: "Invalid recipient email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format specific content based on registration type
    let specificHtml = "";
    let emailSubject = `Supernova 3.0 Registration Confirmed (${regRef})`;

    if (registrationType === "visitor") {
      emailSubject = `Supernova 3.0 Visitor Pass Confirmed (${regRef})`;
      specificHtml = `
        <div style="background: #FFFFFF; border: 2px dashed #4549D8; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
          <span style="font-family: monospace; font-size: 11px; text-transform: uppercase; color: #4549D8; font-weight: bold; letter-spacing: 1px;">Official Visitor Ticket Pass</span>
          <div style="font-family: monospace; font-size: 28px; font-weight: 900; color: #0F172A; margin: 10px 0; letter-spacing: 2px;">${regRef}</div>
          <p style="margin: 4px 0; font-size: 13px; color: #475569;">Attendee: <strong>${recipientName}</strong></p>
          <p style="margin: 4px 0; font-size: 13px; color: #475569;">Institution: <strong>${escapeHtml(record.institution || "Independent")}</strong></p>
          <p style="margin: 4px 0; font-size: 13px; color: #475569;">Days: <strong>${escapeHtml(record.days_attending || "20 & 21 November 2026")}</strong></p>
        </div>
      `;
    } else if (registrationType === "participation") {
      emailSubject = `Supernova 3.0 Project Approved & Entry Pass (${regRef})`;
      const projTitle = escapeHtml(record.project_title || "Project Exhibit");
      const area = escapeHtml(record.participation_area || "Science & Innovation");
      specificHtml = `
        <div style="background: #FFFFFF; border: 2px solid #10B981; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <div style="display: inline-block; background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; font-weight: bold; text-transform: uppercase;">Project Approved & Confirmed</div>
          <h3 style="margin: 12px 0 4px; font-size: 18px; color: #0F172A;">${projTitle}</h3>
          <p style="margin: 2px 0 16px; font-size: 13px; color: #475569;">Exhibition Zone: <strong>${area}</strong> · Institution: <strong>${escapeHtml(record.institution || "Independent")}</strong></p>
          
          <div style="background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 8px; padding: 12px 16px; margin-top: 12px;">
            <p style="margin: 2px 0; font-size: 12px; color: #64748B; font-family: monospace;">PROJECT REFERENCE: <strong style="color: #0F172A; font-size: 14px;">${regRef}</strong></p>
            <p style="margin: 2px 0; font-size: 12px; color: #64748B; font-family: monospace;">VISITOR ENTRY PASS: <strong style="color: #4549D8; font-size: 14px;">${escapeHtml(record.visitor_ticket_ref || regRef)}</strong></p>
          </div>
        </div>
      `;
    } else if (registrationType === "esports") {
      emailSubject = `Supernova 3.0 Esports Squad Confirmed — ${escapeHtml(record.team_name || "Team")} (${regRef})`;
      const teamName = escapeHtml(record.team_name || "Team");
      const playersHtml = playersList.map((p, idx) => `
        <tr style="border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 8px 12px; font-size: 13px; color: #0F172A;">${idx + 1}. <strong>${escapeHtml(p.player_name)}</strong></td>
          <td style="padding: 8px 12px; font-size: 13px; color: #64748B; font-family: monospace;">${escapeHtml(p.gamer_tag || "—")}</td>
          <td style="padding: 8px 12px; font-size: 12px; color: #4549D8; font-family: monospace; font-weight: bold;">${regRef}-P${idx + 1}</td>
        </tr>
      `).join("");

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
          <!-- Header Banner -->
          <div style="background: #0B1120; padding: 32px 28px; text-align: center; border-bottom: 4px solid #4549D8;">
            <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: 1px; color: #FFFFFF; text-transform: uppercase;">SUPERNOVA 3.0</h1>
            <p style="margin: 8px 0 0; font-size: 13px; font-family: monospace; color: #38BDF8; font-weight: 600; letter-spacing: 0.5px;">20–21 NOVEMBER 2026 · THE NATIONAL COLLEGE, BENGALURU</p>
          </div>

          <!-- Body Content -->
          <div style="padding: 32px 28px;">
            <p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 1.6;">
              Hello <strong>${recipientName}</strong>,
            </p>
            <p style="margin: 0 0 20px; font-size: 15px; color: #334155; line-height: 1.6;">
              Your registration for <strong>SUPERNOVA 3.0</strong> has been officially <strong>CONFIRMED</strong>. Your entry details and campus credentials are provided below:
            </p>

            ${specificHtml}

            <!-- Event Logistics Box -->
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px; margin: 24px 0;">
              <h4 style="margin: 0 0 10px; font-size: 12px; font-family: monospace; text-transform: uppercase; color: #475569; letter-spacing: 0.5px;">Event Location & Schedule</h4>
              <p style="margin: 4px 0; font-size: 13px; color: #1E293B;"><strong>Dates:</strong> 20–21 November 2026</p>
              <p style="margin: 4px 0; font-size: 13px; color: #1E293B;"><strong>Venue:</strong> The National College, Basavanagudi, Bengaluru – 560004</p>
              <p style="margin: 4px 0; font-size: 13px; color: #1E293B;"><strong>Reporting Desk:</strong> Main Auditorium Gates / Registration Counter</p>
            </div>

            <p style="margin: 20px 0 0; font-size: 13px; color: #64748B; line-height: 1.5;">
              Please present this confirmation email or your reference code (<strong>${regRef}</strong>) at the reception desk to collect your physical event badge.
            </p>
          </div>

          <!-- Footer -->
          <div style="background: #F1F5F9; padding: 20px 28px; text-align: center; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B;">
            <p style="margin: 0 0 4px;">Organized by <strong>The Department of Animation</strong>, The National College, Basavanagudi.</p>
            <p style="margin: 0;">Inquiries: <a href="mailto:animationthenationalcollege@gmail.com" style="color: #4549D8; text-decoration: none;">animationthenationalcollege@gmail.com</a></p>
          </div>
        </div>
      </body>
      </html>
    `;

    if (!resendApiKey) {
      // Simulate successful sending for environment without external Resend key
      const sentAt = new Date().toISOString();
      await adminClient
        .from(table)
        .update({ email_status: "sent", email_sent_at: sentAt, email_sending_started_at: null, email_error: null })
        .eq("id", registrationId);

      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        action: isResend ? "resend_confirmation_email" : "send_confirmation_email",
        table_name: table,
        record_id: registrationId,
        metadata: { registration_type: registrationType, sent_at: sentAt, simulated: true, recipient: recipientEmail },
      });

      return new Response(JSON.stringify({ ok: true, sent_at: sentAt, simulated: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const idempotencyKey = isResend
      ? `supernova-resend-${registrationType}-${registrationId}-${Date.now()}`
      : `supernova-confirm-${registrationType}-${registrationId}`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientEmail],
        subject: emailSubject,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      await adminClient
        .from(table)
        .update({ email_status: "failed", email_sending_started_at: null, email_error: errText.slice(0, 500) })
        .eq("id", registrationId);

      return new Response(JSON.stringify({ error: "Email delivery failed", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sentAt = new Date().toISOString();
    await adminClient
      .from(table)
      .update({ email_status: "sent", email_sent_at: sentAt, email_sending_started_at: null, email_error: null })
      .eq("id", registrationId);

    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      action: isResend ? "resend_confirmation_email" : "send_confirmation_email",
      table_name: table,
      record_id: registrationId,
      metadata: { registration_type: registrationType, sent_at: sentAt, recipient: recipientEmail },
    });

    return new Response(JSON.stringify({ ok: true, sent_at: sentAt }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
