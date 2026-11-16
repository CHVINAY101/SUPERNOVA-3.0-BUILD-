import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import {
  confirmAndAdvanceMatchResult,
  escalateMatchDispute,
  findDependentDownstreamMatches,
  getGameCodePrefix,
  undoMatchResultAndRewind,
} from "@/lib/tournamentEngine";
import {
  ALL_MATCH_STATUS_OPTIONS,
  buildMatchInsertPayload,
  formatMatchDatabaseError,
  INITIAL_MATCH_STATUS_OPTIONS,
  MATCH_STATUS_LABELS,
  validateCreateMatchInput,
} from "@/lib/matchOperations";
import {
  detectScheduleConflicts,
  formatIstDateTime,
  isMatchScheduled,
  istInputsToIso,
} from "@/lib/scheduling";
import { toUuidOrNull } from "@/lib/entryOperations";
import type { PermissionKey } from "@/lib/rbac";
import {
  isBattleRoyaleTournament,
  parseTournamentScoringRules,
  type EsportsSectionId,
  type EsportsWorkspaceSharedData,
} from "./types";
import type { BattleRoyaleTeamResult, Match, MatchStatus } from "@/types/database";
import {
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  EyeOff,
  Megaphone,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Trophy,
  X,
} from "lucide-react";

interface SharedControlProps {
  data: EsportsWorkspaceSharedData;
  actorUserId: string;
  actorEmail: string;
  permissions: Set<PermissionKey>;
  canCreateMatch: boolean;
  canEditEsports: boolean;
  canAssignConductors: boolean;
  canConfirmResults: boolean;
  canBroadcast?: boolean;
  onRefresh: (msg?: string) => Promise<void>;
  onError: (msg: string) => void;
  onNavigate: (sec: EsportsSectionId) => void;
}

function getStatusBadgeClass(status: MatchStatus): string {
  switch (status) {
    case "live":
      return "bg-orange-50 text-orange-800 border-orange-200";
    case "result_submitted":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "completed":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "disputed":
      return "bg-rose-50 text-rose-800 border-rose-200";
    case "scheduled":
    case "check_in":
    case "ready":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "postponed":
    case "cancelled":
      return "bg-slate-100 text-slate-500 border-slate-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function isBrMatch(m: Match): boolean {
  return m.bracket_side === "battle_royale" || (m.match_format || "").toUpperCase().includes("BR");
}

export function MatchesControlSection({
  data,
  actorUserId,
  actorEmail,
  permissions,
  canCreateMatch,
  canEditEsports,
  canAssignConductors,
  canConfirmResults,
  onRefresh,
  onError,
  onNavigate,
}: SharedControlProps) {
  const { selectedGame, tournament, hasPersistedTournament, matches, allMatches, selectedTeams, approvedTeams, conductors, teamMap } = data;
  const brRules = useMemo(() => parseTournamentScoringRules(tournament, selectedGame), [tournament, selectedGame]);
  const gameIsBr = isBattleRoyaleTournament(tournament, selectedGame);

  // Filters
  const [roundFilter, setRoundFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Selected match detail / result modal
  const [controlMatch, setControlMatch] = useState<Match | null>(null);
  const [editScoreA, setEditScoreA] = useState(0);
  const [editScoreB, setEditScoreB] = useState(0);
  const [editWinnerId, setEditWinnerId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editBrRows, setEditBrRows] = useState<BattleRoyaleTeamResult[]>([]);
  const [savingControl, setSavingControl] = useState(false);

  // Undo / Rewind modal
  const [undoTarget, setUndoTarget] = useState<Match | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [undoForceCascade, setUndoForceCascade] = useState(false);
  const [undoCascadeWarning, setUndoCascadeWarning] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);

  // Dispute modal
  const [disputeTarget, setDisputeTarget] = useState<Match | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [reportingDispute, setReportingDispute] = useState(false);

  // Add Match Modal
  const [addOpen, setAddOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newRound, setNewRound] = useState("Round 1");
  const [newRoundNum, setNewRoundNum] = useState(1);
  const [newMatchNum, setNewMatchNum] = useState(1);
  const [newIsBr, setNewIsBr] = useState(gameIsBr);
  const [newTeamAId, setNewTeamAId] = useState("");
  const [newTeamBId, setNewTeamBId] = useState("");
  const [newBrTeamIds, setNewBrTeamIds] = useState<string[]>([]);
  const [newScheduleNow, setNewScheduleNow] = useState(false);
  const [newDate, setNewDate] = useState(tournament.start_date || "2026-11-20");
  const [newTime, setNewTime] = useState("10:00");
  const [newDuration, setNewDuration] = useState(selectedGame?.match_duration_minutes || 30);
  const [newArena, setNewArena] = useState("Main Arena Stage");
  const [newConductorId, setNewConductorId] = useState("");
  const [newFormat, setNewFormat] = useState(gameIsBr ? "BR Lobby" : brRules.bestOf || "BO1");
  const [newStatus, setNewStatus] = useState<MatchStatus>("upcoming");
  const [newPublished, setNewPublished] = useState(true);
  const [newNotes, setNewNotes] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [creatingMatch, setCreatingMatch] = useState(false);

  const eligibleTeams = selectedTeams.length > 0 ? selectedTeams : approvedTeams;

  useEffect(() => {
    setNewIsBr(gameIsBr);
    setNewFormat(gameIsBr ? "BR Lobby" : brRules.bestOf || "BO1");
    setNewDuration(selectedGame?.match_duration_minutes || 30);
  }, [selectedGame?.id, gameIsBr, brRules.bestOf]);

  const roundOptions = useMemo(() => {
    const s = new Set<string>();
    matches.forEach((m) => m.round && s.add(m.round));
    return Array.from(s);
  }, [matches]);

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return matches.filter((m) => {
      if (roundFilter !== "all" && m.round !== roundFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (q) {
        const code = (m.match_code || "").toLowerCase();
        const tA = (teamMap.get(m.team_a_id || "")?.team_name || "").toLowerCase();
        const tB = (teamMap.get(m.team_b_id || "")?.team_name || "").toLowerCase();
        const rnd = (m.round || "").toLowerCase();
        if (!code.includes(q) && !tA.includes(q) && !tB.includes(q) && !rnd.includes(q)) return false;
      }
      return true;
    });
  }, [matches, roundFilter, statusFilter, searchQuery, teamMap]);

  const openControlModal = (m: Match) => {
    setControlMatch(m);
    setEditScoreA(m.score_a ?? 0);
    setEditScoreB(m.score_b ?? 0);
    setEditWinnerId(m.winner_id || "");
    setEditNotes(m.notes || "");

    if (isBrMatch(m)) {
      const existing = Array.isArray(m.br_results) && m.br_results.length > 0
        ? m.br_results
        : eligibleTeams.map((t) => ({
            team_id: t.id,
            team_name: t.team_name,
            registration_ref: t.registration_ref,
            institution: t.institution,
            placement: null,
            kills: 0,
            placement_points: 0,
            kill_points: 0,
            total_points: 0,
          }));
      setEditBrRows(existing.map((r) => ({ ...r })));
    } else {
      setEditBrRows([]);
    }
  };

  const updateBrRowField = (teamId: string, field: "placement" | "kills", rawValue: string) => {
    setEditBrRows((prev) =>
      prev.map((row) => {
        if (row.team_id !== teamId) return row;
        const val = rawValue.trim() === "" ? null : Math.max(0, Math.trunc(Number(rawValue) || 0));
        const nextPlacement = field === "placement" ? (val && val >= 1 ? val : null) : row.placement ?? null;
        const nextKills = field === "kills" ? Math.max(0, val ?? 0) : Math.max(0, row.kills || 0);
        const placementPts = nextPlacement ? brRules.placementPoints[nextPlacement] ?? 0 : 0;
        const killPts = nextKills * brRules.pointsPerKill;
        return {
          ...row,
          placement: nextPlacement,
          kills: nextKills,
          placement_points: placementPts,
          kill_points: killPts,
          total_points: placementPts + killPts,
        };
      })
    );
  };

  const handleQuickStatus = async (m: Match, nextStatus: MatchStatus) => {
    if (!canEditEsports && !canConfirmResults) return;
    setBusyId(m.id);
    try {
      const { error } = await supabase.from("matches").update({ status: nextStatus }).eq("id", m.id);
      if (error) throw error;
      if (controlMatch?.id === m.id) {
        setControlMatch({ ...controlMatch, status: nextStatus });
      }
      await onRefresh(`Updated ${m.match_code || m.round} status to ${MATCH_STATUS_LABELS[nextStatus]}.`);
    } catch (err: any) {
      onError(formatMatchDatabaseError(err, nextStatus));
    } finally {
      setBusyId(null);
    }
  };

  const handleAssignConductor = async (m: Match, nextConductorId: string) => {
    if (!canAssignConductors) return;
    const safeCid = toUuidOrNull(nextConductorId);
    const condObj = conductors.find((c) => c.user_id === safeCid);
    setBusyId(m.id);
    try {
      const { error } = await supabase
        .from("matches")
        .update({
          conductor_id: safeCid,
          conductor_email: safeCid ? condObj?.email || null : null,
        })
        .eq("id", m.id);
      if (error) throw error;
      await onRefresh(
        safeCid ? `Assigned ${condObj?.full_name || condObj?.email} to ${m.match_code || m.round}.` : "Cleared match conductor."
      );
    } catch (err: any) {
      onError(formatMatchDatabaseError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleTogglePublished = async (m: Match) => {
    if (!canEditEsports && !canConfirmResults) return;
    setBusyId(m.id);
    try {
      const { error } = await supabase
        .from("matches")
        .update({ is_published: !m.is_published })
        .eq("id", m.id);
      if (error) throw error;
      await onRefresh(`${m.match_code || m.round} is now ${!m.is_published ? "published to Live Board" : "hidden from Live Board"}.`);
    } catch (err: any) {
      onError(formatMatchDatabaseError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveDraftScores = async () => {
    if (!controlMatch) return;
    const isBr = isBrMatch(controlMatch);
    let computedWinner = editWinnerId || null;
    if (!isBr && !computedWinner) {
      if (editScoreA > editScoreB && controlMatch.team_a_id) computedWinner = controlMatch.team_a_id;
      else if (editScoreB > editScoreA && controlMatch.team_b_id) computedWinner = controlMatch.team_b_id;
    } else if (isBr) {
      const top = [...editBrRows].sort((a, b) => (b.total_points || 0) - (a.total_points || 0))[0];
      computedWinner = top?.team_id || null;
    }

    setSavingControl(true);
    try {
      const updatePayload: Record<string, any> = {
        score_a: isBr ? 0 : Math.max(0, editScoreA),
        score_b: isBr ? 0 : Math.max(0, editScoreB),
        winner_id: computedWinner,
        notes: editNotes.trim() || null,
        status: controlMatch.status === "completed" ? "completed" : "result_submitted",
        result_status: controlMatch.status === "completed" ? "confirmed" : "submitted",
        submitted_by: actorUserId || null,
        submitted_at: new Date().toISOString(),
      };
      if (isBr) {
        updatePayload.br_results = editBrRows;
      }
      const { error } = await supabase.from("matches").update(updatePayload).eq("id", controlMatch.id);
      if (error) throw error;

      setControlMatch(null);
      await onRefresh(`Saved result draft for ${controlMatch.match_code || controlMatch.round}.`);
    } catch (err: any) {
      onError(formatMatchDatabaseError(err, "result_submitted"));
    } finally {
      setSavingControl(false);
    }
  };

  const handleConfirmAndAdvance = async (targetMatch: Match, overrideBr?: BattleRoyaleTeamResult[]) => {
    if (!canConfirmResults) return;
    const isBr = isBrMatch(targetMatch);
    const brPayload = isBr
      ? overrideBr || (controlMatch?.id === targetMatch.id ? editBrRows : targetMatch.br_results || [])
      : null;

    let scoreA = controlMatch?.id === targetMatch.id ? editScoreA : targetMatch.score_a;
    let scoreB = controlMatch?.id === targetMatch.id ? editScoreB : targetMatch.score_b;
    let winnerId = controlMatch?.id === targetMatch.id ? editWinnerId || targetMatch.winner_id : targetMatch.winner_id;

    if (!isBr && !winnerId) {
      if (scoreA > scoreB && targetMatch.team_a_id) winnerId = targetMatch.team_a_id;
      else if (scoreB > scoreA && targetMatch.team_b_id) winnerId = targetMatch.team_b_id;
    }
    if (isBr && brPayload && brPayload.length > 0) {
      const top = [...brPayload].sort((a, b) => (b.total_points || 0) - (a.total_points || 0))[0];
      winnerId = top?.team_id || null;
      scoreA = 0;
      scoreB = 0;
    }

    const engineCheck = confirmAndAdvanceMatchResult({
      matches,
      matchId: targetMatch.id,
      managerUserId: actorUserId,
      permissions,
      overrideScoreA: scoreA,
      overrideScoreB: scoreB,
      overrideWinnerId: winnerId || null,
      overrideBrResults: brPayload || undefined,
    });
    if (!engineCheck.ok) {
      onError(engineCheck.error);
      return;
    }

    setSavingControl(true);
    try {
      const rpcRes = await supabase.rpc("confirm_match_result_and_advance", {
        p_match_id: targetMatch.id,
        p_winner_id: winnerId || null,
        p_score_a: Math.max(0, scoreA),
        p_score_b: Math.max(0, scoreB),
        p_detailed_scores: targetMatch.detailed_scores || {},
        p_br_results: isBr ? brPayload : null,
      });

      if (rpcRes.error) {
        const msg = rpcRes.error.message || "";
        // Fallback for environments where 6-arg migration isn't applied yet
        if (msg.includes("Could not find the function") || rpcRes.error.code === "PGRST202") {
          const updatedSelf = engineCheck.matches.find((m) => m.id === targetMatch.id)!;
          const { error: updErr } = await supabase
            .from("matches")
            .update({
              score_a: updatedSelf.score_a,
              score_b: updatedSelf.score_b,
              winner_id: updatedSelf.winner_id,
              br_results: updatedSelf.br_results,
              status: "completed",
              result_status: "confirmed",
              confirmed_by: actorUserId || null,
              confirmed_at: updatedSelf.confirmed_at,
              bracket_advanced_at: updatedSelf.bracket_advanced_at,
            })
            .eq("id", targetMatch.id);
          if (updErr) throw updErr;

          if (!isBr && targetMatch.next_match_id && winnerId) {
            const slotCol = targetMatch.next_match_slot === "b" ? "team_b_id" : "team_a_id";
            await supabase.from("matches").update({ [slotCol]: winnerId }).eq("id", targetMatch.next_match_id);
          }
          if (!isBr && targetMatch.loser_next_match_id && winnerId) {
            const loserId = winnerId === targetMatch.team_a_id ? targetMatch.team_b_id : targetMatch.team_a_id;
            if (loserId) {
              const lSlotCol = targetMatch.loser_next_match_slot === "b" ? "team_b_id" : "team_a_id";
              await supabase.from("matches").update({ [lSlotCol]: loserId }).eq("id", targetMatch.loser_next_match_id);
            }
          }
          if (isBr && hasPersistedTournament) {
            const simulated = engineCheck.matches;
            const remainingOpen = simulated.some(
              (x) => x.status !== "completed" && x.status !== "cancelled" && x.match_format !== "BYE"
            );
            if (!remainingOpen) {
              const totals = new Map<string, { pts: number; wins: number; kills: number }>();
              for (const mm of simulated) {
                if (mm.status !== "completed" || !Array.isArray(mm.br_results)) continue;
                for (const row of mm.br_results) {
                  if (!row.team_id) continue;
                  const cur = totals.get(row.team_id) || { pts: 0, wins: 0, kills: 0 };
                  cur.pts += row.total_points || 0;
                  if (row.placement === 1) cur.wins += 1;
                  cur.kills += row.kills || 0;
                  totals.set(row.team_id, cur);
                }
              }
              const best = Array.from(totals.entries()).sort((a, b) => {
                if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
                if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
                return b[1].kills - a[1].kills;
              })[0];
              if (best?.[0]) {
                await supabase
                  .from("tournaments")
                  .update({ champion_team_id: best[0], status: "completed" })
                  .eq("id", tournament.id);
              }
            }
          }
          if (
            !isBr &&
            hasPersistedTournament &&
            !targetMatch.next_match_id &&
            (targetMatch.bracket_side === "grand_final" || (targetMatch.round || "").toLowerCase().includes("final")) &&
            winnerId
          ) {
            await supabase
              .from("tournaments")
              .update({ champion_team_id: winnerId, status: "completed" })
              .eq("id", tournament.id);
          }
        } else {
          throw rpcRes.error;
        }
      } else if (rpcRes.data && rpcRes.data.ok === false) {
        throw new Error(rpcRes.data.error || "Result confirmation failed.");
      }

      setControlMatch(null);
      await onRefresh(
        isBr
          ? `Confirmed ${targetMatch.match_code || targetMatch.round} Battle Royale standings.`
          : `Confirmed ${targetMatch.match_code || targetMatch.round} and advanced winner cleanly.`
      );
    } catch (err: any) {
      onError(formatMatchDatabaseError(err, "completed"));
    } finally {
      setSavingControl(false);
    }
  };

  const openUndoModal = (m: Match) => {
    const deps = findDependentDownstreamMatches(matches, m.id);
    setUndoTarget(m);
    setUndoReason("");
    setUndoForceCascade(false);
    if (deps.startedDownstream.length > 0) {
      setUndoCascadeWarning(
        `Warning: ${deps.startedDownstream.length} downstream match(es) (${deps.startedDownstream
          .map((d) => d.match_code || d.round)
          .join(", ")}) already have activity or results.`
      );
    } else {
      setUndoCascadeWarning(null);
    }
  };

  const handleConfirmUndo = async (e: FormEvent) => {
    e.preventDefault();
    if (!undoTarget) return;
    if (undoReason.trim().length < 4) {
      onError("Please provide a clear reason (min 4 characters) to undo this match result.");
      return;
    }

    const sim = undoMatchResultAndRewind({
      matches,
      matchId: undoTarget.id,
      managerUserId: actorUserId,
      permissions,
      reason: undoReason.trim(),
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
            const { error: uErr } = await supabase
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
            if (uErr) throw uErr;
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
        throw new Error(rpcRes.data.error || "Undo rewind rejected.");
      }

      setUndoTarget(null);
      setControlMatch(null);
      await onRefresh(`Rewound ${undoTarget.match_code || undoTarget.round} and cleared downstream progression.`);
    } catch (err: any) {
      onError(formatMatchDatabaseError(err));
    } finally {
      setUndoing(false);
    }
  };

  const handleSubmitDispute = async (e: FormEvent) => {
    e.preventDefault();
    if (!disputeTarget) return;
    const esc = escalateMatchDispute({
      match: disputeTarget,
      reporterUserId: actorUserId,
      reason: disputeReason.trim(),
    });
    if (!esc.ok) {
      onError(esc.error);
      return;
    }

    setReportingDispute(true);
    try {
      const { error: dErr } = await supabase.from("match_disputes").insert({
        match_id: disputeTarget.id,
        reported_by: actorUserId || null,
        reported_by_email: actorEmail,
        reason: disputeReason.trim(),
        original_submission: esc.dispute.original_submission,
        status: "open",
      });
      if (dErr) throw dErr;

      const { error: mErr } = await supabase
        .from("matches")
        .update({ status: "disputed", result_status: "disputed" })
        .eq("id", disputeTarget.id);
      if (mErr) throw mErr;

      setDisputeTarget(null);
      setDisputeReason("");
      setControlMatch(null);
      await onRefresh(`Dispute logged for ${disputeTarget.match_code || disputeTarget.round}. Progression frozen.`);
    } catch (err: any) {
      onError(formatMatchDatabaseError(err, "disputed"));
    } finally {
      setReportingDispute(false);
    }
  };

  const openAddModal = () => {
    const prefix = getGameCodePrefix(selectedGame?.title);
    const nextNum = matches.length + 1;
    setNewCode(`${prefix}-M${String(nextNum).padStart(2, "0")}`);
    setNewRound(gameIsBr ? `Match ${nextNum} (Lobby Points)` : "Bracket Match");
    setNewRoundNum(1);
    setNewMatchNum(nextNum);
    setNewIsBr(gameIsBr);
    setNewTeamAId(eligibleTeams[0]?.id || "");
    setNewTeamBId(eligibleTeams[1]?.id || "");
    setNewBrTeamIds(eligibleTeams.map((t) => t.id));
    setNewScheduleNow(false);
    setNewStatus("upcoming");
    setNewFormat(gameIsBr ? "BR Lobby" : brRules.bestOf || "BO1");
    setNewNotes("");
    setAddError(null);
    setAddOpen(true);
  };

  const handleCreateMatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedGame || !canCreateMatch) return;
    setAddError(null);

    const scheduledIso = newScheduleNow ? istInputsToIso(newDate, newTime) : null;
    if (newScheduleNow && !scheduledIso) {
      setAddError("Enter a valid IST start date and time.");
      return;
    }

    const brPayloadRows: BattleRoyaleTeamResult[] = newIsBr
      ? newBrTeamIds
          .map((id) => teamMap.get(id))
          .filter(Boolean)
          .map((t) => ({
            team_id: t!.id,
            team_name: t!.team_name,
            registration_ref: t!.registration_ref,
            institution: t!.institution,
            placement: null,
            kills: 0,
            placement_points: 0,
            kill_points: 0,
            total_points: 0,
          }))
      : [];

    const formInput = {
      gameId: selectedGame.id,
      tournamentId: hasPersistedTournament ? tournament.id : null,
      matchCode: newCode.trim() || undefined,
      roundName: newRound,
      roundNumber: newRoundNum,
      matchNumber: newMatchNum,
      bracketSide: (newIsBr ? "battle_royale" : "winners") as Match["bracket_side"],
      teamAId: newIsBr ? null : newTeamAId,
      teamBId: newIsBr ? null : newTeamBId,
      brResults: newIsBr ? brPayloadRows : undefined,
      scheduledStart: scheduledIso,
      durationMinutes: newDuration,
      isScheduled: newScheduleNow,
      station: newArena,
      conductorId: newConductorId || undefined,
      conductorEmail: conductors.find((c) => c.user_id === newConductorId)?.email || null,
      matchFormat: newFormat,
      status: newScheduleNow && newStatus === "upcoming" ? ("scheduled" as MatchStatus) : newStatus,
      isPublished: newPublished,
      notes: newNotes,
    };

    const valid = validateCreateMatchInput(formInput);
    if (!valid.ok) {
      setAddError(valid.error);
      return;
    }

    if (scheduledIso) {
      const conflicts = detectScheduleConflicts(
        {
          matchId: "new-match",
          startIso: scheduledIso,
          durationMinutes: newDuration,
          teamAId: newIsBr ? null : newTeamAId,
          teamBId: newIsBr ? null : newTeamBId,
          brTeamIds: brPayloadRows.map((r) => r.team_id),
          conductorId: toUuidOrNull(newConductorId),
          station: newArena,
        },
        allMatches
      );
      if (conflicts.hasBlockingConflict) {
        const first = conflicts.teamConflicts[0];
        const firstTeamId = first.overlappingTeamIds?.[0] || "";
        const conflictTeamName = teamMap.get(firstTeamId)?.team_name || "Selected team";
        setAddError(`${conflictTeamName}: ${first.reason}`);
        return;
      }
    }

    setCreatingMatch(true);
    try {
      const payload = buildMatchInsertPayload(formInput);
      const { error } = await supabase.from("matches").insert(payload);
      if (error) throw error;
      setAddOpen(false);
      await onRefresh(`Created ${newCode || newRound} in ${selectedGame.title}.`);
    } catch (err: any) {
      setAddError(formatMatchDatabaseError(err, formInput.status));
    } finally {
      setCreatingMatch(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-display font-bold text-slate-900 m-0">
              Matches & Confirmations — {selectedGame?.title}
            </h2>
            <p className="text-xs text-slate-500 mt-1 m-0">
              Control every fixture, assign conductors, record H2H or Battle Royale lobby scores, confirm & advance brackets, or rewind errors.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate("schedule")}
              className="min-h-[38px] px-3 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarClock size={14} />
              <span>Open IST Scheduler</span>
            </button>
            {canCreateMatch && (
              <button
                type="button"
                onClick={openAddModal}
                className="min-h-[38px] px-4 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Match</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, team, round..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-xs"
            />
          </div>
          <select
            value={roundFilter}
            onChange={(e) => setRoundFilter(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium"
          >
            <option value="all">All Rounds</option>
            {roundOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium"
          >
            <option value="all">All Statuses</option>
            {ALL_MATCH_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Matches Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredMatches.length === 0 ? (
          <div className="p-12 text-center">
            <Trophy size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-800 m-0">No Matches Found</p>
            <p className="text-xs text-slate-500 mt-1 m-0">
              Generate fixtures in Bracket Builder or click Add Match to create an individual match or BR lobby.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono font-semibold uppercase text-slate-500">
                  <th className="py-2.5 px-4">Code / Round</th>
                  <th className="py-2.5 px-4">Matchup / Lobby</th>
                  <th className="py-2.5 px-4">IST Schedule</th>
                  <th className="py-2.5 px-4">Conductor</th>
                  <th className="py-2.5 px-4 text-center">Score</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredMatches.map((m) => {
                  const isBr = isBrMatch(m);
                  const isBye = m.match_format === "BYE";
                  const tA = teamMap.get(m.team_a_id || "");
                  const tB = teamMap.get(m.team_b_id || "");
                  const winner = teamMap.get(m.winner_id || "");
                  const brCount = Array.isArray(m.br_results) ? m.br_results.length : 0;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 align-top">
                        <div className="font-mono font-bold text-slate-900">
                          {m.match_code || `M-${m.match_number ?? 1}`}
                        </div>
                        <div className="text-[11px] text-slate-500">{m.round}</div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        {isBr ? (
                          <div>
                            <div className="font-semibold text-slate-900">
                              {m.group_name ? `${m.group_name} · ` : ""}Battle Royale Lobby ({brCount || eligibleTeams.length} squads)
                            </div>
                            {winner && (
                              <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                                Lobby Leader: {winner.team_name}
                              </div>
                            )}
                          </div>
                        ) : isBye ? (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-900">{tA?.team_name || "TBD"}</span>{" "}
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              AUTO BYE
                            </span>
                          </div>
                        ) : (
                          <div>
                            <div className="font-semibold text-slate-900">
                              <span className={m.winner_id === m.team_a_id ? "text-emerald-700" : ""}>
                                {tA?.team_name || "TBD"}
                              </span>{" "}
                              <span className="text-slate-400 font-normal">vs</span>{" "}
                              <span className={m.winner_id === m.team_b_id ? "text-emerald-700" : ""}>
                                {tB?.team_name || "TBD"}
                              </span>
                            </div>
                            {m.station && (
                              <div className="text-[11px] text-slate-500 mt-0.5">{m.station}</div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top font-mono text-[11px] tabular-nums">
                        {isMatchScheduled(m) ? (
                          <span className="text-slate-800">{formatIstDateTime(m.scheduled_start)}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onNavigate("schedule")}
                            className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded hover:bg-amber-100 cursor-pointer"
                          >
                            Unscheduled
                          </button>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top">
                        {canAssignConductors && !isBye ? (
                          <select
                            disabled={busyId === m.id}
                            value={m.conductor_id || ""}
                            onChange={(e) => handleAssignConductor(m, e.target.value)}
                            className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-[11px] max-w-[155px]"
                          >
                            <option value="">Unassigned</option>
                            {conductors.map((c) => (
                              <option key={c.user_id} value={c.user_id}>
                                {c.full_name || c.email}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[11px] text-slate-500">{m.conductor_email || "—"}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top text-center font-mono font-bold tabular-nums text-slate-900">
                        {isBr ? (
                          <span className="text-[11px] text-slate-600">
                            {m.status === "completed" || m.status === "result_submitted" ? "Scored" : "—"}
                          </span>
                        ) : (
                          <span>
                            {m.score_a} : {m.score_b}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top">
                        <span
                          className={`inline-block text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded border ${getStatusBadgeClass(
                            m.status
                          )}`}
                        >
                          {MATCH_STATUS_LABELS[m.status] || m.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleTogglePublished(m)}
                            disabled={busyId === m.id}
                            title={m.is_published ? "Visible on Public Live Board" : "Hidden from Public Live Board"}
                            className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center justify-center text-slate-600 cursor-pointer"
                          >
                            {m.is_published ? <Eye size={13} /> : <EyeOff size={13} className="text-slate-400" />}
                          </button>

                          {!isBye && (
                            <button
                              type="button"
                              onClick={() => openControlModal(m)}
                              className="h-8 px-2.5 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <SlidersHorizontal size={12} />
                              <span>Manage</span>
                            </button>
                          )}

                          {canConfirmResults && m.status === "result_submitted" && (
                            <button
                              type="button"
                              disabled={savingControl}
                              onClick={() => handleConfirmAndAdvance(m)}
                              className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Confirm
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed Match Control Modal */}
      {controlMatch && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto"
          onClick={() => setControlMatch(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                    {controlMatch.match_code || controlMatch.round}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded border ${getStatusBadgeClass(
                      controlMatch.status
                    )}`}
                  >
                    {MATCH_STATUS_LABELS[controlMatch.status]}
                  </span>
                  {(controlMatch.undo_count ?? 0) > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                      Rewound {controlMatch.undo_count}x
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-display font-bold text-slate-900 mt-2 mb-0">
                  {isBrMatch(controlMatch)
                    ? `${controlMatch.round} — Battle Royale Lobby Control`
                    : `${teamMap.get(controlMatch.team_a_id || "")?.team_name || "TBD"} vs ${
                        teamMap.get(controlMatch.team_b_id || "")?.team_name || "TBD"
                      }`}
                </h3>
                <p className="text-xs text-slate-500 mt-1 m-0 font-mono">
                  {selectedGame?.title} · {controlMatch.round} ·{" "}
                  {isMatchScheduled(controlMatch)
                    ? formatIstDateTime(controlMatch.scheduled_start)
                    : "Unscheduled"}{" "}
                  {controlMatch.station ? `· ${controlMatch.station}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setControlMatch(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Status & Lifecycle Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(["scheduled", "check_in", "ready", "live", "postponed", "cancelled"] as MatchStatus[]).map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={busyId === controlMatch.id || controlMatch.status === "completed"}
                      onClick={() => handleQuickStatus(controlMatch, st)}
                      className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold border cursor-pointer disabled:opacity-40 ${
                        controlMatch.status === st
                          ? "bg-[#0B1120] text-white border-[#0B1120]"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {MATCH_STATUS_LABELS[st]}
                    </button>
                  )
                )}
              </div>

              <div className="flex items-center gap-2">
                {controlMatch.status !== "disputed" && (
                  <button
                    type="button"
                    onClick={() => {
                      setDisputeTarget(controlMatch);
                      setDisputeReason("");
                    }}
                    className="h-8 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <AlertOctagon size={12} />
                    <span>Flag Dispute</span>
                  </button>
                )}

                {(controlMatch.status === "completed" || controlMatch.status === "result_submitted") && (
                  <button
                    type="button"
                    onClick={() => openUndoModal(controlMatch)}
                    className="h-8 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>Undo Result</span>
                  </button>
                )}
              </div>
            </div>

            {/* Score Entry Section */}
            {isBrMatch(controlMatch) ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono font-bold uppercase text-slate-700 m-0">
                    Lobby Placement & Kills Matrix (Kill = {brRules.pointsPerKill} pt)
                  </h4>
                  <span className="text-[11px] font-mono text-slate-500">
                    #1: {brRules.placementPoints[1] ?? 15}pts · #2: {brRules.placementPoints[2] ?? 12}pts · #3:{" "}
                    {brRules.placementPoints[3] ?? 10}pts
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[320px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-mono uppercase text-slate-500 sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Squad</th>
                        <th className="py-2 px-3 w-24">Placement</th>
                        <th className="py-2 px-3 w-24">Kills</th>
                        <th className="py-2 px-3 text-right">Place Pts</th>
                        <th className="py-2 px-3 text-right">Kill Pts</th>
                        <th className="py-2 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {editBrRows.map((row) => (
                        <tr key={row.team_id}>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {row.team_name || teamMap.get(row.team_id)?.team_name || row.team_id}
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="number"
                              min={1}
                              max={32}
                              disabled={controlMatch.status === "completed"}
                              value={row.placement ?? ""}
                              placeholder="—"
                              onChange={(e) => updateBrRowField(row.team_id, "placement", e.target.value)}
                              className="w-20 h-8 px-2 rounded-lg border border-slate-300 font-mono text-center tabular-nums"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="number"
                              min={0}
                              max={99}
                              disabled={controlMatch.status === "completed"}
                              value={row.kills}
                              onChange={(e) => updateBrRowField(row.team_id, "kills", e.target.value)}
                              className="w-20 h-8 px-2 rounded-lg border border-slate-300 font-mono text-center tabular-nums"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                            {row.placement_points}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                            {row.kill_points}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                            {row.total_points}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {teamMap.get(controlMatch.team_a_id || "")?.team_name || "Team A"} Score
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={controlMatch.status === "completed"}
                    value={editScoreA}
                    onChange={(e) => setEditScoreA(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white font-mono text-lg font-bold text-center tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {teamMap.get(controlMatch.team_b_id || "")?.team_name || "Team B"} Score
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={controlMatch.status === "completed"}
                    value={editScoreB}
                    onChange={(e) => setEditScoreB(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white font-mono text-lg font-bold text-center tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Winner Override</label>
                  <select
                    disabled={controlMatch.status === "completed"}
                    value={editWinnerId}
                    onChange={(e) => setEditWinnerId(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="">Auto from highest score</option>
                    {controlMatch.team_a_id && (
                      <option value={controlMatch.team_a_id}>
                        {teamMap.get(controlMatch.team_a_id)?.team_name || "Team A"}
                      </option>
                    )}
                    {controlMatch.team_b_id && (
                      <option value={controlMatch.team_b_id}>
                        {teamMap.get(controlMatch.team_b_id)?.team_name || "Team B"}
                      </option>
                    )}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Official Notes</label>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Map scores, overtime notes, penalties..."
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setControlMatch(null);
                  onNavigate("schedule");
                }}
                className="min-h-[40px] px-3.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CalendarClock size={14} />
                <span>Schedule / Reschedule</span>
              </button>

              {controlMatch.status !== "completed" && controlMatch.status !== "disputed" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingControl}
                    onClick={handleSaveDraftScores}
                    className="min-h-[40px] px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
                  >
                    Save Draft Score
                  </button>
                  {canConfirmResults && (
                    <button
                      type="button"
                      disabled={savingControl}
                      onClick={() => handleConfirmAndAdvance(controlMatch)}
                      className="min-h-[40px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      <span>
                        {savingControl
                          ? "Confirming..."
                          : isBrMatch(controlMatch)
                          ? "Confirm BR Round"
                          : "Confirm & Advance Bracket"}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Undo Result / Rewind Modal */}
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
              Undo Match Result — {undoTarget.match_code || undoTarget.round}
            </h3>
            <p className="text-xs text-slate-600 m-0">
              Rewinds this match back to pre-confirmation state, clears any promoted slots downstream, and records a permanent entry in Tournament History.
            </p>

            {undoCascadeWarning && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldAlert size={14} />
                  <span>Downstream Activity Detected</span>
                </div>
                <p className="m-0">{undoCascadeWarning}</p>
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={undoForceCascade}
                    onChange={(e) => setUndoForceCascade(e.target.checked)}
                  />
                  <span>Cascade rewind & reset downstream matches too</span>
                </label>
              </div>
            )}

            <form onSubmit={handleConfirmUndo} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory Rewind Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  value={undoReason}
                  onChange={(e) => setUndoReason(e.target.value)}
                  placeholder="e.g. Incorrect team recorded as winner / score entry typo..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUndoTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={undoing || (Boolean(undoCascadeWarning) && !undoForceCascade)}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                >
                  {undoing ? "Rewinding..." : "Confirm Undo & Rewind"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Dispute Modal */}
      {disputeTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setDisputeTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <h3 className="text-base font-display font-bold text-rose-900 m-0">
              Flag Match Dispute — {disputeTarget.match_code || disputeTarget.round}
            </h3>
            <p className="text-xs text-slate-600 m-0">
              Freezes bracket advancement until resolved inside Disputes & Corrections.
            </p>
            <form onSubmit={handleSubmitDispute} className="space-y-3">
              <textarea
                required
                rows={3}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Describe rule objection, disconnect, or score conflict..."
                className="w-full p-2.5 rounded-lg border border-slate-300 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDisputeTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reportingDispute}
                  className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                >
                  {reportingDispute ? "Freezing..." : "Freeze Match & Log Dispute"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Match Modal */}
      {addOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto"
          onClick={() => setAddOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-display font-bold text-slate-900 m-0">
                Add Match — {selectedGame?.title}
              </h3>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {addError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-900 flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleCreateMatch} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Match Code</label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Round Label *</label>
                  <input
                    type="text"
                    required
                    value={newRound}
                    onChange={(e) => setNewRound(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select
                    value={newIsBr ? "br" : "h2h"}
                    onChange={(e) => {
                      const br = e.target.value === "br";
                      setNewIsBr(br);
                      setNewFormat(br ? "BR Lobby" : brRules.bestOf || "BO1");
                    }}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                  >
                    <option value="h2h">Head-to-Head (Team A vs B)</option>
                    <option value="br">Battle Royale Multi-Squad Lobby</option>
                  </select>
                </div>
              </div>

              {newIsBr ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Participating Lobby Squads ({newBrTeamIds.length} selected)
                  </label>
                  <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {eligibleTeams.map((t) => {
                      const checked = newBrTeamIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setNewBrTeamIds((prev) =>
                                e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)
                              )
                            }
                          />
                          <span className="truncate font-medium text-slate-800">{t.team_name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Team A *</label>
                    <select
                      value={newTeamAId}
                      onChange={(e) => setNewTeamAId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                    >
                      <option value="">Select Team A...</option>
                      {eligibleTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.team_name} ({t.registration_ref})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Team B *</label>
                    <select
                      value={newTeamBId}
                      onChange={(e) => setNewTeamBId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                    >
                      <option value="">Select Team B...</option>
                      {eligibleTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.team_name} ({t.registration_ref})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Round #</label>
                  <input
                    type="number"
                    min={1}
                    value={newRoundNum}
                    onChange={(e) => setNewRoundNum(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Match #</label>
                  <input
                    type="number"
                    min={1}
                    value={newMatchNum}
                    onChange={(e) => setNewMatchNum(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Format</label>
                  <input
                    type="text"
                    value={newFormat}
                    onChange={(e) => setNewFormat(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as MatchStatus)}
                    className="w-full h-9 px-2 rounded-lg border border-slate-300 bg-white text-xs"
                  >
                    {INITIAL_MATCH_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newScheduleNow}
                    onChange={(e) => setNewScheduleNow(e.target.checked)}
                  />
                  <span>Assign IST date & start time now (leave unchecked to queue as Unscheduled)</span>
                </label>

                {newScheduleNow && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date (IST)</label>
                      <input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Start Time (IST)</label>
                      <input
                        type="time"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Duration (min)</label>
                      <input
                        type="number"
                        min={10}
                        max={240}
                        value={newDuration}
                        onChange={(e) => setNewDuration(Math.max(10, Number(e.target.value) || 30))}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono text-xs bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Arena / Lobby</label>
                  <input
                    type="text"
                    value={newArena}
                    onChange={(e) => setNewArena(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Conductor</label>
                  <select
                    value={newConductorId}
                    onChange={(e) => setNewConductorId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                  >
                    <option value="">Assign later</option>
                    {conductors.map((c) => (
                      <option key={c.user_id} value={c.user_id}>
                        {c.full_name || c.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPublished}
                  onChange={(e) => setNewPublished(e.target.checked)}
                />
                <span>Publish match to public Live Board</span>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMatch}
                  className="px-5 py-2 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                >
                  {creatingMatch ? "Creating..." : "Create Match"}
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
// Section 7: Live Match Console (Active Arena Ops + Confirmation Queue + Broadcast)
// =============================================================================
export function LiveConsoleAndResultsSection(props: SharedControlProps) {
  const { data, canEditEsports, canConfirmResults, canBroadcast, actorUserId, permissions, onRefresh, onError, onNavigate } = props;
  const { selectedGame, tournament, hasPersistedTournament, matches, teamMap } = data;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  const liveMatches = useMemo(
    () => matches.filter((m) => m.status === "live"),
    [matches]
  );
  const confirmQueue = useMemo(
    () => matches.filter((m) => m.status === "result_submitted"),
    [matches]
  );
  const readyMatches = useMemo(
    () =>
      matches
        .filter((m) => ["scheduled", "check_in", "ready"].includes(m.status))
        .sort((a, b) => (a.scheduled_start || "").localeCompare(b.scheduled_start || ""))
        .slice(0, 8),
    [matches]
  );

  const quickAdjustScore = async (m: Match, deltaA: number, deltaB: number) => {
    if (!canEditEsports && !canConfirmResults) return;
    setBusyId(m.id);
    try {
      const nextA = Math.max(0, (m.score_a || 0) + deltaA);
      const nextB = Math.max(0, (m.score_b || 0) + deltaB);
      const { error } = await supabase
        .from("matches")
        .update({ score_a: nextA, score_b: nextB })
        .eq("id", m.id);
      if (error) throw error;
      await onRefresh();
    } catch (err: any) {
      onError(formatMatchDatabaseError(err));
    } finally {
      setBusyId(null);
    }
  };

  const quickTransition = async (m: Match, status: MatchStatus) => {
    if (!canEditEsports && !canConfirmResults) return;
    setBusyId(m.id);
    try {
      const { error } = await supabase.from("matches").update({ status }).eq("id", m.id);
      if (error) throw error;
      await onRefresh(`${m.match_code || m.round} is now ${MATCH_STATUS_LABELS[status]}.`);
    } catch (err: any) {
      onError(formatMatchDatabaseError(err, status));
    } finally {
      setBusyId(null);
    }
  };

  const quickConfirm = async (m: Match) => {
    if (!canConfirmResults) return;
    const isBr = isBrMatch(m);
    let winnerId = m.winner_id;
    if (!isBr && !winnerId) {
      if (m.score_a > m.score_b) winnerId = m.team_a_id;
      else if (m.score_b > m.score_a) winnerId = m.team_b_id;
    }
    const sim = confirmAndAdvanceMatchResult({
      matches,
      matchId: m.id,
      managerUserId: actorUserId,
      permissions,
      overrideWinnerId: winnerId,
    });
    if (!sim.ok) {
      onError(sim.error);
      return;
    }

    setBusyId(m.id);
    try {
      const rpcRes = await supabase.rpc("confirm_match_result_and_advance", {
        p_match_id: m.id,
        p_winner_id: winnerId || null,
        p_score_a: m.score_a,
        p_score_b: m.score_b,
        p_detailed_scores: m.detailed_scores || {},
        p_br_results: isBr ? m.br_results || [] : null,
      });
      if (rpcRes.error) {
        const msg = rpcRes.error.message || "";
        if (msg.includes("Could not find the function") || rpcRes.error.code === "PGRST202") {
          await supabase
            .from("matches")
            .update({
              winner_id: winnerId || null,
              status: "completed",
              result_status: "confirmed",
              confirmed_by: actorUserId || null,
              confirmed_at: new Date().toISOString(),
              bracket_advanced_at: new Date().toISOString(),
            })
            .eq("id", m.id);
          if (!isBr && m.next_match_id && winnerId) {
            const slotCol = m.next_match_slot === "b" ? "team_b_id" : "team_a_id";
            await supabase.from("matches").update({ [slotCol]: winnerId }).eq("id", m.next_match_id);
          }
          if (isBr && hasPersistedTournament) {
            const simulated = sim.matches;
            const remainingOpen = simulated.some(
              (x) => x.status !== "completed" && x.status !== "cancelled" && x.match_format !== "BYE"
            );
            if (!remainingOpen) {
              const totals = new Map<string, { pts: number; wins: number; kills: number }>();
              for (const mm of simulated) {
                if (mm.status !== "completed" || !Array.isArray(mm.br_results)) continue;
                for (const row of mm.br_results) {
                  if (!row.team_id) continue;
                  const cur = totals.get(row.team_id) || { pts: 0, wins: 0, kills: 0 };
                  cur.pts += row.total_points || 0;
                  if (row.placement === 1) cur.wins += 1;
                  cur.kills += row.kills || 0;
                  totals.set(row.team_id, cur);
                }
              }
              const best = Array.from(totals.entries()).sort((a, b) => {
                if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
                if (b[1].wins !== a[1].wins) return b[1].wins - a[1].wins;
                return b[1].kills - a[1].kills;
              })[0];
              if (best?.[0]) {
                await supabase
                  .from("tournaments")
                  .update({ champion_team_id: best[0], status: "completed" })
                  .eq("id", tournament.id);
              }
            }
          }
          if (
            !isBr &&
            hasPersistedTournament &&
            !m.next_match_id &&
            (m.bracket_side === "grand_final" || (m.round || "").toLowerCase().includes("final")) &&
            winnerId
          ) {
            await supabase
              .from("tournaments")
              .update({ champion_team_id: winnerId, status: "completed" })
              .eq("id", tournament.id);
          }
        } else {
          throw rpcRes.error;
        }
      } else if (rpcRes.data && rpcRes.data.ok === false) {
        throw new Error(rpcRes.data.error);
      }

      await onRefresh(`Confirmed ${m.match_code || m.round}.`);
    } catch (err: any) {
      onError(formatMatchDatabaseError(err, "completed"));
    } finally {
      setBusyId(null);
    }
  };

  const handleBroadcast = async (e: FormEvent) => {
    e.preventDefault();
    if (!canBroadcast || !broadcastTitle.trim() || !broadcastBody.trim()) return;
    setBroadcasting(true);
    try {
      const { error } = await supabase.from("announcements").insert({
        title: `[${selectedGame?.title || "ESPORTS"}] ${broadcastTitle.trim()}`,
        body: broadcastBody.trim(),
        category: "esports",
        audience: "esports",
        is_published: true,
        is_pinned: true,
        created_by: actorUserId || null,
      });
      if (error) throw error;
      setBroadcastTitle("");
      setBroadcastBody("");
      await onRefresh(`Broadcast published to ${selectedGame?.title} teams.`);
    } catch (err: any) {
      onError(`Broadcast failed: ${err?.message || "Database error"}`);
    } finally {
      setBroadcasting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Matches Board */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-display font-bold text-slate-900 m-0">
                Live Matches ({liveMatches.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 m-0">
                Real-time score controls synced directly with Public Live Board.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("matches")}
              className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              Full Match Controls
            </button>
          </div>

          {liveMatches.length === 0 ? (
            <div className="p-8 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-500">
              No matches are currently marked Live. Start a ready match below.
            </div>
          ) : (
            <div className="space-y-3">
              {liveMatches.map((m) => {
                const isBr = isBrMatch(m);
                const tA = teamMap.get(m.team_a_id || "");
                const tB = teamMap.get(m.team_b_id || "");
                return (
                  <div key={m.id} className="p-4 rounded-xl border border-orange-200 bg-orange-50/30 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-orange-800">
                        {m.match_code || m.round} · LIVE
                      </span>
                      <span className="text-slate-500 font-mono">{m.station || "Arena"}</span>
                    </div>

                    {isBr ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900">
                          Battle Royale Lobby ({m.round})
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigate("matches")}
                          className="h-8 px-3 rounded-lg bg-[#0B1120] text-white text-xs font-semibold cursor-pointer"
                        >
                          Enter Lobby Placements
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">{tA?.team_name || "TBD"}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => quickAdjustScore(m, -1, 0)}
                              className="w-7 h-7 rounded border border-slate-300 bg-white text-xs font-bold cursor-pointer"
                            >
                              -
                            </button>
                            <span className="font-mono text-base font-black px-2 tabular-nums">{m.score_a}</span>
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => quickAdjustScore(m, 1, 0)}
                              className="w-7 h-7 rounded border border-slate-300 bg-white text-xs font-bold cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <span className="text-xs font-mono text-slate-400">VS</span>

                        <div className="flex-1 min-w-0 text-right">
                          <div className="text-sm font-bold text-slate-900 truncate">{tB?.team_name || "TBD"}</div>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => quickAdjustScore(m, 0, -1)}
                              className="w-7 h-7 rounded border border-slate-300 bg-white text-xs font-bold cursor-pointer"
                            >
                              -
                            </button>
                            <span className="font-mono text-base font-black px-2 tabular-nums">{m.score_b}</span>
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => quickAdjustScore(m, 0, 1)}
                              className="w-7 h-7 rounded border border-slate-300 bg-white text-xs font-bold cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Result Confirmation Queue */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-display font-bold text-slate-900 m-0">
                Awaiting Manager Confirmation ({confirmQueue.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 m-0">
                Verify conductor-submitted results before bracket progression.
              </p>
            </div>
          </div>

          {confirmQueue.length === 0 ? (
            <div className="p-8 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-500">
              No submitted results pending verification.
            </div>
          ) : (
            <div className="space-y-3">
              {confirmQueue.map((m) => {
                const isBr = isBrMatch(m);
                const tA = teamMap.get(m.team_a_id || "");
                const tB = teamMap.get(m.team_b_id || "");
                const winner = teamMap.get(m.winner_id || "");
                return (
                  <div key={m.id} className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono font-bold text-amber-800">
                        {m.match_code || m.round} · Submitted
                      </div>
                      <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                        {isBr
                          ? `${m.round} · Winner: ${winner?.team_name || "Top Scoring Squad"}`
                          : `${tA?.team_name || "TBD"} (${m.score_a}) vs ${tB?.team_name || "TBD"} (${m.score_b})`}
                      </div>
                    </div>
                    {canConfirmResults && (
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => quickConfirm(m)}
                        className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0 cursor-pointer"
                      >
                        {busyId === m.id ? "Confirming..." : "Confirm & Advance"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Ready Queue */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-display font-bold text-slate-900 m-0">
          Next Stage-Ready Matches ({readyMatches.length})
        </h3>
        {readyMatches.length === 0 ? (
          <p className="text-xs text-slate-500 m-0">
            Schedule upcoming matches in Match Scheduling to launch them from the Live Console.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {readyMatches.map((m) => {
              const tA = teamMap.get(m.team_a_id || "");
              const tB = teamMap.get(m.team_b_id || "");
              return (
                <div
                  key={m.id}
                  className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-slate-500">
                      {m.match_code || m.round} · {isMatchScheduled(m) ? formatIstDateTime(m.scheduled_start) : "Unscheduled"}
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                      {isBrMatch(m) ? `${m.round} (BR Lobby)` : `${tA?.team_name || "TBD"} vs ${tB?.team_name || "TBD"}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => quickTransition(m, "live")}
                      className="h-8 px-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Play size={12} />
                      <span>Go Live</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Arena Announcement Broadcast */}
      {canBroadcast && (
        <form onSubmit={handleBroadcast} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone size={15} className="text-slate-700" />
            <h3 className="text-sm font-display font-bold text-slate-900 m-0">
              Arena Dispatch Notice ({selectedGame?.title})
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              placeholder="Notice title (e.g. Lobby Code Ready)"
              className="h-10 px-3 rounded-lg border border-slate-200 text-xs"
            />
            <input
              type="text"
              required
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
              placeholder="Room ID / check-in instructions..."
              className="sm:col-span-2 h-10 px-3 rounded-lg border border-slate-200 text-xs"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={broadcasting}
              className="min-h-[38px] px-4 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Send size={13} />
              <span>{broadcasting ? "Publishing..." : "Publish Arena Notice"}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
