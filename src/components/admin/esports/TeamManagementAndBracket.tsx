import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toUuidOrNull } from "@/lib/entryOperations";
import {
  canRegenerateBracket,
  canTeamEnterTournament,
  generateTournamentMatches,
  isCancelledBracketMatch,
  isTournamentStructureLocked,
  orderTeamsForBracket,
  reassignTeamsInMatch,
  resolveMatchSlotDisplay,
} from "@/lib/tournamentEngine";
import { formatMatchDatabaseError } from "@/lib/matchOperations";
import { findTeamAffectedMatches } from "@/lib/esportsFixtureCorrections";
import { callRenameEsportsTeamRpc } from "@/lib/esportsFixtureRpc";
import { SearchableTeamSelect } from "./SearchableTeamSelect";
import { DisqualificationImpactBanner } from "./DisqualificationImpactBanner";
import { FORMAT_LABELS, parseTournamentScoringRules, type EsportsSectionId, type EsportsWorkspaceSharedData } from "./types";
import type { Match, Registration, TournamentFormat, TournamentSelectionStatus } from "@/types/database";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Edit3,
  GitBranch,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Shuffle,
  Users,
  X,
} from "lucide-react";

interface TeamProps {
  data: EsportsWorkspaceSharedData;
  canEditEsports: boolean;
  canSelectTeams: boolean;
  canApproveEsports?: boolean;
  canRejectEsports: boolean;
  canModifyTeams?: boolean;
  reinstatingTeamId?: string | null;
  onRefresh: (msg?: string) => Promise<void>;
  onPartialRefresh?: (opts: {
    matchIds?: string[];
    registrationIds?: string[];
    message?: string;
  }) => Promise<void>;
  onError: (msg: string) => void;
  onDisqualify: (team: Registration) => void;
  onReinstate?: (team: Registration) => void;
  onOpenMatchEditor?: (match: Match) => void;
}

export function TeamManagementSection({
  data,
  canEditEsports,
  canSelectTeams,
  canApproveEsports = false,
  canRejectEsports,
  canModifyTeams = false,
  reinstatingTeamId = null,
  onRefresh,
  onPartialRefresh,
  onError,
  onDisqualify,
  onReinstate,
  onOpenMatchEditor,
}: TeamProps) {
  const { selectedGame, approvedTeams, selectedTeams, allGameTeams, players, tournament, matches, teamMap } = data;
  const [filterMode, setFilterMode] = useState<"approved" | "selected" | "all">("approved");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seedEdits, setSeedEdits] = useState<Record<string, string>>({});
  const [renameTarget, setRenameTarget] = useState<Registration | null>(null);
  const [renameNewName, setRenameNewName] = useState("");
  const [renameReason, setRenameReason] = useState("");
  const [renaming, setRenaming] = useState(false);

  const canModifyNameOrStatus = canModifyTeams || canEditEsports || canSelectTeams || canRejectEsports;

  const disqualifiedWithActiveFixtures = allGameTeams.filter(
    (t) =>
      t.selection_status === "disqualified" &&
      findTeamAffectedMatches(matches, t.id).upcomingMatches.length > 0
  );

  const displayTeams =
    filterMode === "selected"
      ? selectedTeams
      : filterMode === "approved"
      ? approvedTeams
      : allGameTeams;

  const updateSelection = async (team: Registration, nextSel: TournamentSelectionStatus) => {
    if (!canSelectTeams && !canEditEsports) return;
    if (nextSel === "disqualified") {
      onDisqualify(team);
      return;
    }
    if (team.selection_status === "disqualified" && onReinstate) {
      onReinstate(team);
      return;
    }
    setBusyId(team.id);
    try {
      const { error } = await supabase
        .from("registrations")
        .update({ selection_status: nextSel })
        .eq("id", team.id);
      if (error) throw error;
      await onRefresh(`Updated ${team.team_name} selection status to ${nextSel.replace(/_/g, " ")}.`);
    } catch (err: any) {
      onError(`Selection update failed: ${err?.message || "Database error"}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !canModifyNameOrStatus || renaming) return;
    setRenaming(true);
    try {
      const res = await callRenameEsportsTeamRpc({
        registrationId: renameTarget.id,
        expectedName: renameTarget.team_name,
        newName: renameNewName,
        reason: renameReason,
      });
      if (!res.ok) {
        onError(res.error || "Team rename failed.");
        return;
      }
      const oldName = renameTarget.team_name;
      const savedName = renameNewName.trim();
      const targetId = renameTarget.id;
      setRenameTarget(null);
      setRenameReason("");
      if (onPartialRefresh) {
        await onPartialRefresh({
          registrationIds: [targetId],
          message: `Renamed team "${oldName}" to "${savedName}".`,
        });
      } else {
        await onRefresh(`Renamed team "${oldName}" to "${savedName}".`);
      }
    } finally {
      setRenaming(false);
    }
  };

  const approveTeam = async (team: Registration) => {
    if (!canApproveEsports && !canEditEsports) return;
    setBusyId(team.id);
    try {
      const { error } = await supabase
        .from("registrations")
        .update({ status: "confirmed", selection_status: "selected" })
        .eq("id", team.id);
      if (error) throw error;
      await onRefresh(`Approved and selected ${team.team_name} for tournament brackets.`);
    } catch (err: any) {
      onError(`Approval failed: ${err?.message || "Database error"}`);
    } finally {
      setBusyId(null);
    }
  };

  const saveSeed = async (team: Registration) => {
    if (!canSelectTeams && !canEditEsports) return;
    const raw = seedEdits[team.id];
    const parsed = raw !== undefined && raw.trim() !== "" ? Math.max(1, Math.trunc(Number(raw))) : null;
    setBusyId(team.id);
    try {
      const { error } = await supabase
        .from("registrations")
        .update({ seed_number: parsed })
        .eq("id", team.id);
      if (error) throw error;
      await onRefresh(`Saved seed #${parsed ?? "auto"} for ${team.team_name}.`);
    } catch (err: any) {
      onError(`Seed update failed: ${err?.message || "Database error"}`);
    } finally {
      setBusyId(null);
    }
  };

  const toggleTeamCheckIn = async (team: Registration) => {
    if (!canEditEsports && !canSelectTeams && !canApproveEsports) return;
    setBusyId(team.id);
    const nextStatus = team.check_in_status === "checked_in" ? "not_checked_in" : "checked_in";
    try {
      const { error } = await supabase
        .from("registrations")
        .update({
          check_in_status: nextStatus,
          checked_in_at: nextStatus === "checked_in" ? new Date().toISOString() : null,
        })
        .eq("id", team.id);
      if (error) throw error;
      await onRefresh(`${team.team_name} marked ${nextStatus.replace(/_/g, " ")}.`);
    } catch (err: any) {
      onError(`Check-in update failed: ${err?.message || "Database error"}`);
    } finally {
      setBusyId(null);
    }
  };

  const selectAllConfirmed = async () => {
    if (!canSelectTeams && !canEditEsports) return;
    const toSelect = approvedTeams.filter((t) => t.selection_status !== "selected");
    if (toSelect.length === 0) return;
    const limit = tournament.approved_team_limit ? tournament.approved_team_limit - selectedTeams.length : toSelect.length;
    const batch = toSelect.slice(0, Math.max(0, limit));
    if (batch.length === 0) {
      onError(`Team limit (${tournament.approved_team_limit}) already reached.`);
      return;
    }
    setBusyId("bulk");
    try {
      const { error } = await supabase
        .from("registrations")
        .update({ selection_status: "selected" })
        .in("id", batch.map((b) => b.id));
      if (error) throw error;
      await onRefresh(`Selected ${batch.length} confirmed team(s) for ${selectedGame?.title}.`);
    } catch (err: any) {
      onError(`Bulk selection failed: ${err?.message || "Database error"}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRandomSeedSelected = async () => {
    if (!canSelectTeams && !canEditEsports) return;
    const pool = selectedTeams.length >= 2 ? selectedTeams : approvedTeams;
    if (pool.length < 2) {
      onError("Select or approve at least 2 teams to randomize seeds.");
      return;
    }
    setBusyId("random_seed");
    try {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffled.length; i++) {
        const { error } = await supabase
          .from("registrations")
          .update({ seed_number: i + 1 })
          .eq("id", shuffled[i].id);
        if (error) throw error;
      }
      setSeedEdits({});
      await onRefresh(`Assigned random seeds #1–#${shuffled.length} for ${selectedGame?.title}.`);
    } catch (err: any) {
      onError(`Random seeding failed: ${err?.message || "Database error"}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-display font-bold text-slate-900 m-0">
            {selectedGame?.title} Teams &amp; Roster Eligibility
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 m-0">
            Selected: <strong className="text-slate-800 font-mono">{selectedTeams.length}</strong> / Approved:{" "}
            <strong className="text-slate-800 font-mono">{approvedTeams.length}</strong>
            {tournament.approved_team_limit ? ` (Cap: ${tournament.approved_team_limit})` : ""} · Total Registered:{" "}
            <span className="font-mono">{allGameTeams.length}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg p-1 bg-slate-100 border border-slate-200">
            {[
              { id: "approved", label: `Approved (${approvedTeams.length})` },
              { id: "selected", label: `Selected (${selectedTeams.length})` },
              { id: "all", label: `All (${allGameTeams.length})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id as any)}
                className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                  filterMode === f.id ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {(canSelectTeams || canEditEsports) && (
            <>
              <button
                type="button"
                disabled={busyId === "random_seed" || (selectedTeams.length < 2 && approvedTeams.length < 2)}
                onClick={handleRandomSeedSelected}
                className="min-h-[36px] px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-40"
              >
                <Shuffle size={13} />
                <span>{busyId === "random_seed" ? "Seeding..." : "Random Seed"}</span>
              </button>
              <button
                type="button"
                disabled={busyId === "bulk"}
                onClick={selectAllConfirmed}
                className="min-h-[36px] px-3.5 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Select All Approved
              </button>
            </>
          )}
          <Link
            to="/admin/esports-registrations"
            className="min-h-[36px] inline-flex items-center px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 no-underline whitespace-nowrap"
          >
            Full Registration Desk →
          </Link>
        </div>
      </div>

      {selectedGame && disqualifiedWithActiveFixtures.length > 0 && (
        <div className="space-y-3">
          {disqualifiedWithActiveFixtures.map((dqTeam) => (
            <DisqualificationImpactBanner
              key={dqTeam.id}
              team={dqTeam}
              gameId={selectedGame.id}
              matches={matches}
              allGameTeams={allGameTeams}
              teamMap={teamMap}
              canEdit={canEditEsports || canSelectTeams || canRejectEsports || canModifyTeams}
              reinstating={reinstatingTeamId === dqTeam.id}
              onReinstate={(t) => onReinstate && onReinstate(t)}
              onOpenResolveForfeit={(m) => onOpenMatchEditor && onOpenMatchEditor(m)}
              onPartialRefresh={
                onPartialRefresh || (async (opts) => onRefresh(opts.message))
              }
              onError={onError}
              onDismiss={() => {}}
            />
          ))}
        </div>
      )}

      {displayTeams.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-xs text-slate-600">
          No teams match this filter for {selectedGame?.title}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-mono uppercase text-slate-500">
                <th className="py-2.5 pr-3">Ref</th>
                <th className="py-2.5 pr-3">Team & Institution</th>
                <th className="py-2.5 pr-3">Squad Size</th>
                <th className="py-2.5 pr-3">Reg Status</th>
                <th className="py-2.5 pr-3">Tournament Selection</th>
                <th className="py-2.5 pr-3">Seed</th>
                <th className="py-2.5 pr-3">Check-In</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayTeams.map((team) => {
                const rosterCount = players.filter((p) => p.registration_id === team.id).length;
                const isEligible = canTeamEnterTournament(team).ok;
                const currentSeedVal =
                  seedEdits[team.id] !== undefined
                    ? seedEdits[team.id]
                    : team.seed_number
                    ? String(team.seed_number)
                    : "";

                return (
                  <tr key={team.id} className="hover:bg-slate-50/70">
                    <td className="py-3 pr-3 font-mono text-slate-600 whitespace-nowrap">
                      {team.registration_ref}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-900">{team.team_name}</div>
                      <div className="text-[11px] text-slate-500">
                        {team.institution || "Collegiate"} · Capt: {team.captain_name}
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-mono tabular-nums text-slate-700">
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} className="text-slate-400" /> {rosterCount} players
                      </span>
                    </td>
                    <td className="py-3 pr-3 capitalize">
                      <span
                        className={`text-xs font-medium ${
                          team.status === "confirmed"
                            ? "text-emerald-700"
                            : team.status === "declined"
                            ? "text-rose-700"
                            : "text-amber-700"
                        }`}
                      >
                        {team.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      {team.status === "confirmed" ? (
                        <select
                          disabled={busyId === team.id || (!canSelectTeams && !canEditEsports)}
                          value={team.selection_status || "awaiting_selection"}
                          onChange={(e) =>
                            updateSelection(team, e.target.value as TournamentSelectionStatus)
                          }
                          className={`h-8 px-2 rounded-lg border text-xs font-medium ${
                            isEligible
                              ? "bg-blue-50 border-blue-200 text-blue-900"
                              : "bg-white border-slate-300 text-slate-700"
                          }`}
                        >
                          <option value="awaiting_selection">Awaiting Selection</option>
                          <option value="selected">Selected for Bracket</option>
                          <option value="waitlisted">Waitlisted</option>
                          <option value="not_selected">Not Selected</option>
                          <option value="disqualified">Disqualified</option>
                        </select>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === team.id || (!canApproveEsports && !canEditEsports)}
                          onClick={() => approveTeam(team)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 cursor-pointer disabled:opacity-50"
                        >
                          Approve & Select
                        </button>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          placeholder="#"
                          value={currentSeedVal}
                          onChange={(e) =>
                            setSeedEdits((prev) => ({ ...prev, [team.id]: e.target.value }))
                          }
                          className="w-14 h-8 px-2 rounded-lg border border-slate-300 font-mono text-center tabular-nums"
                        />
                        {seedEdits[team.id] !== undefined && (
                          <button
                            type="button"
                            onClick={() => saveSeed(team)}
                            className="px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-medium cursor-pointer"
                          >
                            Set
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <button
                        type="button"
                        disabled={busyId === team.id || (!canEditEsports && !canSelectTeams && !canApproveEsports)}
                        onClick={() => toggleTeamCheckIn(team)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border disabled:opacity-50 ${
                          team.check_in_status === "checked_in"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {team.check_in_status === "checked_in" ? "Checked In" : "Check In"}
                      </button>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {canModifyNameOrStatus && (
                          <button
                            type="button"
                            onClick={() => {
                              setRenameTarget(team);
                              setRenameNewName(team.team_name);
                              setRenameReason("");
                            }}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 size={11} />
                            <span>Rename</span>
                          </button>
                        )}
                        {team.selection_status === "disqualified" ? (
                          (canRejectEsports || canModifyNameOrStatus) && onReinstate && (
                            <button
                              type="button"
                              disabled={reinstatingTeamId === team.id}
                              onClick={() => onReinstate(team)}
                              className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              {reinstatingTeamId === team.id ? (
                                <RefreshCw size={11} className="animate-spin" />
                              ) : (
                                <RotateCcw size={11} />
                              )}
                              <span>{reinstatingTeamId === team.id ? "Reinstating..." : "Reinstate"}</span>
                            </button>
                          )
                        ) : (
                          canRejectEsports &&
                          team.status !== "declined" && (
                            <button
                              type="button"
                              onClick={() => onDisqualify(team)}
                              className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium cursor-pointer"
                            >
                              Disqualify
                            </button>
                          )
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

      {/* Rename Team RPC Modal */}
      {renameTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => !renaming && setRenameTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-display font-bold text-slate-900 m-0">
                Rename Team — {renameTarget.team_name}
              </h3>
              <button
                type="button"
                disabled={renaming}
                onClick={() => setRenameTarget(null)}
                className="p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-slate-600 m-0">
              Updates team name via <code className="font-mono">rename_esports_team</code> and propagates live across brackets, match drawers, Battle Royale lobbies, conductor desks, and public standings.
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="teams-tab-rename-name" className="block font-semibold text-slate-700 mb-1">
                  New Official Team Name
                </label>
                <input
                  id="teams-tab-rename-name"
                  type="text"
                  disabled={renaming}
                  value={renameNewName}
                  onChange={(e) => setRenameNewName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="teams-tab-rename-reason" className="block font-semibold text-slate-700 mb-1">
                  Mandatory Audit Reason *
                </label>
                <input
                  id="teams-tab-rename-reason"
                  type="text"
                  disabled={renaming}
                  value={renameReason}
                  onChange={(e) => setRenameReason(e.target.value)}
                  placeholder="e.g. Corrected org spelling before round 2"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={renaming}
                onClick={() => setRenameTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  renaming ||
                  renameNewName.trim().length < 2 ||
                  renameNewName.trim() === renameTarget.team_name.trim() ||
                  renameReason.trim().length < 3
                }
                onClick={() => void handleRenameSubmit()}
                className="px-4 py-2 rounded-lg bg-[#0B1120] hover:bg-slate-800 disabled:opacity-45 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {renaming && <RefreshCw size={12} className="animate-spin" />}
                <span>{renaming ? "Renaming..." : "Apply Rename"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BracketProps {
  data: EsportsWorkspaceSharedData;
  canCreateMatch: boolean;
  onRefresh: (msg?: string) => Promise<void>;
  onError: (msg: string) => void;
  onNavigate: (sec: EsportsSectionId) => void;
}

export function BracketBuilderSection({
  data,
  canCreateMatch,
  onRefresh,
  onError,
  onNavigate,
}: BracketProps) {
  const {
    selectedGame,
    tournament,
    hasPersistedTournament,
    approvedTeams,
    selectedTeams,
    matches,
    conductors,
    teamMap,
  } = data;

  const teamNameById = new Map(Array.from(teamMap.entries()).map(([id, team]) => [id, team.team_name]));
  const activeMatches = matches.filter((m) => !isCancelledBracketMatch(m));
  const parsedRules = parseTournamentScoringRules(tournament, selectedGame);

  const [format, setFormat] = useState<TournamentFormat>(tournament.format);
  const [seedingMode, setSeedingMode] = useState<"manual" | "random" | "registration_order">(
    tournament.seeding_mode || "registration_order"
  );
  const [totalRounds, setTotalRounds] = useState<number>(tournament.total_rounds || 3);
  const [teamsPerLobby, setTeamsPerLobby] = useState<number>(parsedRules.teamsPerLobby || 12);
  const [defaultStation, setDefaultStation] = useState("Main Arena Stage");
  const [defaultConductorId, setDefaultConductorId] = useState("");
  const [leaveUnscheduled, setLeaveUnscheduled] = useState(true);
  const [publishOnBuild, setPublishOnBuild] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Confirm regeneration modal
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [regenOverrideReason, setRegenOverrideReason] = useState("");

  // Pre-play manual team swapper
  const [swapMatch, setSwapMatch] = useState<Match | null>(null);
  const [swapTeamA, setSwapTeamA] = useState("");
  const [swapTeamB, setSwapTeamB] = useState("");
  const [savingSwap, setSavingSwap] = useState(false);

  useEffect(() => {
    const r = parseTournamentScoringRules(tournament, selectedGame);
    setFormat(tournament.format || "single_elimination");
    setSeedingMode(tournament.seeding_mode || "registration_order");
    setTotalRounds(tournament.total_rounds || (tournament.format === "battle_royale" ? 3 : 1));
    setTeamsPerLobby(r.teamsPerLobby || 12);
  }, [selectedGame?.id, tournament.id, tournament.format, tournament.total_rounds]);

  const structureLocked = isTournamentStructureLocked(tournament, matches);
  const orderedEligible = orderTeamsForBracket(selectedTeams, seedingMode, selectedGame?.id || "sn3");
  const pendingApprovalSelectCount = approvedTeams.filter((t) => !canTeamEnterTournament(t).ok).length;

  const ensurePersistedTournamentId = async (): Promise<string | null> => {
    if (!selectedGame) return null;
    if (hasPersistedTournament && tournament.id && tournament.id !== selectedGame.id) {
      return tournament.id;
    }
    const { data: created, error } = await supabase
      .from("tournaments")
      .insert({
        game_id: selectedGame.id,
        name: `${selectedGame.title} Tournament`,
        format,
        scoring_mode: format === "battle_royale" ? "battle_royale" : "round_based",
        seeding_mode: seedingMode,
        total_rounds: totalRounds,
        status: "open",
        require_manager_confirmation: true,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("Could not auto-create tournament row:", error.message);
      return null;
    }
    return created?.id || null;
  };

  const executeGeneration = async (forceOverride: boolean) => {
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
      const realTournamentId = await ensurePersistedTournamentId();
      const generated = generateTournamentMatches({
        tournamentId: realTournamentId || selectedGame.id,
        gameId: selectedGame.id,
        gameTitle: selectedGame.title,
        format,
        teams: selectedTeams,
        seedingMode,
        approvedTeamLimit: tournament.approved_team_limit || null,
        shuffleSeed: `${selectedGame.id}-${Date.now()}`,
        matchFormatLabel: parsedRules.bestOf,
        defaultStation,
        defaultConductorId: defaultConductorId || null,
        matchDurationMinutes: selectedGame.match_duration_minutes || 30,
        totalRounds,
        teamsPerLobby: format === "battle_royale" ? Math.max(2, teamsPerLobby) : undefined,
        leaveUnscheduled,
        isPublished: publishOnBuild,
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
        result_status: m.match_format === "BYE" ? "confirmed" : "pending",
        next_match_id: m.next_match_id,
        next_match_slot: m.next_match_slot,
        loser_next_match_id: m.loser_next_match_id,
        loser_next_match_slot: m.loser_next_match_slot,
        is_published: m.is_published,
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
      setRegenOverrideReason("");
      await onRefresh(
        `Generated ${generated.matches.length} ${FORMAT_LABELS[format]} match(es) for ${selectedGame.title} (${
          leaveUnscheduled ? "unscheduled — ready for IST admin scheduling" : "scheduled"
        }).`
      );
    } catch (err: any) {
      onError(`Bracket generation failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveTeamSwap = async () => {
    if (!swapMatch) return;
    const check = reassignTeamsInMatch({
      matches,
      matchId: swapMatch.id,
      teamAId: swapTeamA || null,
      teamBId: swapTeamB || null,
    });
    if (!check.ok) {
      onError(check.error);
      return;
    }

    setSavingSwap(true);
    try {
      const { error } = await supabase
        .from("matches")
        .update({
          team_a_id: toUuidOrNull(swapTeamA),
          team_b_id: toUuidOrNull(swapTeamB),
        })
        .eq("id", swapMatch.id);
      if (error) throw error;

      setSwapMatch(null);
      await onRefresh(`Updated team pairing for ${swapMatch.match_code || swapMatch.round}.`);
    } catch (err: any) {
      onError(`Team reassignment failed: ${formatMatchDatabaseError(err)}`);
    } finally {
      setSavingSwap(false);
    }
  };

  const roundsGrouped = activeMatches.reduce<Record<string, Match[]>>((acc, m) => {
    const key = m.round || `Round ${m.round_number || 1}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Builder Configuration Panel */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <GitBranch size={17} className="text-slate-700" />
          <h2 className="text-base font-display font-bold text-slate-900 m-0">
            Automatic Bracket & Pairing Builder
          </h2>
        </div>

        {structureLocked && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <Lock size={15} className="shrink-0 mt-0.5 text-amber-700" />
            <span>
              Matches are live or completed. Regeneration requires explicit confirmation to protect existing results.
            </span>
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as TournamentFormat)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-medium"
            >
              <option value="single_elimination">Single Elimination (with Byes)</option>
              <option value="double_elimination">Double Elimination (Winners + Losers)</option>
              <option value="round_robin">Round Robin League</option>
              <option value="battle_royale">Battle Royale (Multi-Round Lobbies)</option>
              <option value="head_to_head">Head-to-Head Series</option>
              <option value="group_knockout">Group Stage + Knockout</option>
            </select>
          </div>

          {(format === "battle_royale" || format === "head_to_head") && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {format === "battle_royale" ? "Rounds Count" : "Series Rounds"}
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={totalRounds}
                  onChange={(e) => setTotalRounds(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono tabular-nums"
                />
              </div>

              {format === "battle_royale" && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teams Per Lobby</label>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={teamsPerLobby}
                    onChange={(e) => setTeamsPerLobby(Math.max(2, Number(e.target.value) || 12))}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 font-mono tabular-nums"
                  />
                </div>
              )}
            </div>
          )}

          {format === "battle_royale" && orderedEligible.length >= 2 && (
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-700">
              Auto-split: {orderedEligible.length} teams ÷ {teamsPerLobby}/lobby ={" "}
              <strong>{Math.max(1, Math.ceil(orderedEligible.length / teamsPerLobby))}</strong> lobby/round ×{" "}
              <strong>{totalRounds}</strong> round(s) ={" "}
              <strong>{Math.max(1, Math.ceil(orderedEligible.length / teamsPerLobby)) * totalRounds}</strong> BR matches
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Seeding & Pairing Method</label>
            <select
              value={seedingMode}
              onChange={(e) => setSeedingMode(e.target.value as any)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-medium"
            >
              <option value="registration_order">Registration Order</option>
              <option value="manual">Manual Seed Numbers (#1, #2...)</option>
              <option value="random">Random Draw</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Default Arena / Room</label>
            <input
              type="text"
              value={defaultStation}
              onChange={(e) => setDefaultStation(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Default Match Conductor</label>
            <select
              value={defaultConductorId}
              onChange={(e) => setDefaultConductorId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white"
            >
              <option value="">Assign later in Scheduling / Match Control</option>
              {conductors.map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {c.full_name || c.email}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={leaveUnscheduled}
              onChange={(e) => setLeaveUnscheduled(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-slate-900"
            />
            <span className="text-slate-700 leading-snug">
              <strong>Create matches unscheduled</strong> (recommended — admin assigns exact IST dates & times in Schedule Calendar)
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={publishOnBuild}
              onChange={(e) => setPublishOnBuild(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 accent-slate-900"
            />
            <span className="text-slate-700">Publish generated fixtures to Public Live Board</span>
          </label>
        </div>

        <div className="pt-2 space-y-2 border-t border-slate-100">
          {matches.length === 0 ? (
            <button
              type="button"
              disabled={!canCreateMatch || generating || orderedEligible.length < 2}
              onClick={() => executeGeneration(false)}
              className="w-full min-h-[42px] rounded-lg bg-[#0B1120] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
            >
              {generating
                ? "Building Fixtures..."
                : `Auto-Generate ${FORMAT_LABELS[format]} (${orderedEligible.length} Teams)`}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canCreateMatch || generating}
              onClick={() => setConfirmRegenOpen(true)}
              className="w-full min-h-[42px] rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Regenerate Fixtures (Confirm First)</span>
            </button>
          )}

          {pendingApprovalSelectCount > 0 && (
            <button
              type="button"
              disabled={!canCreateMatch || generating}
              onClick={async () => {
                const batch = approvedTeams
                  .filter((t) => !canTeamEnterTournament(t).ok)
                  .map((t) => t.id);
                if (batch.length === 0) return;
                const { error } = await supabase
                  .from("registrations")
                  .update({ selection_status: "selected" })
                  .in("id", batch);
                if (error) {
                  onError(`Failed to include approved teams: ${error.message}`);
                  return;
                }
                await onRefresh(`Included ${batch.length} confirmed team(s) for ${selectedGame?.title}.`);
              }}
              className="w-full min-h-[36px] rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 text-xs font-semibold cursor-pointer"
            >
              Auto-Include {pendingApprovalSelectCount} Approved Team(s)
            </button>
          )}

          {orderedEligible.length < 2 && (
            <p className="text-[11px] text-amber-800 m-0">
              Select at least 2 confirmed teams in Team Management (or click Auto-Include above) before building fixtures.
            </p>
          )}
        </div>
      </div>

      {/* Interactive Bracket / Fixture Preview & Pre-Play Pairing Swapper */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-display font-bold text-slate-900 m-0">
              Generated Bracket &amp; Pairing Overview ({activeMatches.length} Matches)
            </h2>
            <p className="text-xs text-slate-500 m-0 mt-0.5">
              Review automatic pairings and adjust unstarted team slots before scheduling or play begins.
            </p>
          </div>
          {activeMatches.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate("tournament_matches")}
              className="min-h-[36px] px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Proceed to IST Scheduling →
            </button>
          )}
        </div>

        {activeMatches.length === 0 ? (
          <div className="p-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2">
            <ShieldCheck size={28} className="mx-auto text-slate-400" />
            <p className="text-xs font-semibold text-slate-800 m-0">No Fixtures Built Yet</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto m-0">
              {orderedEligible.length} selected team(s) ready for {selectedGame?.title}. Choose format & click Auto-Generate to pair teams with Bye handling and match codes.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(roundsGrouped).map(([roundLabel, roundMatches]) => (
              <div key={roundLabel} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600 m-0">
                    {roundLabel}
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    {roundMatches.length} match(es)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {roundMatches.map((m) => {
                    const isBr = m.bracket_side === "battle_royale";
                    const teamA = m.team_a_id ? teamMap.get(m.team_a_id) : null;
                    const teamB = m.team_b_id ? teamMap.get(m.team_b_id) : null;
                    const canSwap =
                      canCreateMatch &&
                      !isBr &&
                      !["live", "result_submitted", "completed"].includes(m.status);

                    return (
                      <div
                        key={m.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                          <span className="font-bold text-slate-800">
                            {m.match_code || `#${m.match_number || 1}`}
                            {m.bracket_position ? ` · ${m.bracket_position}` : ""}
                          </span>
                          <span className="capitalize">
                            {m.status.replace(/_/g, " ")}
                          </span>
                        </div>

                        {isBr ? (
                          <div className="space-y-1 text-xs text-slate-800">
                            <div>
                              <strong>{m.group_name || "Battle Royale Lobby"}</strong> ·{" "}
                              <span className="font-mono">{m.br_results?.length || 0} squads</span> allocated
                            </div>
                            {Array.isArray(m.br_results) && m.br_results.length > 0 && (
                              <div className="text-[11px] text-slate-500 truncate">
                                {m.br_results.map((r) => r.team_name).join(", ")}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                              <span
                                className={`font-semibold truncate ${
                                  m.winner_id && m.winner_id === m.team_a_id
                                    ? "text-emerald-700"
                                    : teamA
                                    ? "text-slate-900"
                                    : "italic text-slate-600"
                                }`}
                              >
                                {teamA?.team_name ||
                                  (m.winner_id
                                    ? "—"
                                    : resolveMatchSlotDisplay({
                                        match: m,
                                        slot: "a",
                                        allMatches: matches,
                                        teamNameById,
                                      }).label)}
                              </span>
                              <span className="font-mono font-bold tabular-nums text-slate-700">
                                {m.score_a}
                              </span>
                            </div>
                            <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                              <span
                                className={`font-semibold truncate ${
                                  m.winner_id && m.winner_id === m.team_b_id
                                    ? "text-emerald-700"
                                    : teamB
                                    ? "text-slate-900"
                                    : "italic text-slate-600"
                                }`}
                              >
                                {teamB?.team_name ||
                                  resolveMatchSlotDisplay({
                                    match: m,
                                    slot: "b",
                                    allMatches: matches,
                                    teamNameById,
                                  }).label}
                              </span>
                              <span className="font-mono font-bold tabular-nums text-slate-700">
                                {m.score_b}
                              </span>
                            </div>
                          </div>
                        )}

                        {canSwap && (
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSwapMatch(m);
                                setSwapTeamA(m.team_a_id || "");
                                setSwapTeamB(m.team_b_id || "");
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer bg-transparent border-0"
                            >
                              <ArrowLeftRight size={12} />
                              <span>Swap / Remap Teams</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal Before Regeneration */}
      {confirmRegenOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setConfirmRegenOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle size={18} />
                <h3 className="text-base font-bold m-0 text-slate-900">
                  Confirm Bracket Regeneration
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmRegenOpen(false)}
                className="p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-600 m-0 leading-relaxed">
              This will cleanly replace all existing <strong>{matches.length}</strong> match(es) for{" "}
              <strong>{selectedGame?.title}</strong> using the current selected teams ({orderedEligible.length}) and{" "}
              <strong>{FORMAT_LABELS[format]}</strong> format.
            </p>
            {structureLocked && (
              <div>
                <label className="block text-xs font-semibold text-rose-800 mb-1">
                  Override Warning — Active/Completed results exist. Enter reason:
                </label>
                <input
                  type="text"
                  value={regenOverrideReason}
                  onChange={(e) => setRegenOverrideReason(e.target.value)}
                  placeholder="e.g. Seeding correction approved by organizer"
                  className="w-full h-9 px-3 rounded-lg border border-rose-300 text-xs"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRegenOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={generating || (structureLocked && regenOverrideReason.trim().length < 4)}
                onClick={() => executeGeneration(true)}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
              >
                {generating ? "Regenerating..." : "Replace & Regenerate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Play Team Swap Modal */}
      {swapMatch && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setSwapMatch(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 m-0">
                Remap Match Pairing · {swapMatch.match_code || swapMatch.round}
              </h3>
              <button type="button" onClick={() => setSwapMatch(null)} className="p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            {selectedGame && (
              <div className="space-y-3 text-xs">
                <SearchableTeamSelect
                  id="bracket-swap-slot-a"
                  label="Slot A"
                  teams={selectedTeams}
                  gameId={selectedGame.id}
                  value={swapTeamA || null}
                  onChange={(id) => setSwapTeamA(id || "")}
                  allowTbd
                  tbdLabel="TBD / Empty"
                />
                <SearchableTeamSelect
                  id="bracket-swap-slot-b"
                  label="Slot B"
                  teams={selectedTeams}
                  gameId={selectedGame.id}
                  value={swapTeamB || null}
                  onChange={(id) => setSwapTeamB(id || "")}
                  allowTbd
                  tbdLabel="TBD / BYE"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSwapMatch(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingSwap}
                onClick={handleSaveTeamSwap}
                className="px-4 py-2 rounded-lg bg-[#0B1120] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 size={14} />
                <span>{savingSwap ? "Saving..." : "Apply Pairing"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
