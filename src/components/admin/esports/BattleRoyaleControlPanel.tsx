import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import {
  calculateCumulativeBattleRoyaleStandings,
  confirmAndAdvanceMatchResult,
  getGameCodePrefix,
  undoMatchResultAndRewind,
  validateBattleRoyaleRows,
} from "@/lib/tournamentEngine";
import { formatMatchDatabaseError, MATCH_STATUS_LABELS } from "@/lib/matchOperations";
import { formatIstDateTime, isMatchScheduled, istInputsToIso } from "@/lib/scheduling";
import type { PermissionKey } from "@/lib/rbac";
import { parseTournamentScoringRules, type EsportsWorkspaceSharedData } from "./types";
import type { BattleRoyaleTeamResult, Match } from "@/types/database";
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  Play,
  Plus,
  RotateCcw,
  Save,
  Send,
  SlidersHorizontal,
  Trophy,
  Users,
  X,
} from "lucide-react";

interface BattleRoyaleControlPanelProps {
  data: EsportsWorkspaceSharedData;
  actorUserId: string;
  permissions: Set<PermissionKey>;
  canCreateMatch: boolean;
  canEditEsports: boolean;
  canConfirmResults: boolean;
  onSelectMatchForDrawer: (match: Match) => void;
  onRefresh: (msg?: string) => Promise<void>;
  onError: (msg: string) => void;
}

export function BattleRoyaleControlPanel({
  data,
  actorUserId,
  permissions,
  canCreateMatch,
  canEditEsports,
  canConfirmResults,
  onSelectMatchForDrawer,
  onRefresh,
  onError,
}: BattleRoyaleControlPanelProps) {
  const { selectedGame, tournament, hasPersistedTournament, approvedTeams, selectedTeams, matches, teamMap } = data;
  const rules = useMemo(() => parseTournamentScoringRules(tournament, selectedGame), [tournament, selectedGame]);
  const roster = selectedTeams.length > 0 ? selectedTeams : approvedTeams;

  const brLobbies = useMemo(
    () =>
      matches
        .filter((m) => m.bracket_side === "battle_royale" || (m.match_format || "").toUpperCase().includes("BR"))
        .sort((a, b) => {
          const rDiff = (a.round_number ?? 1) - (b.round_number ?? 1);
          if (rDiff !== 0) return rDiff;
          return (a.match_number ?? 1) - (b.match_number ?? 1);
        }),
    [matches]
  );

  const [selectedLobbyId, setSelectedLobbyId] = useState<string>("");
  const [draftRows, setDraftRows] = useState<BattleRoyaleTeamResult[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  // Create Lobby modal
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [newRoundNum, setNewRoundNum] = useState<number>(1);
  const [newLobbyName, setNewLobbyName] = useState<string>("Lobby A");
  const [newStation, setNewStation] = useState<string>("Main BR Arena");
  const [newDate, setNewDate] = useState<string>("2026-11-20");
  const [newTime, setNewTime] = useState<string>("");
  const [newSquadIds, setNewSquadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (brLobbies.length === 0) {
      setSelectedLobbyId("");
      return;
    }
    setSelectedLobbyId((prev) => (brLobbies.some((l) => l.id === prev) ? prev : brLobbies[0].id));
  }, [brLobbies]);

  const activeLobby = useMemo(
    () => brLobbies.find((l) => l.id === selectedLobbyId) || null,
    [brLobbies, selectedLobbyId]
  );

  useEffect(() => {
    if (!activeLobby) {
      setDraftRows([]);
      setNotes("");
      return;
    }
    const base =
      Array.isArray(activeLobby.br_results) && activeLobby.br_results.length > 0
        ? activeLobby.br_results
        : roster.map((t) => ({
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
    setDraftRows(base.map((r) => ({ ...r })));
    setNotes(activeLobby.notes || "");
  }, [activeLobby?.id, activeLobby?.br_results, roster]);

  const validation = useMemo(() => validateBattleRoyaleRows(draftRows), [draftRows]);

  const roundLeaderboard = useMemo(() => {
    return [...draftRows].sort((a, b) => {
      if ((b.total_points || 0) !== (a.total_points || 0)) {
        return (b.total_points || 0) - (a.total_points || 0);
      }
      const pA = a.placement ?? 999;
      const pB = b.placement ?? 999;
      if (pA !== pB) return pA - pB;
      return (b.kills || 0) - (a.kills || 0);
    });
  }, [draftRows]);

  const cumulativeStandings = useMemo(
    () =>
      calculateCumulativeBattleRoyaleStandings({
        teams: roster,
        matches: brLobbies,
        placementPointsTable: rules.placementPoints,
        pointsPerKill: rules.pointsPerKill,
        includeSubmittedDrafts: false,
      }),
    [roster, brLobbies, rules]
  );

  const updateRowCell = (teamId: string, field: "placement" | "kills", rawValue: string) => {
    setDraftRows((prev) =>
      prev.map((row) => {
        if (row.team_id !== teamId) return row;
        const parsed = rawValue.trim() === "" ? null : Math.max(0, Math.trunc(Number(rawValue) || 0));
        const nextPlacement = field === "placement" ? (parsed && parsed >= 1 ? parsed : null) : row.placement ?? null;
        const nextKills = field === "kills" ? Math.max(0, parsed ?? 0) : Math.max(0, row.kills || 0);
        const placementPts = nextPlacement ? rules.placementPoints[nextPlacement] ?? 0 : 0;
        const killPts = nextKills * rules.pointsPerKill;
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

  const toggleSquadMembership = (teamId: string) => {
    if (!activeLobby || activeLobby.status === "completed") return;
    setDraftRows((prev) => {
      if (prev.some((r) => r.team_id === teamId)) {
        return prev.filter((r) => r.team_id !== teamId);
      }
      const t = teamMap.get(teamId);
      if (!t) return prev;
      return [
        ...prev,
        {
          team_id: t.id,
          team_name: t.team_name,
          registration_ref: t.registration_ref,
          institution: t.institution,
          placement: null,
          kills: 0,
          placement_points: 0,
          kill_points: 0,
          total_points: 0,
        },
      ];
    });
  };

  const toggleSquadCheckIn = async (teamId: string) => {
    if (!canEditEsports) return;
    const t = teamMap.get(teamId);
    if (!t) return;
    const nextStatus = t.check_in_status === "checked_in" ? "not_checked_in" : "checked_in";
    try {
      const { error } = await supabase
        .from("registrations")
        .update({
          check_in_status: nextStatus,
          checked_in_at: nextStatus === "checked_in" ? new Date().toISOString() : null,
        })
        .eq("id", teamId);
      if (error) throw error;
      await onRefresh();
    } catch (err: any) {
      onError(`Squad check-in update failed: ${err?.message || "Database error"}`);
    }
  };

  const handleOpenCreateLobby = () => {
    const maxR = brLobbies.reduce((max, m) => Math.max(max, m.round_number || 1), 0);
    setNewRoundNum(maxR === 0 ? 1 : maxR);
    const sameRoundCount = brLobbies.filter((m) => (m.round_number || 1) === (maxR === 0 ? 1 : maxR)).length;
    setNewLobbyName(`Lobby ${String.fromCharCode(65 + (sameRoundCount % 26))}`);
    setNewSquadIds(new Set(roster.slice(0, rules.teamsPerLobby).map((t) => t.id)));
    setCreateOpen(true);
  };

  const handleCreateLobbySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canCreateMatch || !selectedGame) return;
    const chosenTeams = roster.filter((t) => newSquadIds.has(t.id));
    if (chosenTeams.length < 2) {
      onError("Select at least 2 squads for the new Battle Royale lobby.");
      return;
    }

    setBusy(true);
    try {
      const prefix = getGameCodePrefix(selectedGame.title);
      const nextNum = brLobbies.filter((m) => (m.round_number || 1) === newRoundNum).length + 1;
      const startIso = newDate && newTime ? istInputsToIso(newDate, newTime) : null;
      const dur = selectedGame.match_duration_minutes || 40;
      const endIso = startIso ? new Date(new Date(startIso).getTime() + dur * 60_000).toISOString() : null;

      const brInit: BattleRoyaleTeamResult[] = chosenTeams.map((t) => ({
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

      const { data: inserted, error } = await supabase
        .from("matches")
        .insert({
          ...(hasPersistedTournament ? { tournament_id: tournament.id } : {}),
          game_id: selectedGame.id,
          match_code: `${prefix}-BR-R${newRoundNum}L${nextNum}`,
          round: `Round ${newRoundNum}`,
          round_number: newRoundNum,
          match_number: nextNum,
          bracket_side: "battle_royale",
          group_name: newLobbyName.trim() || `Lobby ${nextNum}`,
          br_results: brInit,
          scheduled_start: startIso,
          scheduled_end: endIso,
          duration_minutes: dur,
          is_scheduled: Boolean(startIso),
          station: newStation.trim() || "Main BR Arena",
          match_format: "BR Lobby",
          score_a: 0,
          score_b: 0,
          status: startIso ? "scheduled" : "upcoming",
          result_status: "pending",
          is_published: tournament.status === "published" || tournament.has_started,
        })
        .select("id")
        .single();

      if (error) throw error;
      setCreateOpen(false);
      if (inserted?.id) setSelectedLobbyId(inserted.id);
      await onRefresh(`Created ${newLobbyName} (Round ${newRoundNum}) with ${chosenTeams.length} squads.`);
    } catch (err: any) {
      onError(`Create lobby failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAddRound = async () => {
    if (!canCreateMatch || !selectedGame) return;
    if (brLobbies.length === 0) {
      handleOpenCreateLobby();
      return;
    }

    const maxRound = brLobbies.reduce((max, m) => Math.max(max, m.round_number || 1), 1);
    const templateLobbies = brLobbies.filter((m) => (m.round_number || 1) === maxRound);
    const nextRound = maxRound + 1;
    const prefix = getGameCodePrefix(selectedGame.title);

    setBusy(true);
    try {
      const inserts = templateLobbies.map((tpl, idx) => {
        const cleanRows: BattleRoyaleTeamResult[] = (tpl.br_results || []).map((r) => ({
          team_id: r.team_id,
          team_name: r.team_name,
          registration_ref: r.registration_ref,
          institution: r.institution,
          placement: null,
          kills: 0,
          placement_points: 0,
          kill_points: 0,
          total_points: 0,
        }));
        return {
          ...(hasPersistedTournament ? { tournament_id: tournament.id } : {}),
          game_id: selectedGame.id,
          match_code: `${prefix}-BR-R${nextRound}L${idx + 1}`,
          round: `Round ${nextRound}`,
          round_number: nextRound,
          match_number: idx + 1,
          bracket_side: "battle_royale",
          group_name: tpl.group_name || `Lobby ${idx + 1}`,
          br_results: cleanRows,
          duration_minutes: tpl.duration_minutes || 40,
          is_scheduled: false,
          station: tpl.station || "Main BR Arena",
          match_format: "BR Lobby",
          score_a: 0,
          score_b: 0,
          status: "upcoming",
          result_status: "pending",
          is_published: tournament.status === "published" || tournament.has_started,
        };
      });

      const { error } = await supabase.from("matches").insert(inserts);
      if (error) throw error;
      await onRefresh(`Added Round ${nextRound} (${inserts.length} lobby match(es)).`);
    } catch (err: any) {
      onError(`Add round failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDraftOrSubmit = async (submitForConfirm: boolean) => {
    if (!activeLobby || !canEditEsports) return;
    if (submitForConfirm && !validation.isValid) {
      onError(validation.errors.join(" "));
      return;
    }
    setBusy(true);
    try {
      const top = roundLeaderboard[0];
      const { error } = await supabase
        .from("matches")
        .update({
          br_results: draftRows,
          winner_id: top?.team_id || null,
          status: submitForConfirm ? "result_submitted" : activeLobby.status,
          result_status: submitForConfirm ? "submitted" : activeLobby.result_status,
          submitted_by: submitForConfirm ? actorUserId || null : activeLobby.submitted_by,
          submitted_at: submitForConfirm ? new Date().toISOString() : activeLobby.submitted_at,
          notes: notes.trim() || null,
        })
        .eq("id", activeLobby.id);
      if (error) throw error;
      await onRefresh(
        submitForConfirm
          ? `Submitted ${activeLobby.match_code || activeLobby.round} placements for confirmation.`
          : `Saved draft scores for ${activeLobby.match_code || activeLobby.round}.`
      );
    } catch (err: any) {
      onError(`Save failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmLobby = async () => {
    if (!activeLobby || !canConfirmResults) return;
    if (!validation.isValid) {
      onError(validation.errors.join(" "));
      return;
    }
    const top = roundLeaderboard[0];
    const check = confirmAndAdvanceMatchResult({
      matches,
      matchId: activeLobby.id,
      managerUserId: actorUserId,
      permissions,
      overrideScoreA: 0,
      overrideScoreB: 0,
      overrideWinnerId: top?.team_id || null,
      overrideBrResults: draftRows,
    });
    if (!check.ok) {
      onError(check.error);
      return;
    }

    setBusy(true);
    try {
      const rpcRes = await supabase.rpc("confirm_match_result_and_advance", {
        p_match_id: activeLobby.id,
        p_winner_id: top?.team_id || null,
        p_score_a: 0,
        p_score_b: 0,
        p_br_results: draftRows,
        p_notes: notes.trim() || null,
      });
      if (rpcRes.error) {
        const { error: uErr } = await supabase
          .from("matches")
          .update({
            br_results: draftRows,
            winner_id: top?.team_id || null,
            status: "completed",
            result_status: "confirmed",
            confirmed_by: actorUserId || null,
            confirmed_at: new Date().toISOString(),
            is_published: true,
            notes: notes.trim() || null,
          })
          .eq("id", activeLobby.id);
        if (uErr) throw uErr;
      }

      await onRefresh(
        `Confirmed ${activeLobby.match_code || activeLobby.round}. Top squad: ${top?.team_name || "Updated"}.`
      );
    } catch (err: any) {
      onError(`Lobby confirmation failed: ${formatMatchDatabaseError(err, "completed")}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRewindLobby = async () => {
    if (!activeLobby || !canConfirmResults) return;
    const plan = undoMatchResultAndRewind({
      matches,
      matchId: activeLobby.id,
      managerUserId: actorUserId,
      permissions,
      reason: "Correction requested from BR Control Panel",
      forceCascade: true,
    });
    if (!plan.ok) {
      onError(plan.error);
      return;
    }

    setBusy(true);
    try {
      const rpcRes = await supabase.rpc("undo_match_result_and_rewind", {
        p_match_id: activeLobby.id,
        p_reason: "Correction requested from BR Control Panel",
        p_force_cascade: true,
      });
      if (rpcRes.error) {
        await supabase
          .from("matches")
          .update({
            status: "live",
            result_status: "reopened",
            confirmed_by: null,
            confirmed_at: null,
          })
          .eq("id", activeLobby.id);
      }
      await onRefresh(`Reopened ${activeLobby.match_code || activeLobby.round} for score correction.`);
    } catch (err: any) {
      onError(`Reopen failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCrownBrChampion = async (teamId: string) => {
    if (!canConfirmResults || !hasPersistedTournament || !teamId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("tournaments")
        .update({ champion_team_id: teamId, status: "completed" })
        .eq("id", tournament.id);
      if (error) throw error;
      await onRefresh(`Crowned ${teamMap.get(teamId)?.team_name || "Squad"} as ${selectedGame?.title} Champion.`);
    } catch (err: any) {
      onError(`Champion update failed: ${err?.message || "Database error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-display font-bold text-slate-900 m-0">
            {selectedGame?.title} Battle Royale Lobby Control
          </h2>
          <p className="text-xs text-slate-500 m-0 mt-0.5 font-mono tabular-nums">
            {brLobbies.length} lobby match(es) · {rules.pointsPerKill} pt/kill · #1={rules.placementPoints[1] ?? 12} pts
            {rules.qualificationCount > 0 ? ` · Top ${rules.qualificationCount} Qualify` : ""}
          </p>
        </div>

        {canCreateMatch && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleOpenCreateLobby}
              className="min-h-[36px] px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={13} />
              <span>Create Lobby</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleAddRound}
              className="min-h-[36px] px-3.5 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Round</span>
            </button>
          </div>
        )}
      </div>

      {/* Lobby Selector Strip */}
      {brLobbies.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center space-y-2">
          <Trophy size={26} className="mx-auto text-slate-400" />
          <p className="text-sm font-semibold text-slate-900 m-0">No Battle Royale Lobbies Created Yet</p>
          <p className="text-xs text-slate-500 m-0">
            Use the Setup Wizard above to generate all rounds at once, or click Create Lobby.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {brLobbies.map((lobby) => {
            const selected = lobby.id === activeLobby?.id;
            return (
              <button
                key={lobby.id}
                type="button"
                onClick={() => setSelectedLobbyId(lobby.id)}
                className={`min-w-[170px] text-left px-3.5 py-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                  selected
                    ? "bg-[#0B1120] border-[#0B1120] text-white"
                    : "bg-white border-slate-200 text-slate-800 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase">
                  <span className={selected ? "text-slate-300" : "text-slate-500"}>
                    {lobby.match_code || lobby.round}
                  </span>
                  <span
                    className={`font-bold ${
                      lobby.status === "completed"
                        ? selected
                          ? "text-emerald-300"
                          : "text-emerald-700"
                        : lobby.status === "live"
                        ? "text-orange-400"
                        : selected
                        ? "text-slate-300"
                        : "text-slate-500"
                    }`}
                  >
                    {MATCH_STATUS_LABELS[lobby.status] || lobby.status}
                  </span>
                </div>
                <div className="text-xs font-bold mt-1 truncate">
                  {lobby.round} · {lobby.group_name || "Lobby"}
                </div>
                <div className={`text-[11px] font-mono mt-0.5 ${selected ? "text-slate-300" : "text-slate-500"}`}>
                  {lobby.br_results?.length || 0} squads
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Active Lobby Workspace */}
      {activeLobby && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Spreadsheet Scoring & Check-In (8 cols) */}
          <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <div className="text-[11px] font-mono uppercase text-slate-500">
                  {activeLobby.match_code} · {activeLobby.round} · {activeLobby.group_name || "BR Lobby"}
                </div>
                <h3 className="text-base font-display font-bold text-slate-900 m-0 mt-0.5">
                  Placement &amp; Kill Spreadsheet
                </h3>
                <p className="text-xs text-slate-500 m-0 font-mono">
                  {isMatchScheduled(activeLobby) ? formatIstDateTime(activeLobby.scheduled_start) : "Unscheduled"}
                  {activeLobby.station ? ` · ${activeLobby.station}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canEditEsports && activeLobby.status !== "completed" && activeLobby.status !== "live" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      await supabase.from("matches").update({ status: "live" }).eq("id", activeLobby.id);
                      await onRefresh(`Started ${activeLobby.match_code || activeLobby.round}.`);
                    }}
                    className="min-h-[34px] px-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Play size={12} />
                    <span>Start Lobby</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelectMatchForDrawer(activeLobby)}
                  className="min-h-[34px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <SlidersHorizontal size={12} />
                  <span>IST &amp; Logistics</span>
                </button>
              </div>
            </div>

            {/* Real-Time Placement Validation Alert */}
            {!validation.isValid && activeLobby.status !== "completed" && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-700" />
                <div>
                  <div className="font-bold">Placement Validation Warning</div>
                  <div className="mt-0.5">{validation.errors.join(" ")}</div>
                </div>
              </div>
            )}

            {/* Squad Allocation & Check-in Drawer Inline */}
            {activeLobby.status !== "completed" && roster.length > 0 && (
              <details className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
                <summary className="font-semibold text-slate-800 cursor-pointer flex items-center gap-1.5">
                  <Users size={13} />
                  <span>Manage Squads in Lobby ({draftRows.length} / {roster.length} available)</span>
                </summary>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3 max-h-44 overflow-y-auto">
                  {roster.map((t) => {
                    const included = draftRows.some((r) => r.team_id === t.id);
                    return (
                      <label
                        key={t.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-white border border-slate-200 cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={() => toggleSquadMembership(t.id)}
                            className="accent-slate-900"
                          />
                          <span className="truncate font-medium text-slate-800">{t.team_name}</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">{t.registration_ref}</span>
                      </label>
                    );
                  })}
                </div>
              </details>
            )}

            {/* Spreadsheet Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                    <th className="py-2.5 px-3">Squad</th>
                    <th className="py-2.5 px-3">Check-In</th>
                    <th className="py-2.5 px-3 w-24">Rank #</th>
                    <th className="py-2.5 px-3 w-24">Kills</th>
                    <th className="py-2.5 px-3 text-right">Place Pts</th>
                    <th className="py-2.5 px-3 text-right">Kill Pts</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draftRows.map((row) => {
                    const reg = teamMap.get(row.team_id);
                    const isDup = validation.duplicateTeamIds.has(row.team_id);
                    const isMissing = validation.missingTeamIds.has(row.team_id);
                    const checkedIn = reg?.check_in_status === "checked_in";
                    const disabled = activeLobby.status === "completed";

                    return (
                      <tr key={row.team_id} className={isDup ? "bg-rose-50/60" : ""}>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-900">
                            {row.team_name || reg?.team_name || row.team_id}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {row.registration_ref || reg?.registration_ref || ""}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            disabled={!canEditEsports}
                            onClick={() => toggleSquadCheckIn(row.team_id)}
                            className={`px-2 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                              checkedIn
                                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                : "bg-white border-slate-200 text-slate-600"
                            }`}
                          >
                            {checkedIn ? "Checked In" : "Check In"}
                          </button>
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="number"
                            min={1}
                            disabled={disabled}
                            aria-label={`Placement for ${row.team_name}`}
                            value={row.placement ?? ""}
                            placeholder="—"
                            onChange={(e) => updateRowCell(row.team_id, "placement", e.target.value)}
                            className={`w-16 h-8 px-2 rounded border font-mono text-center tabular-nums ${
                              isDup
                                ? "border-rose-500 bg-rose-50 text-rose-900 font-bold"
                                : isMissing
                                ? "border-amber-400 bg-amber-50/40"
                                : "border-slate-300 bg-white"
                            }`}
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="number"
                            min={0}
                            disabled={disabled}
                            aria-label={`Kills for ${row.team_name}`}
                            value={row.kills}
                            onChange={(e) => updateRowCell(row.team_id, "kills", e.target.value)}
                            className="w-16 h-8 px-2 rounded border border-slate-300 bg-white font-mono text-center tabular-nums"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                          {row.placement_points}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                          {row.kill_points}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                          {row.total_points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <input
                type="text"
                disabled={activeLobby.status === "completed"}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Lobby notes (map, tie-breaker remarks)..."
                className="flex-1 min-w-[200px] h-9 px-3 rounded-lg border border-slate-300 text-xs"
              />

              <div className="flex flex-wrap items-center gap-2">
                {activeLobby.status === "completed" ? (
                  canConfirmResults && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleRewindLobby}
                      className="min-h-[38px] px-3.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      <span>Correct / Reopen Lobby</span>
                    </button>
                  )
                ) : (
                  <>
                    {canEditEsports && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleSaveDraftOrSubmit(false)}
                          className="min-h-[38px] px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Save size={13} />
                          <span>Save Draft</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy || !validation.isValid}
                          onClick={() => handleSaveDraftOrSubmit(true)}
                          className="min-h-[38px] px-3.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-blue-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Send size={13} />
                          <span>Submit Result</span>
                        </button>
                      </>
                    )}
                    {canConfirmResults && (
                      <button
                        type="button"
                        disabled={busy || !validation.isValid}
                        onClick={handleConfirmLobby}
                        className="min-h-[38px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 size={14} />
                        <span>Confirm Lobby Result</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Round Leaderboard & Overall Cumulative Standings (4 cols) */}
          <div className="xl:col-span-4 space-y-5">
            {/* Round Leaderboard */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-display font-bold text-slate-900 m-0">
                  {activeLobby.match_code || activeLobby.round} Standings
                </h3>
                <span className="text-[11px] font-mono text-slate-500">Live Sheet</span>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {roundLeaderboard.slice(0, 8).map((r, i) => (
                  <div key={r.team_id} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-slate-500 w-5 tabular-nums">#{i + 1}</span>
                      <span className="font-semibold text-slate-900 truncate">{r.team_name}</span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-700 shrink-0">
                      {r.kills}K · <strong className="text-slate-900">{r.total_points} pts</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Overall Cumulative Standings */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-display font-bold text-slate-900 m-0">Overall BR Standings</h3>
                  <p className="text-[11px] text-slate-500 m-0">Confirmed lobbies cumulative</p>
                </div>
                {cumulativeStandings[0] && cumulativeStandings[0].totalPoints > 0 && canConfirmResults && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleCrownBrChampion(cumulativeStandings[0].teamId)}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-900 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Crown size={12} />
                    <span>Crown #1</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                      <th className="py-1.5 pr-2">#</th>
                      <th className="py-1.5 pr-2">Squad</th>
                      <th className="py-1.5 pr-2 text-right">K</th>
                      <th className="py-1.5 text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cumulativeStandings.map((row) => {
                      const qualified =
                        rules.qualificationCount > 0 && row.rank <= rules.qualificationCount && row.totalPoints > 0;
                      return (
                        <tr key={row.teamId} className={qualified ? "bg-emerald-50/40" : ""}>
                          <td className="py-2 pr-2 font-mono font-bold text-slate-600 tabular-nums">#{row.rank}</td>
                          <td className="py-2 pr-2">
                            <span className="font-semibold text-slate-900">{row.teamName}</span>
                            {qualified && (
                              <span className="ml-1.5 text-[10px] font-mono font-bold text-emerald-700">
                                QUALIFIED
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-right font-mono tabular-nums text-slate-600">
                            {row.totalKills}
                          </td>
                          <td className="py-2 text-right font-mono font-bold tabular-nums text-slate-900">
                            {row.totalPoints}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Lobby Modal */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setCreateOpen(false)}
        >
          <form
            onSubmit={handleCreateLobbySubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-display font-bold text-slate-900 m-0">Create Battle Royale Lobby</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="br-round" className="block font-semibold text-slate-700 mb-1">
                  Round Number
                </label>
                <input
                  id="br-round"
                  type="number"
                  min={1}
                  max={12}
                  value={newRoundNum}
                  onChange={(e) => setNewRoundNum(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="br-lobby-name" className="block font-semibold text-slate-700 mb-1">
                  Lobby Name
                </label>
                <input
                  id="br-lobby-name"
                  type="text"
                  required
                  value={newLobbyName}
                  onChange={(e) => setNewLobbyName(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label htmlFor="br-station" className="block font-semibold text-slate-700 mb-1">
                  Arena / Room
                </label>
                <input
                  id="br-station"
                  type="text"
                  value={newStation}
                  onChange={(e) => setNewStation(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label htmlFor="br-time" className="block font-semibold text-slate-700 mb-1">
                  Optional IST Time
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-1/2 h-9 px-2 rounded-lg border border-slate-300 font-mono text-[11px]"
                  />
                  <input
                    id="br-time"
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-1/2 h-9 px-2 rounded-lg border border-slate-300 font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">
                  Select Participating Squads ({newSquadIds.size} selected)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSquadIds(new Set(roster.map((t) => t.id)))}
                    className="text-blue-700 font-semibold hover:underline cursor-pointer bg-transparent border-0 text-[11px]"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSquadIds(new Set())}
                    className="text-slate-600 font-semibold hover:underline cursor-pointer bg-transparent border-0 text-[11px]"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                {roster.map((t) => (
                  <label key={t.id} className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50">
                    <span className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newSquadIds.has(t.id)}
                        onChange={() =>
                          setNewSquadIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(t.id)) next.delete(t.id);
                            else next.add(t.id);
                            return next;
                          })
                        }
                        className="accent-slate-900"
                      />
                      <span className="font-medium text-slate-900">{t.team_name}</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">{t.registration_ref}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || newSquadIds.size < 2}
                className="px-4 py-2 rounded-lg bg-[#0B1120] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
              >
                {busy ? "Creating..." : "Create Lobby"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
