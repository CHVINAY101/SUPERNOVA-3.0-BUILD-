import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { isMisconfigured } from "@/lib/supabase";
import { ShieldAlert, ServerOff, LogOut } from "lucide-react";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, isAdmin, signOut } = useAuth();
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
            The application cannot connect to the backend database because <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> are missing or placeholder values in your environment configuration.
          </p>
          <div style={{ background: "rgba(0,0,0,0.04)", padding: "14px 18px", borderRadius: "8px", fontSize: "0.82rem", textAlign: "left", marginBottom: "var(--space-6)", fontFamily: "monospace", color: "var(--ink)" }}>
            1. Copy <code>.env.example</code> to <code>.env</code><br />
            2. Provide your real Supabase project URL and Anon key<br />
            3. Or set <code>VITE_USE_MOCK=true</code> to test in local demo mode
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
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "var(--paper)" }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "var(--paper)", padding: "var(--space-8)" }}>
        <div className="card" style={{ maxWidth: 460, textAlign: "center", padding: "var(--space-8)" }}>
          <div style={{ display: "inline-flex", padding: 14, borderRadius: "50%", background: "rgba(240, 120, 85, 0.12)", marginBottom: "var(--space-4)", color: "var(--coral)" }}>
            <ShieldAlert size={36} />
          </div>
          <h2 style={{ marginBottom: "var(--space-2)", fontSize: "1.35rem", color: "var(--text-primary)" }}>Admin Role Required</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "var(--space-4)" }}>
            Authenticated with Supabase as <strong>{session.user.email}</strong>.
          </p>
          <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: "var(--space-4)", color: "#b91c1c", fontSize: "0.88rem", fontWeight: 600 }}>
            No authorized operational role assigned in <code>user_roles</code>.
          </div>
          <div style={{ background: "rgba(0,0,0,0.04)", borderRadius: 8, padding: "12px 14px", textAlign: "left", fontSize: "0.78rem", marginBottom: "var(--space-6)", color: "var(--text-primary)", fontFamily: "monospace", overflowX: "auto" }}>
            <span style={{ color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Run this in Supabase SQL Editor to grant Super Admin:</span>
            <code>INSERT INTO public.user_roles (user_id, role) VALUES ('{session.user.id}', 'super_admin');</code>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <button
              onClick={() => signOut()}
              className="btn btn-secondary"
              style={{ width: "100%", justifyContent: "center", gap: 8 }}
            >
              <LogOut size={16} /> Sign Out
            </button>
            <Link to="/admin/login" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
