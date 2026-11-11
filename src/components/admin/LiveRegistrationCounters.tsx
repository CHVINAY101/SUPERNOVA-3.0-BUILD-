import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Users, Gamepad2, Clock, CheckCircle2, Archive } from "lucide-react";
import { isRegistrationArchived } from "@/lib/registrationOperations";

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
      const [visRes, espRes, partRes] = await Promise.all([
        supabase.from("visitor_registrations").select("id, status, admin_notes"),
        supabase.from("registrations").select("id, status, admin_notes"),
        supabase.from("participation_registrations").select("id, status, admin_notes"),
      ]);

      const visitors = (visRes.data || []) as any[];
      const esports = (espRes.data || []) as any[];
      const participation = (partRes.data || []) as any[];

      const activeVisitors = visitors.filter((r) => !isRegistrationArchived(r)).length;
      const activeEsportsTeams = esports.filter((r) => !isRegistrationArchived(r)).length;

      const allActive = [
        ...visitors.filter((r) => !isRegistrationArchived(r)),
        ...esports.filter((r) => !isRegistrationArchived(r)),
        ...participation.filter((r) => !isRegistrationArchived(r)),
      ];

      const pendingTotal = allActive.filter((r) => r.status === "pending").length;
      const confirmedTotal = allActive.filter((r) => r.status === "confirmed").length;
      const archivedTotal =
        visitors.filter((r) => isRegistrationArchived(r)).length +
        esports.filter((r) => isRegistrationArchived(r)).length +
        participation.filter((r) => isRegistrationArchived(r)).length;

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
      .on("postgres_changes", { event: "*", schema: "public", table: "participation_registrations" }, () => {
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
    {
      label: "Active Visitors",
      value: counts.activeVisitors,
      icon: Users,
      badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
      accentDot: "bg-blue-500",
    },
    {
      label: "Active Esports Teams",
      value: counts.activeEsportsTeams,
      icon: Gamepad2,
      badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
      accentDot: "bg-purple-500",
    },
    {
      label: "Pending Confirmations",
      value: counts.pendingTotal,
      icon: Clock,
      badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
      accentDot: "bg-amber-500",
    },
    {
      label: "Confirmed Active",
      value: counts.confirmedTotal,
      icon: CheckCircle2,
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      accentDot: "bg-emerald-500",
    },
    {
      label: "Archived / Deleted",
      value: counts.archivedTotal,
      icon: Archive,
      badgeColor: "bg-slate-100 text-slate-700 border-slate-200",
      accentDot: "bg-slate-400",
    },
  ];

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
          Live Registration Statistics
        </h2>
        <span className="text-[11px] font-mono text-slate-400">
          {loading ? "Syncing..." : "Realtime Active"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 truncate">
                  {c.label}
                </span>
                <div
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${c.badgeColor}`}
                >
                  <Icon size={14} />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 tracking-tight leading-tight">
                  {c.value}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
