import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  buildUpdateEsportsGameRegistrationControlParams,
  normalizeEsportsGameAvailabilityList,
} from "@/lib/esportsRegistrationControls";
import { canToggleRegistrationControls } from "@/lib/registrationDesk";
import { formatLastUpdatedIst } from "@/lib/gatePortal";
import type { EsportsGameAvailability, Game, RegistrationControl } from "@/types/database";
import {
  AlertCircle,
  CheckCircle2,
  Lock,
  RefreshCw,
  X,
} from "lucide-react";

export default function RegistrationDeskControls() {
  const { role, accountStatus, permissions } = useAuth();
  const canToggle = canToggleRegistrationControls(role, accountStatus, permissions);

  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [visitorControl, setVisitorControl] = useState<RegistrationControl | null>(null);
  const [esportsPortalControl, setEsportsPortalControl] = useState<RegistrationControl | null>(null);
  const [availability, setAvailability] = useState<EsportsGameAvailability[]>([]);
  const [closedMessageDrafts, setClosedMessageDrafts] = useState<Record<string, string>>({});
  const [visitorClosedMessageDraft, setVisitorClosedMessageDraft] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [availRes, gamesRes, regsRes, ctrlRes] = await Promise.all([
        supabase.rpc("get_esports_registration_availability"),
        supabase.from("games").select("*").order("sort_order", { ascending: true }),
        supabase.from("registrations").select("id, game_id, status, admin_notes, submitted_at, archived_at"),
        supabase.from("registration_controls").select("*").in("form_type", ["visitor", "esports"]),
      ]);

      const loadedGames = !gamesRes.error && Array.isArray(gamesRes.data) ? (gamesRes.data as Game[]) : [];
      const loadedRegs = !regsRes.error && Array.isArray(regsRes.data) ? (regsRes.data as any[]) : [];
      const loadedCtrls = !ctrlRes.error && Array.isArray(ctrlRes.data) ? (ctrlRes.data as RegistrationControl[]) : [];

      const visCtrl = loadedCtrls.find((c) => c.form_type === "visitor") || null;
      const espCtrl = loadedCtrls.find((c) => c.form_type === "esports") || null;

      const normalized = normalizeEsportsGameAvailabilityList({
        rpcRows: !availRes.error && Array.isArray(availRes.data) ? availRes.data : [],
        games: loadedGames,
        registrations: loadedRegs,
        portalControl: espCtrl,
      }).filter((g) => g.is_active && g.is_published);

      setVisitorControl(visCtrl);
      setEsportsPortalControl(espCtrl);
      setAvailability(normalized);
      setVisitorClosedMessageDraft(visCtrl?.closed_message || "");

      const nextDrafts: Record<string, string> = {};
      for (const g of normalized) {
        nextDrafts[g.id] = g.registration_closed_message || "";
      }
      setClosedMessageDrafts(nextDrafts);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err?.message || "Failed to load registration controls.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleVisitor = async (nextOpen: boolean) => {
    if (!canToggle || !visitorControl) return;
    setBusyKey("visitor");
    setStatusMsg(null);
    try {
      const { error } = await supabase
        .from("registration_controls")
        .update({
          is_open: nextOpen,
          closed_message: visitorClosedMessageDraft.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("form_type", "visitor");
      if (error) throw error;
      setStatusMsg({
        type: "success",
        text: `General Visitor registration is now ${nextOpen ? "OPEN" : "CLOSED"}.`,
      });
      await loadData();
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err?.message || "Could not update General Visitor control.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleGame = async (game: EsportsGameAvailability, nextOpen: boolean) => {
    if (!canToggle) return;
    setBusyKey(game.id);
    setStatusMsg(null);
    try {
      const params = buildUpdateEsportsGameRegistrationControlParams({
        gameId: game.id,
        isOpen: nextOpen,
        closedMessage: closedMessageDrafts[game.id] ?? game.registration_closed_message,
      });

      const { error } = await supabase.rpc("update_esports_game_registration_control", params);
      if (error) throw error;

      setStatusMsg({
        type: "success",
        text: `${game.title} registration updated to ${nextOpen ? "OPEN" : "CLOSED"}.`,
      });
      await loadData();
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err?.message || `Failed to update ${game.title} registration control.`,
      });
    } finally {
      setBusyKey(null);
    }
  };

  const visitorOpen = visitorControl ? visitorControl.is_open : true;

  if (!canToggle) {
    return (
      <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
          <Lock size={22} />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-display font-bold text-slate-900 m-0">
            Authorized Access Only
          </h1>
          <p className="text-sm text-slate-600 m-0">
            Opening or closing registrations is restricted to authorized administrators.
          </p>
        </div>
        <Link
          to="/registration-desk"
          className="min-h-[44px] inline-flex items-center justify-center px-5 rounded-xl bg-slate-900 text-white text-sm font-semibold no-underline"
        >
          Back to Registration Desk
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight m-0">
            Registration Controls
          </h1>
          <p className="text-sm text-slate-600 mt-1 mb-0">
            Open or close registration streams.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-60 shrink-0"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
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
            {statusMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* General Visitor Control Card */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 m-0">
                General Visitor Registration
              </h2>
              <span
                className={`text-xs font-semibold ${
                  visitorOpen ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                · {visitorOpen ? "Open" : "Closed"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 m-0">
              Controls walk-in & public visitor admission pass submissions.
              {visitorControl?.updated_at
                ? ` Last updated ${formatLastUpdatedIst(visitorControl.updated_at)}.`
                : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canToggle || busyKey === "visitor" || visitorOpen}
              onClick={() => handleToggleVisitor(true)}
              className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              Open
            </button>
            <button
              type="button"
              disabled={!canToggle || busyKey === "visitor" || !visitorOpen}
              onClick={() => handleToggleVisitor(false)}
              className="min-h-[40px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              Close
            </button>
          </div>
        </div>

        {canToggle && (
          <div>
            <label htmlFor="desk-vis-closed-msg" className="text-xs font-semibold text-slate-700 block mb-1">
              Optional Closed Notice Message
            </label>
            <input
              id="desk-vis-closed-msg"
              type="text"
              value={visitorClosedMessageDraft}
              onChange={(e) => setVisitorClosedMessageDraft(e.target.value)}
              placeholder="Notice displayed when visitor registration is closed"
              className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-600"
            />
          </div>
        )}
      </section>

      {/* Esports Master Portal Notice if closed globally */}
      {esportsPortalControl && !esportsPortalControl.is_open && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900">
          <strong>Master Esports Portal is Closed: </strong>
          {esportsPortalControl.closed_message || "All esports games are paused at the portal level."}
        </div>
      )}

      {/* Per-Game Availability & Controls */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold text-slate-900 m-0">
          Esports Titles — Capacity & Availability
        </h2>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Loading game availability...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {availability.map((game) => {
              const isBusy = busyKey === game.id;
              return (
                <div
                  key={game.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 m-0">{game.title}</h3>
                        <span
                          className={`text-xs font-semibold ${
                            game.is_effectively_open ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          · {game.is_effectively_open
                            ? "Open"
                            : game.status_reason === "capacity_reached"
                            ? "Full"
                            : "Closed"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 m-0">
                        Authoritative toggle: <span className="font-mono">{game.registration_open ? "OPEN" : "CLOSED"}</span>
                        {game.updated_at ? ` · Updated ${formatLastUpdatedIst(game.updated_at)}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={!canToggle || isBusy || game.registration_open}
                        onClick={() => handleToggleGame(game, true)}
                        className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        {isBusy && !game.registration_open ? "Updating..." : "Open"}
                      </button>
                      <button
                        type="button"
                        disabled={!canToggle || isBusy || !game.registration_open}
                        onClick={() => handleToggleGame(game, false)}
                        className="min-h-[40px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        {isBusy && game.registration_open ? "Updating..." : "Close"}
                      </button>
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 block">Registered Teams</span>
                      <strong className="text-lg font-mono text-slate-900 tabular-nums mt-0.5 block">
                        {game.total_registered_teams}
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 block">Approved Teams</span>
                      <strong className="text-lg font-mono text-emerald-700 tabular-nums mt-0.5 block">
                        {game.approved_teams}
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 block">Pending Review</span>
                      <strong className="text-lg font-mono text-amber-700 tabular-nums mt-0.5 block">
                        {game.pending_teams}
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="text-slate-500 block">Available Capacity</span>
                      <strong className="text-lg font-mono text-slate-900 tabular-nums mt-0.5 block">
                        {game.max_teams === null
                          ? "Unlimited"
                          : `${game.slots_remaining ?? 0} / ${game.max_teams}`}
                      </strong>
                    </div>
                  </div>

                  {canToggle && (
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Optional Closed Message for {game.title}
                      </label>
                      <input
                        type="text"
                        value={closedMessageDrafts[game.id] ?? ""}
                        onChange={(e) =>
                          setClosedMessageDrafts((prev) => ({
                            ...prev,
                            [game.id]: e.target.value,
                          }))
                        }
                        placeholder={`Optional notice shown when ${game.title} is closed`}
                        className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-600"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
