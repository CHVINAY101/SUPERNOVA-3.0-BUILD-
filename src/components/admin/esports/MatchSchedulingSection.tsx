import { useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { toUuidOrNull } from "@/lib/entryOperations";
import {
  computeEndIso,
  detectScheduleConflicts,
  formatIstDateOnly,
  formatIstTimeRange,
  isMatchScheduled,
  istInputsToIso,
  toIstDateInput,
  toIstTimeInput,
} from "@/lib/scheduling";
import { formatMatchDatabaseError } from "@/lib/matchOperations";
import type { EsportsWorkspaceSharedData } from "./types";
import type { Match } from "@/types/database";
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  MapPin,
  Search,
  ShieldAlert,
  UserCheck,
  X,
} from "lucide-react";

interface SchedulingProps {
  data: EsportsWorkspaceSharedData;
  canEditEsports: boolean;
  onRefresh: (msg?: string) => Promise<void>;
  onError: (msg: string) => void;
}

export function MatchSchedulingSection({
  data,
  canEditEsports,
  onRefresh,
  onError,
}: SchedulingProps) {
  const { selectedGame, matches, allMatches, selectedTeams, conductors, teamMap, tournament } = data;

  const [viewMode, setViewMode] = useState<"calendar" | "unscheduled">("calendar");
  const [roundFilter, setRoundFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Single Match Schedule / Reschedule modal state
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [istDate, setIstDate] = useState("2026-11-20");
  const [istTime, setIstTime] = useState("10:00");
  const [durationMin, setDurationMin] = useState(30);
  const [arena, setArena] = useState("Main Arena Stage");
  const [conductorId, setConductorId] = useState("");
  const [notes, setNotes] = useState("");
  const [ackWarnings, setAckWarnings] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Admin-approved sequential batch planner modal (never saves without explicit approval)
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [planDate, setPlanDate] = useState(tournament.start_date || "2026-11-20");
  const [planStartTime, setPlanStartTime] = useState("10:00");
  const [planGapMin, setPlanGapMin] = useState(10);
  const [planDurMin, setPlanDurMin] = useState(selectedGame?.match_duration_minutes || 30);
  const [planArena, setPlanArena] = useState("Main Arena Stage");
  const [applyingPlan, setApplyingPlan] = useState(false);

  const unscheduledMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          !isMatchScheduled(m) &&
          m.status !== "completed" &&
          m.status !== "cancelled" &&
          m.match_format !== "BYE"
      ),
    [matches]
  );

  const scheduledMatches = useMemo(
    () =>
      matches
        .filter((m) => isMatchScheduled(m))
        .sort((a, b) => (a.scheduled_start || "").localeCompare(b.scheduled_start || "")),
    [matches]
  );

  const roundOptions = useMemo(() => {
    const s = new Set<string>();
    matches.forEach((m) => m.round && s.add(m.round));
    return Array.from(s);
  }, [matches]);

  const filteredMatches = useMemo(() => {
    const base = viewMode === "unscheduled" ? unscheduledMatches : matches;
    const q = searchQuery.trim().toLowerCase();

    return base.filter((m) => {
      if (m.match_format === "BYE") return false;
      if (roundFilter !== "all" && m.round !== roundFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (teamFilter !== "all") {
        const inBr = Array.isArray(m.br_results) && m.br_results.some((r) => r.team_id === teamFilter);
        if (m.team_a_id !== teamFilter && m.team_b_id !== teamFilter && !inBr) return false;
      }
      if (q) {
        const code = (m.match_code || "").toLowerCase();
        const tA = (teamMap.get(m.team_a_id || "")?.team_name || "").toLowerCase();
        const tB = (teamMap.get(m.team_b_id || "")?.team_name || "").toLowerCase();
        const rnd = (m.round || "").toLowerCase();
        if (!code.includes(q) && !tA.includes(q) && !tB.includes(q) && !rnd.includes(q)) return false;
      }
      return true;
    });
  }, [viewMode, unscheduledMatches, matches, roundFilter, statusFilter, teamFilter, searchQuery, teamMap]);

  // Group scheduled matches by IST day for Calendar view
  const calendarDays = useMemo(() => {
    const groups = new Map<string, Match[]>();
    for (const m of filteredMatches) {
      if (!isMatchScheduled(m) || !m.scheduled_start) continue;
      const dayKey = toIstDateInput(m.scheduled_start);
      const arr = groups.get(dayKey) || [];
      arr.push(m);
      groups.set(dayKey, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredMatches]);

  const openScheduleModal = (m: Match) => {
    setEditingMatch(m);
    setIstDate(m.scheduled_start ? toIstDateInput(m.scheduled_start) : tournament.start_date || "2026-11-20");
    setIstTime(m.scheduled_start ? toIstTimeInput(m.scheduled_start) : "10:00");
    setDurationMin(m.duration_minutes || selectedGame?.match_duration_minutes || 30);
    setArena(m.station || "Main Arena Stage");
    setConductorId(m.conductor_id || "");
    setNotes(m.notes || "");
    setAckWarnings(false);
  };

  // Live conflict check for currently open modal
  const liveConflictReport = useMemo(() => {
    if (!editingMatch) return null;
    const startIso = istInputsToIso(istDate, istTime);
    if (!startIso) return null;
    const endIso = computeEndIso(startIso, durationMin);
    const brIds = Array.isArray(editingMatch.br_results)
      ? editingMatch.br_results.map((r) => r.team_id)
      : [];

    return detectScheduleConflicts(
      {
        matchId: editingMatch.id,
        startIso,
        endIso,
        durationMinutes: durationMin,
        teamAId: editingMatch.team_a_id,
        teamBId: editingMatch.team_b_id,
        brTeamIds: brIds,
        conductorId: conductorId || null,
        station: arena,
      },
      allMatches
    );
  }, [editingMatch, istDate, istTime, durationMin, arena, conductorId, allMatches]);

  const handleSaveSchedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingMatch || !canEditEsports) return;
    const startIso = istInputsToIso(istDate, istTime);
    if (!startIso) {
      onError("Invalid IST date or start time.");
      return;
    }
    if (liveConflictReport?.hasBlockingConflict) {
      onError("Team scheduling overlap detected. Resolve conflict before saving schedule.");
      return;
    }
    if (liveConflictReport?.hasWarning && !ackWarnings) {
      onError("Please acknowledge conductor/arena overlap warning before saving.");
      return;
    }

    const endIso = computeEndIso(startIso, durationMin);
    const assignedCond = conductors.find((c) => c.user_id === conductorId);
    setSavingSchedule(true);
    try {
      const nextStatus = editingMatch.status === "upcoming" ? "scheduled" : editingMatch.status;
      const { error } = await supabase
        .from("matches")
        .update({
          scheduled_start: startIso,
          scheduled_end: endIso,
          duration_minutes: Math.max(10, Math.min(480, durationMin)),
          is_scheduled: true,
          station: arena.trim() || null,
          conductor_id: toUuidOrNull(conductorId),
          conductor_email: assignedCond?.email || null,
          notes: notes.trim() || null,
          status: nextStatus,
        })
        .eq("id", editingMatch.id);
      if (error) throw error;

      setEditingMatch(null);
      await onRefresh(
        `Scheduled ${editingMatch.match_code || editingMatch.round} for ${istDate} ${istTime} IST.`
      );
    } catch (err: any) {
      onError(`Schedule save failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleUnschedule = async (m: Match) => {
    if (!canEditEsports) return;
    try {
      const { error } = await supabase
        .from("matches")
        .update({
          scheduled_start: null,
          scheduled_end: null,
          is_scheduled: false,
          status: m.status === "scheduled" ? "upcoming" : m.status,
        })
        .eq("id", m.id);
      if (error) throw error;
      await onRefresh(`Moved ${m.match_code || m.round} back to Unscheduled queue.`);
    } catch (err: any) {
      onError(`Failed to unschedule: ${formatMatchDatabaseError(err)}`);
    }
  };

  // Sequential slot preview (Admin explicitly reviews & approves before writing)
  const proposedPlan = useMemo(() => {
    const baseIso = istInputsToIso(planDate, planStartTime);
    if (!baseIso) return [];
    let cursorMs = new Date(baseIso).getTime();
    const stepMs = (Math.max(10, planDurMin) + Math.max(0, planGapMin)) * 60_000;
    const durMs = Math.max(10, planDurMin) * 60_000;

    return unscheduledMatches.map((m) => {
      const sIso = new Date(cursorMs).toISOString();
      const eIso = new Date(cursorMs + durMs).toISOString();
      const report = detectScheduleConflicts(
        {
          matchId: m.id,
          startIso: sIso,
          endIso: eIso,
          durationMinutes: planDurMin,
          teamAId: m.team_a_id,
          teamBId: m.team_b_id,
          brTeamIds: Array.isArray(m.br_results) ? m.br_results.map((r) => r.team_id) : [],
          station: planArena,
        },
        allMatches
      );
      cursorMs += stepMs;
      return { match: m, startIso: sIso, endIso: eIso, report };
    });
  }, [unscheduledMatches, planDate, planStartTime, planDurMin, planGapMin, planArena, allMatches]);

  const handleApproveAndApplyPlan = async () => {
    if (!canEditEsports || proposedPlan.length === 0) return;
    if (proposedPlan.some((p) => p.report.hasBlockingConflict)) {
      onError("Cannot apply batch schedule: one or more proposed slots conflict with an already scheduled team match.");
      return;
    }

    setApplyingPlan(true);
    try {
      for (const item of proposedPlan) {
        const { error } = await supabase
          .from("matches")
          .update({
            scheduled_start: item.startIso,
            scheduled_end: item.endIso,
            duration_minutes: Math.max(10, planDurMin),
            is_scheduled: true,
            station: planArena.trim() || item.match.station || "Main Arena Stage",
            status: item.match.status === "upcoming" ? "scheduled" : item.match.status,
          })
          .eq("id", item.match.id);
        if (error) throw error;
      }
      setPlannerOpen(false);
      await onRefresh(`Applied admin-approved IST schedule to ${proposedPlan.length} match(es).`);
    } catch (err: any) {
      onError(`Batch schedule failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setApplyingPlan(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900 m-0">
              {selectedGame?.title} Scheduling Calendar (IST · Asia/Kolkata)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 m-0">
              Scheduled: <strong className="font-mono text-slate-800">{scheduledMatches.length}</strong> · Unscheduled Queue:{" "}
              <strong className="font-mono text-amber-700">{unscheduledMatches.length}</strong> · Team overlaps blocked automatically.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg p-1 bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                  viewMode === "calendar" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
                }`}
              >
                Calendar Timeline ({scheduledMatches.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("unscheduled")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                  viewMode === "unscheduled" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
                }`}
              >
                Unscheduled Queue ({unscheduledMatches.length})
              </button>
            </div>

            {canEditEsports && unscheduledMatches.length > 0 && (
              <button
                type="button"
                onClick={() => setPlannerOpen(true)}
                className="min-h-[38px] px-3.5 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <CalendarClock size={14} />
                <span>Plan Slots (With Approval)</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs pt-2 border-t border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, round, team..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-300"
            />
          </div>
          <select
            value={roundFilter}
            onChange={(e) => setRoundFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white"
          >
            <option value="all">All Rounds</option>
            {roundOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white"
          >
            <option value="all">All Teams</option>
            {selectedTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.team_name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="upcoming">Upcoming</option>
            <option value="scheduled">Scheduled</option>
            <option value="check_in">Check-in Open</option>
            <option value="ready">Ready</option>
            <option value="live">Live</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Unscheduled Queue View (or Banner on Calendar if unscheduled items exist) */}
      {viewMode === "unscheduled" ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 m-0">
            Unscheduled Matches Awaiting Admin IST Assignment ({filteredMatches.length})
          </h3>
          {filteredMatches.length === 0 ? (
            <p className="text-xs text-slate-500 m-0 py-6 text-center">
              All matches for {selectedGame?.title} have been scheduled.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredMatches.map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono font-bold text-slate-500">
                      {m.match_code || `#${m.match_number}`} · {m.round}
                    </div>
                    <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                      {m.bracket_side === "battle_royale"
                        ? `BR Lobby (${m.br_results?.length || 0} squads)`
                        : `${teamMap.get(m.team_a_id || "")?.team_name || "TBD"} vs ${
                            teamMap.get(m.team_b_id || "")?.team_name || "TBD"
                          }`}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Duration: {m.duration_minutes || 30} min · Format: {m.match_format || "BO1"}
                    </div>
                  </div>
                  {canEditEsports && (
                    <button
                      type="button"
                      onClick={() => openScheduleModal(m)}
                      className="min-h-[36px] px-3.5 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      Assign IST Slot
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {calendarDays.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center space-y-2">
              <Calendar size={28} className="mx-auto text-slate-400" />
              <p className="text-xs font-semibold text-slate-800 m-0">No Scheduled Matches Yet</p>
              <p className="text-xs text-slate-500 m-0">
                Switch to Unscheduled Queue ({unscheduledMatches.length}) or open Plan Slots to assign IST times.
              </p>
            </div>
          ) : (
            calendarDays.map(([dayKey, dayMatches]) => (
              <div key={dayKey} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-display font-bold text-slate-900">
                    {formatIstDateOnly(dayMatches[0].scheduled_start)} (IST)
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {dayMatches.length} scheduled match(es)
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {dayMatches.map((m) => {
                    const isBr = m.bracket_side === "battle_royale";
                    const cond = conductors.find((c) => c.user_id === m.conductor_id);
                    return (
                      <div
                        key={m.id}
                        className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 min-w-0">
                          <div className="font-mono text-xs font-bold text-blue-800 tabular-nums whitespace-nowrap">
                            {formatIstTimeRange(m.scheduled_start, m.scheduled_end, m.duration_minutes || 30)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-mono text-slate-500">
                              {m.match_code || `#${m.match_number}`} · {m.round} ·{" "}
                              <span className="capitalize font-semibold text-slate-700">
                                {m.status.replace(/_/g, " ")}
                              </span>
                            </div>
                            <div className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                              {isBr
                                ? `BR Lobby (${m.br_results?.length || 0} teams)`
                                : `${teamMap.get(m.team_a_id || "")?.team_name || "TBD"} vs ${
                                    teamMap.get(m.team_b_id || "")?.team_name || "TBD"
                                  }`}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                              {m.station && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin size={11} /> {m.station}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1">
                                <UserCheck size={11} />{" "}
                                {cond?.full_name || m.conductor_email || "Conductor Unassigned"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {canEditEsports && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => openScheduleModal(m)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
                            >
                              Reschedule
                            </button>
                            {!["live", "result_submitted", "completed"].includes(m.status) && (
                              <button
                                type="button"
                                onClick={() => handleUnschedule(m)}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                              >
                                Clear Slot
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Schedule / Reschedule Single Match Modal */}
      {editingMatch && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setEditingMatch(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">
                  Schedule Match (IST) · {editingMatch.match_code || editingMatch.round}
                </h3>
                <p className="text-xs text-slate-500 m-0 mt-0.5">
                  {editingMatch.bracket_side === "battle_royale"
                    ? `BR Lobby (${editingMatch.br_results?.length || 0} squads)`
                    : `${teamMap.get(editingMatch.team_a_id || "")?.team_name || "TBD"} vs ${
                        teamMap.get(editingMatch.team_b_id || "")?.team_name || "TBD"
                      }`}
                </p>
              </div>
              <button type="button" onClick={() => setEditingMatch(null)} className="p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date (IST)</label>
                  <input
                    type="date"
                    required
                    value={istDate}
                    onChange={(e) => setIstDate(e.target.value)}
                    className="w-full h-10 px-2.5 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Start Time (IST)</label>
                  <input
                    type="time"
                    required
                    value={istTime}
                    onChange={(e) => setIstTime(e.target.value)}
                    className="w-full h-10 px-2.5 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    min={10}
                    max={480}
                    required
                    value={durationMin}
                    onChange={(e) => setDurationMin(Math.max(10, Number(e.target.value) || 30))}
                    className="w-full h-10 px-2.5 rounded-lg border border-slate-300 font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Arena / Room</label>
                  <input
                    type="text"
                    value={arena}
                    onChange={(e) => setArena(e.target.value)}
                    placeholder="e.g. Main Stage / Room A"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Match Conductor</label>
                  <select
                    value={conductorId}
                    onChange={(e) => setConductorId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white"
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

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Scheduling / Room Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Lobby ID, stream instructions, check-in buffer..."
                  className="w-full p-2.5 rounded-lg border border-slate-300"
                />
              </div>

              {/* Conflict Checks */}
              {liveConflictReport?.hasBlockingConflict && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldAlert size={14} />
                    <span>Blocking Team Time Conflict</span>
                  </div>
                  {liveConflictReport.teamConflicts.map((c, idx) => (
                    <div key={idx}>{c.reason}</div>
                  ))}
                </div>
              )}

              {liveConflictReport?.hasWarning && !liveConflictReport.hasBlockingConflict && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    <span>Resource Overlap Warning</span>
                  </div>
                  {[...liveConflictReport.conductorConflicts, ...liveConflictReport.stationConflicts].map((w, i) => (
                    <div key={i}>{w.reason}</div>
                  ))}
                  <label className="flex items-center gap-2 pt-1 cursor-pointer font-semibold">
                    <input
                      type="checkbox"
                      checked={ackWarnings}
                      onChange={(e) => setAckWarnings(e.target.checked)}
                      className="w-4 h-4 accent-amber-700"
                    />
                    <span>I confirm this conductor/arena overlap is intentional</span>
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMatch(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    savingSchedule ||
                    Boolean(liveConflictReport?.hasBlockingConflict) ||
                    Boolean(liveConflictReport?.hasWarning && !ackWarnings)
                  }
                  className="px-4 py-2 rounded-lg bg-[#0B1120] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Clock size={14} />
                  <span>{savingSchedule ? "Saving..." : "Save IST Schedule"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Sequential Planner Modal (Explicit Admin Preview & Approval) */}
      {plannerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setPlannerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">
                  Sequential IST Slot Planner (Requires Approval)
                </h3>
                <p className="text-xs text-slate-500 m-0 mt-0.5">
                  Preview sequential IST timeslots for {unscheduledMatches.length} unscheduled match(es). Nothing is saved until you click Approve & Apply.
                </p>
              </div>
              <button type="button" onClick={() => setPlannerOpen(false)} className="p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">IST Date</label>
                <input
                  type="date"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Start (IST)</label>
                <input
                  type="time"
                  value={planStartTime}
                  onChange={(e) => setPlanStartTime(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dur (min)</label>
                <input
                  type="number"
                  min={10}
                  value={planDurMin}
                  onChange={(e) => setPlanDurMin(Math.max(10, Number(e.target.value) || 30))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Break (min)</label>
                <input
                  type="number"
                  min={0}
                  value={planGapMin}
                  onChange={(e) => setPlanGapMin(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-slate-700 mb-1">Default Arena</label>
              <input
                type="text"
                value={planArena}
                onChange={(e) => setPlanArena(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-300"
              />
            </div>

            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs">
              {proposedPlan.map((item) => (
                <div key={item.match.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-slate-800">
                      {item.match.match_code || `#${item.match.match_number}`}
                    </span>{" "}
                    · <span className="text-slate-600">{item.match.round}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono tabular-nums">
                    <span className={item.report.hasBlockingConflict ? "text-rose-700 font-bold" : "text-slate-800"}>
                      {formatIstTimeRange(item.startIso, item.endIso, planDurMin)}
                    </span>
                    {item.report.hasBlockingConflict && (
                      <span className="text-rose-700 font-sans font-semibold">Team Conflict</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPlannerOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={applyingPlan || proposedPlan.some((p) => p.report.hasBlockingConflict)}
                onClick={handleApproveAndApplyPlan}
                className="px-4 py-2 rounded-lg bg-[#0B1120] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 size={14} />
                <span>{applyingPlan ? "Applying..." : "Approve & Apply IST Schedule"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
