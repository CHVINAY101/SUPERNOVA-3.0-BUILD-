import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { normalizeRole } from "@/lib/rbac";
import { canViewRegistrationControlsSettingsMenu } from "@/lib/registrationDesk";
import {
  ArrowLeft,
  ClipboardList,
  LogOut,
  Settings,
  Shield,
  SlidersHorizontal,
} from "lucide-react";

export default function RegistrationDeskLayout() {
  const { role, accountStatus, permissions, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const canonicalRole = normalizeRole(role);
  const canOpenFullCrm = canonicalRole === "super_admin" || canonicalRole === "crm_admin";
  const canSeeSettings = canViewRegistrationControlsSettingsMenu(role, accountStatus, permissions);
  const isSubpage = location.pathname.replace(/\/+$/, "") !== "/registration-desk";

  useEffect(() => {
    setSettingsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsOpen]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/registration-desk/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Compact Single-Row Top Bar (<56px height, zero second mobile nav row) */}
      <header className="sticky top-0 z-30 bg-[#0F172A] text-white border-b border-slate-800 print:hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Left: Back link on subpages, Brand mark on dashboard */}
          {isSubpage ? (
            <Link
              to="/registration-desk"
              className="min-h-[44px] inline-flex items-center gap-2 text-white hover:text-slate-200 no-underline text-sm font-semibold whitespace-nowrap shrink-0"
            >
              <ArrowLeft size={16} />
              <span>Registration Desk</span>
            </Link>
          ) : (
            <Link
              to="/registration-desk"
              className="min-h-[44px] inline-flex items-center gap-2 text-white no-underline whitespace-nowrap shrink-0"
            >
              <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <ClipboardList size={16} />
              </span>
              <span className="font-display text-base font-bold tracking-tight">
                Supernova Desk
              </span>
            </Link>
          )}

          {/* Right: Settings Menu (authorized staff only) + Sign Out */}
          <div className="flex items-center gap-2 shrink-0">
            {canSeeSettings && (
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={settingsOpen}
                  aria-label="Desk Settings"
                  onClick={() => setSettingsOpen((prev) => !prev)}
                  className="min-h-[44px] px-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                >
                  <Settings size={15} />
                  <span>Settings</span>
                </button>

                {settingsOpen && (
                  <div
                    role="menu"
                    aria-label="Registration Controls Menu"
                    className="absolute right-0 mt-2 w-60 rounded-xl bg-white text-slate-900 border border-slate-200 shadow-xl py-1.5 z-50"
                  >
                    <Link
                      to="/registration-desk/controls"
                      role="menuitem"
                      onClick={() => setSettingsOpen(false)}
                      className="min-h-[44px] px-4 py-2.5 flex items-center gap-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 no-underline"
                    >
                      <SlidersHorizontal size={16} className="text-blue-600 shrink-0" />
                      <span>Registration Controls</span>
                    </Link>

                    {canOpenFullCrm && (
                      <Link
                        to="/admin"
                        role="menuitem"
                        onClick={() => setSettingsOpen(false)}
                        className="min-h-[44px] px-4 py-2.5 flex items-center gap-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 no-underline border-t border-slate-100"
                      >
                        <Shield size={16} className="text-slate-500 shrink-0" />
                        <span>Open Admin CRM</span>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}

            {!canSeeSettings && canOpenFullCrm && (
              <Link
                to="/admin"
                className="min-h-[44px] px-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white no-underline whitespace-nowrap"
              >
                <Shield size={14} />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              className="min-h-[44px] px-3 inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-4 sm:px-6 text-center text-xs text-slate-500 print:hidden">
        Supernova 3.0 · The National College, Basavanagudi
      </footer>
    </div>
  );
}
