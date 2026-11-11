import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { getOfficialTeamSize } from "@/utils/esportsRules";
import {
  archiveRegistrationRecord,
  restoreRegistrationRecord,
  isRegistrationArchived,
  markRegistrationArchivedLocal,
} from "@/lib/registrationOperations";
import { AdminArchiveConfirmModal } from "@/components/admin/AdminArchiveConfirmModal";
import { AdminStatusBadge } from "@/components/admin/AdminBadge";
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Download,
  X,
  ShieldAlert,
  RefreshCw,
  Archive,
  RotateCcw,
  Eye,
  Trash2,
  Check,
  Ban,
  Clock,
  Phone,
  Mail,
  Monitor,
  Smartphone,
} from "lucide-react";

export interface EsportsRegistrationItem {
  id: string;
  registration_ref: string;
  team_name: string;
  captain_name: string;
  email: string;
  phone: string;
  institution: string | null;
  status: string;
  admin_notes?: string | null;
  submitted_at: string;
  archived_at?: string | null;
  games: {
    id: string;
    title: string;
    team_size: number | null;
  } | null;
  players: {
    id: string;
    player_name: string;
    gamer_tag: string | null;
  }[];
}

export interface ProcessedEsportsRegistration extends EsportsRegistrationItem {
  gameTitle: string;
  registeredCount: number;
  expectedCount: number;
  isRosterValid: boolean;
  isFlagged: boolean;
  rosterSpecText: string;
  isArchived: boolean;
}

const REGISTRATION_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "correction_requested", label: "Correction Requested" },
  { value: "declined", label: "Declined" },
];

export default function AdminEsportsRegistrations() {
  const [registrations, setRegistrations] = useState<EsportsRegistrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [rosterHealthFilter, setRosterHealthFilter] = useState<"all" | "valid" | "flagged">("all");
  const [viewScope, setViewScope] = useState<"active" | "archived" | "all">("active");

  // Selected for Drawer
  const [selectedReg, setSelectedReg] = useState<ProcessedEsportsRegistration | null>(null);

  // Archive Target for Safe Modal
  const [archiveTarget, setArchiveTarget] = useState<ProcessedEsportsRegistration | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  // Operation state
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("registrations")
        .select(`
          id,
          registration_ref,
          team_name,
          captain_name,
          email,
          phone,
          institution,
          status,
          admin_notes,
          submitted_at,
          games (
            id,
            title,
            team_size
          ),
          players (
            id,
            player_name,
            gamer_tag
          )
        `)
        .order("submitted_at", { ascending: false });

      if (error) {
        console.error("Failed to load esports registrations:", error);
      } else {
        setRegistrations((data as unknown as EsportsRegistrationItem[]) || []);
      }
    } catch (err) {
      console.error("Error loading esports registrations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "registrations", onRefresh: fetchRegistrations },
      { table: "players", onRefresh: fetchRegistrations },
      { table: "games", onRefresh: fetchRegistrations },
    ],
    "admin-esports-registrations"
  );

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  // Update Status Handler
  const changeStatus = async (item: ProcessedEsportsRegistration, newStatus: string) => {
    setUpdatingId(item.id);
    setStatusMessage(null);
    try {
      const { error } = await supabase
        .from("registrations")
        .update({ status: newStatus })
        .eq("id", item.id);

      if (error) throw error;

      setRegistrations((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, status: newStatus } : r))
      );
      if (selectedReg && selectedReg.id === item.id) {
        setSelectedReg({ ...selectedReg, status: newStatus });
      }
      setStatusMessage({
        type: "success",
        text: `Team "${item.team_name}" (${item.registration_ref}) status changed to ${newStatus}.`,
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Failed to update status: ${err.message || "Unknown error"}`,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  // Safe Archive Handler
  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      const res = await archiveRegistrationRecord("esports", archiveTarget.id);
      if (!res.ok) {
        throw new Error(res.error);
      }

      const now = new Date().toISOString();
      markRegistrationArchivedLocal(archiveTarget.id, true);
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === archiveTarget.id
            ? {
                ...r,
                archived_at: now,
                admin_notes: r.admin_notes ? `${r.admin_notes}\n[ARCHIVED ${now}]` : `[ARCHIVED ${now}]`,
              }
            : r
        )
      );

      if (selectedReg && selectedReg.id === archiveTarget.id) {
        setSelectedReg({
          ...selectedReg,
          archived_at: now,
          admin_notes: selectedReg.admin_notes
            ? `${selectedReg.admin_notes}\n[ARCHIVED ${now}]`
            : `[ARCHIVED ${now}]`,
          isArchived: true,
        });
      }

      setStatusMessage({
        type: "success",
        text: `Team "${archiveTarget.team_name}" (${archiveTarget.registration_ref}) was successfully archived.`,
      });
      setArchiveTarget(null);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Failed to archive: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsArchiving(false);
    }
  };

  // Safe Restore Handler
  const handleRestore = async (item: ProcessedEsportsRegistration) => {
    setUpdatingId(item.id);
    try {
      const res = await restoreRegistrationRecord("esports", item.id);
      if (!res.ok) {
        throw new Error(res.error);
      }

      markRegistrationArchivedLocal(item.id, false);
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === item.id
            ? {
                ...r,
                archived_at: null,
                admin_notes: r.admin_notes?.replace(/\[ARCHIVED.*?\]/g, "").trim() || null,
              }
            : r
        )
      );

      if (selectedReg && selectedReg.id === item.id) {
        setSelectedReg({
          ...selectedReg,
          archived_at: null,
          admin_notes: selectedReg.admin_notes?.replace(/\[ARCHIVED.*?\]/g, "").trim() || null,
          isArchived: false,
        });
      }

      setStatusMessage({
        type: "success",
        text: `Team "${item.team_name}" (${item.registration_ref}) was restored to the active submissions list.`,
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Failed to restore: ${err.message || "Unknown error"}`,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  // Process data with Roster Health & Archive Status
  const processedRegistrations: ProcessedEsportsRegistration[] = useMemo(() => {
    return registrations.map((r) => {
      const gameTitle = r.games?.title || "Game TBA";
      const registeredCount = r.players?.length || 0;
      const expectedCount = getOfficialTeamSize(r.games?.title, r.games?.team_size);
      const isRosterValid = registeredCount === expectedCount;
      const isFlagged = !isRosterValid;
      const isArchived = isRegistrationArchived(r);

      return {
        ...r,
        gameTitle,
        registeredCount,
        expectedCount,
        isRosterValid,
        isFlagged,
        isArchived,
        rosterSpecText: `${registeredCount} / ${expectedCount}`,
      };
    });
  }, [registrations]);

  // Filtered registrations
  const filteredRegistrations = useMemo(() => {
    return processedRegistrations.filter((r) => {
      // 1. View Scope (Active vs Archived vs All)
      if (viewScope === "active" && r.isArchived) return false;
      if (viewScope === "archived" && !r.isArchived) return false;

      // 2. Status Filter
      if (statusFilter !== "all" && r.status !== statusFilter) return false;

      // 3. Game Filter
      if (gameFilter !== "all") {
        if (!r.gameTitle.toLowerCase().includes(gameFilter.toLowerCase())) return false;
      }

      // 4. Roster Health Filter
      if (rosterHealthFilter === "valid" && !r.isRosterValid) return false;
      if (rosterHealthFilter === "flagged" && r.isRosterValid) return false;

      // 5. Search Filter
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      const playerMatch = r.players.some(
        (p) =>
          p.player_name.toLowerCase().includes(q) ||
          (p.gamer_tag && p.gamer_tag.toLowerCase().includes(q))
      );

      return (
        r.registration_ref.toLowerCase().includes(q) ||
        r.team_name.toLowerCase().includes(q) ||
        r.captain_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        (r.institution && r.institution.toLowerCase().includes(q)) ||
        r.gameTitle.toLowerCase().includes(q) ||
        playerMatch
      );
    });
  }, [processedRegistrations, viewScope, statusFilter, gameFilter, rosterHealthFilter, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalActive = 0;
    let confirmedActive = 0;
    let pendingActive = 0;
    let flaggedActive = 0;
    let archivedCount = 0;

    let valorant = 0;
    let bgmi = 0;
    let freefire = 0;

    processedRegistrations.forEach((r) => {
      if (r.isArchived) {
        archivedCount++;
      } else {
        totalActive++;
        if (r.status === "confirmed") confirmedActive++;
        if (r.status === "pending") pendingActive++;
        if (r.isFlagged) flaggedActive++;

        const g = r.gameTitle.toLowerCase();
        if (g.includes("val")) valorant++;
        else if (g.includes("bgmi")) bgmi++;
        else if (g.includes("free")) freefire++;
      }
    });

    return { totalActive, confirmedActive, pendingActive, flaggedActive, archivedCount, valorant, bgmi, freefire };
  }, [processedRegistrations]);

  // Export CSV
  const handleExportCSV = () => {
    const sanitizeCsv = (val: string | number | null | undefined): string => {
      const str = String(val ?? "");
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const headers = [
      "Registration Ref",
      "Game",
      "Team Name",
      "Roster Size (Actual / Expected)",
      "Roster Status",
      "Captain / Lead",
      "Email",
      "Phone",
      "Institution",
      "Status",
      "Archived",
      "Submitted At",
      "Player 1",
      "Player 2",
      "Player 3",
      "Player 4",
      "Player 5",
    ];

    const rows = filteredRegistrations.map((r) => {
      const p1 = r.players[0] ? `${r.players[0].player_name} (${r.players[0].gamer_tag || "N/A"})` : "";
      const p2 = r.players[1] ? `${r.players[1].player_name} (${r.players[1].gamer_tag || "N/A"})` : "";
      const p3 = r.players[2] ? `${r.players[2].player_name} (${r.players[2].gamer_tag || "N/A"})` : "";
      const p4 = r.players[3] ? `${r.players[3].player_name} (${r.players[3].gamer_tag || "N/A"})` : "";
      const p5 = r.players[4] ? `${r.players[4].player_name} (${r.players[4].gamer_tag || "N/A"})` : "";

      return [
        sanitizeCsv(r.registration_ref),
        sanitizeCsv(r.gameTitle),
        sanitizeCsv(r.team_name),
        sanitizeCsv(`${r.registeredCount} / ${r.expectedCount}`),
        sanitizeCsv(r.isRosterValid ? "VALID" : "FLAGGED FOR REVIEW"),
        sanitizeCsv(r.captain_name),
        sanitizeCsv(r.email),
        sanitizeCsv(r.phone),
        sanitizeCsv(r.institution || "N/A"),
        sanitizeCsv(r.status),
        sanitizeCsv(r.isArchived ? "YES" : "NO"),
        sanitizeCsv(r.submitted_at),
        sanitizeCsv(p1),
        sanitizeCsv(p2),
        sanitizeCsv(p3),
        sanitizeCsv(p4),
        sanitizeCsv(p5),
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `supernova_esports_registrations_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              Esports Arena CRM
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            Esports Team Registrations
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Verify official collegiate rosters, validate team sizes (5 for VALORANT, 4 for BGMI/FREE FIRE), and manage squad approvals.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />
          <button
            type="button"
            onClick={fetchRegistrations}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Sync</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Metrics Row: Clean SaaS Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-slate-500 font-semibold">Active Squads</p>
          <p className="text-2xl font-display font-extrabold text-slate-900 mt-1">{metrics.totalActive}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-emerald-700 font-semibold">Confirmed Active</p>
          <p className="text-2xl font-display font-extrabold text-emerald-700 mt-1">{metrics.confirmedActive}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-amber-700 font-semibold">Pending Review</p>
          <p className="text-2xl font-display font-extrabold text-amber-600 mt-1">{metrics.pendingActive}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-rose-700 font-semibold">Flagged Rosters</p>
          <p className="text-2xl font-display font-extrabold text-rose-600 mt-1">{metrics.flaggedActive}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs col-span-2 sm:col-span-1">
          <p className="text-[11px] font-mono uppercase text-slate-500 font-semibold">Archived / Removed</p>
          <p className="text-2xl font-display font-extrabold text-slate-600 mt-1">{metrics.archivedCount}</p>
        </div>
      </div>

      {/* Toast Feedback Message */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between border shadow-2xs ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMessage.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage(null)} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Active vs Archived Submissions Toggle Tabs */}
          <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewScope("active")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewScope === "active"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Active Submissions ({metrics.totalActive})
            </button>
            <button
              type="button"
              onClick={() => setViewScope("archived")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewScope === "archived"
                  ? "bg-white text-rose-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Archive size={12} />
              <span>Archived ({metrics.archivedCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewScope("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewScope === "all"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Records
            </button>
          </div>

          <span className="text-xs text-slate-500 font-mono">
            Showing <strong className="text-slate-900">{filteredRegistrations.length}</strong> matches
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference, team, captain, phone, institution..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Game Filter */}
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Titles (VALORANT, BGMI, FREE FIRE)</option>
            <option value="valorant">VALORANT (5 Players)</option>
            <option value="bgmi">BGMI (4 Players)</option>
            <option value="free fire">FREE FIRE (4 Players)</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            {REGISTRATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Roster Health Filter */}
          <select
            value={rosterHealthFilter}
            onChange={(e) => setRosterHealthFilter(e.target.value as "all" | "valid" | "flagged")}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Rosters</option>
            <option value="valid">Valid Rosters (5/5 or 4/4)</option>
            <option value="flagged">⚠️ Flagged For Review (Mismatch)</option>
          </select>
        </div>
      </div>

      {/* Main SaaS Registration Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-mono tracking-wider text-[11px]">
                <th className="py-3 px-4 font-semibold">Reference</th>
                <th className="py-3 px-4 font-semibold">Team Name</th>
                <th className="py-3 px-4 font-semibold">Tournament Title</th>
                <th className="py-3 px-4 font-semibold">Representative</th>
                <th className="py-3 px-4 font-semibold">Roster Health</th>
                <th className="py-3 px-4 font-semibold">Submitted</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-mono">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading esports rosters from Supabase...
                  </td>
                </tr>
              ) : filteredRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="font-semibold text-slate-800">No esports registrations match your current criteria.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {viewScope === "archived" ? "No archived esports teams found." : "Try adjusting filters or searching a different term."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRegistrations.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedReg(item)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    {/* Reference */}
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                      {item.registration_ref}
                    </td>

                    {/* Team Name & Institution */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 block text-sm group-hover:text-blue-700 transition-colors">
                        {item.team_name}
                      </span>
                      <span className="text-[11px] text-slate-500 block truncate max-w-[200px]">
                        {item.institution || "Independent"}
                      </span>
                    </td>

                    {/* Game & Platform */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {item.gameTitle.toLowerCase().includes("val") ? (
                          <Monitor size={13} className="text-sky-600" />
                        ) : (
                          <Smartphone size={13} className="text-amber-600" />
                        )}
                        <span className="font-semibold text-slate-800">{item.gameTitle}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        Required: {item.expectedCount} players
                      </span>
                    </td>

                    {/* Representative */}
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800">{item.captain_name}</p>
                      <p className="text-[11px] text-slate-500 font-mono truncate max-w-[170px]">{item.email}</p>
                    </td>

                    {/* Roster Health */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {item.isRosterValid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[11px] font-semibold">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          <span>{item.rosterSpecText}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 font-mono text-[11px] font-bold">
                          <AlertTriangle size={11} className="text-rose-600" />
                          <span>{item.rosterSpecText} · Flagged</span>
                        </span>
                      )}
                    </td>

                    {/* Submitted Date */}
                    <td className="py-3.5 px-4 text-slate-500 font-mono whitespace-nowrap">
                      {new Date(item.submitted_at).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <AdminStatusBadge status={item.status} isArchived={item.isArchived} />
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedReg(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                          title="View complete team details and player roster"
                        >
                          <Eye size={12} />
                          <span>View</span>
                        </button>

                        {item.isArchived ? (
                          <button
                            type="button"
                            onClick={() => handleRestore(item)}
                            disabled={updatingId === item.id}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors cursor-pointer"
                            title="Restore to active submissions"
                          >
                            <RotateCcw size={12} />
                            <span>Restore</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setArchiveTarget(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Archive / Delete this registration"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          REQUIREMENT 6: LARGE, PROFESSIONAL TEAM DETAIL DRAWER / MODAL
          ========================================================================= */}
      {selectedReg && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-fadeIn"
          onClick={() => setSelectedReg(null)}
        >
          <div
            className="w-full max-w-2xl bg-white border-l border-slate-200 h-full overflow-y-auto p-6 sm:p-8 flex flex-col justify-between shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded">
                      {selectedReg.registration_ref}
                    </span>
                    <AdminStatusBadge status={selectedReg.status} isArchived={selectedReg.isArchived} />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-display font-black text-slate-900 tracking-tight m-0">
                    {selectedReg.team_name}
                  </h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Submitted {new Date(selectedReg.submitted_at).toLocaleString("en-IN")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedReg(null)}
                  className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close detail drawer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Roster Health Banner */}
              <div>
                {selectedReg.isRosterValid ? (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-900">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold font-mono">
                        ROSTER HEALTH: VALID ({selectedReg.gameTitle} · {selectedReg.rosterSpecText} Players)
                      </p>
                      <p className="text-[11px] text-emerald-800/80 mt-0.5">
                        Matches official tournament specification. No extra or missing players.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2.5 text-xs text-rose-900">
                    <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                    <div>
                      <p className="font-bold font-mono">
                        ROSTER HEALTH: REVIEW REQUIRED ({selectedReg.registeredCount} / {selectedReg.expectedCount} Players)
                      </p>
                      <p className="text-[11px] text-rose-800/80 mt-0.5">
                        {selectedReg.registeredCount > selectedReg.expectedCount
                          ? `Roster has ${selectedReg.registeredCount - selectedReg.expectedCount} excess player(s). Official limit is ${selectedReg.expectedCount}.`
                          : `Roster is missing ${selectedReg.expectedCount - selectedReg.registeredCount} player(s). All ${selectedReg.expectedCount} positions are required.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION A: Team & Tournament Information */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Team & Tournament Specifications
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Game Title</span>
                    <strong className="text-slate-900 text-sm">{selectedReg.gameTitle}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Platform</span>
                    <strong className="text-slate-900 text-sm">
                      {selectedReg.gameTitle.toLowerCase().includes("val") ? "PC Tournament" : "Mobile Tournament"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Substitutes Rule</span>
                    <span className="font-medium text-amber-700">Not Allowed (Official Rules)</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Institution / College</span>
                    <span className="font-medium text-slate-900">{selectedReg.institution || "Independent"}</span>
                  </div>
                </div>
              </div>

              {/* SECTION B: Representative Information */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Team Representative / Captain Contact
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Representative Name:</span>
                    <strong className="text-slate-900">{selectedReg.captain_name}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Mail size={12} /> Email Address:
                    </span>
                    <a href={`mailto:${selectedReg.email}`} className="text-blue-700 font-mono hover:underline">
                      {selectedReg.email}
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Phone size={12} /> Phone Number:
                    </span>
                    <a href={`tel:${selectedReg.phone}`} className="text-blue-700 font-mono hover:underline">
                      {selectedReg.phone}
                    </a>
                  </div>
                </div>
              </div>

              {/* SECTION C: COMPLETE PLAYER ROSTER (All Players Individually Visible) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 m-0">
                    Verified Player Roster ({selectedReg.players.length} Registered / {selectedReg.expectedCount} Expected)
                  </h3>
                  <span className="text-[11px] font-mono text-slate-500">
                    No Substitutes Allowed
                  </span>
                </div>

                {selectedReg.players.length === 0 ? (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    No individual player records found for this team.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500 font-mono text-[11px] uppercase">
                          <th className="py-2.5 px-3 w-16">Slot</th>
                          <th className="py-2.5 px-3">Player Name</th>
                          <th className="py-2.5 px-3">In-Game Tag / ID</th>
                          <th className="py-2.5 px-3 text-right">Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedReg.players.map((p, idx) => (
                          <tr key={p.id || idx} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-500">
                              #{idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {p.player_name}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {p.gamer_tag || "Not provided"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {idx === 0 ? (
                                <span className="inline-block text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                  Captain
                                </span>
                              ) : (
                                <span className="inline-block text-[10px] font-mono text-slate-400">
                                  Starter
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SECTION D: Administrative Verification & Status Actions */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 m-0">
                  Verification & Administrative Actions
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    disabled={updatingId === selectedReg.id || selectedReg.status === "confirmed"}
                    onClick={() => changeStatus(selectedReg, "confirmed")}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Check size={13} />
                    <span>Confirm</span>
                  </button>

                  <button
                    type="button"
                    disabled={updatingId === selectedReg.id || selectedReg.status === "correction_requested"}
                    onClick={() => changeStatus(selectedReg, "correction_requested")}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Clock size={13} />
                    <span>Correction</span>
                  </button>

                  <button
                    type="button"
                    disabled={updatingId === selectedReg.id || selectedReg.status === "declined"}
                    onClick={() => changeStatus(selectedReg, "declined")}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Ban size={13} />
                    <span>Decline</span>
                  </button>

                  {selectedReg.isArchived ? (
                    <button
                      type="button"
                      disabled={updatingId === selectedReg.id}
                      onClick={() => handleRestore(selectedReg)}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      <span>Restore</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setArchiveTarget(selectedReg)}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Archive</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="pt-5 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedReg(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Archive Confirmation Modal */}
      {archiveTarget && (
        <AdminArchiveConfirmModal
          isOpen={true}
          onClose={() => setArchiveTarget(null)}
          onConfirm={handleConfirmArchive}
          isProcessing={isArchiving}
          registrationRef={archiveTarget.registration_ref}
          name={archiveTarget.team_name}
          category={`Esports Squad (${archiveTarget.gameTitle})`}
        />
      )}
    </div>
  );
}
