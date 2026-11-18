import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  confirmAndAdvanceMatchResult,
  escalateMatchDispute,
  findDependentDownstreamMatches,
  resolveMatchDispute,
  undoMatchResultAndRewind,
} from "@/lib/tournamentEngine";
import { formatMatchDatabaseError, MATCH_STATUS_LABELS } from "@/lib/matchOperations";
import { formatIstDateTime, isMatchScheduled, istInputsToIso } from "@/lib/scheduling";
import type { PermissionKey } from "@/lib/rbac";
import { isBattleRoyaleTournament, type EsportsWorkspaceSharedData } from "./types";
import type { Match, MatchAttendance, MatchStatus } from "@/types/database";
import {
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Eye,
  EyeOff,
  Play,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Trophy,
  Users,
  X,
} from "lucide-react";

interface MatchOperationDrawerProps {
  match: Match | null;
  data: EsportsWorkspaceSharedData;
  actorUserId: string;
  permissions: Set<PermissionKey>;
  canEditEsports: boolean;
  canAssignConductors: boolean;
  canConfirmResults: boolean;
  canResolveDisputes: boolean;
  onClose: () => void;
  onRefresh: (msg?: string) => Promise<void>;
  onError: (msg: string) => void;
}

function isoToIstDateAndTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "2026-11-20", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "2026-11-20", time: "" };
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  const date = ist.toISOString().slice(0, 10);
  const time = ist.toISOString().slice(11, 16);
  return { date, time };
}

export function MatchOperationDrawer({
  match,
  data,
  actorUserId,
  permissions,
  canEditEsports,
  canAssignConductors,
  canConfirmResults,
  canResolveDisputes,
  onClose,
  onRefresh,
  onError,
}: MatchOperationDrawerProps) {
  const { selectedGame, tournament, hasPersistedTournament, players, matches, disputes, conductors, teamMap } = data;

  const [attendance, setAttendance] = useState<MatchAttendance[]>([]);
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [allowDraw, setAllowDraw] = useState<boolean>(false);
  const [forfeitTeamId, setForfeitTeamId] = useState<string>("");
  const [manualWinnerId, setManualWinnerId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Quick scheduling & conductor edits
  const [station, setStation] = useState<string>("");
  const [conductorId, setConductorId] = useState<string>("");
  const [schedDate, setSchedDate] = useState<string>("2026-11-20");
  const [schedTime, setSchedTime] = useState<string>("");

  // Rewind / Correct panel
  const [rewindOpen, setRewindOpen] = useState<boolean>(false);
  const [rewindReason, setRewindReason] = useState<string>("");
  const [forceCascade, setForceCascade] = useState<boolean>(false);

  // Dispute flag panel
  const [disputeOpen, setDisputeOpen] = useState<boolean>(false);
  const [disputeReason, setDisputeReason] = useState<string>("");

  const [busy, setBusy] = useState<boolean>(false);

  const isBr = Boolean(
    match &&
      (match.bracket_side === "battle_royale" ||
        (match.match_format || "").toUpperCase().includes("BR") ||
        isBattleRoyaleTournament(tournament, selectedGame))
  );

  const supportsDraw =
    tournament.format === "round_robin" ||
    tournament.format === "group_knockout" ||
    tournament.format === "head_to_head";

  useEffect(() => {
    if (!match) return;
    setScoreA(match.score_a ?? 0);
    setScoreB(match.score_b ?? 0);
    setAllowDraw(
      supportsDraw && match.status === "completed" && match.winner_id === null && match.score_a === match.score_b
    );
    setForfeitTeamId("");
    setManualWinnerId(match.winner_id || "");
    setNotes(match.notes || "");
    setStation(match.station || "");
    setConductorId(match.conductor_id || "");
    const { date, time } = isoToIstDateAndTime(match.scheduled_start);
    setSchedDate(date);
    setSchedTime(match.is_scheduled ? time : "");
    setRewindOpen(false);
    setRewindReason("");
    setForceCascade(false);
    setDisputeOpen(false);
    setDisputeReason("");

    supabase
      .from("match_attendance")
      .select("*")
      .eq("match_id", match.id)
      .then(({ data: rows }) => {
        if (Array.isArray(rows)) setAttendance(rows as MatchAttendance[]);
      });
  }, [match?.id, match?.score_a, match?.score_b, match?.winner_id, match?.status, supportsDraw]);

  useEffect(() => {
    if (!match) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [match, onClose]);

  const downstreamInfo = useMemo(() => {
    if (!match) return { directIds: [] as string[], allDownstream: [] as Match[], startedDownstream: [] as Match[] };
    return findDependentDownstreamMatches(matches, match.id);
  }, [matches, match]);

  const openDisputesForMatch = useMemo(() => {
    if (!match) return [];
    return disputes.filter((d) => d.match_id === match.id && d.status !== "resolved");
  }, [disputes, match]);

  if (!match) return null;

  const teamA = match.team_a_id ? teamMap.get(match.team_a_id) : null;
  const teamB = match.team_b_id ? teamMap.get(match.team_b_id) : null;

  const computedWinnerId = (): string | null => {
    if (forfeitTeamId) {
      if (forfeitTeamId === match.team_a_id) return match.team_b_id || null;
      if (forfeitTeamId === match.team_b_id) return match.team_a_id || null;
    }
    if (allowDraw && supportsDraw && scoreA === scoreB) return null;
    if (manualWinnerId) return manualWinnerId;
    if (scoreA > scoreB) return match.team_a_id || null;
    if (scoreB > scoreA) return match.team_b_id || null;
    return null;
  };

  const handleTransition = async (nextStatus: MatchStatus) => {
    if (!canEditEsports) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("matches").update({ status: nextStatus }).eq("id", match.id);
      if (error) throw error;
      await onRefresh(`${match.match_code || match.round} updated to ${MATCH_STATUS_LABELS[nextStatus]}.`);
    } catch (err: any) {
      onError(`Status update failed: ${formatMatchDatabaseError(err, nextStatus)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!canEditEsports) return;
    setBusy(true);
    try {
      const nextPub = !match.is_published;
      const { error } = await supabase.from("matches").update({ is_published: nextPub }).eq("id", match.id);
      if (error) throw error;
      await onRefresh(`${match.match_code || match.round} ${nextPub ? "published" : "hidden"}.`);
    } catch (err: any) {
      onError(`Visibility update failed: ${err?.message || "Database error"}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveLogistics = async () => {
    if (!canEditEsports && !canAssignConductors) return;
    setBusy(true);
    try {
      const selectedConductor = conductors.find((c) => c.user_id === conductorId);
      const hasSlot = Boolean(schedDate && schedTime);
      const startIso = hasSlot ? istInputsToIso(schedDate, schedTime) : null;
      const dur = match.duration_minutes || selectedGame?.match_duration_minutes || 30;
      const endIso = startIso ? new Date(new Date(startIso).getTime() + dur * 60_000).toISOString() : null;

      const patch: Record<string, any> = {};
      if (canEditEsports) {
        patch.station = station.trim() || null;
        if (hasSlot && startIso) {
          patch.scheduled_start = startIso;
          patch.scheduled_end = endIso;
          patch.is_scheduled = true;
          if (match.status === "upcoming") patch.status = "scheduled";
        }
      }
      if (canAssignConductors) {
        patch.conductor_id = conductorId || null;
        patch.conductor_email = selectedConductor?.email || null;
      }

      const { error } = await supabase.from("matches").update(patch).eq("id", match.id);
      if (error) throw error;
      await onRefresh(`Saved IST timing, arena, and conductor for ${match.match_code || match.round}.`);
    } catch (err: any) {
      onError(`Logistics save failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAttendance = async (registrationId: string, playerId: string) => {
    if (!canEditEsports) return;
    const existing = attendance.find((a) => a.match_id === match.id && a.player_id === playerId);
    const nextPresent = !(existing?.present ?? false);
    try {
      const { error } = await supabase.from("match_attendance").upsert(
        {
          match_id: match.id,
          registration_id: registrationId,
          player_id: playerId,
          present: nextPresent,
          verified_by: actorUserId || null,
          verified_at: new Date().toISOString(),
        },
        { onConflict: "match_id,player_id" }
      );
      if (error) throw error;
      const { data: rows } = await supabase.from("match_attendance").select("*").eq("match_id", match.id);
      if (Array.isArray(rows)) setAttendance(rows as MatchAttendance[]);
    } catch (err: any) {
      onError(`Attendance save failed: ${err?.message || "Database error"}`);
    }
  };

  const handleSubmitResult = async () => {
    if (!canEditEsports) return;
    const winnerId = computedWinnerId();
    if (!isBr && !winnerId && !(allowDraw && supportsDraw && scoreA === scoreB)) {
      onError("Enter scores with a clear winner, select a winner, or mark Draw / Forfeit.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("matches")
        .update({
          score_a: isBr ? 0 : scoreA,
          score_b: isBr ? 0 : scoreB,
          winner_id: winnerId,
          status: "result_submitted",
          result_status: "submitted",
          submitted_by: actorUserId || null,
          submitted_at: new Date().toISOString(),
          notes: notes.trim() || null,
        })
        .eq("id", match.id);
      if (error) throw error;
      await onRefresh(`Submitted result for ${match.match_code || match.round}. Confirm to finalize.`);
    } catch (err: any) {
      onError(`Submit failed: ${formatMatchDatabaseError(err, "result_submitted")}`);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAndAdvance = async () => {
    if (!canConfirmResults) return;
    const winnerId = computedWinnerId();
    const isValidDraw = allowDraw && supportsDraw && scoreA === scoreB && winnerId === null;

    const validation = confirmAndAdvanceMatchResult({
      matches,
      matchId: match.id,
      managerUserId: actorUserId,
      permissions,
      overrideScoreA: scoreA,
      overrideScoreB: scoreB,
      overrideWinnerId: winnerId,
      allowDraw: isValidDraw,
      forfeitTeamId: forfeitTeamId || null,
    });
    if (!validation.ok) {
      onError(validation.error);
      return;
    }

    setBusy(true);
    try {
      if (isValidDraw) {
        const { error } = await supabase
          .from("matches")
          .update({
            score_a: scoreA,
            score_b: scoreB,
            winner_id: null,
            status: "completed",
            result_status: "confirmed",
            confirmed_by: actorUserId || null,
            confirmed_at: new Date().toISOString(),
            is_published: true,
            notes: notes.trim() || "Official Draw",
          })
          .eq("id", match.id);
        if (error) throw error;
      } else {
        const rpcRes = await supabase.rpc("confirm_match_result_and_advance", {
          p_match_id: match.id,
          p_winner_id: winnerId,
          p_score_a: isBr ? 0 : scoreA,
          p_score_b: isBr ? 0 : scoreB,
          p_br_results: isBr ? match.br_results || [] : null,
          p_notes: forfeitTeamId
            ? `${notes ? `${notes} · ` : ""}Forfeit by ${teamMap.get(forfeitTeamId)?.team_name || "Opponent"}`
            : notes.trim() || null,
        });

        if (rpcRes.error) {
          // Client fallback if RPC absent or tournament_id missing
          const { error: mErr } = await supabase
            .from("matches")
            .update({
              score_a: isBr ? 0 : scoreA,
              score_b: isBr ? 0 : scoreB,
              winner_id: winnerId,
              status: "completed",
              result_status: "confirmed",
              confirmed_by: actorUserId || null,
              confirmed_at: new Date().toISOString(),
              is_published: true,
              notes: notes.trim() || null,
            })
            .eq("id", match.id);
          if (mErr) throw mErr;

          if (match.next_match_id && winnerId) {
            const col = match.next_match_slot === "b" ? "team_b_id" : "team_a_id";
            await supabase.from("matches").update({ [col]: winnerId }).eq("id", match.next_match_id);
          }
          const loserId =
            winnerId && match.team_a_id && match.team_b_id
              ? winnerId === match.team_a_id
                ? match.team_b_id
                : match.team_a_id
              : null;
          if (match.loser_next_match_id && loserId) {
            const lCol = match.loser_next_match_slot === "b" ? "team_b_id" : "team_a_id";
            await supabase.from("matches").update({ [lCol]: loserId }).eq("id", match.loser_next_match_id);
          }
        }
      }

      // Check if Grand Final or final elimination match crowned a champion
      const isFinalMatch = !match.next_match_id && match.bracket_side !== "losers" && !isBr;
      if (isFinalMatch && winnerId && hasPersistedTournament) {
        await supabase
          .from("tournaments")
          .update({ champion_team_id: winnerId, status: "completed" })
          .eq("id", tournament.id);
      }

      await onRefresh(
        isValidDraw
          ? `Confirmed official Draw (${scoreA}-${scoreB}) for ${match.match_code || match.round}.`
          : `Confirmed result & advanced winner for ${match.match_code || match.round}.`
      );
    } catch (err: any) {
      onError(`Confirmation failed: ${formatMatchDatabaseError(err, "completed")}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRewindMatch = async () => {
    if (!canConfirmResults) return;
    const plan = undoMatchResultAndRewind({
      matches,
      matchId: match.id,
      managerUserId: actorUserId,
      permissions,
      reason: rewindReason,
      forceCascade,
    });
    if (!plan.ok) {
      onError(plan.error);
      return;
    }

    setBusy(true);
    try {
      const rpcRes = await supabase.rpc("undo_match_result_and_rewind", {
        p_match_id: match.id,
        p_reason: rewindReason.trim(),
        p_force_cascade: forceCascade,
      });

      if (rpcRes.error) {
        const { error: mErr } = await supabase
          .from("matches")
          .update({
            status: "live",
            result_status: "reopened",
            winner_id: null,
            score_a: 0,
            score_b: 0,
            confirmed_by: null,
            confirmed_at: null,
          })
          .eq("id", match.id);
        if (mErr) throw mErr;
      }

      // Ensure multi-hop downstream cleanup (>1 hop)
      for (const depId of plan.affectedMatchIds) {
        if (depId === match.id) continue;
        const patched = plan.matches.find((x) => x.id === depId);
        if (!patched) continue;
        await supabase
          .from("matches")
          .update({
            team_a_id: patched.team_a_id,
            team_b_id: patched.team_b_id,
            status: patched.status,
            winner_id: patched.winner_id,
            score_a: patched.score_a,
            score_b: patched.score_b,
            result_status: patched.result_status,
          })
          .eq("id", depId);
      }

      if (hasPersistedTournament && tournament.champion_team_id) {
        await supabase
          .from("tournaments")
          .update({ champion_team_id: null, status: "in_progress" })
          .eq("id", tournament.id);
      }

      setRewindOpen(false);
      setRewindReason("");
      await onRefresh(`Rewound ${match.match_code || match.round} and cleared downstream progression.`);
    } catch (err: any) {
      onError(`Rewind failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleFlagDispute = async () => {
    const esc = escalateMatchDispute({
      match,
      reporterUserId: actorUserId,
      reason: disputeReason,
    });
    if (!esc.ok) {
      onError(esc.error);
      return;
    }

    setBusy(true);
    try {
      await supabase.from("match_disputes").insert({
        match_id: match.id,
        reported_by: actorUserId || null,
        reason: disputeReason.trim(),
        original_submission: esc.dispute.original_submission,
        status: "open",
      });
      await supabase
        .from("matches")
        .update({ status: "disputed", result_status: "disputed" })
        .eq("id", match.id);
      setDisputeOpen(false);
      setDisputeReason("");
      await onRefresh(`Dispute logged for ${match.match_code || match.round}. Progression frozen.`);
    } catch (err: any) {
      onError(`Dispute creation failed: ${formatMatchDatabaseError(err, "disputed")}`);
    } finally {
      setBusy(false);
    }
  };

  const handleResolveDispute = async (disputeId: string) => {
    if (!canResolveDisputes) return;
    const disp = disputes.find((d) => d.id === disputeId);
    if (!disp) return;
    const res = resolveMatchDispute({
      matches,
      dispute: disp,
      managerUserId: actorUserId,
      permissions,
      resolutionNotes: "Resolved by Esports Control Desk",
      correctedScoreA: scoreA,
      correctedScoreB: scoreB,
      correctedWinnerId: computedWinnerId() || match.winner_id || "",
    });
    if (!res.ok) {
      onError(res.error);
      return;
    }

    setBusy(true);
    try {
      await supabase
        .from("match_disputes")
        .update({
          status: "resolved",
          resolved_by: actorUserId || null,
          resolution_notes: "Resolved via Match Control Drawer",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", disputeId);

      await supabase
        .from("matches")
        .update({ status: "live", result_status: "reopened" })
        .eq("id", match.id);

      await onRefresh(`Resolved dispute on ${match.match_code || match.round}. Match unlocked.`);
    } catch (err: any) {
      onError(`Dispute resolution failed: ${err?.message || "Database error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Match Control: ${match.match_code || match.round}`}
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 bg-slate-50/70">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase text-slate-500">
              <span className="font-bold text-slate-900">{match.match_code || `M${match.match_number ?? 1}`}</span>
              <span>·</span>
              <span>{match.round}</span>
              <span>·</span>
              <span className="font-semibold text-slate-700">{MATCH_STATUS_LABELS[match.status] || match.status}</span>
            </div>
            <h2 className="text-lg font-display font-bold text-slate-900 m-0 mt-1 truncate">
              {isBr
                ? `${match.group_name || match.round} (${match.br_results?.length || 0} Squads)`
                : `${teamA?.team_name || "TBD"} vs ${teamB?.team_name || (match.match_format === "BYE" ? "BYE" : "TBD")}`}
            </h2>
            <p className="text-xs text-slate-500 m-0 mt-0.5 font-mono tabular-nums">
              {isMatchScheduled(match) ? formatIstDateTime(match.scheduled_start) : "Unscheduled"}
              {match.station ? ` · ${match.station}` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close match drawer"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Quick Lifecycle & Visibility Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {canEditEsports && match.status !== "completed" && match.status !== "disputed" && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleTransition("ready")}
                  className="min-h-[36px] px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  Mark Ready
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleTransition("live")}
                  className="min-h-[36px] px-3.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Play size={13} />
                  <span>Start Match</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleTransition("postponed")}
                  className="min-h-[36px] px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Postpone
                </button>
              </>
            )}

            {canEditEsports && (
              <button
                type="button"
                disabled={busy}
                onClick={handleTogglePublish}
                className="min-h-[36px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer ml-auto"
              >
                {match.is_published ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>{match.is_published ? "Published" : "Hidden Draft"}</span>
              </button>
            )}
          </div>

          {/* Open Disputes Banner */}
          {openDisputesForMatch.length > 0 && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-rose-900">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldAlert size={15} />
                  <span>{openDisputesForMatch.length} Open Dispute(s) — Match Frozen</span>
                </span>
              </div>
              {openDisputesForMatch.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-xs text-rose-800 bg-white/80 p-2 rounded-lg border border-rose-200">
                  <span className="truncate">{d.reason}</span>
                  {canResolveDisputes && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleResolveDispute(d.id)}
                      className="px-2.5 py-1 rounded bg-rose-700 text-white text-[11px] font-semibold cursor-pointer shrink-0"
                    >
                      Resolve &amp; Unlock
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Logistics: IST Timing, Arena & Conductor */}
          {(canEditEsports || canAssignConductors) && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <CalendarClock size={14} className="text-slate-600" />
                <span>Schedule (IST), Arena &amp; Conductor</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label htmlFor="drawer-date" className="block font-medium text-slate-600 mb-1">
                    IST Date
                  </label>
                  <input
                    id="drawer-date"
                    type="date"
                    value={schedDate}
                    onChange={(e) => setSchedDate(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="drawer-time" className="block font-medium text-slate-600 mb-1">
                    IST Start Time
                  </label>
                  <input
                    id="drawer-time"
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="drawer-arena" className="block font-medium text-slate-600 mb-1">
                    Arena / Lobby Station
                  </label>
                  <input
                    id="drawer-arena"
                    type="text"
                    value={station}
                    onChange={(e) => setStation(e.target.value)}
                    placeholder="e.g. Main Stage PC-A"
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="drawer-conductor" className="block font-medium text-slate-600 mb-1">
                    Assigned Conductor
                  </label>
                  <select
                    id="drawer-conductor"
                    value={conductorId}
                    onChange={(e) => setConductorId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="">Unassigned</option>
                    {conductors.map((c) => (
                      <option key={c.user_id} value={c.user_id}>
                        {c.full_name || c.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSaveLogistics}
                  className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Save size={12} />
                  <span>Save Logistics</span>
                </button>
              </div>
            </div>
          )}

          {/* Player Roster & Match Attendance (Head-to-Head) */}
          {!isBr && (match.team_a_id || match.team_b_id) && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Users size={14} className="text-slate-600" />
                <span>Squad Roster &amp; Player Attendance</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[match.team_a_id, match.team_b_id].map((tid, idx) => {
                  const team = tid ? teamMap.get(tid) : null;
                  const roster = tid ? players.filter((p) => p.registration_id === tid) : [];
                  return (
                    <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {team?.team_name || (idx === 0 ? "Slot A TBD" : "Slot B TBD")}
                      </div>
                      {roster.length === 0 ? (
                        <p className="text-[11px] text-slate-500 m-0">No players registered.</p>
                      ) : (
                        <div className="space-y-1">
                          {roster.map((p) => {
                            const att = attendance.find((a) => a.match_id === match.id && a.player_id === p.id);
                            const present = Boolean(att?.present || p.check_in_status === "checked_in");
                            return (
                              <button
                                key={p.id}
                                type="button"
                                disabled={!canEditEsports}
                                onClick={() => tid && handleToggleAttendance(tid, p.id)}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                                  present
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold"
                                    : "bg-white border-slate-200 text-slate-700"
                                }`}
                              >
                                <span className="truncate">
                                  {p.player_name} {p.gamer_tag ? `(${p.gamer_tag})` : ""}
                                </span>
                                <span className="text-[10px] font-mono uppercase shrink-0">
                                  {present ? "Present" : "Check"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Result Recording & Confirmation */}
          {!isBr && (
            <div className="p-4 rounded-xl border border-slate-200 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Trophy size={14} className="text-slate-600" />
                  <span>Score &amp; Result Confirmation</span>
                </span>
                {match.status === "completed" && (
                  <span className="text-[11px] font-mono font-bold text-emerald-700">CONFIRMED</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label htmlFor="drawer-score-a" className="block font-semibold text-slate-700 mb-1 truncate">
                    {teamA?.team_name || "Team A"} Score
                  </label>
                  <input
                    id="drawer-score-a"
                    type="number"
                    min={0}
                    disabled={match.status === "completed"}
                    value={scoreA}
                    onChange={(e) => setScoreA(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 font-mono text-lg font-bold text-center tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="drawer-score-b" className="block font-semibold text-slate-700 mb-1 truncate">
                    {teamB?.team_name || "Team B"} Score
                  </label>
                  <input
                    id="drawer-score-b"
                    type="number"
                    min={0}
                    disabled={match.status === "completed"}
                    value={scoreB}
                    onChange={(e) => setScoreB(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 font-mono text-lg font-bold text-center tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label htmlFor="drawer-forfeit" className="block font-semibold text-slate-700 mb-1">
                    Forfeit / Walkover
                  </label>
                  <select
                    id="drawer-forfeit"
                    disabled={match.status === "completed"}
                    value={forfeitTeamId}
                    onChange={(e) => setForfeitTeamId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="">No forfeit (normal play)</option>
                    {match.team_a_id && (
                      <option value={match.team_a_id}>{teamA?.team_name || "Team A"} forfeited</option>
                    )}
                    {match.team_b_id && (
                      <option value={match.team_b_id}>{teamB?.team_name || "Team B"} forfeited</option>
                    )}
                  </select>
                </div>

                <div>
                  <label htmlFor="drawer-winner" className="block font-semibold text-slate-700 mb-1">
                    Winner Override
                  </label>
                  <select
                    id="drawer-winner"
                    disabled={match.status === "completed" || Boolean(forfeitTeamId) || allowDraw}
                    value={manualWinnerId}
                    onChange={(e) => setManualWinnerId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="">Auto from highest score</option>
                    {match.team_a_id && (
                      <option value={match.team_a_id}>{teamA?.team_name || "Team A"}</option>
                    )}
                    {match.team_b_id && (
                      <option value={match.team_b_id}>{teamB?.team_name || "Team B"}</option>
                    )}
                  </select>
                </div>
              </div>

              {supportsDraw && (
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={match.status === "completed"}
                    checked={allowDraw}
                    onChange={(e) => {
                      setAllowDraw(e.target.checked);
                      if (e.target.checked) setForfeitTeamId("");
                    }}
                    className="w-4 h-4 rounded border-slate-300 accent-slate-900"
                  />
                  <span>Record as official League Draw / Tie (scores must match)</span>
                </label>
              )}

              <div>
                <label htmlFor="drawer-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                  Match Notes / Map Breakdown
                </label>
                <textarea
                  id="drawer-notes"
                  rows={2}
                  disabled={match.status === "completed"}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional map scoreline or remarks..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              {match.status !== "completed" && match.status !== "disputed" && (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  {canEditEsports && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleSubmitResult}
                      className="min-h-[38px] px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send size={13} />
                      <span>Submit Result</span>
                    </button>
                  )}
                  {canConfirmResults && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleConfirmAndAdvance}
                      className="min-h-[38px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      <span>Confirm &amp; Advance</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Rewind / Correct Confirmed Result */}
          {match.status === "completed" && canConfirmResults && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-950">Need to fix a mistaken score?</span>
                <button
                  type="button"
                  onClick={() => setRewindOpen((v) => !v)}
                  className="min-h-[34px] px-3 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-xs font-semibold text-amber-900 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>{rewindOpen ? "Hide Rewind" : "Correct Result"}</span>
                </button>
              </div>

              {rewindOpen && (
                <div className="space-y-3 pt-2 border-t border-amber-200/80 text-xs">
                  {downstreamInfo.allDownstream.length > 0 && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
                      <div className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        <span>
                          Cascade Warning: {downstreamInfo.allDownstream.length} downstream match(es) depend on this result.
                        </span>
                      </div>
                      {downstreamInfo.startedDownstream.length > 0 && (
                        <p className="m-0 text-[11px]">
                          Includes {downstreamInfo.startedDownstream.length} match(es) already started/completed — cascading will reset them cleanly.
                        </p>
                      )}
                      <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={forceCascade}
                          onChange={(e) => setForceCascade(e.target.checked)}
                          className="w-4 h-4 accent-rose-600"
                        />
                        <span>Cascade &amp; clear affected downstream matches</span>
                      </label>
                    </div>
                  )}

                  <div>
                    <label htmlFor="drawer-rewind-reason" className="block font-semibold text-slate-800 mb-1">
                      Reason for Correction
                    </label>
                    <input
                      id="drawer-rewind-reason"
                      type="text"
                      value={rewindReason}
                      onChange={(e) => setRewindReason(e.target.value)}
                      placeholder="e.g. Map 2 score entered backwards"
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={
                        busy ||
                        rewindReason.trim().length < 4 ||
                        (downstreamInfo.startedDownstream.length > 0 && !forceCascade)
                      }
                      onClick={handleRewindMatch}
                      className="min-h-[36px] px-4 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                    >
                      Rewind Result for Re-Entry
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Flag Dispute */}
          {match.status !== "disputed" && (
            <div className="pt-2 border-t border-slate-200 space-y-2.5">
              {!disputeOpen ? (
                <button
                  type="button"
                  onClick={() => setDisputeOpen(true)}
                  className="min-h-[36px] px-3 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <AlertOctagon size={13} />
                  <span>Flag Match Dispute</span>
                </button>
              ) : (
                <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/70 space-y-2.5 text-xs">
                  <label htmlFor="drawer-dispute-reason" className="block font-semibold text-rose-900">
                    Freeze match &amp; record dispute reason
                  </label>
                  <textarea
                    id="drawer-dispute-reason"
                    rows={2}
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="Disconnect, rule violation, or score objection..."
                    className="w-full p-2.5 rounded-lg border border-rose-300 bg-white text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDisputeOpen(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy || disputeReason.trim().length < 4}
                      onClick={handleFlagDispute}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                    >
                      Submit Dispute
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
