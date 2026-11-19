import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { ArrowRight, Gamepad2, Lock, Search, UserPlus } from "lucide-react";

export default function RegistrationDeskDashboard() {
  const { hasPermission } = useAuth();
  const canCreateVisitor = hasPermission("visitor:create");
  const canCreateEsports = hasPermission("esports:create");
  const canSearch = hasPermission(["visitor:view", "esports:view", "tickets:view"]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tracking-tight m-0">
          Registration Desk
        </h1>
        <p className="text-sm text-slate-600 m-0">
          Choose a registration option below.
        </p>
      </div>

      {/* Only Two Prominent Actions */}
      <section aria-label="Registration Actions" className="grid grid-cols-1 gap-4">
        {canCreateVisitor ? (
          <Link
            to="/registration-desk/visitor"
            className="group min-h-[112px] bg-white border-2 border-slate-200 hover:border-blue-600 rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4 no-underline transition-colors"
          >
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <UserPlus size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 m-0">
                  General Visitor Registration
                </h2>
                <p className="text-sm text-slate-600 mt-1 mb-0 leading-snug">
                  Register walk-in attendees and issue a QR pass right away.
                </p>
              </div>
            </div>
            <ArrowRight
              size={20}
              className="text-slate-400 group-hover:text-blue-600 transition-colors shrink-0"
            />
          </Link>
        ) : (
          <div className="min-h-[112px] bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4 opacity-75">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                <UserPlus size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-700 m-0">
                  General Visitor Registration
                </h2>
                <p className="text-sm text-slate-500 mt-1 mb-0">
                  Visitor registration access is not enabled for your account.
                </p>
              </div>
            </div>
            <Lock size={18} className="text-slate-400 shrink-0" />
          </div>
        )}

        {canCreateEsports ? (
          <Link
            to="/registration-desk/esports"
            className="group min-h-[112px] bg-white border-2 border-slate-200 hover:border-indigo-600 rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4 no-underline transition-colors"
          >
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Gamepad2 size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 m-0">
                  Esports Registration
                </h2>
                <p className="text-sm text-slate-600 mt-1 mb-0 leading-snug">
                  Register a squad for VALORANT, BGMI, or FREE FIRE.
                </p>
              </div>
            </div>
            <ArrowRight
              size={20}
              className="text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0"
            />
          </Link>
        ) : (
          <div className="min-h-[112px] bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4 opacity-75">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                <Gamepad2 size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-700 m-0">
                  Esports Registration
                </h2>
                <p className="text-sm text-slate-500 mt-1 mb-0">
                  Esports registration access is not enabled for your account.
                </p>
              </div>
            </div>
            <Lock size={18} className="text-slate-400 shrink-0" />
          </div>
        )}
      </section>

      {/* Small Secondary Search Action */}
      {canSearch && (
        <div className="pt-2 flex justify-center sm:justify-start">
          <Link
            to="/registration-desk/search"
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 no-underline transition-colors"
          >
            <Search size={16} className="text-slate-500" />
            <span>Search existing registrations</span>
          </Link>
        </div>
      )}
    </div>
  );
}
