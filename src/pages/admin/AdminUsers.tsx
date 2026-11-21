import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase, getSupabaseClientConfig } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { AccountStatus, CrmUserSummary, CrmInvitation } from "@/types/database";
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_METADATA,
  canDelegateRoleAndPermissions,
  getCrmDeactivateEligibility,
  getCrmDeleteEligibility,
  getCrmReactivateEligibility,
  getRoleLabel,
  isLastActiveSuperAdmin,
  normalizeRole,
  resolveEffectivePermissions,
  validateCrmUserMutation,
  validateNewCrmUserInput,
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
  Trash2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
} from "lucide-react";

const CANONICAL_ROLES: CanonicalCrmRole[] = [
  "super_admin",
  "crm_admin",
  "registration_staff",
  "checkin_staff",
  "esports_entry_staff",
  "esports_manager",
  "match_conductor",
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

function formatDisplayDate(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString("en-IN");
}

type BackendErrorState = {
  title: string;
  message: string;
  statusCode?: number;
  hint?: string;
};

export default function AdminUsers() {
  const { user, isSuperAdmin, permissions, hasPermission } = useAuth();
  const [users, setUsers] = useState<CrmUserSummary[]>([]);
  const [invitations, setInvitations] = useState<CrmInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<BackendErrorState | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Add User Modal State (supports Direct Creation with Password OR Email Invitation)
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"direct" | "invite">("direct");
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addConfirmPassword, setAddConfirmPassword] = useState("");
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [showAddConfirmPassword, setShowAddConfirmPassword] = useState(false);
  const [addRole, setAddRole] = useState<CanonicalCrmRole>("registration_staff");
  const [addPermSet, setAddPermSet] = useState<Set<PermissionKey>>(
    new Set(ROLE_DEFAULT_PERMISSIONS.registration_staff)
  );
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [addModalError, setAddModalError] = useState<string | null>(null);

  // Edit User, Role & Permissions Modal State
  const [editTarget, setEditTarget] = useState<CrmUserSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<CanonicalCrmRole>("viewer");
  const [editPermSet, setEditPermSet] = useState<Set<PermissionKey>>(new Set());
  const [savingEdit, setSavingEdit] = useState(false);
  const [editModalError, setEditModalError] = useState<string | null>(null);

  // Status Mutation Modal State
  const [statusTarget, setStatusTarget] = useState<{
    user: CrmUserSummary;
    nextStatus: AccountStatus;
  } | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusModalError, setStatusModalError] = useState<string | null>(null);

  // Permanent Delete Modal State
  const [deleteTarget, setDeleteTarget] = useState<CrmUserSummary | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);

  const canInvite = isSuperAdmin || hasPermission("user_management:invite");
  const canEditDetails = isSuperAdmin || hasPermission("user_management:edit");
  const canAssignPermissions = isSuperAdmin || hasPermission("user_management:assign_permissions");
  const canEdit = canEditDetails || canAssignPermissions;
  const canDeactivate = isSuperAdmin || hasPermission("user_management:deactivate");
  const canDelete = isSuperAdmin || hasPermission("user_management:delete");

  const invokeManageCrmUsers = useCallback(
    async (
      body: Record<string, unknown>
    ): Promise<{ data: any; error: any; statusCode?: number }> => {
      const { url: supabaseUrl, key: apiKey } = getSupabaseClientConfig();

      const resolveAccessToken = async (forceRefresh = false): Promise<string | null> => {
        try {
          if (forceRefresh) {
            const refreshed = await supabase.auth.refreshSession();
            return refreshed.data?.session?.access_token ?? null;
          }
          const { data: sessionData } = await supabase.auth.getSession();
          let activeSession = sessionData?.session ?? null;
          if (
            !activeSession?.access_token ||
            (activeSession.expires_at && activeSession.expires_at * 1000 - Date.now() < 60_000)
          ) {
            const refreshed = await supabase.auth.refreshSession();
            if (refreshed.data?.session) {
              activeSession = refreshed.data.session;
            }
          }
          return activeSession?.access_token ?? null;
        } catch {
          return null;
        }
      };

      const callFn = async (token: string) => {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
        };
        if (apiKey) {
          headers.apikey = apiKey;
        }
        const { data, error } = await supabase.functions.invoke("manage-crm-users", {
          headers,
          body,
        });
        const statusCode =
          typeof (error as any)?.context?.status === "number"
            ? (error as any).context.status
            : undefined;
        return { data, error, statusCode };
      };

      const accessToken = await resolveAccessToken(false);
      if (!accessToken) {
        await supabase.auth.signOut().catch(() => {});
        return {
          data: { ok: false, error: "Your CRM session has expired. Please sign in again." },
          error: { message: "Unauthorized: Missing or expired CRM session token", context: { status: 401 } },
          statusCode: 401,
        };
      }

      let result = await callFn(accessToken);

      if (result.statusCode === 401) {
        const refreshedToken = await resolveAccessToken(true);
        if (!refreshedToken) {
          await supabase.auth.signOut().catch(() => {});
          return result;
        }
        result = await callFn(refreshedToken);
        if (result.statusCode === 401) {
          await supabase.auth.signOut().catch(() => {});
          return result;
        }
      }

      // When Edge Function is undeployed, browser CORS preflight fails with FunctionsFetchError
      // ("Failed to send a request to the Edge Function"). Perform a read-only probe so the
      // UI shows the accurate HTTP status (e.g. 404 NOT_FOUND) cleanly.
      let statusCode = result.statusCode;
      if (
        result.error &&
        statusCode === undefined &&
        String(result.error?.message || "").includes("Failed to send a request to the Edge Function")
      ) {
        if (supabaseUrl) {
          try {
            const probeRes = await fetch(`${supabaseUrl}/functions/v1/manage-crm-users`, {
              method: "POST",
              headers: {
                ...(apiKey ? { apikey: apiKey } : {}),
                "Content-Type": "application/json",
              },
              body: "{}",
            });
            statusCode = probeRes.status;
          } catch {
            // Browser/network blocked probe as well
          }
        }
      }

      return { data: result.data, error: result.error, statusCode };
    },
    []
  );

  const extractFnDetails = async (
    err: any,
    data: any,
    fallbackStatusCode?: number
  ): Promise<{ message: string; statusCode?: number }> => {
    const statusCode =
      typeof err?.context?.status === "number"
        ? err.context.status
        : fallbackStatusCode;

    if (data?.error) {
      return { message: String(data.error), statusCode };
    }
    if (err?.context && typeof err.context.json === "function") {
      try {
        const cloned =
          typeof err.context.clone === "function" ? err.context.clone() : err.context;
        const body = await cloned.json();
        if (body?.error) {
          return { message: String(body.error), statusCode };
        }
        if (body?.message) {
          return { message: String(body.message), statusCode };
        }
      } catch {
        if (typeof err.context.text === "function") {
          try {
            const clonedTxt =
              typeof err.context.clone === "function" ? err.context.clone() : err.context;
            const textBody = await clonedTxt.text();
            if (textBody) {
              return { message: textBody.slice(0, 300), statusCode };
            }
          } catch {
            // ignore non-text body
          }
        }
      }
    }
    return {
      message: err?.message || "Edge Function request failed.",
      statusCode,
    };
  };

  const extractFnError = async (
    err: any,
    data: any,
    fallbackStatusCode?: number
  ): Promise<string> => {
    const { message } = await extractFnDetails(err, data, fallbackStatusCode);
    return message;
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setBackendError(null);
    try {
      const { data, error, statusCode: probedStatus } = await invokeManageCrmUsers({
        action: "list_users",
      });

      if (!error && data?.ok) {
        setUsers(Array.isArray(data.users) ? data.users : []);
        setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
        setBackendError(null);
        return;
      }

      const { message, statusCode } = await extractFnDetails(error, data, probedStatus);
      const isNotDeployedOrUnreachable =
        statusCode === 404 ||
        message.includes("404") ||
        message.includes("NOT_FOUND") ||
        message.includes("Requested function was not found") ||
        message.includes("Failed to send a request to the Edge Function");

      setUsers([]);
      setInvitations([]);
      setBackendError(
        isNotDeployedOrUnreachable
          ? {
              title: "CRM User Management Backend Not Deployed or Unreachable",
              statusCode,
              message,
              hint:
                "Deploy the manage-crm-users Edge Function and apply migration 20261124000000_complete_crm_user_management_and_rbac_repair.sql on Supabase project cirreovughlncadrbvcn, then retry.",
            }
          : {
              title: "CRM User Management Backend Error",
              statusCode,
              message,
              hint:
                statusCode === 401 || statusCode === 403
                  ? "Verify that your account is an active CRM staff user with User Management permissions and that your session is valid."
                  : "Verify that migration 20261124000000_complete_crm_user_management_and_rbac_repair.sql and manage-crm-users secrets are configured on Supabase.",
            }
      );
    } catch (err: any) {
      setUsers([]);
      setInvitations([]);
      setBackendError({
        title: "CRM User Management Backend Unavailable",
        message: err?.message || "Unable to invoke manage-crm-users Edge Function.",
        hint:
          "Check network connectivity and confirm manage-crm-users is deployed with CORS/verify_jwt=false configured.",
      });
    } finally {
      setLoading(false);
    }
  }, [invokeManageCrmUsers]);

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

  const filterPresetPermissionsForActor = useCallback(
    (targetRole: CanonicalCrmRole): Set<PermissionKey> => {
      const defaults = ROLE_DEFAULT_PERMISSIONS[targetRole] || [];
      if (isSuperAdmin) {
        return new Set<PermissionKey>(defaults);
      }
      return new Set<PermissionKey>(defaults.filter((perm) => permissions.has(perm)));
    },
    [isSuperAdmin, permissions]
  );

  const handleOpenAddUser = () => {
    setAddMode("direct");
    setAddName("");
    setAddEmail("");
    setAddPassword("");
    setAddConfirmPassword("");
    setShowAddPassword(false);
    setShowAddConfirmPassword(false);
    setAddRole("registration_staff");
    setAddPermSet(filterPresetPermissionsForActor("registration_staff"));
    setAddModalError(null);
    setIsAddOpen(true);
  };

  const handleAddRoleChange = (nextRole: CanonicalCrmRole) => {
    if (!isSuperAdmin && nextRole === "super_admin") return;
    setAddRole(nextRole);
    setAddPermSet(filterPresetPermissionsForActor(nextRole));
  };

  const togglePermissionInSet = (
    setter: React.Dispatch<React.SetStateAction<Set<PermissionKey>>>,
    perm: PermissionKey
  ) => {
    if (!isSuperAdmin && !permissions.has(perm)) return;
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

  const handleCreateOrInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddModalError(null);
    setStatusMsg(null);

    const validation = validateNewCrmUserInput({
      mode: addMode,
      fullName: addName,
      email: addEmail,
      password: addPassword,
      confirmPassword: addConfirmPassword,
      role: addRole,
      existingEmails: users.map((u) => u.email),
      actorIsSuperAdmin: isSuperAdmin,
      actorPermissions: permissions,
      selectedPermissions: addPermSet,
    });

    if (!validation.ok) {
      setAddModalError(validation.error);
      return;
    }

    setSubmittingAdd(true);
    try {
      const overridesObj = computeOverridesFromSet(addRole, addPermSet);
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/admin/login?type=invite`
          : undefined;

      const { data, error, statusCode } = await invokeManageCrmUsers({
        action: addMode === "direct" ? "create_user" : "invite_user",
        mode: addMode,
        fullName: validation.normalizedName,
        email: validation.normalizedEmail,
        ...(addMode === "direct" ? { password: addPassword } : { redirectTo }),
        role: addRole,
        overrides: overridesObj,
        customPermissions: overridesObj,
      });

      if (error || !data?.ok) {
        throw new Error(await extractFnError(error, data, statusCode));
      }

      setStatusMsg({
        type: "success",
        text:
          addMode === "direct"
            ? `Created active CRM account for ${validation.normalizedEmail} (${ROLE_METADATA[addRole].label}). They can sign in immediately.`
            : `Invitation dispatched to ${validation.normalizedEmail} as ${ROLE_METADATA[addRole].label}.`,
      });
      setIsAddOpen(false);
      await fetchUsers();
    } catch (err: any) {
      setAddModalError(err?.message || "Unable to create CRM staff account.");
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleOpenEdit = (target: CrmUserSummary) => {
    const canonical = normalizeRole(target.role) || "viewer";
    const effective = resolveEffectivePermissions(canonical, "active", target.overrides);
    setEditTarget(target);
    setEditName(target.full_name || "");
    setEditRole(canonical);
    setEditPermSet(effective);
    setEditModalError(null);
  };

  const handleEditRoleChange = (nextRole: CanonicalCrmRole) => {
    if (!isSuperAdmin && nextRole === "super_admin") return;
    setEditRole(nextRole);
    setEditPermSet(filterPresetPermissionsForActor(nextRole));
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !user) return;
    setEditModalError(null);
    setStatusMsg(null);

    const targetIsSuper = normalizeRole(editTarget.role) === "super_admin";
    if (targetIsSuper && !isSuperAdmin) {
      setEditModalError("Only a Super Admin can modify a Super Admin account.");
      return;
    }

    const trimmedName = editName.trim();
    if (canEditDetails && (trimmedName.length < 2 || trimmedName.length > 120)) {
      setEditModalError("Full Name must be between 2 and 120 characters.");
      return;
    }

    const guard = validateCrmUserMutation({
      actorId: user.id,
      targetUserId: editTarget.user_id,
      nextRole: canEditDetails ? editRole : undefined,
      activeSuperAdminCount,
      targetCurrentRole: editTarget.role,
      targetCurrentStatus: editTarget.account_status,
    });
    if (!guard.ok) {
      setEditModalError(guard.error);
      return;
    }

    if (canEditDetails || canAssignPermissions) {
      const permissionsToValidate = canAssignPermissions
        ? editPermSet
        : new Set<PermissionKey>(ROLE_DEFAULT_PERMISSIONS[editRole] || []);
      const delegationCheck = canDelegateRoleAndPermissions({
        actorIsSuperAdmin: isSuperAdmin,
        actorPermissions: permissions,
        targetRole: editRole,
        selectedPermissions: permissionsToValidate,
      });
      if (!delegationCheck.ok) {
        setEditModalError(delegationCheck.error);
        return;
      }
    }

    setSavingEdit(true);
    try {
      const overridesObj = computeOverridesFromSet(editRole, editPermSet);

      const { data, error, statusCode } = await invokeManageCrmUsers({
        action: "update_user",
        targetUserId: editTarget.user_id,
        ...(canEditDetails ? { fullName: trimmedName, role: editRole } : {}),
        ...(canAssignPermissions ? { overrides: overridesObj } : {}),
      });

      if (error || !data?.ok) {
        throw new Error(await extractFnError(error, data, statusCode));
      }

      setStatusMsg({
        type: "success",
        text: `Updated access & profile for ${trimmedName || editTarget.email}.`,
      });
      setEditTarget(null);
      await fetchUsers();
    } catch (err: any) {
      setEditModalError(err?.message || "Failed to update user access.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!statusTarget || !user) return;
    setStatusModalError(null);

    if (normalizeRole(statusTarget.user.role) === "super_admin" && !isSuperAdmin) {
      setStatusModalError("Only a Super Admin can change the status of a Super Admin account.");
      return;
    }

    const guard = validateCrmUserMutation({
      actorId: user.id,
      targetUserId: statusTarget.user.user_id,
      nextStatus: statusTarget.nextStatus,
      activeSuperAdminCount,
      targetCurrentRole: statusTarget.user.role,
      targetCurrentStatus: statusTarget.user.account_status,
    });
    if (!guard.ok) {
      setStatusModalError(guard.error);
      return;
    }

    setSavingStatus(true);
    setStatusMsg(null);
    try {
      const { data, error, statusCode } = await invokeManageCrmUsers({
        action: "update_user_status",
        targetUserId: statusTarget.user.user_id,
        accountStatus: statusTarget.nextStatus,
      });

      if (error || !data?.ok) {
        throw new Error(await extractFnError(error, data, statusCode));
      }

      setStatusMsg({
        type: "success",
        text: `Account ${statusTarget.user.email} status updated to ${statusTarget.nextStatus}.`,
      });
      setStatusTarget(null);
      await fetchUsers();
    } catch (err: any) {
      setStatusModalError(err?.message || "Failed to update account status.");
    } finally {
      setSavingStatus(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteTarget || !user) return;
    setDeleteModalError(null);

    if (normalizeRole(deleteTarget.role) === "super_admin" && !isSuperAdmin) {
      setDeleteModalError("Only a Super Admin can permanently delete a Super Admin account.");
      return;
    }

    const guard = validateCrmUserMutation({
      actorId: user.id,
      targetUserId: deleteTarget.user_id,
      action: "delete",
      activeSuperAdminCount,
      targetCurrentRole: deleteTarget.role,
      targetCurrentStatus: deleteTarget.account_status,
    });
    if (!guard.ok) {
      setDeleteModalError(guard.error);
      return;
    }

    setDeletingUser(true);
    setStatusMsg(null);
    try {
      const { data, error, statusCode } = await invokeManageCrmUsers({
        action: "delete_user",
        targetUserId: deleteTarget.user_id,
      });

      if (error || !data?.ok) {
        throw new Error(await extractFnError(error, data, statusCode));
      }

      setStatusMsg({
        type: "success",
        text: `Permanently deleted CRM staff account ${deleteTarget.email}. All historical event records were preserved.`,
      });
      setDeleteTarget(null);
      await fetchUsers();
    } catch (err: any) {
      setDeleteModalError(err?.message || "Failed to delete CRM account.");
    } finally {
      setDeletingUser(false);
    }
  };

  const editTargetIsLastSuper = editTarget
    ? isLastActiveSuperAdmin(editTarget.role, editTarget.account_status, activeSuperAdminCount)
    : false;
  const editTargetLockedByNonSuper = editTarget
    ? normalizeRole(editTarget.role) === "super_admin" && !isSuperAdmin
    : false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
              RBAC & Staff Security Console
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            CRM User Management & RBAC
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Create or invite authorized staff, assign operational roles, customize module permissions, and control access.
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
              onClick={handleOpenAddUser}
              disabled={loading || Boolean(backendError)}
              title={
                backendError
                  ? "Disabled until the manage-crm-users backend is deployed and reachable"
                  : undefined
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <UserPlus size={14} />
              <span>Add User</span>
            </button>
          )}
        </div>
      </div>

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

      {!loading && backendError ? (
        <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
              <ShieldAlert size={20} />
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-display font-black text-slate-900 m-0">
                  {backendError.title}
                </h2>
                {backendError.statusCode !== undefined && (
                  <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 font-mono text-[11px] font-bold">
                    HTTP {backendError.statusCode}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-rose-900 font-mono break-words m-0">
                {backendError.message}
              </p>
              {backendError.hint && (
                <p className="text-xs text-slate-600 leading-relaxed m-0 pt-1">
                  {backendError.hint}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={fetchUsers}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>Retry Backend Connection</span>
            </button>
          </div>
        </div>
      ) : (
        <>

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
                  const targetLockedForNonSuper = canonical === "super_admin" && !isSuperAdmin;
                  const isLastSuper = isLastActiveSuperAdmin(
                    canonical,
                    u.account_status,
                    activeSuperAdminCount
                  );
                  const deactivateCheck = getCrmDeactivateEligibility({
                    actorId: user?.id,
                    targetUserId: u.user_id,
                    targetRole: canonical,
                    targetStatus: u.account_status,
                    activeSuperAdminCount,
                  });
                  const reactivateCheck = getCrmReactivateEligibility({
                    actorId: user?.id,
                    targetUserId: u.user_id,
                    targetStatus: u.account_status,
                  });
                  const deleteCheck = getCrmDeleteEligibility({
                    actorId: user?.id,
                    targetUserId: u.user_id,
                    targetRole: canonical,
                    targetStatus: u.account_status,
                    activeSuperAdminCount,
                  });

                  const editDisabledReason = isSelf
                    ? "Self-modification is disabled by security policy"
                    : targetLockedForNonSuper
                    ? "Only a Super Admin can modify a Super Admin account"
                    : "Edit Profile, Role & Permissions";

                  const deactivateDisabledReason = targetLockedForNonSuper
                    ? "Only a Super Admin can modify a Super Admin account"
                    : deactivateCheck.reason || "Deactivate account";

                  const reactivateDisabledReason = targetLockedForNonSuper
                    ? "Only a Super Admin can modify a Super Admin account"
                    : reactivateCheck.reason || "Reactivate account";

                  const deleteDisabledReason = targetLockedForNonSuper
                    ? "Only a Super Admin can delete a Super Admin account"
                    : deleteCheck.reason ||
                      (isLastSuper
                        ? "Cannot delete the last active Super Admin"
                        : "Permanently delete CRM account");

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
                        <div>Added: {formatDisplayDate(u.created_at)}</div>
                        <div className="text-slate-400">
                          Login: {formatDisplayDate(u.last_login_at, "Never")}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canEdit && (
                            <button
                              type="button"
                              disabled={isSelf || targetLockedForNonSuper}
                              onClick={() => handleOpenEdit(u)}
                              title={editDisabledReason}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Edit3 size={12} />
                              <span>Edit</span>
                            </button>
                          )}

                          {canDeactivate && (
                            <>
                              {u.account_status === "active" || u.account_status === "invited" ? (
                                <button
                                  type="button"
                                  disabled={!deactivateCheck.eligible || targetLockedForNonSuper}
                                  onClick={() => {
                                    setStatusModalError(null);
                                    setStatusTarget({ user: u, nextStatus: "deactivated" });
                                  }}
                                  title={deactivateDisabledReason}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  <Ban size={12} />
                                  <span>Deactivate</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!reactivateCheck.eligible || targetLockedForNonSuper}
                                  onClick={() => {
                                    setStatusModalError(null);
                                    setStatusTarget({ user: u, nextStatus: "active" });
                                  }}
                                  title={reactivateDisabledReason}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  <UserCheck size={12} />
                                  <span>Reactivate</span>
                                </button>
                              )}
                            </>
                          )}

                          {canDelete && (
                            <button
                              type="button"
                              disabled={!deleteCheck.eligible || targetLockedForNonSuper}
                              onClick={() => {
                                setDeleteModalError(null);
                                setDeleteTarget(u);
                              }}
                              title={deleteDisabledReason}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Trash2 size={12} />
                              <span>Delete</span>
                            </button>
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
                  {formatDisplayDate(inv.invited_at || inv.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </>
      )}

      {/* Add User Modal (Direct Provisioning + Email Invitation) */}
      {isAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !submittingAdd && setIsAddOpen(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-display font-black text-slate-900 m-0">
                  Add CRM Staff User
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Provision a CRM staff account directly with an initial password or dispatch an email invitation.
                </p>
              </div>
              <button
                type="button"
                disabled={submittingAdd}
                onClick={() => setIsAddOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {addModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 text-rose-600 mt-0.5" />
                <span>{addModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateOrInviteUser} className="space-y-5">
              {/* Provisioning Mode Tabs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setAddMode("direct");
                    setAddModalError(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    addMode === "direct"
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <KeyRound size={14} />
                  <span>Create Account (Set Password)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMode("invite");
                    setAddModalError(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    addMode === "invite"
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Mail size={14} />
                  <span>Send Email Invitation</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g. Ananya Rao"
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Work / College Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="coordinator@nationalcollege.edu"
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              {addMode === "direct" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/90">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                      Initial Password (Min 8 chars) *
                    </label>
                    <div className="relative">
                      <input
                        type={showAddPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={addPassword}
                        onChange={(e) => setAddPassword(e.target.value)}
                        placeholder="Enter initial password"
                        autoComplete="new-password"
                        className="w-full h-10 pl-3 pr-9 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAddPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        aria-label={showAddPassword ? "Hide password" : "Show password"}
                      >
                        {showAddPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showAddConfirmPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={addConfirmPassword}
                        onChange={(e) => setAddConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        className="w-full h-10 pl-3 pr-9 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-hidden focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAddConfirmPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        aria-label={showAddConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                      >
                        {showAddConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                  Role Preset
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {CANONICAL_ROLES.map((r) => {
                    const meta = ROLE_METADATA[r];
                    const active = addRole === r;
                    const disabledRole = !isSuperAdmin && r === "super_admin";
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={disabledRole}
                        onClick={() => handleAddRoleChange(r)}
                        title={disabledRole ? "Only Super Admins can assign the Super Admin role" : undefined}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          disabledRole
                            ? "border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed"
                            : active
                            ? "border-blue-600 bg-blue-50/70 ring-1 ring-blue-600 cursor-pointer"
                            : "border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
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

              {/* 13-Module Permission Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-slate-700">
                    Module Permission Matrix ({addPermSet.size} / {ALL_PERMISSIONS.length} enabled)
                  </span>
                  {addRole === "super_admin" && (
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
                          const checked = addPermSet.has(perm.key);
                          const actorBlocked = !isSuperAdmin && !permissions.has(perm.key);
                          const checkboxDisabled = addRole === "super_admin" || actorBlocked;
                          return (
                            <label
                              key={perm.key}
                              title={
                                actorBlocked
                                  ? "Your account does not hold this permission to delegate it"
                                  : undefined
                              }
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium ${
                                checkboxDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                              } ${
                                checked
                                  ? "bg-white border-blue-300 text-blue-900"
                                  : "bg-slate-100 border-slate-200 text-slate-500"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={checkboxDisabled}
                                onChange={() => togglePermissionInSet(setAddPermSet, perm.key)}
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
                  disabled={submittingAdd}
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="px-5 py-2 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingAdd
                    ? addMode === "direct"
                      ? "Creating Account..."
                      : "Sending Invitation..."
                    : addMode === "direct"
                    ? "Create Active CRM User"
                    : "Send Invitation Email"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User, Role & Permissions Modal */}
      {editTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !savingEdit && setEditTarget(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-display font-black text-slate-900 m-0">
                  Edit Staff Account & Permissions: {editTarget.full_name || editTarget.email}
                </h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{editTarget.email}</p>
              </div>
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => setEditTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {editModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 text-rose-600 mt-0.5" />
                <span>{editModalError}</span>
              </div>
            )}

            {editTargetLockedByNonSuper && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                <Lock size={14} className="shrink-0 text-amber-600" />
                <span>Only a Super Admin can modify a Super Admin account.</span>
              </div>
            )}

            {editTargetIsLastSuper && !editTargetLockedByNonSuper && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                <Lock size={14} className="shrink-0 text-amber-600" />
                <span>
                  This user is the last active Super Admin. Role demotion is blocked to prevent administrative lockout.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                  Staff Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  disabled={!canEditDetails || editTargetLockedByNonSuper}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                  Assigned CRM Role
                </label>
                <select
                  value={editRole}
                  disabled={!canEditDetails || editTargetLockedByNonSuper || editTargetIsLastSuper}
                  onChange={(e) => handleEditRoleChange(e.target.value as CanonicalCrmRole)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 disabled:opacity-60"
                >
                  {CANONICAL_ROLES.map((r) => (
                    <option key={r} value={r} disabled={!isSuperAdmin && r === "super_admin"}>
                      {ROLE_METADATA[r].label} — {ROLE_METADATA[r].description}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-700">
                  Effective Module Permissions ({editPermSet.size} / {ALL_PERMISSIONS.length})
                </span>
                {!canAssignPermissions && (
                  <span className="text-[11px] font-mono text-amber-700">
                    Read-only: missing Assign Permissions privilege
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
                        const checked = editPermSet.has(perm.key);
                        const actorBlocked = !isSuperAdmin && !permissions.has(perm.key);
                        const checkboxDisabled =
                          !canAssignPermissions ||
                          editRole === "super_admin" ||
                          editTargetLockedByNonSuper ||
                          actorBlocked;
                        return (
                          <label
                            key={perm.key}
                            title={
                              actorBlocked
                                ? "Your account does not hold this permission to assign it"
                                : undefined
                            }
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium ${
                              checkboxDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                            } ${
                              checked
                                ? "bg-white border-blue-300 text-blue-900"
                                : "bg-slate-100 border-slate-200 text-slate-500"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={checkboxDisabled}
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
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit || editTargetLockedByNonSuper}
                onClick={handleSaveEdit}
                className="px-5 py-2 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
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
          onClick={() => !savingStatus && setStatusTarget(null)}
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

            {statusModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 text-rose-600 mt-0.5" />
                <span>{statusModalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingStatus}
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

      {/* Permanent Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !deletingUser && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl border border-rose-200 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-display font-black text-rose-950 m-0">
                  Permanently Delete Staff Account
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Are you sure you want to permanently delete{" "}
                  <strong>{deleteTarget.full_name || deleteTarget.email}</strong> ({deleteTarget.email})?
                </p>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  This removes their login credentials, CRM role, and permissions permanently. All historical event
                  data (registrations, check-ins, matches, and audit history) will be preserved.
                </p>
              </div>
            </div>

            {deleteModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 text-rose-600 mt-0.5" />
                <span>{deleteModalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={deletingUser}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingUser}
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {deletingUser ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
