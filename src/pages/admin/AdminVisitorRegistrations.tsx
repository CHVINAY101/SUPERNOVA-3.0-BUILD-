import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  sendRegistrationConfirmationEmail,
  archiveRegistrationRecord,
  restoreRegistrationRecord,
  isRegistrationArchived,
  markRegistrationArchivedLocal,
} from "@/lib/registrationOperations";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { AdminArchiveConfirmModal } from "@/components/admin/AdminArchiveConfirmModal";
import { useAuth } from "@/lib/auth";
import { AdminStatusBadge } from "@/components/admin/AdminBadge";
import { downloadTicketPdfFile, generateTicketPdf } from "@/lib/ticketPdfService";
import { getLocalNasArchives } from "@/lib/nasArchivalService";
import { 
  Gamepad2, 
  Search, 
  Download, 
  X, 
  Eye,
  RefreshCw,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Mail
} from "lucide-react";

export interface VisitorRegistrationRecord {
  id: string;
  registration_ref: string;
  full_name: string;
  email: string;
  phone: string;
  institution: string | null;
  visitor_category: string;
  student_class?: string | null;
  student_id?: string | null;
  designation?: string | null;
  esports_interest?: boolean | null;
  preferred_game?: string | null;
  esports_intent?: string | null;
  in_game_id?: string | null;
  team_name?: string | null;
  competition_notes?: string | null;
  days_attending?: string | null;
  visitor_count?: number;
  status: string;
  email_status?: string | null;
  admin_notes?: string | null;
  submitted_at: string;
  archived_at?: string | null;
  metadata?: Record<string, any> | null;
}

const REGISTRATION_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "correction_requested", label: "Correction Requested" },
  { value: "declined", label: "Declined" },
];

export default function AdminVisitorRegistrations() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("visitor:edit");
  const canDelete = hasPermission("visitor:delete");
  const canExport = hasPermission("visitor:export");
  const canResend = hasPermission("email_centre:resend");

  const [registrations, setRegistrations] = useState<VisitorRegistrationRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [esportsFilter, setEsportsFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewScope, setViewScope] = useState<"active" | "archived" | "all">("active");

  // Detail Drawer
  const [inspectedRecord, setInspectedRecord] = useState<VisitorRegistrationRecord | null>(null);

  // Safe Archive Modal
  const [archiveTarget, setArchiveTarget] = useState<VisitorRegistrationRecord | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("visitor_registrations")
        .select("*")
        .order("submitted_at", { ascending: false });

      if (fetchError) {
        throw new Error(fetchError.message || "Failed to fetch registrations from Supabase.");
      }

      setRegistrations((data as unknown as VisitorRegistrationRecord[]) || []);
    } catch (err: any) {
      console.error("Failed to load visitor registrations:", err);
      setStatusMsg({
        type: "error",
        text: `Error loading visitor registrations: ${err?.message || "Unknown error"}`,
      });
      setRegistrations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [{ table: "visitor_registrations", onRefresh: loadData }],
    "admin-visitor-registrations"
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Status Change Handler
  const handleStatusChange = async (id: string, ref: string, newStatus: string) => {
    setSavingId(id);
    setStatusMsg(null);
    try {
      const { error: updateError } = await supabase
        .from("visitor_registrations")
        .update({ status: newStatus })
        .eq("id", id);

      if (updateError) throw updateError;

      setRegistrations((prev) =>
        prev ? prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item)) : null
      );
      if (inspectedRecord && inspectedRecord.id === id) {
        setInspectedRecord({ ...inspectedRecord, status: newStatus });
      }

      let nextEmailStatus: string | undefined;
      if (newStatus === "confirmed") {
        const item = registrations?.find((r) => r.id === id) || inspectedRecord;
        let pdfAttachments: { filename: string; base64Content: string; contentType: string }[] | undefined;
        if (item) {
          try {
            const ticketPdf = await generateTicketPdf({
              ticketRef: ref,
              recipientName: item.full_name,
              category: item.visitor_category || "General Visitor",
              email: item.email,
              phone: item.phone,
              institution: item.institution || undefined,
              registrationType: "visitor",
              daysAttending: item.days_attending || undefined,
            });
            pdfAttachments = [
              {
                filename: ticketPdf.fileName,
                base64Content: ticketPdf.pdfBase64,
                contentType: "application/pdf",
              },
            ];
          } catch {
            // proceed cleanly if PDF generation throws
          }
        }

        const emailRes = await sendRegistrationConfirmationEmail(id, "visitor", false, {
          recipientEmail: item?.email,
          recipientName: item?.full_name,
          registrationRef: ref,
          institution: item?.institution || undefined,
          attachments: pdfAttachments,
          extraDetails: {
            category: item?.visitor_category,
            days: item?.days_attending,
          },
        });
        nextEmailStatus = emailRes.ok ? "sent" : "failed";
        setRegistrations((prev) =>
          prev ? prev.map((r) => (r.id === id ? { ...r, email_status: nextEmailStatus } : r)) : null
        );
        if (inspectedRecord && inspectedRecord.id === id) {
          setInspectedRecord((prev) => (prev ? { ...prev, email_status: nextEmailStatus } : null));
        }
        setStatusMsg({
          type: emailRes.ok ? "success" : "error",
          text: emailRes.ok
            ? `Reference ${ref} confirmed and confirmation email sent.`
            : `Reference ${ref} confirmed, but email notice failed: ${emailRes.error}`,
        });
      } else {
        setStatusMsg({
          type: "success",
          text: `Reference ${ref} updated to ${newStatus.replace("_", " ")}.`,
        });
      }
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err: any) {
      console.error("Status update error:", err);
      setStatusMsg({ type: "error", text: "Failed to update registration status. Try again." });
    } finally {
      setSavingId(null);
    }
  };

  // Safe Archive Handler
  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      const res = await archiveRegistrationRecord("visitor", archiveTarget.id);
      if (!res.ok) throw new Error(res.error);

      const now = new Date().toISOString();
      markRegistrationArchivedLocal(archiveTarget.id, true);
      setRegistrations((prev) =>
        prev
          ? prev.map((item) =>
              item.id === archiveTarget.id
                ? {
                    ...item,
                    archived_at: now,
                    admin_notes: item.admin_notes ? `${item.admin_notes}\n[ARCHIVED ${now}]` : `[ARCHIVED ${now}]`,
                  }
                : item
            )
          : null
      );
      if (inspectedRecord && inspectedRecord.id === archiveTarget.id) {
        setInspectedRecord({
          ...inspectedRecord,
          archived_at: now,
          admin_notes: inspectedRecord.admin_notes
            ? `${inspectedRecord.admin_notes}\n[ARCHIVED ${now}]`
            : `[ARCHIVED ${now}]`,
        });
      }

      setStatusMsg({
        type: "success",
        text: `Visitor pass "${archiveTarget.full_name}" (${archiveTarget.registration_ref}) was archived.`,
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
  const handleRestore = async (item: VisitorRegistrationRecord) => {
    setSavingId(item.id);
    try {
      const res = await restoreRegistrationRecord("visitor", item.id);
      if (!res.ok) throw new Error(res.error);

      markRegistrationArchivedLocal(item.id, false);
      setRegistrations((prev) =>
        prev
          ? prev.map((r) =>
              r.id === item.id
                ? {
                    ...r,
                    archived_at: null,
                    admin_notes: r.admin_notes?.replace(/\[ARCHIVED.*?\]/g, "").trim() || null,
                  }
                : r
            )
          : null
      );
      if (inspectedRecord && inspectedRecord.id === item.id) {
        setInspectedRecord({
          ...inspectedRecord,
          archived_at: null,
          admin_notes: inspectedRecord.admin_notes?.replace(/\[ARCHIVED.*?\]/g, "").trim() || null,
        });
      }

      setStatusMsg({
        type: "success",
        text: `Visitor pass "${item.full_name}" (${item.registration_ref}) restored to active list.`,
      });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Restore error: ${err.message || "Unknown error"}`,
      });
    } finally {
      setSavingId(null);
    }
  };

  // Helper to categorize rows reliably
  const getParsedCategory = (record: VisitorRegistrationRecord): "Student" | "General Visitor" | "Faculty / Staff" => {
    const cat = (record.visitor_category || "").toLowerCase();
    if (cat.includes("student")) return "Student";
    if (cat.includes("teacher") || cat.includes("educator") || cat.includes("faculty") || cat.includes("staff")) {
      return "Faculty / Staff";
    }
    return "General Visitor";
  };

  const getEsportsInterest = (record: VisitorRegistrationRecord): boolean => {
    if (record.esports_interest === true) return true;
    const cat = (record.visitor_category || "").toLowerCase();
    if (cat.includes("esports") || Boolean(record.preferred_game) || Boolean(record.in_game_id)) return true;
    return false;
  };

  const getPreferredGame = (record: VisitorRegistrationRecord): string | null => {
    if (record.preferred_game) return record.preferred_game;
    const cat = (record.visitor_category || "").toUpperCase();
    if (cat.includes("VALORANT")) return "VALORANT";
    if (cat.includes("BGMI")) return "BGMI";
    if (cat.includes("FREE FIRE")) return "Free Fire";
    return null;
  };

  const getRegistrationSource = (record: VisitorRegistrationRecord): { label: string; badge: string; linkedRef?: string } => {
    const notes = record.admin_notes || "";
    const cat = (record.visitor_category || "").toLowerCase();

    if (notes.includes("LINKED_PARTICIPATION") || cat.includes("participant")) {
      const match = notes.match(/LINKED_PARTICIPATION:\s*([A-Za-z0-9-]+)/);
      return {
        label: "Project Participant",
        badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
        linkedRef: match ? match[1] : undefined,
      };
    }
    if (notes.includes("LINKED_ESPORTS") || cat.includes("esports player")) {
      const match = notes.match(/LINKED_ESPORTS_[A-Z]+:\s*([A-Za-z0-9-]+)/);
      return {
        label: "Esports Player",
        badge: "bg-purple-50 text-purple-700 border-purple-200",
        linkedRef: match ? match[1] : undefined,
      };
    }
    return {
      label: "Direct Visitor",
      badge: "bg-blue-50 text-blue-700 border-blue-200",
    };
  };

  const handleResendEmail = async (record: VisitorRegistrationRecord) => {
    if (!canResend || savingId === record.id) return;
    setSavingId(record.id);
    setStatusMsg(null);
    const ticketRef = (record as any).ticket_ref || record.registration_ref;
    try {
      let pdfAttachments: { filename: string; base64Content: string; contentType: string }[] | undefined;
      try {
        const ticketPdf = await generateTicketPdf({
          ticketRef,
          recipientName: record.full_name,
          category: record.visitor_category || "General Visitor",
          email: record.email,
          phone: record.phone,
          institution: record.institution || undefined,
          registrationType: "visitor",
          daysAttending: record.days_attending || undefined,
        });
        pdfAttachments = [
          {
            filename: ticketPdf.fileName,
            base64Content: ticketPdf.pdfBase64,
            contentType: "application/pdf",
          },
        ];
      } catch {
        // continue
      }

      const res = await sendRegistrationConfirmationEmail(record.id, "visitor", true, {
        recipientEmail: record.email,
        recipientName: record.full_name,
        registrationRef: record.registration_ref,
        institution: record.institution || undefined,
        attachments: pdfAttachments,
        extraDetails: {
          category: record.visitor_category,
          days: record.days_attending,
        },
      });
      if (res.ok && !res.simulated) {
        setStatusMsg({
          type: "success",
          text: `Visitor ticket pass (${ticketRef}) resent successfully to ${record.email}.`,
        });
        setRegistrations((prev) =>
          prev ? prev.map((item) => (item.id === record.id ? { ...item, email_status: "sent" } : item)) : null
        );
        if (inspectedRecord && inspectedRecord.id === record.id) {
          setInspectedRecord({ ...inspectedRecord, email_status: "sent" });
        }
      } else {
        const nextStatus = record.email_status === "sent" ? "sent" : "failed";
        setRegistrations((prev) =>
          prev ? prev.map((item) => (item.id === record.id ? { ...item, email_status: nextStatus } : item)) : null
        );
        if (inspectedRecord && inspectedRecord.id === record.id) {
          setInspectedRecord({ ...inspectedRecord, email_status: nextStatus });
        }
        const statusSuffix = res.httpStatusCode ? ` [HTTP ${res.httpStatusCode}${res.errorType ? ` · ${res.errorType}` : ""}]` : "";
        throw new Error(`${res.error || "Email delivery failed"}${statusSuffix}`);
      }
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Failed to resend confirmation email: ${err.message || "Unknown error"}`,
      });
    } finally {
      setSavingId(null);
    }
  };

  // Filtered registrations
  const filteredRegistrations = useMemo(() => {
    if (!registrations) return [];

    return registrations.filter((item) => {
      const isArchived = isRegistrationArchived(item);

      // 1. View Scope
      if (viewScope === "active" && isArchived) return false;
      if (viewScope === "archived" && !isArchived) return false;

      // 2. Status Filter
      if (statusFilter !== "all" && item.status !== statusFilter) return false;

      // 3. Category Filter
      const parsedCat = getParsedCategory(item);
      if (categoryFilter !== "all") {
        if (categoryFilter === "Student" && parsedCat !== "Student") return false;
        if (categoryFilter === "General Visitor" && parsedCat !== "General Visitor") return false;
        if (categoryFilter === "Faculty / Staff" && parsedCat !== "Faculty / Staff") return false;
      }

      // 4. Esports Interest Filter
      const isInterestedInEsports = getEsportsInterest(item);
      if (esportsFilter === "yes" && !isInterestedInEsports) return false;
      if (esportsFilter === "no" && isInterestedInEsports) return false;

      // 5. Preferred Game Filter
      const game = getPreferredGame(item);
      if (gameFilter !== "all") {
        if (!game || !game.toLowerCase().includes(gameFilter.toLowerCase())) return false;
      }

      // 6. Search Query
      if (searchQuery.trim()) {
        const needle = searchQuery.toLowerCase().trim();
        const matches = [
          item.registration_ref,
          item.full_name,
          item.email,
          item.phone,
          item.institution ?? "",
          item.student_class ?? "",
          item.student_id ?? "",
          item.designation ?? "",
          item.in_game_id ?? "",
          item.team_name ?? "",
          item.preferred_game ?? "",
        ].some((val) => val.toLowerCase().includes(needle));

        if (!matches) return false;
      }

      return true;
    });
  }, [registrations, viewScope, statusFilter, categoryFilter, esportsFilter, gameFilter, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    if (!registrations) return { totalActive: 0, students: 0, general: 0, faculty: 0, esports: 0, archived: 0 };
    let totalActive = 0;
    let students = 0;
    let general = 0;
    let faculty = 0;
    let esports = 0;
    let archived = 0;

    registrations.forEach((r) => {
      if (isRegistrationArchived(r)) {
        archived++;
      } else {
        totalActive++;
        const cat = getParsedCategory(r);
        if (cat === "Student") students++;
        else if (cat === "Faculty / Staff") faculty++;
        else general++;

        if (getEsportsInterest(r)) esports++;
      }
    });

    return { totalActive, students, general, faculty, esports, archived };
  }, [registrations]);

  // Export to CSV
  const exportCsv = () => {
    if (!filteredRegistrations.length) return;

    const sanitizeCsv = (val: string | number | null | undefined): string => {
      const str = String(val ?? "");
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const headers = [
      "Reference",
      "Full Name",
      "Category",
      "Email",
      "Phone",
      "Institution",
      "Class/Standard",
      "Student ID",
      "Designation",
      "Esports Interested",
      "Preferred Game",
      "Esports Intent",
      "In-Game ID",
      "Team Name",
      "Status",
      "Archived",
      "Submitted At",
    ];

    const rows = filteredRegistrations.map((r) => [
      sanitizeCsv(r.registration_ref),
      sanitizeCsv(r.full_name),
      sanitizeCsv(getParsedCategory(r)),
      sanitizeCsv(r.email),
      sanitizeCsv(r.phone),
      sanitizeCsv(r.institution || "Independent"),
      sanitizeCsv(r.student_class || ""),
      sanitizeCsv(r.student_id || ""),
      sanitizeCsv(r.designation || ""),
      sanitizeCsv(getEsportsInterest(r) ? "Yes" : "No"),
      sanitizeCsv(getPreferredGame(r) || ""),
      sanitizeCsv(r.esports_intent || ""),
      sanitizeCsv(r.in_game_id || ""),
      sanitizeCsv(r.team_name || ""),
      sanitizeCsv(r.status),
      sanitizeCsv(isRegistrationArchived(r) ? "YES" : "NO"),
      sanitizeCsv(r.submitted_at),
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `supernova_visitor_registrations_${new Date().toISOString().slice(0, 10)}.csv`);
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
              Visitor Passes & Gate RSVPs
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            Visitor Registrations
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Manage student cohorts, general public attendee passes, faculty RSVPs, and spectator esports preferences.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Sync</span>
          </button>
          {canExport && (
            <button
              type="button"
              onClick={exportCsv}
              disabled={!filteredRegistrations.length}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-slate-500 font-semibold">Active Visitors</p>
          <p className="text-2xl font-display font-extrabold text-slate-900 mt-1">{metrics.totalActive}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-blue-700 font-semibold">Students</p>
          <p className="text-2xl font-display font-extrabold text-blue-700 mt-1">{metrics.students}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-slate-700 font-semibold">General Public</p>
          <p className="text-2xl font-display font-extrabold text-slate-800 mt-1">{metrics.general}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-amber-700 font-semibold">Faculty / Staff</p>
          <p className="text-2xl font-display font-extrabold text-amber-700 mt-1">{metrics.faculty}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-purple-700 font-semibold">Esports Fans</p>
          <p className="text-2xl font-display font-extrabold text-purple-700 mt-1">{metrics.esports}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-slate-500 font-semibold">Archived</p>
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
            {statusMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMsg(null)} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
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
              Active Visitors ({metrics.totalActive})
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
              All Passes
            </button>
          </div>

          <span className="text-xs text-slate-500 font-mono">
            Showing <strong className="text-slate-900">{filteredRegistrations.length}</strong> matching passes
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
          {/* Search */}
          <div className="relative lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, ref, email, roll no..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Category */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Categories</option>
            <option value="Student">Student Cohorts</option>
            <option value="General Visitor">General Visitors</option>
            <option value="Faculty / Staff">Faculty / Staff</option>
          </select>

          {/* Esports Interest */}
          <select
            value={esportsFilter}
            onChange={(e) => setEsportsFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Esports Interests</option>
            <option value="yes">Interested (Yes)</option>
            <option value="no">Not Interested (No)</option>
          </select>

          {/* Game Filter */}
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Esports Titles</option>
            <option value="valorant">VALORANT</option>
            <option value="bgmi">BGMI</option>
            <option value="free fire">Free Fire</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            {REGISTRATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
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
                <th className="py-3 px-4 font-semibold">Visitor & Category</th>
                <th className="py-3 px-4 font-semibold">Academic / Organization</th>
                <th className="py-3 px-4 font-semibold">Esports Track</th>
                <th className="py-3 px-4 font-semibold">Contact Info</th>
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
                    Loading visitor records...
                  </td>
                </tr>
              ) : filteredRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="font-semibold text-slate-800">No visitor records match your filters.</p>
                  </td>
                </tr>
              ) : (
                filteredRegistrations.map((row) => {
                  const parsedCategory = getParsedCategory(row);
                  const isEsports = getEsportsInterest(row);
                  const preferredGame = getPreferredGame(row);
                  const isArchived = isRegistrationArchived(row);
                  const source = getRegistrationSource(row);

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setInspectedRecord(row)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Reference & Source */}
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                        <div>{row.registration_ref}</div>
                        <div className="mt-1 flex flex-col gap-0.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${source.badge}`}>
                            {source.label}
                          </span>
                          {source.linkedRef && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              App: {source.linkedRef}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Visitor Name & Category */}
                      <td className="py-3.5 px-4">
                        <strong className="text-slate-900 block group-hover:text-blue-700 transition-colors">
                          {row.full_name}
                        </strong>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider ${
                              parsedCategory === "Student"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : parsedCategory === "Faculty / Staff"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {parsedCategory}
                          </span>
                          {row.days_attending && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({row.days_attending})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Academic / Organization */}
                      <td className="py-3.5 px-4">
                        <span className="text-slate-800 font-medium block truncate max-w-[200px]">
                          {row.institution || "Independent Visitor"}
                        </span>
                        {parsedCategory === "Student" && (
                          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                            {row.student_class && <span>Class: {row.student_class}</span>}
                            {row.student_id && <span> · Roll: {row.student_id}</span>}
                          </div>
                        )}
                        {parsedCategory === "Faculty / Staff" && row.designation && (
                          <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                            Desig: {row.designation}
                          </div>
                        )}
                      </td>

                      {/* Esports Track */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isEsports ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-700 font-mono text-[11px] font-semibold">
                            <Gamepad2 size={11} />
                            <span>{preferredGame || "General"}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">No</span>
                        )}
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <span className="block text-slate-800 truncate max-w-[170px]">{row.email}</span>
                        <span className="text-slate-500 text-[11px]">{row.phone}</span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                          <AdminStatusBadge status={row.status} isArchived={isArchived} />
                          {row.status === "confirmed" && (
                            <div>
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                  row.email_status === "sent"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : row.email_status === "failed"
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}
                              >
                                <Mail size={10} />
                                <span>{row.email_status || "not_sent"}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Submitted Date */}
                      <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(row.submitted_at).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setInspectedRecord(row)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                          >
                            <Eye size={12} />
                            <span>View</span>
                          </button>

                          {row.status === "confirmed" && canResend && (
                            <button
                              type="button"
                              onClick={() => handleResendEmail(row)}
                              disabled={savingId === row.id}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                              title="Resend visitor pass email"
                            >
                              <Mail size={13} />
                            </button>
                          )}

                          {canDelete && (
                            isArchived ? (
                              <button
                                type="button"
                                onClick={() => handleRestore(row)}
                                disabled={savingId === row.id}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors cursor-pointer"
                                title="Restore to active passes"
                              >
                                <RotateCcw size={12} />
                                <span>Restore</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setArchiveTarget(row)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Archive visitor pass"
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

      {/* Record Inspection Detail Drawer */}
      {inspectedRecord && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-fadeIn"
          onClick={() => setInspectedRecord(null)}
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
                      {inspectedRecord.registration_ref}
                    </span>
                    <AdminStatusBadge status={inspectedRecord.status} isArchived={isRegistrationArchived(inspectedRecord)} />
                  </div>
                  <h2 className="text-xl font-display font-black text-slate-900 tracking-tight m-0">
                    {inspectedRecord.full_name}
                  </h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Category: {getParsedCategory(inspectedRecord)} · Days: {inspectedRecord.days_attending || "Both Days"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedRecord(null)}
                  className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Status Verification Actions */}
              {(canEdit || canDelete) && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                    Update Approval Status
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          disabled={savingId === inspectedRecord.id || inspectedRecord.status === "confirmed"}
                          onClick={() => handleStatusChange(inspectedRecord.id, inspectedRecord.registration_ref, "confirmed")}
                          className="py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          disabled={savingId === inspectedRecord.id || inspectedRecord.status === "correction_requested"}
                          onClick={() => handleStatusChange(inspectedRecord.id, inspectedRecord.registration_ref, "correction_requested")}
                          className="py-2 px-3 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Correction
                        </button>
                        <button
                          type="button"
                          disabled={savingId === inspectedRecord.id || inspectedRecord.status === "declined"}
                          onClick={() => handleStatusChange(inspectedRecord.id, inspectedRecord.registration_ref, "declined")}
                          className="py-2 px-3 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {canDelete && (
                      isRegistrationArchived(inspectedRecord) ? (
                        <button
                          type="button"
                          disabled={savingId === inspectedRecord.id}
                          onClick={() => handleRestore(inspectedRecord)}
                          className="py-2 px-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setArchiveTarget(inspectedRecord)}
                          className="py-2 px-3 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          Archive
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Ticketing & Email Dispatch Card */}
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-blue-900">
                    Visitor Ticket & Email Pass
                  </span>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white text-blue-700 border border-blue-200">
                    {getRegistrationSource(inspectedRecord).label}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-600">Ticket Reference:</span>
                  <strong className="font-mono text-xs text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-200">
                    {inspectedRecord.registration_ref}
                  </strong>
                </div>
                {getRegistrationSource(inspectedRecord).linkedRef && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Linked Application:</span>
                    <strong className="font-mono text-xs text-slate-800">
                      {getRegistrationSource(inspectedRecord).linkedRef}
                    </strong>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Email Status:</span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {inspectedRecord.email_status || (inspectedRecord.status === "confirmed" ? "not sent" : "pending confirmation")}
                  </span>
                </div>
                {/* NAS Archive Status */}
                {(() => {
                  const nasRecord = getLocalNasArchives().find((a) => a.ticketRef === inspectedRecord.registration_ref);
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
                          {nasRecord?.status || (inspectedRecord.status === "confirmed" ? "completed" : "pending")}
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
                  <button
                    type="button"
                    onClick={() => {
                      downloadTicketPdfFile({
                        ticketRef: inspectedRecord.registration_ref,
                        recipientName: inspectedRecord.full_name,
                        category: inspectedRecord.visitor_category || "General Visitor",
                        email: inspectedRecord.email,
                        phone: inspectedRecord.phone,
                        institution: inspectedRecord.institution || undefined,
                        registrationType: "visitor",
                        daysAttending: inspectedRecord.days_attending || undefined,
                      });
                    }}
                    className="py-2 px-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Download Ticket</span>
                  </button>

                  {canResend && (
                    <button
                      type="button"
                      disabled={savingId === inspectedRecord.id}
                      onClick={() => handleResendEmail(inspectedRecord)}
                      className="py-2 px-3 rounded-lg bg-white hover:bg-blue-50 border border-blue-300 text-blue-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Mail size={13} />
                      <span>Resend Email</span>
                    </button>
                  )}
                </div>
              </div>

              {/* General Contact Details */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2 text-xs">
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Contact Information
                </h3>
                <div className="flex justify-between">
                  <span className="text-slate-500">Full Name:</span>
                  <strong className="text-slate-900">{inspectedRecord.full_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email Address:</span>
                  <a href={`mailto:${inspectedRecord.email}`} className="text-blue-700 font-mono hover:underline">
                    {inspectedRecord.email}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone Number:</span>
                  <a href={`tel:${inspectedRecord.phone}`} className="text-blue-700 font-mono hover:underline">
                    {inspectedRecord.phone}
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Institution:</span>
                  <span className="font-medium text-slate-900">{inspectedRecord.institution || "Not specified"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Days Attending:</span>
                  <span className="font-medium text-slate-900">{inspectedRecord.days_attending || "Both Days"}</span>
                </div>
              </div>

              {/* Student Academic Details (Conditional) */}
              {getParsedCategory(inspectedRecord) === "Student" && (
                <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-2 text-xs">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-blue-900 mb-2">
                    Student Academic Information
                  </h3>
                  <div className="flex justify-between">
                    <span className="text-blue-800">Class / Standard:</span>
                    <strong className="text-blue-950 font-mono">{inspectedRecord.student_class || "N/A"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-800">Student Roll No / ID:</span>
                    <strong className="text-blue-950 font-mono">{inspectedRecord.student_id || "N/A"}</strong>
                  </div>
                </div>
              )}

              {/* Faculty / Staff Details (Conditional) */}
              {getParsedCategory(inspectedRecord) === "Faculty / Staff" && (
                <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-2 text-xs">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-amber-900 mb-2">
                    Faculty Details
                  </h3>
                  <div className="flex justify-between">
                    <span className="text-amber-800">Designation / Role:</span>
                    <strong className="text-amber-950">{inspectedRecord.designation || "Faculty / Staff"}</strong>
                  </div>
                </div>
              )}

              {/* Esports Arena Interest (Conditional) */}
              {getEsportsInterest(inspectedRecord) && (
                <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/80 space-y-2 text-xs">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-purple-900 mb-2">
                    Esports Arena Participation
                  </h3>
                  <div className="flex justify-between">
                    <span className="text-purple-800">Preferred Game:</span>
                    <strong className="text-purple-950">{getPreferredGame(inspectedRecord) || "General"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-800">Mode:</span>
                    <span className="font-semibold text-purple-950 capitalize">
                      {inspectedRecord.esports_intent || "Spectator"}
                    </span>
                  </div>
                  {inspectedRecord.in_game_id && (
                    <div className="flex justify-between">
                      <span className="text-purple-800">In-Game Tag / ID:</span>
                      <strong className="text-purple-950 font-mono">{inspectedRecord.in_game_id}</strong>
                    </div>
                  )}
                  {inspectedRecord.team_name && (
                    <div className="flex justify-between">
                      <span className="text-purple-800">Team Name:</span>
                      <span className="text-purple-950 font-medium">{inspectedRecord.team_name}</span>
                    </div>
                  )}
                  {inspectedRecord.competition_notes && (
                    <div className="pt-2 border-t border-purple-200">
                      <span className="text-purple-800 block mb-1">Competition Notes:</span>
                      <p className="p-2.5 rounded bg-white border border-purple-200 text-purple-950">
                        {inspectedRecord.competition_notes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedRecord(null)}
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
          name={archiveTarget.full_name}
          category={`Visitor Pass (${getParsedCategory(archiveTarget)})`}
        />
      )}
    </div>
  );
}
