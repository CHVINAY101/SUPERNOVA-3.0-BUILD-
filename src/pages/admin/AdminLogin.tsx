import React, { useState } from "react";
import { Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Lock, Mail, ArrowLeft, ShieldAlert, CheckCircle, Loader2 } from "lucide-react";

export default function AdminLogin() {
  const { session, isAdmin, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // If already authenticated and verified as admin, redirect to target or /admin
  if (session && isAdmin) {
    const dest = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/admin";
    return <Navigate to={dest} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetMessage(null);

    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);

    if (mode === "signup") {
      try {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        setLoading(false);

        if (signUpErr) {
          setError(signUpErr.message);
          return;
        }

        if (data.session) {
          navigate("/admin");
        } else {
          setResetMessage(
            "Account created successfully in Supabase Auth! Please check your email inbox if confirmation is required, then have a Super Admin assign your operational role in public.user_roles."
          );
          setMode("signin");
        }
      } catch (err: any) {
        setLoading(false);
        setError(err?.message || "Failed to create account.");
      }
      return;
    }

    const result = await signIn(email.trim(), password);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      navigate("/admin");
    }
  };


  const handleResetPassword = async () => {
    setError(null);
    setResetMessage(null);

    const targetEmail = email.trim();
    if (!targetEmail) {
      setError("Please enter your registered admin email address above first.");
      return;
    }

    setResetLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/admin/login`,
      });
      if (resetErr) {
        setError(resetErr.message);
      } else {
        setResetMessage(`Password reset link dispatched to ${targetEmail}. Please check your inbox.`);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to dispatch password reset email.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF9F4] text-[#191936] flex flex-col justify-between p-4 sm:p-6 md:p-8 relative selection:bg-[#D5F542] selection:text-[#191936]">
      {/* Background Subtle Dot Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "radial-gradient(#191936 1.2px, transparent 1.2px)",
          backgroundSize: "28px 28px",
        }}
        aria-hidden="true"
      />

      {/* Top Navigation Bar */}
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
            SECURE PORTAL
          </span>
        </div>
      </header>

      {/* Main Centered Login Card */}
      <main className="relative z-10 w-full max-w-[460px] mx-auto my-auto py-8">
        <div className="bg-[#FFFFFF] border-3 sm:border-4 border-[#191936] rounded-[24px] sm:rounded-[32px] p-6 sm:p-8 md:p-10 shadow-[6px_6px_0px_#191936] sm:shadow-[8px_8px_0px_#191936] flex flex-col">
          {/* Card Header & Brand Lockup */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#191936] text-[#D5F542] border-2 border-[#191936] flex items-center justify-center shadow-[3px_3px_0px_#4549D8] mb-4">
              <Lock size={26} />
            </div>

            <span className="font-heading text-xs font-bold text-[#4549D8] tracking-[0.16em] uppercase mb-1">
              THE NATIONAL COLLEGE · BASAVANAGUDI
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#191936] leading-tight">
              {mode === "signin" ? "Admin Login" : "Staff Registration"}
            </h1>
            <p className="font-body text-xs sm:text-sm text-[#191936]/75 mt-1.5 leading-relaxed max-w-[340px]">
              {mode === "signin"
                ? "Sign in to manage Supernova 3.0 content, registration approvals, and live event operations."
                : "Create a Supabase Auth identity for operational and administrative access."}
            </p>

            {/* Mode Switcher Tabs */}
            <div className="mt-4 inline-flex p-1 bg-[#FAF9F4] border-2 border-[#191936] rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  mode === "signin"
                    ? "bg-[#191936] text-white shadow-[2px_2px_0px_#4549D8]"
                    : "text-[#191936]/70 hover:text-[#191936]"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  mode === "signup"
                    ? "bg-[#191936] text-white shadow-[2px_2px_0px_#4549D8]"
                    : "text-[#191936]/70 hover:text-[#191936]"
                }`}
              >
                Create Account
              </button>
            </div>
          </div>

          {/* Feedback & Error Messages */}
          {error && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-red-50 border-2 border-red-500/30 text-red-700 text-xs sm:text-sm font-medium flex items-start gap-2.5 leading-snug animate-shake"
            >
              <ShieldAlert size={18} className="shrink-0 text-red-600 mt-0.5" />
              <span>{error}</span>
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

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email Field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-email"
                className="font-heading text-xs sm:text-[13px] font-bold text-[#191936] tracking-wide uppercase flex items-center justify-between"
              >
                <span>Email Address</span>
                <span className="text-[#191936]/40 font-normal lowercase">required</span>
              </label>
              <div className="relative flex items-center">
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@nationalcollege.edu"
                  required
                  autoComplete="email"
                  className="w-full h-[50px] sm:h-[52px] pl-11 pr-4 bg-[#FAF9F4] text-[#191936] placeholder-[#191936]/40 text-sm sm:text-base font-body border-2 border-[#191936] rounded-xl outline-none transition-all focus:bg-white focus:border-[#4549D8] focus:shadow-[2px_2px_0px_#4549D8]"
                />
                <Mail size={18} className="absolute left-3.5 text-[#191936]/50 pointer-events-none" />
              </div>
            </div>

            {/* Password Field with Visibility Toggle */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="admin-password"
                  className="font-heading text-xs sm:text-[13px] font-bold text-[#191936] tracking-wide uppercase"
                >
                  Password
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resetLoading}
                    className="text-[11px] sm:text-xs font-heading font-bold text-[#4549D8] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {resetLoading ? "Dispatching link..." : "Forgot password?"}
                  </button>
                )}
              </div>

              <div className="relative flex items-center">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-3 w-full h-[52px] rounded-full bg-[#D5F542] text-[#191936] font-heading font-bold text-sm sm:text-base uppercase tracking-wider border-2 border-[#191936] shadow-[3px_3px_0px_#191936] hover:bg-[#E2FF4A] hover:shadow-[4px_4px_0px_#191936] hover:-translate-y-0.5 active:translate-y-0 active:shadow-[1px_1px_0px_#191936] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin text-[#191936]" />
                  <span>{mode === "signin" ? "Authenticating..." : "Creating Account..."}</span>
                </>
              ) : (
                <span>{mode === "signin" ? "Sign In to Operations" : "Register Staff Account"}</span>
              )}
            </button>
          </form>

          {/* Role Enforcement Notice */}
          <div className="mt-6 pt-5 border-t-2 border-[#191936]/10 flex flex-col gap-1.5">
            <span className="font-heading text-[11px] font-bold text-[#191936]/70 uppercase tracking-wider">
              Role-Based Access Control
            </span>
            <p className="font-body text-xs text-[#191936]/60 leading-relaxed">
              Login requires an authenticated Supabase identity with an active assignment in <code>user_roles</code> (Super Admin, Event Admin, Check-in Staff, or Score Operator).
            </p>
          </div>
        </div>
      </main>

      {/* Footer Meta */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto text-center py-2 text-xs font-body text-[#191936]/60">
        Supernova 3.0 · 20–21 November 2026 · The National Education Society of Karnataka
      </footer>
    </div>
  );
}
