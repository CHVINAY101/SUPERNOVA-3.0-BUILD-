import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-region",
  "Access-Control-Max-Age": "86400",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_UNAVAILABLE_MESSAGE = "Email delivery unavailable";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface RequestPayload {
  registrationId?: string;
  registrationRef?: string;
  registrationType: "visitor" | "esports" | "participation";
  isResend?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === "GET") {
    return jsonResponse({
      ok: true,
      function: "send-registration-confirmation",
      configured: false,
      unavailable: true,
      email_sent: false,
      status: "unavailable",
      message: EMAIL_UNAVAILABLE_MESSAGE,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: `Method ${req.method} not allowed` }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let body: RequestPayload;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON request body" }, 400);
    }

    const { registrationId, registrationRef, registrationType, isResend = false } =
      body || ({} as RequestPayload);

    if (
      (!registrationId && !registrationRef) ||
      (registrationId && (typeof registrationId !== "string" || !UUID_REGEX.test(registrationId))) ||
      !["visitor", "esports", "participation"].includes(registrationType) ||
      typeof isResend !== "boolean"
    ) {
      return jsonResponse({ ok: false, error: "Invalid confirmation email payload" }, 400);
    }

    // Preserve RBAC / caller authentication checks
    const authHeader = req.headers.get("Authorization") ?? "";
    let actorId: string | null = null;
    let isAuthorizedAdmin = false;

    if (authHeader && supabaseUrl && supabaseAnonKey) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
      } = await userClient.auth.getUser();
      if (user) {
        actorId = user.id;
        const requiredPerm = isResend ? "email_centre:resend" : "email_centre:send";
        const { data: hasPerm, error: permErr } = await userClient.rpc("has_crm_permission", {
          p_permission: requiredPerm,
        });
        if (!permErr) {
          isAuthorizedAdmin = Boolean(hasPerm);
        } else {
          const { data: isAdm } = await userClient.rpc("is_admin");
          isAuthorizedAdmin = Boolean(isAdm);
        }
      }
    }

    const isPublicVisitorInitial =
      !isAuthorizedAdmin && registrationType === "visitor" && !isResend && actorId === null;

    if (!isAuthorizedAdmin && !isPublicVisitorInitial) {
      return jsonResponse(
        { ok: false, error: "Forbidden: email_centre permission required" },
        actorId ? 403 : 401
      );
    }

    // Verify registration exists if service role is present, without mutating email_status to sent
    if (supabaseUrl && serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const table =
        registrationType === "visitor"
          ? "visitor_registrations"
          : registrationType === "esports"
          ? "registrations"
          : "participation_registrations";

      let query = adminClient.from(table).select("id, status, archived_at");
      query = registrationId
        ? query.eq("id", registrationId)
        : query.eq("registration_ref", registrationRef!);
      const { data: record, error: lookupErr } = await query.maybeSingle();

      if (lookupErr || !record) {
        return jsonResponse({ ok: false, error: "Registration not found" }, 404);
      }

      if (record.archived_at) {
        return jsonResponse(
          { ok: false, error: "Cannot process email for an archived registration" },
          409
        );
      }
    }

    // Email sending is safely disabled (Gmail OAuth removed; never reports "sent")
    return jsonResponse(
      {
        ok: false,
        email_sent: false,
        configured: false,
        unavailable: true,
        status: "unavailable",
        message: EMAIL_UNAVAILABLE_MESSAGE,
        error: EMAIL_UNAVAILABLE_MESSAGE,
      },
      200
    );
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        email_sent: false,
        unavailable: true,
        status: "unavailable",
        error: String(err || EMAIL_UNAVAILABLE_MESSAGE),
      },
      500
    );
  }
});
