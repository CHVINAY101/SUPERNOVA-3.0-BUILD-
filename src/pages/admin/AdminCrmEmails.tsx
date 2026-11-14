import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Send,
  Search,
  HardDrive,
  Wifi,
  WifiOff,
  Mail,
  FileText,
  History,
  Activity,
  Paperclip,
  Eye,
  X,
  Check,
} from "lucide-react";
import {
  sendRegistrationConfirmationEmail,
  getLocalEmailDispatchLogs,
  getLocalLinkedTickets,
} from "@/lib/registrationOperations";
import {
  getNasConnectionStatus,
  syncAllPendingNasArchives,
  setSimulatedNasOnline,
} from "@/lib/nasArchivalService";
import { generateTicketPdf } from "@/lib/ticketPdfService";
import type { CrmEmail } from "@/types/database";
import {
  CRM_EMAIL_TEMPLATES,
  getCrmEmailHistory,
  getEmailDeliveryStatus,
  getSuggestedRecipients,
  sendCrmEmail,
  type EmailDeliveryStatus,
  type RecipientSuggestion,
} from "@/services/crmEmailService";
import {
  EMAIL_DELIVERY_ENABLED,
  EMAIL_UNAVAILABLE_MESSAGE,
  validateEmailList,
  validateRecipientEmail,
  type EmailAttachmentInput,
} from "@/lib/emailPayload";

interface EmailLogItem {
  id: string;
  recipient: string;
  type: "Visitor Pass" | "Project Exhibit" | "Esports Squad";
  ref: string;
  status: string;
  sentAt: string;
  source: string;
  institution?: string;
  category?: string;
  projectTitle?: string;
  teamName?: string;
  channel?: string;
  sender?: string;
  httpStatusCode?: number;
  apiResponse?: string;
  errorMessage?: string;
}

type EmailCentreTab = "dispatch" | "compose" | "history" | "diagnostics";

export default function AdminCrmEmails() {
  const { user, hasPermission } = useAuth();
  const canCompose = hasPermission("email_centre:compose");
  const canSend = hasPermission("email_centre:send");
  const canResend = hasPermission("email_centre:resend");

  const [activeTab, setActiveTab] = useState<EmailCentreTab>("dispatch");

  // Dispatch Audit state
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [nasStatus, setNasStatus] = useState(getNasConnectionStatus());
  const [syncingNas, setSyncingNas] = useState(false);

  // Compose & Send state
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(CRM_EMAIL_TEMPLATES[0].subject);
  const [bodyHtml, setBodyHtml] = useState(CRM_EMAIL_TEMPLATES[0].bodyHtml);
  const [showPreview, setShowPreview] = useState(false);
  const [attachments, setAttachments] = useState<EmailAttachmentInput[]>([]);
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // CRM History state
  const [historyItems, setHistoryItems] = useState<CrmEmail[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Diagnostics state
  const [deliveryStatus, setDeliveryStatus] = useState<EmailDeliveryStatus | null>(null);
  const [regConfirmHealth, setRegConfirmHealth] = useState<{
    checked: boolean;
    ok: boolean;
    unavailable?: boolean;
    detail: string;
  } | null>(null);
  const [checkingDiagnostics, setCheckingDiagnostics] = useState(false);

  const safeSelectRegistrationTable = async (
    table: "visitor_registrations" | "participation_registrations" | "registrations",
    primaryCols: string,
    fallbackCols: string
  ) => {
    const first = await supabase.from(table).select(primaryCols).limit(100);
    if (!first.error) return first.data || [];
    const second = await supabase.from(table).select(fallbackCols).limit(100);
    return second.data || [];
  };

  const fetchEmailLogs = useCallback(async () => {
    setLoading(true);
    try {
      const [visRows, partRows, espRows] = await Promise.all([
        safeSelectRegistrationTable(
          "visitor_registrations",
          "id, registration_ref, full_name, email, institution, visitor_category, status, email_status, email_error, email_sent_at, submitted_at",
          "id, registration_ref, full_name, email, institution, visitor_category, status, submitted_at"
        ),
        safeSelectRegistrationTable(
          "participation_registrations",
          "id, registration_ref, full_name, email, institution, project_title, status, email_status, email_error, email_sent_at, submitted_at",
          "id, registration_ref, full_name, email, institution, project_title, status, submitted_at"
        ),
        safeSelectRegistrationTable(
          "registrations",
          "id, registration_ref, team_name, captain_name, email, institution, status, email_status, email_error, email_sent_at, submitted_at",
          "id, registration_ref, team_name, captain_name, email, institution, status, submitted_at"
        ),
      ]);

      const auditLogs = getLocalEmailDispatchLogs();
      const auditMap = new Map<string, typeof auditLogs[0]>();
      auditLogs.forEach((l) => {
        if (l.registrationRef && !auditMap.has(l.registrationRef)) auditMap.set(l.registrationRef, l);
        if (l.registrationId && !auditMap.has(l.registrationId)) auditMap.set(l.registrationId, l);
      });

      const items: EmailLogItem[] = [];

      visRows.forEach((v: any) => {
        const audit = auditMap.get(v.registration_ref) || auditMap.get(v.id);
        const realStatus = audit?.status || v.email_status || "unavailable";
        items.push({
          id: v.id,
          recipient: v.email,
          type: "Visitor Pass",
          ref: v.registration_ref,
          status: realStatus,
          sentAt: audit?.timestamp || v.email_sent_at || v.submitted_at,
          source: v.full_name,
          institution: v.institution || undefined,
          category: v.visitor_category || "Visitor",
          channel: audit?.channel || (v.email_status === "sent" ? "verified_delivery_pipeline" : undefined),
          sender: audit?.sender || "animationthenationalcollege@gmail.com",
          httpStatusCode: audit?.httpStatusCode,
          apiResponse: audit?.apiResponse,
          errorMessage: audit?.errorMessage || v.email_error || undefined,
        });
      });

      partRows.forEach((p: any) => {
        const audit = auditMap.get(p.registration_ref) || auditMap.get(p.id);
        const realStatus = audit?.status || p.email_status || (p.status === "confirmed" ? "unavailable" : "pending");
        items.push({
          id: p.id,
          recipient: p.email,
          type: "Project Exhibit",
          ref: p.registration_ref,
          status: realStatus,
          sentAt: audit?.timestamp || p.email_sent_at || p.submitted_at,
          source: p.full_name,
          institution: p.institution || undefined,
          projectTitle: p.project_title || undefined,
          channel: audit?.channel,
          sender: audit?.sender || "animationthenationalcollege@gmail.com",
          httpStatusCode: audit?.httpStatusCode,
          apiResponse: audit?.apiResponse,
          errorMessage: audit?.errorMessage || p.email_error || undefined,
        });
      });

      espRows.forEach((e: any) => {
        const audit = auditMap.get(e.registration_ref) || auditMap.get(e.id);
        const realStatus = audit?.status || e.email_status || (e.status === "confirmed" ? "unavailable" : "pending");
        items.push({
          id: e.id,
          recipient: e.email,
          type: "Esports Squad",
          ref: e.registration_ref,
          status: realStatus,
          sentAt: audit?.timestamp || e.email_sent_at || e.submitted_at,
          source: `${e.team_name} (Cap: ${e.captain_name})`,
          institution: e.institution || undefined,
          teamName: e.team_name || undefined,
          channel: audit?.channel,
          sender: audit?.sender || "animationthenationalcollege@gmail.com",
          httpStatusCode: audit?.httpStatusCode,
          apiResponse: audit?.apiResponse,
          errorMessage: audit?.errorMessage || e.email_error || undefined,
        });
      });

      setLogs(items);
    } catch (err) {
      console.warn("Failed to load email logs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadComposeMetadata = useCallback(async () => {
    const recips = await getSuggestedRecipients();
    setSuggestions(recips);
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const hist = await getCrmEmailHistory();
      setHistoryItems(hist);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const runDiagnostics = useCallback(async () => {
    setCheckingDiagnostics(true);
    try {
      const crmStatus = await getEmailDeliveryStatus();
      setDeliveryStatus(crmStatus);

      if (!EMAIL_DELIVERY_ENABLED) {
        setRegConfirmHealth({
          checked: true,
          ok: false,
          unavailable: true,
          detail: EMAIL_UNAVAILABLE_MESSAGE,
        });
        return;
      }

      // Probe send-registration-confirmation deployment cleanly
      try {
        const baseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
        const getResp = baseUrl
          ? await fetch(`${baseUrl}/functions/v1/send-registration-confirmation`, { method: "GET" })
          : null;

        if (getResp && getResp.status === 404) {
          setRegConfirmHealth({
            checked: true,
            ok: false,
            detail: "Edge Function send-registration-confirmation is not deployed on Supabase (HTTP 404 NOT_FOUND).",
          });
        } else if (getResp && getResp.ok) {
          const healthJson = await getResp.json().catch(() => ({}));
          const isUnavailable = Boolean(healthJson?.unavailable || !healthJson?.configured);
          setRegConfirmHealth({
            checked: true,
            ok: Boolean(healthJson?.configured) && !isUnavailable,
            unavailable: isUnavailable,
            detail: isUnavailable
              ? healthJson?.message || EMAIL_UNAVAILABLE_MESSAGE
              : `Edge Function send-registration-confirmation is deployed (${healthJson.provider || "configured"}).`,
          });
        } else {
          setRegConfirmHealth({
            checked: true,
            ok: false,
            unavailable: true,
            detail: EMAIL_UNAVAILABLE_MESSAGE,
          });
        }
      } catch (probeErr: any) {
        setRegConfirmHealth({
          checked: true,
          ok: false,
          detail: probeErr?.message || EMAIL_UNAVAILABLE_MESSAGE,
        });
      }
    } finally {
      setCheckingDiagnostics(false);
    }
  }, []);

  useEffect(() => {
    fetchEmailLogs();
    loadComposeMetadata();
  }, [fetchEmailLogs, loadComposeMetadata]);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
    if (activeTab === "diagnostics") runDiagnostics();
  }, [activeTab, loadHistory, runDiagnostics]);

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setStatusMsg({ type: "error", text: "Attachment must be smaller than 4 MB." });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setAttachments((prev) => [
        ...prev,
        {
          filename: file.name,
          base64Content: dataUrl,
          contentType: file.type || "application/pdf",
        },
      ]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleResend = async (item: EmailLogItem) => {
    if (!canResend) {
      setStatusMsg({ type: "error", text: "Permission denied: email_centre:resend is required." });
      return;
    }
    if (resendingId === item.id) return;

    setResendingId(item.id);
    setStatusMsg(null);
    try {
      const regType =
        item.type === "Visitor Pass" ? "visitor" : item.type === "Esports Squad" ? "esports" : "participation";

      const linkedRef = getLocalLinkedTickets()[item.ref];
      const ticketRef =
        regType === "visitor" ? item.ref : regType === "participation" ? linkedRef || `${item.ref}-VIS` : item.ref;

      let pdfAttachments: EmailAttachmentInput[] | undefined;
      try {
        const ticket = await generateTicketPdf({
          ticketRef,
          recipientName: item.source,
          category: item.category || item.type,
          email: item.recipient,
          institution: item.institution,
          registrationType: regType === "esports" ? "esports_team" : regType,
          applicationRef: item.ref,
          projectTitle: item.projectTitle,
          teamName: item.teamName,
        });
        pdfAttachments = [
          {
            filename: ticket.fileName,
            base64Content: ticket.pdfBase64,
            contentType: "application/pdf",
          },
        ];
      } catch {
        // Proceed without attachment only if PDF generation throws unexpectedly
      }

      const res = await sendRegistrationConfirmationEmail(item.id, regType, true, {
        recipientEmail: item.recipient,
        recipientName: item.source,
        registrationRef: item.ref,
        institution: item.institution,
        attachments: pdfAttachments,
      });

      if (res.ok && !res.simulated) {
        setStatusMsg({
          type: "success",
          text: `Official ticket pass emailed to ${item.recipient} (${item.ref}).`,
        });
        await fetchEmailLogs();
      } else if (res.unavailable || !EMAIL_DELIVERY_ENABLED) {
        setStatusMsg({
          type: "error",
          text: `${EMAIL_UNAVAILABLE_MESSAGE} — download or share the PDF pass directly.`,
        });
        await fetchEmailLogs();
      } else {
        const statusSuffix = res.httpStatusCode
          ? ` [HTTP ${res.httpStatusCode}${res.errorType ? ` · ${res.errorType}` : ""}]`
          : "";
        throw new Error(`${res.error || EMAIL_UNAVAILABLE_MESSAGE}${statusSuffix}`);
      }
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Failed to resend confirmation email: ${err.message}`,
      });
      await fetchEmailLogs();
    } finally {
      setResendingId(null);
    }
  };

  const validateComposeForm = (): string | null => {
    const toCheck = validateRecipientEmail(recipient);
    if (!toCheck.valid) return toCheck.error || "Invalid recipient email address.";
    const ccCheck = validateEmailList(cc);
    if (!ccCheck.valid) return `Invalid CC address: ${ccCheck.error}`;
    const bccCheck = validateEmailList(bcc);
    if (!bccCheck.valid) return `Invalid BCC address: ${bccCheck.error}`;
    if (!subject.trim()) return "Email subject is required.";
    if (!bodyHtml.trim()) return "Email body is required.";
    return null;
  };

  const handleRequestSend = () => {
    if (!canSend) {
      setStatusMsg({ type: "error", text: "Permission denied: email_centre:send is required." });
      return;
    }
    const validationError = validateComposeForm();
    if (validationError) {
      setStatusMsg({ type: "error", text: validationError });
      return;
    }
    setStatusMsg(null);
    setConfirmSendOpen(true);
  };

  const handleConfirmSend = async () => {
    setSendingEmail(true);
    setStatusMsg(null);
    try {
      const res = await sendCrmEmail({
        recipient,
        cc,
        bcc,
        subject,
        bodyHtml,
        attachments,
      });

      if (!res.ok) {
        setConfirmSendOpen(false);
        setStatusMsg({
          type: "error",
          text: res.error || EMAIL_UNAVAILABLE_MESSAGE,
        });
        return;
      }

      setStatusMsg({
        type: "success",
        text: `Email delivered (Message ID: ${res.messageId}).`,
      });
      setConfirmSendOpen(false);
      setAttachments([]);
    } catch (err: any) {
      setConfirmSendOpen(false);
      setStatusMsg({
        type: "error",
        text: err?.message || EMAIL_UNAVAILABLE_MESSAGE,
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handlePrefillTestEmail = () => {
    setRecipient(user?.email || "animationthenationalcollege@gmail.com");
    setSubject("Supernova 3.0 — CRM Email Delivery Diagnostic Test");
    setBodyHtml(
      `<div style="font-family: Arial, sans-serif; padding: 20px; border: 2px solid #191936; border-radius: 12px;">
        <h2 style="margin-top:0; color:#191936;">Supernova 3.0 Delivery Verification</h2>
        <p>This is a live diagnostic email sent from the Supernova 3.0 CRM Email Centre (${new Date().toLocaleString("en-IN")}).</p>
      </div>`
    );
  };

  const filteredLogs = logs.filter((item) => {
    if (filterType !== "all" && item.type.toLowerCase() !== filterType.toLowerCase()) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        item.recipient.toLowerCase().includes(q) ||
        item.ref.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Official Sender: animationthenationalcollege@gmail.com
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            Email Centre & Ticket Dispatch
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Verify ticket email deliveries, send official CRM emails with PDF passes, and audit delivery health.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchEmailLogs}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {!EMAIL_DELIVERY_ENABLED && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle size={16} className="text-amber-700 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold block">{EMAIL_UNAVAILABLE_MESSAGE}</strong>
            <span className="text-amber-800">
              Automatic and CRM email sending is currently disabled. Registration approvals, QR/PDF pass downloads, and NAS archival continue to work normally.
            </span>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="inline-flex flex-wrap gap-1.5 p-1 rounded-2xl bg-slate-100 border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("dispatch")}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "dispatch" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Mail size={13} />
          <span>Dispatch Audit & Passes</span>
        </button>

        {canCompose && (
          <button
            type="button"
            onClick={() => setActiveTab("compose")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "compose" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Send size={13} />
            <span>Compose Email</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "history" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <History size={13} />
          <span>CRM Email History</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("diagnostics")}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "diagnostics" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Activity size={13} />
          <span>Delivery Diagnostics</span>
        </button>
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

      {/* TAB 1: DISPATCH AUDIT & PASSES */}
      {activeTab === "dispatch" && (
        <div className="space-y-6">
          {/* NAS Connection & Archival Control Banner */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    nasStatus.isOnline
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  <HardDrive size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-extrabold text-sm text-slate-900">
                      Campus Central NAS Storage ({nasStatus.shareName})
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        nasStatus.isOnline ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {nasStatus.isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                      {nasStatus.isOnline ? "Online · SMB/CIFS" : "Host Offline"}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    Target: {nasStatus.endpoint} · Queue: {nasStatus.pendingSyncQueue} pending · Archived:{" "}
                    {nasStatus.totalArchivedFiles} files
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !nasStatus.isOnline;
                    setSimulatedNasOnline(next);
                    setNasStatus(getNasConnectionStatus());
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Toggle {nasStatus.isOnline ? "Offline" : "Online"}
                </button>

                <button
                  type="button"
                  disabled={syncingNas || !nasStatus.isOnline}
                  onClick={async () => {
                    setSyncingNas(true);
                    try {
                      const res = await syncAllPendingNasArchives();
                      setNasStatus(getNasConnectionStatus());
                      setStatusMsg({
                        type: "success",
                        text: `NAS Sync Completed: ${res.succeeded} file(s) synchronized to storage.`,
                      });
                    } catch (e: any) {
                      setStatusMsg({ type: "error", text: `NAS Sync Error: ${e.message}` });
                    } finally {
                      setSyncingNas(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#191936] hover:bg-[#2b2b54] text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw size={12} className={syncingNas ? "animate-spin" : ""} />
                  <span>Retry / Sync Pending NAS</span>
                </button>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
              <span className="text-[11px] font-mono uppercase text-slate-500 font-semibold block">
                Total Registrations
              </span>
              <span className="text-2xl font-display font-extrabold text-slate-900 block mt-1">
                {logs.length}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
              <span className="text-[11px] font-mono uppercase text-emerald-700 font-semibold block">
                Dispatched Passes
              </span>
              <span className="text-2xl font-display font-extrabold text-emerald-700 block mt-1">
                {logs.filter((l) => l.status === "sent").length}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
              <span className="text-[11px] font-mono uppercase text-rose-700 font-semibold block">
                Unavailable / Not Sent
              </span>
              <span className="text-2xl font-display font-extrabold text-rose-700 block mt-1">
                {logs.filter((l) => l.status === "failed" || l.status === "not_sent" || l.status === "unavailable").length}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
              <span className="text-[11px] font-mono uppercase text-amber-700 font-semibold block">
                Awaiting Approval / Sync
              </span>
              <span className="text-2xl font-display font-extrabold text-amber-700 block mt-1">
                {logs.filter((l) => l.status === "pending").length + nasStatus.pendingSyncQueue}
              </span>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative sm:col-span-2">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search recipient email, ticket reference, attendee name..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 transition-colors"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
              >
                <option value="all">All Channel Streams</option>
                <option value="visitor pass">Visitor Passes</option>
                <option value="project exhibit">Project Exhibits</option>
                <option value="esports squad">Esports Squads</option>
              </select>
            </div>
          </div>

          {/* Dispatch Table */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-mono tracking-wider text-[11px]">
                    <th className="py-3 px-4 font-semibold">Reference</th>
                    <th className="py-3 px-4 font-semibold">Recipient Email</th>
                    <th className="py-3 px-4 font-semibold">Channel Type</th>
                    <th className="py-3 px-4 font-semibold">Attendee / Team</th>
                    <th className="py-3 px-4 font-semibold">Delivery Status</th>
                    <th className="py-3 px-4 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 font-mono">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                        Loading email records...
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        No records match current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((item) => (
                      <tr key={`${item.type}-${item.id}`} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                          {item.ref}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-800">
                          <div>{item.recipient}</div>
                          <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                            Sender: {item.sender || "animationthenationalcollege@gmail.com"}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                            {item.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-900 truncate max-w-[200px]">
                          <div>{item.source}</div>
                          {item.sentAt && (
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {new Date(item.sentAt).toLocaleString("en-IN", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                item.status === "sent"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : item.status === "failed"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {item.status === "sent" ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                              <span className="uppercase">
                                {item.status === "sent"
                                  ? "sent"
                                  : item.status === "failed"
                                  ? "failed"
                                  : EMAIL_UNAVAILABLE_MESSAGE}
                              </span>
                            </span>
                          </div>
                          {item.errorMessage && (
                            <div className="text-[10px] text-rose-600 mt-0.5 max-w-[220px] truncate" title={item.errorMessage}>
                              {item.errorMessage}
                            </div>
                          )}
                          {item.httpStatusCode && (
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              HTTP {item.httpStatusCode} · {item.channel || "pipeline"}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {canResend && (
                            <button
                              type="button"
                              onClick={() => handleResend(item)}
                              disabled={resendingId === item.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Send size={11} />
                              <span>{resendingId === item.id ? "Sending..." : "Resend Pass"}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COMPOSE EMAIL */}
      {activeTab === "compose" && canCompose && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-900">CRM Email Dispatch</div>
                <div className="text-[11px] text-slate-500">
                  {EMAIL_DELIVERY_ENABLED
                    ? "Dispatches through the configured Supabase Edge Function."
                    : EMAIL_UNAVAILABLE_MESSAGE}
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase ${
                  EMAIL_DELIVERY_ENABLED
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {EMAIL_DELIVERY_ENABLED ? "Active" : "Unavailable"}
              </span>
            </div>

            {/* Template + Test Email Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Load Official Template
                </label>
                <select
                  onChange={(e) => {
                    const tpl = CRM_EMAIL_TEMPLATES.find((t) => t.id === e.target.value);
                    if (tpl) {
                      setSubject(tpl.subject);
                      setBodyHtml(tpl.bodyHtml);
                    }
                  }}
                  className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900"
                >
                  {CRM_EMAIL_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  onClick={handlePrefillTestEmail}
                  className="h-9 px-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  Load Diagnostic Test Email
                </button>
              </div>
            </div>

            {/* Recipient Fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">To Recipient</label>
                <input
                  type="email"
                  list="crm-recipient-suggestions"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="attendee@college.edu"
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-500"
                />
                <datalist id="crm-recipient-suggestions">
                  {suggestions.map((s) => (
                    <option key={s.email} value={s.email}>
                      {s.name} ({s.type} · {s.ref})
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">CC (Optional)</label>
                  <input
                    type="text"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="comma-separated emails"
                    className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">BCC (Optional)</label>
                  <input
                    type="text"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="comma-separated emails"
                    className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold uppercase text-slate-700">Message HTML Body</label>
                  <button
                    type="button"
                    onClick={() => setShowPreview((p) => !p)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 cursor-pointer"
                  >
                    <Eye size={13} />
                    <span>{showPreview ? "Edit HTML" : "Preview Rendered Email"}</span>
                  </button>
                </div>

                {showPreview ? (
                  <div
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50 min-h-[260px] overflow-auto"
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                  />
                ) : (
                  <textarea
                    rows={12}
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:border-blue-500"
                  />
                )}
              </div>

              {/* PDF Attachment Upload */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer">
                  <Paperclip size={13} />
                  <span>Attach PDF / Document</span>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileAttach} className="hidden" />
                </label>

                {canSend ? (
                  <button
                    type="button"
                    onClick={handleRequestSend}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs cursor-pointer"
                  >
                    <Send size={13} />
                    <span>Review & Send Email</span>
                  </button>
                ) : (
                  <span className="text-xs text-amber-700 font-semibold">
                    Draft-only mode (requires email_centre:send permission to dispatch)
                  </span>
                )}
              </div>

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {attachments.map((att, idx) => (
                    <span
                      key={`${att.filename}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs font-mono text-blue-900"
                    >
                      <FileText size={12} />
                      <span>{att.filename}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-blue-700 hover:text-rose-700 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Recipient Directory */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3 h-fit">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 m-0">
              Recent Registrants ({suggestions.length})
            </h3>
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {suggestions.slice(0, 25).map((s) => (
                <button
                  key={s.email}
                  type="button"
                  onClick={() => setRecipient(s.email)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200/80 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 truncate">{s.name}</span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                      {s.type}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-blue-700 truncate mt-0.5">{s.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CRM EMAIL HISTORY */}
      {activeTab === "history" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-display font-bold text-slate-900 m-0">
                CRM Email Dispatch Log ({historyItems.length})
              </h2>
              <button
                type="button"
                onClick={loadHistory}
                disabled={loadingHistory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <RefreshCw size={12} className={loadingHistory ? "animate-spin" : ""} />
                <span>Refresh</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-mono text-[11px]">
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Provider / Message ID</th>
                    <th className="py-3 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-500">
                        No CRM email history recorded yet.
                      </td>
                    </tr>
                  ) : (
                    historyItems.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-slate-900">{h.recipient}</td>
                        <td className="py-3 px-4 font-medium text-slate-800 max-w-[260px] truncate">{h.subject}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                              h.status === "sent"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : h.status === "failed"
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {h.status}
                          </span>
                          {h.error_message && (
                            <div className="text-[10px] text-rose-600 mt-0.5 max-w-[240px] truncate">
                              {h.error_message}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {h.gmail_message_id || "—"}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(h.sent_at || h.created_at).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DELIVERY DIAGNOSTICS */}
      {activeTab === "diagnostics" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={runDiagnostics}
              disabled={checkingDiagnostics}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw size={13} className={checkingDiagnostics ? "animate-spin" : ""} />
              <span>Re-run Delivery Diagnostics</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase text-slate-500">
                  Edge Function: send-crm-email
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                    deliveryStatus?.ok
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {deliveryStatus?.ok ? "ACTIVE" : "UNAVAILABLE"}
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {deliveryStatus?.ok
                  ? `Active sender: ${deliveryStatus.senderEmail}`
                  : deliveryStatus?.message || deliveryStatus?.error || EMAIL_UNAVAILABLE_MESSAGE}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase text-slate-500">
                  Edge Function: send-registration-confirmation
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                    regConfirmHealth?.ok
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {regConfirmHealth?.ok ? "ACTIVE" : "UNAVAILABLE"}
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {regConfirmHealth?.detail || EMAIL_UNAVAILABLE_MESSAGE}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Dialog Before Sending CRM Email */}
      {confirmSendOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !sendingEmail && setConfirmSendOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-display font-black text-slate-900 m-0">
              Confirm Email Dispatch
            </h3>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div>
                <span className="text-slate-500">From:</span>{" "}
                <strong className="font-mono text-slate-900">
                  animationthenationalcollege@gmail.com
                </strong>
              </div>
              <div>
                <span className="text-slate-500">To:</span>{" "}
                <strong className="font-mono text-blue-700">{recipient}</strong>
              </div>
              {cc.trim() && (
                <div>
                  <span className="text-slate-500">CC:</span> <span className="font-mono">{cc}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500">Subject:</span> <strong>{subject}</strong>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>{" "}
                <span className="font-mono">
                  {EMAIL_DELIVERY_ENABLED ? "Supabase Edge Function" : EMAIL_UNAVAILABLE_MESSAGE}
                </span>
              </div>
              {attachments.length > 0 && (
                <div>
                  <span className="text-slate-500">Attachments:</span>{" "}
                  <span>{attachments.map((a) => a.filename).join(", ")}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={sendingEmail}
                onClick={() => setConfirmSendOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingEmail}
                onClick={handleConfirmSend}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <Check size={13} />
                <span>{sendingEmail ? "Sending..." : "Confirm & Send Now"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
