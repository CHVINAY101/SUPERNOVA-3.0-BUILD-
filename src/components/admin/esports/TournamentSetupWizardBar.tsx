import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  canRegenerateBracket,
  deriveTournamentWizardState,
  generateTournamentMatches,
  isTournamentStructureLocked,
  orderTeamsForBracket,
} from "@/lib/tournamentEngine";
import { formatMatchDatabaseError } from "@/lib/matchOperations";
import {
  COMPETITION_MODE_LABELS,
  FORMAT_LABELS,
  parseTournamentScoringRules,
  type EsportsSectionId,
  type EsportsWorkspaceSharedData,
} from "./types";
import type { CompetitionMode, TournamentFormat, TournamentScoringMode } from "@/types/database";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Globe,
  Play,
  RefreshCw,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";

interface TournamentSetupWizardBarProps {
  data: EsportsWorkspaceSharedData;
  canManageSetup: boolean;
  canCreateMatch: boolean;
  canConfirmResults: boolean;
  onRefresh: (msg?: string) => Promise<void>;
  onError: (msg: string) => void;
  onNavigate: (sec: EsportsSectionId) => void;
}

export function TournamentSetupWizardBar({
  data,
  canManageSetup,
  canCreateMatch,
  canConfirmResults,
  onRefresh,
  onError,
  onNavigate,
}: TournamentSetupWizardBarProps) {
  const { selectedGame, tournament, hasPersistedTournament, approvedTeams, selectedTeams, matches, conductors } =
    data;

  const wizard = deriveTournamentWizardState({
    tournament,
    hasPersistedTournament,
    selectedTeamCount: selectedTeams.length,
    approvedTeamCount: approvedTeams.length,
    matches,
  });

  const parsedRules = parseTournamentScoringRules(tournament, selectedGame);

  const [configOpen, setConfigOpen] = useState<boolean>(!hasPersistedTournament || matches.length === 0);
  const [format, setFormat] = useState<TournamentFormat>(tournament.format);
  const [scoringMode, setScoringMode] = useState<TournamentScoringMode>(tournament.scoring_mode);
  const [competitionMode, setCompetitionMode] = useState<CompetitionMode>(
    (tournament.competition_mode as CompetitionMode) || "team"
  );
  const [seedingMode, setSeedingMode] = useState<"manual" | "random" | "registration_order">(
    tournament.seeding_mode || "registration_order"
  );
  const [totalRounds, setTotalRounds] = useState<number>(tournament.total_rounds || 3);
  const [bestOf, setBestOf] = useState<string>(parsedRules.bestOf);
  const [pointsPerKill, setPointsPerKill] = useState<number>(parsedRules.pointsPerKill);
  const [teamsPerLobby, setTeamsPerLobby] = useState<number>(parsedRules.teamsPerLobby);
  const [qualificationCount, setQualificationCount] = useState<number>(parsedRules.qualificationCount);
  const [placementTable, setPlacementTable] = useState<Record<number, number>>(parsedRules.placementPoints);
  const [defaultStation, setDefaultStation] = useState("Main Arena Stage");
  const [defaultConductorId, setDefaultConductorId] = useState("");
  const [requireConfirm, setRequireConfirm] = useState<boolean>(tournament.require_manager_confirmation !== false);

  const [savingConfig, setSavingConfig] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [regenReason, setRegenReason] = useState("");

  useEffect(() => {
    const r = parseTournamentScoringRules(tournament, selectedGame);
    setFormat(tournament.format || "single_elimination");
    setScoringMode(tournament.scoring_mode || "round_based");
    setCompetitionMode((tournament.competition_mode as CompetitionMode) || "team");
    setSeedingMode(tournament.seeding_mode || "registration_order");
    setTotalRounds(tournament.total_rounds || (tournament.format === "battle_royale" ? 3 : 1));
    setBestOf(r.bestOf);
    setPointsPerKill(r.pointsPerKill);
    setTeamsPerLobby(r.teamsPerLobby);
    setQualificationCount(r.qualificationCount);
    setPlacementTable(r.placementPoints);
    setRequireConfirm(tournament.require_manager_confirmation !== false);
  }, [selectedGame?.id, tournament.id, tournament.updated_at]);

  const orderedEligible = orderTeamsForBracket(selectedTeams, seedingMode, selectedGame?.id || "sn3");
  const structureLocked = isTournamentStructureLocked(tournament, matches);

  const handleFormatChange = (nextFmt: TournamentFormat) => {
    setFormat(nextFmt);
    if (nextFmt === "battle_royale") {
      setScoringMode("battle_royale");
      setCompetitionMode("lobby_br");
      setBestOf("BR Lobby");
      if (totalRounds < 2) setTotalRounds(3);
    } else if (nextFmt === "round_robin" || nextFmt === "group_knockout") {
      setScoringMode("group_points");
      if (competitionMode === "lobby_br") setCompetitionMode("team");
      if (bestOf === "BR Lobby") setBestOf("BO1");
    } else {
      setScoringMode("round_based");
      if (competitionMode === "lobby_br") setCompetitionMode("team");
      if (bestOf === "BR Lobby") setBestOf("BO1");
    }
  };

  const applyBrPreset = (preset: "bgmi" | "free_fire") => {
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

  const persistSetup = async (quiet = false): Promise<string | null> => {
    if (!selectedGame) return null;
    const rulesSnapshot = {
      ...((tournament.rules_snapshot as Record<string, any> | null) || {}),
      best_of: bestOf,
      points_per_kill: Math.max(0, pointsPerKill),
      teams_per_lobby: Math.max(2, Math.min(100, Math.trunc(teamsPerLobby || 12))),
      qualification_count: Math.max(0, Math.trunc(qualificationCount || 0)),
      placement_points: placementTable,
    };

    const payload = {
      game_id: selectedGame.id,
      name: tournament.name || `${selectedGame.title} Championship`,
      format,
      scoring_mode: scoringMode,
      seeding_mode: seedingMode,
      competition_mode: competitionMode,
      total_rounds: Math.max(1, Math.min(12, Math.trunc(totalRounds || 1))),
      require_manager_confirmation: requireConfirm,
      rules_snapshot: rulesSnapshot,
      status: hasPersistedTournament ? tournament.status : "open",
    };

    let realId = hasPersistedTournament ? tournament.id : null;
    if (realId) {
      const { error } = await supabase.from("tournaments").update(payload).eq("id", realId);
      if (error) throw error;
    } else {
      const { data: created, error } = await supabase.from("tournaments").insert(payload).select("id").single();
      if (error) throw error;
      realId = created?.id || null;
    }

    await supabase
      .from("games")
      .update({
        match_format: format,
        scoring_mode: scoringMode,
        scoring_config: rulesSnapshot,
      })
      .eq("id", selectedGame.id);

    if (!quiet) {
      await onRefresh(`Saved format & scoring setup for ${selectedGame.title}.`);
    }
    return realId;
  };

  const handleSaveConfig = async () => {
    if (!canManageSetup || !selectedGame) return;
    setSavingConfig(true);
    try {
      await persistSetup(false);
    } catch (err: any) {
      onError(`Failed to save setup: ${err?.message || "Database error"}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleGenerateMatches = async (forceOverride: boolean) => {
    if (!canCreateMatch || !selectedGame) return;
    const regenCheck = canRegenerateBracket({
      tournament,
      existingMatches: matches,
      confirmedStructuralOverride: forceOverride,
    });
    if (!regenCheck.ok) {
      onError(regenCheck.error);
      return;
    }

    setGenerating(true);
    try {
      const realTournamentId = await persistSetup(true);
      const generated = generateTournamentMatches({
        tournamentId: realTournamentId || selectedGame.id,
        gameId: selectedGame.id,
        gameTitle: selectedGame.title,
        format,
        teams: selectedTeams,
        seedingMode,
        approvedTeamLimit: tournament.approved_team_limit || null,
        shuffleSeed: `${selectedGame.id}-${Date.now()}`,
        matchFormatLabel: bestOf,
        defaultStation,
        defaultConductorId: defaultConductorId || null,
        matchDurationMinutes: selectedGame.match_duration_minutes || 30,
        totalRounds,
        teamsPerLobby: format === "battle_royale" ? Math.max(2, teamsPerLobby) : undefined,
        leaveUnscheduled: true,
        isPublished: false,
      });

      if (!generated.ok) {
        onError(generated.error);
        return;
      }

      if (matches.length > 0) {
        const { error: delErr } = await supabase.from("matches").delete().eq("game_id", selectedGame.id);
        if (delErr) throw delErr;
      }

      const defaultConductor = conductors.find((c) => c.user_id === defaultConductorId);
      const rowsToInsert = generated.matches.map((m) => ({
        id: m.id,
        ...(realTournamentId ? { tournament_id: realTournamentId } : {}),
        game_id: m.game_id,
        match_code: m.match_code,
        bracket_position: m.bracket_position,
        round: m.round,
        round_number: m.round_number,
        match_number: m.match_number,
        bracket_side: m.bracket_side,
        group_name: m.group_name,
        team_a_id: m.team_a_id,
        team_b_id: m.team_b_id,
        br_results: m.br_results,
        scheduled_start: m.scheduled_start,
        scheduled_end: m.scheduled_end,
        duration_minutes: m.duration_minutes,
        is_scheduled: m.is_scheduled,
        station: m.station,
        conductor_id: m.conductor_id,
        conductor_email: defaultConductor?.email || null,
        match_format: m.match_format,
        score_a: m.score_a,
        score_b: m.score_b,
        winner_id: m.winner_id,
        status: m.status,
        result_status: "pending",
        next_match_id: m.next_match_id,
        next_match_slot: m.next_match_slot,
        loser_next_match_id: m.loser_next_match_id,
        loser_next_match_slot: m.loser_next_match_slot,
        is_published: false,
      }));

      const { error: insErr } = await supabase.from("matches").insert(rowsToInsert);
      if (insErr) throw insErr;

      if (realTournamentId) {
        await supabase
          .from("tournaments")
          .update({
            format,
            seeding_mode: seedingMode,
            has_started: false,
            champion_team_id: null,
            status: "open",
          })
          .eq("id", realTournamentId);
      }

      setConfirmRegenOpen(false);
      setRegenReason("");
      setConfigOpen(false);
      await onRefresh(
        `Generated ${generated.matches.length} ${FORMAT_LABELS[format]} match(es) for ${selectedGame.title}. Review bracket below, then click Publish Tournament.`
      );
    } catch (err: any) {
      onError(`Fixture generation failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handlePublishTournament = async () => {
    if (!canManageSetup || !selectedGame || matches.length === 0) return;
    setPublishing(true);
    try {
      const realId = await persistSetup(true);
      const { error: mErr } = await supabase
        .from("matches")
        .update({ is_published: true })
        .eq("game_id", selectedGame.id);
      if (mErr) throw mErr;

      if (realId) {
        const nextStatus = tournament.has_started ? "in_progress" : "published";
        const { error: tErr } = await supabase
          .from("tournaments")
          .update({ status: nextStatus })
          .eq("id", realId);
        if (tErr) throw tErr;
      }

      await onRefresh(`Published ${selectedGame.title} fixtures and IST schedule to the Public Live Board.`);
    } catch (err: any) {
      onError(`Publish failed: ${err?.message || "Database error"}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleStartTournament = async () => {
    if (!canConfirmResults && !canManageSetup) return;
    if (!selectedGame || matches.length === 0) return;
    setStarting(true);
    try {
      const realId = await persistSetup(true);
      await supabase.from("matches").update({ is_published: true }).eq("game_id", selectedGame.id);
      if (realId) {
        const { error } = await supabase
          .from("tournaments")
          .update({ has_started: true, status: "in_progress" })
          .eq("id", realId);
        if (error) throw error;
      }
      await supabase
        .from("games")
        .update({ tournament_status: "in_progress" })
        .eq("id", selectedGame.id);

      await onRefresh(`${selectedGame.title} tournament started! Live scoring and standings are now unlocked.`);
    } catch (err: any) {
      onError(`Could not start tournament: ${err?.message || "Database error"}`);
    } finally {
      setStarting(false);
    }
  };

  const handlePrimaryWizardAction = () => {
    switch (wizard.currentStepId) {
      case "select_teams":
        onNavigate("teams");
        break;
      case "choose_format":
      case "configure_rules":
      case "generate_matches":
        setConfigOpen(true);
        break;
      case "publish_tournament":
        handlePublishTournament();
        break;
      case "start_tournament":
        if (!wizard.allCompleted) {
          handleStartTournament();
        } else {
          onNavigate("live_results");
        }
        break;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      {/* Header & Next Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
            Step {wizard.currentStepNumber} of 6 · {selectedGame?.title} Workflow
          </div>
          <h2 className="text-base font-display font-bold text-slate-900 m-0 mt-0.5">
            {wizard.nextActionLabel}
          </h2>
          <p className="text-xs text-slate-600 m-0 mt-0.5">{wizard.nextActionSummary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setConfigOpen((v) => !v)}
            className="min-h-[38px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <SlidersHorizontal size={13} />
            <span>{configOpen ? "Hide Setup & Generator" : "Configure Format & Generate"}</span>
            {configOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>

          {matches.length > 0 && !tournament.has_started && (
            <>
              <button
                type="button"
                disabled={publishing || !canManageSetup}
                onClick={handlePublishTournament}
                className="min-h-[38px] px-3.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-40"
              >
                <Globe size={13} />
                <span>{publishing ? "Publishing..." : "Publish Tournament"}</span>
              </button>
              <button
                type="button"
                disabled={starting || (!canConfirmResults && !canManageSetup)}
                onClick={handleStartTournament}
                className="min-h-[38px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-40"
              >
                <Play size={13} />
                <span>{starting ? "Starting..." : "Start Tournament"}</span>
              </button>
            </>
          )}

          {(matches.length === 0 || wizard.allCompleted) && (
            <button
              type="button"
              onClick={handlePrimaryWizardAction}
              className="min-h-[38px] px-4 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <span>{wizard.nextActionLabel}</span>
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 6-Step Horizontal Stepper */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {wizard.steps.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              if (s.id === "select_teams") onNavigate("teams");
              else if (s.id === "choose_format" || s.id === "configure_rules" || s.id === "generate_matches") {
                setConfigOpen(true);
              } else if (s.id === "publish_tournament" && matches.length > 0) {
                handlePublishTournament();
              } else if (s.id === "start_tournament" && matches.length > 0 && !tournament.has_started) {
                handleStartTournament();
              }
            }}
            className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
              s.active
                ? "border-slate-900 bg-slate-900 text-white"
                : s.done
                ? "border-emerald-200 bg-emerald-50/50 text-slate-900"
                : "border-slate-200 bg-slate-50/60 text-slate-600 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between text-[10px] font-mono uppercase">
              <span className={s.active ? "text-slate-300" : "text-slate-500"}>Step {s.stepNumber}</span>
              {s.done ? (
                <Check size={12} className={s.active ? "text-emerald-300" : "text-emerald-600"} />
              ) : (
                <span className={s.active ? "text-orange-300 font-bold" : "text-slate-400"}>
                  {s.active ? "Next" : "Pending"}
                </span>
              )}
            </div>
            <div className="text-xs font-bold mt-1 truncate">{s.title}</div>
            <div className={`text-[11px] mt-0.5 truncate ${s.active ? "text-slate-300" : "text-slate-500"}`}>
              {s.summary}
            </div>
          </button>
        ))}
      </div>

      {/* Expandable Inline Configuration & Fixture Generator (Steps 2-4) */}
      {configOpen && (
        <div className="pt-4 border-t border-slate-200 space-y-4">
          {structureLocked && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-700" />
              <span>
                Matches are already live or completed. Regenerating fixtures requires confirmation to protect recorded results.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label htmlFor="wiz-format" className="block font-semibold text-slate-700 mb-1">
                Format
              </label>
              <select
                id="wiz-format"
                value={format}
                onChange={(e) => handleFormatChange(e.target.value as TournamentFormat)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white font-medium"
              >
                <option value="single_elimination">Single Elimination</option>
                <option value="double_elimination">Double Elimination</option>
                <option value="round_robin">Round Robin League</option>
                <option value="battle_royale">Battle Royale (Lobbies)</option>
                <option value="head_to_head">Head-to-Head Series</option>
                <option value="group_knockout">Group Stage + Knockout</option>
              </select>
            </div>

            <div>
              <label htmlFor="wiz-seeding" className="block font-semibold text-slate-700 mb-1">
                Seeding Method
              </label>
              <select
                id="wiz-seeding"
                value={seedingMode}
                onChange={(e) => setSeedingMode(e.target.value as any)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white font-medium"
              >
                <option value="registration_order">Registration Order</option>
                <option value="manual">Manual Seed (#1, #2...)</option>
                <option value="random">Random Draw</option>
              </select>
            </div>

            <div>
              <label htmlFor="wiz-bestof" className="block font-semibold text-slate-700 mb-1">
                Match Format
              </label>
              <select
                id="wiz-bestof"
                value={bestOf}
                onChange={(e) => setBestOf(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white font-mono"
              >
                <option value="BO1">BO1</option>
                <option value="BO3">BO3</option>
                <option value="BO5">BO5</option>
                <option value="BR Lobby">BR Lobby</option>
              </select>
            </div>

            <div>
              <label htmlFor="wiz-mode" className="block font-semibold text-slate-700 mb-1">
                Team Structure
              </label>
              <select
                id="wiz-mode"
                value={competitionMode}
                onChange={(e) => setCompetitionMode(e.target.value as CompetitionMode)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white"
              >
                {Object.entries(COMPETITION_MODE_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>

            {(format === "battle_royale" || format === "head_to_head") && (
              <div>
                <label htmlFor="wiz-rounds" className="block font-semibold text-slate-700 mb-1">
                  {format === "battle_royale" ? "Number of Lobby Rounds" : "Series Rounds"}
                </label>
                <input
                  id="wiz-rounds"
                  type="number"
                  min={1}
                  max={12}
                  value={totalRounds}
                  onChange={(e) => setTotalRounds(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono tabular-nums"
                />
              </div>
            )}

            {format === "battle_royale" && (
              <>
                <div>
                  <label htmlFor="wiz-lobby-size" className="block font-semibold text-slate-700 mb-1">
                    Squads / Lobby
                  </label>
                  <input
                    id="wiz-lobby-size"
                    type="number"
                    min={2}
                    max={50}
                    value={teamsPerLobby}
                    onChange={(e) => setTeamsPerLobby(Math.max(2, Number(e.target.value) || 12))}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="wiz-kill-pts" className="block font-semibold text-slate-700 mb-1">
                    Points Per Kill
                  </label>
                  <input
                    id="wiz-kill-pts"
                    type="number"
                    min={0}
                    max={10}
                    value={pointsPerKill}
                    onChange={(e) => setPointsPerKill(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="wiz-qualify" className="block font-semibold text-slate-700 mb-1">
                    Qualifying Top Squads
                  </label>
                  <input
                    id="wiz-qualify"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0 = off"
                    value={qualificationCount}
                    onChange={(e) => setQualificationCount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono tabular-nums"
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="wiz-station" className="block font-semibold text-slate-700 mb-1">
                Default Arena / Stage
              </label>
              <input
                id="wiz-station"
                type="text"
                value={defaultStation}
                onChange={(e) => setDefaultStation(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label htmlFor="wiz-conductor" className="block font-semibold text-slate-700 mb-1">
                Default Conductor
              </label>
              <select
                id="wiz-conductor"
                value={defaultConductorId}
                onChange={(e) => setDefaultConductorId(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white"
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

          {format === "battle_royale" && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div className="font-mono text-slate-700">
                Top 10 Placement Matrix:{" "}
                {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => `#${r}:${placementTable[r] ?? 0}`).join(" · ")}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyBrPreset("bgmi")}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold cursor-pointer"
                >
                  BGMI Standard (15/12/10)
                </button>
                <button
                  type="button"
                  onClick={() => applyBrPreset("free_fire")}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold cursor-pointer"
                >
                  Free Fire Standard (12/9/8)
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requireConfirm}
                onChange={(e) => setRequireConfirm(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 accent-slate-900"
              />
              <span>Require manager confirmation before advancing winners</span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={savingConfig || !canManageSetup}
                onClick={handleSaveConfig}
                className="min-h-[38px] px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <Save size={13} />
                <span>{savingConfig ? "Saving..." : "Save Rules"}</span>
              </button>

              {matches.length === 0 ? (
                <button
                  type="button"
                  disabled={generating || !canCreateMatch || orderedEligible.length < 2}
                  onClick={() => handleGenerateMatches(false)}
                  className="min-h-[38px] px-4 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <GitBranch size={13} />
                  <span>
                    {generating
                      ? "Generating..."
                      : `Generate & Preview Matches (${orderedEligible.length} Teams)`}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={generating || !canCreateMatch}
                  onClick={() => setConfirmRegenOpen(true)}
                  className="min-h-[38px] px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <RefreshCw size={13} />
                  <span>Regenerate Matches</span>
                </button>
              )}
            </div>
          </div>

          {orderedEligible.length < 2 && (
            <p className="text-xs text-amber-800 m-0">
              Select at least 2 approved teams in the <strong>Teams</strong> section before generating matches.
            </p>
          )}
        </div>
      )}

      {/* Confirmation Modal Before Replacing Fixtures */}
      {confirmRegenOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setConfirmRegenOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle size={17} />
                <h3 className="text-sm font-bold m-0 text-slate-900">Regenerate Tournament Matches?</h3>
              </div>
              <button
                type="button"
                aria-label="Close regeneration modal"
                onClick={() => setConfirmRegenOpen(false)}
                className="p-1 text-slate-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-600 m-0 leading-relaxed">
              This will replace existing <strong>{matches.length}</strong> fixture(s) for{" "}
              <strong>{selectedGame?.title}</strong> with a fresh <strong>{FORMAT_LABELS[format]}</strong> draw across{" "}
              {orderedEligible.length} selected squad(s).
            </p>
            {structureLocked && (
              <div>
                <label htmlFor="regen-reason" className="block text-xs font-semibold text-rose-800 mb-1">
                  Active/completed matches exist. Reason for override:
                </label>
                <input
                  id="regen-reason"
                  type="text"
                  value={regenReason}
                  onChange={(e) => setRegenReason(e.target.value)}
                  placeholder="e.g. Seeding reset approved by organizer"
                  className="w-full h-9 px-3 rounded-lg border border-rose-300 text-xs"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRegenOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={generating || (structureLocked && regenReason.trim().length < 4)}
                onClick={() => handleGenerateMatches(true)}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
              >
                {generating ? "Regenerating..." : "Replace & Regenerate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
