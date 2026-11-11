import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AdminRole } from "@/types/database";

export type AuthErrorCategory =
  | "invalid_credentials"
  | "network_error"
  | "email_not_confirmed"
  | "rate_limited"
  | "unauthorized_role"
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
  role: AdminRole | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false); // Security first: default closed
  const [role, setRole] = useState<AdminRole | null>(null);

  /**
   * Multi-tier administrator role verification.
   * Checks database is_admin() SECURITY DEFINER RPC first, falls back to
   * direct user_roles lookup, and verifies auth metadata claims.
   */
  const verifyAdminStatus = async (
    userSession: Session | null
  ): Promise<{ isAdmin: boolean; role: AdminRole | null }> => {
    if (!userSession || !userSession.user) {
      setIsAdmin(false);
      setRole(null);
      return { isAdmin: false, role: null };
    }

    const userId = userSession.user.id;
    let hasAdminStatus = false;
    let resolvedRole: AdminRole | null = null;

    // Tier 1: Check RPC is_admin (SECURITY DEFINER in DB)
    try {
      const { data: rpcAdmin, error: rpcError } = await supabase.rpc("is_admin");
      if (!rpcError && Boolean(rpcAdmin)) {
        hasAdminStatus = true;
      } else if (rpcError) {
        console.info("is_admin RPC diagnostic note:", rpcError.message);
      }
    } catch (err) {
      console.warn("RPC is_admin call exception:", err);
    }

    // Tier 2: Fetch explicit role assignment from user_roles
    try {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .limit(1);

      if (!rolesError && roles && roles.length > 0 && roles[0].role) {
        hasAdminStatus = true;
        resolvedRole = roles[0].role as AdminRole;
      }
    } catch (err) {
      console.warn("user_roles query exception:", err);
    }

    // Tier 3: Check app_metadata or user_metadata for administrator claims
    if (!hasAdminStatus) {
      const appMetadata = userSession.user.app_metadata || {};
      const userMetadata = userSession.user.user_metadata || {};
      const assignedRole = (appMetadata.role || userMetadata.role || "") as string;
      const isExplicitAdmin = Boolean(appMetadata.is_admin || userMetadata.is_admin);

      const validRoles: AdminRole[] = ["super_admin", "event_admin", "checkin_staff", "score_operator"];
      if (validRoles.includes(assignedRole as AdminRole)) {
        hasAdminStatus = true;
        resolvedRole = assignedRole as AdminRole;
      } else if (assignedRole === "admin" || isExplicitAdmin) {
        hasAdminStatus = true;
        resolvedRole = "super_admin";
      }
    }

    // Default role for verified admins with unassigned sub-role
    if (hasAdminStatus && !resolvedRole) {
      resolvedRole = "super_admin";
    }

    setIsAdmin(hasAdminStatus);
    setRole(resolvedRole);
    return { isAdmin: hasAdminStatus, role: resolvedRole };
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    // Initial session recovery from Supabase client storage
    supabase.auth
      .getSession()
      .then(async ({ data: { session: initialSession }, error }) => {
        if (!isMounted) return;
        if (error) {
          console.warn("Error restoring Supabase session:", error);
          setSession(null);
          setIsAdmin(false);
          setRole(null);
          setLoading(false);
          return;
        }

        if (initialSession) {
          setSession(initialSession);
          await verifyAdminStatus(initialSession);
        } else {
          setSession(null);
          setIsAdmin(false);
          setRole(null);
        }
        if (isMounted) setLoading(false);
      })
      .catch((err) => {
        console.warn("getSession error:", err);
        if (isMounted) setLoading(false);
      });

    // Realtime auth state change listener
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT" || !newSession) {
        setSession(null);
        setIsAdmin(false);
        setRole(null);
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

  const signIn = async (
    email: string,
    password: string
  ): Promise<SignInResult> => {
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
          userMessage = "Your email address has not been confirmed yet. Please check your inbox for the confirmation email.";
        } else if (errMsg.includes("rate limit") || errMsg.includes("Too many requests") || status === 429) {
          category = "rate_limited";
          userMessage = "Too many login attempts. Please wait a few moments before trying again.";
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

      // Immediately set the session in state so context is in sync
      setSession(data.session);

      // Verify administrator permissions before resolving
      const adminResult = await verifyAdminStatus(data.session);
      setLoading(false);

      if (!adminResult.isAdmin) {
        return {
          error: `Authenticated successfully as ${data.session.user.email}, but this account does not have an active administrator role assigned in public.user_roles. Please contact a Super Administrator.`,
          errorCategory: "unauthorized_role",
          isAdmin: false,
        };
      }

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
      setIsAdmin(false);
      setRole(null);
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

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isAdmin,
        role,
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
