import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { computeGameRegistrationStats } from "@/lib/esportsRegistrationControls";
import type { Game, Registration, RegistrationControl } from "@/types/database";
import {
  AlertTriangle,
  CheckCircle2,
  Gamepad2,
  Lock,
  RefreshCw,
  Save,
  ShieldAlert,
  Unlock,
  Users,
  X,
} from "lucide-react";

interface EsportsRegistrationControlPanelProps {
  onUpdated?: () => void;
}

interface GameDraftSettings {
  maxTeamsInput: string;
  autoCloseAtCapacity: boolean;
  closedMessage: string;
}

export function EsportsRegistrationControlPanel({ onUpdated }: EsportsRegistrationControlPanelProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission([
    "tournament:manage_games",
    "esports:edit",
    "system_settings:manage",
  ]);

  const [games, setGames] = useState<Game[]>([]);
  const [registrations, setRegistrations] = useState<
    Pick<Registration, "id" | "game_id" | "status" | "admin_notes" | "submitted_at">[]
  >([]);
  const [portalControl, setPortalControl] = useState<RegistrationControl | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GameDraftSettings>>({});
  const [loading, setLoading] = useState(true);
  const [busyGameId, setBusyGameId] = useState<string | null>(null);
  const [migrationPendingNotice, setMigrationPendingNotice] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [gamesRes, regsRes, ctrlRes] = await Promise.all([
        supabase.from("games").select("*").order("sort_order", { ascending: true }),
        supabase
          .from("registrations")
          .select("id, game_id, status, admin_notes, submitted_at"),
        supabase
          .from("registration_controls")
          .select("*")
          .eq("form_type", "esports")
          .limit(1),
      ]);

      if (gamesRes.error) throw gamesRes.error;
      const loadedGames = (gamesRes.data as Game[]) || [];
      setGames(loadedGames);

      const hasNewColumns =
        loadedGames.length === 0 ||
        Object.prototype.hasOwnProperty.call(loadedGames[0], "registration_open");
      if (!hasNewColumns) {
        setMigrationPendingNotice(
          "Apply migration 20261123000000_esports_game_controls_and_player_education.sql in Supabase SQL Editor to activate per-game open/close switches, auto-closure at capacity, capacity overrides, and player educational fields."
        );
      } else {
        setMigrationPendingNotice(null);
      }

      const nextDrafts: Record<string, GameDraftSettings> = {};
      for (const g of loadedGames) {
        nextDrafts[g.id] = {
          maxTeamsInput: g.max_teams && g.max_teams > 0 ? String(g.max_teams) : "",
          autoCloseAtCapacity: g.auto_close_at_capacity !== false,
          closedMessage: g.registration_closed_message || "",
        };
      }
      setDrafts(nextDrafts);

      if (!regsRes.error && Array.isArray(regsRes.data)) {
        setRegistrations(regsRes.data as any[]);
      }
      if (!ctrlRes.error && Array.isArray(ctrlRes.data) && ctrlRes.data.length > 0) {
        setPortalControl(ctrlRes.data[0] as RegistrationControl);
      }
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err?.message || "Failed to load per-game esports registration controls.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const statsList = useMemo(
    () =>
      computeGameRegistrationStats(
        games.filter((g) => g.is_active),
        registrations as any,
        portalControl
      ),
    [games, registrations, portalControl]
  );

  const updateDraft = (gameId: string, patch: Partial<GameDraftSettings>) => {
    setDrafts((prev) => ({
      ...prev,
      [gameId]: {
        maxTeamsInput: prev[gameId]?.maxTeamsInput ?? "",
        autoCloseAtCapacity: prev[gameId]?.autoCloseAtCapacity ?? true,
        closedMessage: prev[gameId]?.closedMessage ?? "",
        ...patch,
      },
    }));
  };

  const handleControlAction = async (
    gameId: string,
    gameTitle: string,
    action: "open" | "close" | "reopen_override" | "update_settings",
    overrideMaxTeams?: number | null
  ) => {
    if (!canManage) return;
    const draft = drafts[gameId] || {
      maxTeamsInput: "",
      autoCloseAtCapacity: true,
      closedMessage: "",
    };

    const parsedMax =
      overrideMaxTeams !== undefined
        ? overrideMaxTeams
        : draft.maxTeamsInput.trim()
        ? Number(draft.maxTeamsInput.trim())
        : null;

    if (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 5000)) {
      setStatusMsg({
        type: "error",
        text: `Invalid maximum capacity for ${gameTitle}. Enter a whole number (1 or more) or leave empty for unlimited.`,
      });
      return;
    }

    setBusyGameId(gameId);
    setStatusMsg(null);

    try {
      const clearMaxTeams = parsedMax === null;
      const { error } = await supabase.rpc("update_esports_game_registration_control", {
        p_game_id: gameId,
        p_action: action,
        p_max_teams: parsedMax,
        p_clear_max_teams: clearMaxTeams,
        p_auto_close_at_capacity: draft.autoCloseAtCapacity,
        p_closed_message: draft.closedMessage.trim() || "",
      });

      if (error) {
        const msg = String(error.message || "");
        if (
          msg.includes("Could not find the function") ||
          error.code === "PGRST202" ||
          error.code === "42883"
        ) {
          throw new Error(
            "Database migration 20261123000000_esports_game_controls_and_player_education.sql has not been applied on Supabase yet. Apply the migration to enable per-game registration locks."
          );
        }
        throw error;
      }

      const actionLabel =
        action === "close"
          ? `Closed registrations immediately for ${gameTitle}.`
          : action === "reopen_override"
          ? `Overrode capacity lock and reopened registrations for ${gameTitle}.`
          : action === "open"
          ? `Opened registrations for ${gameTitle}.`
          : `Saved capacity & auto-close rules for ${gameTitle}.`;

      setStatusMsg({ type: "success", text: actionLabel });
      await loadData();
      onUpdated?.();
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err?.message || `Failed to update registration controls for ${gameTitle}.`,
      });
    } finally {
      setBusyGameId(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              Game-Wise Registration Control
            </span>
            {portalControl && !portalControl.is_open && (
              <span className="text-[11px] font-mono font-bold uppercase text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Global Esports Portal Closed
              </span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-display font-black text-slate-900 mt-1 mb-0.5">
            Esports Registration Control (Free Fire · BGMI · Valorant)
          </h2>
          <p className="text-xs text-slate-500 m-0">
            Independently open, close, set team capacity, auto-close on full capacity, or override &amp; reopen any game without affecting existing teams or tournament brackets.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          <span>Sync Counts</span>
        </button>
      </div>

      {migrationPendingNotice && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-700" />
          <span>{migrationPendingNotice}</span>
        </div>
      )}

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
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-xs font-mono text-slate-500">
          Loading game registration controls...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {statsList.map((stat) => {
            const { game } = stat;
            const draft = drafts[game.id] || {
              maxTeamsInput: game.max_teams ? String(game.max_teams) : "",
              autoCloseAtCapacity: game.auto_close_at_capacity !== false,
              closedMessage: game.registration_closed_message || "",
            };
            const isBusy = busyGameId === game.id;

            const statusBadge = (() => {
              switch (stat.statusReason) {
                case "open":
                  return {
                    label: "OPEN",
                    cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
                  };
                case "open_override":
                  return {
                    label: "OPEN (CAPACITY OVERRIDE)",
                    cls: "bg-indigo-50 text-indigo-800 border-indigo-200",
                  };
                case "capacity_reached":
                  return {
                    label: "AUTO-CLOSED (FULL)",
                    cls: "bg-amber-50 text-amber-900 border-amber-300",
                  };
                case "portal_closed":
                case "portal_scheduled":
                case "portal_expired":
                  return {
                    label: "PORTAL PAUSED",
                    cls: "bg-rose-50 text-rose-800 border-rose-200",
                  };
                case "manual_closed":
                default:
                  return {
                    label: "CLOSED",
                    cls: "bg-rose-50 text-rose-800 border-rose-200",
                  };
              }
            })();

            const isClosed = game.registration_open === false || (!stat.isEffectivelyOpen && stat.statusReason === "capacity_reached");

            return (
              <div
                key={game.id}
                className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-4 transition-colors ${
                  stat.isEffectivelyOpen
                    ? "bg-white border-slate-200"
                    : "bg-slate-50/80 border-rose-200/80"
                }`}
              >
                <div className="space-y-4">
                  {/* Game Title & Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Gamepad2 size={15} className="text-purple-700" />
                        <h3 className="text-base font-display font-black text-slate-900 m-0">
                          {game.title}
                        </h3>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">
                        Roster: {game.team_size ?? 4} players/team
                      </span>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full border font-mono text-[10px] font-bold uppercase ${statusBadge.cls}`}
                    >
                      {statusBadge.label}
                    </span>
                  </div>

                  {/* Counters Grid */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Total Teams</span>
                      <strong className="text-lg font-display font-black text-slate-900 tabular-nums">
                        {stat.totalRegisteredTeams}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                      <span className="text-[10px] font-mono uppercase text-emerald-700 block">Approved</span>
                      <strong className="text-lg font-display font-black text-emerald-700 tabular-nums">
                        {stat.approvedTeams}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
                      <span className="text-[10px] font-mono uppercase text-amber-700 block">Pending</span>
                      <strong className="text-lg font-display font-black text-amber-700 tabular-nums">
                        {stat.pendingTeams}
                      </strong>
                    </div>
                  </div>

                  {/* Capacity Progress Indicator */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium">
                      <Users size={13} className="text-blue-600" />
                      <span>Active Slots Used:</span>
                    </span>
                    <strong className="font-mono text-slate-900">
                      {stat.activeCapacityTeams} / {game.max_teams ? game.max_teams : "Unlimited"}
                      {stat.slotsRemaining !== null && (
                        <span className="text-[11px] text-slate-500 font-normal ml-1">
                          ({stat.slotsRemaining} left)
                        </span>
                      )}
                    </strong>
                  </div>

                  {/* Quick Open / Close / Override Reopen Action Bar */}
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {!isClosed && stat.isEffectivelyOpen ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleControlAction(game.id, game.title, "close")}
                          className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <Lock size={13} />
                          <span>Close Immediately</span>
                        </button>
                      ) : stat.isAtCapacity ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleControlAction(game.id, game.title, "reopen_override")}
                          className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                          title="Override automatic capacity closure and accept additional teams"
                        >
                          <ShieldAlert size={13} />
                          <span>Override &amp; Reopen</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleControlAction(game.id, game.title, "open")}
                          className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <Unlock size={13} />
                          <span>{game.registration_open === false ? "Reopen Registrations" : "Open Registrations"}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Capacity & Auto-Close Configuration */}
                  <div className="pt-3 border-t border-slate-100 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <label className="font-semibold text-slate-700">Max Team Capacity</label>
                      {draft.maxTeamsInput && canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            updateDraft(game.id, { maxTeamsInput: "" });
                            handleControlAction(game.id, game.title, "update_settings", null);
                          }}
                          className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
                        >
                          Remove Limit
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      disabled={!canManage}
                      placeholder="Unlimited teams"
                      value={draft.maxTeamsInput}
                      onChange={(e) => updateDraft(game.id, { maxTeamsInput: e.target.value })}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white font-mono text-xs disabled:opacity-60"
                    />

                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 select-none">
                      <input
                        type="checkbox"
                        disabled={!canManage}
                        checked={draft.autoCloseAtCapacity}
                        onChange={(e) =>
                          updateDraft(game.id, { autoCloseAtCapacity: e.target.checked })
                        }
                        className="accent-slate-900"
                      />
                      <span>Auto-close when max capacity is reached</span>
                    </label>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Closed Notice Message (Optional)
                      </label>
                      <input
                        type="text"
                        disabled={!canManage}
                        maxLength={200}
                        placeholder={`e.g. ${game.title} slots are full.`}
                        value={draft.closedMessage}
                        onChange={(e) => updateDraft(game.id, { closedMessage: e.target.value })}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>

                {canManage && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleControlAction(game.id, game.title, "update_settings")}
                    className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <Save size={13} />
                    <span>{isBusy ? "Saving..." : "Save Capacity & Rules"}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
