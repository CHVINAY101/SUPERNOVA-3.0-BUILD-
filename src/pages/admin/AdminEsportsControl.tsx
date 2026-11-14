import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import {
  calculateGroupStandings,
  canRegenerateBracket,
  canTeamEnterTournament,
  confirmAndAdvanceMatchResult,
  generateTournamentMatches,
  isTournamentStructureLocked,
  resolveMatchDispute,
} from "@/lib/tournamentEngine";
import type {
  Game,
  Match,
  MatchDispute,
  Player,
  Registration,
  Tournament,
  TournamentFormat,
} from "@/types/database";
import {
  Gamepad2,
  ExternalLink,
  CheckCircle,
  Trophy,
  Send,
  Play,
  AlertOctagon,
  RefreshCw,
  Plus,
  X,
  GitBranch,
  ShieldCheck,
  AlertTriangle,
  Lock,
} from "lucide-react";

interface ConductorOption {
  user_id: string;
  email: string;
  full_name: string | null;
}

export default function AdminEsportsControl() {
  const { user, permissions, hasPermission } = useAuth();
  const canCreateMatch = hasPermission(["tournament:build_bracket", "esports:create", "esports:edit"]);
  const canEditEsports = hasPermission(["esports:edit", "tournament:build_bracket"]);
  const canAssignConductors = hasPermission(["tournament:assign_conductors", "esports:edit"]);
  const canConfirmResults = hasPermission(["tournament:confirm_results", "esports:edit"]);
  const canResolveDisputes = hasPermission(["tournament:resolve_disputes", "esports:edit"]);
  const canRejectEsports = hasPermission("esports:reject");
  const canBroadcast = hasPermission("announcements:create") && hasPermission("announcements:publish");

  const [activeTab, setActiveTab] = useState<"overview" | "builder" | "matches" | "rosters">("overview");
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [teams, setTeams] = useState<Registration[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [disputes, setDisputes] = useState<MatchDispute[]>([]);
  const [conductors, setConductors] = useState<ConductorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Builder state
  const [builderFormat, setBuilderFormat] = useState<TournamentFormat>("single_elimination");
  const [seedingMode, setSeedingMode] = useState<"seeded" | "random">("seeded");
  const [defaultStation, setDefaultStation] = useState("Main Arena Stage");
  const [defaultConductorId, setDefaultConductorId] = useState("");
  const [generatingBracket, setGeneratingBracket] = useState(false);

  // Quick Team Announcement state
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  // Ad-hoc match modal state
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [roundName, setRoundName] = useState("Group Stage");
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [scheduledStart, setScheduledStart] = useState("2026-11-20T11:30");
  const [creatingMatch, setCreatingMatch] = useState(false);

  // Dispute resolution modal
  const [resolveTarget, setResolveTarget] = useState<{ dispute: MatchDispute; match: Match } | null>(null);
  const [resScoreA, setResScoreA] = useState(0);
  const [resScoreB, setResScoreB] = useState(0);
  const [resWinnerId, setResWinnerId] = useState("");
  const [resNotes, setResNotes] = useState("");

  // Disqualify target
  const [disqualifyTarget, setDisqualifyTarget] = useState<Registration | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [gamesRes, regsRes, playersRes, matchesRes, tournRes, dispRes, rolesRes, profRes] =
        await Promise.all([
          supabase.from("games").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
          supabase.from("registrations").select("*").order("submitted_at", { ascending: false }),
          supabase.from("players").select("*"),
          supabase.from("matches").select("*").order("scheduled_start", { ascending: true }),
          supabase.from("tournaments").select("*").order("created_at", { ascending: false }),
          supabase.from("match_disputes").select("*").order("created_at", { ascending: false }),
          supabase
            .from("user_roles")
            .select("user_id, role")
            .in("role", ["match_conductor", "esports_manager", "crm_admin", "super_admin"]),
          supabase.from("profiles").select("id, email, full_name, account_status"),
        ]);

      const gameList = (gamesRes.data as Game[]) || [];
      setGames(gameList);
      if (gameList.length > 0 && (!selectedGameId || !gameList.some((g) => g.id === selectedGameId))) {
        setSelectedGameId(gameList[0].id);
        setBuilderFormat((gameList[0].match_format as TournamentFormat) || "single_elimination");
      }

      setTeams((regsRes.data as Registration[]) || []);
      setPlayers((playersRes.data as Player[]) || []);
      setMatches((matchesRes.data as Match[]) || []);
      if (!tournRes.error && Array.isArray(tournRes.data)) {
        setTournaments(tournRes.data as Tournament[]);
      }
      if (!dispRes.error && Array.isArray(dispRes.data)) {
        setDisputes(dispRes.data as MatchDispute[]);
      }

      const profMap = new Map<string, any>();
      (profRes.data || []).forEach((p: any) => profMap.set(p.id, p));
      const cList: ConductorOption[] = (rolesRes.data || [])
        .map((r: any) => {
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
    } catch (err) {
      console.warn("Failed to load esports control data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedGameId]);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "matches", onRefresh: fetchData },
      { table: "registrations", onRefresh: fetchData },
      { table: "players", onRefresh: fetchData },
      { table: "games", onRefresh: fetchData },
      { table: "match_disputes", onRefresh: fetchData },
    ],
    "admin-esports"
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedGameId) || null,
    [games, selectedGameId]
  );

  const gameApprovedTeams = useMemo(
    () => teams.filter((t) => t.game_id === selectedGameId && t.status === "confirmed"),
    [teams, selectedGameId]
  );

  const gameSelectedTeams = useMemo(
    () => gameApprovedTeams.filter((t) => canTeamEnterTournament(t).ok),
    [gameApprovedTeams]
  );

  const currentGameMatches = useMemo(
    () => matches.filter((m) => m.game_id === selectedGameId),
    [matches, selectedGameId]
  );

  const activeTournamentObj: Tournament = useMemo(() => {
    const existing = tournaments.find((t) => t.game_id === selectedGameId);
    if (existing) return existing;
    return {
      id: selectedGameId || "default-tournament",
      game_id: selectedGameId,
      name: selectedGame?.title || "Tournament",
      format: builderFormat,
      scoring_mode: selectedGame?.scoring_mode || "round_based",
      seeding_mode: seedingMode === "seeded" ? "manual" : "random",
      require_manager_confirmation: true,
      status: "draft",
      has_started: false,
      created_by: null,
      created_at: "",
      updated_at: "",
    };
  }, [tournaments, selectedGameId, selectedGame, builderFormat, seedingMode]);

  const activeDbTournament = useMemo(
    () => tournaments.find((t) => t.game_id === selectedGameId) || null,
    [tournaments, selectedGameId]
  );

  const openDisputes = useMemo(
    () =>
      disputes.filter(
        (d) =>
          d.status !== "resolved" &&
          currentGameMatches.some((m) => m.id === d.match_id)
      ),
    [disputes, currentGameMatches]
  );

  const standings = useMemo(
    () =>
      calculateGroupStandings(
        (gameSelectedTeams.length > 0 ? gameSelectedTeams : gameApprovedTeams).map((t) => t.id),
        currentGameMatches
      ),
    [gameSelectedTeams, gameApprovedTeams, currentGameMatches]
  );

  const structureLocked = useMemo(
    () => isTournamentStructureLocked(activeTournamentObj, currentGameMatches),
    [activeTournamentObj, currentGameMatches]
  );

  const teamMap = useMemo(() => {
    const map = new Map<string, Registration>();
    teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  // Generate or Idempotently Regenerate Tournament Bracket
  const handleGenerateBracket = async (forceOverride = false) => {
    if (!canCreateMatch || !selectedGame) return;

    const eligibleTeams = gameSelectedTeams;
    if (eligibleTeams.length < 2) {
      setStatusMsg({
        type: "error",
        text: "At least 2 confirmed teams marked 'Selected for Bracket' in Esports Teams are required.",
      });
      return;
    }

    const regenCheck = canRegenerateBracket({
      tournament: activeTournamentObj,
      existingMatches: currentGameMatches,
      confirmedStructuralOverride: forceOverride,
    });
    if (!regenCheck.ok) {
      setStatusMsg({ type: "error", text: regenCheck.error });
      return;
    }

    setGeneratingBracket(true);
    setStatusMsg(null);
    try {
      // Remove existing non-completed matches cleanly before regenerating
      if (currentGameMatches.length > 0) {
        await supabase.from("matches").delete().eq("game_id", selectedGame.id);
      }

      const defaultConductor = conductors.find((c) => c.user_id === defaultConductorId);
      const generated = generateTournamentMatches({
        tournamentId: activeDbTournament?.id || selectedGame.id,
        gameId: selectedGame.id,
        format: builderFormat,
        teams: eligibleTeams,
        seedingMode: seedingMode === "seeded" ? "manual" : "random",
        startIso: "2026-11-20T10:30:00.000Z",
        matchDurationMinutes: selectedGame.match_duration_minutes ?? 30,
        defaultStation,
        defaultConductorId: defaultConductorId || null,
      });

      if (!generated.ok) {
        setStatusMsg({ type: "error", text: generated.error });
        setGeneratingBracket(false);
        return;
      }

      const { error } = await supabase.from("matches").insert(
        generated.matches.map((m) => ({
          id: m.id,
          ...(activeDbTournament ? { tournament_id: activeDbTournament.id } : {}),
          game_id: m.game_id,
          round: m.round,
          round_number: m.round_number,
          match_number: m.match_number,
          bracket_side: m.bracket_side,
          group_name: m.group_name,
          team_a_id: m.team_a_id,
          team_b_id: m.team_b_id,
          scheduled_start: m.scheduled_start,
          station: m.station,
          conductor_id: m.conductor_id,
          conductor_email: defaultConductor?.email || null,
          score_a: m.score_a,
          score_b: m.score_b,
          winner_id: m.winner_id,
          status: m.status,
          next_match_id: m.next_match_id,
          next_match_slot: m.next_match_slot,
          loser_next_match_id: m.loser_next_match_id,
          loser_next_match_slot: m.loser_next_match_slot,
          is_published: m.is_published,
        }))
      );

      if (error) throw error;

      setStatusMsg({
        type: "success",
        text: `Generated ${generated.matches.length} ${builderFormat.replace(/_/g, " ")} matches for ${selectedGame.title} (${eligibleTeams.length} selected teams).`,
      });
      await fetchData();
      setActiveTab("matches");
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Bracket generation failed: ${err?.message || "Ensure 20261114 SQL migration is applied."}`,
      });
    } finally {
      setGeneratingBracket(false);
    }
  };

  // Assign Match Conductor
  const handleAssignConductor = async (matchId: string, conductorId: string) => {
    if (!canAssignConductors) return;
    const cond = conductors.find((c) => c.user_id === conductorId);
    const { error } = await supabase
      .from("matches")
      .update({
        conductor_id: conductorId || null,
        conductor_email: cond?.email || null,
      })
      .eq("id", matchId);

    if (error) {
      setStatusMsg({ type: "error", text: `Conductor assignment failed: ${error.message}` });
      return;
    }
    setStatusMsg({
      type: "success",
      text: cond ? `Assigned ${cond.full_name || cond.email} to match.` : "Conductor unassigned.",
    });
    await fetchData();
  };

  // Confirm & Advance Result (Double-Advancement Protected)
  const handleConfirmResult = async (match: Match) => {
    if (!canConfirmResults) return;
    const winnerId =
      match.winner_id ||
      (match.score_a > match.score_b ? match.team_a_id : match.score_b > match.score_a ? match.team_b_id : null);
    if (!winnerId) {
      setStatusMsg({ type: "error", text: "Select or enter a decisive winner before confirming." });
      return;
    }

    setStatusMsg(null);
    try {
      // Try atomic DB RPC first
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("confirm_match_result_and_advance", {
        p_match_id: match.id,
        p_winner_id: winnerId,
        p_score_a: match.score_a,
        p_score_b: match.score_b,
        p_detailed_scores: match.detailed_scores || {},
      });

      if (!rpcErr && rpcRes) {
        if (!rpcRes.ok) {
          setStatusMsg({ type: "error", text: rpcRes.error || "Confirmation blocked." });
          return;
        }
      } else {
        // Pure-logic transactional fallback
        const res = confirmAndAdvanceMatchResult({
          matches,
          matchId: match.id,
          managerUserId: user?.id || "manager",
          permissions,
          overrideScoreA: match.score_a,
          overrideScoreB: match.score_b,
          overrideWinnerId: winnerId,
        });
        if (!res.ok) {
          setStatusMsg({ type: "error", text: res.error });
          return;
        }
        for (const m of res.matches) {
          const orig = matches.find((x) => x.id === m.id);
          if (
            orig &&
            (orig.status !== m.status ||
              orig.team_a_id !== m.team_a_id ||
              orig.team_b_id !== m.team_b_id ||
              orig.bracket_advanced_at !== m.bracket_advanced_at)
          ) {
            await supabase
              .from("matches")
              .update({
                status: m.status,
                winner_id: m.winner_id,
                score_a: m.score_a,
                score_b: m.score_b,
                team_a_id: m.team_a_id,
                team_b_id: m.team_b_id,
                confirmed_by: user?.id || null,
                confirmed_at: m.confirmed_at || null,
                bracket_advanced_at: m.bracket_advanced_at || null,
              })
              .eq("id", m.id);
          }
        }
      }

      setStatusMsg({
        type: "success",
        text: `Match confirmed! Winner (${teamMap.get(winnerId)?.team_name || "Winner"}) advanced in bracket.`,
      });
      await fetchData();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Confirm failed: ${err?.message || "Error"}` });
    }
  };

  // Resolve Match Dispute
  const handleResolveDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveTarget || !canResolveDisputes || !resWinnerId || !resNotes.trim()) return;

    const outcome = resolveMatchDispute({
      matches,
      dispute: resolveTarget.dispute,
      managerUserId: user?.id || "manager",
      permissions,
      correctedScoreA: resScoreA,
      correctedScoreB: resScoreB,
      correctedWinnerId: resWinnerId,
      resolutionNotes: resNotes.trim(),
    });
    if (!outcome.ok) {
      setStatusMsg({ type: "error", text: outcome.error });
      return;
    }

    try {
      await supabase
        .from("match_disputes")
        .update({
          status: "resolved",
          resolution_notes: resNotes.trim(),
          resolved_by: user?.id || null,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", resolveTarget.dispute.id);

      const resolvedMatch = outcome.matches.find((m) => m.id === resolveTarget.match.id);
      if (resolvedMatch) {
        await supabase
          .from("matches")
          .update({
            score_a: resolvedMatch.score_a,
            score_b: resolvedMatch.score_b,
            winner_id: resolvedMatch.winner_id,
            status: "completed",
            result_status: "confirmed",
            confirmed_by: user?.id || null,
            confirmed_at: resolvedMatch.confirmed_at || null,
            bracket_advanced_at: resolvedMatch.bracket_advanced_at || null,
          })
          .eq("id", resolvedMatch.id);
      }

      // Advance downstream bracket slots if applicable
      for (const m of outcome.matches) {
        const orig = matches.find((x) => x.id === m.id);
        if (m.id !== resolveTarget.match.id && orig && (orig.team_a_id !== m.team_a_id || orig.team_b_id !== m.team_b_id)) {
          await supabase.from("matches").update({ team_a_id: m.team_a_id, team_b_id: m.team_b_id }).eq("id", m.id);
        }
      }

      setResolveTarget(null);
      setStatusMsg({ type: "success", text: "Dispute resolved and bracket progression updated." });
      await fetchData();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Dispute resolution failed: ${err?.message || "Error"}` });
    }
  };

  // Ad-hoc match creation & quick updates preserved
  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateMatch || !teamAId || !teamBId || teamAId === teamBId) {
      setStatusMsg({ type: "error", text: "Select two distinct teams." });
      return;
    }
    setCreatingMatch(true);
    try {
      const { error } = await supabase.from("matches").insert({
        game_id: selectedGameId,
        round: roundName,
        team_a_id: teamAId,
        team_b_id: teamBId,
        scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : new Date().toISOString(),
        score_a: 0,
        score_b: 0,
        status: "scheduled",
        is_published: true,
      });
      if (error) throw error;
      setMatchModalOpen(false);
      setStatusMsg({ type: "success", text: `Match created: ${roundName}.` });
      await fetchData();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Failed to create match: ${err?.message || "Error"}` });
    } finally {
      setCreatingMatch(false);
    }
  };

  const updateMatchQuick = async (
    matchId: string,
    patch: Partial<Pick<Match, "status" | "score_a" | "score_b" | "winner_id" | "station">>
  ) => {
    if (!canEditEsports) return;
    await supabase.from("matches").update(patch).eq("id", matchId);
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, ...patch } : m)));
  };

  const toggleTeamCheckIn = async (team: Registration) => {
    if (!canEditEsports) return;
    const isChecked = team.check_in_status === "checked_in";
    const nextStatus = isChecked ? "not_checked_in" : "checked_in";
    const nowIso = new Date().toISOString();
    await supabase
      .from("registrations")
      .update({
        check_in_status: nextStatus,
        checked_in_at: nextStatus === "checked_in" ? nowIso : null,
        checked_in_by: user?.email || "esports-staff@supernova.edu",
      })
      .eq("id", team.id);
    await fetchData();
  };

  const togglePlayerCheckIn = async (player: Player) => {
    if (!canEditEsports) return;
    const nextStatus = player.check_in_status === "checked_in" ? "not_checked_in" : "checked_in";
    await supabase
      .from("players")
      .update({
        check_in_status: nextStatus,
        check_in_at: nextStatus === "checked_in" ? new Date().toISOString() : null,
      })
      .eq("id", player.id);
    await fetchData();
  };

  const confirmDisqualify = async () => {
    if (!disqualifyTarget || !canRejectEsports) return;
    await supabase
      .from("registrations")
      .update({
        status: "declined",
        selection_status: "disqualified",
        selection_reason: `Disqualified / No-Show by ${user?.email || "operator"}`,
      })
      .eq("id", disqualifyTarget.id);
    setDisqualifyTarget(null);
    await fetchData();
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canBroadcast || !broadcastTitle.trim() || !broadcastBody.trim()) return;
    setBroadcasting(true);
    try {
      await supabase.from("announcements").insert({
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        is_pinned: true,
        is_published: true,
        author_id: user?.email || "esports-control@supernova.edu",
        published_at: new Date().toISOString(),
      });
      setBroadcastTitle("");
      setBroadcastBody("");
      setStatusMsg({ type: "success", text: "Stage announcement published." });
    } finally {
      setBroadcasting(false);
    }
  };

  const awaitingConfirmation = currentGameMatches.filter((m) => m.status === "result_submitted");

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
            Esports Tournament Operations Centre
          </span>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-0.5">
            Tournament Brackets, Conductors & Results
          </h1>
          <p className="text-xs text-slate-500 m-0">
            Build brackets from selected teams, assign match conductors, confirm results, and resolve disputes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />
          <Link
            to="/esports/live"
            target="_blank"
            rel="noreferrer"
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold no-underline"
          >
            <span>Public Live Board</span>
            <ExternalLink size={13} />
          </Link>
          <button
            type="button"
            onClick={fetchData}
            aria-label="Refresh esports data"
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between border ${
            statusMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMsg(null)} className="p-1 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Game Selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {games.map((g) => {
          const isSelected = selectedGameId === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setSelectedGameId(g.id);
                setBuilderFormat((g.match_format as TournamentFormat) || "single_elimination");
              }}
              className={`min-h-[40px] inline-flex items-center gap-2 px-4 rounded-xl text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap ${
                isSelected
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Gamepad2 size={16} className={isSelected ? "text-orange-400" : "text-slate-400"} />
              <span>{g.title}</span>
            </button>
          );
        })}
      </div>

      {/* Operations Navigation Tabs */}
      <div className="inline-flex flex-wrap rounded-xl p-1 bg-slate-100 border border-slate-200 gap-1">
        {[
          { id: "overview", label: "Live Overview" },
          { id: "builder", label: "Tournament Builder" },
          {
            id: "matches",
            label: `Matches & Confirmations (${awaitingConfirmation.length + openDisputes.length} pending)`,
          },
          { id: "rosters", label: "Arena Check-in & Broadcast" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              activeTab === tab.id ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: LIVE OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3.5">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-mono uppercase text-slate-500 font-semibold block">Approved</span>
              <span className="text-2xl font-display font-black text-slate-900 tabular-nums mt-1 block">
                {gameApprovedTeams.length}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-mono uppercase text-indigo-700 font-semibold block">Selected</span>
              <span className="text-2xl font-display font-black text-indigo-700 tabular-nums mt-1 block">
                {gameSelectedTeams.length}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-mono uppercase text-orange-700 font-semibold block">Live</span>
              <span className="text-2xl font-display font-black text-orange-700 tabular-nums mt-1 block">
                {currentGameMatches.filter((m) => m.status === "live").length}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-mono uppercase text-blue-700 font-semibold block">Needs Confirm</span>
              <span className="text-2xl font-display font-black text-blue-700 tabular-nums mt-1 block">
                {awaitingConfirmation.length}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-mono uppercase text-rose-700 font-semibold block">Disputed</span>
              <span className="text-2xl font-display font-black text-rose-700 tabular-nums mt-1 block">
                {openDisputes.length}
              </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-mono uppercase text-emerald-700 font-semibold block">Completed</span>
              <span className="text-2xl font-display font-black text-emerald-700 tabular-nums mt-1 block">
                {currentGameMatches.filter((m) => m.status === "completed").length}
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-display font-bold text-slate-900 m-0">Standings & Points Summary</h2>
            {standings.length === 0 ? (
              <p className="text-xs text-slate-500 m-0">Select confirmed teams to view live tournament standings.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-mono uppercase text-slate-500">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Team</th>
                      <th className="py-2 px-3 text-right">Played</th>
                      <th className="py-2 px-3 text-right">W</th>
                      <th className="py-2 px-3 text-right">L</th>
                      <th className="py-2 px-3 text-right">Diff</th>
                      <th className="py-2 px-3 text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {standings.map((row, idx) => (
                      <tr key={row.teamId}>
                        <td className="py-2 px-3 font-mono font-bold text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {teamMap.get(row.teamId)?.team_name || row.teamId}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">{row.played}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700">{row.wins}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-700">{row.losses}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">{row.scoreDiff}</td>
                        <td className="py-2 px-3 text-right font-mono font-black tabular-nums text-slate-900">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TOURNAMENT BUILDER */}
      {activeTab === "builder" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <GitBranch size={18} className="text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900 m-0">Visual Bracket & Schedule Builder</h2>
            </div>

            {structureLocked && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <Lock size={15} className="shrink-0 mt-0.5 text-amber-700" />
                <span>
                  Tournament has active or completed matches. Standard regeneration is locked to protect match integrity.
                </span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Format</label>
                <select
                  value={builderFormat}
                  onChange={(e) => setBuilderFormat(e.target.value as TournamentFormat)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 font-semibold"
                >
                  <option value="single_elimination">Single Elimination (with Byes)</option>
                  <option value="double_elimination">Double Elimination (Winners + Losers + Finals)</option>
                  <option value="round_robin">Round Robin League</option>
                  <option value="group_knockout">Group Stage + Knockout</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Seeding Mode</label>
                <select
                  value={seedingMode}
                  onChange={(e) => setSeedingMode(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 font-semibold"
                >
                  <option value="seeded">Seeded (Seed #1 vs Lowest Seed)</option>
                  <option value="random">Random Draw</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Arena Station</label>
                <input
                  type="text"
                  value={defaultStation}
                  onChange={(e) => setDefaultStation(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Match Conductor</label>
                <select
                  value={defaultConductorId}
                  onChange={(e) => setDefaultConductorId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300"
                >
                  <option value="">Assign later per match</option>
                  {conductors.map((c) => (
                    <option key={c.user_id} value={c.user_id}>
                      {c.full_name || c.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                disabled={!canCreateMatch || generatingBracket || structureLocked}
                onClick={() => handleGenerateBracket(false)}
                className="w-full min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
              >
                {generatingBracket
                  ? "Generating Bracket..."
                  : currentGameMatches.length > 0
                  ? "Regenerate Unstarted Bracket"
                  : `Generate Bracket (${gameSelectedTeams.length} Selected Teams)`}
              </button>

              {structureLocked && canCreateMatch && (
                <button
                  type="button"
                  disabled={generatingBracket}
                  onClick={() => handleGenerateBracket(true)}
                  className="w-full min-h-[40px] rounded-xl bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold cursor-pointer"
                >
                  Force Reset & Regenerate All Matches
                </button>
              )}
            </div>
          </div>

          {/* Selected Teams Eligible for Bracket */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 m-0">
                Eligible Tournament Teams ({gameSelectedTeams.length} Selected / {gameApprovedTeams.length} Approved)
              </h2>
              <Link
                to="/admin/esports-registrations"
                className="text-xs font-semibold text-blue-700 hover:underline no-underline"
              >
                Manage Team Selection →
              </Link>
            </div>

            {gameSelectedTeams.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-xs text-slate-600">
                No teams have been marked <strong>Selected for Bracket</strong> for {selectedGame?.title} yet.
                Approve teams and set their Selection Status to <strong>Selected</strong> in Esports Teams.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {gameSelectedTeams.map((t, i) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0">
                      <strong className="text-slate-900 block truncate">{t.team_name}</strong>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {t.registration_ref} · {t.institution || "Collegiate"}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[10px] font-bold shrink-0">
                      Seed #{t.seed_number ?? i + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MATCHES, CONDUCTOR ASSIGNMENT, CONFIRMATION & DISPUTES */}
      {activeTab === "matches" && (
        <div className="space-y-6">
          {/* Open Disputes Banner */}
          {openDisputes.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-rose-900 m-0 flex items-center gap-2">
                <AlertOctagon size={16} />
                <span>Frozen Match Disputes Requiring Manager Resolution ({openDisputes.length})</span>
              </h2>
              <div className="space-y-2.5">
                {openDisputes.map((d) => {
                  const match = currentGameMatches.find((m) => m.id === d.match_id);
                  if (!match) return null;
                  return (
                    <div
                      key={d.id}
                      className="bg-white border border-rose-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <strong className="text-slate-900 block">
                          {match.round}: {teamMap.get(match.team_a_id || "")?.team_name || "TBD"} vs{" "}
                          {teamMap.get(match.team_b_id || "")?.team_name || "TBD"}
                        </strong>
                        <p className="text-rose-800 m-0 mt-0.5">Reason: {d.reason}</p>
                        <span className="text-[11px] font-mono text-slate-500 block mt-0.5">
                          Reported by {d.reported_by_email} · Preserved score: {match.score_a} : {match.score_b}
                        </span>
                      </div>
                      {canResolveDisputes && (
                        <button
                          type="button"
                          onClick={() => {
                            setResolveTarget({ dispute: d, match });
                            setResScoreA(match.score_a);
                            setResScoreB(match.score_b);
                            setResWinnerId(match.winner_id || "");
                            setResNotes("");
                          }}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer shrink-0"
                        >
                          Resolve Dispute
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 m-0">
              Match Schedule, Conductor Assignments & Results ({currentGameMatches.length})
            </h2>
            {canCreateMatch && (
              <button
                type="button"
                onClick={() => setMatchModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Match</span>
              </button>
            )}
          </div>

          {currentGameMatches.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <Trophy size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-900 m-0">No matches generated for this game yet.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {currentGameMatches.map((m) => {
                const teamA = teamMap.get(m.team_a_id || "");
                const teamB = teamMap.get(m.team_b_id || "");
                const isSubmitted = m.status === "result_submitted";

                return (
                  <div
                    key={m.id}
                    className={`bg-white border rounded-2xl p-5 space-y-4 ${
                      isSubmitted
                        ? "border-blue-400 ring-1 ring-blue-500/20"
                        : m.status === "disputed"
                        ? "border-rose-300"
                        : "border-slate-200/90"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-bold text-blue-700 uppercase bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {m.round}
                        </span>
                        {m.station && (
                          <span className="text-[11px] font-mono text-slate-500">{m.station}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase border ${
                            m.status === "live"
                              ? "bg-orange-50 text-orange-800 border-orange-300"
                              : isSubmitted
                              ? "bg-blue-50 text-blue-800 border-blue-300"
                              : m.status === "disputed"
                              ? "bg-rose-50 text-rose-800 border-rose-300"
                              : m.status === "completed"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {m.status.replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>

                    {/* Teams & Scoreboard */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-center py-3 border-y border-slate-100">
                      <div className="sm:col-span-2 sm:text-right">
                        <strong className={m.winner_id === m.team_a_id ? "text-emerald-700" : "text-slate-900"}>
                          {teamA?.team_name || "TBD"}
                        </strong>
                      </div>
                      <div className="sm:col-span-1 flex items-center justify-center gap-2">
                        <input
                          type="number"
                          min={0}
                          disabled={!canEditEsports || m.status === "completed"}
                          value={m.score_a}
                          onChange={(e) => updateMatchQuick(m.id, { score_a: Number(e.target.value) || 0 })}
                          className="w-12 h-9 text-center font-mono font-black border border-slate-200 rounded-lg tabular-nums"
                        />
                        <span className="font-bold text-slate-400">:</span>
                        <input
                          type="number"
                          min={0}
                          disabled={!canEditEsports || m.status === "completed"}
                          value={m.score_b}
                          onChange={(e) => updateMatchQuick(m.id, { score_b: Number(e.target.value) || 0 })}
                          className="w-12 h-9 text-center font-mono font-black border border-slate-200 rounded-lg tabular-nums"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <strong className={m.winner_id === m.team_b_id ? "text-emerald-700" : "text-slate-900"}>
                          {teamB?.team_name || "TBD"}
                        </strong>
                      </div>
                    </div>

                    {/* Controls Row */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="font-semibold text-slate-600">Conductor:</label>
                        <select
                          disabled={!canAssignConductors || m.status === "completed"}
                          value={m.conductor_id || ""}
                          onChange={(e) => handleAssignConductor(m.id, e.target.value)}
                          className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-800"
                        >
                          <option value="">Unassigned</option>
                          {conductors.map((c) => (
                            <option key={c.user_id} value={c.user_id}>
                              {c.full_name || c.email}
                            </option>
                          ))}
                        </select>

                        {m.status !== "completed" && m.status !== "disputed" && canEditEsports && (
                          <button
                            type="button"
                            onClick={() => updateMatchQuick(m.id, { status: "live" })}
                            className="h-9 px-3 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Play size={12} /> Set Live
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          disabled={!canEditEsports || m.status === "completed"}
                          value={m.winner_id || ""}
                          onChange={(e) => updateMatchQuick(m.id, { winner_id: e.target.value || null })}
                          className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white font-semibold"
                        >
                          <option value="">Select Winner...</option>
                          {m.team_a_id && <option value={m.team_a_id}>{teamA?.team_name || "Team A"}</option>}
                          {m.team_b_id && <option value={m.team_b_id}>{teamB?.team_name || "Team B"}</option>}
                        </select>

                        {canConfirmResults && m.status !== "completed" && m.status !== "disputed" && (
                          <button
                            type="button"
                            onClick={() => handleConfirmResult(m)}
                            className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <ShieldCheck size={14} />
                            <span>Confirm & Advance</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ROSTERS & BROADCAST */}
      {activeTab === "rosters" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-3">
            <h2 className="text-base font-bold text-slate-900 m-0">
              Approved Squad Rosters ({gameApprovedTeams.length})
            </h2>
            {gameApprovedTeams.map((team) => {
              const teamPlayers = players.filter((p) => p.registration_id === team.id);
              const isArrived = team.check_in_status === "checked_in";
              return (
                <div key={team.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="text-sm text-slate-900 block">{team.team_name}</strong>
                      <span className="text-xs text-slate-500 font-mono">
                        {team.registration_ref} · Captain: {team.captain_name} · Selection:{" "}
                        <strong>{team.selection_status || "awaiting_selection"}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!canEditEsports}
                      onClick={() => toggleTeamCheckIn(team)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                        isArrived ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {isArrived ? "Arrived" : "Mark Arrived"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                    {teamPlayers.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!canEditEsports}
                        onClick={() => togglePlayerCheckIn(p)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border cursor-pointer ${
                          p.check_in_status === "checked_in"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {p.player_name} {p.gamer_tag ? `(${p.gamer_tag})` : ""}
                      </button>
                    ))}
                  </div>
                  {canRejectEsports && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setDisqualifyTarget(team)}
                        className="text-[11px] text-rose-600 hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <AlertOctagon size={12} /> Disqualify / No-Show
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {canBroadcast && (
            <div className="lg:col-span-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Send size={16} className="text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900 m-0">Broadcast Stage Notice</h3>
                </div>
                <form onSubmit={handleBroadcast} className="space-y-3">
                  <input
                    type="text"
                    required
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    placeholder="Notice title..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                  <textarea
                    required
                    rows={3}
                    value={broadcastBody}
                    onChange={(e) => setBroadcastBody(e.target.value)}
                    placeholder="Station callouts or schedule notice..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={broadcasting}
                    className="w-full min-h-[40px] rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                  >
                    {broadcasting ? "Publishing..." : "Broadcast Notice"}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resolve Dispute Modal */}
      {resolveTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setResolveTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 m-0">Resolve Match Dispute</h3>
            <p className="text-xs text-slate-600 m-0">
              Original submission preserved in audit log. Enter final verified outcome for{" "}
              <strong>{resolveTarget.match.round}</strong>:
            </p>
            <form onSubmit={handleResolveDispute} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Final Score A</label>
                  <input
                    type="number"
                    min={0}
                    value={resScoreA}
                    onChange={(e) => setResScoreA(Number(e.target.value) || 0)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Final Score B</label>
                  <input
                    type="number"
                    min={0}
                    value={resScoreB}
                    onChange={(e) => setResScoreB(Number(e.target.value) || 0)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 font-mono text-center"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Final Winner *</label>
                <select
                  required
                  value={resWinnerId}
                  onChange={(e) => setResWinnerId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold"
                >
                  <option value="">Select verified winner...</option>
                  {resolveTarget.match.team_a_id && (
                    <option value={resolveTarget.match.team_a_id}>
                      {teamMap.get(resolveTarget.match.team_a_id)?.team_name || "Team A"}
                    </option>
                  )}
                  {resolveTarget.match.team_b_id && (
                    <option value={resolveTarget.match.team_b_id}>
                      {teamMap.get(resolveTarget.match.team_b_id)?.team_name || "Team B"}
                    </option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Resolution Notes *</label>
                <textarea
                  required
                  rows={3}
                  value={resNotes}
                  onChange={(e) => setResNotes(e.target.value)}
                  placeholder="Document ruling & evidence reviewed..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResolveTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Confirm Ruling & Advance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ad-hoc Create Match Modal */}
      {matchModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setMatchModalOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 m-0">Add Tournament Match</h3>
              <button type="button" onClick={() => setMatchModalOpen(false)} className="p-1 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateMatch} className="space-y-3">
              <input
                type="text"
                required
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="Round name"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs"
              />
              <select
                required
                value={teamAId}
                onChange={(e) => setTeamAId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs"
              >
                <option value="">Select Team A...</option>
                {(gameSelectedTeams.length > 0 ? gameSelectedTeams : gameApprovedTeams).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.team_name}
                  </option>
                ))}
              </select>
              <select
                required
                value={teamBId}
                onChange={(e) => setTeamBId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs"
              >
                <option value="">Select Team B...</option>
                {(gameSelectedTeams.length > 0 ? gameSelectedTeams : gameApprovedTeams).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.team_name}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-mono"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMatchModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMatch}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                >
                  {creatingMatch ? "Creating..." : "Create Match"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disqualify Modal */}
      {disqualifyTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setDisqualifyTarget(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-rose-900 m-0">Disqualify Team?</h3>
            <p className="text-xs text-slate-600 m-0">
              Mark <strong>{disqualifyTarget.team_name}</strong> as disqualified / declined?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDisqualifyTarget(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={confirmDisqualify} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer">
                Disqualify
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
