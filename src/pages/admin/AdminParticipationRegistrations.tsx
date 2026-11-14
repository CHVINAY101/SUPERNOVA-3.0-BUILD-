import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import type { ParticipationRegistration, RegistrationStatus, TicketRecord } from "@/types/database";
import {
  archiveRegistrationRecord,
  restoreRegistrationRecord,
  isRegistrationArchived,
  markRegistrationArchivedLocal,
  sendRegistrationConfirmationEmail,
  getLocalLinkedTickets,
} from "@/lib/registrationOperations";
import { useAuth } from "@/lib/auth";
import { AdminArchiveConfirmModal } from "@/components/admin/AdminArchiveConfirmModal";
import { AdminStatusBadge } from "@/components/admin/AdminBadge";
import { generateTicketPdf, downloadTicketPdfFile } from "@/lib/ticketPdfService";
import { archiveTicketToNas, getLocalNasArchives } from "@/lib/nasArchivalService";
import { fetchTicketByRegistration, issueTicketForRegistration } from "@/lib/ticketClient";
import { 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  X, 
  Edit3, 
  Save,
  RotateCcw,
  Trash2,
  RefreshCw,
  Eye,
  Mail
} from "lucide-react";

export interface AdminParticipationItem extends ParticipationRegistration {
  email_status?: string | null;
  visitor_ticket_ref?: string | null;
}

export default function AdminParticipationRegistrations() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("participation:edit");
  const canApprove = hasPermission("participation:approve");
  const canReject = hasPermission("participation:reject");
  const canExport = hasPermission("participation:export");
  const canResend = hasPermission("email_centre:resend");

  const [registrations, setRegistrations] = useState<AdminParticipationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [viewScope, setViewScope] = useState<"active" | "archived" | "all">("active");

  // Selected registration for Drawer
  const [selectedReg, setSelectedReg] = useState<AdminParticipationItem | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null);
  const [editNote, setEditNote] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Safe Archive Modal state
  const [archiveTarget, setArchiveTarget] = useState<ParticipationRegistration | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  useEffect(() => {
    if (!selectedReg) {
      setSelectedTicket(null);
      return;
    }
    let active = true;
    fetchTicketByRegistration("participation", selectedReg.id).then((tkt) => {
      if (active) setSelectedTicket(tkt);
    });
    return () => {
      active = false;
    };
  }, [selectedReg]);

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("participation_registrations")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch participation registrations:", error);
      } else {
        setRegistrations((data as unknown as ParticipationRegistration[]) || []);
      }
    } catch (err) {
      console.error("Error loading participation:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [{ table: "participation_registrations", onRefresh: fetchRegistrations }],
    "admin-participation"
  );

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  const updateStatus = async (id: string, newStatus: RegistrationStatus) => {
    setIsUpdating(true);
    setStatusMsg(null);
    try {
      const { error } = await supabase
        .from("participation_registrations")
        .update({ status: newStatus, admin_notes: editNote })
        .eq("id", id);

      if (error) throw error;

      let ticketNotice = "";
      let nextEmailStatus: string | undefined;
      if (newStatus === "confirmed") {
        const currentItem = registrations.find((r) => r.id === id) || selectedReg;
        const issuedRes = await issueTicketForRegistration("participation", id);
        const issuedTicket = issuedRes.ok ? issuedRes.ticket : null;
        if (issuedTicket) {
          setSelectedTicket(issuedTicket);
        }

        const ticketRef =
          issuedTicket?.ticket_ref ||
          (currentItem as any)?.visitor_ticket_ref ||
          getLocalLinkedTickets()[currentItem?.registration_ref || ""] ||
          currentItem?.registration_ref ||
          "SN3-26-REG";

        let pdfAttachments: { filename: string; base64Content: string; contentType: string }[] | undefined;

        if (currentItem) {
          try {
            const ticketRes = await generateTicketPdf({
              ticketRef,
              qrToken: issuedTicket?.qr_token,
              recipientName: currentItem.full_name,
              category: "Project Participant",
              email: currentItem.email,
              phone: currentItem.phone,
              institution: currentItem.institution || undefined,
              registrationType: "participation",
              applicationRef: currentItem.registration_ref,
              projectTitle: currentItem.project_title || undefined,
            });
            pdfAttachments = [
              {
                filename: ticketRes.fileName,
                base64Content: ticketRes.pdfBase64,
                contentType: "application/pdf",
              },
            ];

            await archiveTicketToNas(
              ticketRes,
              {
                ticketRef,
                qrToken: issuedTicket?.qr_token,
                recipientName: currentItem.full_name,
                category: "Project Participant",
                email: currentItem.email,
                phone: currentItem.phone,
                institution: currentItem.institution || undefined,
                registrationType: "participation",
                applicationRef: currentItem.registration_ref,
                projectTitle: currentItem.project_title || undefined,
              },
              currentItem.id
            );
          } catch (nasErr) {
            console.warn("Participation NAS archival notice:", nasErr);
          }
        }

        ticketNotice = ` · Official ticket issued (${ticketRef})`;

        // Best-effort email copy; ticket issuance never depends on email
        try {
          const emailRes = await sendRegistrationConfirmationEmail(id, "participation", false, {
            recipientEmail: currentItem?.email,
            recipientName: currentItem?.full_name,
            registrationRef: currentItem?.registration_ref,
            institution: currentItem?.institution || undefined,
            attachments: pdfAttachments,
          });
          const emailOk = Boolean(emailRes.ok && !emailRes.simulated);
          nextEmailStatus = emailOk ? "sent" : "failed";
          if (emailOk) {
            ticketNotice += " & emailed to participant.";
          }
        } catch {
          nextEmailStatus = "failed";
        }
      }

      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: newStatus,
                admin_notes: editNote,
                ...(nextEmailStatus ? { email_status: nextEmailStatus } : {}),
              }
            : r
        )
      );
      if (selectedReg && selectedReg.id === id) {
        setSelectedReg({
          ...selectedReg,
          status: newStatus,
          admin_notes: editNote,
          ...(nextEmailStatus ? { email_status: nextEmailStatus } : {}),
        });
      }

      setStatusMsg({
        type: "success",
        text: `Registration status updated to ${newStatus.replace("_", " ")}${ticketNotice}`,
      });
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Failed to update status: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResendEmail = async (reg: ParticipationRegistration) => {
    if (!canResend || isUpdating) return;
    setIsUpdating(true);
    setStatusMsg(null);
    try {
      const ticketRef =
        (reg as any)?.visitor_ticket_ref ||
        getLocalLinkedTickets()[reg.registration_ref] ||
        `${reg.registration_ref}-VIS`;

      let pdfAttachments: { filename: string; base64Content: string; contentType: string }[] | undefined;
      try {
        const ticketRes = await generateTicketPdf({
          ticketRef,
          recipientName: reg.full_name,
          category: "Project Participant",
          email: reg.email,
          phone: reg.phone,
          institution: reg.institution || undefined,
          registrationType: "participation",
          applicationRef: reg.registration_ref,
          projectTitle: reg.project_title || undefined,
        });
        pdfAttachments = [
          {
            filename: ticketRes.fileName,
            base64Content: ticketRes.pdfBase64,
            contentType: "application/pdf",
          },
        ];
      } catch {
        // continue
      }

      const emailRes = await sendRegistrationConfirmationEmail(reg.id, "participation", true, {
        recipientEmail: reg.email,
        recipientName: reg.full_name,
        registrationRef: reg.registration_ref,
        institution: reg.institution || undefined,
        attachments: pdfAttachments,
      });
      if (emailRes.ok && !emailRes.simulated) {
        setStatusMsg({
          type: "success",
          text: `Confirmation email re-sent successfully to ${reg.email} (Ticket: ${ticketRef}).`,
        });
        setRegistrations((prev) =>
          prev.map((r) => (r.id === reg.id ? { ...r, email_status: "sent" } : r))
        );
        if (selectedReg && selectedReg.id === reg.id) {
          setSelectedReg({ ...selectedReg, email_status: "sent" });
        }
      } else {
        const nextStatus = (reg as any).email_status === "sent" ? "sent" : "failed";
        setRegistrations((prev) =>
          prev.map((r) => (r.id === reg.id ? { ...r, email_status: nextStatus } : r))
        );
        if (selectedReg && selectedReg.id === reg.id) {
          setSelectedReg({ ...selectedReg, email_status: nextStatus });
        }
        const statusSuffix = emailRes.httpStatusCode ? ` [HTTP ${emailRes.httpStatusCode}${emailRes.errorType ? ` · ${emailRes.errorType}` : ""}]` : "";
        throw new Error(`${emailRes.error || "Email delivery failed"}${statusSuffix}`);
      }
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Failed to resend confirmation email: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Safe Archive Handler
  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      const res = await archiveRegistrationRecord("participation", archiveTarget.id);
      if (!res.ok) throw new Error(res.error);

      const now = new Date().toISOString();
      markRegistrationArchivedLocal(archiveTarget.id, true);
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === archiveTarget.id
            ? ({
                ...r,
                archived_at: now,
                admin_notes: (r as any).admin_notes
                  ? `${(r as any).admin_notes}\n[ARCHIVED ${now}]`
                  : `[ARCHIVED ${now}]`,
              } as any)
            : r
        )
      );
      if (selectedReg && selectedReg.id === archiveTarget.id) {
        setSelectedReg({
          ...selectedReg,
          archived_at: now,
          admin_notes: (selectedReg as any).admin_notes
            ? `${(selectedReg as any).admin_notes}\n[ARCHIVED ${now}]`
            : `[ARCHIVED ${now}]`,
        } as any);
      }

      setStatusMsg({
        type: "success",
        text: `Project "${archiveTarget.project_title || archiveTarget.full_name}" was archived.`,
      });
      setArchiveTarget(null);
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Archive error: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsArchiving(false);
    }
  };

  // Safe Restore Handler
  const handleRestore = async (item: ParticipationRegistration) => {
    setIsUpdating(true);
    try {
      const res = await restoreRegistrationRecord("participation", item.id);
      if (!res.ok) throw new Error(res.error);

      markRegistrationArchivedLocal(item.id, false);
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === item.id
            ? ({
                ...r,
                archived_at: null,
                admin_notes: (r as any).admin_notes?.replace(/\[ARCHIVED.*?\]/g, "").trim() || null,
              } as any)
            : r
        )
      );
      if (selectedReg && selectedReg.id === item.id) {
        setSelectedReg({
          ...selectedReg,
          archived_at: null,
          admin_notes: (selectedReg as any).admin_notes?.replace(/\[ARCHIVED.*?\]/g, "").trim() || null,
        } as any);
      }

      setStatusMsg({
        type: "success",
        text: `Project "${item.project_title || item.full_name}" restored to active submissions.`,
      });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Restore error: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredRegistrations = useMemo(() => {
    return registrations.filter((reg) => {
      const isArchived = isRegistrationArchived(reg as any);

      // 1. View Scope
      if (viewScope === "active" && isArchived) return false;
      if (viewScope === "archived" && !isArchived) return false;

      // 2. Status
      const matchesStatus = statusFilter === "all" || reg.status === statusFilter;

      // 3. Area
      const matchesArea = areaFilter === "all" || reg.participation_area?.toLowerCase() === areaFilter.toLowerCase();

      // 4. Search
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesStatus && matchesArea;

      const name = reg.full_name?.toLowerCase() || "";
      const proj = reg.project_title?.toLowerCase() || "";
      const inst = reg.institution?.toLowerCase() || "";
      const ref = reg.registration_ref?.toLowerCase() || "";
      const mail = reg.email?.toLowerCase() || "";

      const matchesSearch =
        ref.includes(q) ||
        name.includes(q) ||
        proj.includes(q) ||
        inst.includes(q) ||
        mail.includes(q);

      return matchesStatus && matchesArea && matchesSearch;
    });
  }, [registrations, viewScope, statusFilter, areaFilter, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let activeTotal = 0;
    let confirmed = 0;
    let pending = 0;
    let archived = 0;

    registrations.forEach((r: any) => {
      if (isRegistrationArchived(r)) {
        archived++;
      } else {
        activeTotal++;
        if (r.status === "confirmed") confirmed++;
        if (r.status === "pending") pending++;
      }
    });

    return { activeTotal, confirmed, pending, archived };
  }, [registrations]);

  const handleExportCSV = () => {
    const sanitizeCsv = (val: string | number | null | undefined): string => {
      const str = String(val ?? "");
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const headers = ["Ref ID", "Lead Participant", "Email", "Phone", "Institution", "Zone", "Project Title", "Team Size", "Status", "Archived", "Submission Date"];
    const rows = filteredRegistrations.map((r: any) => [
      sanitizeCsv(r.registration_ref),
      sanitizeCsv(r.full_name),
      sanitizeCsv(r.email),
      sanitizeCsv(r.phone),
      sanitizeCsv(r.institution || "Independent"),
      sanitizeCsv(r.participation_area),
      sanitizeCsv(r.project_title || "Untitled"),
      sanitizeCsv(r.team_members_count),
      sanitizeCsv(r.status),
      sanitizeCsv(isRegistrationArchived(r) ? "YES" : "NO"),
      sanitizeCsv(r.submitted_at),
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `supernova_participation_registrations_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Exhibitions & Science Expo
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            Participation & Project Registrations
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Review submissions, assign exhibition stalls, inspect equipment specifications, and manage approvals.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />
          <button
            type="button"
            onClick={fetchRegistrations}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Sync</span>
          </button>
          {canExport && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-slate-500 font-semibold">Active Projects</p>
          <p className="text-2xl font-display font-extrabold text-slate-900 mt-1">{metrics.activeTotal}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-emerald-700 font-semibold">Confirmed Projects</p>
          <p className="text-2xl font-display font-extrabold text-emerald-700 mt-1">{metrics.confirmed}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-amber-700 font-semibold">Pending Review</p>
          <p className="text-2xl font-display font-extrabold text-amber-600 mt-1">{metrics.pending}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-slate-500 font-semibold">Archived Projects</p>
          <p className="text-2xl font-display font-extrabold text-slate-600 mt-1">{metrics.archived}</p>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between border shadow-2xs ${
            statusMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMsg(null)} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewScope("active")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewScope === "active" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Active Entries ({metrics.activeTotal})
            </button>
            <button
              type="button"
              onClick={() => setViewScope("archived")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewScope === "archived" ? "bg-white text-rose-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Archived ({metrics.archived})
            </button>
            <button
              type="button"
              onClick={() => setViewScope("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewScope === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Entries
            </button>
          </div>

          <span className="text-xs text-slate-500 font-mono">
            Showing <strong className="text-slate-900">{filteredRegistrations.length}</strong> matching entries
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference, participant, project, institution..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 transition-colors"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="declined">Declined</option>
            <option value="correction_requested">Correction Requested</option>
          </select>

          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Exhibition Zones</option>
            <option value="Science Expo">Science Expo</option>
            <option value="School Kids' Exhibition">School Kids' Exhibition</option>
            <option value="Department of Animation Showcase">Animation Showcase</option>
          </select>
        </div>
      </div>

      {/* Main SaaS Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-mono tracking-wider text-[11px]">
                <th className="py-3 px-4 font-semibold">Reference</th>
                <th className="py-3 px-4 font-semibold">Lead Participant</th>
                <th className="py-3 px-4 font-semibold">Project Title</th>
                <th className="py-3 px-4 font-semibold">Exhibition Zone</th>
                <th className="py-3 px-4 font-semibold">Team Size</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Submitted</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-mono">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading participation records...
                  </td>
                </tr>
              ) : filteredRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="font-semibold text-slate-800">No participation records match your filters.</p>
                  </td>
                </tr>
              ) : (
                filteredRegistrations.map((reg: any) => {
                  const isArchived = isRegistrationArchived(reg);
                  return (
                    <tr
                      key={reg.id}
                      onClick={() => {
                        setSelectedReg(reg);
                        setEditNote(reg.admin_notes || "");
                      }}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                        <div>{reg.registration_ref}</div>
                        {((reg as any).visitor_ticket_ref || getLocalLinkedTickets()[reg.registration_ref]) && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Pass: {(reg as any).visitor_ticket_ref || getLocalLinkedTickets()[reg.registration_ref]}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 block group-hover:text-blue-700 transition-colors">
                          {reg.full_name}
                        </span>
                        <span className="text-[11px] text-slate-500 block truncate max-w-[190px]">
                          {reg.institution || "Independent"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800 block truncate max-w-[220px]">
                          {reg.project_title || "Untitled Project"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                          {reg.participation_area}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {reg.team_members_count} members
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                          <AdminStatusBadge status={reg.status} isArchived={isArchived} />
                          {reg.status === "confirmed" && (
                            <div>
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                  (reg as any).email_status === "sent"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : (reg as any).email_status === "failed"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}
                              >
                                <Mail size={10} />
                                <span>{(reg as any).email_status || "not_sent"}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(reg.submitted_at).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReg(reg);
                              setEditNote(reg.admin_notes || "");
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                          >
                            <Eye size={12} />
                            <span>View</span>
                          </button>

                          {reg.status === "confirmed" && canResend && (
                            <button
                              type="button"
                              onClick={() => handleResendEmail(reg)}
                              disabled={isUpdating}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                              title="Resend confirmation email with visitor pass"
                            >
                              <Mail size={13} />
                            </button>
                          )}

                          {canEdit && (
                            isArchived ? (
                              <button
                                type="button"
                                onClick={() => handleRestore(reg)}
                                disabled={isUpdating}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors cursor-pointer"
                                title="Restore to active entries"
                              >
                                <RotateCcw size={12} />
                                <span>Restore</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setArchiveTarget(reg)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Archive entry"
                              >
                                <Trash2 size={13} />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Slide-Over Drawer */}
      {selectedReg && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-fadeIn"
          onClick={() => setSelectedReg(null)}
        >
          <div
            className="w-full max-w-xl bg-white border-l border-slate-200 h-full overflow-y-auto p-6 sm:p-8 flex flex-col justify-between shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded">
                      {selectedReg.registration_ref}
                    </span>
                    <AdminStatusBadge status={selectedReg.status} isArchived={isRegistrationArchived(selectedReg as any)} />
                  </div>
                  <h2 className="text-xl font-display font-black text-slate-900 tracking-tight m-0">
                    {selectedReg.project_title || "Untitled Exhibit"}
                  </h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Lead: {selectedReg.full_name} · {selectedReg.team_members_count} team members
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedReg(null)}
                  className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Status Actions */}
              {(canApprove || canEdit || canReject) && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                    Update Status & Approval
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {canApprove && (
                      <button
                        type="button"
                        disabled={isUpdating || selectedReg.status === "confirmed"}
                        onClick={() => updateStatus(selectedReg.id, "confirmed")}
                        className="py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Confirm & Send
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        disabled={isUpdating || selectedReg.status === "correction_requested"}
                        onClick={() => updateStatus(selectedReg.id, "correction_requested")}
                        className="py-2 px-3 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Correction
                      </button>
                    )}
                    {canReject && (
                      <button
                        type="button"
                        disabled={isUpdating || selectedReg.status === "declined"}
                        onClick={() => updateStatus(selectedReg.id, "declined")}
                        className="py-2 px-3 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Decline
                      </button>
                    )}
                    {canEdit && (
                      isRegistrationArchived(selectedReg as any) ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleRestore(selectedReg)}
                          className="py-2 px-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setArchiveTarget(selectedReg)}
                          className="py-2 px-3 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          Archive
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Linked Visitor Pass, NAS Archive & Email Status */}
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-blue-900">
                    Ticketing & NAS Archival
                  </span>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white text-blue-700 border border-blue-200">
                    Auto-Linked Visitor
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-600">Official Ticket Ref:</span>
                  <strong className="font-mono text-xs text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-200">
                    {selectedReg.status === "confirmed" && !isRegistrationArchived(selectedReg as any)
                      ? selectedTicket?.ticket_ref ||
                        (selectedReg as any).visitor_ticket_ref ||
                        selectedReg.registration_ref
                      : "Pending Approval — Not Issued"}
                  </strong>
                </div>
                {selectedTicket?.checked_in_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Gate Check-In:</span>
                    <span className="font-mono text-[11px] font-bold text-emerald-700">
                      Checked in {new Date(selectedTicket.checked_in_at).toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Email Status:</span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {(selectedReg as any).email_status || (selectedReg.status === "confirmed" ? "not sent" : "pending approval")}
                  </span>
                </div>

                {/* NAS Archive Status */}
                {(() => {
                  const tRef =
                    selectedTicket?.ticket_ref ||
                    (selectedReg as any).visitor_ticket_ref ||
                    selectedReg.registration_ref;
                  const nasRecord = getLocalNasArchives().find((a) => a.ticketRef === tRef);
                  return (
                    <div className="pt-2 border-t border-blue-200/60 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">NAS Backup:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          nasRecord?.status === "completed" 
                            ? "bg-emerald-100 text-emerald-800" 
                            : nasRecord?.status === "failed"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {nasRecord?.status || (selectedReg.status === "confirmed" ? "completed" : "pending approval")}
                        </span>
                      </div>
                      {nasRecord && (
                        <div className="text-[10px] font-mono text-slate-500 truncate" title={nasRecord.nasRelativePath}>
                          Path: {nasRecord.nasRelativePath}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedReg.status === "confirmed" && !isRegistrationArchived(selectedReg as any) ? (
                    <button
                      type="button"
                      onClick={async () => {
                        let tkt = selectedTicket;
                        if (!tkt) {
                          const issued = await issueTicketForRegistration("participation", selectedReg.id);
                          if (issued.ok && issued.ticket) {
                            tkt = issued.ticket;
                            setSelectedTicket(tkt);
                          }
                        }
                        const tRef =
                          tkt?.ticket_ref ||
                          (selectedReg as any).visitor_ticket_ref ||
                          selectedReg.registration_ref;
                        await downloadTicketPdfFile({
                          ticketRef: tRef,
                          qrToken: tkt?.qr_token,
                          recipientName: selectedReg.full_name,
                          category: "Project Participant",
                          email: selectedReg.email,
                          phone: selectedReg.phone,
                          institution: selectedReg.institution || undefined,
                          registrationType: "participation",
                          applicationRef: selectedReg.registration_ref,
                          projectTitle: selectedReg.project_title || undefined,
                        });
                      }}
                      className="py-2 px-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download size={13} />
                      <span>Download Ticket PDF</span>
                    </button>
                  ) : (
                    <div className="py-2 px-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-mono font-semibold text-center">
                      Approve to Issue Ticket
                    </div>
                  )}

                  {canResend && selectedReg.status === "confirmed" && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleResendEmail(selectedReg)}
                      className="py-2 px-3 rounded-lg bg-white hover:bg-blue-50 border border-blue-300 text-blue-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Mail size={13} />
                      <span>Resend Email</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Participant Details */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5 text-xs">
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Lead Participant Details
                </h3>
                <div className="flex justify-between">
                  <span className="text-slate-500">Lead Name:</span>
                  <strong className="text-slate-900">{selectedReg.full_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <a href={`mailto:${selectedReg.email}`} className="text-blue-700 font-mono hover:underline">
                    {selectedReg.email}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <a href={`tel:${selectedReg.phone}`} className="text-blue-700 font-mono hover:underline">
                    {selectedReg.phone}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Institution:</span>
                  <span className="font-medium text-slate-900">{selectedReg.institution || "Independent"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Participant Category:</span>
                  <span className="font-medium text-slate-900">{selectedReg.participant_category}</span>
                </div>
              </div>

              {/* Exhibit & Zone Details */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5 text-xs">
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Exhibit & Requirements
                </h3>
                <div className="flex justify-between">
                  <span className="text-slate-500">Zone:</span>
                  <strong className="text-blue-700 font-semibold">{selectedReg.participation_area}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Project Title:</span>
                  <strong className="text-slate-900">{selectedReg.project_title || "Untitled"}</strong>
                </div>
                {selectedReg.project_description && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-500 block mb-1">Description & Requirements:</span>
                    <p className="p-3 rounded-lg bg-white border border-slate-200 text-slate-700 leading-relaxed">
                      {selectedReg.project_description}
                    </p>
                  </div>
                )}
              </div>

              {/* Admin Notes & Stall Allocation */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Edit3 size={13} /> Admin Notes & Stall Allocation
                </h3>
                <textarea
                  rows={3}
                  value={editNote}
                  readOnly={!canEdit}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="e.g. Stall B-14 allocated, 230V AC socket verified..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-hidden focus:border-blue-500"
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => updateStatus(selectedReg.id, selectedReg.status)}
                    disabled={isUpdating}
                    className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Save size={13} />
                    <span>Save Notes & Allocation</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedReg(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Archive Modal */}
      {archiveTarget && (
        <AdminArchiveConfirmModal
          isOpen={true}
          onClose={() => setArchiveTarget(null)}
          onConfirm={handleConfirmArchive}
          isProcessing={isArchiving}
          registrationRef={archiveTarget.registration_ref}
          name={archiveTarget.project_title || archiveTarget.full_name}
          category={`Participation Exhibit (${archiveTarget.participation_area})`}
        />
      )}
    </div>
  );
}
