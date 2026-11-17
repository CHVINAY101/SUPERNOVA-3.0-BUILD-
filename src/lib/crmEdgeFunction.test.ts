import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

function loadEdgeHandlerModule() {
  const edgePath = path.resolve(process.cwd(), "CRM_EDGE_FUNCTION.ts");
  const source = fs.readFileSync(edgePath, "utf8").replace(
    'import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";',
    "const createClient = () => { throw new Error('inject createAdminClient'); };"
  );

  const transformed = esbuild.transformSync(source, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  });

  const mod = { exports: {} as any };
  const fn = new Function(
    "exports",
    "require",
    "module",
    "Request",
    "Response",
    "Headers",
    transformed.code
  );
  fn(mod.exports, require, mod, globalThis.Request, globalThis.Response, globalThis.Headers);
  return mod.exports as {
    handleManageCrmUsersRequest: (req: Request, deps?: any) => Promise<Response>;
  };
}

const { handleManageCrmUsersRequest } = loadEdgeHandlerModule();

interface MockDbState {
  authUsers: Map<string, any>;
  profiles: Map<string, any>;
  userRoles: Array<{ user_id: string; role: string; assigned_by?: string; created_at?: string }>;
  overrides: Array<{ user_id: string; permission_key: string; allowed: boolean }>;
  invitations: Array<any>;
  auditLogs: Array<any>;
  forceQueryErrorTable?: string;
  signOutCalled: boolean;
  deletedAuthIds: string[];
  banCalls: Array<{ id: string; ban_duration?: string }>;
}

function createBaseState(): MockDbState {
  const authUsers = new Map<string, any>();
  const superId = "11111111-1111-4111-8111-111111111111";
  const staffId = "22222222-2222-4222-8222-222222222222";
  const viewerId = "33333333-3333-4333-8333-333333333333";
  const crmAdminId = "44444444-4444-4444-8444-444444444444";
  const unrelatedAuthId = "55555555-5555-4555-8555-555555555555";
  const noProfileStaffId = "66666666-6666-4666-8666-666666666666";

  authUsers.set(superId, { id: superId, email: "super@supernova.test", user_metadata: { full_name: "Root Super" } });
  authUsers.set(staffId, { id: staffId, email: "gate@supernova.test", user_metadata: { full_name: "Gate Staff" } });
  authUsers.set(viewerId, { id: viewerId, email: "viewer@supernova.test", user_metadata: { full_name: "Read Only" } });
  authUsers.set(crmAdminId, { id: crmAdminId, email: "crmadmin@supernova.test", user_metadata: { full_name: "Delegated Admin" } });
  authUsers.set(unrelatedAuthId, { id: unrelatedAuthId, email: "external@student.test", user_metadata: { full_name: "External User" } });
  authUsers.set(noProfileStaffId, { id: noProfileStaffId, email: "orphan@supernova.test", user_metadata: { full_name: "Orphan User" } });

  const profiles = new Map<string, any>();
  profiles.set(superId, {
    id: superId,
    email: "super@supernova.test",
    full_name: "Root Super",
    display_name: "Root Super",
    account_status: "active",
    created_at: "2026-11-01T00:00:00Z",
  });
  profiles.set(staffId, {
    id: staffId,
    email: "gate@supernova.test",
    full_name: "Gate Staff",
    display_name: "Gate Staff",
    account_status: "active",
    created_at: "2026-11-01T00:00:00Z",
  });
  profiles.set(viewerId, {
    id: viewerId,
    email: "viewer@supernova.test",
    full_name: "Read Only",
    display_name: "Read Only",
    account_status: "active",
    created_at: "2026-11-01T00:00:00Z",
  });
  profiles.set(crmAdminId, {
    id: crmAdminId,
    email: "crmadmin@supernova.test",
    full_name: "Delegated Admin",
    display_name: "Delegated Admin",
    account_status: "active",
    created_at: "2026-11-01T00:00:00Z",
  });

  const userRoles = [
    { user_id: superId, role: "super_admin", created_at: "2026-11-01T00:00:00Z" },
    { user_id: staffId, role: "registration_staff", created_at: "2026-11-01T00:00:00Z" },
    { user_id: viewerId, role: "viewer", created_at: "2026-11-01T00:00:00Z" },
    { user_id: crmAdminId, role: "crm_admin", created_at: "2026-11-01T00:00:00Z" },
    { user_id: noProfileStaffId, role: "viewer", created_at: "2026-11-01T00:00:00Z" },
  ];

  // Give crm_admin user_management:view, invite, edit, deactivate (NOT delete, NOT assign_permissions by default)
  const overrides = [
    { user_id: crmAdminId, permission_key: "user_management:view", allowed: true },
    { user_id: crmAdminId, permission_key: "user_management:invite", allowed: true },
    { user_id: crmAdminId, permission_key: "user_management:edit", allowed: true },
    { user_id: crmAdminId, permission_key: "user_management:deactivate", allowed: true },
  ];

  return {
    authUsers,
    profiles,
    userRoles,
    overrides,
    invitations: [],
    auditLogs: [
      { id: "aud-1", actor_id: staffId, action: "visitor_checked_in" },
    ],
    signOutCalled: false,
    deletedAuthIds: [],
    banCalls: [],
  };
}

function createMockAdminClient(state: MockDbState) {
  let nextSeq = 100;

  const getRowsForTable = (table: string): any[] => {
    if (table === "profiles") return Array.from(state.profiles.values());
    if (table === "user_roles") return [...state.userRoles];
    if (table === "crm_user_permissions") return [...state.overrides];
    if (table === "crm_invitations") return [...state.invitations];
    if (table === "audit_logs") return [...state.auditLogs];
    return [];
  };

  const makeQuery = (table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    const execute = (singleMode: "many" | "maybeSingle") => {
      if (state.forceQueryErrorTable === table) {
        return Promise.resolve({ data: null, error: { message: `Simulated DB error on ${table}` } });
      }
      const rows = getRowsForTable(table).filter((r) => filters.every((f) => f(r)));
      if (singleMode === "maybeSingle") {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      }
      return Promise.resolve({ data: rows, error: null });
    };

    const builder: any = {
      select() {
        return builder;
      },
      eq(col: string, val: any) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      ilike(col: string, val: string) {
        filters.push((r) => String(r[col] || "").toLowerCase() === String(val || "").toLowerCase());
        return builder;
      },
      order() {
        return builder;
      },
      maybeSingle() {
        return execute("maybeSingle");
      },
      then(resolve: any, reject: any) {
        return execute("many").then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    auth: {
      async getUser(jwt: string) {
        if (!jwt.startsWith("uid:")) {
          return { data: { user: null }, error: { message: "Invalid JWT" } };
        }
        const uid = jwt.slice(4);
        const u = state.authUsers.get(uid);
        if (!u) return { data: { user: null }, error: { message: "User not found" } };
        return { data: { user: u }, error: null };
      },
      admin: {
        async listUsers() {
          return { data: { users: Array.from(state.authUsers.values()) }, error: null };
        },
        async getUserById(id: string) {
          const u = state.authUsers.get(id);
          if (!u) return { data: { user: null }, error: { message: "User not found" } };
          return { data: { user: u }, error: null };
        },
        async createUser(params: any) {
          nextSeq += 1;
          const id = `99999999-9999-4999-8999-${String(nextSeq).padStart(12, "0")}`;
          const u = {
            id,
            email: params.email,
            user_metadata: params.user_metadata || {},
          };
          state.authUsers.set(id, u);
          return { data: { user: u }, error: null };
        },
        async inviteUserByEmail(email: string, opts: any) {
          nextSeq += 1;
          const id = `88888888-8888-4888-8888-${String(nextSeq).padStart(12, "0")}`;
          const u = { id, email, user_metadata: opts?.data || {} };
          state.authUsers.set(id, u);
          return { data: { user: u }, error: null };
        },
        async updateUserById(id: string, attrs: any) {
          const u = state.authUsers.get(id);
          if (!u) return { data: { user: null }, error: { message: "User not found" } };
          if (attrs.ban_duration !== undefined) {
            state.banCalls.push({ id, ban_duration: attrs.ban_duration });
            u.ban_duration = attrs.ban_duration;
          }
          if (attrs.user_metadata) {
            u.user_metadata = { ...u.user_metadata, ...attrs.user_metadata };
          }
          return { data: { user: u }, error: null };
        },
        async deleteUser(id: string) {
          state.deletedAuthIds.push(id);
          state.authUsers.delete(id);
          return { data: {}, error: null };
        },
        async signOut() {
          state.signOutCalled = true;
          throw new Error("admin.signOut must never be called with user UUID");
        },
      },
    },
    from(table: string) {
      return makeQuery(table);
    },
    async rpc(fnName: string, args: Record<string, any>) {
      if (fnName === "crm_admin_provision_user_tx") {
        const nextStatus = args.p_mode === "direct" ? "active" : "invited";
        state.profiles.set(args.p_target_user_id, {
          id: args.p_target_user_id,
          email: args.p_email,
          full_name: args.p_full_name,
          display_name: args.p_full_name,
          account_status: nextStatus,
          created_at: args.p_now,
        });
        state.userRoles = state.userRoles.filter((r) => r.user_id !== args.p_target_user_id);
        state.userRoles.push({ user_id: args.p_target_user_id, role: args.p_role, assigned_by: args.p_actor_id });
        state.overrides = state.overrides.filter((o) => o.user_id !== args.p_target_user_id);
        for (const ov of args.p_overrides || []) {
          state.overrides.push({
            user_id: args.p_target_user_id,
            permission_key: ov.permission_key,
            allowed: ov.allowed,
          });
        }
        if (args.p_mode === "invite") {
          state.invitations.push({
            id: `inv-${state.invitations.length + 1}`,
            email: args.p_email,
            full_name: args.p_full_name,
            role: args.p_role,
            status: "pending",
            created_at: args.p_now,
          });
        }
        return { data: { ok: true, userId: args.p_target_user_id, status: nextStatus }, error: null };
      }

      if (fnName === "crm_admin_update_user_tx") {
        const prof = state.profiles.get(args.p_target_user_id);
        if (!prof) return { data: { ok: false, status: 404, error: "Target user is not a confirmed CRM staff account." }, error: null };
        const roleRow = state.userRoles.find((r) => r.user_id === args.p_target_user_id);
        const curRole = roleRow?.role || "viewer";
        const nextRole = args.p_update_role ? args.p_role : curRole;
        const activeSupers = state.userRoles.filter(
          (r) => r.role === "super_admin" && r.user_id !== args.p_target_user_id && state.profiles.get(r.user_id)?.account_status === "active"
        );
        if (prof.account_status === "active" && curRole === "super_admin" && nextRole !== "super_admin" && activeSupers.length < 1) {
          return { data: { ok: false, status: 409, error: "Cannot demote the last active Super Admin." }, error: null };
        }
        if (args.p_update_name) {
          prof.full_name = args.p_full_name;
          prof.display_name = args.p_full_name;
        }
        if (args.p_update_role) {
          state.userRoles = state.userRoles.filter((r) => r.user_id !== args.p_target_user_id);
          state.userRoles.push({ user_id: args.p_target_user_id, role: nextRole, assigned_by: args.p_actor_id });
        }
        if (args.p_update_overrides) {
          state.overrides = state.overrides.filter((o) => o.user_id !== args.p_target_user_id);
          if (nextRole !== "super_admin") {
            for (const ov of args.p_overrides || []) {
              state.overrides.push({
                user_id: args.p_target_user_id,
                permission_key: ov.permission_key,
                allowed: ov.allowed,
              });
            }
          }
        }
        return {
          data: {
            ok: true,
            userId: args.p_target_user_id,
            fullName: prof.full_name,
            role: nextRole,
            overrides: state.overrides.filter((o) => o.user_id === args.p_target_user_id),
          },
          error: null,
        };
      }

      if (fnName === "crm_admin_update_status_tx") {
        const prof = state.profiles.get(args.p_target_user_id);
        if (!prof) return { data: { ok: false, status: 404, error: "Target user is not a confirmed CRM staff account." }, error: null };
        const roleRow = state.userRoles.find((r) => r.user_id === args.p_target_user_id);
        const activeSupers = state.userRoles.filter(
          (r) => r.role === "super_admin" && r.user_id !== args.p_target_user_id && state.profiles.get(r.user_id)?.account_status === "active"
        );
        if (prof.account_status === "active" && args.p_next_status !== "active" && roleRow?.role === "super_admin" && activeSupers.length < 1) {
          return { data: { ok: false, status: 409, error: "Cannot deactivate or revoke the last active Super Admin." }, error: null };
        }
        prof.account_status = args.p_next_status;
        return { data: { ok: true, userId: args.p_target_user_id, accountStatus: args.p_next_status }, error: null };
      }

      if (fnName === "crm_admin_delete_user_tx") {
        const prof = state.profiles.get(args.p_target_user_id);
        if (!prof) return { data: { ok: false, status: 404, error: "Target user is not a confirmed CRM staff account." }, error: null };
        const roleRows = state.userRoles.filter((r) => r.user_id === args.p_target_user_id);
        const activeSupers = state.userRoles.filter(
          (r) => r.role === "super_admin" && r.user_id !== args.p_target_user_id && state.profiles.get(r.user_id)?.account_status === "active"
        );
        if (prof.account_status === "active" && roleRows.some((r) => r.role === "super_admin") && activeSupers.length < 1) {
          return { data: { ok: false, status: 409, error: "Cannot permanently delete the last active Super Admin." }, error: null };
        }
        state.auditLogs.push({
          id: `aud-${state.auditLogs.length + 1}`,
          actor_id: args.p_actor_id,
          action: "crm_user_deleted",
          entity_id: args.p_target_user_id,
        });
        state.overrides = state.overrides.filter((o) => o.user_id !== args.p_target_user_id);
        state.userRoles = state.userRoles.filter((r) => r.user_id !== args.p_target_user_id);
        state.profiles.delete(args.p_target_user_id);
        return {
          data: { ok: true, deletedUserId: args.p_target_user_id, email: prof.email },
          error: null,
        };
      }

      return { data: null, error: { message: `Unknown RPC ${fnName}` } };
    },
  };
}

async function callEdge(state: MockDbState, opts: { method?: string; token?: string; body?: unknown }) {
  const method = opts.method ?? "POST";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token !== undefined) headers.Authorization = opts.token;
  const req = new Request("https://cirreovughlncadrbvcn.supabase.co/functions/v1/manage-crm-users", {
    method,
    headers,
    body: method === "POST" && opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await handleManageCrmUsersRequest(req, {
    getEnv: (k: string) =>
      k === "SUPABASE_URL"
        ? "https://cirreovughlncadrbvcn.supabase.co"
        : k === "SUPABASE_SERVICE_ROLE_KEY"
        ? "test-service-role-key"
        : undefined,
    createAdminClient: () => createMockAdminClient(state),
  });
  const json = res.status === 204 ? null : await res.json();
  return { status: res.status, json, headers: res.headers };
}

describe("manage-crm-users Edge Function Security & Lifecycle Tests", () => {
  const superId = "11111111-1111-4111-8111-111111111111";
  const staffId = "22222222-2222-4222-8222-222222222222";
  const viewerId = "33333333-3333-4333-8333-333333333333";
  const crmAdminId = "44444444-4444-4444-8444-444444444444";
  const unrelatedAuthId = "55555555-5555-4555-8555-555555555555";
  const noProfileStaffId = "66666666-6666-4666-8666-666666666666";

  it("Rejects missing/invalid JWT (401) and returns CORS preflight cleanly", async () => {
    const state = createBaseState();
    const opt = await callEdge(state, { method: "OPTIONS" });
    assert.equal(opt.status, 204);
    assert.equal(opt.headers.get("Access-Control-Allow-Origin"), "*");

    const noAuth = await callEdge(state, { body: { action: "list_users" } });
    assert.equal(noAuth.status, 401);

    const badJwt = await callEdge(state, { token: "Bearer bad-token", body: { action: "list_users" } });
    assert.equal(badJwt.status, 401);
  });

  it("Fails closed on missing profile, missing account_status, deactivated actor, or DB lookup failure", async () => {
    const state = createBaseState();

    // Actor in user_roles without profile row -> 403 (never defaults to 'active')
    const orphanRes = await callEdge(state, { token: `Bearer uid:${noProfileStaffId}`, body: { action: "list_users" } });
    assert.equal(orphanRes.status, 403);

    // Actor with deactivated account_status -> 403
    state.profiles.get(superId).account_status = "deactivated";
    const deactActorRes = await callEdge(state, { token: `Bearer uid:${superId}`, body: { action: "list_users" } });
    assert.equal(deactActorRes.status, 403);

    // DB lookup error on profiles -> fail closed 500
    state.profiles.get(superId).account_status = "active";
    state.forceQueryErrorTable = "profiles";
    const errRes = await callEdge(state, { token: `Bearer uid:${superId}`, body: { action: "list_users" } });
    assert.equal(errRes.status, 500);
  });

  it("Blocks ordinary staff (viewer & registration_staff) from listing or mutating CRM users (403)", async () => {
    const state = createBaseState();
    for (const actor of [viewerId, staffId]) {
      const listRes = await callEdge(state, { token: `Bearer uid:${actor}`, body: { action: "list_users" } });
      assert.equal(listRes.status, 403);

      const createRes = await callEdge(state, {
        token: `Bearer uid:${actor}`,
        body: {
          action: "create_user",
          fullName: "Attacker User",
          email: "atk@supernova.test",
          password: "StrongPassword123!",
          role: "viewer",
        },
      });
      assert.equal(createRes.status, 403);

      const delRes = await callEdge(state, {
        token: `Bearer uid:${actor}`,
        body: { action: "delete_user", targetUserId: staffId === actor ? viewerId : staffId },
      });
      assert.equal(delRes.status, 403);
    }
  });

  it("Requires user_management:delete specifically for permanent deletion (deactivate permission alone -> 403)", async () => {
    const state = createBaseState();
    // crmAdminId has user_management:deactivate, NOT user_management:delete
    const denied = await callEdge(state, {
      token: `Bearer uid:${crmAdminId}`,
      body: { action: "delete_user", targetUserId: viewerId },
    });
    assert.equal(denied.status, 403);
    assert.match(denied.json.error, /user_management:delete/);
    assert.equal(state.profiles.has(viewerId), true);
  });

  it("Requires user_management:assign_permissions when creating/inviting with custom overrides", async () => {
    const state = createBaseState();
    // crmAdminId has user_management:invite, NOT user_management:assign_permissions
    const withCustomDenied = await callEdge(state, {
      token: `Bearer uid:${crmAdminId}`,
      body: {
        action: "create_user",
        fullName: "Custom Candidate",
        email: "custom@supernova.test",
        password: "StrongPassword123!",
        role: "registration_staff",
        overrides: { "visitor:export": true },
      },
    });
    assert.equal(withCustomDenied.status, 403);
    assert.match(withCustomDenied.json.error, /user_management:assign_permissions/);

    // Same actor CAN create with default role permissions (empty overrides)
    const defaultAllowed = await callEdge(state, {
      token: `Bearer uid:${crmAdminId}`,
      body: {
        action: "create_user",
        fullName: "Default Candidate",
        email: "default@supernova.test",
        password: "StrongPassword123!",
        role: "registration_staff",
        overrides: {},
      },
    });
    assert.equal(defaultAllowed.status, 200);
    assert.equal(defaultAllowed.json.ok, true);
  });

  it("Validates delegated permissions against target DB role & existing DB overrides (ignores payload.role)", async () => {
    const state = createBaseState();
    // Grant assign_permissions to crmAdminId (who does NOT have system_settings:manage)
    state.overrides.push({
      user_id: crmAdminId,
      permission_key: "user_management:assign_permissions",
      allowed: true,
    });

    // Give viewerId an explicit override (e.g. esports:edit = true, which crmAdminId ALSO holds)
    state.overrides.push({ user_id: viewerId, permission_key: "system_settings:manage", allowed: true });

    // 1. update_user_permissions ignores client-supplied payload.role ("viewer") if target's DB role is super_admin,
    //    or if actor tries to sneak a permission they don't hold -> 403
    const escPerm = await callEdge(state, {
      token: `Bearer uid:${crmAdminId}`,
      body: {
        action: "update_user_permissions",
        targetUserId: viewerId,
        role: "super_admin", // spoofed client role context must be ignored
        overrides: [{ permission_key: "user_management:delete", allowed: true }],
      },
    });
    assert.equal(escPerm.status, 403);

    // 2. update_user role change without overrides payload must STILL check existing DB overrides!
    // Since viewerId currently has system_settings:manage in DB, changing role without clearing overrides is blocked for non-super-admin
    const roleChangeBlocked = await callEdge(state, {
      token: `Bearer uid:${crmAdminId}`,
      body: {
        action: "update_user",
        targetUserId: viewerId,
        role: "content_manager",
      },
    });
    assert.equal(roleChangeBlocked.status, 403);
    assert.match(roleChangeBlocked.json.error, /system_settings:manage/);
  });

  it("Limits list_users and mutations strictly to confirmed CRM staff (never touches unrelated Auth users)", async () => {
    const state = createBaseState();
    const listRes = await callEdge(state, {
      token: `Bearer uid:${superId}`,
      body: { action: "list_users" },
    });
    assert.equal(listRes.status, 200);
    const listedIds = listRes.json.users.map((u: any) => u.user_id);
    assert.equal(listedIds.includes(unrelatedAuthId), false);
    assert.equal(listedIds.includes(noProfileStaffId), false);
    assert.equal(listedIds.includes(staffId), true);

    for (const action of ["update_user_status", "delete_user"]) {
      const res = await callEdge(state, {
        token: `Bearer uid:${superId}`,
        body: {
          action,
          targetUserId: unrelatedAuthId,
          ...(action === "update_user_status" ? { accountStatus: "deactivated" } : {}),
        },
      });
      assert.equal(res.status, 404);
      assert.equal(state.authUsers.has(unrelatedAuthId), true);
    }
  });

  it("Super Admin full lifecycle: create, edit, deactivate, reactivate, and permanently delete (preserving audit_logs, no signOut)", async () => {
    const state = createBaseState();

    // 1. Create active staff user with custom permission override
    const createRes = await callEdge(state, {
      token: `Bearer uid:${superId}`,
      body: {
        action: "create_user",
        fullName: "Priya Nair",
        email: "priya@supernova.test",
        password: "StrongPassword123!",
        role: "registration_staff",
        overrides: { "visitor:export": true },
      },
    });
    assert.equal(createRes.status, 200);
    const newId = createRes.json.userId;
    assert.ok(newId);

    // 2. Edit role & permissions
    const editRes = await callEdge(state, {
      token: `Bearer uid:${superId}`,
      body: {
        action: "update_user",
        targetUserId: newId,
        fullName: "Priya Nair Updated",
        role: "esports_entry_staff",
        overrides: { "tickets:manage": true },
      },
    });
    assert.equal(editRes.status, 200);
    assert.equal(editRes.json.role, "esports_entry_staff");

    // 3. Deactivate -> DB status updated + Auth banned, NEVER calls invalid signOut()
    const deactRes = await callEdge(state, {
      token: `Bearer uid:${superId}`,
      body: {
        action: "update_user_status",
        targetUserId: newId,
        accountStatus: "deactivated",
      },
    });
    assert.equal(deactRes.status, 200);
    assert.equal(state.profiles.get(newId).account_status, "deactivated");
    assert.equal(state.banCalls.at(-1)?.ban_duration, "876000h");
    assert.equal(state.signOutCalled, false);

    // 4. Reactivate -> DB status active + Auth unbanned
    const reactRes = await callEdge(state, {
      token: `Bearer uid:${superId}`,
      body: {
        action: "update_user_status",
        targetUserId: newId,
        accountStatus: "active",
      },
    });
    assert.equal(reactRes.status, 200);
    assert.equal(state.profiles.get(newId).account_status, "active");
    assert.equal(state.banCalls.at(-1)?.ban_duration, "none");

    // 5. Permanent Delete (on staffId who has an existing historical audit_log row)
    const delRes = await callEdge(state, {
      token: `Bearer uid:${superId}`,
      body: {
        action: "delete_user",
        targetUserId: staffId,
      },
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.json.historicalDataPreserved, true);
    assert.equal(state.profiles.has(staffId), false);
    assert.equal(state.deletedAuthIds.includes(staffId), true);
    // Original historical audit reference must NOT be erased/nullified
    assert.equal(state.auditLogs.find((a) => a.id === "aud-1")?.actor_id, staffId);
  });

  it("Protects last active Super Admin, locks Super Admin targets from non-super-admins, and handles invite_user", async () => {
    const state = createBaseState();

    // Non-super-admin cannot view or mutate super_admin target
    const nonSuperList = await callEdge(state, {
      token: `Bearer uid:${crmAdminId}`,
      body: { action: "list_users" },
    });
    assert.equal(nonSuperList.status, 200);
    assert.equal(nonSuperList.json.users.some((u: any) => u.user_id === superId), false);

    const nonSuperMutate = await callEdge(state, {
      token: `Bearer uid:${crmAdminId}`,
      body: { action: "update_user_status", targetUserId: superId, accountStatus: "deactivated" },
    });
    assert.equal(nonSuperMutate.status, 403);

    // Create second super_admin, then test last-super-admin guard when only 1 active remains
    const addSuper2 = await callEdge(state, {
      token: `Bearer uid:${superId}`,
      body: {
        action: "create_user",
        fullName: "Backup Super",
        email: "super2@supernova.test",
        password: "StrongPassword123!",
        role: "super_admin",
      },
    });
    assert.equal(addSuper2.status, 200);
    const super2Id = addSuper2.json.userId;

    // Deactivate superId using super2 -> allowed since 2 active super admins exist
    const deactFirst = await callEdge(state, {
      token: `Bearer uid:${super2Id}`,
      body: { action: "update_user_status", targetUserId: superId, accountStatus: "deactivated" },
    });
    assert.equal(deactFirst.status, 200);

    // Simulate concurrent race where only 1 active Super Admin remains when RPC commits -> must return 409
    state.profiles.get(superId).account_status = "active";
    state.profiles.get(super2Id).account_status = "deactivated";
    const mockAdmin = createMockAdminClient(state);
    const demoteLast = await mockAdmin.rpc("crm_admin_update_user_tx", {
      p_actor_id: super2Id,
      p_target_user_id: superId,
      p_role: "crm_admin",
      p_update_role: true,
    });
    assert.equal(demoteLast.data.status, 409);

    const deactLast = await mockAdmin.rpc("crm_admin_update_status_tx", {
      p_actor_id: super2Id,
      p_target_user_id: superId,
      p_next_status: "deactivated",
    });
    assert.equal(deactLast.data.status, 409);

    const deleteLast = await mockAdmin.rpc("crm_admin_delete_user_tx", {
      p_actor_id: super2Id,
      p_target_user_id: superId,
    });
    assert.equal(deleteLast.data.status, 409);

    // Reactivate super2 and test invite_user flow
    state.profiles.get(super2Id).account_status = "active";
    const inviteRes = await callEdge(state, {
      token: `Bearer uid:${super2Id}`,
      body: {
        action: "invite_user",
        mode: "invite",
        fullName: "Invited Staff",
        email: "invited@supernova.test",
        role: "viewer",
        redirectTo: "https://ais-dev-gtvpgyx77kg4dppd2w2lyu-799227307816.asia-northeast1.run.app/admin/login?type=invite",
      },
    });
    assert.equal(inviteRes.status, 200);
    assert.equal(inviteRes.json.status, "invited");
    assert.equal(state.invitations.length, 1);
    assert.equal(state.invitations[0].status, "pending");
  });

  it("Static verification of CRM_SETUP.sql & vite.config.ts security corrections", () => {
    const sql = fs.readFileSync(path.resolve(process.cwd(), "CRM_SETUP.sql"), "utf8");
    const viteCfg = fs.readFileSync(path.resolve(process.cwd(), "vite.config.ts"), "utf8");

    // 1. Original admin scope of is_admin()
    const isAdminBlock = sql.match(/CREATE OR REPLACE FUNCTION public\.is_admin\(\)[\s\S]*?\$\$;/i)?.[0] || "";
    assert.match(isAdminBlock, /ur\.role IN \('super_admin', 'crm_admin', 'event_admin'\)/);
    assert.match(isAdminBlock, /JOIN public\.profiles p ON p\.id = ur\.user_id/);
    assert.match(isAdminBlock, /p\.account_status = 'active'/);

    // 9. accept_crm_invite validates status='pending' AND expires_at > now()
    assert.match(sql, /status = 'pending'[\s\S]*?expires_at > now\(\)/);

    // 7. Advisory lock & FOR UPDATE in concurrent super-admin protection
    assert.match(sql, /pg_advisory_xact_lock\(hashtext\('crm_super_admin_guard'\)\)/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.crm_admin_update_user_tx/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.crm_admin_update_status_tx/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.crm_admin_delete_user_tx/);

    // 10. No unrelated visitor/ticket/gate rewrites
    assert.equal(/CREATE OR REPLACE FUNCTION public\.(issue_ticket_for_registration|verify_gate_ticket|submit_visitor_registration_v2)/.test(sql), false);

    // 13. vite.config.ts strict allowedHosts
    assert.equal(/allowedHosts:\s*true/.test(viteCfg), false);
    assert.match(viteCfg, /ais-dev-gtvpgyx77kg4dppd2w2lyu-799227307816\.asia-northeast1\.run\.app/);
    assert.match(viteCfg, /ais-pre-gtvpgyx77kg4dppd2w2lyu-799227307816\.asia-northeast1\.run\.app/);
  });
});
