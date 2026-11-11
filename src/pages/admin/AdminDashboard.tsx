import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { LiveRegistrationCounters } from "@/components/admin/LiveRegistrationCounters";
import { isRegistrationArchived } from "@/lib/registrationOperations";
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
  RefreshCw,
  AlertTriangle
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
        supabase.from("participation_registrations").select("id, status, admin_notes"),
        supabase.from("registrations").select("id, status, admin_notes"),
        supabase.from("visitor_registrations").select("id, status, admin_notes, check_in_status"),
        supabase.from("check_ins").select("id"),
        supabase.from("matches").select("*").eq("status", "live"),
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("registration_controls").select("*").order("form_type"),
      ]);

      const parts = (partsRes.data || []).filter((p: any) => !isRegistrationArchived(p));
      const esports = (esportsRes.data || []).filter((e: any) => !isRegistrationArchived(e));
      const visitors = (visRes.data || []).filter((v: any) => !isRegistrationArchived(v));
      const checkins = checkinsRes.data || [];
      const matches = matchesRes.data || [];
      const logs = logsRes.data || [];
      const regControls = controlsRes.data || [];

      // Pending reviews count across all active registrations
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
    const interval = setInterval(fetchDashboardData, 30000);
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
    <div className="space-y-6">
      {/* Top Welcome & Event Day Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Operations Center
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1.5 mb-1">
            Event Day Command Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Realtime overview of gate check-ins, registrations, esports stages, and staff activities.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />
          <button
            type="button"
            onClick={fetchDashboardData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* 1. LIVE REGISTRATION STATISTICS (5 Compact Cards) */}
      <LiveRegistrationCounters />

      {/* 2. THREE COMPACT OPERATIONAL SHORTCUTS */}
      <div>
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-3">
          Operational Shortcuts
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Shortcut 1: Check-in Desk */}
          <Link
            to="/admin/checkin"
            className="group p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-emerald-500 shadow-2xs hover:shadow-md transition-all no-underline flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <UserCheck size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors m-0">
                  Open Check-in Desk
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 m-0">
                  Gate search & pass verification
                </p>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
          </Link>

          {/* Shortcut 2: Esports Control */}
          <Link
            to="/admin/esports-control"
            className="group p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-purple-500 shadow-2xs hover:shadow-md transition-all no-underline flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Gamepad2 size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-purple-700 transition-colors m-0">
                  Esports Control
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 m-0">
                  Match staging, scores & board
                </p>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-purple-600 transition-colors shrink-0" />
          </Link>

          {/* Shortcut 3: Post Announcement */}
          <Link
            to="/admin/announcements"
            className="group p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-blue-500 shadow-2xs hover:shadow-md transition-all no-underline flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Bell size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors m-0">
                  Post an Announcement
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 m-0">
                  Broadcast alert to portal
                </p>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
          </Link>
        </div>
      </div>

      {/* 3. BALANCED GRID: Check-ins, Waiting for Review, Live Matches */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Today's Check-in Numbers */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                Today's Check-in Numbers
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <UserCheck size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-display font-black text-emerald-700 leading-none">
                {todayCheckins.checkedIn}
              </span>
              <span className="text-xs font-semibold text-slate-500 font-mono">
                / {todayCheckins.total} Expected
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
            Verified physical arrivals at entrance desk
          </p>
        </div>

        {/* Counts Waiting for Review */}
        <div className={`bg-white border rounded-2xl p-5 shadow-2xs flex flex-col justify-between ${
          pendingReviewCount > 0 ? "border-amber-300" : "border-slate-200/90"
        }`}>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                Waiting for Review
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <Clock size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-display font-black leading-none ${
                pendingReviewCount > 0 ? "text-amber-600" : "text-emerald-700"
              }`}>
                {pendingReviewCount}
              </span>
              <span className="text-xs font-semibold text-slate-500 font-mono">
                Submissions Pending
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <Link
              to="/admin/esports-registrations"
              className="text-xs font-bold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 no-underline"
            >
              <span>Review Submissions</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Matches Live Now */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                Matches Live Now
              </span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                <Play size={14} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-display font-black text-purple-700 leading-none">
                {liveMatches.length}
              </span>
              <span className="text-xs font-semibold text-slate-500 font-mono">
                Active Tournament Stages
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <Link
              to="/admin/esports-control"
              className="text-xs font-bold text-purple-700 hover:text-purple-800 inline-flex items-center gap-1 no-underline"
            >
              <span>Open Esports Stage Control</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* 4. REGISTRATION SWITCHES (OPEN / CLOSED WITH CONFIRMATION) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-blue-700" />
              <h2 className="text-base font-bold text-slate-900 m-0">
                Registration Switches
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Instantly open or close submission portals for each registration track.
            </p>
          </div>
          <Link
            to="/admin/registration-controls"
            className="text-xs font-bold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 no-underline shrink-0"
          >
            <span>Advanced Schedule Settings</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {controls.map((ctrl) => {
            const isToggling = togglingType === ctrl.form_type;

            return (
              <div
                key={ctrl.form_type}
                className={`p-4 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                  ctrl.is_open
                    ? "bg-emerald-50/40 border-emerald-200"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        ctrl.is_open ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                      }`}
                    />
                    <h3 className="text-xs font-bold text-slate-900 m-0">
                      {formLabels[ctrl.form_type] || ctrl.form_type}
                    </h3>
                  </div>
                  <span
                    className={`inline-block text-[10px] font-mono font-bold mt-1 uppercase ${
                      ctrl.is_open ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {ctrl.is_open ? "OPEN TO PUBLIC" : "CLOSED TO PUBLIC"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleClick(ctrl)}
                  disabled={isToggling}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    ctrl.is_open
                      ? "bg-white border-rose-200 text-rose-700 hover:bg-rose-50"
                      : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                  }`}
                >
                  {isToggling ? "Updating..." : ctrl.is_open ? "Close" : "Open"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. RECENT STAFF ACTIVITY LOG */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-blue-700" />
            <h2 className="text-base font-bold text-slate-900 m-0">
              Recent Staff Activity Log
            </h2>
          </div>
          <Link
            to="/admin/audit-logs"
            className="text-xs font-bold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 no-underline"
          >
            <span>Full Audit History</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        {recentLogs.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">
            No recent activity recorded yet. Staff actions and status changes will be tracked here.
          </p>
        ) : (
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100/70 text-blue-800 shrink-0">
                    {log.action}
                  </span>
                  <span className="font-semibold text-slate-800 truncate">
                    {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)})` : ""}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Safe Confirmation Modal for Closing a Portal */}
      {confirmCloseTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setConfirmCloseTarget(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 text-rose-600 mb-2">
              <AlertTriangle size={18} />
              <h3 className="text-base font-bold text-slate-900 m-0">
                Close {formLabels[confirmCloseTarget.form_type]}?
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed my-3">
              Closing this portal will immediately prevent the public from submitting new registrations. You can reopen it at any time.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmCloseTarget(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeToggle(confirmCloseTarget, false)}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
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
