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

const ROLE_PRIORITY: Record<string, number> = {
  super_admin: 100,
  crm_admin: 90,
  event_admin: 85,
  esports_manager: 80,
  score_operator: 75,
  esports_entry_staff: 70,
  registration_staff: 65,
  checkin_staff: 60,
  match_conductor: 55,
  content_manager: 50,
  participation_manager: 20,
  viewer: 10,
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      (roles || []).forEach((r: any) => {
        const existing = roleMap.get(r.user_id);
        if (!existing || (ROLE_PRIORITY[r.role] ?? 0) > (ROLE_PRIORITY[existing.role] ?? 0)) {
          roleMap.set(r.user_id, r);
        }
      });

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
            deactivated_at: prof?.deactivated_at || null,
            revoked_at: prof?.revoked_at || null,
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
    if (!UUID_REGEX.test(targetUserId)) {
      return jsonResponse({ ok: false, error: "Invalid targetUserId format" }, 400);
    }

    if (targetUserId === user.id) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Security policy violation: You cannot modify, deactivate, or delete your own account.",
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

      const { data: authTargetRes } = await adminClient.auth.admin.getUserById(targetUserId);
      const targetEmail = authTargetRes?.user?.email?.toLowerCase() || null;
      const targetFullName =
        (authTargetRes?.user?.user_metadata?.full_name as string | undefined) ||
        (targetEmail ? targetEmail.split("@")[0] : null);

      const nowIso = new Date().toISOString();
      const upsertFields: Record<string, any> = {
        id: targetUserId,
        account_status: nextStatus,
        updated_at: nowIso,
      };
      if (targetEmail) upsertFields.email = targetEmail;
      if (targetFullName) upsertFields.full_name = targetFullName;
      if (nextStatus === "deactivated") upsertFields.deactivated_at = nowIso;
      if (nextStatus === "revoked") upsertFields.revoked_at = nowIso;
      if (nextStatus === "active") {
        upsertFields.activated_at = nowIso;
        upsertFields.deactivated_at = null;
      }

      const { error: profErr } = await adminClient
        .from("profiles")
        .upsert(upsertFields, { onConflict: "id" });

      if (profErr) {
        return jsonResponse({ ok: false, error: profErr.message }, 500);
      }

      // Enforce at Supabase Auth level as well (ban deactivated/revoked immediately, unban active)
      if (authTargetRes?.user) {
        const { error: banErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
          ban_duration: nextStatus === "active" || nextStatus === "invited" ? "none" : "876000h",
        });
        if (banErr) {
          return jsonResponse(
            { ok: false, error: `Auth status update failed: ${banErr.message}` },
            500
          );
        }
        if (nextStatus === "deactivated" || nextStatus === "revoked") {
          try {
            await (adminClient.auth.admin as any).signOut?.(targetUserId, "global");
          } catch {
            // Best-effort session revocation; Auth ban + DB account_status already block access
          }
        }
      }

      if (nextStatus === "revoked") {
        const { data: targetProf } = await adminClient
          .from("profiles")
          .select("email")
          .eq("id", targetUserId)
          .maybeSingle();
        const emailForInvite = targetProf?.email || targetEmail;
        if (emailForInvite) {
          await adminClient
            .from("crm_invitations")
            .update({ status: "revoked" })
            .eq("email", emailForInvite)
            .eq("status", "pending");
        }
      }

      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        action: `crm_user_status_${nextStatus}`,
        entity_type: "profiles",
        entity_id: targetUserId,
        metadata: { email: targetEmail, next_status: nextStatus, updated_at: nowIso },
      });

      return jsonResponse({ ok: true, userId: targetUserId, accountStatus: nextStatus });
    }

    // -------------------------------------------------------------------------
    // 6. PERMANENTLY DELETE CRM STAFF ACCOUNT (PRESERVING HISTORICAL EVENT DATA)
    // -------------------------------------------------------------------------
    if (action === "delete_user") {
      const { isTargetActiveSuper, activeSuperCount } = await checkLastSuperAdmin();
      if (isTargetActiveSuper && activeSuperCount <= 1) {
        return jsonResponse(
          { ok: false, error: "Cannot delete the last active Super Admin." },
          409
        );
      }

      const [{ data: targetProf }, { data: targetRoles }, authTargetRes] = await Promise.all([
        adminClient.from("profiles").select("email, full_name").eq("id", targetUserId).maybeSingle(),
        adminClient.from("user_roles").select("role").eq("user_id", targetUserId),
        adminClient.auth.admin.getUserById(targetUserId),
      ]);

      const targetEmail = targetProf?.email || authTargetRes?.user?.email || null;
      const targetName =
        targetProf?.full_name || authTargetRes?.user?.user_metadata?.full_name || targetEmail;
      const targetRolesList = (targetRoles || []).map((r: any) => r.role);

      if (!targetProf && targetRolesList.length === 0 && !authTargetRes?.user) {
        return jsonResponse({ ok: false, error: "Target CRM account was not found." }, 404);
      }

      // Preserve all historical event records by detaching actor/reviewer FKs before deleting auth user
      const nullifyRefs: Array<[string, string]> = [
        ["event_settings", "updated_by"],
        ["site_content", "updated_by"],
        ["announcements", "author_id"],
        ["check_ins", "checked_in_by"],
        ["registration_controls", "updated_by"],
        ["media_items", "created_by"],
        ["institutions", "updated_by"],
        ["registrations", "reviewed_by"],
        ["registrations", "checked_in_by"],
        ["registrations", "archived_by"],
        ["visitor_registrations", "checked_in_by"],
        ["visitor_registrations", "archived_by"],
        ["tickets", "checked_in_by"],
        ["wristband_issuances", "issued_by"],
        ["wristband_issuances", "replaced_by"],
        ["gate_overrides", "supervisor_id"],
        ["matches", "conductor_id"],
        ["matches", "submitted_by"],
        ["matches", "confirmed_by"],
        ["match_attendance", "verified_by"],
        ["match_disputes", "reported_by"],
        ["match_disputes", "resolved_by"],
        ["tournaments", "created_by"],
        ["team_status_history", "changed_by"],
        ["crm_emails", "sent_by"],
        ["audit_logs", "actor_id"],
        ["crm_invitations", "invited_by"],
        ["profiles", "invited_by"],
        ["user_roles", "assigned_by"],
        ["crm_user_permissions", "updated_by"],
      ];

      await Promise.all(
        nullifyRefs.map(async ([tableName, colName]) => {
          try {
            await adminClient
              .from(tableName)
              .update({ [colName]: null })
              .eq(colName, targetUserId);
          } catch {
            // Table or column may not exist on partial deployments; ignore safely
          }
        })
      );

      if (targetEmail) {
        await adminClient
          .from("crm_invitations")
          .update({ status: "revoked" })
          .eq("email", targetEmail)
          .eq("status", "pending");
      }

      await adminClient.from("crm_user_permissions").delete().eq("user_id", targetUserId);
      const { error: delRoleErr } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", targetUserId);
      if (delRoleErr) {
        return jsonResponse({ ok: false, error: delRoleErr.message }, 500);
      }

      // Record deletion in immutable audit log before deleting profile/auth row
      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        action: "crm_user_deleted",
        entity_type: "profiles",
        entity_id: targetUserId,
        metadata: {
          deleted_user_id: targetUserId,
          deleted_email: targetEmail,
          deleted_name: targetName,
          deleted_roles: targetRolesList,
          historical_data_preserved: true,
        },
      });

      const { error: delProfErr } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", targetUserId);
      if (delProfErr) {
        return jsonResponse({ ok: false, error: delProfErr.message }, 500);
      }

      if (authTargetRes?.user) {
        const { error: delAuthErr } = await adminClient.auth.admin.deleteUser(targetUserId);
        if (delAuthErr && !String(delAuthErr.message || "").toLowerCase().includes("not found")) {
          return jsonResponse(
            { ok: false, error: `Failed to delete auth account: ${delAuthErr.message}` },
            500
          );
        }
      }

      return jsonResponse({
        ok: true,
        deletedUserId: targetUserId,
        email: targetEmail,
        historicalDataPreserved: true,
      });
    }

    return jsonResponse({ ok: false, error: `Unknown action: ${String(action)}` }, 400);
  } catch (err: any) {
    return jsonResponse({ ok: false, error: err?.message || "Internal server error" }, 500);
  }
});
