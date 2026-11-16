import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { formatIstDateTime, isMatchScheduled } from "@/lib/scheduling";
import {
  COMPETITION_MODE_LABELS,
  FORMAT_LABELS,
  isBattleRoyaleTournament,
  parseTournamentScoringRules,
  type EsportsSectionId,
  type EsportsWorkspaceSharedData,
} from "./types";
import type { CompetitionMode, TournamentFormat, TournamentScoringMode } from "@/types/database";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Crown,
  GitBranch,
  Play,
  Save,
  Settings2,
  ShieldAlert,
} from "lucide-react";

interface OverviewProps {
  data: EsportsWorkspaceSharedData;
  onNavigate: (sec: EsportsSectionId) => void;
}

export function TournamentOverviewSection({ data, onNavigate }: OverviewProps) {
  const {
    selectedGame,
    tournament,
    hasPersistedTournament,
    approvedTeams,
    selectedTeams,
    matches,
    disputes,
    teamMap,
  } = data;

  const isBr = isBattleRoyaleTournament(tournament, selectedGame);
  const scheduledMatches = matches.filter((m) => isMatchScheduled(m));
  const unscheduledMatches = matches.filter((m) => !isMatchScheduled(m) && m.status !== "completed" && m.status !== "cancelled");
  const liveCount = matches.filter((m) => m.status === "live").length;
  const confirmQueueCount = matches.filter((m) => m.status === "result_submitted").length;
  const completedCount = matches.filter((m) => m.status === "completed").length;
  const openDisputeCount = disputes.filter(
    (d) => d.status !== "resolved" && matches.some((m) => m.id === d.match_id)
  ).length;

  const championTeam = tournament.champion_team_id ? teamMap.get(tournament.champion_team_id) : null;
  const nextScheduled = scheduledMatches
    .filter((m) => ["upcoming", "scheduled", "check_in", "ready"].includes(m.status))
    .slice(0, 5);

  const workflowSteps = [
    {
      step: "01",
      title: "Tournament Setup",
      done: hasPersistedTournament,
      detail: hasPersistedTournament
        ? `${FORMAT_LABELS[tournament.format] || tournament.format} · ${tournament.total_rounds || 1} round(s)`
        : "Configure format, rules & BR points",
      target: "setup" as EsportsSectionId,
    },
    {
      step: "02",
      title: "Team Selection",
      done: selectedTeams.length >= 2,
      detail: `${selectedTeams.length} selected / ${approvedTeams.length} approved`,
      target: "teams" as EsportsSectionId,
    },
    {
      step: "03",
      title: "Bracket & Pairing",
      done: matches.length > 0,
      detail: matches.length > 0 ? `${matches.length} fixtures built` : "Auto-pair teams cleanly",
      target: "bracket" as EsportsSectionId,
    },
    {
      step: "04",
      title: "IST Scheduling",
      done: matches.length > 0 && unscheduledMatches.length === 0,
      detail:
        matches.length === 0
          ? "Awaiting fixtures"
          : unscheduledMatches.length > 0
          ? `${unscheduledMatches.length} awaiting IST slot`
          : `All ${scheduledMatches.length} matches scheduled`,
      target: "schedule" as EsportsSectionId,
    },
    {
      step: "05",
      title: "Play & Confirmation",
      done: matches.length > 0 && completedCount === matches.length,
      detail: `${completedCount}/${matches.length} completed · ${confirmQueueCount} pending confirm`,
      target: "matches" as EsportsSectionId,
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-mono uppercase text-slate-500 block">Approved Squads</span>
          <span className="text-2xl font-display font-bold text-slate-900 font-mono tabular-nums mt-1 block">
            {approvedTeams.length}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-mono uppercase text-slate-500 block">Selected Active</span>
          <span className="text-2xl font-display font-bold text-blue-700 font-mono tabular-nums mt-1 block">
            {selectedTeams.length}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-mono uppercase text-slate-500 block">Unscheduled</span>
          <span className="text-2xl font-display font-bold text-amber-700 font-mono tabular-nums mt-1 block">
            {unscheduledMatches.length}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-mono uppercase text-slate-500 block">Live Matches</span>
          <span className="text-2xl font-display font-bold text-orange-700 font-mono tabular-nums mt-1 block">
            {liveCount}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-mono uppercase text-slate-500 block">Needs Confirm</span>
          <span className="text-2xl font-display font-bold text-indigo-700 font-mono tabular-nums mt-1 block">
            {confirmQueueCount}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-[11px] font-mono uppercase text-slate-500 block">Completed</span>
          <span className="text-2xl font-display font-bold text-emerald-700 font-mono tabular-nums mt-1 block">
            {completedCount}
          </span>
        </div>
      </div>

      {/* Champion Banner if crowned */}
      {championTeam && (
        <div className="bg-[#0B1120] text-white rounded-xl p-5 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
              <Crown size={22} />
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-amber-300 block">
                {selectedGame?.title} Tournament Champion
              </span>
              <h3 className="text-lg font-display font-bold text-white m-0 mt-0.5">
                {championTeam.team_name}
              </h3>
              <span className="text-xs text-slate-300">
                {championTeam.institution || "Collegiate Squad"} · {championTeam.registration_ref}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("standings")}
            className="min-h-[40px] px-4 rounded-lg bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
          >
            View Final Standings
          </button>
        </div>
      )}

      {/* Alerts: Open Disputes or Pending Confirmations */}
      {(openDisputeCount > 0 || confirmQueueCount > 0 || unscheduledMatches.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {openDisputeCount > 0 && (
            <button
              type="button"
              onClick={() => onNavigate("disputes")}
              className="text-left p-4 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100/70 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-rose-900 font-semibold text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldAlert size={15} />
                  {openDisputeCount} Open Dispute(s)
                </span>
                <ChevronRight size={14} />
              </div>
              <p className="text-xs text-rose-800 mt-1 mb-0">
                Bracket progression frozen for disputed match(es). Review & resolve now.
              </p>
            </button>
          )}
          {confirmQueueCount > 0 && (
            <button
              type="button"
              onClick={() => onNavigate("live")}
              className="text-left p-4 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100/70 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-blue-900 font-semibold text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 size={15} />
                  {confirmQueueCount} Result(s) Awaiting Approval
                </span>
                <ChevronRight size={14} />
              </div>
              <p className="text-xs text-blue-800 mt-1 mb-0">
                Conductors submitted scores. Confirm to advance bracket & publish results.
              </p>
            </button>
          )}
          {unscheduledMatches.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate("schedule")}
              className="text-left p-4 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100/70 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-amber-900 font-semibold text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={15} />
                  {unscheduledMatches.length} Match(es) Unscheduled
                </span>
                <ChevronRight size={14} />
              </div>
              <p className="text-xs text-amber-800 mt-1 mb-0">
                Assign IST dates, start times, arenas, and conductors in Schedule Calendar.
              </p>
            </button>
          )}
        </div>
      )}

      {/* End-to-End Workflow Progress Stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-display font-bold text-slate-900 m-0">
              {selectedGame?.title} Tournament Pipeline
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 m-0">
              Format: {FORMAT_LABELS[tournament.format] || tournament.format} · Mode:{" "}
              {isBr ? "Battle Royale Points" : "Matchup / Bracket"} · Timezone: Asia/Kolkata (IST)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate("setup")}
              className="min-h-[38px] px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Settings2 size={14} />
              <span>Edit Setup</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate(matches.length === 0 ? "bracket" : "matches")}
              className="min-h-[38px] px-3.5 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {matches.length === 0 ? <GitBranch size={14} /> : <Play size={14} />}
              <span>{matches.length === 0 ? "Build Fixtures" : "Open Match Control"}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {workflowSteps.map((s) => (
            <button
              key={s.step}
              type="button"
              onClick={() => onNavigate(s.target)}
              className="text-left p-3.5 rounded-xl border border-slate-200 hover:border-slate-400 bg-slate-50/50 transition-colors cursor-pointer flex flex-col justify-between gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-slate-500">{s.step}</span>
                <span
                  className={`text-[11px] font-medium ${
                    s.done ? "text-emerald-700" : "text-slate-500"
                  }`}
                >
                  {s.done ? "Ready" : "Pending"}
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">{s.title}</div>
                <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">{s.detail}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Upcoming IST Schedule Snapshot */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-display font-bold text-slate-900 m-0">
            Next Scheduled Matches (IST)
          </h3>
          <button
            type="button"
            onClick={() => onNavigate("schedule")}
            className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer bg-transparent border-0"
          >
            Open Full Calendar →
          </button>
        </div>

        {nextScheduled.length === 0 ? (
          <p className="text-xs text-slate-500 m-0 py-3">
            No upcoming IST matches scheduled yet for {selectedGame?.title}. Use Schedule Calendar to assign timeslots.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-mono uppercase text-slate-500">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Round</th>
                  <th className="py-2 pr-3">Matchup / Lobby</th>
                  <th className="py-2 pr-3">IST Schedule</th>
                  <th className="py-2 pr-3">Arena</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nextScheduled.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                      {m.match_code || `#${m.match_number || 1}`}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700 whitespace-nowrap">{m.round}</td>
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">
                      {m.bracket_side === "battle_royale"
                        ? `BR Lobby (${m.br_results?.length || selectedTeams.length} squads)`
                        : `${teamMap.get(m.team_a_id || "")?.team_name || "TBD"} vs ${
                            teamMap.get(m.team_b_id || "")?.team_name || "TBD"
                          }`}
                    </td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatIstDateTime(m.scheduled_start)}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">{m.station || "TBD"}</td>
                    <td className="py-2.5 whitespace-nowrap capitalize font-medium text-slate-700">
                      {m.status.replace(/_/g, " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface SetupProps {
  data: EsportsWorkspaceSharedData;
  canManageSetup: boolean;
  onSaved: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}

export function TournamentSetupSection({ data, canManageSetup, onSaved, onError }: SetupProps) {
  const { selectedGame, tournament, hasPersistedTournament, matches, approvedTeams } = data;
  const parsedRules = parseTournamentScoringRules(tournament, selectedGame);

  const [name, setName] = useState(tournament.name);
  const [format, setFormat] = useState<TournamentFormat>(tournament.format);
  const [scoringMode, setScoringMode] = useState<TournamentScoringMode>(tournament.scoring_mode);
  const [competitionMode, setCompetitionMode] = useState<CompetitionMode>(
    (tournament.competition_mode as CompetitionMode) || "team"
  );
  const [seedingMode, setSeedingMode] = useState<"manual" | "random" | "registration_order">(
    tournament.seeding_mode || "registration_order"
  );
  const [approvedTeamLimit, setApprovedTeamLimit] = useState<string>(
    tournament.approved_team_limit ? String(tournament.approved_team_limit) : ""
  );
  const [totalRounds, setTotalRounds] = useState<number>(tournament.total_rounds || 3);
  const [matchDuration, setMatchDuration] = useState<number>(selectedGame?.match_duration_minutes || 30);
  const [startDate, setStartDate] = useState<string>(tournament.start_date || "2026-11-20");
  const [requireConfirm, setRequireConfirm] = useState<boolean>(
    tournament.require_manager_confirmation !== false
  );
  const [tournamentStatus, setTournamentStatus] = useState<string>(tournament.status || "open");
  const [bestOf, setBestOf] = useState<string>(parsedRules.bestOf);
  const [pointsPerKill, setPointsPerKill] = useState<number>(parsedRules.pointsPerKill);
  const [teamsPerLobby, setTeamsPerLobby] = useState<number>(parsedRules.teamsPerLobby);
  const [placementTable, setPlacementTable] = useState<Record<number, number>>(parsedRules.placementPoints);
  const [winPoints, setWinPoints] = useState<number>(parsedRules.winPoints);
  const [drawPoints, setDrawPoints] = useState<number>(parsedRules.drawPoints);
  const [lossPoints, setLossPoints] = useState<number>(parsedRules.lossPoints);
  const [gameRulesText, setGameRulesText] = useState<string>(selectedGame?.rules || "");
  const [saving, setSaving] = useState(false);

  // Sync form state whenever selected game or persisted tournament changes
  useEffect(() => {
    const r = parseTournamentScoringRules(tournament, selectedGame);
    setName(tournament.name || `${selectedGame?.title || "Esports"} Championship`);
    setFormat(tournament.format || "single_elimination");
    setScoringMode(tournament.scoring_mode || "round_based");
    setCompetitionMode((tournament.competition_mode as CompetitionMode) || "team");
    setSeedingMode(tournament.seeding_mode || "registration_order");
    setApprovedTeamLimit(tournament.approved_team_limit ? String(tournament.approved_team_limit) : "");
    setTotalRounds(tournament.total_rounds || (tournament.format === "battle_royale" ? 3 : 1));
    setMatchDuration(selectedGame?.match_duration_minutes || 30);
    setStartDate(tournament.start_date || "2026-11-20");
    setRequireConfirm(tournament.require_manager_confirmation !== false);
    setTournamentStatus(tournament.status || "open");
    setBestOf(r.bestOf);
    setPointsPerKill(r.pointsPerKill);
    setTeamsPerLobby(r.teamsPerLobby);
    setPlacementTable(r.placementPoints);
    setWinPoints(r.winPoints);
    setDrawPoints(r.drawPoints);
    setLossPoints(r.lossPoints);
    setGameRulesText(selectedGame?.rules || "");
  }, [selectedGame?.id, tournament.id, tournament.updated_at]);

  const handleFormatChange = (nextFmt: TournamentFormat) => {
    setFormat(nextFmt);
    if (nextFmt === "battle_royale") {
      setScoringMode("battle_royale");
      setCompetitionMode("lobby_br");
      if (totalRounds < 2) setTotalRounds(3);
    } else if (nextFmt === "round_robin" || nextFmt === "group_knockout") {
      setScoringMode("group_points");
      if (competitionMode === "lobby_br") setCompetitionMode("team");
    } else {
      setScoringMode("round_based");
      if (competitionMode === "lobby_br") setCompetitionMode("team");
    }
  };

  const applyBrPreset = (preset: "free_fire" | "bgmi") => {
    setFormat("battle_royale");
    setScoringMode("battle_royale");
    setCompetitionMode("lobby_br");
    setBestOf("BR Lobby");
    if (preset === "free_fire") {
      setPlacementTable({ 1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1 });
      setPointsPerKill(1);
      setTeamsPerLobby(12);
    } else {
      setPlacementTable({ 1: 15, 2: 12, 3: 10, 4: 8, 5: 6, 6: 4, 7: 2, 8: 1 });
      setPointsPerKill(1);
      setTeamsPerLobby(16);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManageSetup || !selectedGame) return;
    setSaving(true);

    const teamLimitNum = approvedTeamLimit.trim() ? Math.max(2, Number(approvedTeamLimit)) : null;
    const rulesSnapshot = {
      best_of: bestOf,
      points_per_kill: Math.max(0, pointsPerKill),
      teams_per_lobby: Math.max(2, Math.min(100, Math.trunc(teamsPerLobby || 12))),
      placement_points: placementTable,
      win_points: winPoints,
      draw_points: drawPoints,
      loss_points: lossPoints,
    };

    try {
      const payload = {
        game_id: selectedGame.id,
        name: name.trim() || `${selectedGame.title} Tournament`,
        format,
        scoring_mode: scoringMode,
        seeding_mode: seedingMode,
        competition_mode: competitionMode,
        approved_team_limit: teamLimitNum,
        total_rounds: Math.max(1, Math.min(12, Math.trunc(totalRounds || 1))),
        start_date: startDate || "2026-11-20",
        require_manager_confirmation: requireConfirm,
        rules_snapshot: rulesSnapshot,
        status: tournamentStatus,
      };

      if (hasPersistedTournament) {
        const { error: tErr } = await supabase
          .from("tournaments")
          .update(payload)
          .eq("id", tournament.id);
        if (tErr) throw tErr;
      } else {
        const { error: tErr } = await supabase.from("tournaments").insert(payload);
        if (tErr) throw tErr;
      }

      const { error: gErr } = await supabase
        .from("games")
        .update({
          match_format: format,
          scoring_mode: scoringMode,
          scoring_config: rulesSnapshot,
          match_duration_minutes: Math.max(10, Math.min(240, Math.trunc(matchDuration || 30))),
          max_teams: teamLimitNum,
          tournament_status:
            tournamentStatus === "published" ? "open" : tournamentStatus === "locked" ? "in_progress" : tournamentStatus,
          rules: gameRulesText.trim() || null,
        })
        .eq("id", selectedGame.id);

      if (gErr) throw gErr;

      await onSaved(`Saved independent tournament setup for ${selectedGame.title}.`);
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "42703" || code === "PGRST204" || code === "23514") {
        onError(
          `Database schema needs migration 20261122000000_esports_control_centre_revamp.sql before saving "${format}" setup fields. (${err.message})`
        );
      } else {
        onError(`Failed to save tournament setup: ${err?.message || "Unknown database error"}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900 m-0">
              {selectedGame?.title} Tournament Configuration
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 m-0">
              Configured independently per game. Approved teams currently registered: {approvedTeams.length} · Matches built: {matches.length}.
            </p>
          </div>
          {!hasPersistedTournament && (
            <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
              Not yet saved to database — configure & save below
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Tournament Title</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Tournament Format</label>
            <select
              value={format}
              onChange={(e) => handleFormatChange(e.target.value as TournamentFormat)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-medium text-slate-900"
            >
              <option value="single_elimination">Single Elimination (Knockout)</option>
              <option value="double_elimination">Double Elimination (Upper + Lower)</option>
              <option value="round_robin">Round Robin League</option>
              <option value="battle_royale">Battle Royale (Multi-Round Lobby Points)</option>
              <option value="head_to_head">Head-to-Head Series (Clash Squad / TDM / 1v1)</option>
              <option value="group_knockout">Group Stage + Knockout</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Competition Mode</label>
            <select
              value={competitionMode}
              onChange={(e) => setCompetitionMode(e.target.value as CompetitionMode)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-medium text-slate-900"
            >
              {Object.entries(COMPETITION_MODE_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Scoring System</label>
            <select
              value={scoringMode}
              onChange={(e) => setScoringMode(e.target.value as TournamentScoringMode)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-medium text-slate-900"
            >
              <option value="round_based">Round-Based (Maps / Points)</option>
              <option value="battle_royale">Battle Royale (Placement + Kills)</option>
              <option value="group_points">League Points (Win / Draw / Loss)</option>
              <option value="custom">Custom Winner</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Seeding Method</label>
            <select
              value={seedingMode}
              onChange={(e) => setSeedingMode(e.target.value as any)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-medium text-slate-900"
            >
              <option value="registration_order">Registration Order (FCFS)</option>
              <option value="manual">Manual Seed Numbers</option>
              <option value="random">Random Draw (Deterministic Seed)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Tournament Status</label>
            <select
              value={tournamentStatus}
              onChange={(e) => setTournamentStatus(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-medium text-slate-900"
            >
              <option value="draft">Draft</option>
              <option value="open">Open / Ready</option>
              <option value="published">Published (Live Board Visible)</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Approved Team Limit</label>
            <input
              type="number"
              min={2}
              placeholder="Unlimited (all selected teams)"
              value={approvedTeamLimit}
              onChange={(e) => setApprovedTeamLimit(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              {format === "battle_royale" ? "Number of Lobby Rounds" : "Series / Rounds Count"}
            </label>
            <input
              type="number"
              min={1}
              max={12}
              value={totalRounds}
              onChange={(e) => setTotalRounds(Math.max(1, Number(e.target.value) || 1))}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Default Match Duration (min)</label>
            <input
              type="number"
              min={10}
              max={240}
              value={matchDuration}
              onChange={(e) => setMatchDuration(Math.max(10, Number(e.target.value) || 30))}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Tournament Start Date (IST)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Default Match Format</label>
            <select
              value={bestOf}
              onChange={(e) => setBestOf(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono"
            >
              <option value="BO1">Best of 1 (BO1)</option>
              <option value="BO3">Best of 3 (BO3)</option>
              <option value="BO5">Best of 5 (BO5)</option>
              <option value="BR Lobby">BR Lobby Scoring</option>
            </select>
          </div>

          <div className="flex items-end pb-1">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requireConfirm}
                onChange={(e) => setRequireConfirm(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 accent-slate-900"
              />
              <span className="font-medium text-slate-700">Require manager confirmation before advancement</span>
            </label>
          </div>
        </div>

        {/* Format-specific Scoring Config */}
        {scoringMode === "battle_royale" ? (
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 m-0">Battle Royale Point Matrix</h3>
                <p className="text-xs text-slate-500 m-0">
                  Cumulative standings across {totalRounds} lobby round(s). Placement points + (Kills x {pointsPerKill}).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyBrPreset("bgmi")}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Apply BGMI Standard (15/12/10...)
                </button>
                <button
                  type="button"
                  onClick={() => applyBrPreset("free_fire")}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Apply Free Fire Standard (12/9/8...)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-12 gap-2.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Teams / Lobby</label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={teamsPerLobby}
                  onChange={(e) => setTeamsPerLobby(Math.max(2, Number(e.target.value) || 12))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono text-center tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pts / Kill</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={pointsPerKill}
                  onChange={(e) => setPointsPerKill(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono text-center tabular-nums"
                />
              </div>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rank) => (
                <div key={rank}>
                  <label className="block font-mono text-[11px] text-slate-500 mb-1">#{rank} Place</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={placementTable[rank] ?? 0}
                    onChange={(e) =>
                      setPlacementTable((prev) => ({
                        ...prev,
                        [rank]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full h-9 px-2 rounded-lg border border-slate-300 font-mono text-center tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">League Win Points</label>
              <input
                type="number"
                min={0}
                value={winPoints}
                onChange={(e) => setWinPoints(Math.max(0, Number(e.target.value) || 0))}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">League Draw Points</label>
              <input
                type="number"
                min={0}
                value={drawPoints}
                onChange={(e) => setDrawPoints(Math.max(0, Number(e.target.value) || 0))}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">League Loss Points</label>
              <input
                type="number"
                min={0}
                value={lossPoints}
                onChange={(e) => setLossPoints(Math.max(0, Number(e.target.value) || 0))}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 font-mono tabular-nums"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Official Match & Tie-Breaker Ruleset
          </label>
          <textarea
            rows={3}
            value={gameRulesText}
            onChange={(e) => setGameRulesText(e.target.value)}
            placeholder="Map pool, overtime rules, BR tie-breaker order, disconnect policy..."
            className="w-full p-3 rounded-lg border border-slate-300 text-xs text-slate-900"
          />
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Changes apply immediately to Bracket Builder, Match Console, and Standings calculation for{" "}
            <strong className="text-slate-800">{selectedGame?.title}</strong>.
          </div>
          <button
            type="submit"
            disabled={!canManageSetup || saving}
            className="min-h-[42px] px-5 rounded-lg bg-[#0B1120] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Save size={14} />
            <span>{saving ? "Saving..." : "Save Tournament Setup"}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
