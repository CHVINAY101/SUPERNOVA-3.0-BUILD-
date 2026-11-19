import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-region",
  "Access-Control-Max-Age": "86400",
};

const EMAIL_UNAVAILABLE_MESSAGE = "Email delivery unavailable";
const OFFICIAL_CONTACT_EMAIL = "animationthenationalcollege@gmail.com";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface SendEmailPayload {
  action?: "send" | "status";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ ok: false, error: `Method ${req.method} not allowed` }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ ok: false, error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ ok: false, error: "Unauthorized user session" }, 401);
    }

    let payload: SendEmailPayload = {};
    if (req.method === "POST") {
      try {
        payload = await req.json();
      } catch {
        return jsonResponse({ ok: false, error: "Invalid JSON request body" }, 400);
      }
    }

    const isStatusCheck = payload.action === "status" || req.method === "GET";
    const requiredPermission = isStatusCheck ? "email_centre:view" : "email_centre:send";

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
      return jsonResponse(
        { ok: false, error: `Forbidden: ${requiredPermission} permission required` },
        403
      );
    }

    if (isStatusCheck) {
      return jsonResponse({
        ok: false,
        configured: false,
        unavailable: true,
        email_sent: false,
        status: "unavailable",
        senderEmail: OFFICIAL_CONTACT_EMAIL,
        message: EMAIL_UNAVAILABLE_MESSAGE,
      });
    }

    // CRM email sending is safely disabled (Gmail OAuth removed; never reports "sent")
    return jsonResponse({
      ok: false,
      configured: false,
      unavailable: true,
      email_sent: false,
      status: "unavailable",
      senderEmail: OFFICIAL_CONTACT_EMAIL,
      message: EMAIL_UNAVAILABLE_MESSAGE,
      error: EMAIL_UNAVAILABLE_MESSAGE,
    });
  } catch (err: any) {
    return jsonResponse(
      {
        ok: false,
        unavailable: true,
        email_sent: false,
        status: "unavailable",
        error: err?.message || EMAIL_UNAVAILABLE_MESSAGE,
      },
      500
    );
  }
});
