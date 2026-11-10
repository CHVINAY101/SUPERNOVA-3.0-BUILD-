import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Gamepad2, Clock, CheckCircle2, Archive } from "lucide-react";

interface LiveCounts {
  activeVisitors: number;
  activeEsportsTeams: number;
  pendingTotal: number;
  confirmedTotal: number;
  archivedTotal: number;
}

export function LiveRegistrationCounters() {
  const [counts, setCounts] = useState<LiveCounts>({
    activeVisitors: 0,
    activeEsportsTeams: 0,
    pendingTotal: 0,
    confirmedTotal: 0,
    archivedTotal: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    try {
      const [visRes, espRes] = await Promise.all([
        supabase.from("visitor_registrations").select("status, archived_at"),
        supabase.from("registrations").select("status, archived_at"),
      ]);

      const visitors = visRes.data || [];
      const esports = espRes.data || [];

      const activeVisitors = visitors.filter((r) => !r.archived_at).length;
      const activeEsportsTeams = esports.filter((r) => !r.archived_at).length;

      const allActive = [...visitors.filter((r) => !r.archived_at), ...esports.filter((r) => !r.archived_at)];
      const pendingTotal = allActive.filter((r) => r.status === "pending").length;
      const confirmedTotal = allActive.filter((r) => r.status === "confirmed").length;
      const archivedTotal =
        visitors.filter((r) => Boolean(r.archived_at)).length +
        esports.filter((r) => Boolean(r.archived_at)).length;

      setCounts({
        activeVisitors,
        activeEsportsTeams,
        pendingTotal,
        confirmedTotal,
        archivedTotal,
      });
    } catch {
      // Keep last known counts on transient error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();

    const channel = supabase
      .channel("admin-live-registration-counters")
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_registrations" }, () => {
        fetchCounts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, () => {
        fetchCounts();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          fetchCounts();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCounts]);

  const cards = [
    { label: "Active Visitors", value: counts.activeVisitors, icon: Users, color: "#00D2FF" },
    { label: "Active Esports Teams", value: counts.activeEsportsTeams, icon: Gamepad2, color: "#A855F7" },
    { label: "Pending Confirmation", value: counts.pendingTotal, icon: Clock, color: "#F59E0B" },
    { label: "Confirmed Active", value: counts.confirmedTotal, icon: CheckCircle2, color: "#10B981" },
    { label: "Archived / Deleted", value: counts.archivedTotal, icon: Archive, color: "#94A3B8" },
  ];

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Live Registration Statistics
        </h2>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {loading ? "Syncing..." : "Realtime Active"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              style={{
                background: "var(--navy-800)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `${c.color}20`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: c.color,
                  flexShrink: 0,
                }}
              >
                <Icon size={18} />
              </div>
              <div>
                <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>
                  {c.value}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{c.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
