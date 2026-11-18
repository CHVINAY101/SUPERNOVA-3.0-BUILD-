import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import {
  calculateCumulativeBattleRoyaleStandings,
  calculateGroupStandings,
  computePreEventLiveBoardState,
} from "@/lib/tournamentEngine";
import { formatIstDateTime, isMatchScheduled } from "@/lib/scheduling";
import {
  FORMAT_LABELS,
  isBattleRoyaleTournament,
  parseTournamentScoringRules,
} from "@/components/admin/esports/types";
import { ConnectedBracketCanvas } from "@/components/esports/ConnectedBracketCanvas";
import type { Game, Match, Registration, Tournament } from "@/types/database";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Crown,
  GitBranch,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  Trophy,
} from "lucide-react";

type PublicTeam = Pick<
  Registration,
  "id" | "game_id" | "registration_ref" | "team_name" | "institution" | "seed_number" | "group_name" | "selection_status" | "status"
>;

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

export default function EsportsLive() {
  const [games, setGames] = useState<Game[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [spectatorFullscreen, setSpectatorFullscreen] = useState(false);

  const pageRef = useRef<HTMLDivElement | null>(null);

  const fetchLiveBoard = useCallback(async () => {
    try {
      const rpcRes = await supabase.rpc("get_public_esports_live_board");
      if (!rpcRes.error && rpcRes.data && typeof rpcRes.data === "object") {
        const payload = rpcRes.data as {
          games?: Game[];
          tournaments?: Tournament[];
          matches?: Match[];
          teams?: PublicTeam[];
        };
        const orderedGames = sortPrimaryGames(Array.isArray(payload.games) ? payload.games : []);
        setGames(orderedGames);
        setSelectedGameId((prev) =>
          prev && orderedGames.some((g) => g.id === prev) ? prev : orderedGames[0]?.id || ""
        );
        setTournaments(Array.isArray(payload.tournaments) ? payload.tournaments : []);
        setMatches(Array.isArray(payload.matches) ? payload.matches : []);
        setTeams(Array.isArray(payload.teams) ? payload.teams : []);
        setLoadNotice(null);
        setLastRefreshed(new Date());
        return;
      }

      const [gRes, tRes, mRes, rRes] = await Promise.all([
        supabase.from("games").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
        supabase.from("tournaments").select("*"),
        supabase
          .from("matches")
          .select("*")
          .eq("is_published", true)
          .order("scheduled_start", { ascending: true }),
        supabase
          .from("registrations")
          .select("id, game_id, registration_ref, team_name, institution, seed_number, group_name, selection_status, status")
          .eq("status", "confirmed"),
      ]);

      if (mRes.error && mRes.error.code === "42501") {
        setLoadNotice(
          "Live public permissions require applying migration 20261122000000_esports_control_centre_revamp.sql on Supabase."
        );
      } else {
        setLoadNotice(null);
      }

      const orderedGames = sortPrimaryGames((gRes.data as Game[]) || []);
      setGames(orderedGames);
      setSelectedGameId((prev) =>
        prev && orderedGames.some((g) => g.id === prev) ? prev : orderedGames[0]?.id || ""
      );
      if (!tRes.error && Array.isArray(tRes.data)) setTournaments(tRes.data as Tournament[]);
      if (!mRes.error && Array.isArray(mRes.data)) setMatches(mRes.data as Match[]);
      if (!rRes.error && Array.isArray(rRes.data)) setTeams(rRes.data as PublicTeam[]);
      setLastRefreshed(new Date());
    } catch (err) {
      console.warn("Failed to fetch public live board:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "matches", onRefresh: fetchLiveBoard },
      { table: "tournaments", onRefresh: fetchLiveBoard },
      { table: "games", onRefresh: fetchLiveBoard },
    ],
    "esports-live"
  );

  useEffect(() => {
    fetchLiveBoard();
    const interval = setInterval(fetchLiveBoard, 15000);
    return () => clearInterval(interval);
  }, [fetchLiveBoard]);

  useEffect(() => {
    const onFs = () => setSpectatorFullscreen(document.fullscreenElement === pageRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleSpectatorFullscreen = async () => {
    const el = pageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else setSpectatorFullscreen((v) => !v);
    } catch {
      setSpectatorFullscreen((v) => !v);
    }
  };

  const teamMap = useMemo(() => {
    const map = new Map<string, PublicTeam>();
    teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach((t) => map.set(t.id, t.team_name));
    return map;
  }, [teams]);

  const gameMap = useMemo(() => {
    const map = new Map<string, Game>();
    games.forEach((g) => map.set(g.id, g));
    return map;
  }, [games]);

  const selectedGame = gameMap.get(selectedGameId) || null;
  const selectedTournament = useMemo(
    () => tournaments.find((t) => t.game_id === selectedGameId) || null,
    [tournaments, selectedGameId]
  );

  const gameMatches = useMemo(
    () => matches.filter((m) => m.game_id === selectedGameId),
    [matches, selectedGameId]
  );

  const visibleMatches = useMemo(
    () => gameMatches.filter((m) => m.match_format !== "BYE"),
    [gameMatches]
  );

  const liveMatches = useMemo(
    () => visibleMatches.filter((m) => m.status === "live" || m.status === "result_submitted"),
    [visibleMatches]
  );

  const upcomingMatches = useMemo(
    () =>
      visibleMatches
        .filter((m) => ["upcoming", "scheduled", "check_in", "ready"].includes(m.status))
        .sort((a, b) => {
          const sa = a.scheduled_start || "9999";
          const sb = b.scheduled_start || "9999";
          if (sa !== sb) return sa.localeCompare(sb);
          return (a.round_number ?? 1) - (b.round_number ?? 1);
        }),
    [visibleMatches]
  );

  const completedMatches = useMemo(
    () => visibleMatches.filter((m) => m.status === "completed"),
    [visibleMatches]
  );

  const championTeam = useMemo(() => {
    if (!selectedTournament?.champion_team_id) return null;
    return teamMap.get(selectedTournament.champion_team_id) || null;
  }, [selectedTournament, teamMap]);

  const preEventState = useMemo(
    () =>
      computePreEventLiveBoardState({
        tournaments,
        matches,
        selectedGameId: selectedGameId || "all",
      }),
    [tournaments, matches, selectedGameId]
  );

  const rules = useMemo(
    () => parseTournamentScoringRules(selectedTournament, selectedGame),
    [selectedTournament, selectedGame]
  );

  const singleGameBoard = useMemo(() => {
    if (!selectedGame) return null;
    const gameTeams = teams.filter(
      (t) => t.game_id === selectedGame.id && (!t.selection_status || t.selection_status === "selected")
    );
    const isBr = isBattleRoyaleTournament(selectedTournament, selectedGame);

    if (isBr) {
      return {
        type: "br" as const,
        rows: calculateCumulativeBattleRoyaleStandings({
          teams: gameTeams,
          matches: visibleMatches,
          placementPointsTable: rules.placementPoints,
          pointsPerKill: rules.pointsPerKill,
        }),
      };
    }

    const isLeagueOrGroup =
      selectedTournament?.format === "round_robin" ||
      selectedTournament?.format === "group_knockout" ||
      selectedTournament?.format === "head_to_head";

    if (isLeagueOrGroup) {
      const hasKnockoutMatches = gameMatches.some(
        (m) => m.bracket_side !== "group" && m.bracket_side !== "battle_royale" && m.next_match_id
      );
      return {
        type: "league" as const,
        hasKnockoutMatches,
        rows: calculateGroupStandings(
          gameTeams.map((t) => t.id),
          visibleMatches,
          { win: rules.winPoints, draw: rules.drawPoints, loss: rules.lossPoints }
        ),
      };
    }

    return { type: "bracket" as const };
  }, [selectedGame, selectedTournament, teams, visibleMatches, gameMatches, rules]);

  return (
    <div
      ref={pageRef}
      className={`min-h-screen bg-[#0B1120] text-slate-100 px-4 sm:px-6 pt-6 pb-20 ${
        spectatorFullscreen ? "overflow-y-auto" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Clean Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <Link
              to="/esports"
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white no-underline"
            >
              <ArrowLeft size={16} />
              <span>Esports Portal</span>
            </Link>
            <div className="hidden sm:block h-4 w-px bg-slate-800" />
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Supernova 3.0 · Live Tournament Board (IST)
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} variant="dark" />
            <button
              type="button"
              onClick={fetchLiveBoard}
              className="h-8 px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-mono text-sky-300 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              <span className="tabular-nums">
                {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </button>
            <button
              type="button"
              onClick={toggleSpectatorFullscreen}
              className="h-8 px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {spectatorFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              <span>{spectatorFullscreen ? "Exit Spectator" : "Fullscreen"}</span>
            </button>
          </div>
        </div>

        {/* 3 Primary Game Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-display font-black text-2xl sm:text-4xl tracking-tight text-white m-0">
              {selectedGame?.title || "Esports"} Live Match Center
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 m-0">
              {selectedTournament
                ? `${FORMAT_LABELS[selectedTournament.format] || selectedTournament.format} · Verified Arena Scores`
                : "Official brackets, live scores, and standings"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Select Esports Game">
            {games.map((g) => {
              const active = g.id === selectedGameId;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedGameId(g.id)}
                  className={`min-h-[40px] px-4 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "bg-[#0F172A] border-slate-800 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  {g.title}
                </button>
              );
            })}
          </div>
        </div>

        {loadNotice && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-400/30 text-xs text-amber-200 text-center">
            {loadNotice}
          </div>
        )}

        {!preEventState.showStandingsOrBracket || preEventState.showPreEventEmptyState ? (
          <section className="rounded-2xl border border-dashed border-slate-700 bg-[#0F172A]/70 px-6 py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-400/30 text-sky-300 flex items-center justify-center mx-auto">
              <Clock size={24} />
            </div>
            <h2 className="text-lg sm:text-2xl font-display font-bold text-white m-0">
              {selectedGame ? `${selectedGame.title} — Pre-Event Stand-By` : "Esports Arena Stand-By"}
            </h2>
            <p className="text-sm text-slate-300 max-w-xl mx-auto m-0 leading-relaxed">
              {preEventState.emptyStateMessage}
            </p>
          </section>
        ) : (
          <div className="space-y-8">
            {/* Champion Card */}
            {championTeam && (
              <section className="p-5 rounded-xl bg-amber-500/10 border border-amber-400/40 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-300 shrink-0">
                    <Crown size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono font-bold uppercase text-amber-300">
                      {selectedGame?.title} Tournament Champion
                    </div>
                    <div className="text-xl font-display font-black text-white truncate">
                      {championTeam.team_name}
                    </div>
                    {championTeam.institution && (
                      <div className="text-xs text-slate-300 truncate">{championTeam.institution}</div>
                    )}
                  </div>
                </div>
                <Trophy size={26} className="text-amber-300 shrink-0 hidden sm:block" />
              </section>
            )}

            {/* Live Now Strip */}
            {liveMatches.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-orange-400 m-0 flex items-center gap-2">
                  <Play size={14} fill="currentColor" />
                  <span>Live Now in the Arena ({liveMatches.length})</span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {liveMatches.map((m) => {
                    const isBr =
                      m.bracket_side === "battle_royale" || (m.match_format || "").toUpperCase().includes("BR");
                    const teamA = teamMap.get(m.team_a_id || "");
                    const teamB = teamMap.get(m.team_b_id || "");

                    return (
                      <div
                        key={m.id}
                        className="p-4 sm:p-5 rounded-xl border border-orange-500/60 bg-[#131C31] space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs font-mono">
                          <span className="font-bold text-orange-300">
                            {m.match_code || m.round} {m.station ? `· ${m.station}` : ""}
                          </span>
                          <span className="text-[11px] font-bold uppercase text-rose-400">
                            {m.status === "result_submitted" ? "Verifying Score" : "Live"}
                          </span>
                        </div>

                        {isBr ? (
                          <div className="py-1">
                            <div className="text-base font-display font-bold text-white">
                              {m.round} · {m.group_name || "BR Lobby"} ({Array.isArray(m.br_results) ? m.br_results.length : 0} Squads)
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Cumulative leaderboard updates automatically on lobby confirmation.
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 items-center gap-2 text-center">
                            <div className="text-left min-w-0">
                              <div className="text-base sm:text-lg font-display font-bold text-white truncate">
                                {teamA?.team_name || "TBD"}
                              </div>
                            </div>
                            <div>
                              <span className="inline-block font-mono text-xl sm:text-2xl font-black text-white bg-slate-950 border border-slate-700 px-3.5 py-1.5 rounded-lg tabular-nums">
                                {m.score_a} : {m.score_b}
                              </span>
                            </div>
                            <div className="text-right min-w-0">
                              <div className="text-base sm:text-lg font-display font-bold text-white truncate">
                                {teamB?.team_name || "TBD"}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Main Board: Connected Bracket / BR Cumulative Leaderboard / League Standings */}
            {selectedGame && singleGameBoard && (
              <section className="space-y-4">
                {singleGameBoard.type === "br" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-display font-bold text-white m-0">
                        {selectedGame.title} Cumulative Standings
                      </h2>
                      {rules.qualificationCount > 0 && (
                        <span className="text-xs font-mono text-emerald-400">
                          Top {rules.qualificationCount} Qualify
                        </span>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-[#0F172A] overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                            <th className="py-3 px-4 w-14">Rank</th>
                            <th className="py-3 px-4">Squad</th>
                            <th className="py-3 px-4 text-right">Matches</th>
                            <th className="py-3 px-4 text-right">Wins</th>
                            <th className="py-3 px-4 text-right">Kills</th>
                            <th className="py-3 px-4 text-right">Place Pts</th>
                            <th className="py-3 px-4 text-right text-white">Total Pts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                          {singleGameBoard.rows.map((r) => {
                            const qualified =
                              rules.qualificationCount > 0 && r.rank <= rules.qualificationCount && r.totalPoints > 0;
                            return (
                              <tr key={r.teamId} className={qualified ? "bg-emerald-500/10" : ""}>
                                <td className="py-3 px-4 font-mono font-bold tabular-nums">#{r.rank}</td>
                                <td className="py-3 px-4">
                                  <div className="font-bold text-white flex items-center gap-2">
                                    <span>{r.teamName}</span>
                                    {qualified && (
                                      <span className="text-[10px] font-mono text-emerald-400">QUALIFIED</span>
                                    )}
                                  </div>
                                  {r.institution && <div className="text-xs text-slate-400">{r.institution}</div>}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums">{r.roundsPlayed}</td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums">{r.wins}</td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums">{r.totalKills}</td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums">
                                  {r.totalPlacementPoints}
                                </td>
                                <td className="py-3 px-4 text-right font-mono font-black text-amber-300 tabular-nums">
                                  {r.totalPoints}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {singleGameBoard.type === "league" && (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-slate-800 bg-[#0F172A] overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                            <th className="py-3 px-4">#</th>
                            <th className="py-3 px-4">Team</th>
                            <th className="py-3 px-4 text-right">P</th>
                            <th className="py-3 px-4 text-right">W</th>
                            <th className="py-3 px-4 text-right">D</th>
                            <th className="py-3 px-4 text-right">L</th>
                            <th className="py-3 px-4 text-right">Diff</th>
                            <th className="py-3 px-4 text-right text-white">Pts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                          {singleGameBoard.rows.map((r, i) => {
                            const t = teamMap.get(r.teamId);
                            return (
                              <tr key={r.teamId}>
                                <td className="py-3 px-4 font-mono font-bold tabular-nums">#{i + 1}</td>
                                <td className="py-3 px-4 font-bold text-white">{t?.team_name || r.teamId}</td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums">{r.played}</td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400">
                                  {r.wins}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums">{r.draws}</td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-400">
                                  {r.losses}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums">
                                  {r.scoreDiff >= 0 ? `+${r.scoreDiff}` : r.scoreDiff}
                                </td>
                                <td className="py-3 px-4 text-right font-mono font-black text-sky-300 tabular-nums">
                                  {r.points}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {singleGameBoard.hasKnockoutMatches && (
                      <ConnectedBracketCanvas
                        matches={gameMatches}
                        teamNameById={teamNameById}
                        championTeamId={selectedTournament?.champion_team_id}
                        format={selectedTournament?.format}
                        title={`${selectedGame.title} Knockout Playoffs`}
                      />
                    )}
                  </div>
                )}

                {singleGameBoard.type === "bracket" && (
                  <ConnectedBracketCanvas
                    matches={gameMatches}
                    teamNameById={teamNameById}
                    championTeamId={selectedTournament?.champion_team_id}
                    format={selectedTournament?.format}
                    title={`${selectedGame.title} — ${
                      FORMAT_LABELS[selectedTournament?.format || "single_elimination"]
                    }`}
                  />
                )}
              </section>
            )}

            {/* Upcoming Scheduled Matches */}
            {upcomingMatches.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-sky-400 m-0 flex items-center gap-2">
                  <CalendarClock size={15} />
                  <span>Upcoming Schedule (IST)</span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {upcomingMatches.map((m) => {
                    const teamA = teamMap.get(m.team_a_id || "");
                    const teamB = teamMap.get(m.team_b_id || "");
                    const isBr =
                      m.bracket_side === "battle_royale" || (m.match_format || "").toUpperCase().includes("BR");

                    return (
                      <div key={m.id} className="p-4 rounded-xl border border-slate-800 bg-[#0F172A] space-y-2.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-sky-300">
                          <span className="truncate">{m.match_code || m.round}</span>
                          <span className="text-slate-400 shrink-0">{m.station || "Arena"}</span>
                        </div>

                        {isBr ? (
                          <div>
                            <div className="text-sm font-bold text-white">
                              {m.round} · {m.group_name || "BR Lobby"}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {Array.isArray(m.br_results) ? m.br_results.length : 0} squads
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 text-sm font-bold text-white">
                            <span className="truncate">{teamA?.team_name || "TBD"}</span>
                            <span className="text-[11px] font-mono text-slate-500 shrink-0">vs</span>
                            <span className="truncate text-right">{teamB?.team_name || "TBD"}</span>
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400 tabular-nums">
                          {isMatchScheduled(m) ? formatIstDateTime(m.scheduled_start) : "Schedule pending"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Completed Results */}
            {completedMatches.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-emerald-400 m-0 flex items-center gap-2">
                  <GitBranch size={15} />
                  <span>Completed Official Results ({completedMatches.length})</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {completedMatches.map((m) => {
                    const teamA = teamMap.get(m.team_a_id || "");
                    const teamB = teamMap.get(m.team_b_id || "");
                    const winner = teamMap.get(m.winner_id || "");
                    const isBr =
                      m.bracket_side === "battle_royale" || (m.match_format || "").toUpperCase().includes("BR");

                    return (
                      <div key={m.id} className="p-4 rounded-xl border border-slate-800 bg-[#0F172A] space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400">
                          <span>{m.match_code || m.round}</span>
                          <span className="tabular-nums">
                            {isBr ? "BR FINAL" : `FINAL ${m.score_a} - ${m.score_b}`}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-white truncate">
                          {isBr
                            ? `${m.round} · ${m.group_name || "Lobby"}`
                            : `${teamA?.team_name || "TBD"} vs ${teamB?.team_name || "TBD"}`}
                        </div>
                        <div className="text-xs text-emerald-300 font-medium">
                          {winner
                            ? isBr
                              ? `Top Squad: ${winner.team_name}`
                              : `Winner: ${winner.team_name}`
                            : !isBr && m.score_a === m.score_b
                            ? "Official Draw"
                            : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
