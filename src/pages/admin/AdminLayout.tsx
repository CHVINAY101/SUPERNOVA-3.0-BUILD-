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
  Download
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
    <div className="admin-layout" style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        className="admin-sidebar"
        style={{
          width: 270,
          flexShrink: 0,
          background: "var(--navy-900)",
          borderRight: "1px solid var(--border-subtle)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link to="/admin" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <img src="/logo.svg" alt="Supernova Crest" style={{ width: 28, height: 28 }} />
              <div>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)", letterSpacing: "0.02em" }}>
                  SUPERNOVA 3.0
                </span>
                <span style={{ display: "block", fontSize: "0.7rem", color: "var(--cyan-400)", fontWeight: 700, textTransform: "uppercase" }}>
                  CMS & Operations
                </span>
              </div>
            </Link>
          </div>
          <div style={{ marginTop: 12 }}>
            <Link to="/" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.76rem", color: "var(--text-muted)", textDecoration: "none" }}>
              <span>View Live Public Portal</span> <ExternalLink size={12} />
            </Link>
          </div>
        </div>

        <nav className="admin-nav" style={{ flex: 1, overflowY: "auto", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 18 }}>
          {visibleSections.map((sec) => (
            <div key={sec.title}>
              <p style={{ fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-faint)", padding: "0 14px 6px" }}>
                {sec.title}
              </p>
              <div style={{ display: "grid", gap: 2 }}>
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      style={({ isActive }) => ({
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 14px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        color: isActive ? "var(--cyan-400)" : "var(--text-muted)",
                        background: isActive ? "rgba(34,211,238,0.1)" : "transparent",
                        textDecoration: "none",
                        transition: "all var(--transition-fast)",
                      })}
                    >
                      <Icon size={16} />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border-subtle)", background: "rgba(0,0,0,0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ overflow: "hidden" }}>
              <p style={{ fontSize: "0.74rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Active Operator
              </p>
              <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.email || "admin@supernova"}
              </p>
              <span style={{ display: "inline-block", fontSize: "0.7rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(34,211,238,0.15)", color: "var(--cyan-400)", marginTop: 2 }}>
                {role || "super_admin"}
              </span>
            </div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={handleSignOut}
            style={{ width: "100%", justifyContent: "center", fontSize: "0.82rem", padding: "6px 10px" }}
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: "auto", padding: "32px 40px" }}>
        <Outlet />
      </main>
    </div>
  );
}
