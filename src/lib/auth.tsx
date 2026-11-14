import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AdminRole, AccountStatus } from "@/types/database";
import {
  ALL_PERMISSIONS,
  canAccessAdminRoute,
  hasCrmPermission,
  normalizeRole,
  resolveEffectivePermissions,
  type PermissionKey,
  type PermissionOverride,
} from "@/lib/rbac";

export type AuthErrorCategory =
  | "invalid_credentials"
  | "network_error"
  | "email_not_confirmed"
  | "rate_limited"
  | "unauthorized_role"
  | "account_deactivated"
  | "config_error"
  | "unknown_error";

export interface SignInResult {
  error: string | null;
  isAdmin?: boolean;
  errorCategory?: AuthErrorCategory;
  rawError?: any;
  statusCode?: number;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: AdminRole | null;
  accountStatus: AccountStatus | null;
  permissions: Set<PermissionKey>;
  hasPermission: (required: PermissionKey | PermissionKey[]) => boolean;
  canAccessRoute: (pathname: string) => boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const VALID_ROLES: AdminRole[] = [
  "super_admin",
  "crm_admin",
  "registration_staff",
  "esports_entry_staff",
  "participation_manager",
  "esports_manager",
  "match_conductor",
  "content_manager",
  "viewer",
  "event_admin",
  "checkin_staff",
  "score_operator",
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [permissions, setPermissions] = useState<Set<PermissionKey>>(new Set());

  const applyUnauthenticatedState = () => {
    setIsAdmin(false);
    setRole(null);
    setAccountStatus(null);
    setPermissions(new Set());
  };

  /**
   * Authoritative database RBAC verification.
   * Prefers `get_my_crm_access()` SECURITY DEFINER RPC, with safe fallback when
   * earlier database schemas are active. Immediately blocks deactivated/revoked/invited users.
   */
  const verifyAdminStatus = async (
    userSession: Session | null
  ): Promise<{
    isAdmin: boolean;
    role: AdminRole | null;
    accountStatus: AccountStatus | null;
    permissions: Set<PermissionKey>;
  }> => {
    if (!userSession || !userSession.user) {
      applyUnauthenticatedState();
      return { isAdmin: false, role: null, accountStatus: null, permissions: new Set() };
    }

    const userId = userSession.user.id;
    let resolvedRole: AdminRole | null = null;
    let resolvedStatus: AccountStatus = "active";
    let overrides: PermissionOverride[] = [];
    let rpcEffectivePermissions: PermissionKey[] | null = null;
    let rpcHandled = false;

    // Tier 1: Authoritative RBAC RPC (`get_my_crm_access`)
    try {
      const { data: rpcAccess, error: rpcErr } = await supabase.rpc("get_my_crm_access");
      if (!rpcErr && rpcAccess && typeof rpcAccess === "object") {
        rpcHandled = true;
        const access = rpcAccess as {
          authenticated?: boolean;
          role?: string | null;
          account_status?: AccountStatus | null;
          effective_permissions?: string[] | null;
          overrides?: PermissionOverride[] | null;
        };

        resolvedRole = access.role ? (access.role as AdminRole) : null;
        resolvedStatus = (access.account_status || (resolvedRole ? "active" : "revoked")) as AccountStatus;
        overrides = Array.isArray(access.overrides) ? access.overrides : [];

        if (Array.isArray(access.effective_permissions)) {
          rpcEffectivePermissions = access.effective_permissions.filter((p): p is PermissionKey =>
            ALL_PERMISSIONS.includes(p as PermissionKey)
          );
        }
      }
    } catch {
      // RPC may not exist yet prior to migration
    }

    // Tier 2: Fallback direct lookups if get_my_crm_access RPC is unavailable
    if (!rpcHandled) {
      let hasLegacyAdmin = false;
      try {
        const { data: rpcAdmin, error: rpcError } = await supabase.rpc("is_admin");
        if (!rpcError && Boolean(rpcAdmin)) {
          hasLegacyAdmin = true;
        }
      } catch {
        // ignore
      }

      try {
        const { data: roles, error: rolesError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .limit(1);

        if (!rolesError && roles && roles.length > 0 && roles[0].role) {
          resolvedRole = roles[0].role as AdminRole;
          hasLegacyAdmin = true;
        }
      } catch {
        // ignore
      }

      // Check profiles.account_status if column exists
      try {
        const { data: profData, error: profErr } = await supabase
          .from("profiles")
          .select("account_status")
          .eq("id", userId)
          .maybeSingle();

        if (!profErr && profData && (profData as any).account_status) {
          resolvedStatus = (profData as any).account_status as AccountStatus;
        }
      } catch {
        // Older schema without account_status defaults to active when role exists
      }

      // Load overrides if table exists
      try {
        const { data: ovData, error: ovErr } = await supabase
          .from("crm_user_permissions")
          .select("permission_key, allowed")
          .eq("user_id", userId);

        if (!ovErr && Array.isArray(ovData)) {
          overrides = ovData;
        }
      } catch {
        // ignore
      }

      // Only inspect metadata if no role was found AND account is not blocked
      if (!hasLegacyAdmin && resolvedStatus === "active") {
        const appMetadata = userSession.user.app_metadata || {};
        const userMetadata = userSession.user.user_metadata || {};
        const assignedRole = String(appMetadata.role || userMetadata.role || "");
        const isExplicitAdmin = Boolean(appMetadata.is_admin || userMetadata.is_admin);

        if (VALID_ROLES.includes(assignedRole as AdminRole)) {
          resolvedRole = assignedRole as AdminRole;
        } else if (assignedRole === "admin" || isExplicitAdmin) {
          resolvedRole = "super_admin";
        }
      }

      if (hasLegacyAdmin && !resolvedRole) {
        resolvedRole = "super_admin";
      }
    }

    const isAccountActive = resolvedStatus === "active";
    const hasRole = Boolean(resolvedRole && normalizeRole(resolvedRole));
    const finalIsAdmin = isAccountActive && hasRole;

    const effectiveSet = finalIsAdmin
      ? rpcEffectivePermissions
        ? new Set<PermissionKey>(rpcEffectivePermissions)
        : resolveEffectivePermissions(resolvedRole, resolvedStatus, overrides)
      : new Set<PermissionKey>();

    setIsAdmin(finalIsAdmin);
    setRole(resolvedRole);
    setAccountStatus(hasRole || resolvedStatus !== "active" ? resolvedStatus : null);
    setPermissions(effectiveSet);

    return {
      isAdmin: finalIsAdmin,
      role: resolvedRole,
      accountStatus: hasRole || resolvedStatus !== "active" ? resolvedStatus : null,
      permissions: effectiveSet,
    };
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    supabase.auth
      .getSession()
      .then(async ({ data: { session: initialSession }, error }) => {
        if (!isMounted) return;
        if (error || !initialSession) {
          setSession(null);
          applyUnauthenticatedState();
          setLoading(false);
          return;
        }

        setSession(initialSession);
        await verifyAdminStatus(initialSession);
        if (isMounted) setLoading(false);
      })
      .catch((err) => {
        console.warn("getSession error:", err);
        if (isMounted) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT" || !newSession) {
        setSession(null);
        applyUnauthenticatedState();
        setLoading(false);
        return;
      }

      setSession(newSession);
      await verifyAdminStatus(newSession);
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setLoading(false);
        const errMsg = error.message || "";
        const errCode = (error as any).code || "";
        const status = (error as any).status || 0;

        let category: AuthErrorCategory = "unknown_error";
        let userMessage = error.message;

        const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
        const isNetworkMsg =
          errMsg.includes("Failed to fetch") ||
          errMsg.includes("NetworkError") ||
          errMsg.includes("Network request failed") ||
          errMsg.includes("Load failed") ||
          errMsg.includes("timeout") ||
          errMsg.includes("ERR_") ||
          error.name === "AuthRetryableFetchError" ||
          (error.name === "TypeError" && errMsg.includes("fetch")) ||
          status === 0 ||
          status === 504 ||
          status === 502 ||
          status === 503;

        if (isOffline || isNetworkMsg) {
          category = "network_error";
          userMessage = isOffline
            ? "Your browser appears to be offline. Please verify your internet connection and try again."
            : "Network error: Unable to reach the Supabase authentication server. Please check your internet connection or verify firewall/VPN settings.";
        } else if (
          errMsg.includes("Invalid login credentials") ||
          errMsg.includes("invalid_grant") ||
          errCode === "invalid_credentials" ||
          (status === 400 && errMsg.toLowerCase().includes("credential"))
        ) {
          category = "invalid_credentials";
          userMessage = "Invalid email or password. Please verify your credentials and try again.";
        } else if (errMsg.includes("Email not confirmed") || errCode === "email_not_confirmed") {
          category = "email_not_confirmed";
          userMessage = "Your email address has not been confirmed yet. Please check your inbox for the verification link.";
        } else if (errMsg.includes("rate limit") || errMsg.includes("Too many requests") || status === 429) {
          category = "rate_limited";
          userMessage = "Too many login attempts. Please wait a few moments before trying again.";
        } else if (errMsg.toLowerCase().includes("banned") || errMsg.toLowerCase().includes("user is banned")) {
          category = "account_deactivated";
          userMessage = "This CRM account has been deactivated or revoked by a Super Admin.";
        }

        return {
          error: userMessage,
          errorCategory: category,
          rawError: error,
          statusCode: status,
        };
      }

      if (!data.session) {
        setLoading(false);
        return {
          error: "Authentication completed, but no active session was returned. Check if email confirmation is required.",
          errorCategory: "unknown_error",
        };
      }

      setSession(data.session);

      // Verify status & role from database
      let adminResult = await verifyAdminStatus(data.session);

      // If invited user signs in via password/invite link, accept invite atomically if allowed
      if (!adminResult.isAdmin && adminResult.accountStatus === "invited") {
        try {
          await supabase.rpc("accept_crm_invite");
          adminResult = await verifyAdminStatus(data.session);
        } catch {
          // ignore
        }
      }

      if (!adminResult.isAdmin) {
        if (adminResult.accountStatus === "deactivated" || adminResult.accountStatus === "revoked") {
          await supabase.auth.signOut().catch(() => {});
          setSession(null);
          applyUnauthenticatedState();
          setLoading(false);
          return {
            error: `Access denied: This CRM account (${data.session.user.email}) has been ${adminResult.accountStatus}. Contact a Super Admin.`,
            errorCategory: "account_deactivated",
            isAdmin: false,
          };
        }

        setLoading(false);
        return {
          error: `Authenticated as ${data.session.user.email}, but this account does not have an active CRM role assigned. Contact a Super Admin.`,
          errorCategory: "unauthorized_role",
          isAdmin: false,
        };
      }

      // Record login timestamp (non-blocking)
      void supabase.rpc("record_crm_login").then(
        () => {},
        () => {}
      );

      setLoading(false);
      return { error: null, isAdmin: true };
    } catch (err: any) {
      setLoading(false);
      const errMsg = err?.message || "";
      const isNetwork =
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        errMsg.includes("Failed to fetch") ||
        errMsg.includes("NetworkError") ||
        err?.name === "AuthRetryableFetchError";

      return {
        error: isNetwork
          ? "Network error: Unable to connect to the authentication service. Please check your internet connectivity."
          : errMsg || "An unexpected error occurred during authentication.",
        errorCategory: isNetwork ? "network_error" : "unknown_error",
        rawError: err,
      };
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("SignOut error:", err);
    } finally {
      setSession(null);
      applyUnauthenticatedState();
      setLoading(false);
      if (typeof window !== "undefined") {
        localStorage.removeItem("supernova_preview_admin_session");
      }
    }
  };

  const refreshRole = async () => {
    if (session) {
      setLoading(true);
      await verifyAdminStatus(session);
      setLoading(false);
    }
  };

  const hasPermission = useCallback(
    (required: PermissionKey | PermissionKey[]) => {
      return hasCrmPermission(permissions, required, accountStatus || "active");
    },
    [permissions, accountStatus]
  );

  const canAccessRoute = useCallback(
    (pathname: string) => {
      return canAccessAdminRoute(pathname, permissions, accountStatus || "active");
    },
    [permissions, accountStatus]
  );

  const isSuperAdmin =
    isAdmin && accountStatus === "active" && normalizeRole(role) === "super_admin";

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isAdmin,
        isSuperAdmin,
        role,
        accountStatus,
        permissions,
        hasPermission,
        canAccessRoute,
        signIn,
        signOut,
        refreshRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
