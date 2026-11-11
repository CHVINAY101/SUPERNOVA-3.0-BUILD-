import { useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { AdminRole } from "@/types/database";
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
  Settings, 
  LogOut,
  ExternalLink,
  SlidersHorizontal,
  ListPlus,
  ClipboardCheck,
  Download,
  Menu,
  X
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: any;
  allowedRoles?: AdminRole[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Today",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/checkin", label: "Check-in Desk", icon: UserCheck, allowedRoles: ["super_admin", "event_admin", "checkin_staff", "score_operator"] },
      { to: "/admin/esports-control", label: "Esports Control", icon: Gamepad2, allowedRoles: ["super_admin", "event_admin", "score_operator"] },
    ],
  },
  {
    title: "Registrations",
    items: [
      { to: "/admin/registration-controls", label: "Registration Controls", icon: SlidersHorizontal, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/participation-registrations", label: "Participation", icon: Users, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/esports-registrations", label: "Esports Teams", icon: Gamepad2, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/visitor-registrations", label: "Visitors", icon: UserCheck, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/data-exports", label: "Registration Data Exports", icon: Download, allowedRoles: ["super_admin", "event_admin"] },
    ],
  },
  {
    title: "Website",
    items: [
      { to: "/admin/schedule", label: "Schedule", icon: Calendar, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/announcements", label: "Announcements", icon: Bell, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/content", label: "Page Text", icon: FileText, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/media", label: "Photos", icon: HardDrive, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/gallery", label: "Gallery", icon: Image, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/sponsors", label: "Sponsors", icon: Award, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/faqs", label: "FAQs", icon: HelpCircle, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/games", label: "Games", icon: Gamepad2, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/institutions", label: "Schools", icon: GraduationCap, allowedRoles: ["super_admin", "event_admin"] },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: "/admin/settings", label: "Event Details", icon: Settings, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/form-options", label: "Form Options", icon: ListPlus, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/audit-logs", label: "Activity Log", icon: ShieldAlert, allowedRoles: ["super_admin", "event_admin"] },
      { to: "/admin/system-readiness", label: "System Readiness", icon: ClipboardCheck, allowedRoles: ["super_admin", "event_admin"] },
    ],
  },
];

export default function AdminLayout() {
  const { signOut, user, role } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login");
  };

  const currentRole: AdminRole = role || "super_admin";

  const visibleSections = navSections
    .map((sec) => ({
      ...sec,
      items: sec.items.filter((item) => !item.allowedRoles || item.allowedRoles.includes(currentRole)),
    }))
    .filter((sec) => sec.items.length > 0);

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
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
          aria-label="Toggle navigation"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Backdrop for mobile drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: Deep Navy, Professional SaaS Structure */}
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
          <div>
            <Link
              to="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-cyan-400 transition-colors no-underline font-medium"
            >
              <span>View Public Portal</span>
              <ExternalLink size={11} />
            </Link>
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
              {role || "admin"}
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

      {/* Main SaaS Canvas: White/Off-White Background with Deep Navy Typography */}
      <main className="flex-1 min-w-0 bg-[#F8FAFC] text-slate-900 overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
