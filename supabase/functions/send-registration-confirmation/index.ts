import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface RequestPayload {
  registrationId: string;
  registrationType: "visitor" | "esports";
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
    const fromEmail = Deno.env.get("SUPERNOVA_FROM_EMAIL") ?? "Supernova 3.0 <noreply@supernova.nationalcollege.edu.in>";

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
      (registrationType !== "visitor" && registrationType !== "esports") ||
      typeof isResend !== "boolean"
    ) {
      return new Response(JSON.stringify({ error: "Invalid request payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const table = registrationType === "visitor" ? "visitor_registrations" : "registrations";

    const { data: record, error: fetchErr } = await adminClient
      .from(table)
      .select("*")
      .eq("id", registrationId)
      .single();

    if (fetchErr || !record) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    const recipientName = escapeHtml(String(record.full_name || record.team_name || "Participant"));
    const regRef = escapeHtml(String(record.registration_code || record.reference_code || record.id.slice(0, 8).toUpperCase()));
    const regTypeLabel = escapeHtml(registrationType === "visitor" ? "Visitor" : "Esports");

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

    if (!resendApiKey) {
      await adminClient
        .from(table)
        .update({ email_status: "failed", email_sending_started_at: null, email_error: "RESEND_API_KEY secret not configured" })
        .eq("id", registrationId);

      return new Response(JSON.stringify({ error: "Email provider not configured (RESEND_API_KEY missing)" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #FAF9F4; color: #191936; padding: 32px; border: 2px solid #191936; border-radius: 16px;">
        <h1 style="margin: 0 0 8px; font-size: 24px; color: #1719C9;">SUPERNOVA 3.0 — Registration Confirmed</h1>
        <p style="margin: 0 0 20px; font-size: 14px; color: #52527A;">20–21 November 2026 · The National College, Basavanagudi, Bengaluru</p>
        <p>Hello <strong>${recipientName}</strong>,</p>
        <p>Your <strong>${regTypeLabel}</strong> registration for Supernova 3.0 has been <strong>CONFIRMED</strong>.</p>
        <div style="background: #FFFFFF; border: 1px solid #EAEAF2; border-radius: 12px; padding: 16px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Registration Reference:</strong> ${regRef}</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> Confirmed</p>
          <p style="margin: 4px 0;"><strong>Event Dates:</strong> 20–21 November 2026</p>
          <p style="margin: 4px 0;"><strong>Venue:</strong> The National College, Basavanagudi, Bengaluru – 04</p>
        </div>
        <p style="font-size: 13px; color: #52527A;">Please present your registration reference at the campus check-in desk.</p>
      </div>
    `;

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
        subject: `Supernova 3.0 Registration Confirmed (${regRef})`,
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
      metadata: { registration_type: registrationType, sent_at: sentAt },
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
