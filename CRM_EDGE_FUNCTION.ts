/**
 * SUPERNOVA 3.0 — SELF-CONTAINED EDGE FUNCTION: manage-crm-users
 * Target Supabase Project: cirreovughlncadrbvcn
 *
 * REQUIRED SUPABASE DASHBOARD DEPLOYMENT SETTINGS:
 *   1. Function Name / Slug : manage-crm-users
 *   2. Enforce JWT Verification (verify_jwt): OFF (false)
 *      Why: Caller Bearer JWT + active DB role/status/permissions are strictly verified
 *      inside this function via adminClient.auth.getUser(jwt) + user_roles +
 *      profiles.account_status + crm_user_permissions. Keeping gateway verify_jwt OFF
 *      prevents preflight OPTIONS CORS blocks and publishable-key/ES256 gateway errors.
 *   3. Secrets: Uses built-in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically.
 *   4. Prerequisite: Apply CRM_SETUP.sql first so the atomic service_role RPCs and
 *      fail-closed RBAC schema exist before invoking this Edge Function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
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

const VALID_PERMISSION_SET = new Set<string>(ALL_PERMISSION_KEYS);

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

export interface PermissionOverrideRow {
  permission_key: string;
  allowed: boolean;
}

function resolveEffectivePermissions(
  role: string | null | undefined,
  status: string | null | undefined,
  overrides: PermissionOverrideRow[]
): Set<string> {
  if (status !== "active") return new Set<string>();
  const canonical = normalizeRole(role);
  if (!canonical) return new Set<string>();
  if (canonical === "super_admin") return new Set<string>(ALL_PERMISSION_KEYS);

  const effective = new Set<string>(ROLE_DEFAULT_PERMISSIONS[canonical] || []);
  for (const ov of overrides) {
    if (!VALID_PERMISSION_SET.has(ov.permission_key)) continue;
    if (ov.allowed) effective.add(ov.permission_key);
    else effective.delete(ov.permission_key);
  }
  return effective;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = ["invited", "active", "deactivated", "revoked"];
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

function parseOverridesPayloadStrict(
  raw: unknown
): { ok: true; overrides: PermissionOverrideRow[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, overrides: [] };
  }

  const deduped = new Map<string, boolean>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return { ok: false, error: "Permission override entries must be objects." };
      }
      const key = typeof (item as any).permission_key === "string" ? (item as any).permission_key.trim() : "";
      if (!VALID_PERMISSION_SET.has(key)) {
        return { ok: false, error: `Unknown CRM permission key: "${key || "(empty)"}".` };
      }
      if (typeof (item as any).allowed !== "boolean") {
        return { ok: false, error: `Permission "${key}" must specify a boolean allowed flag.` };
      }
      deduped.set(key, (item as any).allowed);
    }
    return {
      ok: true,
      overrides: Array.from(deduped.entries()).map(([permission_key, allowed]) => ({
        permission_key,
        allowed,
      })),
    };
  }

  if (typeof raw === "object") {
    for (const [permissionKey, allowedVal] of Object.entries(raw as Record<string, unknown>)) {
      if (!VALID_PERMISSION_SET.has(permissionKey)) {
        return { ok: false, error: `Unknown CRM permission key: "${permissionKey}".` };
      }
      if (typeof allowedVal !== "boolean") {
        return { ok: false, error: `Permission "${permissionKey}" must specify a boolean allowed flag.` };
      }
      deduped.set(permissionKey, allowedVal);
    }
    return {
      ok: true,
      overrides: Array.from(deduped.entries()).map(([permission_key, allowed]) => ({
        permission_key,
        allowed,
      })),
    };
  }

  return { ok: false, error: "Permission overrides must be an object map or an array." };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getHighestPriorityRole(roleRows: Array<{ role?: string | null }> | null | undefined): string | null {
  if (!Array.isArray(roleRows) || roleRows.length === 0) return null;
  const sorted = [...roleRows]
    .filter((r) => typeof r?.role === "string" && normalizeRole(r.role) !== null)
    .sort((a, b) => (ROLE_PRIORITY[b.role || ""] ?? 0) - (ROLE_PRIORITY[a.role || ""] ?? 0));
  return sorted[0]?.role || null;
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
    if (batch.length < perPage || page >= 100) break;
    page += 1;
  }

  return allUsers;
}

export interface ManageCrmUsersDeps {
  createAdminClient?: (supabaseUrl: string, serviceRoleKey: string) => any;
  getEnv?: (key: string) => string | undefined;
}

export async function handleManageCrmUsersRequest(
  req: Request,
  deps: ManageCrmUsersDeps = {}
): Promise<Response> {
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

    const getEnv =
      deps.getEnv ??
      ((key: string) => (typeof Deno !== "undefined" ? Deno.env.get(key) : undefined));

    const supabaseUrl = getEnv("SUPABASE_URL") ?? "";
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Edge Function environment secrets missing" }, 503);
    }

    const adminClient = deps.createAdminClient
      ? deps.createAdminClient(supabaseUrl, serviceRoleKey)
      : createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

    const {
      data: { user },
      error: userErr,
    } = await adminClient.auth.getUser(jwt);

    if (userErr || !user) {
      return jsonResponse({ ok: false, error: "Unauthorized or expired session" }, 401);
    }

    // Fail-closed authorization lookup: query errors, missing profile, or missing account_status deny access.
    const [
      { data: actorRoles, error: actorRolesErr },
      { data: actorProfile, error: actorProfileErr },
      { data: actorOverrides, error: actorOverridesErr },
    ] = await Promise.all([
      adminClient.from("user_roles").select("role").eq("user_id", user.id),
      adminClient.from("profiles").select("id, account_status").eq("id", user.id).maybeSingle(),
      adminClient
        .from("crm_user_permissions")
        .select("permission_key, allowed")
        .eq("user_id", user.id),
    ]);

    if (actorRolesErr || actorProfileErr || actorOverridesErr) {
      return jsonResponse(
        { ok: false, error: "Forbidden: Authorization lookup failed." },
        500
      );
    }

    const actorRawRole = getHighestPriorityRole(actorRoles);
    const actorCanonicalRole = normalizeRole(actorRawRole);
    const actorStatus = actorProfile?.account_status ?? null;

    if (!actorProfile || !actorCanonicalRole || actorStatus !== "active") {
      return jsonResponse(
        { ok: false, error: "Forbidden: Active CRM account and role required." },
        403
      );
    }

    const isActorSuperAdmin = actorCanonicalRole === "super_admin";
    const actorEffectivePerms = resolveEffectivePermissions(
      actorRawRole,
      actorStatus,
      (actorOverrides || []) as PermissionOverrideRow[]
    );

    const hasActorPerm = (keys: string | string[]): boolean => {
      if (isActorSuperAdmin) return true;
      const list = Array.isArray(keys) ? keys : [keys];
      return list.some((k) => actorEffectivePerms.has(k));
    };

    const assertNoPermissionEscalation = (
      targetRole: string,
      overrides: PermissionOverrideRow[]
    ) => {
      if (isActorSuperAdmin) return;
      const canonicalTarget = normalizeRole(targetRole);
      if (!canonicalTarget) {
        throw new Error("Invalid CRM role specified.");
      }
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
    // 1. LIST CONFIRMED CRM STAFF ACCOUNTS + INVITATIONS + OVERRIDES
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

      if (profilesRes.error) return jsonResponse({ ok: false, error: profilesRes.error.message }, 500);
      if (rolesRes.error) return jsonResponse({ ok: false, error: rolesRes.error.message }, 500);
      if (overridesRes.error) return jsonResponse({ ok: false, error: overridesRes.error.message }, 500);
      if (invitesRes.error) return jsonResponse({ ok: false, error: invitesRes.error.message }, 500);

      const authMap = new Map<string, any>();
      authUsers.forEach((au) => authMap.set(au.id, au));

      const profileMap = new Map<string, any>();
      (profilesRes.data || []).forEach((p: any) => profileMap.set(p.id, p));

      const roleMap = new Map<string, any>();
      (rolesRes.data || []).forEach((r: any) => {
        if (!normalizeRole(r?.role)) return;
        const existing = roleMap.get(r.user_id);
        if (!existing || (ROLE_PRIORITY[r.role] ?? 0) > (ROLE_PRIORITY[existing.role] ?? 0)) {
          roleMap.set(r.user_id, r);
        }
      });

      const overrideMap = new Map<string, PermissionOverrideRow[]>();
      (overridesRes.data || []).forEach((o: any) => {
        if (!VALID_PERMISSION_SET.has(o?.permission_key) || typeof o?.allowed !== "boolean") return;
        const list = overrideMap.get(o.user_id) || [];
        list.push({ permission_key: o.permission_key, allowed: o.allowed });
        overrideMap.set(o.user_id, list);
      });

      // Limit directory strictly to confirmed CRM staff accounts (valid profile + valid CRM role).
      const users = Array.from(profileMap.keys())
        .filter((uid) => {
          const prof = profileMap.get(uid);
          const roleRow = roleMap.get(uid);
          return Boolean(
            prof &&
              VALID_STATUSES.includes(prof.account_status) &&
              roleRow &&
              normalizeRole(roleRow.role)
          );
        })
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
            email: prof.email || authUser?.email || "unknown@supernova",
            full_name:
              prof.full_name ||
              prof.display_name ||
              authUser?.user_metadata?.full_name ||
              (authUser?.email ? authUser.email.split("@")[0] : "CRM User"),
            role: roleRow.role,
            account_status: prof.account_status,
            overrides: overrideMap.get(uid) || [],
            created_at: prof.created_at || roleRow.created_at || authUser?.created_at,
            invited_at: prof.invited_at || null,
            activated_at: prof.activated_at || null,
            deactivated_at: prof.deactivated_at || null,
            revoked_at: prof.revoked_at || null,
            last_login_at: prof.last_login_at || authUser?.last_sign_in_at || null,
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

      const rawOverrides =
        payload.overrides !== undefined ? payload.overrides : payload.customPermissions;
      const parsedOverrides = parseOverridesPayloadStrict(rawOverrides);
      if (!parsedOverrides.ok) {
        return jsonResponse({ ok: false, error: parsedOverrides.error }, 400);
      }
      const overrides = parsedOverrides.overrides;

      // Require separate permission-assignment authorization when custom overrides are provided.
      if (overrides.length > 0 && !hasActorPerm("user_management:assign_permissions")) {
        return jsonResponse(
          {
            ok: false,
            error:
              "Forbidden: user_management:assign_permissions permission is required when assigning custom permissions.",
          },
          403
        );
      }

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

      // Check existing account across ALL Auth pages + profiles table (fail-closed on query error)
      const [allAuthUsers, existingProfileRes] = await Promise.all([
        listAllAuthUsers(adminClient),
        adminClient.from("profiles").select("id, email, account_status").ilike("email", email).maybeSingle(),
      ]);

      if (existingProfileRes.error) {
        return jsonResponse(
          { ok: false, error: `Failed to verify existing CRM directory: ${existingProfileRes.error.message}` },
          500
        );
      }

      const existingAuthUser = allAuthUsers.find(
        (u) => (u.email || "").trim().toLowerCase() === email
      );

      if (existingAuthUser || existingProfileRes.data) {
        const existingStatus = existingProfileRes.data?.account_status || "unlinked Auth account";
        return jsonResponse(
          {
            ok: false,
            error: `Duplicate account: ${email} already exists (${existingStatus}). CRM provisioning refuses to overwrite existing Auth accounts.`,
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

      // Persist profile, role, overrides & invitation atomically via DB RPC; rollback Auth on failure.
      const { data: rpcData, error: rpcErr } = await adminClient.rpc(
        "crm_admin_provision_user_tx",
        {
          p_actor_id: user.id,
          p_target_user_id: newUserId,
          p_email: email,
          p_full_name: fullName,
          p_role: role,
          p_mode: mode,
          p_overrides: overrides,
          p_now: nowIso,
        }
      );

      if (rpcErr || !rpcData?.ok) {
        await adminClient.auth.admin.deleteUser(newUserId).catch(() => {});
        const errStatus = typeof rpcData?.status === "number" ? rpcData.status : 500;
        const errMsg =
          rpcErr?.message || rpcData?.error || "Database error provisioning CRM user.";
        return jsonResponse({ ok: false, error: errMsg }, errStatus);
      }

      return jsonResponse({
        ok: true,
        userId: newUserId,
        email,
        fullName,
        role,
        mode,
        status: rpcData.status,
      });
    }

    // -------------------------------------------------------------------------
    // Shared Fail-Closed Target Guard (Confirmed CRM Staff Only)
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

    const [
      { data: targetRolesData, error: targetRolesErr },
      { data: targetProfileData, error: targetProfileErr },
      { data: targetOverridesData, error: targetOverridesErr },
      authTargetRes,
    ] = await Promise.all([
      adminClient.from("user_roles").select("role").eq("user_id", targetUserId),
      adminClient
        .from("profiles")
        .select("id, email, full_name, display_name, account_status")
        .eq("id", targetUserId)
        .maybeSingle(),
      adminClient
        .from("crm_user_permissions")
        .select("permission_key, allowed")
        .eq("user_id", targetUserId),
      adminClient.auth.admin.getUserById(targetUserId),
    ]);

    if (targetRolesErr || targetProfileErr || targetOverridesErr) {
      return jsonResponse(
        { ok: false, error: "Failed to load target CRM staff record." },
        500
      );
    }

    if (authTargetRes?.error) {
      const msg = String(authTargetRes.error.message || "").toLowerCase();
      if (!msg.includes("not found") && !msg.includes("user not found")) {
        return jsonResponse(
          { ok: false, error: `Failed to verify Auth user: ${authTargetRes.error.message}` },
          500
        );
      }
    }

    const targetCurrentRole = getHighestPriorityRole(targetRolesData);
    const targetStatus = targetProfileData?.account_status ?? null;

    // Limit account management strictly to confirmed CRM staff accounts (valid profile + valid CRM role).
    if (
      !targetProfileData ||
      !VALID_STATUSES.includes(String(targetStatus)) ||
      !targetCurrentRole ||
      !normalizeRole(targetCurrentRole)
    ) {
      return jsonResponse(
        { ok: false, error: "Target user is not a confirmed CRM staff account." },
        404
      );
    }

    const targetExistingOverrides: PermissionOverrideRow[] = (targetOverridesData || []).filter(
      (o: any) => VALID_PERMISSION_SET.has(o?.permission_key) && typeof o?.allowed === "boolean"
    );

    const targetIsSuperAdmin = normalizeRole(targetCurrentRole) === "super_admin";
    if (!isActorSuperAdmin && targetIsSuperAdmin) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Forbidden: Only a Super Admin can modify, deactivate, or delete a Super Admin account.",
        },
        403
      );
    }

    // -------------------------------------------------------------------------
    // 3. COMBINED UPDATE USER (NAME + ROLE + PERMISSION OVERRIDES)
    // -------------------------------------------------------------------------
    if (action === "update_user") {
      const wantsName = typeof payload.fullName === "string";
      const wantsRole = typeof payload.role === "string";
      const wantsEditDetails = wantsName || wantsRole;
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
          {
            ok: false,
            error: "Forbidden: user_management:assign_permissions permission required.",
          },
          403
        );
      }
      if (!wantsEditDetails && !wantsPerms) {
        return jsonResponse({ ok: false, error: "No update fields provided." }, 400);
      }

      const nextFullName = wantsName ? payload.fullName.trim() : undefined;
      if (nextFullName !== undefined && (nextFullName.length < 2 || nextFullName.length > 120)) {
        return jsonResponse(
          { ok: false, error: "Full name must be between 2 and 120 characters." },
          400
        );
      }

      const nextRole = wantsRole ? payload.role.trim() : targetCurrentRole;
      if (!VALID_ROLES.includes(nextRole)) {
        return jsonResponse({ ok: false, error: "Invalid CRM role specified." }, 400);
      }

      let effectiveOverrides = targetExistingOverrides;
      if (wantsPerms) {
        const parsed = parseOverridesPayloadStrict(
          payload.overrides !== undefined ? payload.overrides : payload.customPermissions
        );
        if (!parsed.ok) {
          return jsonResponse({ ok: false, error: parsed.error }, 400);
        }
        effectiveOverrides = parsed.overrides;
      }

      // Always evaluate delegation against authoritative DB role / DB overrides + requested deltas
      if (wantsRole || wantsPerms) {
        try {
          assertNoPermissionEscalation(nextRole, effectiveOverrides);
        } catch (escErr: any) {
          return jsonResponse({ ok: false, error: escErr.message }, 403);
        }
      }

      const nowIso = new Date().toISOString();
      const { data: rpcData, error: rpcErr } = await adminClient.rpc(
        "crm_admin_update_user_tx",
        {
          p_actor_id: user.id,
          p_target_user_id: targetUserId,
          p_full_name: nextFullName ?? null,
          p_update_name: wantsName,
          p_role: nextRole,
          p_update_role: wantsRole && nextRole !== targetCurrentRole,
          p_overrides: effectiveOverrides,
          p_update_overrides: wantsPerms,
          p_audit_action: "crm_user_updated",
          p_now: nowIso,
        }
      );

      if (rpcErr || !rpcData?.ok) {
        const errStatus = typeof rpcData?.status === "number" ? rpcData.status : 500;
        const errMsg = rpcErr?.message || rpcData?.error || "Failed to update CRM user.";
        return jsonResponse({ ok: false, error: errMsg }, errStatus);
      }

      if (nextFullName !== undefined && authTargetRes?.data?.user) {
        await adminClient.auth.admin
          .updateUserById(targetUserId, {
            user_metadata: {
              ...(authTargetRes.data.user.user_metadata || {}),
              full_name: nextFullName,
            },
          })
          .catch(() => {});
      }

      return jsonResponse({
        ok: true,
        userId: targetUserId,
        fullName: rpcData.fullName ?? nextFullName ?? targetProfileData.full_name ?? null,
        role: rpcData.role ?? nextRole,
        overrides: Array.isArray(rpcData.overrides) ? rpcData.overrides : effectiveOverrides,
      });
    }

    // -------------------------------------------------------------------------
    // 4. LEGACY UPDATE USER ROLE (Atomic RPC + Authoritative Existing Overrides)
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

      const clearOverrides = Boolean(payload.clearOverrides);
      if (clearOverrides && !hasActorPerm("user_management:assign_permissions")) {
        return jsonResponse(
          {
            ok: false,
            error: "Forbidden: user_management:assign_permissions required to clear overrides.",
          },
          403
        );
      }

      const effectiveOverrides = clearOverrides ? [] : targetExistingOverrides;
      try {
        assertNoPermissionEscalation(nextRole, effectiveOverrides);
      } catch (escErr: any) {
        return jsonResponse({ ok: false, error: escErr.message }, 403);
      }

      const nowIso = new Date().toISOString();
      const { data: rpcData, error: rpcErr } = await adminClient.rpc(
        "crm_admin_update_user_tx",
        {
          p_actor_id: user.id,
          p_target_user_id: targetUserId,
          p_full_name: null,
          p_update_name: false,
          p_role: nextRole,
          p_update_role: true,
          p_overrides: effectiveOverrides,
          p_update_overrides: clearOverrides,
          p_audit_action: "crm_user_role_updated",
          p_now: nowIso,
        }
      );

      if (rpcErr || !rpcData?.ok) {
        const errStatus = typeof rpcData?.status === "number" ? rpcData.status : 500;
        const errMsg = rpcErr?.message || rpcData?.error || "Failed to update CRM role.";
        return jsonResponse({ ok: false, error: errMsg }, errStatus);
      }

      return jsonResponse({ ok: true, userId: targetUserId, role: nextRole });
    }

    // -------------------------------------------------------------------------
    // 5. LEGACY UPDATE USER CUSTOM PERMISSIONS (Ignores client-supplied role)
    // -------------------------------------------------------------------------
    if (action === "update_user_permissions") {
      if (!hasActorPerm("user_management:assign_permissions")) {
        return jsonResponse(
          { ok: false, error: "Forbidden: user_management:assign_permissions permission required." },
          403
        );
      }

      const parsed = parseOverridesPayloadStrict(
        payload.overrides !== undefined ? payload.overrides : payload.customPermissions
      );
      if (!parsed.ok) {
        return jsonResponse({ ok: false, error: parsed.error }, 400);
      }
      const overrides = parsed.overrides;

      // Always validate against the target's authoritative DB role, never payload.role
      try {
        assertNoPermissionEscalation(targetCurrentRole, overrides);
      } catch (escErr: any) {
        return jsonResponse({ ok: false, error: escErr.message }, 403);
      }

      const nowIso = new Date().toISOString();
      const { data: rpcData, error: rpcErr } = await adminClient.rpc(
        "crm_admin_update_user_tx",
        {
          p_actor_id: user.id,
          p_target_user_id: targetUserId,
          p_full_name: null,
          p_update_name: false,
          p_role: targetCurrentRole,
          p_update_role: false,
          p_overrides: overrides,
          p_update_overrides: true,
          p_audit_action: "crm_user_permissions_updated",
          p_now: nowIso,
        }
      );

      if (rpcErr || !rpcData?.ok) {
        const errStatus = typeof rpcData?.status === "number" ? rpcData.status : 500;
        const errMsg =
          rpcErr?.message || rpcData?.error || "Failed to update custom permissions.";
        return jsonResponse({ ok: false, error: errMsg }, errStatus);
      }

      return jsonResponse({
        ok: true,
        userId: targetUserId,
        overrides: Array.isArray(rpcData.overrides) ? rpcData.overrides : overrides,
      });
    }

    // -------------------------------------------------------------------------
    // 6. UPDATE USER ACCOUNT STATUS (active / deactivated / revoked)
    //    Atomic DB lock first, then Auth ban_duration. No invalid admin.signOut.
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

      const nowIso = new Date().toISOString();
      const { data: rpcData, error: rpcErr } = await adminClient.rpc(
        "crm_admin_update_status_tx",
        {
          p_actor_id: user.id,
          p_target_user_id: targetUserId,
          p_next_status: nextStatus,
          p_now: nowIso,
        }
      );

      if (rpcErr || !rpcData?.ok) {
        const errStatus = typeof rpcData?.status === "number" ? rpcData.status : 500;
        const errMsg =
          rpcErr?.message || rpcData?.error || "Failed to update CRM account status.";
        return jsonResponse({ ok: false, error: errMsg }, errStatus);
      }

      if (authTargetRes?.data?.user) {
        const { error: banErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
          ban_duration: nextStatus === "active" || nextStatus === "invited" ? "none" : "876000h",
        });
        if (banErr) {
          // Compensate DB status change so Auth ban & DB status never diverge
          await adminClient.rpc("crm_admin_update_status_tx", {
            p_actor_id: user.id,
            p_target_user_id: targetUserId,
            p_next_status: targetStatus,
            p_now: new Date().toISOString(),
          });
          return jsonResponse(
            { ok: false, error: `Auth status update failed: ${banErr.message}` },
            500
          );
        }
      }

      return jsonResponse({ ok: true, userId: targetUserId, accountStatus: nextStatus });
    }

    // -------------------------------------------------------------------------
    // 7. PERMANENTLY DELETE CRM STAFF ACCOUNT (PRESERVING HISTORICAL DATA)
    //    Requires user_management:delete ONLY. Never touches audit_logs history.
    // -------------------------------------------------------------------------
    if (action === "delete_user") {
      if (!hasActorPerm("user_management:delete")) {
        return jsonResponse(
          { ok: false, error: "Forbidden: user_management:delete permission required." },
          403
        );
      }

      const nowIso = new Date().toISOString();
      const { data: rpcData, error: rpcErr } = await adminClient.rpc(
        "crm_admin_delete_user_tx",
        {
          p_actor_id: user.id,
          p_target_user_id: targetUserId,
          p_now: nowIso,
        }
      );

      if (rpcErr || !rpcData?.ok) {
        const errStatus = typeof rpcData?.status === "number" ? rpcData.status : 500;
        const errMsg =
          rpcErr?.message || rpcData?.error || "Failed to delete CRM staff account.";
        return jsonResponse({ ok: false, error: errMsg }, errStatus);
      }

      if (authTargetRes?.data?.user) {
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
        email: rpcData.email ?? targetProfileData.email ?? null,
        historicalDataPreserved: true,
      });
    }

    return jsonResponse({ ok: false, error: `Unknown action: ${String(action)}` }, 400);
  } catch (err: any) {
    return jsonResponse({ ok: false, error: err?.message || "Internal server error" }, 500);
  }
}

if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  Deno.serve((req) => handleManageCrmUsersRequest(req));
}
