import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-region",
  "Access-Control-Max-Age": "86400",
};

const VALID_ROLES = [
  "super_admin",
  "crm_admin",
  "event_admin",
  "registration_staff",
  "esports_entry_staff",
  "checkin_staff",
  "participation_manager",
  "esports_manager",
  "match_conductor",
  "score_operator",
  "content_manager",
  "viewer",
];

function parseOverridesPayload(raw: unknown): { permission_key: string; allowed: boolean }[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((item: any) => item && typeof item.permission_key === "string")
      .map((item: any) => ({ permission_key: item.permission_key, allowed: Boolean(item.allowed) }));
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([permission_key, allowed]) => ({
      permission_key,
      allowed: Boolean(allowed),
    }));
  }
  return [];
}

const VALID_STATUSES = ["invited", "active", "deactivated", "revoked"];
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ ok: false, error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Edge Function environment keys missing" }, 503);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();

    if (userErr || !user) {
      return jsonResponse({ ok: false, error: "Unauthorized session" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Strictly verify actor is an ACTIVE Super Admin
    const { data: actorRoleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    const { data: actorProfile } = await adminClient
      .from("profiles")
      .select("account_status")
      .eq("id", user.id)
      .maybeSingle();

    const actorStatus = actorProfile?.account_status ?? "active";
    if (!actorRoleRow || actorStatus !== "active") {
      return jsonResponse({ ok: false, error: "Forbidden: Active Super Admin access required" }, 403);
    }

    let payload: any = {};
    if (req.method === "POST") {
      payload = await req.json().catch(() => ({}));
    }

    const action = req.method === "GET" ? "list_users" : payload.action;

    // -------------------------------------------------------------------------
    // 1. LIST CRM USERS + INVITATIONS + OVERRIDES
    // -------------------------------------------------------------------------
    if (action === "list_users") {
      const [{ data: profiles }, { data: roles }, { data: overrides }, { data: invitations }, authUsersRes] =
        await Promise.all([
          adminClient.from("profiles").select("*").order("created_at", { ascending: true }),
          adminClient.from("user_roles").select("*"),
          adminClient.from("crm_user_permissions").select("*"),
          adminClient.from("crm_invitations").select("*").order("created_at", { ascending: false }),
          adminClient.auth.admin.listUsers({ perPage: 200 }),
        ]);

      const authMap = new Map<string, any>();
      (authUsersRes?.data?.users || []).forEach((au) => authMap.set(au.id, au));

      const profileMap = new Map<string, any>();
      (profiles || []).forEach((p: any) => profileMap.set(p.id, p));

      const roleMap = new Map<string, any>();
      (roles || []).forEach((r: any) => roleMap.set(r.user_id, r));

      const overrideMap = new Map<string, any[]>();
      (overrides || []).forEach((o: any) => {
        const list = overrideMap.get(o.user_id) || [];
        list.push({ permission_key: o.permission_key, allowed: o.allowed });
        overrideMap.set(o.user_id, list);
      });

      const userIds = new Set<string>([
        ...(roles || []).map((r: any) => r.user_id),
        ...(profiles || []).map((p: any) => p.id),
      ]);

      const users = Array.from(userIds)
        .filter((uid) => roleMap.has(uid) || profileMap.get(uid)?.account_status === "invited")
        .map((uid) => {
          const prof = profileMap.get(uid);
          const roleRow = roleMap.get(uid);
          const authUser = authMap.get(uid);
          return {
            user_id: uid,
            email: prof?.email || authUser?.email || "unknown@supernova",
            full_name:
              prof?.full_name ||
              prof?.display_name ||
              authUser?.user_metadata?.full_name ||
              (authUser?.email ? authUser.email.split("@")[0] : "CRM User"),
            role: roleRow?.role || "viewer",
            account_status: prof?.account_status || "active",
            overrides: overrideMap.get(uid) || [],
            created_at: prof?.created_at || roleRow?.created_at || authUser?.created_at,
            invited_at: prof?.invited_at || null,
            activated_at: prof?.activated_at || null,
            last_login_at: prof?.last_login_at || authUser?.last_sign_in_at || null,
          };
        });

      return jsonResponse({ ok: true, users, invitations: invitations || [] });
    }

    // -------------------------------------------------------------------------
    // 2. INVITE NEW CRM USER
    // -------------------------------------------------------------------------
    if (action === "invite_user") {
      const email = String(payload.email || "").trim().toLowerCase();
      const fullName = String(payload.fullName || "").trim();
      const role = String(payload.role || "").trim();
      const overrides = parseOverridesPayload(
        payload.overrides !== undefined ? payload.overrides : payload.customPermissions
      );
      const redirectTo =
        typeof payload.redirectTo === "string" && payload.redirectTo.startsWith("http")
          ? payload.redirectTo
          : undefined;

      if (!EMAIL_REGEX.test(email)) {
        return jsonResponse({ ok: false, error: "Valid email address is required." }, 400);
      }
      if (!fullName || fullName.length < 2) {
        return jsonResponse({ ok: false, error: "Full name is required." }, 400);
      }
      if (!VALID_ROLES.includes(role)) {
        return jsonResponse({ ok: false, error: "Invalid CRM role specified." }, 400);
      }

      // Check existing auth users
      const { data: listRes } = await adminClient.auth.admin.listUsers({ perPage: 200 });
      const existingAuthUser = (listRes?.users || []).find(
        (u) => (u.email || "").toLowerCase() === email
      );

      let targetUserId = existingAuthUser?.id || "";

      if (existingAuthUser) {
        // Check if already active CRM user
        const { data: existingRole } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", existingAuthUser.id)
          .maybeSingle();
        const { data: existingProf } = await adminClient
          .from("profiles")
          .select("account_status")
          .eq("id", existingAuthUser.id)
          .maybeSingle();

        if (existingRole && existingProf?.account_status === "active") {
          return jsonResponse(
            { ok: false, error: `${email} already has an active CRM account.` },
            409
          );
        }

        // Unban if previously deactivated and re-invite/re-assign
        await adminClient.auth.admin.updateUserById(existingAuthUser.id, {
          ban_duration: "none",
          user_metadata: { ...(existingAuthUser.user_metadata || {}), full_name: fullName },
        });
      } else {
        const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
          email,
          {
            redirectTo,
            data: { full_name: fullName },
          }
        );

        if (inviteErr || !inviteData?.user?.id) {
          return jsonResponse(
            { ok: false, error: inviteErr?.message || "Failed to send Supabase invitation email." },
            500
          );
        }
        targetUserId = inviteData.user.id;
      }

      const nowIso = new Date().toISOString();

      await adminClient.from("profiles").upsert({
        id: targetUserId,
        email,
        full_name: fullName,
        display_name: fullName,
        account_status: "invited",
        invited_by: user.id,
        invited_at: nowIso,
        updated_at: nowIso,
      });

      await adminClient.from("user_roles").delete().eq("user_id", targetUserId);
      await adminClient.from("user_roles").insert({
        user_id: targetUserId,
        role,
        assigned_by: user.id,
      });

      await adminClient.from("crm_user_permissions").delete().eq("user_id", targetUserId);
      if (overrides.length > 0) {
        await adminClient.from("crm_user_permissions").insert(
          overrides.map((ov) => ({
            user_id: targetUserId,
            permission_key: ov.permission_key,
            allowed: Boolean(ov.allowed),
            updated_by: user.id,
          }))
        );
      }

      await adminClient.from("crm_invitations").insert({
        email,
        full_name: fullName,
        role,
        permission_overrides: overrides,
        status: "pending",
        invited_by: user.id,
      });

      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        action: "crm_user_invited",
        entity_type: "user_roles",
        entity_id: targetUserId,
        metadata: { email, full_name: fullName, role, overrides_count: overrides.length },
      });

      return jsonResponse({ ok: true, userId: targetUserId, email, role, status: "invited" });
    }

    // -------------------------------------------------------------------------
    // Guard helpers for mutations (self-edit & last-super-admin)
    // -------------------------------------------------------------------------
    const targetUserId = String(payload.targetUserId || "").trim();
    if (!targetUserId) {
      return jsonResponse({ ok: false, error: "targetUserId is required" }, 400);
    }

    if (targetUserId === user.id) {
      return jsonResponse(
        {
          ok: false,
          error: "Security policy violation: You cannot modify your own role, permissions, or account status.",
        },
        403
      );
    }

    const checkLastSuperAdmin = async () => {
      const [{ data: superRoles }, { data: activeProfiles }] = await Promise.all([
        adminClient.from("user_roles").select("user_id").eq("role", "super_admin"),
        adminClient.from("profiles").select("id, account_status"),
      ]);

      const statusById = new Map<string, string>();
      (activeProfiles || []).forEach((p: any) => statusById.set(p.id, p.account_status || "active"));

      const activeSupers = (superRoles || []).filter(
        (r: any) => (statusById.get(r.user_id) || "active") === "active"
      );
      return {
        isTargetActiveSuper: activeSupers.some((r: any) => r.user_id === targetUserId),
        activeSuperCount: activeSupers.length,
      };
    };

    // -------------------------------------------------------------------------
    // 3. UPDATE USER ROLE
    // -------------------------------------------------------------------------
    if (action === "update_user_role") {
      const nextRole = String(payload.role || "").trim();
      if (!VALID_ROLES.includes(nextRole)) {
        return jsonResponse({ ok: false, error: "Invalid CRM role" }, 400);
      }

      const { isTargetActiveSuper, activeSuperCount } = await checkLastSuperAdmin();
      if (isTargetActiveSuper && activeSuperCount <= 1 && nextRole !== "super_admin") {
        return jsonResponse(
          { ok: false, error: "Cannot demote the last active Super Admin." },
          409
        );
      }

      await adminClient.from("user_roles").delete().eq("user_id", targetUserId);
      const { error: insertErr } = await adminClient.from("user_roles").insert({
        user_id: targetUserId,
        role: nextRole,
        assigned_by: user.id,
      });

      if (insertErr) {
        return jsonResponse({ ok: false, error: insertErr.message }, 500);
      }

      if (payload.clearOverrides) {
        await adminClient.from("crm_user_permissions").delete().eq("user_id", targetUserId);
      }

      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        action: "crm_user_role_updated",
        entity_type: "user_roles",
        entity_id: targetUserId,
        metadata: { next_role: nextRole },
      });

      return jsonResponse({ ok: true, userId: targetUserId, role: nextRole });
    }

    // -------------------------------------------------------------------------
    // 4. UPDATE USER CUSTOM PERMISSIONS
    // -------------------------------------------------------------------------
    if (action === "update_user_permissions") {
      const overrides = parseOverridesPayload(
        payload.overrides !== undefined ? payload.overrides : payload.customPermissions
      );

      await adminClient.from("crm_user_permissions").delete().eq("user_id", targetUserId);
      if (overrides.length > 0) {
        const { error: ovErr } = await adminClient.from("crm_user_permissions").insert(
          overrides.map((ov) => ({
            user_id: targetUserId,
            permission_key: ov.permission_key,
            allowed: Boolean(ov.allowed),
            updated_by: user.id,
          }))
        );
        if (ovErr) {
          return jsonResponse({ ok: false, error: ovErr.message }, 500);
        }
      }

      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        action: "crm_user_permissions_updated",
        entity_type: "crm_user_permissions",
        entity_id: targetUserId,
        metadata: { overrides },
      });

      return jsonResponse({ ok: true, userId: targetUserId, overrides });
    }

    // -------------------------------------------------------------------------
    // 5. UPDATE USER ACCOUNT STATUS (active / deactivated / revoked)
    // -------------------------------------------------------------------------
    if (action === "update_user_status") {
      const nextStatus = String(payload.accountStatus || "").trim();
      if (!VALID_STATUSES.includes(nextStatus)) {
        return jsonResponse({ ok: false, error: "Invalid account status" }, 400);
      }

      const { isTargetActiveSuper, activeSuperCount } = await checkLastSuperAdmin();
      if (isTargetActiveSuper && activeSuperCount <= 1 && nextStatus !== "active") {
        return jsonResponse(
          { ok: false, error: "Cannot deactivate or revoke the last active Super Admin." },
          409
        );
      }

      const nowIso = new Date().toISOString();
      const updateFields: Record<string, any> = {
        account_status: nextStatus,
        updated_at: nowIso,
      };
      if (nextStatus === "deactivated") updateFields.deactivated_at = nowIso;
      if (nextStatus === "revoked") updateFields.revoked_at = nowIso;
      if (nextStatus === "active") {
        updateFields.activated_at = nowIso;
        updateFields.deactivated_at = null;
      }

      const { error: profErr } = await adminClient
        .from("profiles")
        .update(updateFields)
        .eq("id", targetUserId);

      if (profErr) {
        return jsonResponse({ ok: false, error: profErr.message }, 500);
      }

      // Enforce at Supabase Auth level as well (ban deactivated/revoked immediately, unban active)
      await adminClient.auth.admin.updateUserById(targetUserId, {
        ban_duration: nextStatus === "active" || nextStatus === "invited" ? "none" : "876000h",
      });

      if (nextStatus === "revoked") {
        const { data: targetProf } = await adminClient
          .from("profiles")
          .select("email")
          .eq("id", targetUserId)
          .maybeSingle();
        if (targetProf?.email) {
          await adminClient
            .from("crm_invitations")
            .update({ status: "revoked" })
            .eq("email", targetProf.email)
            .eq("status", "pending");
        }
      }

      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        action: `crm_user_status_${nextStatus}`,
        entity_type: "profiles",
        entity_id: targetUserId,
        metadata: { next_status: nextStatus, updated_at: nowIso },
      });

      return jsonResponse({ ok: true, userId: targetUserId, accountStatus: nextStatus });
    }

    return jsonResponse({ ok: false, error: `Unknown action: ${String(action)}` }, 400);
  } catch (err: any) {
    return jsonResponse({ ok: false, error: err?.message || "Internal server error" }, 500);
  }
});
