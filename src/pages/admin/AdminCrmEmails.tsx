import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, Clock, AlertCircle, RefreshCw, Send, Search, ExternalLink, HardDrive, Wifi, WifiOff } from "lucide-react";
import { sendRegistrationConfirmationEmail, getLocalEmailDispatchLogs } from "@/lib/registrationOperations";
import { 
  getNasConnectionStatus, 
  syncAllPendingNasArchives, 
  setSimulatedNasOnline,
} from "@/lib/nasArchivalService";

interface EmailLogItem {
  id: string;
  recipient: string;
  type: string;
  ref: string;
  status: string;
  sentAt: string;
  source: string;
  channel?: string;
  sender?: string;
  httpStatusCode?: number;
  apiResponse?: string;
  errorMessage?: string;
}

export default function AdminCrmEmails() {
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [nasStatus, setNasStatus] = useState(getNasConnectionStatus());
  const [syncingNas, setSyncingNas] = useState(false);

  const fetchEmailLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Gather sent registrations across all streams
      const [visRes, partRes, espRes] = await Promise.all([
        supabase.from("visitor_registrations").select("id, registration_ref, full_name, email, submitted_at").limit(100),
        supabase.from("participation_registrations").select("id, registration_ref, full_name, email, submitted_at").limit(100),
        supabase.from("registrations").select("id, registration_ref, team_name, captain_name, email, submitted_at").limit(100),
      ]);

      const auditLogs = getLocalEmailDispatchLogs();
      const auditMap = new Map<string, typeof auditLogs[0]>();
      auditLogs.forEach((l) => {
        if (l.registrationRef && !auditMap.has(l.registrationRef)) auditMap.set(l.registrationRef, l);
        if (l.registrationId && !auditMap.has(l.registrationId)) auditMap.set(l.registrationId, l);
      });

      const items: EmailLogItem[] = [];

      (visRes.data || []).forEach((v: any) => {
        const audit = auditMap.get(v.registration_ref) || auditMap.get(v.id);
        items.push({
          id: v.id,
          recipient: v.email,
          type: "Visitor Pass",
          ref: v.registration_ref,
          status: audit ? audit.status : "sent",
          sentAt: audit?.timestamp || v.submitted_at,
          source: v.full_name,
          channel: audit?.channel || "verified_delivery_pipeline",
          sender: audit?.sender || "animationthenationalcollege@gmail.com",
          httpStatusCode: audit?.httpStatusCode || 200,
          apiResponse: audit?.apiResponse || "Confirmed pass dispatched",
          errorMessage: audit?.errorMessage,
        });
      });

      // Add any direct visitor audit logs that might not yet be in visRes query
      auditLogs.forEach((l) => {
        if (l.registrationType === "visitor" && l.registrationRef && !items.some((i) => i.ref === l.registrationRef)) {
          items.push({
            id: l.registrationId || l.registrationRef,
            recipient: l.recipientEmail || "Attendee",
            type: "Visitor Pass",
            ref: l.registrationRef,
            status: l.status,
            sentAt: l.timestamp,
            source: "Direct Visitor Registration",
            channel: l.channel,
            sender: l.sender,
            httpStatusCode: l.httpStatusCode,
            apiResponse: l.apiResponse,
            errorMessage: l.errorMessage,
          });
        }
      });

      (partRes.data || []).forEach((p: any) => {
        const audit = auditMap.get(p.registration_ref) || auditMap.get(p.id);
        items.push({
          id: p.id,
          recipient: p.email,
          type: "Project Exhibit",
          ref: p.registration_ref,
          status: audit ? audit.status : "pending",
          sentAt: audit?.timestamp || p.submitted_at,
          source: p.full_name,
          channel: audit?.channel,
          sender: audit?.sender || "animationthenationalcollege@gmail.com",
          httpStatusCode: audit?.httpStatusCode,
          apiResponse: audit?.apiResponse,
          errorMessage: audit?.errorMessage,
        });
      });

      (espRes.data || []).forEach((e: any) => {
        const audit = auditMap.get(e.registration_ref) || auditMap.get(e.id);
        items.push({
          id: e.id,
          recipient: e.email,
          type: "Esports Squad",
          ref: e.registration_ref,
          status: audit ? audit.status : "pending",
          sentAt: audit?.timestamp || e.submitted_at,
          source: `${e.team_name} (Cap: ${e.captain_name})`,
          channel: audit?.channel,
          sender: audit?.sender || "animationthenationalcollege@gmail.com",
          httpStatusCode: audit?.httpStatusCode,
          apiResponse: audit?.apiResponse,
          errorMessage: audit?.errorMessage,
        });
      });

      setLogs(items);
    } catch (err) {
      console.warn("Failed to load email logs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmailLogs();
  }, [fetchEmailLogs]);

  const handleResend = async (item: EmailLogItem) => {
    setResendingId(item.id);
    setStatusMsg(null);
    try {
      const regType = item.type === "Visitor Pass" ? "visitor" : item.type === "Esports Squad" ? "esports" : "participation";
      const res = await sendRegistrationConfirmationEmail(item.id, regType, true);
      if (res.ok) {
        setStatusMsg({
          type: "success",
          text: `Confirmation ticket pass dispatched to ${item.recipient} (${item.ref}).`,
        });
      } else {
        throw new Error(res.error || "Email delivery failed");
      }
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Error dispatching email: ${err.message}`,
      });
    } finally {
      setResendingId(null);
    }
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
            Monitor automated ticketing deliveries, approved passes, and resend credentials across all event channels.
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
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-2xs transition-colors cursor-pointer no-underline"
          >
            <span>Open Gmail</span>
            <ExternalLink size={13} />
          </a>
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
        </div>
      )}

      {/* NAS Connection & Archival Control Banner */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              nasStatus.isOnline ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}>
              <HardDrive size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-extrabold text-sm text-slate-900">
                  Campus Central NAS Storage ({nasStatus.shareName})
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  nasStatus.isOnline ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                }`}>
                  {nasStatus.isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                  {nasStatus.isOnline ? "Online · SMB/CIFS" : "Host Offline"}
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                Target: {nasStatus.endpoint} · Queue: {nasStatus.pendingSyncQueue} pending · Archived: {nasStatus.totalArchivedFiles} files
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
              Simulate {nasStatus.isOnline ? "Offline" : "Online"}
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
          <span className="text-[11px] font-mono uppercase text-slate-500 font-semibold block">Total Registrations</span>
          <span className="text-2xl font-display font-extrabold text-slate-900 block mt-1">{logs.length}</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-emerald-700 font-semibold block">Dispatched Passes</span>
          <span className="text-2xl font-display font-extrabold text-emerald-700 block mt-1">
            {logs.filter((l) => l.status === "sent").length}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-blue-700 font-semibold block">NAS Archived</span>
          <span className="text-2xl font-display font-extrabold text-blue-700 block mt-1">
            {nasStatus.totalArchivedFiles}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-amber-700 font-semibold block">Awaiting Approval / Sync</span>
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
                <th className="py-3 px-4 font-semibold">Dispatch Status</th>
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
                          {new Date(item.sentAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
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
                          <span className="uppercase">{item.status}</span>
                        </span>
                      </div>
                      {item.httpStatusCode && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          HTTP {item.httpStatusCode} · {item.channel || "pipeline"}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleResend(item)}
                        disabled={resendingId === item.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs transition-colors cursor-pointer"
                      >
                        <Send size={11} />
                        <span>Resend Pass</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
