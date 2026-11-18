import React, { useState, useEffect } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth, type AuthErrorCategory } from "@/lib/auth";
import {
  supabase,
  checkSupabaseClientConfig,
  getSupabaseConnectionInfo,
  pingSupabaseAuth,
} from "@/lib/supabase";
import { canAccessGatePortal } from "@/lib/gatePortal";
import { getRoleLabel } from "@/lib/rbac";
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
  QrCode,
  LogOut,
  UserCheck,
} from "lucide-react";

interface GateAuthError {
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

function classifyGateAuthError(
  error: any,
  explicitCategory?: AuthErrorCategory | string
): GateAuthError {
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
        ? "This scanner device appears offline. Connect to Wi-Fi or mobile data to verify gate tickets."
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
      title: "Gate Staff Account Suspended",
      message: "Your staff account has been deactivated or revoked by a Super Admin.",
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
      message: "The email address or password does not match an active gate staff account.",
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
      title: "Gate Staff Role Required",
      message: "Your credentials were recognized, but your account is not assigned an active gate role.",
      actionHint: "Ask a Super Admin to assign Gate Entry Staff or Esports Entry Staff access.",
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

export default function GateLogin() {
  const {
    session,
    role,
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

  const [authError, setAuthError] = useState<GateAuthError | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const isInviteParam =
      hash.includes("type=invite") ||
      search.includes("type=invite") ||
      hash.includes("type=recovery") ||
      search.includes("type=recovery");

    if (isInviteParam || (session && accountStatus === "invited")) {
      setIsInviteFlow(true);
    }
  }, [session, accountStatus]);

  // Authorized gate user already signed in -> proceed directly to /gate
  if (!authLoading && session && canAccessGatePortal(role, accountStatus) && !isInviteFlow) {
    return <Navigate to="/gate" replace />;
  }

  const hasNonGateSignedInRole =
    !authLoading &&
    Boolean(session) &&
    accountStatus === "active" &&
    !canAccessGatePortal(role, accountStatus) &&
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
      setAuthError(classifyGateAuthError("Password must be at least 8 characters long."));
      return;
    }
    if (password !== confirmPassword) {
      setAuthError(classifyGateAuthError("Passwords do not match. Please re-enter carefully."));
      return;
    }

    setLoading(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        setAuthError(classifyGateAuthError(updErr));
        setLoading(false);
        return;
      }

      try {
        await supabase.rpc("accept_crm_invite");
      } catch {
        // Fallback if RPC not yet applied
      }

      await refreshRole();
      setIsInviteFlow(false);
      setLoading(false);
      navigate("/gate", { replace: true });
    } catch (err: any) {
      setLoading(false);
      setAuthError(classifyGateAuthError(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setResetMessage(null);
    setPingResult(null);

    if (!email.trim() || !password) {
      setAuthError(classifyGateAuthError("Please enter both your email address and password."));
      return;
    }

    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);

    if (result.error) {
      setAuthError(classifyGateAuthError(result.rawError || result.error, result.errorCategory));
    } else {
      navigate("/gate", { replace: true });
    }
  };

  const handleResetPassword = async () => {
    setAuthError(null);
    setResetMessage(null);

    const targetEmail = email.trim();
    if (!targetEmail) {
      setAuthError(classifyGateAuthError("Please enter your gate staff email address first."));
      return;
    }

    setResetLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/gate/login?type=recovery`,
      });
      if (resetErr) {
        setAuthError(classifyGateAuthError(resetErr));
      } else {
        setResetMessage(`Password reset instructions sent to ${targetEmail}.`);
      }
    } catch (err: any) {
      setAuthError(classifyGateAuthError(err));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF9F4] text-[#191936] flex flex-col justify-between p-4 sm:p-6 md:p-8 relative selection:bg-[#D5F542] selection:text-[#191936]">
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "radial-gradient(#191936 1.2px, transparent 1.2px)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden="true"
      />

      <header className="relative z-10 w-full max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 py-2">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-heading font-extrabold uppercase tracking-wider text-[#191936] hover:text-[#4549D8] transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Return to Festival Homepage</span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#D5F542] border border-[#191936]" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#191936]/70">
            GATE ENTRY OPERATIONS
          </span>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-[460px] mx-auto my-auto py-6 sm:py-8">
        <div className="bg-white border-3 sm:border-4 border-[#191936] rounded-[24px] sm:rounded-[30px] p-6 sm:p-8 shadow-[6px_6px_0px_#191936] sm:shadow-[8px_8px_0px_#191936] flex flex-col">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#0B1120] text-[#D5F542] border-2 border-[#191936] flex items-center justify-center shadow-[3px_3px_0px_#4549D8] mb-4">
              {isInviteFlow ? <UserCheck size={26} /> : <QrCode size={26} />}
            </div>

            <span className="font-heading text-xs font-bold text-[#4549D8] tracking-[0.16em] uppercase mb-1">
              SUPERNOVA 3.0 · VENUE GATE DESK
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#191936] leading-tight">
              {isInviteFlow ? "Activate Gate Staff Account" : "Gate Verification Login"}
            </h1>
            <p className="font-body text-xs sm:text-sm text-[#191936]/75 mt-1.5 leading-relaxed max-w-[340px]">
              {isInviteFlow
                ? "Create your staff password to activate your Supernova 3.0 Gate Verification credentials."
                : "Sign in to access live QR scanning, ticket verification, walk-in passes, and wristband check-in."}
            </p>
          </div>

          {hasNonGateSignedInRole && (
            <div
              role="alert"
              className="mb-5 p-4 rounded-2xl border-2 border-amber-400 bg-amber-50 text-amber-950 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <ShieldAlert size={18} className="shrink-0 text-amber-700 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <strong className="block text-sm mb-0.5">
                    Gate Portal Access Denied ({getRoleLabel(role)})
                  </strong>
                  Signed in as <strong>{session?.user.email}</strong>. Your current role is not
                  authorized for the Gate Verification Portal. Sign in with a{" "}
                  <strong>Gate Entry Staff</strong>, <strong>Esports Entry Staff</strong>,{" "}
                  <strong>CRM Admin</strong>, or <strong>Super Admin</strong> account.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    setAuthError(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0B1120] text-white text-xs font-bold cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>Sign Out &amp; Switch Account</span>
                </button>
                <Link
                  to="/admin/login"
                  className="inline-flex items-center px-3 py-2 rounded-xl border border-amber-400 bg-white text-amber-950 text-xs font-bold no-underline"
                >
                  Open CRM Admin Login
                </Link>
              </div>
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="mb-5 p-4 rounded-2xl border-2 border-rose-400 bg-rose-50 text-rose-950 space-y-2.5"
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
              <p className="text-[11px] font-medium bg-rose-100/80 border border-rose-200 rounded-xl px-3 py-2 m-0 text-rose-950">
                {authError.actionHint}
              </p>

              {authError.category === "network_error" && (
                <div className="pt-1 space-y-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="w-full py-2 px-3 rounded-xl bg-white border border-rose-300 text-rose-950 text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
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
              className="mb-5 p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-400/50 text-emerald-900 text-xs font-medium flex items-start gap-2.5"
            >
              <CheckCircle size={17} className="shrink-0 text-emerald-600 mt-0.5" />
              <span>{resetMessage}</span>
            </div>
          )}

          {!configStatus.isValid && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-900 text-xs font-medium flex items-start gap-2.5"
            >
              <ShieldAlert size={17} className="shrink-0 text-amber-600 mt-0.5" />
              <span>{configStatus.warning}</span>
            </div>
          )}

          {isInviteFlow && session ? (
            <form onSubmit={handleAcceptInvitePassword} className="flex flex-col gap-4">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
                Activating gate staff credentials for <strong>{session.user.email}</strong>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="gate-invite-password"
                  className="font-heading text-xs font-bold text-[#191936] tracking-wide uppercase"
                >
                  Create Password (Min 8 chars)
                </label>
                <div className="relative flex items-center">
                  <input
                    id="gate-invite-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full h-[50px] pl-11 pr-11 bg-[#FAF9F4] text-[#191936] text-sm font-body border-2 border-[#191936] rounded-xl outline-none focus:bg-white focus:border-[#4549D8]"
                  />
                  <Lock size={18} className="absolute left-3.5 text-[#191936]/50 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 p-1.5 text-[#191936]/60 hover:text-[#191936] cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="gate-invite-confirm-password"
                  className="font-heading text-xs font-bold text-[#191936] tracking-wide uppercase"
                >
                  Confirm Password
                </label>
                <div className="relative flex items-center">
                  <input
                    id="gate-invite-confirm-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full h-[50px] pl-11 pr-4 bg-[#FAF9F4] text-[#191936] text-sm font-body border-2 border-[#191936] rounded-xl outline-none focus:bg-white focus:border-[#4549D8]"
                  />
                  <Lock size={18} className="absolute left-3.5 text-[#191936]/50 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full h-[52px] rounded-full bg-[#D5F542] text-[#191936] font-heading font-bold text-sm uppercase tracking-wider border-2 border-[#191936] shadow-[3px_3px_0px_#191936] hover:bg-[#E2FF4A] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <UserCheck size={18} />}
                <span>{loading ? "Activating Account..." : "Activate Gate Staff Access"}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="gate-email"
                  className="font-heading text-xs sm:text-[13px] font-bold text-[#191936] tracking-wide uppercase"
                >
                  Gate Staff Email
                </label>
                <div className="relative flex items-center">
                  <input
                    id="gate-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="gate.staff@nationalcollege.edu"
                    required
                    autoComplete="email"
                    className="w-full h-[50px] pl-11 pr-4 bg-[#FAF9F4] text-[#191936] placeholder-[#191936]/40 text-sm sm:text-base font-body border-2 border-[#191936] rounded-xl outline-none focus:bg-white focus:border-[#4549D8]"
                  />
                  <Mail size={18} className="absolute left-3.5 text-[#191936]/50 pointer-events-none" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="gate-password"
                    className="font-heading text-xs sm:text-[13px] font-bold text-[#191936] tracking-wide uppercase"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resetLoading}
                    className="text-[11px] sm:text-xs font-heading font-bold text-[#4549D8] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {resetLoading ? "Sending reset link..." : "Forgot password?"}
                  </button>
                </div>

                <div className="relative flex items-center">
                  <input
                    id="gate-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full h-[50px] pl-11 pr-11 bg-[#FAF9F4] text-[#191936] placeholder-[#191936]/40 text-sm sm:text-base font-body border-2 border-[#191936] rounded-xl outline-none focus:bg-white focus:border-[#4549D8]"
                  />
                  <Lock size={18} className="absolute left-3.5 text-[#191936]/50 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 p-1.5 text-[#191936]/60 hover:text-[#191936] transition-colors cursor-pointer"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full h-[52px] rounded-full bg-[#D5F542] text-[#191936] font-heading font-bold text-sm sm:text-base uppercase tracking-wider border-2 border-[#191936] shadow-[3px_3px_0px_#191936] hover:bg-[#E2FF4A] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-[#191936]" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <span>Sign In to Gate Portal</span>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-[#191936]/15 flex flex-col gap-1">
            <span className="font-heading text-[11px] font-bold text-[#191936]/75 uppercase tracking-wider">
              Dedicated Gate Operations Access
            </span>
            <p className="font-body text-xs text-[#191936]/65 leading-relaxed m-0">
              Restricted to authorized Visitor Entry and Esports Gate personnel on 20–21 November 2026.
            </p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 w-full max-w-5xl mx-auto text-center py-2 text-xs font-body text-[#191936]/60">
        Supernova 3.0 · 20–21 November 2026 · The National College, Basavanagudi
      </footer>
    </div>
  );
}
