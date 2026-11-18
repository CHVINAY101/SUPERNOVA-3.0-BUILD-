import { useState, useEffect, useCallback, useMemo, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import {
  calculateGroupStandings,
  canTeamEnterTournament,
  confirmAndAdvanceMatchResult,
} from "@/lib/tournamentEngine";
import { formatIstDateTime, isMatchScheduled } from "@/lib/scheduling";
import { formatMatchDatabaseError, MATCH_STATUS_LABELS } from "@/lib/matchOperations";
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
import {
  FORMAT_LABELS,
  isBattleRoyaleTournament,
  parseTournamentScoringRules,
  type AuditLogRow,
  type ConductorOption,
  type EsportsSectionId,
  type EsportsWorkspaceSharedData,
} from "@/components/admin/esports/types";
import {
  TournamentOverviewSection,
  TournamentSetupSection,
} from "@/components/admin/esports/TournamentOverviewAndSetup";
import { TeamManagementSection } from "@/components/admin/esports/TeamManagementAndBracket";
import { MatchSchedulingSection } from "@/components/admin/esports/MatchSchedulingSection";
import {
  DisputesAndCorrectionsSection,
  StandingsSection,
  TournamentHistorySection,
} from "@/components/admin/esports/StandingsDisputesHistory";
import { TournamentResetRecoverySection } from "@/components/admin/esports/TournamentResetRecoverySection";
import { EsportsRegistrationControlPanel } from "@/components/admin/esports/EsportsRegistrationControlPanel";
import { TournamentSetupWizardBar } from "@/components/admin/esports/TournamentSetupWizardBar";
import { ConnectedBracketCanvas } from "@/components/esports/ConnectedBracketCanvas";
import { BattleRoyaleControlPanel } from "@/components/admin/esports/BattleRoyaleControlPanel";
import { MatchOperationDrawer } from "@/components/admin/esports/MatchOperationDrawer";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Gamepad2,
  GitBranch,
  LayoutGrid,
  List,
  Play,
  RefreshCw,
  Settings2,
  Trophy,
  Users,
  X,
} from "lucide-react";

const SECTIONS: { id: EsportsSectionId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "teams", label: "Teams", icon: Users },
  { id: "tournament_matches", label: "Tournament & Matches", icon: GitBranch },
  { id: "live_results", label: "Live Results", icon: Trophy },
  { id: "settings", label: "Settings", icon: Settings2 },
];

type SettingsSubTab = "registration" | "rules" | "disputes_history" | "reset";
type MatchesViewMode = "bracket" | "list_schedule";

function sortPrimaryGames(list: Game[]): Game[] {
  const rank = (title: string) => {
    const t = title.toUpperCase();
    if (t.includes("VALORANT")) return 0;
    if (t.includes("BGMI")) return 1;
    if (t.includes("FREE FIRE")) return 2;
    return 10;
  };
  return [...list].sort((a, b) => {
    const rDiff = rank(a.title) - rank(b.title);
    if (rDiff !== 0) return rDiff;
    return (a.sort_order ?? 99) - (b.sort_order ?? 99);
  });
}

export default function AdminEsportsControl() {
  const { user, permissions, hasPermission, isSuperAdmin } = useAuth();

  const canCreateMatch = hasPermission(["tournament:build_bracket", "esports:create", "esports:edit"]);
  const canEditEsports = hasPermission(["esports:edit", "tournament:build_bracket"]);
  const canManageSetup = hasPermission(["tournament:manage_games", "tournament:build_bracket", "esports:edit"]);
  const canSelectTeams = hasPermission(["tournament:select_teams", "esports:approve", "esports:edit"]);
  const canAssignConductors = hasPermission(["tournament:assign_conductors", "esports:edit"]);
  const canConfirmResults = hasPermission(["tournament:confirm_results", "esports:edit"]);
  const canResolveDisputes = hasPermission(["tournament:resolve_disputes", "esports:edit"]);
  const canRejectEsports = hasPermission("esports:reject");

  const [activeSection, setActiveSection] = useState<EsportsSectionId>("overview");
  const [matchesViewMode, setMatchesViewMode] = useState<MatchesViewMode>("bracket");
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>("registration");
  const [showSchedulerPanel, setShowSchedulerPanel] = useState<boolean>(false);

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

  // Slide-over Match Operation Drawer target
  const [drawerMatchId, setDrawerMatchId] = useState<string | null>(null);

  // Quick list filters inside Tournament & Matches
  const [matchSearch, setMatchSearch] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState("all");

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

      const gameList = sortPrimaryGames((gamesRes.data as Game[]) || []);
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
            "Database migration 20261122000000_esports_control_centre_revamp.sql is not yet applied on Supabase. Apply it in Supabase SQL Editor for full BR scoring, history, and rewind RPCs."
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

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach((t) => map.set(t.id, t.team_name));
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

  const isBr = isBattleRoyaleTournament(sharedData.tournament, selectedGame);
  const rules = useMemo(
    () => parseTournamentScoringRules(sharedData.tournament, selectedGame),
    [sharedData.tournament, selectedGame]
  );

  const drawerMatch = useMemo(
    () => sharedData.matches.find((m) => m.id === drawerMatchId) || null,
    [sharedData.matches, drawerMatchId]
  );

  const openDisputesCount = useMemo(() => {
    const ids = new Set(sharedData.matches.map((m) => m.id));
    return disputes.filter((d) => d.status !== "resolved" && ids.has(d.match_id)).length;
  }, [disputes, sharedData.matches]);

  const liveOrConfirmCount = useMemo(
    () => sharedData.matches.filter((m) => m.status === "live" || m.status === "result_submitted").length,
    [sharedData.matches]
  );

  const filteredListMatches = useMemo(() => {
    const q = matchSearch.trim().toLowerCase();
    return sharedData.matches.filter((m) => {
      if (matchStatusFilter !== "all" && m.status !== matchStatusFilter) return false;
      if (!q) return true;
      const tA = teamNameById.get(m.team_a_id || "") || "";
      const tB = teamNameById.get(m.team_b_id || "") || "";
      return (
        (m.match_code || "").toLowerCase().includes(q) ||
        (m.round || "").toLowerCase().includes(q) ||
        tA.toLowerCase().includes(q) ||
        tB.toLowerCase().includes(q)
      );
    });
  }, [sharedData.matches, matchSearch, matchStatusFilter, teamNameById]);

  const leagueStandings = useMemo(() => {
    if (
      sharedData.tournament.format !== "round_robin" &&
      sharedData.tournament.format !== "group_knockout" &&
      sharedData.tournament.format !== "head_to_head"
    ) {
      return [];
    }
    const pool = sharedData.selectedTeams.length > 0 ? sharedData.selectedTeams : sharedData.approvedTeams;
    return calculateGroupStandings(
      pool.map((t) => t.id),
      sharedData.matches,
      { win: rules.winPoints, draw: rules.drawPoints, loss: rules.lossPoints }
    );
  }, [sharedData, rules]);

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

  const quickConfirmSubmittedMatch = async (m: Match) => {
    if (!canConfirmResults) return;
    const winnerId =
      m.winner_id ||
      (m.score_a > m.score_b ? m.team_a_id : m.score_b > m.score_a ? m.team_b_id : null);
    const check = confirmAndAdvanceMatchResult({
      matches: sharedData.matches,
      matchId: m.id,
      managerUserId: user?.id || "",
      permissions,
      overrideScoreA: m.score_a,
      overrideScoreB: m.score_b,
      overrideWinnerId: winnerId,
      overrideBrResults: m.br_results || undefined,
    });
    if (!check.ok) {
      setDrawerMatchId(m.id);
      return;
    }

    try {
      const rpcRes = await supabase.rpc("confirm_match_result_and_advance", {
        p_match_id: m.id,
        p_winner_id: winnerId,
        p_score_a: m.score_a,
        p_score_b: m.score_b,
        p_br_results: m.br_results || null,
        p_notes: m.notes || null,
      });
      if (rpcRes.error) {
        await supabase
          .from("matches")
          .update({
            status: "completed",
            result_status: "confirmed",
            winner_id: winnerId,
            confirmed_by: user?.id || null,
            confirmed_at: new Date().toISOString(),
            is_published: true,
          })
          .eq("id", m.id);
      }
      await fetchData(`Confirmed result for ${m.match_code || m.round}.`);
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Confirm failed: ${formatMatchDatabaseError(err, "completed")}` });
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Compact Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
            Supernova 3.0 · Esports Control Centre
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-0.5 mb-1">
            {selectedGame?.title || "Esports"} Tournament Organizer
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 m-0">
            Select a game below to manage teams, brackets, Battle Royale lobbies, IST timing, and live standings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

      {/* 3 Primary Game Tabs (VALORANT, BGMI, FREE FIRE) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-2.5">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Select Esports Game">
          {games.map((g) => {
            const active = g.id === selectedGameId;
            const gTeamCount = teams.filter((t) => t.game_id === g.id && t.status === "confirmed").length;
            const gMatchCount = matches.filter((m) => m.game_id === g.id && m.match_format !== "BYE").length;
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSelectedGameId(g.id);
                  setDrawerMatchId(null);
                  setStatusMsg(null);
                }}
                className={`min-h-[40px] px-4 rounded-lg border text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? "bg-[#0B1120] text-white border-[#0B1120]"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Gamepad2 size={14} />
                <span>{g.title}</span>
                <span className={`font-mono text-[11px] tabular-nums ${active ? "text-slate-300" : "text-slate-500"}`}>
                  {gTeamCount}T · {gMatchCount}M
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-mono text-slate-500 px-1.5">
          {FORMAT_LABELS[sharedData.tournament.format] || sharedData.tournament.format} · IST
        </div>
      </div>

      {/* 5 Clear Sections Navigation */}
      <div className="bg-white border border-slate-200 rounded-xl p-1.5">
        <nav className="flex flex-wrap items-center gap-1" aria-label="Control Centre Sections">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            let count: number | null = null;
            if (sec.id === "live_results" && liveOrConfirmCount > 0) count = liveOrConfirmCount;
            if (sec.id === "settings" && openDisputesCount > 0) count = openDisputesCount;

            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`min-h-[36px] px-2.5 sm:px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 sm:gap-2 whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon size={14} />
                <span>{sec.label}</span>
                {count !== null && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded tabular-nums ${
                      active ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {migrationPendingNotice && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-700" />
          <span>{migrationPendingNotice}</span>
        </div>
      )}

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

      {/* Active Section Content */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs font-mono text-slate-500">
          Loading Esports Control Centre...
        </div>
      ) : !selectedGame ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Gamepad2 size={30} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-800 m-0">No Active Esports Games Found</p>
        </div>
      ) : (
        <>
          {/* SECTION 1: OVERVIEW */}
          {activeSection === "overview" && (
            <div className="space-y-5">
              <TournamentSetupWizardBar
                data={sharedData}
                canManageSetup={canManageSetup}
                canCreateMatch={canCreateMatch}
                canConfirmResults={canConfirmResults}
                onRefresh={(msg) => fetchData(msg)}
                onError={(msg) => setStatusMsg({ type: "error", text: msg })}
                onNavigate={setActiveSection}
              />
              <TournamentOverviewSection data={sharedData} onNavigate={setActiveSection} />
            </div>
          )}

          {/* SECTION 2: TEAMS */}
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

          {/* SECTION 3: TOURNAMENT & MATCHES */}
          {activeSection === "tournament_matches" && (
            <div className="space-y-5">
              <TournamentSetupWizardBar
                data={sharedData}
                canManageSetup={canManageSetup}
                canCreateMatch={canCreateMatch}
                canConfirmResults={canConfirmResults}
                onRefresh={(msg) => fetchData(msg)}
                onError={(msg) => setStatusMsg({ type: "error", text: msg })}
                onNavigate={setActiveSection}
              />

              {isBr ? (
                <div className="space-y-5">
                  <BattleRoyaleControlPanel
                    data={sharedData}
                    actorUserId={user?.id || ""}
                    permissions={permissions}
                    canCreateMatch={canCreateMatch}
                    canEditEsports={canEditEsports}
                    canConfirmResults={canConfirmResults}
                    onSelectMatchForDrawer={(m) => setDrawerMatchId(m.id)}
                    onRefresh={(msg) => fetchData(msg)}
                    onError={(msg) => setStatusMsg({ type: "error", text: msg })}
                  />

                  <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      Bulk IST Lobby Scheduling &amp; Arena Conflict Check
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSchedulerPanel((v) => !v)}
                      className="min-h-[34px] px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <CalendarClock size={13} />
                      <span>{showSchedulerPanel ? "Hide Scheduler" : "Open IST Scheduler"}</span>
                    </button>
                  </div>

                  {showSchedulerPanel && (
                    <MatchSchedulingSection
                      data={sharedData}
                      canEditEsports={canEditEsports}
                      onRefresh={(msg) => fetchData(msg)}
                      onError={(msg) => setStatusMsg({ type: "error", text: msg })}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* View Switcher: Visual Bracket vs Match List & IST Schedule */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3">
                    <div className="inline-flex rounded-lg p-1 bg-slate-100 border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setMatchesViewMode("bracket")}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                          matchesViewMode === "bracket"
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600"
                        }`}
                      >
                        <GitBranch size={13} />
                        <span>Visual Bracket</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMatchesViewMode("list_schedule")}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                          matchesViewMode === "list_schedule"
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600"
                        }`}
                      >
                        <List size={13} />
                        <span>Match List &amp; IST Schedule ({sharedData.matches.length})</span>
                      </button>
                    </div>

                    <div className="text-xs text-slate-500">
                      Click any match card or row to check in squads, enter scores, confirm winners, or correct results.
                    </div>
                  </div>

                  {matchesViewMode === "bracket" ? (
                    <div className="space-y-5">
                      <ConnectedBracketCanvas
                        matches={sharedData.matches}
                        teamNameById={teamNameById}
                        championTeamId={sharedData.tournament.champion_team_id}
                        format={sharedData.tournament.format}
                        interactive
                        selectedMatchId={drawerMatchId}
                        onSelectMatch={(m) => setDrawerMatchId(m.id)}
                        title={`${selectedGame.title} Bracket`}
                      />

                      {leagueStandings.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                          <h3 className="text-sm font-display font-bold text-slate-900 m-0">
                            League / Group Standings
                          </h3>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-slate-200 text-[11px] font-mono uppercase text-slate-500">
                                  <th className="py-2 pr-3">#</th>
                                  <th className="py-2 pr-3">Squad</th>
                                  <th className="py-2 pr-3 text-right">P</th>
                                  <th className="py-2 pr-3 text-right">W</th>
                                  <th className="py-2 pr-3 text-right">D</th>
                                  <th className="py-2 pr-3 text-right">L</th>
                                  <th className="py-2 pr-3 text-right">Diff</th>
                                  <th className="py-2 text-right">Pts</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {leagueStandings.map((r, i) => (
                                  <tr key={r.teamId}>
                                    <td className="py-2 pr-3 font-mono font-bold tabular-nums">#{i + 1}</td>
                                    <td className="py-2 pr-3 font-semibold text-slate-900">
                                      {teamNameById.get(r.teamId) || r.teamId}
                                    </td>
                                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{r.played}</td>
                                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-emerald-700">
                                      {r.wins}
                                    </td>
                                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{r.draws}</td>
                                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-rose-700">
                                      {r.losses}
                                    </td>
                                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                                      {r.scoreDiff >= 0 ? `+${r.scoreDiff}` : r.scoreDiff}
                                    </td>
                                    <td className="py-2 text-right font-mono font-bold tabular-nums text-slate-900">
                                      {r.points}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-display font-bold text-slate-900 m-0">
                            All Fixtures ({filteredListMatches.length})
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <input
                              type="text"
                              value={matchSearch}
                              onChange={(e) => setMatchSearch(e.target.value)}
                              placeholder="Search code or team..."
                              className="h-8 px-2.5 rounded-lg border border-slate-300"
                            />
                            <select
                              value={matchStatusFilter}
                              onChange={(e) => setMatchStatusFilter(e.target.value)}
                              className="h-8 px-2 rounded-lg border border-slate-300 bg-white"
                            >
                              <option value="all">All Statuses</option>
                              <option value="upcoming">Upcoming</option>
                              <option value="scheduled">Scheduled</option>
                              <option value="ready">Ready</option>
                              <option value="live">Live</option>
                              <option value="result_submitted">Submitted</option>
                              <option value="completed">Completed</option>
                              <option value="disputed">Disputed</option>
                            </select>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-[11px] font-mono uppercase text-slate-500">
                                <th className="py-2 pr-3">Code</th>
                                <th className="py-2 pr-3">Round</th>
                                <th className="py-2 pr-3">Matchup</th>
                                <th className="py-2 pr-3">IST Time</th>
                                <th className="py-2 pr-3 text-center">Score</th>
                                <th className="py-2 pr-3">Status</th>
                                <th className="py-2 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {filteredListMatches.map((m) => (
                                <tr key={m.id} className="hover:bg-slate-50">
                                  <td className="py-2.5 pr-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                                    {m.match_code || `M${m.match_number ?? 1}`}
                                  </td>
                                  <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">{m.round}</td>
                                  <td className="py-2.5 pr-3 font-semibold text-slate-900">
                                    {teamNameById.get(m.team_a_id || "") || "TBD"} vs{" "}
                                    {m.match_format === "BYE"
                                      ? "BYE"
                                      : teamNameById.get(m.team_b_id || "") || "TBD"}
                                  </td>
                                  <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                    {isMatchScheduled(m) ? formatIstDateTime(m.scheduled_start) : "Unscheduled"}
                                  </td>
                                  <td className="py-2.5 pr-3 text-center font-mono font-bold tabular-nums">
                                    {m.match_format === "BYE" ? "—" : `${m.score_a} - ${m.score_b}`}
                                  </td>
                                  <td className="py-2.5 pr-3 whitespace-nowrap font-medium text-slate-700">
                                    {MATCH_STATUS_LABELS[m.status] || m.status}
                                  </td>
                                  <td className="py-2.5 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => setDrawerMatchId(m.id)}
                                      className="px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
                                    >
                                      Manage
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <MatchSchedulingSection
                        data={sharedData}
                        canEditEsports={canEditEsports}
                        onRefresh={(msg) => fetchData(msg)}
                        onError={(msg) => setStatusMsg({ type: "error", text: msg })}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SECTION 4: LIVE RESULTS */}
          {activeSection === "live_results" && (
            <div className="space-y-5">
              {/* Pending Manager Confirmations */}
              {sharedData.matches.some((m) => m.status === "result_submitted") && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-display font-bold text-amber-950 m-0">
                      Results Awaiting Manager Confirmation
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sharedData.matches
                      .filter((m) => m.status === "result_submitted")
                      .map((m) => (
                        <div
                          key={m.id}
                          className="bg-white border border-amber-200 rounded-lg p-3.5 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-mono text-slate-500">
                              {m.match_code || m.round} · Submitted Score
                            </div>
                            <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                              {m.bracket_side === "battle_royale"
                                ? `${m.round} · ${m.group_name || "BR Lobby"}`
                                : `${teamNameById.get(m.team_a_id || "") || "TBD"} (${m.score_a}) vs (${
                                    m.score_b
                                  }) ${teamNameById.get(m.team_b_id || "") || "TBD"}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setDrawerMatchId(m.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              Review
                            </button>
                            {canConfirmResults && (
                              <button
                                type="button"
                                onClick={() => quickConfirmSubmittedMatch(m)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                              >
                                Confirm
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Live Matches Quick Strip */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-display font-bold text-slate-900 m-0">
                    Active Live Matches ({sharedData.matches.filter((m) => m.status === "live").length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveSection("tournament_matches")}
                    className="text-xs font-semibold text-blue-700 hover:underline bg-transparent border-0 cursor-pointer"
                  >
                    Open Full Bracket / Lobbies →
                  </button>
                </div>

                {sharedData.matches.filter((m) => m.status === "live").length === 0 ? (
                  <p className="text-xs text-slate-500 m-0 py-2">
                    No matches currently marked Live. Open any scheduled match in Tournament &amp; Matches and click Start Match.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sharedData.matches
                      .filter((m) => m.status === "live")
                      .map((m) => (
                        <div
                          key={m.id}
                          className="p-4 rounded-xl border border-orange-200 bg-orange-50/40 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-mono font-bold text-orange-700 uppercase">
                              {m.match_code || m.round} · LIVE {m.station ? `· ${m.station}` : ""}
                            </div>
                            <div className="text-sm font-bold text-slate-900 truncate mt-1">
                              {m.bracket_side === "battle_royale"
                                ? `${m.round} (${m.br_results?.length || 0} Squads)`
                                : `${teamNameById.get(m.team_a_id || "") || "TBD"} ${m.score_a} : ${m.score_b} ${
                                    teamNameById.get(m.team_b_id || "") || "TBD"
                                  }`}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDrawerMatchId(m.id)}
                            className="px-3 py-2 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                          >
                            <Play size={12} />
                            <span>Score &amp; Confirm</span>
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {!isBr && (
                <ConnectedBracketCanvas
                  matches={sharedData.matches}
                  teamNameById={teamNameById}
                  championTeamId={sharedData.tournament.champion_team_id}
                  format={sharedData.tournament.format}
                  interactive
                  selectedMatchId={drawerMatchId}
                  onSelectMatch={(m) => setDrawerMatchId(m.id)}
                  title={`${selectedGame.title} Live Bracket`}
                />
              )}

              <StandingsSection
                data={sharedData}
                canConfirmResults={canConfirmResults}
                onRefresh={(msg) => fetchData(msg)}
                onError={(msg) => setStatusMsg({ type: "error", text: msg })}
              />
            </div>
          )}

          {/* SECTION 5: SETTINGS (Registration Control, Technical Rules, Disputes/History, Reset) */}
          {activeSection === "settings" && (
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-1.5 overflow-x-auto">
                <div className="flex items-center gap-1 min-w-max">
                  <button
                    type="button"
                    onClick={() => setSettingsSubTab("registration")}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                      settingsSubTab === "registration"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Registration Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsSubTab("rules")}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                      settingsSubTab === "rules" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Technical Rules &amp; Scoring Matrix
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsSubTab("disputes_history")}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                      settingsSubTab === "disputes_history"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Disputes &amp; Result History {openDisputesCount > 0 ? `(${openDisputesCount})` : ""}
                  </button>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => setSettingsSubTab("reset")}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                        settingsSubTab === "reset"
                          ? "bg-rose-700 text-white"
                          : "text-rose-700 hover:bg-rose-50"
                      }`}
                    >
                      Reset &amp; Recovery
                    </button>
                  )}
                </div>
              </div>

              {settingsSubTab === "registration" && (
                <EsportsRegistrationControlPanel
                  selectedGameId={selectedGame.id}
                  onUpdated={() => fetchData()}
                />
              )}

              {settingsSubTab === "rules" && (
                <TournamentSetupSection
                  data={sharedData}
                  canManageSetup={canManageSetup}
                  onSaved={(msg) => fetchData(msg)}
                  onError={(msg) => setStatusMsg({ type: "error", text: msg })}
                />
              )}

              {settingsSubTab === "disputes_history" && (
                <div className="space-y-6">
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
                  <TournamentHistorySection data={sharedData} />
                </div>
              )}

              {settingsSubTab === "reset" && isSuperAdmin && (
                <TournamentResetRecoverySection
                  selectedGame={selectedGame}
                  games={games}
                  onResetComplete={(msg) => fetchData(msg)}
                  onError={(msg) => setStatusMsg({ type: "error", text: msg })}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* Slide-Over Match Operation Drawer */}
      <MatchOperationDrawer
        match={drawerMatch}
        data={sharedData}
        actorUserId={user?.id || ""}
        permissions={permissions}
        canEditEsports={canEditEsports}
        canAssignConductors={canAssignConductors}
        canConfirmResults={canConfirmResults}
        canResolveDisputes={canResolveDisputes}
        onClose={() => setDrawerMatchId(null)}
        onRefresh={(msg) => fetchData(msg)}
        onError={(msg) => setStatusMsg({ type: "error", text: msg })}
      />

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
