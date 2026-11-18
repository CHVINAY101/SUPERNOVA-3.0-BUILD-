import { useState, useEffect, useCallback, useMemo } from "react";
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
import type { Game, Match, Registration, Tournament } from "@/types/database";
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Crown,
  GitBranch,
  Play,
  RefreshCw,
  Trophy,
} from "lucide-react";

type PublicTeam = Pick<
  Registration,
  "id" | "game_id" | "registration_ref" | "team_name" | "institution" | "seed_number" | "group_name" | "selection_status" | "status"
>;

export default function EsportsLive() {
  const [games, setGames] = useState<Game[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

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
        setGames(Array.isArray(payload.games) ? payload.games : []);
        setTournaments(Array.isArray(payload.tournaments) ? payload.tournaments : []);
        setMatches(Array.isArray(payload.matches) ? payload.matches : []);
        setTeams(Array.isArray(payload.teams) ? payload.teams : []);
        setLoadNotice(null);
        setLastRefreshed(new Date());
        return;
      }

      // Fallback when 20261122 RPC isn't pushed yet
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

      setGames((gRes.data as Game[]) || []);
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
    const interval = setInterval(fetchLiveBoard, 20000);
    return () => clearInterval(interval);
  }, [fetchLiveBoard]);

  const teamMap = useMemo(() => {
    const map = new Map<string, PublicTeam>();
    teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  const gameMap = useMemo(() => {
    const map = new Map<string, Game>();
    games.forEach((g) => map.set(g.id, g));
    return map;
  }, [games]);

  const selectedGame = selectedGameId === "all" ? null : gameMap.get(selectedGameId) || null;
  const selectedTournament = useMemo(
    () => (selectedGameId === "all" ? null : tournaments.find((t) => t.game_id === selectedGameId) || null),
    [tournaments, selectedGameId]
  );

  const filteredMatches = useMemo(
    () =>
      (selectedGameId === "all" ? matches : matches.filter((m) => m.game_id === selectedGameId)).filter(
        (m) => m.match_format !== "BYE"
      ),
    [matches, selectedGameId]
  );

  const liveMatches = useMemo(
    () => filteredMatches.filter((m) => m.status === "live" || m.status === "result_submitted"),
    [filteredMatches]
  );

  const upcomingMatches = useMemo(
    () =>
      filteredMatches
        .filter((m) => ["upcoming", "scheduled", "check_in", "ready"].includes(m.status))
        .sort((a, b) => {
          const sa = a.scheduled_start || "9999";
          const sb = b.scheduled_start || "9999";
          if (sa !== sb) return sa.localeCompare(sb);
          return (a.round_number ?? 1) - (b.round_number ?? 1);
        }),
    [filteredMatches]
  );

  const completedMatches = useMemo(
    () => filteredMatches.filter((m) => m.status === "completed"),
    [filteredMatches]
  );

  const championEntries = useMemo(() => {
    return tournaments
      .filter((t) => (selectedGameId === "all" || t.game_id === selectedGameId) && t.champion_team_id)
      .map((t) => ({
        tournament: t,
        game: gameMap.get(t.game_id),
        champion: teamMap.get(t.champion_team_id || ""),
      }))
      .filter((x) => Boolean(x.champion));
  }, [tournaments, selectedGameId, gameMap, teamMap]);

  const preEventState = useMemo(
    () =>
      computePreEventLiveBoardState({
        tournaments,
        matches,
        selectedGameId,
      }),
    [tournaments, matches, selectedGameId]
  );

  // Game-specific standings when a single game tab is selected
  const singleGameStandings = useMemo(() => {
    if (!selectedGame) return null;
    const gameTeams = teams.filter(
      (t) => t.game_id === selectedGame.id && (!t.selection_status || t.selection_status === "selected")
    );
    const rules = parseTournamentScoringRules(selectedTournament, selectedGame);
    const isBr = isBattleRoyaleTournament(selectedTournament, selectedGame);

    if (isBr) {
      return {
        type: "br" as const,
        rows: calculateCumulativeBattleRoyaleStandings({
          teams: gameTeams,
          matches: filteredMatches,
          placementPointsTable: rules.placementPoints,
          pointsPerKill: rules.pointsPerKill,
        }),
      };
    }

    if (
      selectedTournament?.format === "round_robin" ||
      selectedTournament?.format === "group_knockout" ||
      selectedTournament?.format === "head_to_head"
    ) {
      return {
        type: "league" as const,
        rows: calculateGroupStandings(
          gameTeams.map((t) => t.id),
          filteredMatches,
          { win: rules.winPoints, draw: rules.drawPoints, loss: rules.lossPoints }
        ),
      };
    }

    // Knockout bracket grouped by round_number
    const roundsMap = new Map<number, { title: string; items: Match[] }>();
    filteredMatches.forEach((m) => {
      const rn = m.round_number || 1;
      const existing = roundsMap.get(rn) || { title: m.round || `Round ${rn}`, items: [] };
      existing.items.push(m);
      roundsMap.set(rn, existing);
    });
    const bracketRounds = Array.from(roundsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, val]) => val);

    return { type: "bracket" as const, rounds: bracketRounds };
  }, [selectedGame, selectedTournament, teams, filteredMatches]);

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 px-4 sm:px-6 pt-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-10">
        {/* Top Nav */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/esports"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-300 hover:text-white no-underline"
          >
            <ArrowLeft size={16} />
            <span>Back to Esports Portal</span>
          </Link>

          <div className="flex items-center gap-3 flex-wrap">
            <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} variant="dark" />
            <button
              type="button"
              onClick={fetchLiveBoard}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-sky-400 hover:text-sky-300 cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline text-slate-400">
                Synced {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </button>
          </div>
        </div>

        {/* Hero Title */}
        <div className="text-center space-y-2">
          <div className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-orange-400">
            Supernova 3.0 · Live Tournament Scoreboard (IST)
          </div>
          <h1 className="font-display font-black text-3xl sm:text-5xl tracking-tight text-white m-0">
            Esports Match Center
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto m-0">
            Real-time brackets, IST schedules, live arena scores, Battle Royale leaderboards, and crowned champions across VALORANT, FREE FIRE, and BGMI.
          </p>
        </div>

        {/* Game Filter Bar */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedGameId("all")}
            className={`min-h-[40px] px-4 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              selectedGameId === "all"
                ? "bg-orange-500 border-orange-500 text-white"
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
            }`}
          >
            All Games
          </button>
          {games.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGameId(g.id)}
              className={`min-h-[40px] px-4 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                selectedGameId === g.id
                  ? "bg-orange-500 border-orange-500 text-white"
                  : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
              }`}
            >
              {g.title}
            </button>
          ))}
        </div>

        {loadNotice && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-400/30 text-xs text-amber-200 text-center">
            {loadNotice}
          </div>
        )}

        {preEventState.showPreEventEmptyState ? (
          <section className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-400/30 text-sky-300 flex items-center justify-center mx-auto">
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
          <>
            {/* Tournament Champions Banner */}
            {championEntries.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400 m-0 flex items-center gap-2">
                  <Crown size={15} />
                  <span>Official Tournament Champions</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {championEntries.map(({ tournament, game, champion }) => (
                    <div
                      key={tournament.id}
                      className="p-5 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-center gap-4"
                    >
                      <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-300 shrink-0">
                        <Trophy size={22} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-mono font-bold uppercase text-amber-300">
                          {game?.title || tournament.name}
                        </div>
                        <div className="text-lg font-display font-black text-white truncate">
                          {champion?.team_name}
                        </div>
                        {champion?.institution && (
                          <div className="text-xs text-slate-300 truncate">{champion.institution}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 1. Live Matches */}
            {liveMatches.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base sm:text-lg font-display font-bold text-white m-0 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse inline-block" />
                    <span>Live Now in the Arena ({liveMatches.length})</span>
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-4">
              {liveMatches.map((m) => {
                const game = gameMap.get(m.game_id || "");
                const isBr =
                  m.bracket_side === "battle_royale" || (m.match_format || "").toUpperCase().includes("BR");
                const teamA = teamMap.get(m.team_a_id || "");
                const teamB = teamMap.get(m.team_b_id || "");

                return (
                  <div
                    key={m.id}
                    className="p-5 sm:p-6 rounded-2xl border border-orange-500/60 bg-orange-500/10 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold uppercase text-orange-300">
                        {game?.title || "Esports"} · {m.match_code ? `${m.match_code} · ` : ""}
                        {m.round}
                        {m.station ? ` · ${m.station}` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-mono text-[11px] font-bold uppercase">
                        <Play size={10} fill="currentColor" />
                        <span>{m.status === "result_submitted" ? "Verifying Score" : "Live"}</span>
                      </span>
                    </div>

                    {isBr ? (
                      <div className="text-center py-2">
                        <div className="text-lg font-display font-bold text-white">
                          Battle Royale Lobby In Progress ({Array.isArray(m.br_results) ? m.br_results.length : 0} Squads)
                        </div>
                        <div className="text-xs text-slate-300 mt-1">
                          Placement & kill standings publish automatically once lobby concludes.
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 items-center gap-3 text-center">
                        <div className="text-right">
                          <div className="text-base sm:text-2xl font-display font-black text-white truncate">
                            {teamA?.team_name || "TBD"}
                          </div>
                          {teamA?.institution && (
                            <div className="text-xs text-slate-400 truncate">{teamA.institution}</div>
                          )}
                        </div>
                        <div>
                          <span className="inline-block font-mono text-2xl sm:text-4xl font-black text-white bg-black/40 border border-white/15 px-4 sm:px-6 py-2 rounded-xl tabular-nums">
                            {m.score_a} : {m.score_b}
                          </span>
                        </div>
                        <div className="text-left">
                          <div className="text-base sm:text-2xl font-display font-black text-white truncate">
                            {teamB?.team_name || "TBD"}
                          </div>
                          {teamB?.institution && (
                            <div className="text-xs text-slate-400 truncate">{teamB.institution}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
                </div>
              </section>
            )}

            {/* 2. Game-Specific Bracket or Standings Board when Game Started & Tab Selected */}
            {selectedGame && singleGameStandings && preEventState.showStandingsOrBracket && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-display font-bold text-white m-0 flex items-center gap-2">
                <GitBranch size={17} className="text-sky-400" />
                <span>
                  {selectedGame.title} —{" "}
                  {singleGameStandings.type === "br"
                    ? "Cumulative Battle Royale Leaderboard"
                    : singleGameStandings.type === "league"
                    ? "League Standings"
                    : `${FORMAT_LABELS[selectedTournament?.format || "single_elimination"]} Bracket`}
                </span>
              </h2>
            </div>

            {singleGameStandings.type === "br" ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] font-mono uppercase text-slate-400">
                      <th className="py-3 px-4 w-14">Rank</th>
                      <th className="py-3 px-4">Squad</th>
                      <th className="py-3 px-4 text-right">Matches</th>
                      <th className="py-3 px-4 text-right">Wins</th>
                      <th className="py-3 px-4 text-right">Kills</th>
                      <th className="py-3 px-4 text-right">Place Pts</th>
                      <th className="py-3 px-4 text-right text-white">Total Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {singleGameStandings.rows.map((r) => (
                      <tr key={r.teamId} className={r.rank === 1 && r.totalPoints > 0 ? "bg-amber-500/10" : ""}>
                        <td className="py-3 px-4 font-mono font-bold tabular-nums">#{r.rank}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-white">{r.teamName}</div>
                          {r.institution && <div className="text-xs text-slate-400">{r.institution}</div>}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{r.roundsPlayed}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{r.wins}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{r.totalKills}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{r.totalPlacementPoints}</td>
                        <td className="py-3 px-4 text-right font-mono font-black text-amber-300 tabular-nums">
                          {r.totalPoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : singleGameStandings.type === "league" ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] font-mono uppercase text-slate-400">
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
                  <tbody className="divide-y divide-white/5">
                    {singleGameStandings.rows.map((r, i) => {
                      const t = teamMap.get(r.teamId);
                      return (
                        <tr key={r.teamId}>
                          <td className="py-3 px-4 font-mono font-bold tabular-nums">#{i + 1}</td>
                          <td className="py-3 px-4 font-bold text-white">{t?.team_name || r.teamId}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{r.played}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400">{r.wins}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{r.draws}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-rose-400">{r.losses}</td>
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
            ) : singleGameStandings.rounds.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {singleGameStandings.rounds.map((rnd) => (
                  <div key={rnd.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                    <div className="text-xs font-mono font-bold uppercase text-sky-400">{rnd.title}</div>
                    <div className="space-y-2.5">
                      {rnd.items.map((m) => {
                        const tA = teamMap.get(m.team_a_id || "");
                        const tB = teamMap.get(m.team_b_id || "");
                        return (
                          <div key={m.id} className="p-3 rounded-xl bg-black/30 border border-white/10 text-xs space-y-1">
                            <div className="flex justify-between font-mono text-[10px] text-slate-400">
                              <span>{m.match_code || `M${m.match_number ?? 1}`}</span>
                              <span>{m.status === "completed" ? "FINAL" : m.status.toUpperCase()}</span>
                            </div>
                            <div className="flex justify-between font-semibold">
                              <span className={m.winner_id === m.team_a_id ? "text-emerald-400" : "text-white"}>
                                {tA?.team_name || "TBD"}
                              </span>
                              <span className="font-mono tabular-nums">{m.score_a}</span>
                            </div>
                            <div className="flex justify-between font-semibold">
                              <span className={m.winner_id === m.team_b_id ? "text-emerald-400" : "text-white"}>
                                {tB?.team_name || "TBD"}
                              </span>
                              <span className="font-mono tabular-nums">{m.score_b}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        )}

            {/* 3. Upcoming Scheduled Matches */}
            {upcomingMatches.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-base sm:text-lg font-display font-bold text-sky-400 m-0 flex items-center gap-2">
                  <CalendarClock size={17} />
                  <span>Upcoming Match Schedule (IST)</span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcomingMatches.map((m) => {
                    const game = gameMap.get(m.game_id || "");
                    const teamA = teamMap.get(m.team_a_id || "");
                    const teamB = teamMap.get(m.team_b_id || "");
                    const isBr =
                      m.bracket_side === "battle_royale" || (m.match_format || "").toUpperCase().includes("BR");

                    return (
                      <div key={m.id} className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] space-y-3">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-sky-300">
                          <span className="truncate">
                            {game?.title} · {m.match_code || m.round}
                          </span>
                          <span className="text-slate-400 shrink-0">{m.station || "Arena"}</span>
                        </div>

                        {isBr ? (
                          <div>
                            <div className="text-sm font-bold text-white">{m.round}</div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Multi-Squad Battle Royale Lobby ({Array.isArray(m.br_results) ? m.br_results.length : 0} squads)
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white truncate">{teamA?.team_name || "TBD"}</div>
                              <div className="text-[11px] text-slate-400 truncate">{teamA?.institution}</div>
                            </div>
                            <span className="text-xs font-mono text-slate-500 shrink-0">VS</span>
                            <div className="min-w-0 text-right">
                              <div className="text-sm font-bold text-white truncate">{teamB?.team_name || "TBD"}</div>
                              <div className="text-[11px] text-slate-400 truncate">{teamB?.institution}</div>
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t border-white/10 text-[11px] font-mono text-slate-300 tabular-nums">
                          {isMatchScheduled(m) ? formatIstDateTime(m.scheduled_start) : "Schedule pending admin confirmation"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 4. Recent Completed Results */}
            {completedMatches.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-base sm:text-lg font-display font-bold text-emerald-400 m-0 flex items-center gap-2">
                  <Trophy size={17} />
                  <span>Recent Official Results</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedMatches.map((m) => {
                    const game = gameMap.get(m.game_id || "");
                    const teamA = teamMap.get(m.team_a_id || "");
                    const teamB = teamMap.get(m.team_b_id || "");
                    const winner = teamMap.get(m.winner_id || "");
                    const isBr =
                      m.bracket_side === "battle_royale" || (m.match_format || "").toUpperCase().includes("BR");

                    return (
                      <div key={m.id} className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400">
                          <span>
                            {game?.title} · {m.match_code || m.round}
                          </span>
                          <span className="tabular-nums">
                            {isBr ? "BR FINAL" : `FINAL ${m.score_a} - ${m.score_b}`}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-white">
                          {isBr ? m.round : `${teamA?.team_name || "TBD"} vs ${teamB?.team_name || "TBD"}`}
                        </div>
                        {winner && (
                          <div className="text-xs text-emerald-300 font-semibold flex items-center gap-1.5">
                            <Trophy size={13} />
                            <span>{isBr ? `Round Top: ${winner.team_name}` : `Winner: ${winner.team_name}`}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
