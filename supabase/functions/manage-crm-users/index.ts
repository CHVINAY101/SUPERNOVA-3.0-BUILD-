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

const ALL_PERMISSION_KEYS = [
  "dashboard:view",
  "visitor:view",
  "visitor:create",
  "visitor:edit",
  "visitor:delete",
  "visitor:export",
  "esports:view",
  "esports:create",
  "esports:edit",
  "esports:approve",
  "esports:reject",
  "esports:export",
  "entry:view",
  "entry:scan_visitor",
  "entry:checkin_visitor",
  "entry:scan_esports",
  "entry:checkin_esports",
  "entry:issue_wristband",
  "entry:override_checkin",
  "entry:manage_wristbands",
  "tickets:view",
  "tickets:manage",
  "tournament:manage_games",
  "tournament:select_teams",
  "tournament:build_bracket",
  "tournament:assign_conductors",
  "tournament:confirm_results",
  "tournament:resolve_disputes",
  "conductor:view_assigned",
  "conductor:verify_roster",
  "conductor:start_match",
  "conductor:submit_result",
  "conductor:report_dispute",
  "announcements:view",
  "announcements:create",
  "announcements:edit",
  "announcements:publish",
  "announcements:delete",
  "gallery:view",
  "gallery:upload",
  "gallery:edit",
  "gallery:delete",
  "event_info:view",
  "event_info:create",
  "event_info:edit",
  "event_info:publish",
  "social_links:view",
  "social_links:edit",
  "email_centre:view",
  "email_centre:compose",
  "email_centre:send",
  "email_centre:resend",
  "reports:view",
  "reports:export",
  "user_management:view",
  "user_management:invite",
  "user_management:edit",
  "user_management:deactivate",
  "user_management:delete",
  "user_management:assign_permissions",
  "system_settings:view",
  "system_settings:manage",
] as const;

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  super_admin: [...ALL_PERMISSION_KEYS],
  crm_admin: [
    "dashboard:view",
    "visitor:view",
    "visitor:create",
    "visitor:edit",
    "visitor:delete",
    "visitor:export",
    "entry:view",
    "entry:scan_visitor",
    "entry:checkin_visitor",
    "entry:scan_esports",
    "entry:checkin_esports",
    "entry:issue_wristband",
    "entry:override_checkin",
    "tickets:view",
    "tickets:manage",
    "esports:view",
    "esports:create",
    "esports:edit",
    "esports:approve",
    "esports:reject",
    "esports:export",
    "tournament:manage_games",
    "tournament:select_teams",
    "tournament:build_bracket",
    "tournament:assign_conductors",
    "tournament:confirm_results",
    "tournament:resolve_disputes",
    "conductor:view_assigned",
    "conductor:verify_roster",
    "conductor:start_match",
    "conductor:submit_result",
    "conductor:report_dispute",
    "announcements:view",
    "announcements:create",
    "announcements:edit",
    "announcements:publish",
    "announcements:delete",
    "gallery:view",
    "gallery:upload",
    "gallery:edit",
    "gallery:delete",
    "event_info:view",
    "event_info:create",
    "event_info:edit",
    "event_info:publish",
    "social_links:view",
    "social_links:edit",
    "email_centre:view",
    "email_centre:compose",
    "email_centre:send",
    "email_centre:resend",
    "reports:view",
    "reports:export",
    "system_settings:view",
  ],
  registration_staff: [
    "visitor:view",
    "visitor:create",
    "visitor:edit",
    "entry:view",
    "entry:scan_visitor",
    "entry:checkin_visitor",
    "entry:issue_wristband",
    "tickets:view",
    "tickets:manage",
  ],
  esports_entry_staff: [
    "entry:view",
    "entry:scan_esports",
    "entry:checkin_esports",
    "entry:issue_wristband",
    "tickets:view",
    "tickets:manage",
  ],
  esports_manager: [
    "dashboard:view",
    "esports:view",
    "esports:create",
    "esports:edit",
    "esports:approve",
    "esports:reject",
    "esports:export",
    "tournament:manage_games",
    "tournament:select_teams",
    "tournament:build_bracket",
    "tournament:assign_conductors",
    "tournament:confirm_results",
    "tournament:resolve_disputes",
    "conductor:view_assigned",
    "conductor:verify_roster",
    "conductor:start_match",
    "conductor:submit_result",
    "conductor:report_dispute",
    "entry:scan_esports",
    "tickets:view",
    "tickets:manage",
    "reports:view",
  ],
  match_conductor: [
    "conductor:view_assigned",
    "conductor:verify_roster",
    "conductor:start_match",
    "conductor:submit_result",
    "conductor:report_dispute",
  ],
  content_manager: [
    "dashboard:view",
    "announcements:view",
    "announcements:create",
    "announcements:edit",
    "announcements:publish",
    "announcements:delete",
    "gallery:view",
    "gallery:upload",
    "gallery:edit",
    "gallery:delete",
    "event_info:view",
    "event_info:create",
    "event_info:edit",
    "event_info:publish",
    "social_links:view",
    "social_links:edit",
  ],
  viewer: [
    "dashboard:view",
    "visitor:view",
    "esports:view",
    "tickets:view",
    "announcements:view",
    "gallery:view",
    "event_info:view",
    "social_links:view",
    "reports:view",
  ],
};

function normalizeRole(role: string | null | undefined): string | null {
  switch (role) {
    case "super_admin":
      return "super_admin";
    case "crm_admin":
    case "event_admin":
      return "crm_admin";
    case "registration_staff":
    case "checkin_staff":
      return "registration_staff";
    case "esports_entry_staff":
      return "esports_entry_staff";
    case "participation_manager":
      return "viewer";
    case "esports_manager":
    case "score_operator":
      return "esports_manager";
    case "match_conductor":
      return "match_conductor";
    case "content_manager":
      return "content_manager";
    case "viewer":
      return "viewer";
    default:
      return null;
  }
}

function resolveEffectivePermissions(
  role: string | null | undefined,
  status: string,
  overrides: { permission_key: string; allowed: boolean }[]
): Set<string> {
  if (status !== "active") return new Set<string>();
  const canonical = normalizeRole(role);
  if (!canonical) return new Set<string>();
  if (canonical === "super_admin") return new Set<string>(ALL_PERMISSION_KEYS);

  const effective = new Set<string>(ROLE_DEFAULT_PERMISSIONS[canonical] || []);
  for (const ov of overrides) {
    if (!ALL_PERMISSION_KEYS.includes(ov.permission_key as any)) continue;
    if (ov.allowed) effective.add(ov.permission_key);
    else effective.delete(ov.permission_key);
  }
  return effective;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_STATUSES = ["invited", "active", "deactivated", "revoked"];
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

function parseOverridesPayload(raw: unknown): { permission_key: string; allowed: boolean }[] {
  const validSet = new Set<string>(ALL_PERMISSION_KEYS);
  if (Array.isArray(raw)) {
    return raw
      .filter((item: any) => item && typeof item.permission_key === "string" && validSet.has(item.permission_key))
      .map((item: any) => ({ permission_key: item.permission_key, allowed: Boolean(item.allowed) }));
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([permission_key]) => validSet.has(permission_key))
      .map(([permission_key, allowed]) => ({
        permission_key,
        allowed: Boolean(allowed),
      }));
  }
  return [];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function listAllAuthUsers(adminClient: any): Promise<any[]> {
  const allUsers: any[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to read Auth directory: ${error.message}`);
    }
    const batch = data?.users || [];
    allUsers.push(...batch);
    if (batch.length < perPage || page >= 25) break;
    page += 1;
  }

  return allUsers;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ ok: false, error: `Method ${req.method} not allowed` }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const jwt = bearerMatch?.[1]?.trim() || "";
    if (!jwt) {
      return jsonResponse({ ok: false, error: "Missing or malformed Authorization Bearer token" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Edge Function environment secrets missing" }, 503);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userErr,
    } = await adminClient.auth.getUser(jwt);

    if (userErr || !user) {
      return jsonResponse({ ok: false, error: "Unauthorized or expired session" }, 401);
    }

    // Fetch actor's authoritative role(s), account_status, and permission overrides
    const [{ data: actorRoles }, { data: actorProfile }, { data: actorOverrides }] = await Promise.all([
      adminClient.from("user_roles").select("role").eq("user_id", user.id),
      adminClient.from("profiles").select("account_status").eq("id", user.id).maybeSingle(),
      adminClient
        .from("crm_user_permissions")
        .select("permission_key, allowed")
        .eq("user_id", user.id),
    ]);

    const sortedActorRoles = [...(actorRoles || [])].sort(
      (a: any, b: any) => (ROLE_PRIORITY[b.role] ?? 0) - (ROLE_PRIORITY[a.role] ?? 0)
    );
    const actorRawRole = sortedActorRoles[0]?.role || null;
    const actorCanonicalRole = normalizeRole(actorRawRole);
    const actorStatus = actorProfile?.account_status ?? "active";

    if (!actorCanonicalRole || actorStatus !== "active") {
      return jsonResponse(
        { ok: false, error: "Forbidden: Active CRM account and role required." },
        403
      );
    }

    const isActorSuperAdmin = actorCanonicalRole === "super_admin";
    const actorEffectivePerms = resolveEffectivePermissions(
      actorRawRole,
      actorStatus,
      (actorOverrides || []) as { permission_key: string; allowed: boolean }[]
    );

    const hasActorPerm = (keys: string | string[]): boolean => {
      if (isActorSuperAdmin) return true;
      const list = Array.isArray(keys) ? keys : [keys];
      return list.some((k) => actorEffectivePerms.has(k));
    };

    const assertNoPermissionEscalation = (targetRole: string, overrides: { permission_key: string; allowed: boolean }[]) => {
      if (isActorSuperAdmin) return;
      const canonicalTarget = normalizeRole(targetRole);
      if (canonicalTarget === "super_admin") {
        throw new Error("Forbidden: Only a Super Admin can assign or create Super Admin accounts.");
      }
      const nextPerms = resolveEffectivePermissions(canonicalTarget, "active", overrides);
      for (const perm of nextPerms) {
        if (!actorEffectivePerms.has(perm)) {
          throw new Error(
            `Forbidden: Cannot grant permission "${perm}" because your own account does not hold it.`
          );
        }
      }
    };

    let payload: Record<string, any> = {};
    if (req.method === "POST") {
      try {
        const parsed = await req.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return jsonResponse({ ok: false, error: "Request body must be a JSON object." }, 400);
        }
        payload = parsed;
      } catch {
        return jsonResponse({ ok: false, error: "Invalid JSON request body." }, 400);
      }
    }

    const action = req.method === "GET" ? "list_users" : String(payload.action || "").trim();

    // -------------------------------------------------------------------------
    // 1. LIST CRM USERS + INVITATIONS + OVERRIDES
    // -------------------------------------------------------------------------
    if (action === "list_users") {
      if (
        !hasActorPerm([
          "user_management:view",
          "user_management:invite",
          "user_management:edit",
          "user_management:deactivate",
          "user_management:delete",
          "user_management:assign_permissions",
        ])
      ) {
        return jsonResponse(
          { ok: false, error: "Forbidden: User Management view permission required." },
          403
        );
      }

      const [profilesRes, rolesRes, overridesRes, invitesRes, authUsers] = await Promise.all([
        adminClient.from("profiles").select("*").order("created_at", { ascending: true }),
        adminClient.from("user_roles").select("*"),
        adminClient.from("crm_user_permissions").select("*"),
        adminClient.from("crm_invitations").select("*").order("created_at", { ascending: false }),
        listAllAuthUsers(adminClient),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);
      if (rolesRes.error) throw new Error(rolesRes.error.message);
      if (overridesRes.error) throw new Error(overridesRes.error.message);
      if (invitesRes.error) throw new Error(invitesRes.error.message);

      const authMap = new Map<string, any>();
      authUsers.forEach((au) => authMap.set(au.id, au));

      const profileMap = new Map<string, any>();
      (profilesRes.data || []).forEach((p: any) => profileMap.set(p.id, p));

      const roleMap = new Map<string, any>();
      (rolesRes.data || []).forEach((r: any) => {
        const existing = roleMap.get(r.user_id);
        if (!existing || (ROLE_PRIORITY[r.role] ?? 0) > (ROLE_PRIORITY[existing.role] ?? 0)) {
          roleMap.set(r.user_id, r);
        }
      });

      const overrideMap = new Map<string, any[]>();
      (overridesRes.data || []).forEach((o: any) => {
        const list = overrideMap.get(o.user_id) || [];
        list.push({ permission_key: o.permission_key, allowed: o.allowed });
        overrideMap.set(o.user_id, list);
      });

      const userIds = new Set<string>([
        ...(rolesRes.data || []).map((r: any) => r.user_id),
        ...(profilesRes.data || []).map((p: any) => p.id),
      ]);

      const users = Array.from(userIds)
        .filter((uid) => roleMap.has(uid) || profileMap.get(uid)?.account_status === "invited")
        .filter((uid) => {
          if (isActorSuperAdmin) return true;
          const r = roleMap.get(uid)?.role;
          return normalizeRole(r) !== "super_admin";
        })
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

      const invitations = (invitesRes.data || [])
        .filter((inv: any) => isActorSuperAdmin || normalizeRole(inv.role) !== "super_admin")
        .map((inv: any) => ({
          ...inv,
          invited_at: inv.invited_at || inv.created_at,
        }));

      return jsonResponse({ ok: true, users, invitations });
    }

    // -------------------------------------------------------------------------
    // 2. ADD / CREATE OR INVITE NEW CRM USER
    // -------------------------------------------------------------------------
    if (action === "create_user" || action === "invite_user") {
      if (!hasActorPerm("user_management:invite")) {
        return jsonResponse(
          { ok: false, error: "Forbidden: user_management:invite permission required." },
          403
        );
      }

      const mode: "direct" | "invite" =
        action === "create_user" || payload.mode === "direct" ? "direct" : "invite";
      const email = String(payload.email || "").trim().toLowerCase();
      const fullName = String(payload.fullName || "").trim();
      const role = String(payload.role || "").trim();
      const password = typeof payload.password === "string" ? payload.password : "";
      const overrides = parseOverridesPayload(
        payload.overrides !== undefined ? payload.overrides : payload.customPermissions
      );
      const redirectTo =
        typeof payload.redirectTo === "string" && payload.redirectTo.startsWith("http")
          ? payload.redirectTo
          : undefined;

      if (!fullName || fullName.length < 2 || fullName.length > 120) {
        return jsonResponse(
          { ok: false, error: "Full name must be between 2 and 120 characters." },
          400
        );
      }
      if (!EMAIL_REGEX.test(email) || email.length > 254) {
        return jsonResponse({ ok: false, error: "A valid email address is required." }, 400);
      }
      if (!VALID_ROLES.includes(role)) {
        return jsonResponse({ ok: false, error: "Invalid CRM role specified." }, 400);
      }
      if (mode === "direct" && password.length < 8) {
        return jsonResponse(
          { ok: false, error: "Initial password must be at least 8 characters long." },
          400
        );
      }

      try {
        assertNoPermissionEscalation(role, overrides);
      } catch (escErr: any) {
        return jsonResponse({ ok: false, error: escErr.message }, 403);
      }

      // Check existing account across ALL Auth pages + profiles table (case-insensitive)
      const [allAuthUsers, existingProfileRes] = await Promise.all([
        listAllAuthUsers(adminClient),
        adminClient.from("profiles").select("id, email, account_status").ilike("email", email).maybeSingle(),
      ]);

      const existingAuthUser = allAuthUsers.find(
        (u) => (u.email || "").trim().toLowerCase() === email
      );

      if (existingAuthUser || existingProfileRes.data) {
        const existingStatus = existingProfileRes.data?.account_status || "active";
        return jsonResponse(
          {
            ok: false,
            error: `Duplicate account: ${email} already exists in CRM Auth/directory (status: ${existingStatus}). Edit, reactivate, or delete the existing account instead.`,
          },
          409
        );
      }

      const nowIso = new Date().toISOString();
      let newUserId = "";

      if (mode === "direct") {
        const { data: createdAuth, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
          app_metadata: { crm_initial_status: "active" },
        });

        if (createErr || !createdAuth?.user?.id) {
          const msg = createErr?.message || "Failed to create Supabase Auth account.";
          const isDup =
            msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists");
          return jsonResponse({ ok: false, error: msg }, isDup ? 409 : 400);
        }
        newUserId = createdAuth.user.id;
      } else {
        const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
          email,
          {
            redirectTo,
            data: { full_name: fullName },
          }
        );

        if (inviteErr || !inviteData?.user?.id) {
          const msg = inviteErr?.message || "Failed to send Supabase invitation email.";
          const isDup =
            msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists");
          return jsonResponse({ ok: false, error: msg }, isDup ? 409 : 400);
        }
        newUserId = inviteData.user.id;
      }

      // Persist profile, role, permission overrides & invitation record atomically;
      // roll back the newly created Auth user if any DB step fails so no orphan exists.
      try {
        const nextStatus = mode === "direct" ? "active" : "invited";
        const { error: profErr } = await adminClient.from("profiles").upsert(
          {
            id: newUserId,
            email,
            full_name: fullName,
            display_name: fullName,
            account_status: nextStatus,
            invited_by: user.id,
            invited_at: nowIso,
            activated_at: mode === "direct" ? nowIso : null,
            updated_at: nowIso,
          },
          { onConflict: "id" }
        );
        if (profErr) throw new Error(`Failed to save staff profile: ${profErr.message}`);

        const { error: delRoleErr } = await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", newUserId);
        if (delRoleErr) throw new Error(`Failed to prepare role slot: ${delRoleErr.message}`);

        const { error: roleErr } = await adminClient.from("user_roles").insert({
          user_id: newUserId,
          role,
          assigned_by: user.id,
        });
        if (roleErr) throw new Error(`Failed to assign CRM role: ${roleErr.message}`);

        const { error: delPermErr } = await adminClient
          .from("crm_user_permissions")
          .delete()
          .eq("user_id", newUserId);
        if (delPermErr) throw new Error(`Failed to clear permission overrides: ${delPermErr.message}`);

        if (overrides.length > 0) {
          const { error: permErr } = await adminClient.from("crm_user_permissions").insert(
            overrides.map((ov) => ({
              user_id: newUserId,
              permission_key: ov.permission_key,
              allowed: Boolean(ov.allowed),
              updated_by: user.id,
            }))
          );
          if (permErr) throw new Error(`Failed to save custom permissions: ${permErr.message}`);
        }

        if (mode === "invite") {
          const { error: invErr } = await adminClient.from("crm_invitations").insert({
            email,
            full_name: fullName,
            role,
            permission_overrides: overrides,
            status: "pending",
            invited_by: user.id,
          });
          if (invErr) throw new Error(`Failed to log invitation: ${invErr.message}`);
        }

        const { error: auditErr } = await adminClient.from("audit_logs").insert({
          actor_id: user.id,
          action: mode === "direct" ? "crm_user_created" : "crm_user_invited",
          entity_type: "user_roles",
          entity_id: newUserId,
          metadata: {
            email,
            full_name: fullName,
            role,
            mode,
            status: nextStatus,
            overrides_count: overrides.length,
          },
        });
        if (auditErr) {
          console.warn("Audit log warning during user create:", auditErr.message);
        }

        return jsonResponse({
          ok: true,
          userId: newUserId,
          email,
          fullName,
          role,
          mode,
          status: nextStatus,
        });
      } catch (dbErr: any) {
        // Rollback newly created Auth account on DB persistence failure
        await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
        return jsonResponse(
          { ok: false, error: dbErr?.message || "Database error creating CRM user." },
          500
        );
      }
    }

    // -------------------------------------------------------------------------
    // Guard helpers for mutations (target validation, self-edit & last-super-admin)
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

    const [{ data: targetRolesData }, { data: targetProfileData }, authTargetRes] =
      await Promise.all([
        adminClient.from("user_roles").select("role").eq("user_id", targetUserId),
        adminClient
          .from("profiles")
          .select("id, email, full_name, display_name, account_status")
          .eq("id", targetUserId)
          .maybeSingle(),
        adminClient.auth.admin.getUserById(targetUserId),
      ]);

    const sortedTargetRoles = [...(targetRolesData || [])].sort(
      (a: any, b: any) => (ROLE_PRIORITY[b.role] ?? 0) - (ROLE_PRIORITY[a.role] ?? 0)
    );
    const targetCurrentRole = sortedTargetRoles[0]?.role || null;
    const targetIsSuperAdmin = normalizeRole(targetCurrentRole) === "super_admin";

    if (!isActorSuperAdmin && targetIsSuperAdmin) {
      return jsonResponse(
        {
          ok: false,
          error: "Forbidden: Only a Super Admin can modify, deactivate, or delete a Super Admin account.",
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
      (activeProfiles || []).forEach((p: any) =>
        statusById.set(p.id, p.account_status || "active")
      );

      const activeSupers = (superRoles || []).filter(
        (r: any) => (statusById.get(r.user_id) || "active") === "active"
      );
      return {
        isTargetActiveSuper: activeSupers.some((r: any) => r.user_id === targetUserId),
        activeSuperCount: activeSupers.length,
      };
    };

    // -------------------------------------------------------------------------
    // 3. COMBINED UPDATE USER (NAME + ROLE + PERMISSION OVERRIDES)
    // -------------------------------------------------------------------------
    if (action === "update_user") {
      const wantsEditDetails =
        typeof payload.fullName === "string" || typeof payload.role === "string";
      const wantsPerms =
        payload.overrides !== undefined || payload.customPermissions !== undefined;

      if (wantsEditDetails && !hasActorPerm("user_management:edit")) {
        return jsonResponse(
          { ok: false, error: "Forbidden: user_management:edit permission required." },
          403
        );
      }
      if (wantsPerms && !hasActorPerm("user_management:assign_permissions")) {
        return jsonResponse(
          { ok: false, error: "Forbidden: user_management:assign_permissions permission required." },
          403
        );
      }
      if (!wantsEditDetails && !wantsPerms) {
        return jsonResponse({ ok: false, error: "No update fields provided." }, 400);
      }

      const nextFullName =
        typeof payload.fullName === "string" ? payload.fullName.trim() : undefined;
      if (nextFullName !== undefined && (nextFullName.length < 2 || nextFullName.length > 120)) {
        return jsonResponse(
          { ok: false, error: "Full name must be between 2 and 120 characters." },
          400
        );
      }

      const nextRole =
        typeof payload.role === "string" ? payload.role.trim() : targetCurrentRole || "viewer";
      if (!VALID_ROLES.includes(nextRole)) {
        return jsonResponse({ ok: false, error: "Invalid CRM role specified." }, 400);
      }

      const nextOverrides = wantsPerms
        ? parseOverridesPayload(
            payload.overrides !== undefined ? payload.overrides : payload.customPermissions
          )
        : [];

      try {
        assertNoPermissionEscalation(nextRole, nextOverrides);
      } catch (escErr: any) {
        return jsonResponse({ ok: false, error: escErr.message }, 403);
      }

      const { isTargetActiveSuper, activeSuperCount } = await checkLastSuperAdmin();
      if (
        isTargetActiveSuper &&
        activeSuperCount <= 1 &&
        normalizeRole(nextRole) !== "super_admin"
      ) {
        return jsonResponse(
          { ok: false, error: "Cannot demote the last active Super Admin." },
          409
        );
      }

      const nowIso = new Date().toISOString();

      if (nextFullName !== undefined) {
        const targetEmail =
          targetProfileData?.email || authTargetRes?.data?.user?.email?.toLowerCase() || null;
        const { error: profUpdErr } = await adminClient.from("profiles").upsert(
          {
            id: targetUserId,
            email: targetEmail,
            full_name: nextFullName,
            display_name: nextFullName,
            account_status: targetProfileData?.account_status || "active",
            updated_at: nowIso,
          },
          { onConflict: "id" }
        );
        if (profUpdErr) {
          return jsonResponse({ ok: false, error: profUpdErr.message }, 500);
        }

        if (authTargetRes?.data?.user) {
          await adminClient.auth.admin.updateUserById(targetUserId, {
            user_metadata: {
              ...(authTargetRes.data.user.user_metadata || {}),
              full_name: nextFullName,
            },
          });
        }
      }

      if (typeof payload.role === "string" && nextRole !== targetCurrentRole) {
        const { error: delRoleErr } = await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", targetUserId);
        if (delRoleErr) return jsonResponse({ ok: false, error: delRoleErr.message }, 500);

        const { error: insRoleErr } = await adminClient.from("user_roles").insert({
          user_id: targetUserId,
          role: nextRole,
          assigned_by: user.id,
        });
        if (insRoleErr) return jsonResponse({ ok: false, error: insRoleErr.message }, 500);
      }

      if (wantsPerms) {
        const { error: delPermErr } = await adminClient
          .from("crm_user_permissions")
          .delete()
          .eq("user_id", targetUserId);
        if (delPermErr) return jsonResponse({ ok: false, error: delPermErr.message }, 500);

        if (nextOverrides.length > 0 && normalizeRole(nextRole) !== "super_admin") {
          const { error: insPermErr } = await adminClient.from("crm_user_permissions").insert(
            nextOverrides.map((ov) => ({
              user_id: targetUserId,
              permission_key: ov.permission_key,
              allowed: Boolean(ov.allowed),
              updated_by: user.id,
            }))
          );
          if (insPermErr) return jsonResponse({ ok: false, error: insPermErr.message }, 500);
        }
      }

      await adminClient.from("audit_logs").insert({
        actor_id: user.id,
        action: "crm_user_updated",
        entity_type: "profiles",
        entity_id: targetUserId,
        metadata: {
          full_name: nextFullName ?? targetProfileData?.full_name ?? null,
          previous_role: targetCurrentRole,
          next_role: nextRole,
          overrides_count: wantsPerms ? nextOverrides.length : undefined,
        },
      });

      return jsonResponse({
        ok: true,
        userId: targetUserId,
        fullName: nextFullName ?? targetProfileData?.full_name ?? null,
        role: nextRole,
        overrides: nextOverrides,
      });
    }

    // -------------------------------------------------------------------------
    // 4. LEGACY UPDATE USER ROLE
    // -------------------------------------------------------------------------
    if (action === "update_user_role") {
      if (!hasActorPerm("user_management:edit")) {
        return jsonResponse(
          { ok: false, error: "Forbidden: user_management:edit permission required." },
          403
        );
      }
      const nextRole = String(payload.role || "").trim();
      if (!VALID_ROLES.includes(nextRole)) {
        return jsonResponse({ ok: false, error: "Invalid CRM role" }, 400);
      }

      try {
        assertNoPermissionEscalation(nextRole, []);
      } catch (escErr: any) {
        return jsonResponse({ ok: false, error: escErr.message }, 403);
      }

      const { isTargetActiveSuper, activeSuperCount } = await checkLastSuperAdmin();
      if (isTargetActiveSuper && activeSuperCount <= 1 && nextRole !== "super_admin") {
        return jsonResponse(
          { ok: false, error: "Cannot demote the last active Super Admin." },
          409
        );
      }

      const { error: delErr } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", targetUserId);
      if (delErr) return jsonResponse({ ok: false, error: delErr.message }, 500);

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
    // 5. LEGACY UPDATE USER CUSTOM PERMISSIONS
    // -------------------------------------------------------------------------
    if (action === "update_user_permissions") {
      if (!hasActorPerm("user_management:assign_permissions")) {
        return jsonResponse(
          { ok: false, error: "Forbidden: user_management:assign_permissions permission required." },
          403
        );
      }
      const overrides = parseOverridesPayload(
        payload.overrides !== undefined ? payload.overrides : payload.customPermissions
      );
      const roleContext = String(payload.role || targetCurrentRole || "viewer").trim();

      try {
        assertNoPermissionEscalation(roleContext, overrides);
      } catch (escErr: any) {
        return jsonResponse({ ok: false, error: escErr.message }, 403);
      }

      const { error: delPermErr } = await adminClient
        .from("crm_user_permissions")
        .delete()
        .eq("user_id", targetUserId);
      if (delPermErr) return jsonResponse({ ok: false, error: delPermErr.message }, 500);

      if (overrides.length > 0 && normalizeRole(roleContext) !== "super_admin") {
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
    // 6. UPDATE USER ACCOUNT STATUS (active / deactivated / revoked)
    // -------------------------------------------------------------------------
    if (action === "update_user_status") {
      if (!hasActorPerm("user_management:deactivate")) {
        return jsonResponse(
          { ok: false, error: "Forbidden: user_management:deactivate permission required." },
          403
        );
      }

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

      const targetAuthUser = authTargetRes?.data?.user || null;
      const targetEmail =
        targetProfileData?.email || targetAuthUser?.email?.toLowerCase() || null;
      const targetFullName =
        targetProfileData?.full_name ||
        (targetAuthUser?.user_metadata?.full_name as string | undefined) ||
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

      if (targetAuthUser) {
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
            // Best-effort token revocation; Auth ban + DB account_status block access immediately
          }
        }
      }

      if (nextStatus === "revoked" && targetEmail) {
        await adminClient
          .from("crm_invitations")
          .update({ status: "revoked" })
          .ilike("email", targetEmail)
          .eq("status", "pending");
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
    // 7. PERMANENTLY DELETE CRM STAFF ACCOUNT (PRESERVING HISTORICAL EVENT DATA)
    // -------------------------------------------------------------------------
    if (action === "delete_user") {
      if (!hasActorPerm(["user_management:delete", "user_management:deactivate"])) {
        return jsonResponse(
          { ok: false, error: "Forbidden: user_management:delete permission required." },
          403
        );
      }

      const { isTargetActiveSuper, activeSuperCount } = await checkLastSuperAdmin();
      if (isTargetActiveSuper && activeSuperCount <= 1) {
        return jsonResponse(
          { ok: false, error: "Cannot delete the last active Super Admin." },
          409
        );
      }

      const targetAuthUser = authTargetRes?.data?.user || null;
      const targetEmail = targetProfileData?.email || targetAuthUser?.email || null;
      const targetName =
        targetProfileData?.full_name ||
        targetAuthUser?.user_metadata?.full_name ||
        targetEmail;
      const targetRolesList = (targetRolesData || []).map((r: any) => r.role);

      if (!targetProfileData && targetRolesList.length === 0 && !targetAuthUser) {
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
        ["tickets", "issued_by"],
        ["tickets", "checked_in_by"],
        ["wristband_issuances", "issued_by"],
        ["wristband_issuances", "replaced_by"],
        ["gate_overrides", "supervisor_id"],
        ["matches", "conductor_id"],
        ["matches", "submitted_by"],
        ["matches", "confirmed_by"],
        ["matches", "last_undone_by"],
        ["match_attendance", "verified_by"],
        ["match_disputes", "reported_by"],
        ["match_disputes", "resolved_by"],
        ["match_result_history", "actor_id"],
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
          .ilike("email", targetEmail)
          .eq("status", "pending");
      }

      const { error: delPermErr } = await adminClient
        .from("crm_user_permissions")
        .delete()
        .eq("user_id", targetUserId);
      if (delPermErr) return jsonResponse({ ok: false, error: delPermErr.message }, 500);

      const { error: delRoleErr } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", targetUserId);
      if (delRoleErr) {
        return jsonResponse({ ok: false, error: delRoleErr.message }, 500);
      }

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

      if (targetAuthUser) {
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
