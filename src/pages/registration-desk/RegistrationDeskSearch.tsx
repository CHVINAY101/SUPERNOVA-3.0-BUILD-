import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { buildVisitorDisplaySubtitle } from "@/lib/visitorCategories";
import { issueTicketForRegistration } from "@/lib/ticketClient";
import { buildTicketQrContent, downloadTicketPdfFile } from "@/lib/ticketPdfService";
import { TicketPassModal, type TicketPassModalProps } from "@/components/TicketPassModal";
import { formatIstTimestamp } from "@/lib/registrationDesk";
import { isValidPhone } from "@/lib/validation";
import type { TicketRecord } from "@/types/database";
import {
  AlertCircle,
  Clock,
  Download,
  Printer,
  QrCode,
  RefreshCw,
  Search,
} from "lucide-react";

interface VisitorSearchRow {
  id: string;
  registration_ref: string;
  full_name: string;
  email: string;
  phone: string | null;
  institution: string | null;
  visitor_category: string;
  student_class: string | null;
  designation: string | null;
  days_attending: string | null;
  registration_source?: string | null;
  created_at: string;
}

interface EsportsSearchRow {
  id: string;
  registration_ref: string;
  team_name: string;
  captain_name: string;
  email: string;
  phone: string;
  institution: string | null;
  status: string;
  submitted_at: string;
  archived_at?: string | null;
  admin_notes?: string | null;
  games?: { title: string } | Array<{ title: string }> | null;
  players?: Array<{
    id: string;
    player_name: string;
    gamer_tag: string | null;
    institution_type?: string | null;
    institution_name?: string | null;
    course_or_class?: string | null;
    current_year_or_class?: string | null;
  }>;
}

type SearchFilterTab = "all" | "visitor" | "esports";

interface PrintTarget {
  ticketRef: string;
  qrToken?: string;
  displayName: string;
  subtitle: string;
  institution?: string | null;
  registrationRef: string;
  daysAttending: string;
}

export default function RegistrationDeskSearch() {
  const { hasPermission } = useAuth();
  const canViewVisitors = hasPermission("visitor:view");
  const canViewEsports = hasPermission("esports:view");
  const canViewTickets = hasPermission(["tickets:view", "tickets:manage"]);
  const canManageTickets = hasPermission("tickets:manage");
  const canEditVisitor = hasPermission("visitor:edit");

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchFilterTab>("all");

  const [visitors, setVisitors] = useState<VisitorSearchRow[]>([]);
  const [esports, setEsports] = useState<EsportsSearchRow[]>([]);
  const [ticketsByKey, setTicketsByKey] = useState<Record<string, TicketRecord>>({});

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [modalProps, setModalProps] = useState<Omit<TicketPassModalProps, "isOpen" | "onClose"> | null>(null);
  const [printTarget, setPrintTarget] = useState<PrintTarget | null>(null);
  const [printQrUrl, setPrintQrUrl] = useState("");

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [visRes, espRes, tktRes] = await Promise.all([
        supabase
          .from("visitor_registrations")
          .select(
            "id, registration_ref, full_name, email, phone, institution, visitor_category, student_class, designation, days_attending, registration_source, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("registrations")
          .select(
            "id, registration_ref, team_name, captain_name, email, phone, institution, status, submitted_at, archived_at, admin_notes, games(title), players(id, player_name, gamer_tag, institution_type, institution_name, course_or_class, current_year_or_class)"
          )
          .order("submitted_at", { ascending: false })
          .limit(300),
        supabase
          .from("tickets")
          .select("*")
          .order("issued_at", { ascending: false })
          .limit(600),
      ]);

      if (visRes.error && espRes.error) {
        throw visRes.error;
      }

      const visList = Array.isArray(visRes.data) ? (visRes.data as unknown as VisitorSearchRow[]) : [];
      const espList = (Array.isArray(espRes.data) ? (espRes.data as unknown as EsportsSearchRow[]) : []).filter(
        (r) =>
          !r.archived_at &&
          !(typeof r.admin_notes === "string" && r.admin_notes.includes("[ARCHIVED"))
      );
      const tktList = Array.isArray(tktRes.data) ? (tktRes.data as TicketRecord[]) : [];

      const map: Record<string, TicketRecord> = {};
      for (const t of tktList) {
        const key = `${t.registration_category}:${t.registration_id}`;
        if (!map[key]) map[key] = t;
      }

      setVisitors(visList);
      setEsports(espList);
      setTicketsByKey(map);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to load registration search directory.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredVisitors = useMemo(() => {
    if (tab === "esports") return [];
    if (!normalizedQuery) return visitors.slice(0, 40);
    return visitors.filter((v) => {
      const tkt = ticketsByKey[`visitor:${v.id}`];
      const hay = [
        v.registration_ref,
        tkt?.ticket_ref,
        v.full_name,
        v.email,
        v.phone,
        v.institution,
        v.visitor_category,
        v.student_class,
        v.designation,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [tab, visitors, ticketsByKey, normalizedQuery]);

  const filteredEsports = useMemo(() => {
    if (tab === "visitor") return [];
    if (!normalizedQuery) return esports.slice(0, 40);
    return esports.filter((e) => {
      const tkt = ticketsByKey[`esports:${e.id}`];
      const playerHay = (e.players || [])
        .map((p) => `${p.player_name} ${p.gamer_tag || ""} ${p.institution_name || ""}`)
        .join(" ");
      const hay = [
        e.registration_ref,
        tkt?.ticket_ref,
        e.team_name,
        e.captain_name,
        e.email,
        e.phone,
        e.institution,
        Array.isArray(e.games) ? e.games[0]?.title : e.games?.title,
        playerHay,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [tab, esports, ticketsByKey, normalizedQuery]);

  const resolveOrIssueVisitorTicket = async (v: VisitorSearchRow): Promise<TicketRecord | null> => {
    const existing = ticketsByKey[`visitor:${v.id}`];
    if (existing) return existing;
    if (!canManageTickets) return null;
    const res = await issueTicketForRegistration("visitor", v.id);
    if (res.ok && res.ticket) {
      setTicketsByKey((prev) => ({
        ...prev,
        [`visitor:${v.id}`]: res.ticket!,
      }));
      return res.ticket;
    }
    return null;
  };

  const handleOpenVisitorPass = async (v: VisitorSearchRow) => {
    setBusyId(v.id);
    try {
      const ticket = await resolveOrIssueVisitorTicket(v);
      const subtitle = buildVisitorDisplaySubtitle({
        visitorCategory: v.visitor_category,
        studentClass: v.student_class,
        designation: v.designation,
      });
      setModalProps({
        ticketRef: ticket?.ticket_ref || v.registration_ref,
        qrToken: ticket?.qr_token,
        registrationCategory: "visitor",
        displayName: v.full_name,
        subtitle,
        institution: v.institution,
        email: v.email,
        phone: v.phone || undefined,
        daysAttending: v.days_attending || "Both",
        issuedAt: ticket?.issued_at || v.created_at,
        checkedInAt: ticket?.checked_in_at || null,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveVisitorPhone = async (v: VisitorSearchRow) => {
    if (!canEditVisitor) return;
    const trimmed = phoneDraft.trim();
    if (!isValidPhone(trimmed)) {
      setPhoneError("Enter a valid 10–15 digit contact mobile number.");
      return;
    }
    setBusyId(v.id);
    setPhoneError(null);
    try {
      const { error: updateErr } = await supabase
        .from("visitor_registrations")
        .update({ phone: trimmed })
        .eq("id", v.id);
      if (updateErr) throw updateErr;

      setVisitors((prev) => prev.map((row) => (row.id === v.id ? { ...row, phone: trimmed } : row)));
      setEditingPhoneId(null);
      setPhoneDraft("");
    } catch (err: any) {
      setPhoneError(err?.message || "Failed to update contact mobile number.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadVisitorPdf = async (v: VisitorSearchRow) => {
    setBusyId(v.id);
    try {
      const ticket = await resolveOrIssueVisitorTicket(v);
      const subtitle = buildVisitorDisplaySubtitle({
        visitorCategory: v.visitor_category,
        studentClass: v.student_class,
        designation: v.designation,
      });
      await downloadTicketPdfFile({
        ticketRef: ticket?.ticket_ref || v.registration_ref,
        qrToken: ticket?.qr_token,
        recipientName: v.full_name,
        category: subtitle,
        email: v.email,
        institution: v.institution || undefined,
        registrationType: "visitor",
        daysAttending: v.days_attending || "Both",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handlePrintPass = async (target: PrintTarget) => {
    const qrPayload = buildTicketQrContent(target.ticketRef, target.qrToken);
    const dataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 240,
      color: { dark: "#0B1120", light: "#FFFFFF" },
    });
    setPrintQrUrl(dataUrl);
    setPrintTarget(target);
    window.setTimeout(() => {
      window.print();
    }, 120);
  };

  const handlePrintVisitor = async (v: VisitorSearchRow) => {
    setBusyId(v.id);
    try {
      const ticket = await resolveOrIssueVisitorTicket(v);
      await handlePrintPass({
        ticketRef: ticket?.ticket_ref || v.registration_ref,
        qrToken: ticket?.qr_token,
        displayName: v.full_name,
        subtitle: buildVisitorDisplaySubtitle({
          visitorCategory: v.visitor_category,
          studentClass: v.student_class,
          designation: v.designation,
        }),
        institution: v.institution,
        registrationRef: v.registration_ref,
        daysAttending: v.days_attending || "Both",
      });
    } finally {
      setBusyId(null);
    }
  };

  const getGameTitle = (e: EsportsSearchRow): string => {
    if (Array.isArray(e.games)) return e.games[0]?.title || "Esports";
    return e.games?.title || "Esports";
  };

  const handleOpenConfirmedEsportsPass = (e: EsportsSearchRow, ticket: TicketRecord) => {
    const gameTitle = getGameTitle(e);
    setModalProps({
      ticketRef: ticket.ticket_ref,
      qrToken: ticket.qr_token,
      registrationCategory: "esports",
      displayName: e.captain_name,
      subtitle: `${gameTitle} · Squad Pass`,
      institution: e.institution,
      email: e.email,
      phone: e.phone,
      teamName: e.team_name,
      projectTitle: gameTitle,
      daysAttending: "Both",
      issuedAt: ticket.issued_at,
      checkedInAt: ticket.checked_in_at || null,
    });
  };

  const handleDownloadConfirmedEsportsPdf = async (e: EsportsSearchRow, ticket: TicketRecord) => {
    const gameTitle = getGameTitle(e);
    setBusyId(e.id);
    try {
      await downloadTicketPdfFile({
        ticketRef: ticket.ticket_ref,
        qrToken: ticket.qr_token,
        recipientName: e.captain_name,
        category: `${gameTitle} · Squad Pass`,
        email: e.email,
        phone: e.phone,
        institution: e.institution || undefined,
        registrationType: "esports_team",
        teamName: e.team_name,
        projectTitle: gameTitle,
        daysAttending: "Both",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Screen Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 print:hidden">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight m-0">
            Search Registrations
          </h1>
          <p className="text-sm text-slate-600 mt-1 mb-0">
            Find visitor passes or check esports approval status.
          </p>
        </div>
        <button
          type="button"
          onClick={loadDirectory}
          disabled={loading}
          className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-60 shrink-0"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 print:hidden">
        <div className="relative">
          <Search size={18} className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, team, ref, email, or phone..."
            aria-label="Search registrations"
            className="w-full h-12 pl-10 pr-4 rounded-xl border border-slate-300 bg-white text-base text-slate-900 focus:outline-hidden focus:border-blue-600"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1">
          {(
            [
              { id: "all", label: "All" },
              { id: "visitor", label: `Visitors (${visitors.length})` },
              { id: "esports", label: `Esports (${esports.length})` },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTab(opt.id)}
              className={`min-h-[40px] flex-1 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                tab === opt.id
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Visitors Results */}
      {canViewVisitors && tab !== "esports" && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden print:hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 m-0">
              General Visitor Passes
            </h2>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {filteredVisitors.length} shown
            </span>
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-slate-500">Loading visitors...</div>
          ) : filteredVisitors.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No matching visitor passes found.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredVisitors.map((v) => {
                const tkt = ticketsByKey[`visitor:${v.id}`];
                const isBusy = busyId === v.id;
                return (
                  <div
                    key={v.id}
                    className="p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm font-bold text-slate-900">{v.full_name}</strong>
                        <span className="text-xs font-mono text-slate-600">
                          {tkt?.ticket_ref || v.registration_ref}
                        </span>
                        {tkt?.checked_in_at && (
                          <span className="text-xs font-semibold text-amber-700">· Checked In</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 m-0">
                        {buildVisitorDisplaySubtitle({
                          visitorCategory: v.visitor_category,
                          studentClass: v.student_class,
                          designation: v.designation,
                        })}
                        {v.institution ? ` · ${v.institution}` : ""}
                      </p>
                      <p className="text-xs font-mono text-slate-500 m-0 break-all">
                        {v.email}
                        {v.phone ? ` · ${v.phone}` : " · No mobile on file"} · {formatIstTimestamp(v.created_at)}
                      </p>

                      {canEditVisitor && (
                        editingPhoneId === v.id ? (
                          <div className="pt-1.5 flex flex-wrap items-center gap-2">
                            <input
                              type="tel"
                              inputMode="tel"
                              value={phoneDraft}
                              onChange={(e) => {
                                setPhoneDraft(e.target.value);
                                setPhoneError(null);
                              }}
                              placeholder="10-digit mobile number"
                              aria-label="Contact mobile number"
                              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-900 w-44"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSaveVisitorPhone(v)}
                              className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              Save Mobile
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPhoneId(null);
                                setPhoneError(null);
                              }}
                              className="h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-600 cursor-pointer"
                            >
                              Cancel
                            </button>
                            {phoneError && (
                              <p role="alert" className="w-full text-xs text-rose-600 m-0">
                                {phoneError}
                              </p>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPhoneId(v.id);
                              setPhoneDraft(v.phone || "");
                              setPhoneError(null);
                            }}
                            className="text-xs font-semibold text-blue-700 hover:underline bg-transparent border-0 p-0 cursor-pointer mt-0.5"
                          >
                            {v.phone ? "Update Mobile Number" : "+ Add Missing Mobile Number"}
                          </button>
                        )
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {(canViewTickets && (tkt || canManageTickets)) ? (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleOpenVisitorPass(v)}
                            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                          >
                            <QrCode size={14} />
                            <span>View QR</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDownloadVisitorPdf(v)}
                            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-60"
                          >
                            <Download size={14} />
                            <span>PDF</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handlePrintVisitor(v)}
                            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-60"
                          >
                            <Printer size={14} />
                            <span>Print</span>
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500">Ticket access restricted</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Esports Results */}
      {canViewEsports && tab !== "visitor" && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden print:hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 m-0">
              Esports Squad Applications
            </h2>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {filteredEsports.length} shown
            </span>
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-slate-500">Loading squads...</div>
          ) : filteredEsports.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No matching esports applications found.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredEsports.map((e) => {
                const confirmedTicket =
                  e.status === "confirmed" ? ticketsByKey[`esports:${e.id}`] : undefined;
                const statusColor =
                  e.status === "confirmed"
                    ? "text-emerald-700"
                    : e.status === "pending"
                    ? "text-amber-700"
                    : "text-rose-700";

                return (
                  <div
                    key={e.id}
                    className="p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm font-bold text-slate-900">{e.team_name}</strong>
                        <span className="text-xs font-mono text-slate-600">{e.registration_ref}</span>
                        <span className="text-xs font-semibold text-indigo-700">
                          · {getGameTitle(e)}
                        </span>
                        <span className={`text-xs font-semibold capitalize ${statusColor}`}>
                          · {e.status === "confirmed" ? "Approved" : e.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 m-0">
                        Captain: {e.captain_name}
                        {e.institution ? ` · ${e.institution}` : ""} · {(e.players || []).length} players
                      </p>
                      <p className="text-xs font-mono text-slate-500 m-0 break-all">
                        {e.email} · {e.phone} · {formatIstTimestamp(e.submitted_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {confirmedTicket && canViewTickets ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenConfirmedEsportsPass(e, confirmedTicket)}
                            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                          >
                            <QrCode size={14} />
                            <span>View QR</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyId === e.id}
                            onClick={() => handleDownloadConfirmedEsportsPdf(e, confirmedTicket)}
                            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            <Download size={14} />
                            <span>PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handlePrintPass({
                                ticketRef: confirmedTicket.ticket_ref,
                                qrToken: confirmedTicket.qr_token,
                                displayName: `${e.team_name} (${e.captain_name})`,
                                subtitle: `${getGameTitle(e)} · Confirmed Squad Pass`,
                                institution: e.institution,
                                registrationRef: e.registration_ref,
                                daysAttending: "Both",
                              })
                            }
                            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            <Printer size={14} />
                            <span>Print</span>
                          </button>
                        </>
                      ) : confirmedTicket ? (
                        <span className="text-xs text-slate-500">Ticket access restricted</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <Clock size={14} className="text-amber-600" />
                          <span>
                            {e.status === "pending"
                              ? "Awaiting Coordinator Approval — Pass Not Issued"
                              : e.status === "confirmed"
                              ? "Approved (Pass Pending Issuance)"
                              : `No Pass Issued (${e.status})`}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* QR Pass Modal */}
      {modalProps && (
        <TicketPassModal
          isOpen={Boolean(modalProps)}
          onClose={() => setModalProps(null)}
          {...modalProps}
        />
      )}

      {/* Print-Only Pass Sheet */}
      {printTarget && (
        <section
          aria-label="Printable Pass Sheet"
          className="hidden print:block p-8 border-2 border-slate-900 rounded-xl bg-white text-slate-900 max-w-xl mx-auto"
        >
          <div className="border-b-2 border-slate-900 pb-4 mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest m-0">
                SUPERNOVA 3.0 · OFFICIAL ENTRY PASS
              </p>
              <h2 className="text-2xl font-bold m-0 mt-1">{printTarget.displayName}</h2>
              <p className="text-sm m-0 mt-0.5">{printTarget.subtitle}</p>
            </div>
            <div className="text-right font-mono">
              <p className="text-xs uppercase m-0">Ticket Ref</p>
              <p className="text-lg font-bold m-0">{printTarget.ticketRef}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-6">
            <div className="space-y-2 text-sm">
              <p className="m-0">
                <strong>Venue:</strong> The National College, Basavanagudi, Bengaluru – 04
              </p>
              <p className="m-0">
                <strong>Dates:</strong> 20–21 November 2026 ({printTarget.daysAttending})
              </p>
              {printTarget.institution && (
                <p className="m-0">
                  <strong>Institution:</strong> {printTarget.institution}
                </p>
              )}
              <p className="m-0">
                <strong>Registration Ref:</strong> {printTarget.registrationRef}
              </p>
            </div>
            {printQrUrl && (
              <div className="text-center shrink-0">
                <img src={printQrUrl} alt={printTarget.ticketRef} className="w-36 h-36 border border-slate-300" />
                <p className="text-[10px] font-mono mt-1 m-0">SCAN AT GATE ENTRY</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
