import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { getRoleLabel, normalizeRole } from "@/lib/rbac";
import {
  ClipboardList,
  Gamepad2,
  LayoutGrid,
  LogOut,
  Search,
  Shield,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";

const DESK_NAV_ITEMS = [
  { to: "/registration-desk", label: "Dashboard", end: true, icon: LayoutGrid },
  { to: "/registration-desk/visitor", label: "Visitor Pass", end: false, icon: UserPlus },
  { to: "/registration-desk/esports", label: "Esports", end: false, icon: Gamepad2 },
  { to: "/registration-desk/search", label: "Search", end: false, icon: Search },
  { to: "/registration-desk/controls", label: "Controls", end: false, icon: SlidersHorizontal },
] as const;

export default function RegistrationDeskLayout() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const canonicalRole = normalizeRole(role);
  const canOpenFullCrm = canonicalRole === "super_admin" || canonicalRole === "crm_admin";

  const handleSignOut = async () => {
    await signOut();
    navigate("/registration-desk/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Standalone Top Bar (Zero Admin CRM Sidebar) */}
      <header className="sticky top-0 z-30 bg-[#0F172A] text-white border-b border-slate-800 print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Single-line Desk Wordmark */}
          <Link
            to="/registration-desk"
            className="inline-flex items-center gap-2.5 text-white no-underline whitespace-nowrap shrink-0"
          >
            <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <ClipboardList size={17} />
            </span>
            <span className="font-display text-sm sm:text-base font-bold tracking-tight whitespace-nowrap">
              Supernova Desk
            </span>
          </Link>

          {/* Zone 2: Concise Single-Line Navigation Links (Desktop) */}
          <nav
            aria-label="Registration Desk Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {DESK_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 no-underline ${
                    isActive
                      ? "text-white border-blue-400 font-semibold"
                      : "text-slate-300 border-transparent hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Zone 3: Account Action */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden lg:inline text-xs font-mono text-slate-300 truncate max-w-[180px]">
              {user?.email || "Volunteer"} · {getRoleLabel(role)}
            </span>

            {canOpenFullCrm && (
              <Link
                to="/admin"
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-white no-underline whitespace-nowrap shrink-0 transition-colors"
              >
                <Shield size={13} className="text-sky-400" />
                <span className="hidden sm:inline">Admin CRM</span>
              </Link>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              <LogOut size={13} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Mobile/Tablet Touch Nav Bar */}
        <nav
          aria-label="Registration Desk Mobile Navigation"
          className="md:hidden border-t border-slate-800 bg-slate-900/95 px-3 py-2 flex items-center gap-1.5 overflow-x-auto"
        >
          {DESK_NAV_ITEMS.map((item) => {
            const IconComp = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 no-underline transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white font-semibold"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`
                }
              >
                <IconComp size={13} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-4 sm:px-6 text-center text-xs text-slate-500 print:hidden">
        Supernova 3.0 · 20–21 November 2026 · The National College, Basavanagudi
      </footer>
    </div>
  );
}
