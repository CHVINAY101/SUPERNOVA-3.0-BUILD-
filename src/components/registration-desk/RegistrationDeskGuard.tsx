import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { isMisconfigured } from "@/lib/supabase";
import { canAccessRegistrationDesk } from "@/lib/registrationDesk";
import { isGateOnlyRole } from "@/lib/gatePortal";
import { getRoleLabel } from "@/lib/rbac";
import { ShieldAlert, ServerOff, LogOut, Lock, ArrowRight } from "lucide-react";

export function RegistrationDeskGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, role, accountStatus, signOut, refreshRole } = useAuth();
  const location = useLocation();

  if (isMisconfigured) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#F8FAFC] p-6">
        <div className="max-w-lg w-full text-center p-8 bg-white rounded-2xl border border-slate-200">
          <div className="inline-flex p-4 rounded-xl bg-rose-50 text-rose-600 mb-4">
            <ServerOff size={32} />
          </div>
          <h2 className="text-xl font-display font-bold text-slate-900 mb-2">
            Supabase Configuration Missing
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            The Registration Desk Portal cannot connect because{" "}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">VITE_SUPABASE_URL</code> or{" "}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">VITE_SUPABASE_PUBLISHABLE_KEY</code>{" "}
            is missing or invalid.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-slate-900 text-white text-xs font-semibold no-underline"
          >
            Return to Public Portal
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500 font-mono">
            Verifying registration desk session...
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/registration-desk/login" state={{ from: location }} replace />;
  }

  if (accountStatus === "invited") {
    return (
      <Navigate to="/registration-desk/login?type=invite" state={{ from: location }} replace />
    );
  }

  if (accountStatus !== "active") {
    const isBlockedStatus = accountStatus === "deactivated" || accountStatus === "revoked";
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#F8FAFC] p-6">
        <div className="max-w-md w-full text-center p-8 bg-white rounded-2xl border border-slate-200">
          <div className="inline-flex p-3.5 rounded-xl bg-rose-50 text-rose-600 mb-4 border border-rose-200">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-display font-bold text-slate-900 mb-2">
            {isBlockedStatus ? "Registration Desk Access Suspended" : "Account Inactive"}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Signed in as <strong className="text-slate-900">{session.user.email}</strong>.
          </p>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 mb-6 text-rose-800 text-xs font-medium leading-relaxed">
            {isBlockedStatus
              ? `Your staff account status is "${accountStatus}". Please contact a Super Admin to restore access.`
              : "Your account does not currently hold an active Registration Desk role."}
          </div>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => refreshRole()}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Recheck Access Status
            </button>
            <button
              type="button"
              onClick={async () => {
                await signOut();
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isGateOnlyRole(role)) {
    return <Navigate to="/gate" replace />;
  }

  if (!canAccessRegistrationDesk(role, accountStatus)) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#F8FAFC] p-6">
        <div className="max-w-md w-full text-center p-8 bg-white rounded-2xl border border-slate-200">
          <div className="inline-flex p-3.5 rounded-xl bg-amber-50 text-amber-600 mb-4 border border-amber-200">
            <Lock size={30} />
          </div>
          <p className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Role: {getRoleLabel(role)}
          </p>
          <h2 className="text-xl font-display font-bold text-slate-900 mb-2">
            Registration Desk Access Restricted
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            The Registration Desk Portal is restricted to <strong>Registration Desk Clerk</strong>,{" "}
            <strong>CRM Admin</strong>, and <strong>Super Admin</strong> accounts.
          </p>
          <div className="flex flex-col gap-2.5">
            <Link
              to="/admin"
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors inline-flex items-center justify-center gap-2 no-underline"
            >
              <span>Open Permitted Workspace</span>
              <ArrowRight size={14} />
            </Link>
            <button
              type="button"
              onClick={async () => {
                await signOut();
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <LogOut size={14} /> Sign Out &amp; Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
