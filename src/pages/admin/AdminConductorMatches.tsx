import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import {
  authorizeConductorMatchOperation,
  calculateRoundBasedOutcome,
  escalateMatchDispute,
  submitMatchResultDraft,
} from "@/lib/tournamentEngine";
import type { Game, Match, MatchAttendance, Player, Registration } from "@/types/database";
import {
  Trophy,
  Play,
  CheckCircle2,
  AlertOctagon,
  Users,
  RefreshCw,
  Clock,
  Send,
  X,
  AlertTriangle,
  MapPin,
} from "lucide-react";

export default function AdminConductorMatches() {
  const { user, permissions, hasPermission } = useAuth();
  const isManagerInspector = hasPermission("tournament:confirm_results");
  const canVerifyRoster = hasPermission("conductor:verify_roster");
  const canStartMatch = hasPermission("conductor:start_match");
  const canSubmitResult = hasPermission("conductor:submit_result");
  const canReportDispute = hasPermission("conductor:report_dispute");

  const [matches, setMatches] = useState<Match[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<Registration[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<MatchAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [draftScoreA, setDraftScoreA] = useState<number>(0);
  const [draftScoreB, setDraftScoreB] = useState<number>(0);
  const [draftWinnerId, setDraftWinnerId] = useState<string>("");
  const [draftNotes, setDraftNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Dispute modal
  const [disputeTarget, setDisputeTarget] = useState<Match | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  const fetchConductorData = useCallback(async () => {
    try {
      const [mRes, gRes, tRes, pRes, aRes] = await Promise.all([
        supabase.from("matches").select("*").order("scheduled_start", { ascending: true }),
        supabase.from("games").select("*").order("sort_order", { ascending: true }),
        supabase.from("registrations").select("*"),
        supabase.from("players").select("*"),
        supabase.from("match_attendance").select("*"),
      ]);

      setMatches((mRes.data as Match[]) || []);
      setGames((gRes.data as Game[]) || []);
      setTeams((tRes.data as Registration[]) || []);
      setPlayers((pRes.data as Player[]) || []);
      if (!aRes.error && Array.isArray(aRes.data)) {
        setAttendance(aRes.data as MatchAttendance[]);
      }
    } catch (err) {
      console.warn("Conductor match load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "matches", onRefresh: fetchConductorData },
      { table: "match_attendance", onRefresh: fetchConductorData },
      { table: "match_disputes", onRefresh: fetchConductorData },
    ],
    "conductor-matches"
  );

  useEffect(() => {
    fetchConductorData();
  }, [fetchConductorData]);

  // Scope STRICTLY to assigned matches for Match Conductor role
  const visibleMatches = useMemo(() => {
    if (!user) return [];
    if (isManagerInspector) return matches;
    return matches.filter((m) => m.conductor_id === user.id);
  }, [matches, user, isManagerInspector]);

  const activeMatch = useMemo(() => {
    if (visibleMatches.length === 0) return null;
    return visibleMatches.find((m) => m.id === selectedMatchId) || visibleMatches[0];
  }, [visibleMatches, selectedMatchId]);

  useEffect(() => {
    if (!activeMatch) return;
    setDraftScoreA(activeMatch.score_a ?? 0);
    setDraftScoreB(activeMatch.score_b ?? 0);
    setDraftWinnerId(activeMatch.winner_id || "");
    setDraftNotes(activeMatch.notes || "");
  }, [activeMatch?.id]);

  const teamMap = useMemo(() => {
    const map = new Map<string, Registration>();
    teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  const gameMap = useMemo(() => {
    const map = new Map<string, Game>();
    games.forEach((g) => map.set(g.id, g));
    return map;
  }, [games]);

  const checkMatchAuth = (match: Match) => {
    return authorizeConductorMatchOperation({
      match,
      actorUserId: user?.id || "",
      permissions,
    });
  };

  const handleToggleAttendance = async (match: Match, registrationId: string, player: Player) => {
    if (!canVerifyRoster) return;
    const auth = checkMatchAuth(match);
    if (!auth.ok && !isManagerInspector) {
      setStatusMsg({ type: "error", text: auth.error });
      return;
    }

    const existing = attendance.find((a) => a.match_id === match.id && a.player_id === player.id);
    const nextPresent = !(existing?.present ?? false);

    try {
      const { error } = await supabase.from("match_attendance").upsert(
        {
          match_id: match.id,
          registration_id: registrationId,
          player_id: player.id,
          present: nextPresent,
          verified_by: user?.id || null,
          verified_at: new Date().toISOString(),
        },
        { onConflict: "match_id,player_id" }
      );
      if (error) throw error;
      await fetchConductorData();
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Attendance update failed: ${err?.message || "Ensure 20261114 migration is pushed."}`,
      });
    }
  };

  const handleTransitionStatus = async (match: Match, nextStatus: "ready" | "live") => {
    if (!canStartMatch) return;
    const auth = checkMatchAuth(match);
    if (!auth.ok && !isManagerInspector) {
      setStatusMsg({ type: "error", text: auth.error });
      return;
    }
    setSubmitting(true);
    setStatusMsg(null);
    try {
      const { error } = await supabase.from("matches").update({ status: nextStatus }).eq("id", match.id);
      if (error) throw error;
      setStatusMsg({
        type: "success",
        text: `Match "${match.round}" updated to ${nextStatus.toUpperCase()}.`,
      });
      await fetchConductorData();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Status update failed: ${err?.message || "Error"}` });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMatch || !canSubmitResult) return;

    const auth = checkMatchAuth(activeMatch);
    if (!auth.ok && !isManagerInspector) {
      setStatusMsg({ type: "error", text: auth.error });
      return;
    }

    const outcome = calculateRoundBasedOutcome({
      teamAId: activeMatch.team_a_id || "",
      teamBId: activeMatch.team_b_id || "",
      maps: [{ mapName: "Match Total", scoreA: draftScoreA, scoreB: draftScoreB }],
    });
    const chosenWinnerId = draftWinnerId || outcome.winnerId;

    const draft = submitMatchResultDraft({
      match: activeMatch,
      actorUserId: user?.id || "",
      permissions,
      scoreA: draftScoreA,
      scoreB: draftScoreB,
      winnerId: chosenWinnerId,
      requireManagerConfirmation: true,
      notes: draftNotes,
    });

    if (!draft.ok) {
      setStatusMsg({ type: "error", text: draft.error });
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);
    try {
      const { error } = await supabase
        .from("matches")
        .update({
          score_a: draft.updatedMatch.score_a,
          score_b: draft.updatedMatch.score_b,
          winner_id: draft.updatedMatch.winner_id,
          status: "result_submitted",
          result_status: "submitted",
          submitted_by: user?.id || null,
          submitted_at: draft.updatedMatch.submitted_at,
          notes: draftNotes.trim() || null,
        })
        .eq("id", activeMatch.id);

      if (error) throw error;

      setStatusMsg({
        type: "success",
        text: "Match result submitted for Esports Manager confirmation. Bracket advancement waits for manager approval.",
      });
      await fetchConductorData();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Result submission failed: ${err?.message || "Error"}` });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeTarget || !canReportDispute || !disputeReason.trim()) return;

    const esc = escalateMatchDispute({
      match: disputeTarget,
      reporterUserId: user?.id || "",
      reason: disputeReason.trim(),
    });
    if (!esc.ok) {
      setStatusMsg({ type: "error", text: esc.error });
      return;
    }

    setSubmitting(true);
    try {
      await supabase.from("match_disputes").insert({
        match_id: disputeTarget.id,
        reported_by: user?.id || null,
        reported_by_email: user?.email || "conductor@supernova.edu",
        reason: disputeReason.trim(),
        original_submission: esc.dispute.original_submission,
        status: "open",
      });

      await supabase
        .from("matches")
        .update({ status: "disputed", result_status: "disputed" })
        .eq("id", disputeTarget.id);

      setStatusMessageSafe({
        type: "success",
        text: "Dispute logged. Match progression is frozen until Esports Manager resolution.",
      });
      setDisputeTarget(null);
      setDisputeReason("");
      await fetchConductorData();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Dispute submission failed: ${err?.message || "Error"}` });
    } finally {
      setSubmitting(false);
    }
  };

  const setStatusMessageSafe = (msg: { type: "success" | "error"; text: string }) => {
    setStatusMsg(msg);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-orange-800 bg-orange-50 px-2.5 py-0.5 rounded border border-orange-200 inline-block">
            Match Conductor Console
          </span>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            {isManagerInspector ? "All Assigned Arena Matches" : "My Assigned Matches"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 m-0">
            Verify squad attendance, ready/start assigned matches, submit official scores for manager confirmation, or escalate disputes.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />
          <button
            type="button"
            onClick={fetchConductorData}
            className="min-h-[40px] px-3 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Sync</span>
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
            {statusMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMsg(null)} className="p-1 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-xs font-mono text-slate-500">
          Loading assigned matches...
        </div>
      ) : visibleMatches.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
          <Trophy size={32} className="mx-auto mb-2 text-slate-400" />
          <h3 className="text-base font-bold text-slate-900 m-0">No Assigned Matches Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Matches assigned to your account ({user?.email}) by the Esports Manager will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Assigned Match List */}
          <div className="lg:col-span-5 space-y-3">
            {visibleMatches.map((m) => {
              const teamA = teamMap.get(m.team_a_id || "");
              const teamB = teamMap.get(m.team_b_id || "");
              const game = gameMap.get(m.game_id || "");
              const isActive = activeMatch?.id === m.id;

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMatchId(m.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                    isActive
                      ? "bg-white border-slate-900 ring-2 ring-slate-900/10 shadow-xs"
                      : "bg-white border-slate-200/90 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                      {game?.title || "Esports"} · {m.round}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                        m.status === "live"
                          ? "bg-orange-50 text-orange-800 border-orange-300"
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

                  <div className="flex items-center justify-between gap-2 text-sm font-bold text-slate-900">
                    <span className="truncate">{teamA?.team_name || "TBD"}</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 shrink-0 tabular-nums">
                      {m.score_a} : {m.score_b}
                    </span>
                    <span className="truncate text-right">{teamB?.team_name || "TBD"}</span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 mt-2">
                    {m.station && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={11} /> {m.station}
                      </span>
                    )}
                    {m.scheduled_start && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />{" "}
                        {new Date(m.scheduled_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Active Match Operations Panel */}
          {activeMatch && (
            <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <span className="text-[11px] font-mono font-bold uppercase text-blue-700">
                    {gameMap.get(activeMatch.game_id || "")?.title || "Tournament"} · {activeMatch.round}
                  </span>
                  <h2 className="text-xl font-display font-black text-slate-900 m-0 mt-0.5">
                    {teamMap.get(activeMatch.team_a_id || "")?.team_name || "TBD"} vs{" "}
                    {teamMap.get(activeMatch.team_b_id || "")?.team_name || "TBD"}
                  </h2>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {canStartMatch && activeMatch.status !== "completed" && activeMatch.status !== "disputed" && (
                    <>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleTransitionStatus(activeMatch, "ready")}
                        className="min-h-[40px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
                      >
                        Mark Ready
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleTransitionStatus(activeMatch, "live")}
                        className="min-h-[40px] px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Play size={13} />
                        <span>Start Match</span>
                      </button>
                    </>
                  )}
                  {canReportDispute && activeMatch.status !== "disputed" && (
                    <button
                      type="button"
                      onClick={() => setDisputeTarget(activeMatch)}
                      className="min-h-[40px] px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <AlertOctagon size={13} />
                      <span>Report Dispute</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Roster & Attendance Verification */}
              <div className="space-y-3">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600 m-0 flex items-center gap-1.5">
                  <Users size={14} />
                  <span>Roster & Player Presence Verification</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[activeMatch.team_a_id, activeMatch.team_b_id].map((tid, idx) => {
                    const team = tid ? teamMap.get(tid) : null;
                    const roster = tid ? players.filter((p) => p.registration_id === tid) : [];
                    return (
                      <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="text-xs font-bold text-slate-900">
                          {team?.team_name || (idx === 0 ? "Team A TBD" : "Team B TBD")}
                        </div>
                        {roster.length === 0 ? (
                          <p className="text-[11px] text-slate-500 m-0">No players attached yet.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {roster.map((p) => {
                              const att = attendance.find(
                                (a) => a.match_id === activeMatch.id && a.player_id === p.id
                              );
                              const isPresent = Boolean(att?.present || p.check_in_status === "checked_in");
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  disabled={!canVerifyRoster}
                                  onClick={() => tid && handleToggleAttendance(activeMatch, tid, p)}
                                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs cursor-pointer ${
                                    isPresent
                                      ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold"
                                      : "bg-white border-slate-200 text-slate-700"
                                  }`}
                                >
                                  <span className="truncate">
                                    {p.player_name} {p.gamer_tag ? `(${p.gamer_tag})` : ""}
                                  </span>
                                  <span className="text-[10px] font-mono uppercase">
                                    {isPresent ? "Present" : "Mark"}
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

              {/* Score Submission Form */}
              <form onSubmit={handleSubmitResult} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 m-0">
                  Submit Match Result (Requires Manager Confirmation)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {teamMap.get(activeMatch.team_a_id || "")?.team_name || "Team A"} Score
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={draftScoreA}
                      onChange={(e) => setDraftScoreA(Number(e.target.value) || 0)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-base font-mono font-black text-center tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {teamMap.get(activeMatch.team_b_id || "")?.team_name || "Team B"} Score
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={draftScoreB}
                      onChange={(e) => setDraftScoreB(Number(e.target.value) || 0)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-base font-mono font-black text-center tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Declared Winner</label>
                    <select
                      value={draftWinnerId}
                      onChange={(e) => setDraftWinnerId(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                    >
                      <option value="">Auto from score</option>
                      {activeMatch.team_a_id && (
                        <option value={activeMatch.team_a_id}>
                          {teamMap.get(activeMatch.team_a_id)?.team_name || "Team A"}
                        </option>
                      )}
                      {activeMatch.team_b_id && (
                        <option value={activeMatch.team_b_id}>
                          {teamMap.get(activeMatch.team_b_id)?.team_name || "Team B"}
                        </option>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Match / Tie-breaker Notes</label>
                  <textarea
                    rows={2}
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder="Map scores, overtime details, or player substitutions..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      !canSubmitResult ||
                      activeMatch.status === "completed" ||
                      activeMatch.status === "disputed"
                    }
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#0B1120] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Send size={14} />
                    <span>
                      {activeMatch.status === "completed"
                        ? "Result Already Confirmed"
                        : activeMatch.status === "disputed"
                        ? "Frozen (Disputed)"
                        : "Submit Result for Confirmation"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Dispute Modal */}
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
            <h3 className="text-base font-bold text-rose-900 m-0">Escalate Match Dispute</h3>
            <p className="text-xs text-slate-600 m-0">
              Submitting a dispute freezes bracket progression for <strong>{disputeTarget.round}</strong> and preserves the original score submission for Esports Manager review.
            </p>
            <form onSubmit={handleReportDispute} className="space-y-3">
              <textarea
                required
                rows={3}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Describe technical issue, rule violation, or score objection..."
                className="w-full p-3 rounded-xl border border-slate-300 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDisputeTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                >
                  {submitting ? "Escalating..." : "Freeze Match & Log Dispute"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
