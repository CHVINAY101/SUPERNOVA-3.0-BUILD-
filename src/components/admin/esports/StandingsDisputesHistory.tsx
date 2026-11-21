import { useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import {
  calculateCumulativeBattleRoyaleStandings,
  calculateGroupStandings,
  findDependentDownstreamMatches,
  isCancelledBracketMatch,
  normalizeBracketSlot,
  reassignTeamsInMatch,
  resolveMatchSlotDisplay,
  resolveMatchDispute,
  undoMatchResultAndRewind,
} from "@/lib/tournamentEngine";
import { formatMatchDatabaseError, MATCH_STATUS_LABELS } from "@/lib/matchOperations";
import { formatIstDateTime } from "@/lib/scheduling";
import type { PermissionKey } from "@/lib/rbac";
import {
  FORMAT_LABELS,
  isBattleRoyaleTournament,
  parseTournamentScoringRules,
  type EsportsWorkspaceSharedData,
} from "./types";
import { resolveLiveTeamName } from "@/lib/esportsFixtureCorrections";
import { callReplaceEsportsFixtureTeamRpc } from "@/lib/esportsFixtureRpc";
import { SearchableTeamSelect } from "./SearchableTeamSelect";
import type { BattleRoyaleTeamResult, Match, MatchDispute } from "@/types/database";
import {
  ArrowLeftRight,
  Crown,
  Edit3,
  History,
  RotateCcw,
  X,
} from "lucide-react";

interface SharedTabProps {
  data: EsportsWorkspaceSharedData;
  actorUserId: string;
  permissions: Set<PermissionKey>;
  canConfirmResults: boolean;
  canResolveDisputes: boolean;
  canEditEsports: boolean;
  onEditMatch?: (m: Match) => void;
  onRefresh: (msg?: string) => Promise<void>;
  onError: (msg: string) => void;
}

// =============================================================================
// Section 8: Standings & Leaderboards
// =============================================================================
export function StandingsSection({
  data,
  canConfirmResults,
  onRefresh,
  onError,
}: Pick<SharedTabProps, "data" | "canConfirmResults" | "onRefresh" | "onError">) {
  const { selectedGame, tournament, hasPersistedTournament, selectedTeams, approvedTeams, matches, teamMap } = data;
  const isBr = isBattleRoyaleTournament(tournament, selectedGame);
  const rules = useMemo(() => parseTournamentScoringRules(tournament, selectedGame), [tournament, selectedGame]);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [crowningId, setCrowningId] = useState<string>(tournament.champion_team_id || "");
  const [savingChampion, setSavingChampion] = useState(false);

  const roster = selectedTeams.length > 0 ? selectedTeams : approvedTeams;
  const championTeam = tournament.champion_team_id ? teamMap.get(tournament.champion_team_id) : null;

  const brLeaderboard = useMemo(
    () =>
      calculateCumulativeBattleRoyaleStandings({
        teams: roster,
        matches,
        placementPointsTable: rules.placementPoints,
        pointsPerKill: rules.pointsPerKill,
        includeSubmittedDrafts: includeDrafts,
      }),
    [roster, matches, rules, includeDrafts]
  );

  const leagueStandings = useMemo(
    () =>
      calculateGroupStandings(
        roster.map((t) => t.id),
        matches,
        { win: rules.winPoints, draw: rules.drawPoints, loss: rules.lossPoints }
      ),
    [roster, matches, rules]
  );

  const brMatches = useMemo(
    () =>
      matches
        .filter((m) => m.bracket_side === "battle_royale" || (m.match_format || "").toUpperCase().includes("BR"))
        .sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1)),
    [matches]
  );

  const handleCrownChampion = async (teamId: string) => {
    if (!canConfirmResults || !hasPersistedTournament || !teamId) return;
    setSavingChampion(true);
    try {
      const { error } = await supabase
        .from("tournaments")
        .update({ champion_team_id: teamId, status: "completed" })
        .eq("id", tournament.id);
      if (error) throw error;
      await onRefresh(`Crowned ${teamMap.get(teamId)?.team_name || "Champion"} as ${selectedGame?.title} Champion.`);
    } catch (err: any) {
      onError(`Champion update failed: ${err?.message || "Ensure 20261122 migration is applied."}`);
    } finally {
      setSavingChampion(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Champion Banner / Control */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <Crown size={20} />
          </div>
          <div>
            <div className="text-[11px] font-mono font-semibold uppercase text-slate-500">
              {selectedGame?.title} · {FORMAT_LABELS[tournament.format]}
            </div>
            <h2 className="text-base font-display font-bold text-slate-900 m-0">
              {championTeam
                ? `Official Champion: ${championTeam.team_name}`
                : "Tournament Champion Not Yet Crowned"}
            </h2>
          </div>
        </div>

        {canConfirmResults && hasPersistedTournament && roster.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={crowningId}
              onChange={(e) => setCrowningId(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium"
            >
              <option value="">Select Champion Squad...</option>
              {roster.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.team_name} ({t.institution || t.registration_ref})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!crowningId || savingChampion}
              onClick={() => handleCrownChampion(crowningId)}
              className="h-9 px-3.5 rounded-lg bg-[#0B1120] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
            >
              {savingChampion ? "Saving..." : championTeam ? "Update Champion" : "Crown Champion"}
            </button>
          </div>
        )}
      </div>

      {/* Main Standings Table */}
      {isBr ? (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-display font-bold text-slate-900 m-0">
                  Cumulative Battle Royale Standings
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 m-0">
                  Totals summed across completed BR lobbies (Kill = {rules.pointsPerKill} pt; Tie-breaker: Total Pts → Wins → Placement Pts → Kills).
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDrafts}
                  onChange={(e) => setIncludeDrafts(e.target.checked)}
                />
                <span>Include unconfirmed drafts</span>
              </label>
            </div>

            {brLeaderboard.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No selected squads or confirmed BR lobby rounds yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono uppercase text-slate-500">
                      <th className="py-2.5 px-4 w-16">Rank</th>
                      <th className="py-2.5 px-4">Squad</th>
                      <th className="py-2.5 px-4 text-right">Rounds</th>
                      <th className="py-2.5 px-4 text-right">Booyah / Wins</th>
                      <th className="py-2.5 px-4 text-right">Best Rank</th>
                      <th className="py-2.5 px-4 text-right">Kills</th>
                      <th className="py-2.5 px-4 text-right">Place Pts</th>
                      <th className="py-2.5 px-4 text-right">Kill Pts</th>
                      <th className="py-2.5 px-4 text-right font-bold text-slate-900">Total Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {brLeaderboard.map((row) => (
                      <tr key={row.teamId} className={row.rank === 1 && row.totalPoints > 0 ? "bg-amber-50/40" : ""}>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                          #{row.rank}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900">{row.teamName}</div>
                          {row.institution && <div className="text-[11px] text-slate-500">{row.institution}</div>}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{row.roundsPlayed}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{row.wins}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {row.bestPlacement ? `#${row.bestPlacement}` : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{row.totalKills}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{row.totalPlacementPoints}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{row.totalKillPoints}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900 tabular-nums">
                          {row.totalPoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {brMatches.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {brMatches.map((m) => {
                const rows = Array.isArray(m.br_results)
                  ? [...m.br_results].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).slice(0, 5)
                  : [];
                return (
                  <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-slate-900">
                        {m.match_code || m.round} — {m.round}
                      </span>
                      <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {MATCH_STATUS_LABELS[m.status]}
                      </span>
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-xs text-slate-500 m-0">No scores entered yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 text-xs">
                        {rows.map((r) => (
                          <div key={r.team_id} className="py-1.5 flex items-center justify-between">
                            <span className="font-medium text-slate-800">
                              {r.placement ? `#${r.placement} · ` : ""}
                              {resolveLiveTeamName(r.team_id, r.team_name, teamMap)}
                            </span>
                            <span className="font-mono tabular-nums text-slate-600">
                              {r.kills}K · <strong className="text-slate-900">{r.total_points} pts</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-display font-bold text-slate-900 m-0">
              Team Standings & Progression Record
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 m-0">
              Calculated strictly from officially confirmed matches ({rules.winPoints}W / {rules.drawPoints}D / {rules.lossPoints}L).
            </p>
          </div>
          {leagueStandings.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No selected squads yet for {selectedGame?.title}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono uppercase text-slate-500">
                    <th className="py-2.5 px-4 w-16">#</th>
                    <th className="py-2.5 px-4">Team</th>
                    <th className="py-2.5 px-4 text-right">Played</th>
                    <th className="py-2.5 px-4 text-right">W</th>
                    <th className="py-2.5 px-4 text-right">D</th>
                    <th className="py-2.5 px-4 text-right">L</th>
                    <th className="py-2.5 px-4 text-right">Score + / -</th>
                    <th className="py-2.5 px-4 text-right">Diff</th>
                    <th className="py-2.5 px-4 text-right font-bold text-slate-900">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leagueStandings.map((row, idx) => {
                    const team = teamMap.get(row.teamId);
                    return (
                      <tr key={row.teamId}>
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-700 tabular-nums">#{idx + 1}</td>
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900">{team?.team_name || row.teamId}</div>
                          {team?.institution && <div className="text-[11px] text-slate-500">{team.institution}</div>}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{row.played}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">{row.wins}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{row.draws}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-700">{row.losses}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {row.scoreFor}:{row.scoreAgainst}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {row.scoreDiff >= 0 ? `+${row.scoreDiff}` : row.scoreDiff}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-black text-slate-900 tabular-nums">
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Section 9: Disputes & Corrections (Dispute Resolution + Rewind & Remap Center)
// =============================================================================
export function DisputesAndCorrectionsSection({
  data,
  actorUserId,
  permissions,
  canResolveDisputes,
  canConfirmResults,
  canEditEsports,
  onEditMatch,
  onRefresh,
  onError,
}: SharedTabProps) {
  const { selectedGame, tournament, hasPersistedTournament, matches, disputes, allGameTeams, teamMap } = data;
  const brRules = useMemo(() => parseTournamentScoringRules(tournament, selectedGame), [tournament, selectedGame]);
  const teamNameById = useMemo(
    () => new Map(Array.from(teamMap.entries()).map(([id, team]) => [id, team.team_name])),
    [teamMap]
  );

  const gameMatchIds = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);
  const gameDisputes = useMemo(
    () => disputes.filter((d) => gameMatchIds.has(d.match_id)),
    [disputes, gameMatchIds]
  );

  // Dispute resolution modal state
  const [resolveTarget, setResolveTarget] = useState<{ dispute: MatchDispute; match: Match } | null>(null);
  const [resScoreA, setResScoreA] = useState(0);
  const [resScoreB, setResScoreB] = useState(0);
  const [resWinnerId, setResWinnerId] = useState("");
  const [resNotes, setResNotes] = useState("");
  const [resBrRows, setResBrRows] = useState<BattleRoyaleTeamResult[]>([]);
  const [resolving, setResolving] = useState(false);

  // Quick Rewind state
  const [undoTarget, setUndoTarget] = useState<Match | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [undoForceCascade, setUndoForceCascade] = useState(false);
  const [undoCascadeMsg, setUndoCascadeMsg] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);

  // Quick Team Remapper state
  const [remapMatchId, setRemapMatchId] = useState("");
  const [remapTeamAId, setRemapTeamAId] = useState("");
  const [remapTeamBId, setRemapTeamBId] = useState("");
  const [remapReason, setRemapReason] = useState("");
  const [remapping, setRemapping] = useState(false);

  const completedOrSubmitted = useMemo(
    () => matches.filter((m) => (m.status === "completed" || m.status === "result_submitted") && m.match_format !== "BYE"),
    [matches]
  );

  const remappableMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          !isCancelledBracketMatch(m) &&
          m.bracket_side !== "battle_royale" &&
          m.match_format !== "BYE" &&
          !["live", "result_submitted", "completed"].includes(m.status)
      ),
    [matches]
  );

  const openResolveModal = (d: MatchDispute) => {
    const m = matches.find((x) => x.id === d.match_id);
    if (!m) return;
    setResolveTarget({ dispute: d, match: m });
    setResScoreA(m.score_a ?? 0);
    setResScoreB(m.score_b ?? 0);
    setResWinnerId(m.winner_id || m.team_a_id || "");
    setResNotes("");
    setResBrRows(Array.isArray(m.br_results) ? m.br_results.map((r) => ({ ...r })) : []);
  };

  const handleResolveSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolveTarget || !canResolveDisputes) return;

    const { dispute, match } = resolveTarget;
    const isBr = match.bracket_side === "battle_royale" || (match.match_format || "").toUpperCase().includes("BR");
    let correctedWinner = resWinnerId;
    if (isBr && resBrRows.length > 0) {
      const top = [...resBrRows].sort((a, b) => (b.total_points || 0) - (a.total_points || 0))[0];
      correctedWinner = top?.team_id || correctedWinner;
    }

    const sim = resolveMatchDispute({
      matches,
      dispute,
      managerUserId: actorUserId,
      permissions,
      correctedScoreA: isBr ? 0 : resScoreA,
      correctedScoreB: isBr ? 0 : resScoreB,
      correctedWinnerId: correctedWinner,
      correctedBrResults: isBr ? resBrRows : undefined,
      resolutionNotes: resNotes,
    });
    if (!sim.ok) {
      onError(sim.error);
      return;
    }

    setResolving(true);
    try {
      const { error: dErr } = await supabase
        .from("match_disputes")
        .update({
          status: "resolved",
          resolution_notes: resNotes.trim(),
          resolved_by: actorUserId || null,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", dispute.id);
      if (dErr) throw dErr;

      // Unfreeze match first so RPC confirms & advances cleanly
      const { error: unfreezeErr } = await supabase
        .from("matches")
        .update({ status: "result_submitted", result_status: "submitted" })
        .eq("id", match.id);
      if (unfreezeErr) throw unfreezeErr;

      const rpcRes = await supabase.rpc("confirm_match_result_and_advance", {
        p_match_id: match.id,
        p_winner_id: correctedWinner || null,
        p_score_a: isBr ? 0 : Math.max(0, resScoreA),
        p_score_b: isBr ? 0 : Math.max(0, resScoreB),
        p_detailed_scores: match.detailed_scores || {},
        p_br_results: isBr ? resBrRows : null,
      });

      if (rpcRes.error) {
        const msg = rpcRes.error.message || "";
        if (msg.includes("Could not find the function") || rpcRes.error.code === "PGRST202") {
          await supabase
            .from("matches")
            .update({
              score_a: isBr ? 0 : resScoreA,
              score_b: isBr ? 0 : resScoreB,
              winner_id: correctedWinner || null,
              br_results: isBr ? resBrRows : match.br_results,
              status: "completed",
              result_status: "confirmed",
              confirmed_by: actorUserId || null,
              confirmed_at: new Date().toISOString(),
              bracket_advanced_at: new Date().toISOString(),
            })
            .eq("id", match.id);
          if (!isBr && match.next_match_id && correctedWinner) {
            const col = normalizeBracketSlot(match.next_match_slot) === "b" ? "team_b_id" : "team_a_id";
            await supabase.from("matches").update({ [col]: correctedWinner }).eq("id", match.next_match_id);
          }
        } else {
          throw rpcRes.error;
        }
      }

      setResolveTarget(null);
      await onRefresh(`Dispute resolved and ${match.match_code || match.round} finalized.`);
    } catch (err: any) {
      onError(formatMatchDatabaseError(err, "completed"));
    } finally {
      setResolving(false);
    }
  };

  const triggerUndo = (m: Match) => {
    const deps = findDependentDownstreamMatches(matches, m.id);
    setUndoTarget(m);
    setUndoReason("");
    setUndoForceCascade(false);
    setUndoCascadeMsg(
      deps.startedDownstream.length > 0
        ? `${deps.startedDownstream.length} downstream match(es) (${deps.startedDownstream
            .map((d) => d.match_code || d.round)
            .join(", ")}) already have activity/results.`
        : null
    );
  };

  const executeUndo = async (e: FormEvent) => {
    e.preventDefault();
    if (!undoTarget) return;
    const sim = undoMatchResultAndRewind({
      matches,
      matchId: undoTarget.id,
      managerUserId: actorUserId,
      permissions,
      reason: undoReason,
      forceCascade: undoForceCascade,
    });
    if (!sim.ok) {
      onError(sim.error);
      return;
    }

    setUndoing(true);
    try {
      const rpcRes = await supabase.rpc("undo_match_result_and_rewind", {
        p_match_id: undoTarget.id,
        p_reason: undoReason.trim(),
        p_force_cascade: undoForceCascade,
      });
      if (rpcRes.error) {
        const msg = rpcRes.error.message || "";
        if (msg.includes("Could not find the function") || rpcRes.error.code === "PGRST202") {
          for (const affId of sim.affectedMatchIds) {
            const row = sim.matches.find((x) => x.id === affId);
            if (!row) continue;
            await supabase
              .from("matches")
              .update({
                status: row.status,
                result_status: row.result_status,
                score_a: row.score_a,
                score_b: row.score_b,
                winner_id: row.winner_id,
                team_a_id: row.team_a_id,
                team_b_id: row.team_b_id,
                confirmed_by: null,
                confirmed_at: null,
                bracket_advanced_at: null,
              })
              .eq("id", row.id);
          }
          if (hasPersistedTournament && undoTarget.winner_id && tournament.champion_team_id === undoTarget.winner_id) {
            await supabase
              .from("tournaments")
              .update({ champion_team_id: null, status: "in_progress" })
              .eq("id", tournament.id);
          }
        } else {
          throw rpcRes.error;
        }
      } else if (rpcRes.data && rpcRes.data.ok === false) {
        throw new Error(rpcRes.data.error);
      }

      setUndoTarget(null);
      await onRefresh(`Successfully rewound ${undoTarget.match_code || undoTarget.round}.`);
    } catch (err: any) {
      onError(formatMatchDatabaseError(err));
    } finally {
      setUndoing(false);
    }
  };

  const handleSelectRemapMatch = (id: string) => {
    setRemapMatchId(id);
    const m = remappableMatches.find((x) => x.id === id);
    setRemapTeamAId(m?.team_a_id || "");
    setRemapTeamBId(m?.team_b_id || "");
    setRemapReason("");
  };

  const handleApplyRemap = async (e: FormEvent) => {
    e.preventDefault();
    if (!remapMatchId || !canEditEsports) return;
    const matchObj = remappableMatches.find((x) => x.id === remapMatchId);
    if (!matchObj) return;
    const res = reassignTeamsInMatch({
      matches,
      matchId: remapMatchId,
      teamAId: remapTeamAId || null,
      teamBId: remapTeamBId || null,
    });
    if (!res.ok) {
      onError(res.error);
      return;
    }
    if (remapReason.trim().length < 3) {
      onError("Enter an audit reason (min 3 characters) to remap teams.");
      return;
    }

    const nextA = remapTeamAId || null;
    const nextB = remapTeamBId || null;
    const changedA = nextA !== (matchObj.team_a_id || null);
    const changedB = nextB !== (matchObj.team_b_id || null);
    if (!changedA && !changedB) {
      onError("Change at least one team slot before applying.");
      return;
    }

    setRemapping(true);
    try {
      if (changedA) {
        const resA = await callReplaceEsportsFixtureTeamRpc({
          matchId: matchObj.id,
          slot: "a",
          expectedTeamId: matchObj.team_a_id,
          replacementTeamId: nextA,
          otherSlotTeamId: matchObj.team_b_id,
          reason: remapReason.trim(),
        });
        if (!resA.ok) {
          onError(resA.error || "Failed to remap Slot A.");
          return;
        }
      }
      if (changedB) {
        const resB = await callReplaceEsportsFixtureTeamRpc({
          matchId: matchObj.id,
          slot: "b",
          expectedTeamId: matchObj.team_b_id,
          replacementTeamId: nextB,
          otherSlotTeamId: changedA ? nextA : matchObj.team_a_id,
          reason: remapReason.trim(),
        });
        if (!resB.ok) {
          onError(resB.error || "Failed to remap Slot B.");
          return;
        }
      }
      setRemapMatchId("");
      setRemapReason("");
      await onRefresh("Remapped teams cleanly on unstarted match via replace_esports_fixture_team.");
    } finally {
      setRemapping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Active & Resolved Disputes */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-display font-bold text-slate-900 m-0">
            Disputes Queue ({gameDisputes.length})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 m-0">
            Disputed matches stay frozen in bracket progression until an Esports Manager logs corrected scores and resolution notes.
          </p>
        </div>

        {gameDisputes.length === 0 ? (
          <div className="p-8 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-500">
            No match disputes logged for {selectedGame?.title}.
          </div>
        ) : (
          <div className="space-y-3">
            {gameDisputes.map((d) => {
              const m = matches.find((x) => x.id === d.match_id);
              const tA = m ? teamMap.get(m.team_a_id || "") : null;
              const tB = m ? teamMap.get(m.team_b_id || "") : null;
              return (
                <div
                  key={d.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    d.status === "resolved" ? "bg-slate-50 border-slate-200" : "bg-rose-50/40 border-rose-200"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {m?.match_code || m?.round || "Match"}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                          d.status === "resolved"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-rose-50 text-rose-800 border-rose-200"
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900">
                      {m?.bracket_side === "battle_royale"
                        ? `${m.round} (BR Lobby)`
                        : m
                        ? `${resolveMatchSlotDisplay({ match: m, slot: "a", allMatches: matches, teamNameById }).label} vs ${resolveMatchSlotDisplay({ match: m, slot: "b", allMatches: matches, teamNameById }).label}`
                        : `${tA?.team_name || "TBD"} vs ${tB?.team_name || "TBD"}`}
                    </div>
                    <p className="text-xs text-slate-600 m-0">Reason: {d.reason}</p>
                    {d.resolution_notes && (
                      <p className="text-xs text-emerald-800 m-0">Resolution: {d.resolution_notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {m && onEditMatch && (
                      <button
                        type="button"
                        aria-label={`Edit Match ${m.match_code || m.round}`}
                        onClick={() => onEditMatch(m)}
                        className="min-h-[38px] px-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 size={12} />
                        <span>Edit Match</span>
                      </button>
                    )}
                    {d.status !== "resolved" && canResolveDisputes && (
                      <button
                        type="button"
                        onClick={() => openResolveModal(d)}
                        className="min-h-[38px] px-4 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold shrink-0 cursor-pointer"
                      >
                        Resolve &amp; Finalize
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 2. Rewind Confirmed / Submitted Results */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <RotateCcw size={15} className="text-amber-700" />
            <h3 className="text-sm font-display font-bold text-slate-900 m-0">
              Undo / Rewind Completed Results
            </h3>
          </div>
          <p className="text-xs text-slate-500 m-0">
            Safely reverse a mistaken confirmation. Clears winner/loser propagation downstream and detects dependent matches before cascading.
          </p>

          {completedOrSubmitted.length === 0 ? (
            <p className="text-xs text-slate-500 m-0">No completed or submitted matches to rewind yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {completedOrSubmitted.map((m) => {
                const tA = teamMap.get(m.team_a_id || "");
                const tB = teamMap.get(m.team_b_id || "");
                return (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-slate-900">
                        {m.match_code || m.round} · {MATCH_STATUS_LABELS[m.status]}
                      </div>
                      <div className="text-slate-600 truncate">
                        {m.bracket_side === "battle_royale"
                          ? m.round
                          : `${tA?.team_name || resolveMatchSlotDisplay({ match: m, slot: "a", allMatches: matches, teamNameById }).label} (${m.score_a}) vs ${tB?.team_name || resolveMatchSlotDisplay({ match: m, slot: "b", allMatches: matches, teamNameById }).label} (${m.score_b})`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onEditMatch && (
                        <button
                          type="button"
                          aria-label={`Edit Match ${m.match_code || m.round}`}
                          onClick={() => onEditMatch(m)}
                          className="h-8 px-2.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 font-semibold cursor-pointer"
                        >
                          Edit Match
                        </button>
                      )}
                      {canConfirmResults && (
                        <button
                          type="button"
                          onClick={() => triggerUndo(m)}
                          className="h-8 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold shrink-0 cursor-pointer"
                        >
                          Undo Result
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Unstarted Match Team Remapper */}
        <form onSubmit={handleApplyRemap} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={15} className="text-blue-700" />
            <h3 className="text-sm font-display font-bold text-slate-900 m-0">
              Unstarted Match Team Remapper
            </h3>
          </div>
          <p className="text-xs text-slate-500 m-0">
            Reassign squads on any unstarted H2H fixture via <code className="font-mono">replace_esports_fixture_team</code>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Unstarted Match</label>
            <select
              value={remapMatchId}
              onChange={(e) => handleSelectRemapMatch(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs"
            >
              <option value="">Choose match to remap...</option>
              {remappableMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.match_code || m.round} — {resolveMatchSlotDisplay({ match: m, slot: "a", allMatches: matches, teamNameById }).label} vs{" "}
                  {resolveMatchSlotDisplay({ match: m, slot: "b", allMatches: matches, teamNameById }).label}
                </option>
              ))}
            </select>
          </div>

          {remapMatchId && selectedGame && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <SearchableTeamSelect
                  id="remap-slot-a"
                  label="Team A Slot"
                  teams={allGameTeams}
                  gameId={selectedGame.id}
                  value={remapTeamAId || null}
                  onChange={(id) => setRemapTeamAId(id || "")}
                  allowTbd
                  tbdLabel="TBD (Empty Slot)"
                  excludeDisqualified
                  excludeTeamIds={remapTeamBId ? [remapTeamBId] : []}
                />
                <SearchableTeamSelect
                  id="remap-slot-b"
                  label="Team B Slot"
                  teams={allGameTeams}
                  gameId={selectedGame.id}
                  value={remapTeamBId || null}
                  onChange={(id) => setRemapTeamBId(id || "")}
                  allowTbd
                  tbdLabel="TBD (Empty Slot)"
                  excludeDisqualified
                  excludeTeamIds={remapTeamAId ? [remapTeamAId] : []}
                />
              </div>
              <div>
                <label htmlFor="remap-audit-reason" className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory Audit Reason *
                </label>
                <input
                  id="remap-audit-reason"
                  type="text"
                  required
                  value={remapReason}
                  onChange={(e) => setRemapReason(e.target.value)}
                  placeholder="e.g. Seeding remap after withdrawal"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!remapMatchId || remapping || !canEditEsports || remapReason.trim().length < 3}
              className="min-h-[38px] px-4 rounded-lg bg-[#0B1120] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
            >
              {remapping ? "Remapping..." : "Save Matchup Remap"}
            </button>
          </div>
        </form>
      </div>

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
            className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-display font-bold text-slate-900 m-0">
                Resolve Dispute — {resolveTarget.match.match_code || resolveTarget.match.round}
              </h3>
              <button type="button" onClick={() => setResolveTarget(null)} className="p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleResolveSubmit} className="space-y-4">
              {resolveTarget.match.bracket_side === "battle_royale" ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-mono uppercase text-slate-500">
                      <tr>
                        <th className="py-2 px-3">Squad</th>
                        <th className="py-2 px-3 w-20">Rank</th>
                        <th className="py-2 px-3 w-20">Kills</th>
                        <th className="py-2 px-3 text-right">Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {resBrRows.map((row) => (
                        <tr key={row.team_id}>
                          <td className="py-1.5 px-3 font-medium">{resolveLiveTeamName(row.team_id, row.team_name, teamMap)}</td>
                          <td className="py-1.5 px-3">
                            <input
                              type="number"
                              min={1}
                              value={row.placement ?? ""}
                              onChange={(e) => {
                                const pl = e.target.value ? Math.max(1, Number(e.target.value)) : null;
                                setResBrRows((prev) =>
                                  prev.map((x) => {
                                    if (x.team_id !== row.team_id) return x;
                                    const pp = pl ? brRules.placementPoints[pl] ?? 0 : 0;
                                    const kp = (x.kills || 0) * brRules.pointsPerKill;
                                    return { ...x, placement: pl, placement_points: pp, total_points: pp + kp };
                                  })
                                );
                              }}
                              className="w-16 h-8 px-2 rounded border border-slate-300 font-mono text-center"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="number"
                              min={0}
                              value={row.kills}
                              onChange={(e) => {
                                const kl = Math.max(0, Number(e.target.value) || 0);
                                setResBrRows((prev) =>
                                  prev.map((x) => {
                                    if (x.team_id !== row.team_id) return x;
                                    const pp = x.placement ? brRules.placementPoints[x.placement] ?? 0 : 0;
                                    const kp = kl * brRules.pointsPerKill;
                                    return { ...x, kills: kl, kill_points: kp, total_points: pp + kp };
                                  })
                                );
                              }}
                              className="w-16 h-8 px-2 rounded border border-slate-300 font-mono text-center"
                            />
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono font-bold">{row.total_points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {teamMap.get(resolveTarget.match.team_a_id || "")?.team_name || "Team A"} Score
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={resScoreA}
                      onChange={(e) => setResScoreA(Number(e.target.value) || 0)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {teamMap.get(resolveTarget.match.team_b_id || "")?.team_name || "Team B"} Score
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={resScoreB}
                      onChange={(e) => setResScoreB(Number(e.target.value) || 0)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Confirmed Winner</label>
                    <select
                      required
                      value={resWinnerId}
                      onChange={(e) => setResWinnerId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                    >
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
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory Resolution Notes *
                </label>
                <textarea
                  required
                  rows={3}
                  value={resNotes}
                  onChange={(e) => setResNotes(e.target.value)}
                  placeholder="Explain ruling & score verification..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResolveTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {resolving ? "Finalizing..." : "Resolve & Confirm Result"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Undo Modal */}
      {undoTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setUndoTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <h3 className="text-base font-display font-bold text-slate-900 m-0">
              Confirm Undo & Rewind — {undoTarget.match_code || undoTarget.round}
            </h3>
            {undoCascadeMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
                <p className="m-0 font-semibold">{undoCascadeMsg}</p>
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={undoForceCascade}
                    onChange={(e) => setUndoForceCascade(e.target.checked)}
                  />
                  <span>Cascade reset downstream matches too</span>
                </label>
              </div>
            )}
            <form onSubmit={executeUndo} className="space-y-3">
              <textarea
                required
                rows={3}
                value={undoReason}
                onChange={(e) => setUndoReason(e.target.value)}
                placeholder="Reason for rewinding this match result..."
                className="w-full p-2.5 rounded-lg border border-slate-300 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUndoTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={undoing || (Boolean(undoCascadeMsg) && !undoForceCascade)}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  {undoing ? "Rewinding..." : "Rewind Match"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Section 10: Tournament History (Audit Logs & Match Result History)
// =============================================================================
export function TournamentHistorySection({ data }: { data: EsportsWorkspaceSharedData }) {
  const { selectedGame, history, auditLogs, matches } = data;
  const gameMatchMap = useMemo(() => {
    const map = new Map<string, Match>();
    matches.forEach((m) => map.set(m.id, m));
    return map;
  }, [matches]);

  const timeline = useMemo(() => {
    const entries: {
      id: string;
      timestamp: string;
      source: "result_history" | "audit";
      action: string;
      actor: string;
      detail: string;
      matchCode?: string;
    }[] = [];

    for (const h of history) {
      if (h.game_id && h.game_id !== selectedGame?.id) continue;
      const m = gameMatchMap.get(h.match_id);
      entries.push({
        id: `hist-${h.id}`,
        timestamp: h.created_at,
        source: "result_history",
        action: h.action_type.replace(/_/g, " "),
        actor: h.actor_email || (h.actor_id ? `Staff ${h.actor_id.slice(0, 8)}` : "System"),
        detail: h.reason || "Official match state updated",
        matchCode: m?.match_code || m?.round || h.match_id.slice(0, 8),
      });
    }

    for (const a of auditLogs) {
      if (!["matches", "tournaments"].includes(a.entity_type)) continue;
      if (a.entity_type === "matches" && a.entity_id && !gameMatchMap.has(a.entity_id)) continue;
      entries.push({
        id: `audit-${a.id}`,
        timestamp: a.created_at,
        source: "audit",
        action: a.action.replace(/_/g, " "),
        actor: a.actor_id ? `Staff ${a.actor_id.slice(0, 8)}` : "System",
        detail: a.metadata ? JSON.stringify(a.metadata) : a.entity_type,
        matchCode: a.entity_id ? gameMatchMap.get(a.entity_id)?.match_code || a.entity_id.slice(0, 8) : undefined,
      });
    }

    return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 80);
  }, [history, auditLogs, selectedGame?.id, gameMatchMap]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-display font-bold text-slate-900 m-0">
            Tournament History & Audit Trail — {selectedGame?.title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 m-0">
            Permanent chronological log of confirmations, rewinds, bracket changes, and schedule actions.
          </p>
        </div>
        <span className="font-mono text-xs text-slate-500">{timeline.length} entries</span>
      </div>

      {timeline.length === 0 ? (
        <div className="p-10 text-center">
          <History size={28} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-semibold text-slate-800 m-0">No History Recorded Yet</p>
          <p className="text-xs text-slate-500 mt-1 m-0">
            Match confirmations, result rewinds, and tournament actions will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {timeline.map((item) => (
            <div key={item.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-mono text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                      item.source === "result_history"
                        ? "bg-blue-50 text-blue-800 border-blue-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {item.action}
                  </span>
                  {item.matchCode && (
                    <span className="font-mono font-bold text-slate-900">{item.matchCode}</span>
                  )}
                  <span className="text-slate-400">· {item.actor}</span>
                </div>
                <p className="text-slate-600 m-0 truncate">{item.detail}</p>
              </div>
              <div className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                {formatIstDateTime(item.timestamp)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
