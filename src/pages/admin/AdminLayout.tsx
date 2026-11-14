import { useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { getRoleLabel, isDedicatedOperationsRole } from "@/lib/rbac";
import {
  LayoutDashboard,
  FileText,
  Calendar,
  Bell,
  Award,
  Image,
  HelpCircle,
  Gamepad2,
  Users,
  UserCheck,
  GraduationCap,
  HardDrive,
  ShieldAlert,
  ShieldCheck,
  Settings,
  LogOut,
  ExternalLink,
  SlidersHorizontal,
  ListPlus,
  ClipboardCheck,
  Download,
  Mail,
  Menu,
  X,
  Search,
  Trophy,
} from "lucide-react";
import { TicketVerificationModal } from "@/components/admin/TicketVerificationModal";

interface NavItem {
  to: string;
  label: string;
  icon: any;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Today",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin/checkin", label: "Entry & Check-in", icon: UserCheck },
      { to: "/admin/esports-control", label: "Esports Control", icon: Gamepad2 },
      { to: "/admin/conductor-matches", label: "Match Console", icon: Trophy },
    ],
  },
  {
    title: "Registrations & CRM",
    items: [
      { to: "/admin/crm-emails", label: "Email Centre (Gmail)", icon: Mail },
      { to: "/admin/participation-registrations", label: "Participation", icon: Users },
      { to: "/admin/esports-registrations", label: "Esports Teams", icon: Gamepad2 },
      { to: "/admin/visitor-registrations", label: "Visitors", icon: UserCheck },
      { to: "/admin/data-exports", label: "Registration Data Exports", icon: Download },
    ],
  },
  {
    title: "Website",
    items: [
      { to: "/admin/schedule", label: "Schedule", icon: Calendar },
      { to: "/admin/announcements", label: "Announcements", icon: Bell },
      { to: "/admin/content", label: "Page Text", icon: FileText },
      { to: "/admin/media", label: "Photos", icon: HardDrive },
      { to: "/admin/gallery", label: "Gallery", icon: Image },
      { to: "/admin/sponsors", label: "Sponsors", icon: Award },
      { to: "/admin/faqs", label: "FAQs", icon: HelpCircle },
      { to: "/admin/games", label: "Games", icon: Gamepad2 },
      { to: "/admin/institutions", label: "Schools", icon: GraduationCap },
    ],
  },
  {
    title: "Administration & Settings",
    items: [
      { to: "/admin/users", label: "User Management", icon: ShieldCheck },
      { to: "/admin/registration-controls", label: "Registration Controls", icon: SlidersHorizontal },
      { to: "/admin/settings", label: "Event Details", icon: Settings },
      { to: "/admin/form-options", label: "Form Options", icon: ListPlus },
      { to: "/admin/audit-logs", label: "Activity Log", icon: ShieldAlert },
      { to: "/admin/system-readiness", label: "System Readiness", icon: ClipboardCheck },
    ],
  },
];

export default function AdminLayout() {
  const { signOut, user, role, canAccessRoute, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLookupOpen, setIsLookupOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login");
  };

  const canVerifyTicket = hasPermission([
    "visitor:view",
    "participation:view",
    "esports:view",
    "entry:scan_visitor",
    "entry:scan_esports",
  ]);
  const isDedicatedOps = isDedicatedOperationsRole(role);

  const visibleSections = navSections
    .map((sec) => ({
      ...sec,
      items: sec.items.filter((item) => canAccessRoute(item.to)),
    }))
    .filter((sec) => sec.items.length > 0);

  if (isDedicatedOps) {
    const dedicatedNavItems = visibleSections.flatMap((s) => s.items).filter((i) => i.to !== "/admin");
    return (
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900 font-sans">
        <header className="bg-[#0B1120] text-white border-b border-slate-800 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="Supernova 3.0" className="w-7 h-7" />
              <div>
                <span className="font-display font-black text-sm tracking-wide block leading-none">
                  SUPERNOVA 3.0
                </span>
                <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block mt-0.5">
                  {getRoleLabel(role)} Workspace
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {dedicatedNavItems.length > 1 && (
                <nav className="flex items-center gap-1.5">
                  {dedicatedNavItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold no-underline transition-colors ${
                            isActive
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                              : "text-slate-300 hover:bg-slate-800"
                          }`
                        }
                      >
                        <Icon size={14} />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </nav>
              )}

              <span className="hidden sm:inline-block text-xs font-mono text-slate-300 truncate max-w-[200px]">
                {user?.email}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-cyan-950 border border-cyan-800 text-cyan-300">
                {getRoleLabel(role)}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
              >
                <LogOut size={13} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 bg-[#F8FAFC] text-slate-900">
          <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Mobile Top App Bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0B1120] text-white border-b border-slate-800 sticky top-0 z-40">
        <Link to="/admin" className="flex items-center gap-2.5 text-white no-underline">
          <img src="/logo.svg" alt="Supernova" className="w-6 h-6" />
          <div className="flex flex-col">
            <span className="font-display font-black text-sm tracking-wide leading-none">SUPERNOVA 3.0</span>
            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">CMS & CRM</span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {canVerifyTicket && (
            <button
              type="button"
              onClick={() => setIsLookupOpen(true)}
              className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-300 hover:text-white"
              title="Search & Verify Ticket"
            >
              <Search size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Backdrop for mobile drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 bottom-0 z-50 md:z-10 w-64 lg:w-72 flex-shrink-0 bg-[#0B1120] text-slate-300 border-r border-slate-800 flex flex-col transition-transform duration-200 ease-out md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={{ height: "100vh" }}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Link to="/admin" className="flex items-center gap-2.5 text-white no-underline">
              <img src="/logo.svg" alt="Supernova Crest" className="w-7 h-7" />
              <div>
                <span className="font-display font-black text-sm text-white tracking-wide block leading-tight">
                  SUPERNOVA 3.0
                </span>
                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block">
                  Operations & CRM
                </span>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-1 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              to="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-cyan-400 transition-colors no-underline font-medium"
            >
              <span>View Public Portal</span>
              <ExternalLink size={11} />
            </Link>

            {canVerifyTicket && (
              <button
                type="button"
                onClick={() => setIsLookupOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 text-xs font-semibold transition-all cursor-pointer shadow-xs"
              >
                <Search size={13} />
                <span>Verify Ticket / Pass</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {visibleSections.map((sec) => (
            <div key={sec.title}>
              <p className="px-3 pb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                {sec.title}
              </p>
              <div className="space-y-0.5">
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/admin"}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all no-underline ${
                          isActive
                            ? "bg-cyan-500/15 text-cyan-300 font-semibold shadow-xs"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                        }`
                      }
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Active Operator Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 overflow-hidden">
            <div className="overflow-hidden">
              <span className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Operator
              </span>
              <span className="block text-xs font-semibold text-white truncate">
                {user?.email || "admin@supernova"}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-cyan-950 border border-cyan-800 text-cyan-400 shrink-0">
              {getRoleLabel(role)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main SaaS Canvas */}
      <main className="flex-1 min-w-0 bg-[#F8FAFC] text-slate-900 overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Universal Ticket Lookup & Verification Modal */}
      <TicketVerificationModal
        isOpen={isLookupOpen}
        onClose={() => setIsLookupOpen(false)}
      />
    </div>
  );
}
