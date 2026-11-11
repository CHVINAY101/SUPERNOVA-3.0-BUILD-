import React from "react";
import { CheckCircle2, Clock, XCircle, AlertTriangle, Archive } from "lucide-react";

export type AdminStatusType =
  | "pending"
  | "confirmed"
  | "declined"
  | "rejected"
  | "correction_requested"
  | "correction"
  | "archived";

interface AdminStatusBadgeProps {
  status: string;
  isArchived?: boolean;
}

export const AdminStatusBadge: React.FC<AdminStatusBadgeProps> = ({ status, isArchived = false }) => {
  if (isArchived || status === "archived") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[11px] font-semibold">
        <Archive size={11} className="text-slate-500" />
        <span>Archived</span>
      </span>
    );
  }

  const normalized = status.toLowerCase();

  if (normalized === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[11px] font-semibold">
        <CheckCircle2 size={11} className="text-emerald-600" />
        <span>Confirmed</span>
      </span>
    );
  }

  if (normalized === "declined" || normalized === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 font-mono text-[11px] font-semibold">
        <XCircle size={11} className="text-rose-600" />
        <span>Declined</span>
      </span>
    );
  }

  if (normalized === "correction_requested" || normalized === "correction") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-mono text-[11px] font-semibold">
        <AlertTriangle size={11} className="text-amber-600" />
        <span>Correction</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-800 font-mono text-[11px] font-semibold">
      <Clock size={11} className="text-sky-600" />
      <span>Pending</span>
    </span>
  );
};
