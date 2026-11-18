import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { getRoleLabel, normalizeRole } from "@/lib/rbac";
import AdminCheckin from "@/pages/admin/AdminCheckin";
import { QrCode, LogOut, Shield } from "lucide-react";

export default function GatePortal() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const canonicalRole = normalizeRole(role);
  const canReturnToCrmAdmin = canonicalRole === "super_admin" || canonicalRole === "crm_admin";

  const handleSignOut = async () => {
    await signOut();
    navigate("/gate/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Standalone Gate Top Bar (No CRM Admin Sidebar) */}
      <header className="sticky top-0 z-30 bg-[#0B1120] text-white border-b border-slate-800 px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#D5F542] text-[#0B1120] flex items-center justify-center shrink-0">
            <QrCode size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#D5F542] leading-none">
              SUPERNOVA 3.0
            </div>
            <div className="text-sm sm:text-base font-display font-black tracking-tight text-white truncate">
              Gate &amp; Entry Verification
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden md:flex flex-col items-end leading-tight">
            <span className="text-xs font-mono text-slate-200 truncate max-w-[200px]">
              {user?.email || "Gate Operator"}
            </span>
            <span className="text-[10px] font-mono font-bold uppercase text-cyan-300">
              {getRoleLabel(role)}
            </span>
          </div>

          <span className="md:hidden px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono font-bold uppercase text-cyan-300">
            {getRoleLabel(role)}
          </span>

          {canReturnToCrmAdmin && (
            <Link
              to="/admin"
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white no-underline transition-colors"
            >
              <Shield size={13} className="text-[#D5F542]" />
              <span className="hidden sm:inline">CRM Admin</span>
            </Link>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer transition-colors"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full px-4 sm:px-6 py-5 sm:py-6">
        <AdminCheckin portalMode="gate" />
      </main>
    </div>
  );
}
