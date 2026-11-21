import { useState } from "react";
import { findTeamAffectedMatches } from "@/lib/esportsFixtureCorrections";
import { callReplaceEsportsFixtureTeamRpc } from "@/lib/esportsFixtureRpc";
import { SearchableTeamSelect } from "./SearchableTeamSelect";
import type { Match, Registration } from "@/types/database";
import { AlertTriangle, CheckCircle2, Gavel, RefreshCw, RotateCcw, X } from "lucide-react";

interface DisqualificationImpactBannerProps {
  team: Registration;
  gameId: string;
  matches: Match[];
  allGameTeams: Registration[];
  teamMap: Map<string, Registration>;
  canEdit: boolean;
  reinstating?: boolean;
  onReinstate: (team: Registration) => void;
  onOpenResolveForfeit: (match: Match) => void;
  onPartialRefresh: (opts: { matchIds?: string[]; registrationIds?: string[]; message?: string }) => Promise<void>;
  onError: (msg: string) => void;
  onDismiss: () => void;
}

export function DisqualificationImpactBanner({
  team,
  gameId,
  matches,
  allGameTeams,
  teamMap,
  canEdit,
  reinstating = false,
  onReinstate,
  onOpenResolveForfeit,
  onPartialRefresh,
  onError,
  onDismiss,
}: DisqualificationImpactBannerProps) {
  const affected = findTeamAffectedMatches(matches, team.id);
  const [replacingMatchId, setReplacingMatchId] = useState<string | null>(null);
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [replaceReason, setReplaceReason] = useState(`Replacing disqualified team ${team.team_name}`);
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);

  const handleReplaceInMatch = async (m: Match) => {
    if (!canEdit) return;
    if (m.bracket_side === "battle_royale") {
      onOpenResolveForfeit(m);
      return;
    }
    const slot: "a" | "b" = m.team_a_id === team.id ? "a" : "b";
    const otherTeamId = slot === "a" ? m.team_b_id : m.team_a_id;
    setBusyMatchId(m.id);
    try {
      const res = await callReplaceEsportsFixtureTeamRpc({
        matchId: m.id,
        slot,
        expectedTeamId: team.id,
        replacementTeamId: replacementId,
        otherSlotTeamId: otherTeamId,
        reason: replaceReason.trim() || `Replacing disqualified team ${team.team_name}`,
      });
      if (!res.ok) {
        onError(res.error || "Could not replace team in fixture.");
        return;
      }
      setReplacingMatchId(null);
      setReplacementId(null);
      await onPartialRefresh({
        matchIds: [m.id],
        message: `Updated ${m.match_code || m.round}: replaced ${team.team_name}.`,
      });
    } finally {
      setBusyMatchId(null);
    }
  };

  return (
    <div
      data-testid="disqualification-impact-banner"
      className="bg-rose-50/90 border border-rose-200 rounded-xl p-4 space-y-3 text-xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={17} className="text-rose-700 shrink-0 mt-0.5" />
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-rose-800">
              Team Disqualification Active · {team.registration_ref}
            </div>
            <h4 className="text-sm font-bold text-slate-900 m-0 mt-0.5">
              {team.team_name} is marked Disqualified
            </h4>
            <p className="text-slate-700 m-0 mt-0.5">
              {affected.upcomingMatches.length > 0
                ? `${affected.upcomingMatches.length} upcoming/active fixture(s) still reference this squad. Replace the team or resolve a forfeit below.`
                : "No upcoming/active fixtures currently reference this team."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <button
              type="button"
              disabled={reinstating}
              onClick={() => onReinstate(team)}
              className="min-h-[36px] px-3 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-900 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {reinstating ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              <span>{reinstating ? "Reinstating..." : "Reinstate Team"}</span>
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss disqualification notice"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-rose-100 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {affected.upcomingMatches.length > 0 ? (
        <div className="space-y-2">
          {affected.upcomingMatches.map((m) => {
            const isBr = m.bracket_side === "battle_royale";
            const opponentId = m.team_a_id === team.id ? m.team_b_id : m.team_a_id;
            const opponentName = opponentId ? teamMap.get(opponentId)?.team_name || "Opponent" : "TBD";
            const isReplacingHere = replacingMatchId === m.id;

            return (
              <div
                key={m.id}
                className="bg-white border border-rose-200 rounded-lg p-3 space-y-2.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-bold text-slate-900">
                      {m.match_code || `M${m.match_number ?? 1}`} · {m.round}
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      {isBr
                        ? `Battle Royale Lobby (${m.br_results?.length || 0} squads)`
                        : `${team.team_name} vs ${opponentName}`}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {!isBr && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplacingMatchId(isReplacingHere ? null : m.id);
                            setReplacementId(null);
                          }}
                          className="min-h-[34px] px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-semibold cursor-pointer"
                        >
                          {isReplacingHere ? "Close" : "Replace Team"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenResolveForfeit(m)}
                        className="min-h-[34px] px-3 rounded-lg bg-[#0B1120] hover:bg-slate-800 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Gavel size={12} />
                        <span>{isBr ? "Edit Lobby / Substitute" : "Resolve Forfeit"}</span>
                      </button>
                    </div>
                  )}
                </div>

                {isReplacingHere && !isBr && (
                  <div className="pt-2.5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                    <div className="md:col-span-5">
                      <SearchableTeamSelect
                        id={`dq-replace-${m.id}`}
                        label="Replacement Team"
                        teams={allGameTeams}
                        gameId={gameId}
                        value={replacementId}
                        onChange={setReplacementId}
                        allowTbd
                        tbdLabel="Leave Slot Open (TBD)"
                        excludeDisqualified
                        excludeTeamIds={[team.id, ...(opponentId ? [opponentId] : [])]}
                      />
                    </div>
                    <div className="md:col-span-5">
                      <label htmlFor={`dq-reason-${m.id}`} className="block font-semibold text-slate-700 mb-1">
                        Replacement Reason *
                      </label>
                      <input
                        id={`dq-reason-${m.id}`}
                        type="text"
                        value={replaceReason}
                        onChange={(e) => setReplaceReason(e.target.value)}
                        className="w-full h-[42px] px-3 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        type="button"
                        disabled={busyMatchId === m.id || replaceReason.trim().length < 3}
                        onClick={() => void handleReplaceInMatch(m)}
                        className="w-full h-[42px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {busyMatchId === m.id ? (
                          <RefreshCw size={13} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={13} />
                        )}
                        <span>Apply</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
