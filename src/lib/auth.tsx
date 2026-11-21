import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, checkSupabaseClientConfig } from "@/lib/supabase";
import type { AdminRole, AccountStatus } from "@/types/database";
import { evaluateCrmAccessResponse, type EvaluatedCrmAccess } from "@/lib/crmAccess";
import {
  canAccessAdminRoute,
  hasCrmPermission,
  normalizeRole,
  type PermissionKey,
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
  isStaff?: boolean;
  isActive?: boolean;
  shouldRedirectToPublic?: boolean;
  role?: AdminRole | null;
  accountStatus?: AccountStatus | null;
  permissions?: Set<PermissionKey>;
  errorCategory?: AuthErrorCategory;
  rawError?: any;
  statusCode?: number;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isActive: boolean;
  isSuperAdmin: boolean;
  role: AdminRole | null;
  accountStatus: AccountStatus | null;
  permissions: Set<PermissionKey>;
  hasPermission: (required: PermissionKey | PermissionKey[]) => boolean;
  canAccessRoute: (pathname: string) => boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<EvaluatedCrmAccess | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [permissions, setPermissions] = useState<Set<PermissionKey>>(new Set());
  const sessionRef = useRef<Session | null>(null);
  const lastFocusSyncRef = useRef<number>(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const applyUnauthenticatedState = useCallback(() => {
    setIsAdmin(false);
    setIsStaff(false);
    setIsActive(false);
    setRole(null);
    setAccountStatus(null);
    setPermissions(new Set());
  }, []);

  /**
   * Validates the active Supabase session using `supabase.auth.getUser()`.
   * On HTTP 401 / invalid session, attempts `refreshSession()` once; if refreshing fails,
   * clears the invalid local session via `signOut()` and returns null.
   */
  const validateActiveSession = useCallback(
    async (candidateSession: Session | null): Promise<Session | null> => {
      if (!candidateSession) return null;

      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (!userErr && userData?.user) {
          return candidateSession;
        }

        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (!refreshErr && refreshData?.session) {
          const { data: retryUser, error: retryErr } = await supabase.auth.getUser();
          if (!retryErr && retryUser?.user) {
            return refreshData.session;
          }
        }
      } catch {
        // Fall through to fail-closed session cleanup
      }

      await supabase.auth.signOut().catch(() => {});
      setSession(null);
      applyUnauthenticatedState();
      return null;
    },
    [applyUnauthenticatedState]
  );

  /**
   * Authoritative fail-closed database RBAC verification.
   * Calls `get_my_crm_access()` only; never falls back to client roles, metadata, or emails.
   */
  const verifyAdminStatus = useCallback(
    async (
      userSession: Session | null,
      options?: { skipGetUser?: boolean }
    ): Promise<EvaluatedCrmAccess> => {
      if (!userSession || !userSession.user) {
        applyUnauthenticatedState();
        return {
          isAdmin: false,
          isStaff: false,
          isActive: false,
          isPendingInvite: false,
          role: null,
          canonicalRole: null,
          accountStatus: null,
          permissions: new Set(),
          shouldRedirectToPublic: false,
        };
      }

      if (!options?.skipGetUser) {
        const validated = await validateActiveSession(userSession);
        if (!validated) {
          return {
            isAdmin: false,
            isStaff: false,
            isActive: false,
            isPendingInvite: false,
            role: null,
            canonicalRole: null,
            accountStatus: null,
            permissions: new Set(),
            shouldRedirectToPublic: false,
          };
        }
        if (validated !== userSession) {
          setSession(validated);
        }
      }

      let rpcResult: { data: unknown; error: unknown };
      try {
        const { data, error } = await supabase.rpc("get_my_crm_access");
        rpcResult = { data, error };
      } catch (err) {
        rpcResult = { data: null, error: err };
      }

      const evaluated = evaluateCrmAccessResponse(rpcResult);

      setIsAdmin(evaluated.isAdmin);
      setIsStaff(evaluated.isStaff);
      setIsActive(evaluated.isActive);
      setRole(evaluated.role);
      setAccountStatus(evaluated.accountStatus);
      setPermissions(evaluated.permissions);

      return evaluated;
    },
    [applyUnauthenticatedState, validateActiveSession]
  );

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

        const validatedSession = await validateActiveSession(initialSession);
        if (!isMounted) return;
        if (!validatedSession) {
          setLoading(false);
          return;
        }

        setSession(validatedSession);
        await verifyAdminStatus(validatedSession, { skipGetUser: true });
        if (isMounted) setLoading(false);
      })
      .catch((err) => {
        console.warn("getSession error:", err);
        if (isMounted) {
          setSession(null);
          applyUnauthenticatedState();
          setLoading(false);
        }
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
      await verifyAdminStatus(newSession, { skipGetUser: event === "TOKEN_REFRESHED" });
      if (isMounted) setLoading(false);
    });

    const handleWindowFocus = () => {
      const current = sessionRef.current;
      if (!current) return;
      const now = Date.now();
      if (now - lastFocusSyncRef.current < 15000) return;
      lastFocusSyncRef.current = now;
      void verifyAdminStatus(current);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleWindowFocus);
    }

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleWindowFocus);
      }
    };
  }, [applyUnauthenticatedState, validateActiveSession, verifyAdminStatus]);

  // Live RBAC & account status synchronization for active authorized staff
  const activeUserId = session?.user?.id ?? null;
  useEffect(() => {
    if (!activeUserId || !isStaff) return;

    const channel = supabase
      .channel(`auth-rbac-sync-${activeUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${activeUserId}` },
        () => {
          if (sessionRef.current) void verifyAdminStatus(sessionRef.current);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${activeUserId}` },
        () => {
          if (sessionRef.current) void verifyAdminStatus(sessionRef.current);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_user_permissions",
          filter: `user_id=eq.${activeUserId}`,
        },
        () => {
          if (sessionRef.current) void verifyAdminStatus(sessionRef.current);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeUserId, isStaff, verifyAdminStatus]);

  const signIn = async (email: string, password: string): Promise<SignInResult> => {
    const clientConfig = checkSupabaseClientConfig();
    if (!clientConfig.isValid) {
      return {
        error:
          clientConfig.warning ||
          "Supabase configuration incomplete. VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required.",
        errorCategory: "config_error",
      };
    }

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

        const isConfigErr =
          errMsg.includes("Supabase configuration incomplete") ||
          errMsg.includes("Supabase client is not configured");

        const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
        const isNetworkMsg =
          !isConfigErr &&
          (errMsg.includes("Failed to fetch") ||
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
            status === 503);

        if (isConfigErr) {
          category = "config_error";
        } else if (isOffline || isNetworkMsg) {
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

      // Strictly verify session and get_my_crm_access() from live database
      let adminResult = await verifyAdminStatus(data.session);

      // Only attempt invite acceptance when backend confirms this user is an invited staff role
      if (adminResult.isPendingInvite && adminResult.isStaff && normalizeRole(adminResult.role)) {
        try {
          await supabase.rpc("accept_crm_invite");
          adminResult = await verifyAdminStatus(data.session);
        } catch {
          // Ignore if invite acceptance fails; strict check below fails closed
        }
      }

      if (!adminResult.isAdmin || !adminResult.isStaff || !adminResult.isActive || !adminResult.canonicalRole) {
        await supabase.auth.signOut().catch(() => {});
        setSession(null);
        applyUnauthenticatedState();
        setLoading(false);

        if (adminResult.errorCategory === "account_deactivated") {
          return {
            error: `Access denied: This CRM account (${data.session.user.email}) has been ${adminResult.accountStatus || "deactivated"}. Contact a Super Admin.`,
            errorCategory: "account_deactivated",
            isAdmin: false,
            isStaff: adminResult.isStaff,
            isActive: false,
            role: null,
            permissions: new Set(),
            shouldRedirectToPublic: false,
          };
        }

        return {
          error: `Authenticated as ${data.session.user.email}, but this account is not authorized for staff portal access.`,
          errorCategory: "unauthorized_role",
          isAdmin: false,
          isStaff: false,
          isActive: false,
          role: null,
          permissions: new Set(),
          shouldRedirectToPublic: true,
        };
      }

      // Record login timestamp (non-blocking)
      void supabase.rpc("record_crm_login").then(
        () => {},
        () => {}
      );

      setLoading(false);
      return {
        error: null,
        isAdmin: true,
        isStaff: true,
        isActive: true,
        shouldRedirectToPublic: false,
        role: adminResult.role,
        accountStatus: adminResult.accountStatus,
        permissions: adminResult.permissions,
      };
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
    }
  };

  const refreshRole = async () => {
    if (session) {
      setLoading(true);
      const resolved = await verifyAdminStatus(session);
      setLoading(false);
      return resolved;
    }
    return null;
  };

  const hasPermission = useCallback(
    (required: PermissionKey | PermissionKey[]) => {
      if (!isAdmin || !isStaff || !isActive) return false;
      return hasCrmPermission(permissions, required, accountStatus || "revoked");
    },
    [isAdmin, isStaff, isActive, permissions, accountStatus]
  );

  const canAccessRoute = useCallback(
    (pathname: string) => {
      if (!isAdmin || !isStaff || !isActive) return false;
      return canAccessAdminRoute(pathname, permissions, accountStatus || "revoked");
    },
    [isAdmin, isStaff, isActive, permissions, accountStatus]
  );

  const isSuperAdmin =
    isAdmin &&
    isStaff &&
    isActive &&
    accountStatus === "active" &&
    normalizeRole(role) === "super_admin";

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isAdmin,
        isStaff,
        isActive,
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
