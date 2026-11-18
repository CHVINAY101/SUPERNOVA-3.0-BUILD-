import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { normalizeEsportsGameAvailabilityList, getGameClosedDisplayMessage } from "@/lib/esportsRegistrationControls";
import {
  canToggleRegistrationControls,
  computeDeskTodayMetrics,
  getIstDateKey,
} from "@/lib/registrationDesk";
import type { EsportsGameAvailability, Game, Registration, RegistrationControl } from "@/types/database";
import {
  ArrowRight,
  Gamepad2,
  Lock,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Unlock,
  UserPlus,
} from "lucide-react";

export default function RegistrationDeskDashboard() {
  const { role, accountStatus, permissions } = useAuth();
  const canToggle = canToggleRegistrationControls(role, accountStatus, permissions);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [visitorRows, setVisitorRows] = useState<Array<{ id: string; created_at: string }>>([]);
  const [esportsRows, setEsportsRows] = useState<
    Array<Pick<Registration, "id" | "game_id" | "status" | "admin_notes" | "submitted_at"> & { archived_at?: string | null }>
  >([]);
  const [visitorControl, setVisitorControl] = useState<RegistrationControl | null>(null);
  const [esportsAvailability, setEsportsAvailability] = useState<EsportsGameAvailability[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [visRes, regRes, ctrlRes, gamesRes, availRes] = await Promise.all([
        supabase.from("visitor_registrations").select("id, created_at"),
        supabase.from("registrations").select("id, game_id, status, admin_notes, submitted_at, archived_at"),
        supabase.from("registration_controls").select("*").in("form_type", ["visitor", "esports"]),
        supabase.from("games").select("*").order("sort_order", { ascending: true }),
        supabase.rpc("get_esports_registration_availability"),
      ]);

      if (visRes.error && regRes.error && gamesRes.error) {
        throw visRes.error;
      }

      const loadedVisitors = Array.isArray(visRes.data) ? (visRes.data as any[]) : [];
      const loadedRegs = Array.isArray(regRes.data) ? (regRes.data as any[]) : [];
      const loadedCtrls = Array.isArray(ctrlRes.data) ? (ctrlRes.data as RegistrationControl[]) : [];
      const loadedGames = Array.isArray(gamesRes.data) ? (gamesRes.data as Game[]) : [];

      const visCtrl = loadedCtrls.find((c) => c.form_type === "visitor") || null;
      const espCtrl = loadedCtrls.find((c) => c.form_type === "esports") || null;

      const normalizedAvail = normalizeEsportsGameAvailabilityList({
        rpcRows: !availRes.error && Array.isArray(availRes.data) ? availRes.data : [],
        games: loadedGames,
        registrations: loadedRegs,
        portalControl: espCtrl,
      }).filter((g) => g.is_active && g.is_published);

      setVisitorRows(loadedVisitors);
      setEsportsRows(loadedRegs);
      setVisitorControl(visCtrl);
      setEsportsAvailability(normalizedAvail);
    } catch (err: any) {
      setErrorMsg(err?.message || "Could not load Registration Desk overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const metrics = useMemo(
    () =>
      computeDeskTodayMetrics({
        visitors: visitorRows,
        esports: esportsRows,
      }),
    [visitorRows, esportsRows]
  );

  const openGamesCount = esportsAvailability.filter((g) => g.is_effectively_open).length;
  const visitorPortalOpen = visitorControl ? visitorControl.is_open : true;
  const todayIst = getIstDateKey() || "Today";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-slate-500 m-0">
            Supernova 3.0 · Registration Operations · {todayIst} (IST)
          </p>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tracking-tight mt-1 mb-0">
            Registration Desk
          </h1>
        </div>

        <button
          type="button"
          onClick={loadDashboard}
          disabled={loading}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-60 self-start sm:self-auto whitespace-nowrap"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Refresh Live Counts</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-800 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Today's Metrics & Availability Strip */}
      <section aria-label="Today's Registration Metrics" className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500 m-0">Visitors Today (IST)</p>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tabular-nums">
                {loading ? "—" : metrics.visitorsToday}
              </span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                / {loading ? "—" : metrics.visitorsTotal} total
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500 m-0">Esports Teams Today (IST)</p>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tabular-nums">
                {loading ? "—" : metrics.esportsToday}
              </span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                / {loading ? "—" : metrics.esportsTotal} active
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500 m-0">General Visitor Desk</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  visitorPortalOpen ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
              <span
                className={`text-sm font-semibold ${
                  visitorPortalOpen ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {visitorPortalOpen ? "Open for Walk-ins" : "Currently Closed"}
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500 m-0">Esports Games Open</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tabular-nums">
                {loading ? "—" : `${openGamesCount} / ${esportsAvailability.length || 3}`}
              </span>
              <span className="text-xs text-slate-500">live titles</span>
            </div>
          </div>
        </div>
      </section>

      {/* Four Primary Actions */}
      <section aria-label="Primary Registration Actions">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/registration-desk/visitor"
            className="group bg-white border border-slate-200 hover:border-blue-600 rounded-2xl p-5 flex flex-col justify-between gap-4 no-underline transition-colors min-h-[156px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <UserPlus size={20} />
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:text-blue-600 transition-colors mt-1" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0">
                General Visitor Registration
              </h2>
              <p className="text-xs text-slate-500 mt-1 mb-0 leading-relaxed">
                Register walk-in attendees and immediately issue a printable QR pass & PDF.
              </p>
            </div>
          </Link>

          <Link
            to="/registration-desk/esports"
            className="group bg-white border border-slate-200 hover:border-indigo-600 rounded-2xl p-5 flex flex-col justify-between gap-4 no-underline transition-colors min-h-[156px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                <Gamepad2 size={20} />
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:text-indigo-600 transition-colors mt-1" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0">
                Esports Registration
              </h2>
              <p className="text-xs text-slate-500 mt-1 mb-0 leading-relaxed">
                Submit VALORANT (5p), BGMI (4p), or FREE FIRE (4p) squads with player education details.
              </p>
            </div>
          </Link>

          <Link
            to="/registration-desk/search"
            className="group bg-white border border-slate-200 hover:border-emerald-600 rounded-2xl p-5 flex flex-col justify-between gap-4 no-underline transition-colors min-h-[156px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Search size={20} />
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:text-emerald-600 transition-colors mt-1" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0">
                Search Existing Registration
              </h2>
              <p className="text-xs text-slate-500 mt-1 mb-0 leading-relaxed">
                Find visitor or team applications by name, reference, email, or phone to print or check status.
              </p>
            </div>
          </Link>

          <Link
            to="/registration-desk/controls"
            className="group bg-white border border-slate-200 hover:border-slate-900 rounded-2xl p-5 flex flex-col justify-between gap-4 no-underline transition-colors min-h-[156px]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <SlidersHorizontal size={20} />
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500">
                {canToggle ? <Unlock size={12} className="text-emerald-600" /> : <Lock size={12} />}
                <span>{canToggle ? "Authorized" : "View Only"}</span>
              </span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0">
                Registration Controls
              </h2>
              <p className="text-xs text-slate-500 mt-1 mb-0 leading-relaxed">
                Check open/closed status, registered squad counts, and remaining slots per game.
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* Current Registration Availability Table */}
      <section aria-label="Current Registration Availability" className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900 m-0">
            Live Registration Availability
          </h2>
          <Link
            to="/registration-desk/controls"
            className="text-xs font-semibold text-blue-700 hover:text-blue-800 no-underline whitespace-nowrap"
          >
            View Controls & Slots →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-mono uppercase tracking-wider text-slate-500">
                <th className="py-3 px-5 font-semibold">Category / Title</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Registered</th>
                <th className="py-3 px-4 font-semibold text-right">Approved</th>
                <th className="py-3 px-4 font-semibold text-right">Pending</th>
                <th className="py-3 px-5 font-semibold text-right">Available Slots</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
              {/* General Visitor Row */}
              <tr>
                <td className="py-3.5 px-5 font-semibold text-slate-900">
                  General Visitor Pass
                  <span className="block text-xs font-normal text-slate-500">
                    Walk-in Students, Faculty & General Public
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-xs">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        visitorPortalOpen ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    />
                    <span className={visitorPortalOpen ? "text-emerald-700" : "text-rose-700"}>
                      {visitorPortalOpen ? "Open" : "Closed"}
                    </span>
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                  {loading ? "—" : metrics.visitorsTotal}
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-500">
                  Instant Pass
                </td>
                <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-500">
                  0
                </td>
                <td className="py-3.5 px-5 text-right font-mono tabular-nums text-slate-700">
                  Unlimited
                </td>
              </tr>

              {/* Esports Game Rows */}
              {esportsAvailability.map((game) => {
                const closedNotice = !game.is_effectively_open
                  ? getGameClosedDisplayMessage(game)
                  : null;
                return (
                  <tr key={game.id}>
                    <td className="py-3.5 px-5 font-semibold text-slate-900">
                      {game.title}
                      {closedNotice && (
                        <span className="block text-xs font-normal text-rose-600 mt-0.5 max-w-md truncate">
                          {closedNotice}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-xs">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            game.is_effectively_open ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                        />
                        <span className={game.is_effectively_open ? "text-emerald-700" : "text-rose-700"}>
                          {game.is_effectively_open
                            ? "Open"
                            : game.status_reason === "capacity_reached"
                            ? "Full"
                            : "Closed"}
                        </span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                      {game.total_registered_teams}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                      {game.approved_teams}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-700">
                      {game.pending_teams}
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono tabular-nums text-slate-700">
                      {game.max_teams === null
                        ? "Unlimited"
                        : `${game.slots_remaining ?? 0} / ${game.max_teams}`}
                    </td>
                  </tr>
                );
              })}

              {!loading && esportsAvailability.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 px-5 text-center text-xs text-slate-500">
                    No active esports titles loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
