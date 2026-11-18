import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatLastUpdatedIst } from "@/lib/gatePortal";
import type {
  EsportsResetBackupSummary,
  EsportsResetPreview,
  EsportsResetScope,
  Game,
} from "@/types/database";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  DatabaseBackup,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";

interface TournamentResetRecoverySectionProps {
  selectedGame: Game | null;
  games: Game[];
  onResetComplete: (message: string) => void;
  onError: (message: string) => void;
}

const SCOPE_OPTIONS: {
  id: EsportsResetScope;
  title: string;
  subtitle: string;
  severity: string;
}[] = [
  {
    id: "results_only",
    title: "1. Reset Results Only",
    subtitle:
      "Keep generated brackets, fixtures, and team selections. Clear all match scores, winners, BR round points, disputes, result history, and champion.",
    severity: "Scores & Standings Only",
  },
  {
    id: "selected_game",
    title: "2. Reset Selected Game",
    subtitle:
      "Clear all brackets, matches, schedules, conductors, scores, standings, and team selections for the active game ONLY.",
    severity: "Single Game Reset",
  },
  {
    id: "full_reset",
    title: "3. Full Tournament Reset",
    subtitle:
      "Reset the entire Esports Control Centre across Valorant, Free Fire, and BGMI to a clean pre-event state.",
    severity: "Requires Typing RESET",
  },
];

export function TournamentResetRecoverySection({
  selectedGame,
  games,
  onResetComplete,
  onError,
}: TournamentResetRecoverySectionProps) {
  const { isSuperAdmin } = useAuth();

  const [scope, setScope] = useState<EsportsResetScope>("results_only");
  const [targetGameId, setTargetGameId] = useState<string>(selectedGame?.id || games[0]?.id || "");
  const [reason, setReason] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [preview, setPreview] = useState<EsportsResetPreview | null>(null);
  const [backups, setBackups] = useState<EsportsResetBackupSummary[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [lastBackupId, setLastBackupId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedGame?.id) {
      setTargetGameId(selectedGame.id);
    }
  }, [selectedGame?.id]);

  const effectiveGameId = scope === "full_reset" ? null : targetGameId || selectedGame?.id || null;

  const loadPreviewAndBackups = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoadingPreview(true);
    try {
      const [prevRes, backupRes] = await Promise.all([
        supabase.rpc("get_esports_reset_preview", {
          p_scope: scope,
          p_game_id: effectiveGameId,
        }),
        supabase
          .from("esports_reset_backups")
          .select("id, scope, game_id, game_title, reason, triggered_by, triggered_by_email, counts_summary, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (!prevRes.error && prevRes.data) {
        setPreview(prevRes.data as EsportsResetPreview);
      } else {
        setPreview(null);
      }

      if (!backupRes.error && Array.isArray(backupRes.data)) {
        setBackups(backupRes.data as EsportsResetBackupSummary[]);
      }
    } catch {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [isSuperAdmin, scope, effectiveGameId]);

  useEffect(() => {
    loadPreviewAndBackups();
  }, [loadPreviewAndBackups]);

  if (!isSuperAdmin) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-2">
        <ShieldAlert size={28} className="mx-auto text-rose-600" />
        <h3 className="text-base font-bold text-rose-950 m-0">Super Admin Access Required</h3>
        <p className="text-xs text-rose-800 m-0">
          Master Esports Reset &amp; Recovery controls are strictly restricted to active Super Admin accounts.
        </p>
      </div>
    );
  }

  const requiresTypedReset = scope === "full_reset";
  const typedResetValid = !requiresTypedReset || confirmationText.trim().toUpperCase() === "RESET";
  const canExecute =
    !executing &&
    typedResetValid &&
    (scope !== "selected_game" || Boolean(effectiveGameId));

  const handleExecuteReset = async () => {
    if (!canExecute) return;
    if (requiresTypedReset && confirmationText.trim().toUpperCase() !== "RESET") {
      onError("Type RESET in uppercase to confirm Full Tournament Reset.");
      return;
    }

    setExecuting(true);
    setLastBackupId(null);
    try {
      const { data, error } = await supabase.rpc("execute_esports_reset", {
        p_scope: scope,
        p_game_id: effectiveGameId,
        p_confirmation_text: requiresTypedReset ? confirmationText.trim().toUpperCase() : null,
        p_reason: reason.trim() || null,
      });

      if (error) {
        const msg = String(error.message || "");
        if (error.code === "PGRST202" || msg.includes("execute_esports_reset")) {
          throw new Error(
            "Migration 20261125000000_pre_event_controls_reset_and_gate_portal.sql must be applied in Supabase SQL Editor before running Master Reset."
          );
        }
        throw error;
      }

      const payload = (data || {}) as { ok?: boolean; backup_id?: string; game_title?: string | null };
      if (payload.backup_id) {
        setLastBackupId(payload.backup_id);
      }

      setConfirmationText("");
      setReason("");
      await loadPreviewAndBackups();

      const label =
        scope === "results_only"
          ? "Match results, BR points, and standings cleared (fixtures & teams preserved)."
          : scope === "selected_game"
          ? `Tournament workspace reset cleanly for ${payload.game_title || selectedGame?.title || "selected game"}.`
          : "Full Esports Control Centre reset complete. Backup snapshot archived cleanly.";

      onResetComplete(label);
    } catch (err: any) {
      onError(err?.message || "Failed to execute tournament reset.");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-rose-800 bg-rose-50 px-2.5 py-0.5 rounded border border-rose-200">
              <ShieldAlert size={12} /> Super Admin Only · Backup-Protected Reset
            </span>
            <h2 className="text-lg sm:text-xl font-display font-black text-slate-900 mt-1.5 mb-0.5">
              Esports Reset &amp; Recovery Console
            </h2>
            <p className="text-xs text-slate-500 m-0">
              Safely reset test competition data before going live. Every reset automatically creates an immutable JSONB backup snapshot and logs an audit entry.
            </p>
          </div>
          <button
            type="button"
            onClick={loadPreviewAndBackups}
            disabled={loadingPreview}
            className="min-h-[38px] px-3.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw size={13} className={loadingPreview ? "animate-spin" : ""} />
            <span>Refresh Counts</span>
          </button>
        </div>

        {/* Strictly Preserved Guarantee */}
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
          <ShieldCheck size={17} className="shrink-0 text-emerald-700 mt-0.5" />
          <div>
            <strong className="block mb-0.5">Preserved Data Guarantee (Never Deleted):</strong>
            <span>
              All Esports team registrations, player rosters &amp; educational details, visitor passes, QR tickets, gate check-ins, wristband records, CRM staff accounts, and historical audit logs are strictly preserved.
            </span>
          </div>
        </div>

        {/* 3 Reset Scope Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {SCOPE_OPTIONS.map((opt) => {
            const active = scope === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setScope(opt.id);
                  setConfirmationText("");
                }}
                className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  active
                    ? opt.id === "full_reset"
                      ? "bg-rose-50/70 border-rose-600 shadow-xs"
                      : "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <div>
                  <span
                    className={`inline-block text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded mb-2 ${
                      active
                        ? opt.id === "full_reset"
                          ? "bg-rose-600 text-white"
                          : "bg-white/15 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {opt.severity}
                  </span>
                  <h3
                    className={`text-sm font-bold m-0 mb-1 ${
                      active && opt.id !== "full_reset" ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {opt.title}
                  </h3>
                  <p
                    className={`text-xs leading-relaxed m-0 ${
                      active && opt.id !== "full_reset" ? "text-slate-300" : "text-slate-600"
                    }`}
                  >
                    {opt.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Game Selector for Selected Game / Results Only */}
        {scope !== "full_reset" && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <label htmlFor="reset-target-game" className="text-xs font-bold text-slate-800 block">
                Target Game Scope
              </label>
              <span className="text-[11px] text-slate-500">
                {scope === "selected_game"
                  ? "Only competition data for the selected game will be reset."
                  : "Optionally target a specific game or clear results across all games."}
              </span>
            </div>
            <select
              id="reset-target-game"
              value={targetGameId}
              onChange={(e) => setTargetGameId(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900 min-w-[220px]"
            >
              {scope === "results_only" && <option value="">All Games</option>}
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Live Affected vs Preserved Preview */}
        {preview ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 space-y-2.5">
              <div className="text-xs font-mono font-bold uppercase text-rose-800 flex items-center gap-1.5">
                <Trash2 size={14} />
                <span>Will Be Reset ({preview.game_title || "All Games"})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-white border border-rose-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Matches</span>
                  <strong className="text-base font-black text-rose-700 tabular-nums">
                    {preview.affected.matches}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-rose-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Results / BR</span>
                  <strong className="text-base font-black text-rose-700 tabular-nums">
                    {preview.affected.results}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-rose-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Disputes</span>
                  <strong className="text-base font-black text-rose-700 tabular-nums">
                    {preview.affected.disputes}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-rose-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Result History</span>
                  <strong className="text-base font-black text-rose-700 tabular-nums">
                    {preview.affected.history}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-rose-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Selections</span>
                  <strong className="text-base font-black text-rose-700 tabular-nums">
                    {preview.affected.team_selections}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-rose-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Tournaments</span>
                  <strong className="text-base font-black text-rose-700 tabular-nums">
                    {preview.affected.tournaments}
                  </strong>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-2.5">
              <div className="text-xs font-mono font-bold uppercase text-emerald-800 flex items-center gap-1.5">
                <Archive size={14} />
                <span>Strictly Preserved (Untouched)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Esports Teams</span>
                  <strong className="text-base font-black text-emerald-700 tabular-nums">
                    {preview.preserved.esports_registrations}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Players</span>
                  <strong className="text-base font-black text-emerald-700 tabular-nums">
                    {preview.preserved.players}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Visitors</span>
                  <strong className="text-base font-black text-emerald-700 tabular-nums">
                    {preview.preserved.visitor_registrations}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Tickets / Passes</span>
                  <strong className="text-base font-black text-emerald-700 tabular-nums">
                    {preview.preserved.tickets}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Gate Check-Ins</span>
                  <strong className="text-base font-black text-emerald-700 tabular-nums">
                    {preview.preserved.gate_checkins}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block">Audit Logs</span>
                  <strong className="text-base font-black text-emerald-700 tabular-nums">
                    {preview.preserved.audit_logs}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-amber-700" />
            <span>
              Apply migration <code className="font-mono font-bold">20261125000000_pre_event_controls_reset_and_gate_portal.sql</code> on Supabase to enable live preview counts, backup snapshots, and Super Admin Master Reset.
            </span>
          </div>
        )}

        {/* Execution Form */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="reset-reason" className="text-xs font-bold text-slate-700 block mb-1">
                Audit Reason (Optional)
              </label>
              <input
                id="reset-reason"
                type="text"
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Pre-event clean slate after practice testing"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs text-slate-900"
              />
            </div>

            {requiresTypedReset && (
              <div>
                <label htmlFor="reset-confirm-input" className="text-xs font-bold text-rose-800 block mb-1">
                  Confirmation Required: Type <span className="font-mono underline">RESET</span>
                </label>
                <input
                  id="reset-confirm-input"
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Type RESET to unlock Full Tournament Reset"
                  className="w-full h-10 px-3 rounded-xl border-2 border-rose-300 focus:border-rose-600 bg-white font-mono text-xs font-bold text-rose-950 uppercase"
                />
              </div>
            )}
          </div>

          {lastBackupId && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span>
                Snapshot backup archived successfully before reset. Backup ID:{" "}
                <code className="font-mono font-bold">{lastBackupId}</code>
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={!canExecute}
              onClick={handleExecuteReset}
              className={`min-h-[42px] px-5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed transition-colors ${
                scope === "full_reset"
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-slate-900 hover:bg-slate-800 text-white"
              }`}
            >
              <RotateCcw size={14} className={executing ? "animate-spin" : ""} />
              <span>
                {executing
                  ? "Creating Backup & Resetting..."
                  : scope === "results_only"
                  ? "Create Backup & Reset Results Only"
                  : scope === "selected_game"
                  ? "Create Backup & Reset Selected Game"
                  : "Create Backup & Execute Full Reset"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Backup Snapshots Archive Table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
        <div className="flex items-center gap-2">
          <DatabaseBackup size={16} className="text-slate-700" />
          <h3 className="text-sm font-bold text-slate-900 m-0">
            Protected Esports Reset Backups ({backups.length})
          </h3>
        </div>

        {backups.length === 0 ? (
          <p className="text-xs text-slate-500 m-0">No reset backups recorded yet.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                  <th className="py-2.5 px-3">Created At (IST)</th>
                  <th className="py-2.5 px-3">Scope</th>
                  <th className="py-2.5 px-3">Game</th>
                  <th className="py-2.5 px-3">Triggered By</th>
                  <th className="py-2.5 px-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {formatLastUpdatedIst(b.created_at)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 uppercase">
                      {b.scope}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{b.game_title || "All Games"}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                      {b.triggered_by_email || "System"}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{b.reason}</td>
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
