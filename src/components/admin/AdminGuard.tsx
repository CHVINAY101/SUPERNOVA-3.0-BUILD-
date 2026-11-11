import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { isMisconfigured } from "@/lib/supabase";
import { ShieldAlert, ServerOff, LogOut } from "lucide-react";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, isAdmin, signOut, refreshRole } = useAuth();
  const location = useLocation();

  if (isMisconfigured) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "var(--paper)", padding: "var(--space-8)" }}>
        <div className="card" style={{ maxWidth: 520, textAlign: "center", padding: "var(--space-8)" }}>
          <div style={{ display: "inline-flex", padding: 16, borderRadius: "50%", background: "rgba(239, 68, 68, 0.1)", marginBottom: "var(--space-4)", color: "#ef4444" }}>
            <ServerOff size={40} />
          </div>
          <h2 style={{ marginBottom: "var(--space-2)", fontSize: "1.4rem", color: "var(--text-primary)" }}>Supabase is not configured</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "var(--space-6)" }}>
            The application cannot connect to the backend database because <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> are missing or placeholder values in your environment configuration.
          </p>
          <div style={{ background: "rgba(0,0,0,0.04)", padding: "14px 18px", borderRadius: "8px", fontSize: "0.82rem", textAlign: "left", marginBottom: "var(--space-6)", fontFamily: "monospace", color: "var(--ink)" }}>
            1. Copy <code>.env.example</code> to <code>.env</code><br />
            2. Provide your real Supabase project URL and publishable key<br />
            3. Ensure <code>VITE_USE_MOCK=false</code> is set for production
          </div>
          <Link to="/" className="btn btn-secondary" style={{ width: "100%", justifyContent: "center" }}>
            Return to Public Portal
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#F8FAFC" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500 font-mono">Verifying administrative credentials...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#F8FAFC", padding: 24 }}>
        <div className="card" style={{ maxWidth: 480, textAlign: "center", padding: 32, background: "#ffffff", borderRadius: 24, border: "1.5px solid #E2E8F0", boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "inline-flex", padding: 14, borderRadius: 16, background: "rgba(240, 120, 85, 0.12)", marginBottom: 16, color: "#e11d48" }}>
            <ShieldAlert size={36} />
          </div>
          <h2 style={{ marginBottom: 8, fontSize: "1.35rem", fontWeight: 800, color: "#0f172a" }}>Admin Role Required</h2>
          <p style={{ color: "#64748b", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: 16 }}>
            Authenticated with Supabase as <strong className="text-slate-900">{session.user.email}</strong>.
          </p>
          <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, color: "#b91c1c", fontSize: "0.85rem", fontWeight: 600 }}>
            No authorized operational role assigned in <code>public.user_roles</code>.
          </div>
          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 16px", textAlign: "left", fontSize: "0.78rem", marginBottom: 20, color: "#0f172a", fontFamily: "monospace", overflowX: "auto" }}>
            <span style={{ color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>Run this in Supabase SQL Editor to assign Super Admin:</span>
            <code className="text-blue-700 font-bold select-all">INSERT INTO public.user_roles (user_id, role) VALUES ('{session.user.id}', 'super_admin');</code>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={() => refreshRole()}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              Recheck Permissions
            </button>
            <button
              type="button"
              onClick={async () => {
                await signOut();
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <LogOut size={15} /> Sign Out
            </button>
            <Link to="/admin/login" className="text-xs text-slate-500 hover:text-slate-800 transition-colors">
              Return to Login Form
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
