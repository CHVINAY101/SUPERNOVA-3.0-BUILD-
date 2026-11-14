import React, { useState, useEffect } from "react";
import { Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth, type AuthErrorCategory } from "@/lib/auth";
import { supabase, checkSupabaseClientConfig, getSupabaseConnectionInfo } from "@/lib/supabase";
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
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  UserCheck,
} from "lucide-react";

export interface AuthDiagnostic {
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
  statusCode?: number;
  errorCode?: string;
  timestamp: string;
  isOnline: boolean;
  endpoint: string;
  rawDetails?: string;
}

function classifyAuthError(
  error: any,
  explicitCategory?: AuthErrorCategory | string
): AuthDiagnostic {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  const rawMsg =
    typeof error === "string"
      ? error
      : error?.message || error?.error_description || "Authentication request failed";
  const errCode = error?.code || error?.name || "";
  const status = typeof error?.status === "number" ? error.status : 0;
  const connectionInfo = getSupabaseConnectionInfo();
  const endpoint = connectionInfo.url || "https://cirreovughlncadrbvcn.supabase.co";
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // 1. Network Failure
  const isNetwork =
    explicitCategory === "network_error" ||
    !isOnline ||
    rawMsg.includes("Failed to fetch") ||
    rawMsg.includes("NetworkError") ||
    rawMsg.includes("Network request failed") ||
    rawMsg.includes("Load failed") ||
    rawMsg.includes("ERR_") ||
    errCode === "AuthRetryableFetchError" ||
    (errCode === "TypeError" && rawMsg.includes("fetch")) ||
    status === 504 ||
    status === 502 ||
    status === 503;

  if (isNetwork) {
    return {
      category: "network_error",
      title: "Network Connection Failure",
      message: !isOnline
        ? "Your browser is currently offline. An active internet connection is required to authenticate with the Supernova 3.0 server."
        : "Could not establish a connection to the Supabase authentication server.",
      actionHint: "Verify your internet connectivity and retry or test the connection below.",
      statusCode: status || (isOnline ? 0 : -1),
      errorCode: errCode || (isOnline ? "NETWORK_UNREACHABLE" : "BROWSER_OFFLINE"),
      timestamp: now,
      isOnline,
      endpoint,
      rawDetails: rawMsg,
    };
  }

  // 2. Deactivated / Revoked Account
  if (
    explicitCategory === "account_deactivated" ||
    rawMsg.toLowerCase().includes("deactivated") ||
    rawMsg.toLowerCase().includes("revoked") ||
    rawMsg.toLowerCase().includes("banned")
  ) {
    return {
      category: "account_deactivated",
      title: "Account Deactivated or Revoked",
      message: "Your CRM staff account has been suspended or revoked by a Super Admin.",
      actionHint: "Contact the Super Admin team if your operational access needs to be restored.",
      statusCode: 403,
      errorCode: "ACCOUNT_SUSPENDED",
      timestamp: now,
      isOnline,
      endpoint,
      rawDetails: rawMsg,
    };
  }

  // 3. Invalid Credentials
  const isInvalidCreds =
    explicitCategory === "invalid_credentials" ||
    rawMsg.includes("Invalid login credentials") ||
    rawMsg.includes("invalid_grant") ||
    errCode === "invalid_credentials" ||
    (status === 400 && rawMsg.toLowerCase().includes("credential"));

  if (isInvalidCreds) {
    return {
      category: "invalid_credentials",
      title: "Invalid Credentials",
      message: "The email address or password entered does not match an invited CRM user.",
      actionHint: "Verify your email spelling and password, or use Forgot password? to reset your password.",
      statusCode: 400,
      errorCode: "INVALID_CREDENTIALS",
      timestamp: now,
      isOnline,
      endpoint,
      rawDetails: rawMsg,
    };
  }

  // 4. Unauthorized Role
  const isUnauthorizedRole =
    explicitCategory === "unauthorized_role" ||
    rawMsg.includes("active CRM role") ||
    rawMsg.includes("user_roles");

  if (isUnauthorizedRole) {
    return {
      category: "unauthorized_role",
      title: "CRM Access Not Assigned",
      message: "Your credentials were recognized, but this account does not have an active CRM role or invitation.",
      actionHint: "CRM access is strictly invitation-based. Ask a Super Admin to invite your account from User Management.",
      statusCode: 403,
      errorCode: "ROLE_NOT_ASSIGNED",
      timestamp: now,
      isOnline,
      endpoint,
      rawDetails: rawMsg,
    };
  }

  // 5. Rate Limited
  if (
    explicitCategory === "rate_limited" ||
    rawMsg.includes("rate limit") ||
    rawMsg.includes("Too many requests") ||
    status === 429
  ) {
    return {
      category: "rate_limited",
      title: "Too Many Login Attempts",
      message: "Authentication requests have been temporarily throttled.",
      actionHint: "Please wait 60 seconds before submitting another login attempt.",
      statusCode: 429,
      errorCode: "RATE_LIMIT_EXCEEDED",
      timestamp: now,
      isOnline,
      endpoint,
      rawDetails: rawMsg,
    };
  }

  // 6. Email Unconfirmed
  if (
    explicitCategory === "email_not_confirmed" ||
    rawMsg.includes("Email not confirmed") ||
    errCode === "email_not_confirmed"
  ) {
    return {
      category: "email_not_confirmed",
      title: "Invitation Acceptance Pending",
      message: "Please open the invitation link sent to your email address to verify your identity first.",
      actionHint: "Check your email inbox (and spam folder) for your Supernova 3.0 CRM invitation link.",
      statusCode: 400,
      errorCode: "EMAIL_NOT_CONFIRMED",
      timestamp: now,
      isOnline,
      endpoint,
      rawDetails: rawMsg,
    };
  }

  return {
    category: "general_error",
    title: "Authentication Error",
    message: rawMsg,
    actionHint: "Review your credentials or check the technical diagnostics below.",
    statusCode: status || 500,
    errorCode: errCode || "AUTH_FAILURE",
    timestamp: now,
    isOnline,
    endpoint,
    rawDetails: rawMsg,
  };
}

function logAuthDiagnosticToConsole(diag: AuthDiagnostic) {
  console.groupCollapsed(`[AdminAuth Diagnostic] ${diag.title} [${diag.category.toUpperCase()}]`);
  console.warn("Classification:", diag.category);
  console.info("User Message:", diag.message);
  if (diag.rawDetails) {
    console.info("Details:", diag.rawDetails);
  }
  console.groupEnd();
}

export default function AdminLogin() {
  const { session, isAdmin, accountStatus, loading: authLoading, signIn, refreshRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [configStatus] = useState(() => {
    const status = checkSupabaseClientConfig();
    if (!status.isValid && status.warning) {
      console.warn(status.warning);
    }
    return status;
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Detect invitation / password recovery flow from URL or invited session
  const [isInviteFlow, setIsInviteFlow] = useState(false);

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

  const [diagnostic, setDiagnostic] = useState<AuthDiagnostic | null>(null);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const [testingConnection, setTestingConnection] = useState(false);
  const [pingResult, setPingResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Already active authenticated admin -> redirect to workspace
  if (!authLoading && session && isAdmin && accountStatus === "active" && !isInviteFlow) {
    const dest = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/admin";
    return <Navigate to={dest} replace />;
  }

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setPingResult(null);
    const start = performance.now();
    try {
      const { error: pingErr } = await supabase.auth.getSession();
      const latency = Math.round(performance.now() - start);
      if (pingErr) {
        setPingResult({ ok: false, message: `Endpoint returned error: ${pingErr.message}`, latencyMs: latency });
      } else {
        setPingResult({
          ok: true,
          message: `Endpoint reachable (${latency}ms). Connection to Supabase is active.`,
          latencyMs: latency,
        });
      }
    } catch (testErr: any) {
      const latency = Math.round(performance.now() - start);
      setPingResult({
        ok: false,
        message: `Network ping failed: ${testErr?.message || "Server unreachable"}`,
        latencyMs: latency,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleCopyDiagnostic = () => {
    if (!diagnostic) return;
    const report = [
      `=== SUPERNOVA 3.0 ADMIN AUTH DIAGNOSTIC ===`,
      `Timestamp: ${diagnostic.timestamp}`,
      `Category: ${diagnostic.category}`,
      `Title: ${diagnostic.title}`,
      `Message: ${diagnostic.message}`,
      `Error Code: ${diagnostic.errorCode || "N/A"}`,
      `HTTP Status: ${diagnostic.statusCode ?? "N/A"}`,
      `Endpoint: ${diagnostic.endpoint}`,
    ].join("\n");

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(report);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    }
  };

  const handleAcceptInvitePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setDiagnostic(null);
    setResetMessage(null);

    if (password.length < 8) {
      setDiagnostic(classifyAuthError("Password must be at least 8 characters long."));
      return;
    }
    if (password !== confirmPassword) {
      setDiagnostic(classifyAuthError("Passwords do not match. Please re-enter carefully."));
      return;
    }

    setLoading(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        const diag = classifyAuthError(updErr);
        setDiagnostic(diag);
        logAuthDiagnosticToConsole(diag);
        setLoading(false);
        return;
      }

      try {
        await supabase.rpc("accept_crm_invite");
      } catch {
        // Fallback if RPC not yet deployed
      }

      await refreshRole();
      setIsInviteFlow(false);
      setLoading(false);
      navigate("/admin", { replace: true });
    } catch (err: any) {
      setLoading(false);
      const diag = classifyAuthError(err);
      setDiagnostic(diag);
      logAuthDiagnosticToConsole(diag);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDiagnostic(null);
    setResetMessage(null);
    setPingResult(null);

    if (!email.trim() || !password) {
      setDiagnostic(
        classifyAuthError("Please enter both your invited email address and password.")
      );
      return;
    }

    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);

    if (result.error) {
      const diag = classifyAuthError(result.rawError || result.error, result.errorCategory);
      setDiagnostic(diag);
      logAuthDiagnosticToConsole(diag);
    } else {
      const dest = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/admin";
      navigate(dest, { replace: true });
    }
  };

  const handleResetPassword = async () => {
    setDiagnostic(null);
    setResetMessage(null);

    const targetEmail = email.trim();
    if (!targetEmail) {
      setDiagnostic(classifyAuthError("Please enter your registered CRM email address first."));
      return;
    }

    setResetLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/admin/login?type=recovery`,
      });
      if (resetErr) {
        const diag = classifyAuthError(resetErr);
        setDiagnostic(diag);
        logAuthDiagnosticToConsole(diag);
      } else {
        setResetMessage(`Password reset instructions sent to ${targetEmail}.`);
      }
    } catch (err: any) {
      const diag = classifyAuthError(err);
      setDiagnostic(diag);
      logAuthDiagnosticToConsole(diag);
    } finally {
      setResetLoading(false);
    }
  };

  const getCategoryStyles = (category: AuthDiagnostic["category"]) => {
    switch (category) {
      case "network_error":
        return {
          containerBg: "bg-red-50/95 border-red-500",
          tagBg: "bg-red-600 text-white",
          tagLabel: "NETWORK ERROR",
          icon: <WifiOff size={20} className="shrink-0 text-red-600 mt-0.5" />,
          titleColor: "text-red-950",
          textColor: "text-red-900",
          hintBg: "bg-red-100/80 border-red-300 text-red-950",
        };
      case "invalid_credentials":
        return {
          containerBg: "bg-amber-50/95 border-amber-500",
          tagBg: "bg-amber-600 text-white",
          tagLabel: "INVALID CREDENTIALS",
          icon: <KeyRound size={20} className="shrink-0 text-amber-600 mt-0.5" />,
          titleColor: "text-amber-950",
          textColor: "text-amber-900",
          hintBg: "bg-amber-100/80 border-amber-300 text-amber-950",
        };
      case "account_deactivated":
      case "unauthorized_role":
        return {
          containerBg: "bg-rose-50/95 border-rose-500",
          tagBg: "bg-rose-600 text-white",
          tagLabel: category === "account_deactivated" ? "ACCOUNT SUSPENDED" : "ACCESS RESTRICTED",
          icon: <ShieldAlert size={20} className="shrink-0 text-rose-600 mt-0.5" />,
          titleColor: "text-rose-950",
          textColor: "text-rose-900",
          hintBg: "bg-rose-100/80 border-rose-300 text-rose-950",
        };
      case "rate_limited":
        return {
          containerBg: "bg-orange-50/95 border-orange-500",
          tagBg: "bg-orange-600 text-white",
          tagLabel: "RATE LIMITED",
          icon: <AlertTriangle size={20} className="shrink-0 text-orange-600 mt-0.5" />,
          titleColor: "text-orange-950",
          textColor: "text-orange-900",
          hintBg: "bg-orange-100/80 border-orange-300 text-orange-950",
        };
      case "email_not_confirmed":
        return {
          containerBg: "bg-blue-50/95 border-blue-500",
          tagBg: "bg-blue-600 text-white",
          tagLabel: "INVITATION PENDING",
          icon: <Mail size={20} className="shrink-0 text-blue-600 mt-0.5" />,
          titleColor: "text-blue-950",
          textColor: "text-blue-900",
          hintBg: "bg-blue-100/80 border-blue-300 text-blue-950",
        };
      default:
        return {
          containerBg: "bg-red-50/95 border-red-500",
          tagBg: "bg-red-600 text-white",
          tagLabel: "AUTH ERROR",
          icon: <AlertTriangle size={20} className="shrink-0 text-red-600 mt-0.5" />,
          titleColor: "text-red-950",
          textColor: "text-red-900",
          hintBg: "bg-red-100/80 border-red-300 text-red-950",
        };
    }
  };

  const categoryStyle = diagnostic ? getCategoryStyles(diagnostic.category) : null;

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

      <header className="relative z-10 w-full max-w-5xl mx-auto flex items-center justify-between py-2">
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
            INVITATION-ONLY CRM PORTAL
          </span>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-[480px] mx-auto my-auto py-8">
        <div className="bg-[#FFFFFF] border-3 sm:border-4 border-[#191936] rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 md:p-10 shadow-[6px_6px_0px_#191936] sm:shadow-[8px_8px_0px_#191936] flex flex-col">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#191936] text-[#D5F542] border-2 border-[#191936] flex items-center justify-center shadow-[3px_3px_0px_#4549D8] mb-4">
              {isInviteFlow ? <UserCheck size={26} /> : <Lock size={26} />}
            </div>

            <span className="font-heading text-xs font-bold text-[#4549D8] tracking-[0.16em] uppercase mb-1">
              THE NATIONAL COLLEGE · BASAVANAGUDI
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#191936] leading-tight">
              {isInviteFlow ? "Complete CRM Invitation" : "Admin & Staff Login"}
            </h1>
            <p className="font-body text-xs sm:text-sm text-[#191936]/75 mt-1.5 leading-relaxed max-w-[350px]">
              {isInviteFlow
                ? "Set a secure password for your invited Supernova 3.0 CRM account to activate your assigned role."
                : "Sign in with your authorized Supernova 3.0 CRM credentials. Access is restricted to invited personnel."}
            </p>
          </div>

          {diagnostic && categoryStyle && (
            <div
              role="alert"
              className={`mb-5 p-4 rounded-2xl border-2 ${categoryStyle.containerBg} transition-all shadow-sm flex flex-col gap-3`}
            >
              <div className="flex items-start gap-3">
                {categoryStyle.icon}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${categoryStyle.tagBg}`}>
                      {categoryStyle.tagLabel}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">{diagnostic.timestamp}</span>
                  </div>
                  <h3 className={`text-sm sm:text-base font-bold ${categoryStyle.titleColor} m-0 leading-snug`}>
                    {diagnostic.title}
                  </h3>
                </div>
              </div>

              <p className={`text-xs sm:text-[13px] ${categoryStyle.textColor} m-0 leading-relaxed`}>
                {diagnostic.message}
              </p>

              <div className={`p-2.5 rounded-xl border text-xs font-medium leading-relaxed ${categoryStyle.hintBg}`}>
                <span className="font-bold block mb-0.5">Recommended Next Step:</span>
                <span>{diagnostic.actionHint}</span>
              </div>

              {diagnostic.category === "network_error" && (
                <div className="pt-1 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="w-full py-2 px-3 rounded-xl bg-white border-2 border-red-400 hover:border-red-600 text-red-900 text-xs font-bold font-heading uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {testingConnection ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-red-600" />
                        <span>Testing Connection to Supabase...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={14} className="text-red-600" />
                        <span>Ping Auth Connection</span>
                      </>
                    )}
                  </button>

                  {pingResult && (
                    <div
                      className={`p-2.5 rounded-xl text-xs font-mono border ${
                        pingResult.ok
                          ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                          : "bg-red-100 text-red-950 border-red-300"
                      }`}
                    >
                      <p className="m-0 leading-snug">{pingResult.message}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-1 border-t border-slate-200/60 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowTechDetails((prev) => !prev)}
                  className="inline-flex items-center justify-between text-[11px] font-mono text-slate-600 hover:text-slate-900 cursor-pointer py-1"
                >
                  <span className="font-bold">
                    {showTechDetails ? "Hide Technical Details" : "Show Technical Details"}
                  </span>
                  {showTechDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showTechDetails && (
                  <div className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-[11px] space-y-1.5 leading-relaxed overflow-x-auto">
                    <div className="flex justify-between items-center pb-1 mb-1 border-b border-slate-800">
                      <span className="text-slate-400">Diagnostic Summary</span>
                      <button
                        type="button"
                        onClick={handleCopyDiagnostic}
                        className="inline-flex items-center gap-1 text-[10px] text-[#D5F542] hover:underline cursor-pointer"
                      >
                        {copiedReport ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedReport ? "Copied" : "Copy Log"}</span>
                      </button>
                    </div>
                    <div>
                      <span className="text-slate-400">Category:</span>{" "}
                      <span className="text-[#D5F542]">{diagnostic.category}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Error Code:</span>{" "}
                      <span>{diagnostic.errorCode || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Endpoint:</span>{" "}
                      <span className="text-slate-300 break-all">{diagnostic.endpoint}</span>
                    </div>
                    {diagnostic.rawDetails && (
                      <div className="pt-1 text-slate-300 border-t border-slate-800 break-words">
                        <code>{diagnostic.rawDetails}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {resetMessage && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-xl bg-green-50 border-2 border-green-500/30 text-green-800 text-xs sm:text-sm font-medium flex items-start gap-2.5 leading-snug"
            >
              <CheckCircle size={18} className="shrink-0 text-green-600 mt-0.5" />
              <span>{resetMessage}</span>
            </div>
          )}

          {!configStatus.isValid && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-900 text-xs sm:text-sm font-medium flex items-start gap-2.5 leading-snug"
            >
              <ShieldAlert size={18} className="shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-bold m-0 text-amber-950">Supabase Configuration Incomplete</p>
                <p className="m-0 mt-0.5 text-xs text-amber-800 leading-relaxed">
                  {configStatus.warning}
                </p>
              </div>
            </div>
          )}

          {isInviteFlow && session ? (
            <form onSubmit={handleAcceptInvitePassword} className="flex flex-col gap-4">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
                Activating invitation for <strong>{session.user.email}</strong>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="invite-password"
                  className="font-heading text-xs sm:text-[13px] font-bold text-[#191936] tracking-wide uppercase"
                >
                  Create Password (Min 8 chars)
                </label>
                <div className="relative flex items-center">
                  <input
                    id="invite-password"
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
                    className="absolute right-3 p-1.5 text-[#191936]/60 hover:text-[#191936] cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="invite-confirm-password"
                  className="font-heading text-xs sm:text-[13px] font-bold text-[#191936] tracking-wide uppercase"
                >
                  Confirm Password
                </label>
                <div className="relative flex items-center">
                  <input
                    id="invite-confirm-password"
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
                <span>{loading ? "Activating Account..." : "Activate CRM Account"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsInviteFlow(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Back to standard login
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="admin-email"
                  className="font-heading text-xs sm:text-[13px] font-bold text-[#191936] tracking-wide uppercase flex items-center justify-between"
                >
                  <span>Email Address</span>
                  <span className="text-[#191936]/40 font-normal lowercase">invited staff only</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@nationalcollege.edu"
                    required
                    autoComplete="email"
                    className="w-full h-[50px] sm:h-[52px] pl-11 pr-4 bg-[#FAF9F4] text-[#191936] placeholder-[#191936]/40 text-sm sm:text-base font-body border-2 border-[#191936] rounded-xl outline-none transition-all focus:bg-white focus:border-[#4549D8] focus:shadow-[2px_2px_0px_#4549D8]"
                  />
                  <Mail size={18} className="absolute left-3.5 text-[#191936]/50 pointer-events-none" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="admin-password"
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
                    {resetLoading ? "Dispatching link..." : "Forgot password?"}
                  </button>
                </div>

                <div className="relative flex items-center">
                  <input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full h-[50px] sm:h-[52px] pl-11 pr-11 bg-[#FAF9F4] text-[#191936] placeholder-[#191936]/40 text-sm sm:text-base font-body border-2 border-[#191936] rounded-xl outline-none transition-all focus:bg-white focus:border-[#4549D8] focus:shadow-[2px_2px_0px_#4549D8]"
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
                className="mt-3 w-full h-[52px] rounded-full bg-[#D5F542] text-[#191936] font-heading font-bold text-sm sm:text-base uppercase tracking-wider border-2 border-[#191936] shadow-[3px_3px_0px_#191936] hover:bg-[#E2FF4A] hover:shadow-[4px_4px_0px_#191936] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[1px_1px_0px_#191936] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-[#191936]" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <span>Sign In to Operations</span>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t-2 border-[#191936]/10 flex flex-col gap-1.5">
            <span className="font-heading text-[11px] font-bold text-[#191936]/70 uppercase tracking-wider">
              Invitation-Only Role-Based Access Control
            </span>
            <p className="font-body text-xs text-[#191936]/60 leading-relaxed">
              Public self-signup is disabled. CRM access is provisioned strictly via Super Admin invitations with assigned operational permissions.
            </p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 w-full max-w-5xl mx-auto text-center py-2 text-xs font-body text-[#191936]/60">
        Supernova 3.0 · 20–21 November 2026 · The National Education Society of Karnataka
      </footer>
    </div>
  );
}
