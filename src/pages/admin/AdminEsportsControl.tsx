import { useState, useEffect, useCallback, useMemo, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { canTeamEnterTournament } from "@/lib/tournamentEngine";
import type {
  Game,
  Match,
  MatchDispute,
  MatchResultHistoryEntry,
  Player,
  Registration,
  Tournament,
  TournamentFormat,
} from "@/types/database";
import type {
  AuditLogRow,
  ConductorOption,
  EsportsSectionId,
  EsportsWorkspaceSharedData,
} from "@/components/admin/esports/types";
import {
  TournamentOverviewSection,
  TournamentSetupSection,
} from "@/components/admin/esports/TournamentOverviewAndSetup";
import {
  BracketBuilderSection,
  TeamManagementSection,
} from "@/components/admin/esports/TeamManagementAndBracket";
import { MatchSchedulingSection } from "@/components/admin/esports/MatchSchedulingSection";
import {
  LiveConsoleAndResultsSection,
  MatchesControlSection,
} from "@/components/admin/esports/MatchesControlAndConsole";
import {
  DisputesAndCorrectionsSection,
  StandingsSection,
  TournamentHistorySection,
} from "@/components/admin/esports/StandingsDisputesHistory";
import {
  AlertTriangle,
  Award,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Gamepad2,
  GitBranch,
  History,
  LayoutGrid,
  Play,
  RefreshCw,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";

const SECTIONS: { id: EsportsSectionId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "setup", label: "Tournament Setup", icon: Settings2 },
  { id: "teams", label: "Teams", icon: Users },
  { id: "bracket", label: "Bracket Builder", icon: GitBranch },
  { id: "schedule", label: "Schedule (IST)", icon: CalendarClock },
  { id: "matches", label: "Matches", icon: SlidersHorizontal },
  { id: "live", label: "Live Console", icon: Play },
  { id: "standings", label: "Standings", icon: Award },
  { id: "disputes", label: "Disputes & Rewind", icon: ShieldAlert },
  { id: "history", label: "History", icon: History },
];

export default function AdminEsportsControl() {
  const { user, permissions, hasPermission } = useAuth();

  const canCreateMatch = hasPermission(["tournament:build_bracket", "esports:create", "esports:edit"]);
  const canEditEsports = hasPermission(["esports:edit", "tournament:build_bracket"]);
  const canManageSetup = hasPermission(["tournament:manage_games", "tournament:build_bracket", "esports:edit"]);
  const canSelectTeams = hasPermission(["tournament:select_teams", "esports:approve", "esports:edit"]);
  const canAssignConductors = hasPermission(["tournament:assign_conductors", "esports:edit"]);
  const canConfirmResults = hasPermission(["tournament:confirm_results", "esports:edit"]);
  const canResolveDisputes = hasPermission(["tournament:resolve_disputes", "esports:edit"]);
  const canRejectEsports = hasPermission("esports:reject");
  const canBroadcast = hasPermission("announcements:create") && hasPermission("announcements:publish");

  const [activeSection, setActiveSection] = useState<EsportsSectionId>("overview");
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [teams, setTeams] = useState<Registration[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [disputes, setDisputes] = useState<MatchDispute[]>([]);
  const [history, setHistory] = useState<MatchResultHistoryEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [conductors, setConductors] = useState<ConductorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationPendingNotice, setMigrationPendingNotice] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Disqualification modal state
  const [disqualifyTarget, setDisqualifyTarget] = useState<Registration | null>(null);
  const [disqualifyReason, setDisqualifyReason] = useState("");
  const [savingDisqualify, setSavingDisqualify] = useState(false);

  const fetchData = useCallback(async (feedbackMsg?: string) => {
    try {
      const [
        gamesRes,
        regsRes,
        playersRes,
        matchesRes,
        tournRes,
        dispRes,
        rolesRes,
        profRes,
        histRes,
        auditRes,
      ] = await Promise.all([
        supabase.from("games").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
        supabase.from("registrations").select("*").order("submitted_at", { ascending: false }),
        supabase.from("players").select("*"),
        supabase.from("matches").select("*").order("round_number", { ascending: true }).order("match_number", { ascending: true }),
        supabase.from("tournaments").select("*").order("created_at", { ascending: false }),
        supabase.from("match_disputes").select("*").order("created_at", { ascending: false }),
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["match_conductor", "esports_manager", "crm_admin", "super_admin"]),
        supabase.from("profiles").select("id, email, full_name, account_status"),
        supabase.from("match_result_history").select("*").order("created_at", { ascending: false }).limit(120),
        supabase
          .from("audit_logs")
          .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
          .in("entity_type", ["matches", "tournaments"])
          .order("created_at", { ascending: false })
          .limit(120),
      ]);

      const gameList = (gamesRes.data as Game[]) || [];
      setGames(gameList);
      setSelectedGameId((prev) => {
        if (prev && gameList.some((g) => g.id === prev)) return prev;
        return gameList[0]?.id || "";
      });

      setTeams((regsRes.data as Registration[]) || []);
      setPlayers((playersRes.data as Player[]) || []);
      setMatches((matchesRes.data as Match[]) || []);

      if (!tournRes.error && Array.isArray(tournRes.data)) {
        setTournaments(tournRes.data as Tournament[]);
      }
      if (!dispRes.error && Array.isArray(dispRes.data)) {
        setDisputes(dispRes.data as MatchDispute[]);
      }

      if (histRes.error) {
        const hMsg = String(histRes.error.message || "");
        if (
          histRes.error.code === "42P01" ||
          histRes.error.code === "PGRST205" ||
          hMsg.includes("match_result_history")
        ) {
          setMigrationPendingNotice(
            "Database migration 20261122000000_esports_control_centre_revamp.sql is not yet applied on Supabase. Core controls work, but apply the migration in Supabase SQL Editor to enable Result History, BR scoring persistence, and Rewind RPCs."
          );
        }
      } else if (Array.isArray(histRes.data)) {
        setHistory(histRes.data as MatchResultHistoryEntry[]);
        setMigrationPendingNotice(null);
      }

      if (!auditRes.error && Array.isArray(auditRes.data)) {
        setAuditLogs(auditRes.data as AuditLogRow[]);
      }

      const profMap = new Map<string, any>();
      (profRes.data || []).forEach((p: any) => profMap.set(p.id, p));
      const seenUserIds = new Set<string>();
      const cList: ConductorOption[] = (rolesRes.data || [])
        .map((r: any) => {
          if (seenUserIds.has(r.user_id)) return null;
          seenUserIds.add(r.user_id);
          const p = profMap.get(r.user_id) || {};
          if (p.account_status && p.account_status !== "active") return null;
          return {
            user_id: r.user_id,
            email: p.email || `staff-${String(r.user_id).slice(0, 6)}`,
            full_name: p.full_name || null,
          };
        })
        .filter(Boolean) as ConductorOption[];
      setConductors(cList);

      if (feedbackMsg) {
        setStatusMsg({ type: "success", text: feedbackMsg });
      }
    } catch (err: any) {
      console.warn("Failed to load esports control data:", err);
      setStatusMsg({ type: "error", text: `Sync failed: ${err?.message || "Unexpected error"}` });
    } finally {
      setLoading(false);
    }
  }, []);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "matches", onRefresh: () => fetchData() },
      { table: "tournaments", onRefresh: () => fetchData() },
      { table: "registrations", onRefresh: () => fetchData() },
      { table: "players", onRefresh: () => fetchData() },
      { table: "games", onRefresh: () => fetchData() },
      { table: "match_disputes", onRefresh: () => fetchData() },
      { table: "match_result_history", onRefresh: () => fetchData() },
    ],
    "admin-esports-control"
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedGameId) || null,
    [games, selectedGameId]
  );

  const teamMap = useMemo(() => {
    const map = new Map<string, Registration>();
    teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  const sharedData: EsportsWorkspaceSharedData = useMemo(() => {
    const allGameTeams = teams.filter((t) => t.game_id === selectedGameId);
    const approvedTeams = allGameTeams.filter((t) => t.status === "confirmed");
    const selectedTeams = approvedTeams.filter((t) => canTeamEnterTournament(t).ok);
    const gameMatches = matches.filter((m) => m.game_id === selectedGameId);
    const persisted = tournaments.find((t) => t.game_id === selectedGameId) || null;
    const isBrGame =
      selectedGame?.match_format === "battle_royale" || selectedGame?.scoring_mode === "battle_royale";

    const tournament: Tournament = persisted || {
      id: selectedGameId || "draft-tournament",
      game_id: selectedGameId,
      name: selectedGame ? `${selectedGame.title} Championship` : "Esports Tournament",
      format: ((selectedGame?.match_format as TournamentFormat) ||
        (isBrGame ? "battle_royale" : "single_elimination")),
      scoring_mode: selectedGame?.scoring_mode || (isBrGame ? "battle_royale" : "round_based"),
      seeding_mode: "registration_order",
      competition_mode: isBrGame ? "lobby_br" : "team",
      approved_team_limit: null,
      total_rounds: isBrGame ? 3 : 1,
      start_date: "2026-11-20",
      rules_snapshot: selectedGame?.scoring_config || null,
      require_manager_confirmation: true,
      status: "draft",
      has_started: false,
      champion_team_id: null,
      created_by: null,
      created_at: "",
      updated_at: "",
    };

    return {
      games,
      selectedGame,
      tournament,
      hasPersistedTournament: Boolean(persisted),
      approvedTeams,
      selectedTeams,
      allGameTeams,
      players,
      matches: gameMatches,
      allMatches: matches,
      disputes,
      history,
      auditLogs,
      conductors,
      teamMap,
    };
  }, [games, selectedGame, selectedGameId, teams, matches, tournaments, players, disputes, history, auditLogs, conductors, teamMap]);

  const openDisputesCount = useMemo(() => {
    const ids = new Set(sharedData.matches.map((m) => m.id));
    return disputes.filter((d) => d.status !== "resolved" && ids.has(d.match_id)).length;
  }, [disputes, sharedData.matches]);

  const handleConfirmDisqualify = async (e: FormEvent) => {
    e.preventDefault();
    if (!disqualifyTarget || !canRejectEsports) return;
    if (disqualifyReason.trim().length < 4) {
      setStatusMsg({ type: "error", text: "Disqualification reason must be at least 4 characters." });
      return;
    }

    setSavingDisqualify(true);
    try {
      const { error } = await supabase
        .from("registrations")
        .update({
          selection_status: "disqualified",
          rejection_reason: disqualifyReason.trim(),
        })
        .eq("id", disqualifyTarget.id);
      if (error) throw error;

      setDisqualifyTarget(null);
      setDisqualifyReason("");
      await fetchData(`Disqualified squad ${disqualifyTarget.team_name}.`);
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Disqualification failed: ${err?.message || "Database error"}` });
    } finally {
      setSavingDisqualify(false);
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-600">
            Esports Control Centre
          </span>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-0.5 mb-1">
            Tournament Operations — {selectedGame?.title || "Esports"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 m-0">
            Independent tournament setup, team approval, automatic bracket generation, IST scheduling, live match scoring, standings, and result rewind.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />
          <button
            type="button"
            onClick={() => fetchData("Workspace synced.")}
            className="min-h-[38px] px-3 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Sync</span>
          </button>
          <Link
            to="/esports/live"
            target="_blank"
            className="min-h-[38px] px-3.5 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 no-underline"
          >
            <span>Public Live Board</span>
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      {/* Independent Per-Game Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-mono font-semibold uppercase text-slate-500 px-1.5">
            Active Game:
          </span>
          {games.map((g) => {
            const active = g.id === selectedGameId;
            const gMatchCount = matches.filter((m) => m.game_id === g.id && m.match_format !== "BYE").length;
            const gTeamCount = teams.filter((t) => t.game_id === g.id && t.status === "confirmed").length;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setSelectedGameId(g.id);
                  setStatusMsg(null);
                }}
                className={`min-h-[40px] px-4 rounded-lg border text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer ${
                  active
                    ? "bg-[#0B1120] text-white border-[#0B1120]"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Gamepad2 size={14} />
                <span>{g.title}</span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded tabular-nums ${
                    active ? "bg-white/15 text-white" : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  {gTeamCount}T · {gMatchCount}M
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-mono text-slate-500">
          Timezone: Asia/Kolkata (IST)
        </div>
      </div>

      {/* 10-Section Workspace Tab Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5 overflow-x-auto">
        <nav className="flex items-center gap-1 min-w-max" aria-label="Esports Control Sections">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            let badge: number | null = null;
            if (sec.id === "disputes" && openDisputesCount > 0) badge = openDisputesCount;
            if (sec.id === "live") {
              const liveAndConfirm = sharedData.matches.filter(
                (m) => m.status === "live" || m.status === "result_submitted"
              ).length;
              if (liveAndConfirm > 0) badge = liveAndConfirm;
            }
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon size={13} />
                <span>{sec.label}</span>
                {badge !== null && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded tabular-nums ${
                      active ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Migration Notice if live DB hasn't run 20261122 yet */}
      {migrationPendingNotice && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-700" />
          <span>{migrationPendingNotice}</span>
        </div>
      )}

      {/* Status Toast */}
      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 ${
            statusMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMsg(null)} className="p-1 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Active Section Viewport */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs font-mono text-slate-500">
          Loading Esports Control Centre workspace...
        </div>
      ) : !selectedGame ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Gamepad2 size={30} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-800 m-0">No Active Esports Games Found</p>
          <p className="text-xs text-slate-500 mt-1 m-0">
            Activate VALORANT, BGMI, or FREE FIRE inside Games & Brackets Catalog.
          </p>
        </div>
      ) : (
        <>
          {activeSection === "overview" && (
            <TournamentOverviewSection data={sharedData} onNavigate={setActiveSection} />
          )}

          {activeSection === "setup" && (
            <TournamentSetupSection
              data={sharedData}
              canManageSetup={canManageSetup}
              onSaved={(msg) => fetchData(msg)}
              onError={(msg) => setStatusMsg({ type: "error", text: msg })}
            />
          )}

          {activeSection === "teams" && (
            <TeamManagementSection
              data={sharedData}
              canEditEsports={canEditEsports}
              canSelectTeams={canSelectTeams}
              canRejectEsports={canRejectEsports}
              onRefresh={(msg) => fetchData(msg)}
              onError={(msg) => setStatusMsg({ type: "error", text: msg })}
              onDisqualify={(team) => {
                setDisqualifyTarget(team);
                setDisqualifyReason("");
              }}
            />
          )}

          {activeSection === "bracket" && (
            <BracketBuilderSection
              data={sharedData}
              canCreateMatch={canCreateMatch}
              onRefresh={(msg) => fetchData(msg)}
              onError={(msg) => setStatusMsg({ type: "error", text: msg })}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === "schedule" && (
            <MatchSchedulingSection
              data={sharedData}
              canEditEsports={canEditEsports}
              onRefresh={(msg) => fetchData(msg)}
              onError={(msg) => setStatusMsg({ type: "error", text: msg })}
            />
          )}

          {activeSection === "matches" && (
            <MatchesControlSection
              data={sharedData}
              actorUserId={user?.id || ""}
              actorEmail={user?.email || "admin@supernova.edu"}
              permissions={permissions}
              canCreateMatch={canCreateMatch}
              canEditEsports={canEditEsports}
              canAssignConductors={canAssignConductors}
              canConfirmResults={canConfirmResults}
              onRefresh={(msg) => fetchData(msg)}
              onError={(msg) => setStatusMsg({ type: "error", text: msg })}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === "live" && (
            <LiveConsoleAndResultsSection
              data={sharedData}
              actorUserId={user?.id || ""}
              actorEmail={user?.email || "admin@supernova.edu"}
              permissions={permissions}
              canCreateMatch={canCreateMatch}
              canEditEsports={canEditEsports}
              canAssignConductors={canAssignConductors}
              canConfirmResults={canConfirmResults}
              canBroadcast={canBroadcast}
              onRefresh={(msg) => fetchData(msg)}
              onError={(msg) => setStatusMsg({ type: "error", text: msg })}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === "standings" && (
            <StandingsSection
              data={sharedData}
              canConfirmResults={canConfirmResults}
              onRefresh={(msg) => fetchData(msg)}
              onError={(msg) => setStatusMsg({ type: "error", text: msg })}
            />
          )}

          {activeSection === "disputes" && (
            <DisputesAndCorrectionsSection
              data={sharedData}
              actorUserId={user?.id || ""}
              permissions={permissions}
              canConfirmResults={canConfirmResults}
              canResolveDisputes={canResolveDisputes}
              canEditEsports={canEditEsports}
              onRefresh={(msg) => fetchData(msg)}
              onError={(msg) => setStatusMsg({ type: "error", text: msg })}
            />
          )}

          {activeSection === "history" && <TournamentHistorySection data={sharedData} />}
        </>
      )}

      {/* Disqualify Squad Modal */}
      {disqualifyTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setDisqualifyTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <h3 className="text-base font-display font-bold text-rose-900 m-0">
              Disqualify Squad — {disqualifyTarget.team_name}
            </h3>
            <p className="text-xs text-slate-600 m-0">
              Marks this squad as disqualified and records the audit reason while preserving historical team and player records.
            </p>
            <form onSubmit={handleConfirmDisqualify} className="space-y-3">
              <textarea
                required
                rows={3}
                value={disqualifyReason}
                onChange={(e) => setDisqualifyReason(e.target.value)}
                placeholder="Reason for disqualification (min 4 characters)..."
                className="w-full p-2.5 rounded-lg border border-slate-300 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDisqualifyTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDisqualify}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {savingDisqualify ? "Saving..." : "Confirm Disqualification"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
