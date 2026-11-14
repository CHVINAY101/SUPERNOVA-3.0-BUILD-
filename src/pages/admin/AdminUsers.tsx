import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { AdminRole, AccountStatus, CrmUserSummary, CrmInvitation } from "@/types/database";
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_METADATA,
  getRoleLabel,
  normalizeRole,
  resolveEffectivePermissions,
  validateCrmUserMutation,
  type CanonicalCrmRole,
  type PermissionKey,
} from "@/lib/rbac";
import {
  ShieldCheck,
  UserPlus,
  Search,
  RefreshCw,
  Edit3,
  Ban,
  CheckCircle2,
  AlertTriangle,
  X,
  Lock,
  Clock,
  ShieldAlert,
  UserX,
  UserCheck,
} from "lucide-react";

const CANONICAL_ROLES: CanonicalCrmRole[] = [
  "super_admin",
  "crm_admin",
  "registration_staff",
  "participation_manager",
  "esports_manager",
  "content_manager",
  "viewer",
];

function statusBadgeClasses(status: AccountStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "invited":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "deactivated":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "revoked":
      return "bg-rose-50 text-rose-800 border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export default function AdminUsers() {
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const [users, setUsers] = useState<CrmUserSummary[]>([]);
  const [invitations, setInvitations] = useState<CrmInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendWarning, setBackendWarning] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Invite Modal State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CanonicalCrmRole>("registration_staff");
  const [invitePermSet, setInvitePermSet] = useState<Set<PermissionKey>>(
    new Set(ROLE_DEFAULT_PERMISSIONS.registration_staff)
  );
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Edit Role & Permissions Modal State
  const [editTarget, setEditTarget] = useState<CrmUserSummary | null>(null);
  const [editRole, setEditRole] = useState<CanonicalCrmRole>("viewer");
  const [editPermSet, setEditPermSet] = useState<Set<PermissionKey>>(new Set());
  const [savingEdit, setSavingEdit] = useState(false);

  // Status Mutation Modal State
  const [statusTarget, setStatusTarget] = useState<{
    user: CrmUserSummary;
    nextStatus: AccountStatus;
  } | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  const canInvite = isSuperAdmin || hasPermission("user_management:invite");
  const canEdit = isSuperAdmin || hasPermission(["user_management:edit", "user_management:assign_permissions"]);
  const canDeactivate = isSuperAdmin || hasPermission("user_management:deactivate");

  const extractFnError = async (err: any, data: any): Promise<string> => {
    if (data?.error) return String(data.error);
    if (err?.context && typeof err.context.json === "function") {
      try {
        const cloned = typeof err.context.clone === "function" ? err.context.clone() : err.context;
        const body = await cloned.json();
        if (body?.error) return String(body.error);
      } catch {
        // ignore
      }
    }
    return err?.message || "Edge Function request failed.";
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setBackendWarning(null);
    try {
      const { data, error } = await supabase.functions.invoke("manage-crm-users", {
        body: { action: "list_users" },
      });

      if (!error && data?.ok) {
        setUsers(Array.isArray(data.users) ? data.users : []);
        setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
        setLoading(false);
        return;
      }

      const fnMsg = await extractFnError(error, data);
      if (fnMsg.includes("404") || fnMsg.includes("Failed to send") || fnMsg.includes("NOT_FOUND")) {
        setBackendWarning(
          "The manage-crm-users Edge Function or RBAC migration is not yet deployed on Supabase. Displaying read-only fallback directory from user_roles/profiles."
        );
      } else {
        setBackendWarning(fnMsg);
      }
    } catch (err: any) {
      setBackendWarning(err?.message || "Unable to invoke manage-crm-users Edge Function.");
    }

    // Read-only fallback from Supabase tables
    try {
      const [rolesRes, profilesRes, overridesRes, invitesRes] = await Promise.all([
        supabase.from("user_roles").select("user_id, role, created_at"),
        supabase.from("profiles").select("*"),
        supabase.from("crm_user_permissions").select("user_id, permission_key, allowed"),
        supabase.from("crm_invitations").select("*").order("invited_at", { ascending: false }),
      ]);

      const profMap = new Map<string, any>();
      (profilesRes.data || []).forEach((p: any) => profMap.set(p.id, p));

      const ovMap = new Map<string, { permission_key: string; allowed: boolean }[]>();
      (overridesRes.data || []).forEach((ov: any) => {
        const list = ovMap.get(ov.user_id) || [];
        list.push({ permission_key: ov.permission_key, allowed: ov.allowed });
        ovMap.set(ov.user_id, list);
      });

      const merged: CrmUserSummary[] = (rolesRes.data || []).map((r: any) => {
        const prof = profMap.get(r.user_id) || {};
        return {
          user_id: r.user_id,
          email: prof.email || prof.display_name || `User ${String(r.user_id).slice(0, 8)}`,
          full_name: prof.full_name || prof.display_name || null,
          role: r.role as AdminRole,
          account_status: (prof.account_status || "active") as AccountStatus,
          created_at: r.created_at,
          last_login_at: prof.last_login_at || null,
          invited_at: prof.invited_at || null,
          activated_at: prof.activated_at || null,
          deactivated_at: prof.deactivated_at || null,
          overrides: ovMap.get(r.user_id) || [],
        };
      });

      setUsers(merged);
      setInvitations((invitesRes.data as CrmInvitation[]) || []);
    } catch {
      // ignore fallback errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const activeSuperAdminCount = useMemo(() => {
    return users.filter(
      (u) => normalizeRole(u.role) === "super_admin" && u.account_status === "active"
    ).length;
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "all") {
        if (normalizeRole(u.role) !== roleFilter) return false;
      }
      if (statusFilter !== "all" && u.account_status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          (u.full_name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q) ||
          getRoleLabel(u.role).toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, searchQuery]);

  const handleOpenInvite = () => {
    setInviteName("");
    setInviteEmail("");
    setInviteRole("registration_staff");
    setInvitePermSet(new Set(ROLE_DEFAULT_PERMISSIONS.registration_staff));
    setIsInviteOpen(true);
  };

  const handleInviteRoleChange = (nextRole: CanonicalCrmRole) => {
    setInviteRole(nextRole);
    setInvitePermSet(new Set(ROLE_DEFAULT_PERMISSIONS[nextRole]));
  };

  const togglePermissionInSet = (
    setter: React.Dispatch<React.SetStateAction<Set<PermissionKey>>>,
    perm: PermissionKey
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  };

  const computeOverridesFromSet = (
    targetRole: CanonicalCrmRole,
    selected: Set<PermissionKey>
  ): Record<string, boolean> => {
    if (targetRole === "super_admin") return {};
    const defaults = new Set(ROLE_DEFAULT_PERMISSIONS[targetRole]);
    const overrides: Record<string, boolean> = {};
    for (const perm of ALL_PERMISSIONS) {
      const inDefault = defaults.has(perm);
      const inSelected = selected.has(perm);
      if (inDefault !== inSelected) {
        overrides[perm] = inSelected;
      }
    }
    return overrides;
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const cleanEmail = inviteEmail.trim().toLowerCase();
    if (!cleanEmail || !inviteName.trim()) {
      setStatusMsg({ type: "error", text: "Full Name and valid Email Address are required." });
      return;
    }

    setSubmittingInvite(true);
    try {
      const customPermissions = computeOverridesFromSet(inviteRole, invitePermSet);
      const { data, error } = await supabase.functions.invoke("manage-crm-users", {
        body: {
          action: "invite_user",
          fullName: inviteName.trim(),
          email: cleanEmail,
          role: inviteRole,
          customPermissions,
        },
      });

      if (error || !data?.ok) {
        throw new Error(await extractFnError(error, data));
      }

      setStatusMsg({
        type: "success",
        text: `Invitation dispatched to ${cleanEmail} as ${ROLE_METADATA[inviteRole].label}.`,
      });
      setIsInviteOpen(false);
      await fetchUsers();
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Invitation failed: ${err?.message || "Unknown error"}`,
      });
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleOpenEdit = (target: CrmUserSummary) => {
    const canonical = normalizeRole(target.role) || "viewer";
    const effective = resolveEffectivePermissions(canonical, "active", target.overrides);
    setEditTarget(target);
    setEditRole(canonical);
    setEditPermSet(effective);
  };

  const handleEditRoleChange = (nextRole: CanonicalCrmRole) => {
    setEditRole(nextRole);
    setEditPermSet(new Set(ROLE_DEFAULT_PERMISSIONS[nextRole]));
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !user) return;
    setStatusMsg(null);

    const guard = validateCrmUserMutation({
      actorId: user.id,
      targetUserId: editTarget.user_id,
      nextRole: editRole,
      activeSuperAdminCount,
      targetCurrentRole: editTarget.role,
      targetCurrentStatus: editTarget.account_status,
    });
    if (!guard.ok) {
      setStatusMsg({ type: "error", text: guard.error });
      return;
    }

    setSavingEdit(true);
    try {
      const overridesObj = computeOverridesFromSet(editRole, editPermSet);

      if (normalizeRole(editTarget.role) !== editRole) {
        const { data: rData, error: rErr } = await supabase.functions.invoke("manage-crm-users", {
          body: {
            action: "update_user_role",
            targetUserId: editTarget.user_id,
            role: editRole,
          },
        });
        if (rErr || !rData?.ok) throw new Error(await extractFnError(rErr, rData));
      }

      const { data: pData, error: pErr } = await supabase.functions.invoke("manage-crm-users", {
        body: {
          action: "update_user_permissions",
          targetUserId: editTarget.user_id,
          role: editRole,
          overrides: overridesObj,
        },
      });
      if (pErr || !pData?.ok) throw new Error(await extractFnError(pErr, pData));

      setStatusMsg({
        type: "success",
        text: `Updated role & permissions for ${editTarget.full_name || editTarget.email}.`,
      });
      setEditTarget(null);
      await fetchUsers();
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Failed to update user access: ${err?.message || "Unknown error"}`,
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!statusTarget || !user) return;
    const guard = validateCrmUserMutation({
      actorId: user.id,
      targetUserId: statusTarget.user.user_id,
      nextStatus: statusTarget.nextStatus,
      activeSuperAdminCount,
      targetCurrentRole: statusTarget.user.role,
      targetCurrentStatus: statusTarget.user.account_status,
    });
    if (!guard.ok) {
      setStatusMsg({ type: "error", text: guard.error });
      setStatusTarget(null);
      return;
    }

    setSavingStatus(true);
    setStatusMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("manage-crm-users", {
        body: {
          action: "update_user_status",
          targetUserId: statusTarget.user.user_id,
          accountStatus: statusTarget.nextStatus,
        },
      });

      if (error || !data?.ok) {
        throw new Error(await extractFnError(error, data));
      }

      setStatusMsg({
        type: "success",
        text: `Account ${statusTarget.user.email} status updated to ${statusTarget.nextStatus}.`,
      });
      setStatusTarget(null);
      await fetchUsers();
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Failed to update status: ${err?.message || "Unknown error"}`,
      });
    } finally {
      setSavingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
              Super Admin Security Console
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            CRM User Management & RBAC
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Invite authorized staff, assign operational roles, customize module permissions, and revoke access.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchUsers}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          {canInvite && (
            <button
              type="button"
              onClick={handleOpenInvite}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Invite CRM User</span>
            </button>
          )}
        </div>
      </div>

      {backendWarning && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-2.5">
          <ShieldAlert size={16} className="shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-bold m-0">Backend Edge Function Notice</p>
            <p className="m-0 mt-0.5 text-amber-900/90 leading-relaxed">{backendWarning}</p>
          </div>
        </div>
      )}

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between border shadow-2xs ${
            statusMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMsg(null)} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-slate-500 font-semibold block">Total Staff</span>
          <span className="text-2xl font-display font-extrabold text-slate-900 mt-1 block">{users.length}</span>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-emerald-700 font-semibold block">Active Users</span>
          <span className="text-2xl font-display font-extrabold text-emerald-700 mt-1 block">
            {users.filter((u) => u.account_status === "active").length}
          </span>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-blue-700 font-semibold block">Pending Invites</span>
          <span className="text-2xl font-display font-extrabold text-blue-700 mt-1 block">
            {users.filter((u) => u.account_status === "invited").length}
          </span>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-slate-700 font-semibold block">Active Super Admins</span>
          <span className="text-2xl font-display font-extrabold text-slate-900 mt-1 block">{activeSuperAdminCount}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, email, role..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
        >
          <option value="all">All CRM Roles</option>
          {CANONICAL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_METADATA[r].label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
        >
          <option value="all">All Account Statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited (Pending Acceptance)</option>
          <option value="deactivated">Deactivated</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-mono tracking-wider text-[11px]">
                <th className="py-3 px-4 font-semibold">User</th>
                <th className="py-3 px-4 font-semibold">Role</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Effective Permissions</th>
                <th className="py-3 px-4 font-semibold">Added / Last Login</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 font-mono">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading CRM users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No CRM user accounts match the current filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const canonical = normalizeRole(u.role) || "viewer";
                  const meta = ROLE_METADATA[canonical];
                  const effective = resolveEffectivePermissions(canonical, u.account_status, u.overrides);
                  const isSelf = user?.id === u.user_id;
                  const isLastSuper =
                    canonical === "super_admin" &&
                    u.account_status === "active" &&
                    activeSuperAdminCount <= 1;

                  return (
                    <tr key={u.user_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-900 text-sm">{u.full_name || "Staff Member"}</strong>
                          {isSelf && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-bold">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500 font-mono text-[11px] mt-0.5">{u.email}</div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border font-mono text-[10px] font-bold uppercase ${meta.badgeTone}`}
                        >
                          <ShieldCheck size={11} />
                          <span>{meta.label}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-mono text-[10px] font-bold uppercase ${statusBadgeClasses(
                            u.account_status
                          )}`}
                        >
                          {u.account_status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-mono text-slate-800 font-semibold">
                          {effective.size} / {ALL_PERMISSIONS.length} permissions
                        </div>
                        {u.overrides.length > 0 && (
                          <div className="text-[10px] font-mono text-blue-700 mt-0.5">
                            {u.overrides.length} custom override(s)
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        <div>Added: {new Date(u.created_at).toLocaleDateString("en-IN")}</div>
                        <div className="text-slate-400">
                          Login: {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("en-IN") : "Never"}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canEdit && (
                            <button
                              type="button"
                              disabled={isSelf}
                              onClick={() => handleOpenEdit(u)}
                              title={isSelf ? "Self-modification is disabled by security policy" : "Edit Role & Permissions"}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors disabled:opacity-40 cursor-pointer"
                            >
                              <Edit3 size={12} />
                              <span>Edit Access</span>
                            </button>
                          )}

                          {canDeactivate && (
                            u.account_status === "active" || u.account_status === "invited" ? (
                              <button
                                type="button"
                                disabled={isSelf || isLastSuper}
                                onClick={() => setStatusTarget({ user: u, nextStatus: "deactivated" })}
                                title={
                                  isSelf
                                    ? "Cannot deactivate your own account"
                                    : isLastSuper
                                    ? "Cannot deactivate the last active Super Admin"
                                    : "Deactivate account"
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs transition-colors disabled:opacity-40 cursor-pointer"
                              >
                                <Ban size={12} />
                                <span>Deactivate</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isSelf}
                                onClick={() => setStatusTarget({ user: u, nextStatus: "active" })}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs transition-colors disabled:opacity-40 cursor-pointer"
                              >
                                <UserCheck size={12} />
                                <span>Reactivate</span>
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending / Recent Invitations */}
      {invitations.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-display font-bold text-slate-900 m-0 flex items-center gap-2">
              <Clock size={15} className="text-blue-600" />
              <span>Invitation Log ({invitations.length})</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {invitations.slice(0, 9).map((inv) => (
              <div
                key={inv.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-slate-900 truncate">{inv.full_name || inv.email}</strong>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase bg-white border border-slate-200 text-slate-700">
                    {inv.status}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-500 truncate">{inv.email}</div>
                <div className="text-[11px] text-slate-600">
                  Role: <strong>{getRoleLabel(inv.role)}</strong> ·{" "}
                  {new Date(inv.invited_at).toLocaleDateString("en-IN")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {isInviteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsInviteOpen(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-display font-black text-slate-900 m-0">
                  Invite CRM Staff Member
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sends a Supabase Auth invitation email and assigns role + module permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="e.g. Ananya Rao"
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Work / College Email
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="coordinator@nationalcollege.edu"
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                  Role Preset
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {CANONICAL_ROLES.map((r) => {
                    const meta = ROLE_METADATA[r];
                    const active = inviteRole === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleInviteRoleChange(r)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? "border-blue-600 bg-blue-50/70 ring-1 ring-blue-600"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{meta.label}</span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {ROLE_DEFAULT_PERMISSIONS[r].length} perms
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">{meta.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 11-Module Permission Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-700">
                    Module Permission Matrix ({invitePermSet.size} / {ALL_PERMISSIONS.length} enabled)
                  </span>
                  {inviteRole === "super_admin" && (
                    <span className="text-[11px] font-mono text-slate-500">
                      Super Admin always holds full permissions
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PERMISSION_GROUPS.map((group) => (
                    <div
                      key={group.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-900">{group.label}</div>
                        <div className="text-[11px] text-slate-500">{group.description}</div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {group.permissions.map((perm) => {
                          const checked = invitePermSet.has(perm.key);
                          return (
                            <label
                              key={perm.key}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                                checked
                                  ? "bg-white border-blue-300 text-blue-900"
                                  : "bg-slate-100 border-slate-200 text-slate-500"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={inviteRole === "super_admin"}
                                onChange={() => togglePermissionInSet(setInvitePermSet, perm.key)}
                                className="accent-blue-600"
                              />
                              <span>{perm.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingInvite}
                  className="px-5 py-2 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingInvite ? "Sending Invitation..." : "Send Invitation Email"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role & Permissions Modal */}
      {editTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditTarget(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-display font-black text-slate-900 m-0">
                  Edit Role & Permissions: {editTarget.full_name || editTarget.email}
                </h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{editTarget.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {normalizeRole(editTarget.role) === "super_admin" &&
              editTarget.account_status === "active" &&
              activeSuperAdminCount <= 1 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                  <Lock size={14} className="shrink-0 text-amber-600" />
                  <span>
                    This user is the last active Super Admin. Role demotion is blocked to prevent administrative lockout.
                  </span>
                </div>
              )}

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                Assigned CRM Role
              </label>
              <select
                value={editRole}
                disabled={
                  normalizeRole(editTarget.role) === "super_admin" &&
                  editTarget.account_status === "active" &&
                  activeSuperAdminCount <= 1
                }
                onChange={(e) => handleEditRoleChange(e.target.value as CanonicalCrmRole)}
                className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
              >
                {CANONICAL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_METADATA[r].label} — {ROLE_METADATA[r].description}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PERMISSION_GROUPS.map((group) => (
                <div
                  key={group.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">{group.label}</div>
                    <div className="text-[11px] text-slate-500">{group.description}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {group.permissions.map((perm) => {
                      const checked = editPermSet.has(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                            checked
                              ? "bg-white border-blue-300 text-blue-900"
                              : "bg-slate-100 border-slate-200 text-slate-500"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={editRole === "super_admin"}
                            onChange={() => togglePermissionInSet(setEditPermSet, perm.key)}
                            className="accent-blue-600"
                          />
                          <span>{perm.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={handleSaveEdit}
                className="px-5 py-2 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Role & Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Confirmation Modal */}
      {statusTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setStatusTarget(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl ${
                  statusTarget.nextStatus === "active"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {statusTarget.nextStatus === "active" ? <UserCheck size={20} /> : <UserX size={20} />}
              </div>
              <div>
                <h3 className="text-base font-display font-black text-slate-900 m-0">
                  {statusTarget.nextStatus === "active"
                    ? "Reactivate CRM Account"
                    : "Deactivate / Revoke Access"}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Are you sure you want to set{" "}
                  <strong>{statusTarget.user.full_name || statusTarget.user.email}</strong> to{" "}
                  <strong className="uppercase">{statusTarget.nextStatus}</strong>?{" "}
                  {statusTarget.nextStatus !== "active" &&
                    "Deactivated accounts are immediately blocked from all CRM views and API endpoints."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStatusTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              {statusTarget.nextStatus !== "active" && (
                <button
                  type="button"
                  disabled={savingStatus}
                  onClick={() => {
                    setStatusTarget({ ...statusTarget, nextStatus: "revoked" });
                  }}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                    statusTarget.nextStatus === "revoked"
                      ? "bg-rose-900 text-white border-rose-900"
                      : "bg-white border-rose-200 text-rose-700 hover:bg-rose-50"
                  }`}
                >
                  Revoke Permanently
                </button>
              )}
              <button
                type="button"
                disabled={savingStatus}
                onClick={handleConfirmStatusChange}
                className={`px-4 py-2 rounded-xl text-white text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                  statusTarget.nextStatus === "active"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {savingStatus ? "Updating..." : "Confirm Change"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
