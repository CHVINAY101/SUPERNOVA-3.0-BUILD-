import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-region",
  "Access-Control-Max-Age": "86400",
};

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

function redactSecrets(text: string): string {
  return String(text || "")
    .replace(/Bearer\s+[A-Za-z0-9._\-/+]+/gi, "Bearer [REDACTED]")
    .replace(/(ya29\.[A-Za-z0-9_\-]+)/g, "[REDACTED_OAUTH_TOKEN]")
    .replace(/(1\/\/[A-Za-z0-9_\-]+)/g, "[REDACTED_REFRESH_TOKEN]");
}

function hasHeaderInjection(val: string): boolean {
  return /[\r\n\0]/.test(val);
}

function validateEmailList(raw?: string): { valid: boolean; cleaned: string; error?: string } {
  if (!raw || !raw.trim()) return { valid: true, cleaned: "" };
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const item of items) {
    if (item.length > 254 || hasHeaderInjection(item) || !EMAIL_REGEX.test(item)) {
      return { valid: false, cleaned: "", error: `Invalid email address: ${item}` };
    }
  }
  return { valid: true, cleaned: items.join(", ") };
}

function chunkBase64(b64: string, width = 76): string {
  const clean = b64.replace(/\s+/g, "");
  const lines: string[] = [];
  for (let i = 0; i < clean.length; i += width) {
    lines.push(clean.slice(i, i + width));
  }
  return lines.join("\r\n");
}

function stripDataUrlPrefix(b64: string): string {
  const idx = b64.indexOf("base64,");
  return idx >= 0 ? b64.slice(idx + 7) : b64;
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
  return encodeUtf8ToBase64(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeSubject(subject: string): string {
  return `=?utf-8?B?${encodeUtf8ToBase64(subject)}?=`;
}

interface AttachmentInput {
  filename: string;
  contentType?: string;
  base64Content: string;
}

interface SendEmailPayload {
  action?: "send" | "status";
  recipient: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  idempotencyKey?: string;
  registrationRef?: string;
  registrationType?: string;
  attachments?: AttachmentInput[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: `Method ${req.method} not allowed` }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let payload: SendEmailPayload = { recipient: "", subject: "", bodyHtml: "" };
    if (req.method === "POST") {
      try {
        payload = await req.json();
      } catch {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON request body" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const isStatusCheck = payload.action === "status" || req.method === "GET";
    const requiredPermission = isStatusCheck ? "email_centre:view" : "email_centre:send";

    // 2. Validate granular RBAC permission (fallback to active is_admin only if RBAC RPC missing)
    let authorized = false;
    const { data: hasPerm, error: permErr } = await userClient.rpc("has_crm_permission", {
      p_permission: requiredPermission,
    });
    if (!permErr) {
      authorized = Boolean(hasPerm);
    } else {
      const { data: isAdm } = await userClient.rpc("is_admin");
      authorized = Boolean(isAdm);
    }

    if (!authorized) {
      return new Response(
        JSON.stringify({ ok: false, error: `Forbidden: ${requiredPermission} permission required` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle Status / Connection Health Check
    if (isStatusCheck) {
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
              error: redactSecrets(`Token refresh failed: ${errData.error_description || tokenResp.statusText}`),
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

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
              error: redactSecrets(`Gmail profile check failed (${profileResp.status}): ${profErr}`),
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
            error: redactSecrets(checkErr.message || "Failed to reach Google OAuth endpoint"),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 3. Validate email fields strictly
    const {
      recipient,
      cc,
      bcc,
      subject,
      bodyHtml,
      idempotencyKey,
      registrationRef,
      registrationType,
      attachments = [],
    } = payload;

    const cleanRecipient = String(recipient || "").trim();
    if (!cleanRecipient || hasHeaderInjection(cleanRecipient) || !EMAIL_REGEX.test(cleanRecipient)) {
      return new Response(
        JSON.stringify({ ok: false, error: "A valid recipient email address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ccCheck = validateEmailList(cc);
    if (!ccCheck.valid) {
      return new Response(JSON.stringify({ ok: false, error: `Invalid CC field: ${ccCheck.error}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bccCheck = validateEmailList(bcc);
    if (!bccCheck.valid) {
      return new Response(JSON.stringify({ ok: false, error: `Invalid BCC field: ${bccCheck.error}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanSubject = String(subject || "").trim();
    if (!cleanSubject || hasHeaderInjection(cleanSubject)) {
      return new Response(
        JSON.stringify({ ok: false, error: "A valid email subject is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!bodyHtml || !String(bodyHtml).trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "Email message content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clientId || !clientSecret || !refreshToken) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            "Gmail API server-side secrets not configured in Supabase (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN). Configure secrets or send via authorized Gmail OAuth session.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const cleanAttachments = Array.isArray(attachments)
      ? attachments
          .filter((a) => a && typeof a.filename === "string" && typeof a.base64Content === "string" && a.base64Content.length > 0)
          .slice(0, 3)
      : [];

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

    const persistEmailLog = async (
      status: "sent" | "failed",
      details: { messageId?: string; threadId?: string; errorMessage?: string; sentAt?: string }
    ): Promise<string | null> => {
      try {
        const { data: inserted } = await adminClient
          .from("crm_emails")
          .insert({
            recipient: cleanRecipient,
            cc: ccCheck.cleaned || null,
            bcc: bccCheck.cleaned || null,
            subject: cleanSubject,
            body_html: bodyHtml,
            sender_email: senderEmail,
            sent_by: user.id,
            sent_by_email: user.email,
            status,
            gmail_message_id: details.messageId || null,
            gmail_thread_id: details.threadId || null,
            error_message: details.errorMessage || null,
            idempotency_key: idempotencyKey || null,
            provider: "gmail",
            registration_ref: registrationRef || null,
            registration_type: registrationType || null,
            attachment_names: cleanAttachments.map((a) => a.filename),
            sent_at: details.sentAt || null,
          })
          .select("id")
          .maybeSingle();

        await adminClient.from("audit_logs").insert({
          actor_id: user.id,
          action: status === "sent" ? "send_crm_email" : "send_crm_email_failed",
          entity_type: "crm_emails",
          entity_id: inserted?.id ?? null,
          metadata: {
            recipient: cleanRecipient,
            subject: cleanSubject,
            sender: senderEmail,
            gmail_message_id: details.messageId ?? null,
            error: details.errorMessage ?? null,
            sent_at: details.sentAt ?? null,
          },
        });
        return inserted?.id ?? null;
      } catch {
        return null;
      }
    };

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
      const errorMsg = redactSecrets(
        `Google OAuth refresh token error: ${errData.error_description || tokenResp.statusText}`
      );
      await persistEmailLog("failed", { errorMessage: errorMsg });
      return new Response(JSON.stringify({ ok: false, error: errorMsg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { access_token: accessToken } = await tokenResp.json();

    // 6. Build RFC 2822 MIME message (with optional PDF attachments)
    const headers: string[] = [
      `From: Supernova 3.0 <${senderEmail}>`,
      `To: ${cleanRecipient}`,
    ];
    if (ccCheck.cleaned) headers.push(`Cc: ${ccCheck.cleaned}`);
    if (bccCheck.cleaned) headers.push(`Bcc: ${bccCheck.cleaned}`);
    headers.push(`Subject: ${encodeSubject(cleanSubject)}`, `MIME-Version: 1.0`);

    let rawMessage = "";
    const encodedHtmlBody = chunkBase64(encodeUtf8ToBase64(bodyHtml));
    if (!cleanAttachments.length) {
      headers.push(`Content-Type: text/html; charset=utf-8`, `Content-Transfer-Encoding: base64`);
      rawMessage = `${headers.join("\r\n")}\r\n\r\n${encodedHtmlBody}`;
    } else {
      const boundary = `----=_Supernova_CRM_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      const parts: string[] = [
        `--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodedHtmlBody}`,
      ];
      for (const att of cleanAttachments) {
        const safeName = att.filename.replace(/["\r\n\\/]/g, "_").slice(0, 120) || "attachment.pdf";
        const cType = att.contentType || "application/pdf";
        parts.push(
          `--${boundary}\r\nContent-Type: ${cType}; name="${safeName}"\r\nContent-Disposition: attachment; filename="${safeName}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${chunkBase64(stripDataUrlPrefix(att.base64Content))}`
        );
      }
      parts.push(`--${boundary}--`);
      rawMessage = `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
    }

    // 7. Send message via Gmail API
    const sendResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64UrlEncode(rawMessage) }),
    });

    if (!sendResp.ok) {
      const errText = await sendResp.text();
      const errorMsg = redactSecrets(`Gmail API delivery failed (${sendResp.status}): ${errText}`);
      await persistEmailLog("failed", { errorMessage: errorMsg });
      return new Response(JSON.stringify({ ok: false, error: errorMsg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendResult = await sendResp.json();
    if (!sendResult?.id) {
      const errorMsg = "Gmail API returned HTTP 200 without a message ID.";
      await persistEmailLog("failed", { errorMessage: errorMsg });
      return new Response(JSON.stringify({ ok: false, error: errorMsg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sentAt = new Date().toISOString();
    await persistEmailLog("sent", {
      messageId: sendResult.id,
      threadId: sendResult.threadId,
      sentAt,
    });

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
    return new Response(JSON.stringify({ ok: false, error: redactSecrets(err.message || "Internal server error") }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
