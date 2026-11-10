import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import type { RegistrationControl, AuditLog, Match } from "@/types/database";
import { 
  Gamepad2, 
  UserCheck, 
  Bell, 
  ArrowRight,
  SlidersHorizontal,
  Clock,
  Play,
  Activity,
  RefreshCw
} from "lucide-react";

export default function AdminDashboard() {
  const [controls, setControls] = useState<RegistrationControl[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [todayCheckins, setTodayCheckins] = useState({ checkedIn: 0, total: 0 });
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);

  // Toggle state
  const [togglingType, setTogglingType] = useState<string | null>(null);
  const [confirmCloseTarget, setConfirmCloseTarget] = useState<RegistrationControl | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [partsRes, esportsRes, visRes, checkinsRes, matchesRes, logsRes, controlsRes] = await Promise.all([
        supabase.from("participation_registrations").select("status"),
        supabase.from("registrations").select("status"),
        supabase.from("visitor_registrations").select("status, check_in_status"),
        supabase.from("check_ins").select("id"),
        supabase.from("matches").select("*").eq("status", "live"),
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("registration_controls").select("*").order("form_type"),
      ]);

      const parts = partsRes.data || [];
      const esports = esportsRes.data || [];
      const visitors = visRes.data || [];
      const checkins = checkinsRes.data || [];
      const matches = matchesRes.data || [];
      const logs = logsRes.data || [];
      const regControls = controlsRes.data || [];

      // Pending reviews count
      const pendingParts = parts.filter((p: any) => p.status === "pending").length;
      const pendingEsports = esports.filter((e: any) => e.status === "pending").length;
      const pendingVisitors = visitors.filter((v: any) => v.status === "pending").length;
      setPendingReviewCount(pendingParts + pendingEsports + pendingVisitors);

      // Today's check-ins
      const totalAttendeesExpected = parts.length + esports.length * 5 + visitors.length;
      setTodayCheckins({
        checkedIn: checkins.length,
        total: Math.max(totalAttendeesExpected, 50),
      });

      // Matches live
      setLiveMatches(matches as Match[]);

      // Recent 5 activities
      setRecentLogs(logs as AuditLog[]);

      // Registration controls
      if (regControls.length > 0) {
        setControls(regControls as RegistrationControl[]);
      }
    } catch (err) {
      console.warn("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Multi-table Realtime Subscription for Admin Command Center
  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "registrations", onRefresh: fetchDashboardData },
      { table: "visitor_registrations", onRefresh: fetchDashboardData },
      { table: "participation_registrations", onRefresh: fetchDashboardData },
      { table: "check_ins", onRefresh: fetchDashboardData },
      { table: "matches", onRefresh: fetchDashboardData },
      { table: "audit_logs", onRefresh: fetchDashboardData },
      { table: "registration_controls", onRefresh: fetchDashboardData },
    ],
    "admin-dashboard"
  );

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 25000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const handleToggleClick = (ctrl: RegistrationControl) => {
    if (ctrl.is_open) {
      setConfirmCloseTarget(ctrl);
    } else {
      executeToggle(ctrl, true);
    }
  };

  const executeToggle = async (ctrl: RegistrationControl, newIsOpen: boolean) => {
    setTogglingType(ctrl.form_type);
    try {
      await supabase
        .from("registration_controls")
        .update({
          is_open: newIsOpen,
          updated_at: new Date().toISOString(),
        })
        .eq("form_type", ctrl.form_type);

      setControls((prev) =>
        prev.map((c) => (c.form_type === ctrl.form_type ? { ...c, is_open: newIsOpen } : c))
      );
    } catch (err) {
      console.warn("Toggle failed:", err);
    } finally {
      setTogglingType(null);
      setConfirmCloseTarget(null);
    }
  };

  const formLabels: Record<string, string> = {
    participation: "Project Exhibits",
    esports: "Esports Squads",
    visitor: "Visitor Passes",
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Top Welcome & Event Day Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
        <div>
          <span style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--cyan-400)" }}>
            Supernova 3.0 Operations
          </span>
          <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)", marginTop: 4, margin: 0 }}>
            Event Day Command Center
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginTop: 6 }}>
            Quick overview of registrations, gate arrivals, esports stages, and staff activities.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} variant="dark" />
          <button
            onClick={fetchDashboardData}
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh Data
          </button>
        </div>
      </div>

      {/* THREE BIG SHORTCUT BUTTONS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 32 }}>
        <Link
          to="/admin/checkin"
          style={{
            background: "linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%)",
            border: "2px solid #10b981",
            borderRadius: 16,
            padding: "22px 24px",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 6px 20px rgba(16, 185, 129, 0.15)",
            transition: "transform 0.18s ease",
          }}
          className="card-hover"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "#10b981", color: "#ffffff", display: "grid", placeItems: "center" }}>
              <UserCheck size={26} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                Open Check-in Desk
              </h3>
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", margin: "4px 0 0" }}>
                Gate attendee search & pass verification
              </p>
            </div>
          </div>
          <ArrowRight size={20} color="#10b981" />
        </Link>

        <Link
          to="/admin/esports-control"
          style={{
            background: "linear-gradient(135deg, rgba(240, 120, 85, 0.2) 0%, rgba(240, 120, 85, 0.05) 100%)",
            border: "2px solid var(--coral, #f07855)",
            borderRadius: 16,
            padding: "22px 24px",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 6px 20px rgba(240, 120, 85, 0.15)",
            transition: "transform 0.18s ease",
          }}
          className="card-hover"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--coral, #f07855)", color: "#ffffff", display: "grid", placeItems: "center" }}>
              <Gamepad2 size={26} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                Esports Control
              </h3>
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", margin: "4px 0 0" }}>
                Match staging, live scores & board
              </p>
            </div>
          </div>
          <ArrowRight size={20} color="var(--coral, #f07855)" />
        </Link>

        <Link
          to="/admin/announcements"
          style={{
            background: "linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(56, 189, 248, 0.05) 100%)",
            border: "2px solid var(--cyan-400, #38bdf8)",
            borderRadius: 16,
            padding: "22px 24px",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 6px 20px rgba(56, 189, 248, 0.15)",
            transition: "transform 0.18s ease",
          }}
          className="card-hover"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--cyan-400, #38bdf8)", color: "#000000", display: "grid", placeItems: "center" }}>
              <Bell size={26} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                Post an Announcement
              </h3>
              <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.75)", margin: "4px 0 0" }}>
                Broadcast alert to public website
              </p>
            </div>
          </div>
          <ArrowRight size={20} color="var(--cyan-400, #38bdf8)" />
        </Link>
      </div>

      {/* METRIC CARDS ROW: Check-ins, Waiting for Review, Live Matches */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, marginBottom: 32 }}>
        {/* Today's Check-in Numbers */}
        <div
          style={{
            background: "rgba(23, 23, 27, 0.75)",
            border: "1.5px solid var(--border-subtle)",
            borderRadius: 14,
            padding: "20px 22px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)" }}>Today's Check-in Numbers</span>
            <UserCheck size={18} color="#10b981" />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: "2.2rem", fontWeight: 900, color: "#10b981", lineHeight: 1 }}>
              {todayCheckins.checkedIn}
            </span>
            <span style={{ fontSize: "0.95rem", color: "var(--text-muted)" }}>
              / {todayCheckins.total} Expected
            </span>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 8 }}>
            Verified arrivals at entrance desk
          </p>
        </div>

        {/* Counts Waiting for Review */}
        <div
          style={{
            background: "rgba(23, 23, 27, 0.75)",
            border: `1.5px solid ${pendingReviewCount > 0 ? "rgba(245, 158, 11, 0.4)" : "var(--border-subtle)"}`,
            borderRadius: 14,
            padding: "20px 22px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)" }}>Waiting for Review</span>
            <Clock size={18} color="#f59e0b" />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: "2.2rem", fontWeight: 900, color: pendingReviewCount > 0 ? "#f59e0b" : "#10b981", lineHeight: 1 }}>
              {pendingReviewCount}
            </span>
            <span style={{ fontSize: "0.95rem", color: "var(--text-muted)" }}>Pending Submissions</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Link to="/admin/participation-registrations" style={{ fontSize: "0.78rem", color: "var(--cyan-400)", fontWeight: 700, textDecoration: "none" }}>
              Review Submissions →
            </Link>
          </div>
        </div>

        {/* Matches Live Now */}
        <div
          style={{
            background: "rgba(23, 23, 27, 0.75)",
            border: `1.5px solid ${liveMatches.length > 0 ? "var(--coral)" : "var(--border-subtle)"}`,
            borderRadius: 14,
            padding: "20px 22px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)" }}>Matches Live Now</span>
            <Play size={18} color="var(--coral)" />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: "2.2rem", fontWeight: 900, color: liveMatches.length > 0 ? "var(--coral)" : "#ffffff", lineHeight: 1 }}>
              {liveMatches.length}
            </span>
            <span style={{ fontSize: "0.95rem", color: "var(--text-muted)" }}>Active Stages</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Link to="/admin/esports-control" style={{ fontSize: "0.78rem", color: "var(--coral)", fontWeight: 700, textDecoration: "none" }}>
              Open Esports Stage Control →
            </Link>
          </div>
        </div>
      </div>

      {/* REGISTRATION SWITCHES (OPEN / CLOSED) */}
      <div
        style={{
          background: "rgba(23, 23, 27, 0.75)",
          border: "1.5px solid var(--border-subtle)",
          borderRadius: 16,
          padding: "24px 28px",
          marginBottom: 32,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <SlidersHorizontal size={18} color="var(--cyan-400)" />
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                Registration Switches
              </h2>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 4 }}>
              Instantly open or close submission portals for each registration type.
            </p>
          </div>
          <Link to="/admin/registration-controls" style={{ fontSize: "0.82rem", color: "var(--cyan-400)", fontWeight: 700, textDecoration: "none" }}>
            Advanced Schedule Settings →
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {controls.map((ctrl) => {
            const isToggling = togglingType === ctrl.form_type;

            return (
              <div
                key={ctrl.form_type}
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: `1.5px solid ${ctrl.is_open ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                  borderRadius: 12,
                  padding: "16px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: ctrl.is_open ? "#10b981" : "#ef4444",
                      }}
                    />
                    <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                      {formLabels[ctrl.form_type] || ctrl.form_type}
                    </h3>
                  </div>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "0.74rem",
                      fontWeight: 800,
                      marginTop: 4,
                      color: ctrl.is_open ? "#10b981" : "#f87171",
                    }}
                  >
                    {ctrl.is_open ? "OPEN FOR SUBMISSIONS" : "CLOSED TO PUBLIC"}
                  </span>
                </div>

                <button
                  onClick={() => handleToggleClick(ctrl)}
                  disabled={isToggling}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 9999,
                    fontSize: "0.82rem",
                    fontWeight: 800,
                    cursor: "pointer",
                    border: 0,
                    background: ctrl.is_open ? "rgba(239, 68, 68, 0.15)" : "#10b981",
                    color: ctrl.is_open ? "#f87171" : "#ffffff",
                    transition: "all 0.15s ease",
                  }}
                >
                  {isToggling ? "Updating..." : ctrl.is_open ? "Close Portal" : "Open Portal"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* LAST 5 ADMIN ACTIVITIES */}
      <div
        style={{
          background: "rgba(23, 23, 27, 0.75)",
          border: "1.5px solid var(--border-subtle)",
          borderRadius: 16,
          padding: "24px 28px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={18} color="var(--cyan-400)" />
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              Recent Staff Activity Log
            </h2>
          </div>
          <Link to="/admin/audit-logs" style={{ fontSize: "0.82rem", color: "var(--cyan-400)", fontWeight: 700, textDecoration: "none" }}>
            View Full Audit History →
          </Link>
        </div>

        {recentLogs.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
            No recent activity recorded yet. Changes made by staff will be tracked here.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {recentLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.25)",
                  fontSize: "0.85rem",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "rgba(34, 211, 238, 0.15)",
                      color: "var(--cyan-400)",
                    }}
                  >
                    {log.action}
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {log.entity_type} ({log.entity_id || "record"})
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  By {log.actor_id || "staff"} · {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close Confirmation Modal */}
      {confirmCloseTarget && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setConfirmCloseTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--navy-900)",
              border: "1.5px solid var(--border-subtle)",
              borderRadius: 16,
              padding: 28,
              maxWidth: 440,
              width: "100%",
            }}
          >
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#f87171", margin: 0 }}>
              Close {formLabels[confirmCloseTarget.form_type]}?
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5, margin: "12px 0 20px" }}>
              Closing this portal will immediately block public submissions on the website. You can reopen it at any time.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmCloseTarget(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => executeToggle(confirmCloseTarget, false)}
                className="btn btn-ghost"
                style={{ color: "#ef4444", borderColor: "#ef4444", fontWeight: 700 }}
              >
                Yes, Close Portal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
