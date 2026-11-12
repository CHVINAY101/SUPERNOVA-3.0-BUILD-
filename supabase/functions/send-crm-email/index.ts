import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeSubject(subject: string): string {
  const bytes = new TextEncoder().encode(subject);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?utf-8?B?${btoa(binary)}?=`;
}

interface SendEmailPayload {
  action?: "send" | "status";
  recipient: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  idempotencyKey?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Gmail OAuth 2.0 Credentials (held strictly server-side)
    const clientId = Deno.env.get("GMAIL_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";
    const refreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN") ?? "";
    const senderEmail = Deno.env.get("GMAIL_SENDER_EMAIL") ?? "animationthenationalcollege@gmail.com";

    // 1. Authenticate user via Supabase Auth
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Validate administrator permissions
    const { data: isAdmin, error: roleErr } = await userClient.rpc("is_admin");
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden: Administrator role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload: SendEmailPayload = { recipient: "", subject: "", bodyHtml: "" };
    if (req.method === "POST") {
      try {
        payload = await req.json();
      } catch {
        // empty body
      }
    }

    // Handle Status / Connection Health Check
    if (payload.action === "status" || req.method === "GET") {
      const missingSecrets: string[] = [];
      if (!clientId) missingSecrets.push("GMAIL_CLIENT_ID");
      if (!clientSecret) missingSecrets.push("GMAIL_CLIENT_SECRET");
      if (!refreshToken) missingSecrets.push("GMAIL_REFRESH_TOKEN");

      if (missingSecrets.length > 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            configured: false,
            senderEmail,
            missingSecrets,
            message: `Gmail OAuth secrets missing in Supabase Edge Functions: ${missingSecrets.join(", ")}`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try refreshing access token to verify connection to Google
      try {
        const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });

        if (!tokenResp.ok) {
          const errData = await tokenResp.json().catch(() => ({}));
          return new Response(
            JSON.stringify({
              ok: false,
              configured: false,
              senderEmail,
              error: `Token refresh failed: ${errData.error_description || tokenResp.statusText}`,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

        // Verify profile on Gmail API
        const profileResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!profileResp.ok) {
          const profErr = await profileResp.text();
          return new Response(
            JSON.stringify({
              ok: false,
              configured: false,
              senderEmail,
              error: `Gmail profile check failed: ${profErr}`,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const profile = await profileResp.json();
        return new Response(
          JSON.stringify({
            ok: true,
            configured: true,
            senderEmail,
            gmailAccount: profile.emailAddress,
            messagesTotal: profile.messagesTotal,
            historyId: profile.historyId,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (checkErr: any) {
        return new Response(
          JSON.stringify({
            ok: false,
            configured: false,
            senderEmail,
            error: checkErr.message || "Failed to reach Google OAuth endpoint",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 3. Validate email fields
    const { recipient, cc, bcc, subject, bodyHtml, idempotencyKey } = payload;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!recipient || !emailRegex.test(recipient.trim())) {
      return new Response(
        JSON.stringify({ ok: false, error: "A valid recipient email address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subject || !subject.trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "Email subject is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!bodyHtml || !bodyHtml.trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "Email message content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check secrets
    if (!clientId || !clientSecret || !refreshToken) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Gmail API integration secrets not configured in Supabase. Please configure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in Edge Function secrets.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 4. Duplicate send protection via idempotency key
    if (idempotencyKey) {
      const { data: existingEmail } = await adminClient
        .from("crm_emails")
        .select("id, status, sent_at, gmail_message_id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingEmail && existingEmail.status === "sent") {
        return new Response(
          JSON.stringify({
            ok: true,
            skipped: true,
            reason: "Email already sent previously (idempotency match)",
            messageId: existingEmail.gmail_message_id,
            sentAt: existingEmail.sent_at,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 5. Exchange refresh token for access token
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResp.ok) {
      const errData = await tokenResp.json().catch(() => ({}));
      const errorMsg = `Google OAuth refresh token error: ${errData.error_description || tokenResp.statusText}`;
      return new Response(
        JSON.stringify({ ok: false, error: errorMsg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token: accessToken } = await tokenResp.json();

    // 6. Build RFC 2822 MIME message
    const cleanRecipient = recipient.trim();
    const cleanSubject = subject.trim();
    const cleanSender = `Supernova 3.0 <${senderEmail}>`;

    const headers: string[] = [
      `From: ${cleanSender}`,
      `To: ${cleanRecipient}`,
    ];

    if (cc && cc.trim()) {
      headers.push(`Cc: ${cc.trim()}`);
    }
    if (bcc && bcc.trim()) {
      headers.push(`Bcc: ${bcc.trim()}`);
    }

    headers.push(
      `Subject: ${encodeSubject(cleanSubject)}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`
    );

    const rawMessage = `${headers.join("\r\n")}\r\n\r\n${bodyHtml}`;
    const encodedRaw = base64UrlEncode(rawMessage);

    // 7. Send message via Gmail API
    const sendResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedRaw }),
    });

    if (!sendResp.ok) {
      const errText = await sendResp.text();
      return new Response(
        JSON.stringify({ ok: false, error: `Gmail API delivery failed (${sendResp.status}): ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sendResult = await sendResp.json();
    const sentAt = new Date().toISOString();

    // 8. Record in database (if table exists)
    try {
      await adminClient.from("crm_emails").insert({
        recipient: cleanRecipient,
        cc: cc?.trim() || null,
        bcc: bcc?.trim() || null,
        subject: cleanSubject,
        body_html: bodyHtml,
        sender_email: senderEmail,
        sent_by: user.id,
        sent_by_email: user.email,
        status: "sent",
        gmail_message_id: sendResult.id,
        gmail_thread_id: sendResult.threadId,
        idempotency_key: idempotencyKey || null,
        sent_at: sentAt,
      });
    } catch {
      // Table may not exist yet if migration pending; non-blocking
    }

    // 9. Record in audit_logs
    try {
      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        action: "send_crm_email",
        table_name: "crm_emails",
        record_id: sendResult.id,
        metadata: {
          recipient: cleanRecipient,
          subject: cleanSubject,
          sender: senderEmail,
          gmail_message_id: sendResult.id,
          sent_at: sentAt,
        },
      });
    } catch {
      // Non-blocking
    }

    return new Response(
      JSON.stringify({
        ok: true,
        messageId: sendResult.id,
        threadId: sendResult.threadId,
        senderEmail,
        recipient: cleanRecipient,
        sentAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
