import React, { useState, useEffect } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth, type AuthErrorCategory } from "@/lib/auth";
import {
  supabase,
  checkSupabaseClientConfig,
  getSupabaseConnectionInfo,
  pingSupabaseAuth,
} from "@/lib/supabase";
import { canAccessRegistrationDesk, resolvePostLoginRoute } from "@/lib/registrationDesk";
import { isGateOnlyRole } from "@/lib/gatePortal";
import { getRoleLabel, normalizeRole } from "@/lib/rbac";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  ArrowLeft,
  ShieldAlert,
  CheckCircle,
  Loader2,
  WifiOff,
  KeyRound,
  AlertTriangle,
  RefreshCw,
  ClipboardList,
  LogOut,
  UserCheck,
} from "lucide-react";

interface DeskAuthError {
  category:
    | "invalid_credentials"
    | "network_error"
    | "rate_limited"
    | "email_not_confirmed"
    | "unauthorized_role"
    | "account_deactivated"
    | "config_error"
    | "general_error";
  title: string;
  message: string;
  actionHint: string;
}

function classifyDeskAuthError(
  error: any,
  explicitCategory?: AuthErrorCategory | string
): DeskAuthError {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  const rawMsg =
    typeof error === "string"
      ? error
      : error?.message || error?.error_description || "Authentication request failed";
  const errCode = error?.code || error?.name || "";
  const status = typeof error?.status === "number" ? error.status : 0;

  if (
    explicitCategory === "config_error" ||
    rawMsg.includes("Supabase configuration incomplete") ||
    rawMsg.includes("Supabase client is not configured")
  ) {
    return {
      category: "config_error",
      title: "Supabase Configuration Incomplete",
      message: rawMsg,
      actionHint: "Contact the Supernova 3.0 technical coordinator to verify backend keys.",
    };
  }

  if (
    explicitCategory === "network_error" ||
    !isOnline ||
    rawMsg.includes("Failed to fetch") ||
    rawMsg.includes("NetworkError") ||
    rawMsg.includes("Network request failed") ||
    rawMsg.includes("Load failed") ||
    errCode === "AuthRetryableFetchError" ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return {
      category: "network_error",
      title: "Network Connection Failure",
      message: !isOnline
        ? "This registration desk device appears offline. Connect to Wi-Fi or mobile data to sign in."
        : "Could not reach the Supernova 3.0 authentication server.",
      actionHint: "Check your internet connection and retry or ping the auth server below.",
    };
  }

  if (
    explicitCategory === "account_deactivated" ||
    rawMsg.toLowerCase().includes("deactivated") ||
    rawMsg.toLowerCase().includes("revoked") ||
    rawMsg.toLowerCase().includes("banned")
  ) {
    return {
      category: "account_deactivated",
      title: "Volunteer Account Suspended",
      message: "Your registration desk account has been deactivated or revoked by a Super Admin.",
      actionHint: "Contact the Supernova 3.0 Super Admin desk if your shift access should be active.",
    };
  }

  if (
    explicitCategory === "invalid_credentials" ||
    rawMsg.includes("Invalid login credentials") ||
    rawMsg.includes("invalid_grant") ||
    errCode === "invalid_credentials"
  ) {
    return {
      category: "invalid_credentials",
      title: "Invalid Credentials",
      message: "The email address or password does not match an active registration desk account.",
      actionHint: "Check your spelling or use Forgot password? to reset your staff password.",
    };
  }

  if (
    explicitCategory === "unauthorized_role" ||
    rawMsg.includes("active CRM role") ||
    rawMsg.includes("user_roles")
  ) {
    return {
      category: "unauthorized_role",
      title: "Registration Desk Clerk Role Required",
      message:
        "Your credentials were recognized, but your account is not assigned an active Registration Desk Clerk role.",
      actionHint: "Ask a Super Admin to assign Registration Desk Clerk access in User Management.",
    };
  }

  if (explicitCategory === "rate_limited" || status === 429) {
    return {
      category: "rate_limited",
      title: "Too Many Attempts",
      message: "Sign-in requests have been temporarily throttled.",
      actionHint: "Wait 60 seconds and try signing in again.",
    };
  }

  if (explicitCategory === "email_not_confirmed" || errCode === "email_not_confirmed") {
    return {
      category: "email_not_confirmed",
      title: "Invitation Acceptance Pending",
      message: "Please confirm your staff invitation email before signing in.",
      actionHint: "Open your staff invitation link from your inbox first.",
    };
  }

  return {
    category: "general_error",
    title: "Authentication Error",
    message: rawMsg,
    actionHint: "Verify your credentials and retry.",
  };
}

export default function RegistrationDeskLogin() {
  const {
    session,
    isAdmin,
    isStaff,
    isActive,
    role,
    permissions,
    accountStatus,
    loading: authLoading,
    signIn,
    signOut,
    refreshRole,
  } = useAuth();
  const navigate = useNavigate();

  const [configStatus] = useState(() => checkSupabaseClientConfig());
  const connectionInfo = getSupabaseConnectionInfo();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isInviteFlow, setIsInviteFlow] = useState(false);

  const [authError, setAuthError] = useState<DeskAuthError | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; message: string } | null>(null);

  const canonicalRole = normalizeRole(role);
  const isValidStaffSession = Boolean(
    session &&
      isAdmin &&
      isStaff &&
      isActive &&
      accountStatus === "active" &&
      canonicalRole !== null
  );
  const isValidInvitedStaff = Boolean(
    session &&
      isStaff &&
      accountStatus === "invited" &&
      canonicalRole !== null
  );

  useEffect(() => {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const isInviteParam =
      hash.includes("type=invite") ||
      search.includes("type=invite") ||
      hash.includes("type=recovery") ||
      search.includes("type=recovery");

    if (isValidInvitedStaff || (isInviteParam && (!session || (isStaff && canonicalRole !== null)))) {
      setIsInviteFlow(true);
    } else if (!session) {
      setIsInviteFlow(false);
    }
  }, [session, isValidInvitedStaff, isStaff, canonicalRole]);

  useEffect(() => {
    if (!authLoading && session && !isValidStaffSession && !isValidInvitedStaff) {
      void signOut();
      navigate("/", { replace: true });
    }
  }, [authLoading, session, isValidStaffSession, isValidInvitedStaff, signOut, navigate]);

  if (!authLoading && session && !isValidStaffSession && !isValidInvitedStaff) {
    return <Navigate to="/" replace />;
  }

  // Authorized user already signed in -> redirect straight to /registration-desk
  if (!authLoading && isValidStaffSession && canAccessRegistrationDesk(role, accountStatus) && !isInviteFlow) {
    return <Navigate to="/registration-desk" replace />;
  }

  const hasNonDeskSignedInRole =
    !authLoading &&
    isValidStaffSession &&
    !canAccessRegistrationDesk(role, accountStatus) &&
    !isInviteFlow;

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setPingResult(null);
    try {
      const result = await pingSupabaseAuth();
      setPingResult({ ok: result.ok, message: result.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleAcceptInvitePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setResetMessage(null);

    if (password.length < 8) {
      setAuthError(classifyDeskAuthError("Password must be at least 8 characters long."));
      return;
    }
    if (password !== confirmPassword) {
      setAuthError(classifyDeskAuthError("Passwords do not match. Please re-enter carefully."));
      return;
    }

    setLoading(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        setAuthError(classifyDeskAuthError(updErr));
        setLoading(false);
        return;
      }

      try {
        await supabase.rpc("accept_crm_invite");
      } catch {
        // Fallback if RPC not yet applied
      }

      const refreshed = await refreshRole();
      if (!refreshed?.isAdmin || !refreshed?.isStaff || !refreshed?.isActive || !refreshed?.canonicalRole) {
        await signOut();
        setIsInviteFlow(false);
        setLoading(false);
        if (refreshed?.shouldRedirectToPublic) {
          navigate("/", { replace: true });
          return;
        }
        setAuthError(
          classifyDeskAuthError(
            "Registration desk access is not active for this account.",
            refreshed?.errorCategory || "unauthorized_role"
          )
        );
        return;
      }

      setIsInviteFlow(false);
      setLoading(false);
      const dest = resolvePostLoginRoute({
        portal: "registration_desk",
        role: refreshed.role ?? role,
        permissions: refreshed.permissions ?? permissions,
      });
      navigate(dest, { replace: true });
    } catch (err: any) {
      setLoading(false);
      setAuthError(classifyDeskAuthError(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setResetMessage(null);
    setPingResult(null);

    if (!email.trim() || !password) {
      setAuthError(classifyDeskAuthError("Please enter both your email address and password."));
      return;
    }

    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);

    if (result.error) {
      if (result.shouldRedirectToPublic) {
        navigate("/", { replace: true });
        return;
      }
      setAuthError(classifyDeskAuthError(result.rawError || result.error, result.errorCategory));
    } else {
      const dest = resolvePostLoginRoute({
        portal: "registration_desk",
        role: result.role ?? role,
        permissions: result.permissions ?? permissions,
      });
      navigate(dest, { replace: true });
    }
  };

  const handleResetPassword = async () => {
    setAuthError(null);
    setResetMessage(null);

    const targetEmail = email.trim();
    if (!targetEmail) {
      setAuthError(classifyDeskAuthError("Please enter your registration staff email address first."));
      return;
    }

    setResetLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/registration-desk/login?type=recovery`,
      });
      if (resetErr) {
        setAuthError(classifyDeskAuthError(resetErr));
      } else {
        setResetMessage(`Password reset instructions sent to ${targetEmail}.`);
      }
    } catch (err: any) {
      setAuthError(classifyDeskAuthError(err));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-900 flex flex-col justify-between p-4 sm:p-6 md:p-8">
      <header className="w-full max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 py-2">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-950 no-underline transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Return to Festival Homepage</span>
        </Link>

        <span className="font-mono text-xs font-semibold text-slate-500">
          Supernova 3.0 · Registration Desk
        </span>
      </header>

      <main className="w-full max-w-[440px] mx-auto my-auto py-6 sm:py-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-4">
              {isInviteFlow ? <UserCheck size={22} /> : <ClipboardList size={22} />}
            </div>

            <h1 className="font-display text-2xl font-bold text-slate-900 leading-tight m-0">
              {isInviteFlow ? "Activate Staff Account" : "Registration Desk Login"}
            </h1>
            <p className="font-body text-sm text-slate-600 mt-1.5 leading-relaxed max-w-[340px]">
              {isInviteFlow
                ? "Create your password to activate your Registration Desk account."
                : "Sign in with your staff email and password to open the Registration Desk."}
            </p>
          </div>

          {hasNonDeskSignedInRole && (
            <div
              role="alert"
              className="mb-5 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <ShieldAlert size={18} className="shrink-0 text-amber-700 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong className="block text-sm mb-0.5">
                    Registration Desk Access Restricted ({getRoleLabel(role)})
                  </strong>
                  Signed in as <strong>{session?.user.email}</strong>. Your current role is not
                  assigned to the Registration Desk Portal.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    setAuthError(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>Sign Out &amp; Switch Account</span>
                </button>
                {isGateOnlyRole(role) ? (
                  <Link
                    to="/gate"
                    className="inline-flex items-center px-3 py-2 rounded-lg border border-amber-400 bg-white text-amber-950 text-xs font-semibold no-underline"
                  >
                    Open Gate Portal
                  </Link>
                ) : (
                  <Link
                    to="/admin"
                    className="inline-flex items-center px-3 py-2 rounded-lg border border-amber-400 bg-white text-amber-950 text-xs font-semibold no-underline"
                  >
                    Open Admin CRM
                  </Link>
                )}
              </div>
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="mb-5 p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-950 space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                {authError.category === "network_error" ? (
                  <WifiOff size={18} className="shrink-0 text-rose-600 mt-0.5" />
                ) : authError.category === "invalid_credentials" ? (
                  <KeyRound size={18} className="shrink-0 text-rose-600 mt-0.5" />
                ) : (
                  <AlertTriangle size={18} className="shrink-0 text-rose-600 mt-0.5" />
                )}
                <div>
                  <h2 className="text-sm font-bold text-rose-950 m-0">{authError.title}</h2>
                  <p className="text-xs text-rose-900 mt-1 mb-0 leading-relaxed">
                    {authError.message}
                  </p>
                </div>
              </div>
              <p className="text-[11px] font-medium bg-rose-100/80 border border-rose-200 rounded-lg px-3 py-2 m-0 text-rose-950">
                {authError.actionHint}
              </p>

              {authError.category === "network_error" && (
                <div className="pt-1 space-y-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="w-full py-2 px-3 rounded-lg bg-white border border-rose-300 text-rose-950 text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {testingConnection ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Testing Auth Connection...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={14} />
                        <span>Ping Auth Connection</span>
                      </>
                    )}
                  </button>
                  {pingResult && (
                    <div
                      className={`p-2 rounded-lg text-[11px] font-mono border ${
                        pingResult.ok
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : "bg-rose-100 border-rose-300 text-rose-950"
                      }`}
                    >
                      {pingResult.message} ({connectionInfo.url || "unconfigured"})
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {resetMessage && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-start gap-2.5"
            >
              <CheckCircle size={17} className="shrink-0 text-emerald-600 mt-0.5" />
              <span>{resetMessage}</span>
            </div>
          )}

          {!configStatus.isValid && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium flex items-start gap-2.5"
            >
              <ShieldAlert size={17} className="shrink-0 text-amber-600 mt-0.5" />
              <span>{configStatus.warning}</span>
            </div>
          )}

          {isInviteFlow && session ? (
            <form onSubmit={handleAcceptInvitePassword} className="flex flex-col gap-4">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
                Activating registration desk credentials for <strong>{session.user.email}</strong>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="desk-invite-password"
                  className="text-xs font-semibold text-slate-700"
                >
                  Create Password (min 8 chars)
                </label>
                <div className="relative flex items-center">
                  <input
                    id="desk-invite-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full h-11 pl-10 pr-10 bg-slate-50 text-slate-900 text-sm border border-slate-300 rounded-xl outline-none focus:bg-white focus:border-blue-600"
                  />
                  <Lock size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="desk-invite-confirm-password"
                  className="text-xs font-semibold text-slate-700"
                >
                  Confirm Password
                </label>
                <div className="relative flex items-center">
                  <input
                    id="desk-invite-confirm-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full h-11 pl-10 pr-4 bg-slate-50 text-slate-900 text-sm border border-slate-300 rounded-xl outline-none focus:bg-white focus:border-blue-600"
                  />
                  <Lock size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                <span>{loading ? "Activating Account..." : "Activate & Enter Registration Desk"}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="desk-email" className="text-sm font-semibold text-slate-700">
                  Email Address *
                </label>
                <div className="relative flex items-center">
                  <input
                    id="desk-email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@nationalcollege.edu"
                    required
                    autoComplete="email"
                    className="w-full h-12 pl-10 pr-4 bg-slate-50 text-slate-900 placeholder-slate-400 text-base border border-slate-300 rounded-xl outline-none focus:bg-white focus:border-blue-600"
                  />
                  <Mail size={17} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="desk-password" className="text-sm font-semibold text-slate-700">
                    Password *
                  </label>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resetLoading}
                    className="min-h-[36px] text-xs font-medium text-blue-600 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {resetLoading ? "Sending reset link..." : "Forgot password?"}
                  </button>
                </div>

                <div className="relative flex items-center">
                  <input
                    id="desk-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="w-full h-12 pl-10 pr-12 bg-slate-50 text-slate-900 placeholder-slate-400 text-base border border-slate-300 rounded-xl outline-none focus:bg-white focus:border-blue-600"
                  />
                  <Lock size={17} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-1.5 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>
          )}

          <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>Direct Registration Desk Sign-In</span>
            <Link to="/admin/login" className="font-semibold text-blue-600 hover:underline no-underline">
              Main Staff Login →
            </Link>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-5xl mx-auto text-center py-2 text-xs text-slate-500">
        Supernova 3.0 · 20–21 November 2026 · The National College, Basavanagudi
      </footer>
    </div>
  );
}
