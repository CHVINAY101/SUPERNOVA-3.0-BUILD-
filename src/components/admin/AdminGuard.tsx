import { Navigate, useLocation, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { isMisconfigured } from "@/lib/supabase";
import { getRoleLabel, ROUTE_PERMISSIONS } from "@/lib/rbac";
import { ShieldAlert, ServerOff, LogOut, Lock, ArrowRight } from "lucide-react";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, isAdmin, role, accountStatus, canAccessRoute, signOut, refreshRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (isMisconfigured) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#FAF9F4] p-6">
        <div className="max-w-lg w-full text-center p-8 bg-white rounded-3xl border-2 border-[#191936] shadow-[6px_6px_0px_#191936]">
          <div className="inline-flex p-4 rounded-full bg-rose-50 text-rose-600 mb-4">
            <ServerOff size={36} />
          </div>
          <h2 className="text-xl font-display font-black text-slate-900 mb-2">Supabase Configuration Missing</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            The application cannot connect to the backend database because{" "}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">VITE_SUPABASE_URL</code> or{" "}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> is missing.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wider no-underline"
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
            Verifying CRM permissions...
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  // If account is invited, send back to /admin/login to complete invitation password setup
  if (accountStatus === "invited") {
    return <Navigate to="/admin/login?type=invite" state={{ from: location }} replace />;
  }

  // Block inactive, deactivated, revoked, or role-less accounts cleanly without exposing SQL
  if (!isAdmin || accountStatus !== "active") {
    const isBlockedStatus = accountStatus === "deactivated" || accountStatus === "revoked";
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#F8FAFC] p-6">
        <div className="max-w-md w-full text-center p-8 bg-white rounded-3xl border border-slate-200 shadow-lg">
          <div className="inline-flex p-3.5 rounded-2xl bg-rose-50 text-rose-600 mb-4 border border-rose-200">
            <ShieldAlert size={34} />
          </div>
          <h2 className="text-xl font-display font-black text-slate-900 mb-2">
            {isBlockedStatus ? "Account Access Suspended" : "CRM Access Required"}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Signed in as <strong className="text-slate-900">{session.user.email}</strong>.
          </p>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 mb-6 text-rose-800 text-xs font-medium leading-relaxed">
            {isBlockedStatus
              ? `Your CRM access status is currently "${accountStatus}". Please contact a Super Admin if you believe this is an error.`
              : "Your account does not currently have an active CRM role or invitation assigned. Access to operational dashboards is restricted to invited Supernova 3.0 staff."}
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
            <Link to="/" className="text-xs text-slate-500 hover:text-slate-800 mt-1 no-underline">
              Return to Festival Website
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Enforce route-level RBAC permission check
  if (!canAccessRoute(location.pathname)) {
    const firstAllowedRoute =
      ROUTE_PERMISSIONS.find((r) => !r.exact && canAccessRoute(r.prefix))?.prefix || "/admin";

    return (
      <div className="flex justify-center items-center min-h-screen bg-[#F8FAFC] p-6">
        <div className="max-w-md w-full text-center p-8 bg-white rounded-3xl border border-slate-200 shadow-lg">
          <div className="inline-flex p-3.5 rounded-2xl bg-amber-50 text-amber-600 mb-4 border border-amber-200">
            <Lock size={32} />
          </div>
          <div className="mb-3">
            <span className="inline-block px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[11px] font-bold uppercase">
              Role: {getRoleLabel(role)}
            </span>
          </div>
          <h2 className="text-xl font-display font-black text-slate-900 mb-2">Access Denied</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            Your current CRM role and permission profile do not include access to{" "}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono">{location.pathname}</code>.
            Contact a Super Admin if you require elevated access.
          </p>
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => navigate(firstAllowedRoute, { replace: true })}
              className="w-full py-2.5 px-4 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white font-semibold text-xs transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <span>Go to Permitted Workspace</span>
              <ArrowRight size={14} />
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

  return <>{children}</>;
}
