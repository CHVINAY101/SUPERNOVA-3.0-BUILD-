import { Link } from "react-router-dom";
import { QrCode, ShieldCheck } from "lucide-react";
import type { StaffLoginPortal } from "@/lib/registrationDesk";

interface StaffPortalSwitcherProps {
  activePortal: StaffLoginPortal;
  variant?: "neobrutal" | "slate";
}

const PORTAL_OPTIONS: ReadonlyArray<{
  id: Exclude<StaffLoginPortal, "registration_desk">;
  label: string;
  to: string;
  icon: typeof ShieldCheck;
}> = [
  { id: "admin", label: "Staff & Admin Login", to: "/admin/login", icon: ShieldCheck },
  { id: "gate", label: "Gate Staff Login", to: "/gate/login", icon: QrCode },
];

export function StaffPortalSwitcher({
  activePortal,
  variant = "neobrutal",
}: StaffPortalSwitcherProps) {
  const isSlate = variant === "slate";

  return (
    <nav aria-label="Staff Login Portals" className="mb-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PORTAL_OPTIONS.map((portal) => {
          const isActive = portal.id === activePortal;
          const IconComp = portal.icon;
          return (
            <Link
              key={portal.id}
              to={portal.to}
              aria-current={isActive ? "page" : undefined}
              className={
                isSlate
                  ? `min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 text-center leading-tight no-underline transition-colors ${
                      isActive
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  : `min-h-[44px] px-3 py-2 rounded-xl border-2 text-xs font-heading font-bold flex items-center justify-center gap-1.5 text-center leading-tight no-underline transition-all ${
                      isActive
                        ? "bg-[#191936] text-[#D5F542] border-[#191936] shadow-[2px_2px_0px_#4549D8]"
                        : "bg-[#FAF9F4] text-[#191936] border-[#191936]/25 hover:border-[#191936] hover:bg-white"
                    }`
              }
            >
              <IconComp size={14} className="shrink-0" />
              <span>{portal.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
