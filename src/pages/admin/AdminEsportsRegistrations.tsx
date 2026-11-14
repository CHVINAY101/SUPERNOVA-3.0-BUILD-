import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { getOfficialTeamSize } from "@/utils/esportsRules";
import {
  archiveRegistrationRecord,
  restoreRegistrationRecord,
  isRegistrationArchived,
  markRegistrationArchivedLocal,
  sendRegistrationConfirmationEmail,
} from "@/lib/registrationOperations";
import { useAuth } from "@/lib/auth";
import { AdminArchiveConfirmModal } from "@/components/admin/AdminArchiveConfirmModal";
import { AdminStatusBadge } from "@/components/admin/AdminBadge";
import { generateTicketPdf, downloadTicketPdfFile } from "@/lib/ticketPdfService";
import { archiveTicketToNas, getLocalNasArchives } from "@/lib/nasArchivalService";
import { fetchTicketByRegistration, issueTicketForRegistration } from "@/lib/ticketClient";
import {
  validateRegistrationStatusUpdate,
  validateSelectionUpdate,
} from "@/lib/tournamentEngine";
import type { Registration, RegistrationStatus, TeamStatusHistoryEntry, TicketRecord, TournamentSelectionStatus } from "@/types/database";
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Download,
  X,
  ShieldAlert,
  RefreshCw,
  Archive,
  RotateCcw,
  Eye,
  Trash2,
  Check,
  Ban,
  Clock,
  Phone,
  Mail,
  Monitor,
  Smartphone,
  Trophy,
  History,
} from "lucide-react";

export interface EsportsRegistrationItem {
  id: string;
  registration_ref: string;
  team_name: string;
  captain_name: string;
  email: string;
  phone: string;
  institution: string | null;
  status: string;
  selection_status?: TournamentSelectionStatus;
  selection_reason?: string | null;
  seed_number?: number | null;
  email_status?: string | null;
  admin_notes?: string | null;
  submitted_at: string;
  archived_at?: string | null;
  games: {
    id: string;
    title: string;
    team_size: number | null;
  } | null;
  players: {
    id: string;
    player_name: string;
    gamer_tag: string | null;
  }[];
}

export interface ProcessedEsportsRegistration extends EsportsRegistrationItem {
  gameTitle: string;
  registeredCount: number;
  expectedCount: number;
  isRosterValid: boolean;
  isFlagged: boolean;
  rosterSpecText: string;
  isArchived: boolean;
  effectiveSelectionStatus: TournamentSelectionStatus;
}

const REGISTRATION_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed (Approved)" },
  { value: "correction_requested", label: "Correction Requested" },
  { value: "declined", label: "Declined / Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

const SELECTION_BADGE_MAP: Record<TournamentSelectionStatus, { label: string; tone: string }> = {
  awaiting_selection: { label: "Awaiting Selection", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  selected: { label: "Selected for Bracket", tone: "bg-indigo-50 text-indigo-800 border-indigo-200" },
  not_selected: { label: "Not Selected", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  waitlisted: { label: "Waitlisted", tone: "bg-cyan-50 text-cyan-800 border-cyan-200" },
  disqualified: { label: "Disqualified", tone: "bg-rose-50 text-rose-800 border-rose-200" },
};

export default function AdminEsportsRegistrations() {
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission("esports:edit");
  const canApprove = hasPermission("esports:approve");
  const canReject = hasPermission("esports:reject");
  const canSelectTeams = hasPermission("tournament:select_teams");
  const canExport = hasPermission("esports:export");
  const canResend = hasPermission("email_centre:resend");

  const [registrations, setRegistrations] = useState<EsportsRegistrationItem[]>([]);
  const [historyByReg, setHistoryByReg] = useState<Record<string, TeamStatusHistoryEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectionFilter, setSelectionFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [rosterHealthFilter, setRosterHealthFilter] = useState<"all" | "valid" | "flagged">("all");
  const [viewScope, setViewScope] = useState<"active" | "archived" | "all">("active");

  // Selected for Drawer
  const [selectedReg, setSelectedReg] = useState<ProcessedEsportsRegistration | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketRecord | null>(null);

  // Reason Modal for Reject / Correction / Disqualify / Withdrawn
  const [reasonModal, setReasonModal] = useState<{
    item: ProcessedEsportsRegistration;
    kind: "registration" | "selection";
    nextValue: string;
    label: string;
  } | null>(null);
  const [reasonText, setReasonText] = useState("");

  // Archive Target for Safe Modal
  const [archiveTarget, setArchiveTarget] = useState<ProcessedEsportsRegistration | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  // Operation state
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("registrations")
        .select(`
          *,
          games (
            id,
            title,
            team_size
          ),
          players (
            id,
            player_name,
            gamer_tag
          )
        `)
        .order("submitted_at", { ascending: false });

      if (error) {
        console.error("Failed to load esports registrations:", error);
      } else {
        setRegistrations((data as unknown as EsportsRegistrationItem[]) || []);
      }

      const { data: histData, error: histErr } = await supabase
        .from("team_status_history")
        .select("*")
        .order("created_at", { ascending: false });

      if (!histErr && Array.isArray(histData)) {
        const grouped: Record<string, TeamStatusHistoryEntry[]> = {};
        for (const h of histData as TeamStatusHistoryEntry[]) {
          grouped[h.registration_id] = grouped[h.registration_id] || [];
          grouped[h.registration_id].push(h);
        }
        setHistoryByReg(grouped);
      }
    } catch (err) {
      console.error("Error loading esports registrations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "registrations", onRefresh: fetchRegistrations },
      { table: "players", onRefresh: fetchRegistrations },
      { table: "games", onRefresh: fetchRegistrations },
      { table: "team_status_history", onRefresh: fetchRegistrations },
    ],
    "admin-esports-registrations"
  );

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  useEffect(() => {
    if (!selectedReg) {
      setSelectedTicket(null);
      return;
    }
    let active = true;
    fetchTicketByRegistration("esports", selectedReg.id).then((tkt) => {
      if (active) setSelectedTicket(tkt);
    });
    return () => {
      active = false;
    };
  }, [selectedReg]);

  const recordStatusHistory = async (
    registrationId: string,
    changeType: "registration_status" | "selection_status",
    previousValue: string | null,
    nextValue: string,
    reason?: string
  ) => {
    const entry: TeamStatusHistoryEntry = {
      id: `hist-${Date.now()}`,
      registration_id: registrationId,
      change_type: changeType,
      previous_value: previousValue,
      next_value: nextValue,
      reason: reason || null,
      changed_by: user?.id || null,
      changed_by_email: user?.email || "esports-admin@supernova.edu",
      created_at: new Date().toISOString(),
    };

    setHistoryByReg((prev) => ({
      ...prev,
      [registrationId]: [entry, ...(prev[registrationId] || [])],
    }));

    await supabase.from("team_status_history").insert({
      registration_id: registrationId,
      change_type: changeType,
      previous_value: previousValue,
      next_value: nextValue,
      reason: reason || null,
      changed_by: user?.id || null,
      changed_by_email: user?.email || "esports-admin@supernova.edu",
    });
  };

  // Update Status Handler
  const changeStatus = async (item: ProcessedEsportsRegistration, newStatus: string, reason?: string) => {
    const validation = validateRegistrationStatusUpdate({
      nextStatus: newStatus as RegistrationStatus,
      reason,
    });
    if (!validation.ok) {
      setStatusMessage({ type: "error", text: validation.error });
      return;
    }

    const shouldResetSelection =
      newStatus === "declined" || newStatus === "withdrawn" || newStatus === "correction_requested";

    setUpdatingId(item.id);
    setStatusMessage(null);
    try {
      const updatePayload: Record<string, any> = {
        status: newStatus,
      };
      if (shouldResetSelection) {
        updatePayload.selection_status = "not_selected";
        updatePayload.selection_reason = reason || `Registration ${newStatus}`;
      }
      if (reason) {
        updatePayload.admin_notes = `[${newStatus.toUpperCase()}] ${reason}${item.admin_notes ? `\n${item.admin_notes}` : ""}`;
      }

      const { error } = await supabase.from("registrations").update(updatePayload).eq("id", item.id);
      if (error) {
        // Fallback without extended selection_status column if migration not pushed
        const { error: baseErr } = await supabase
          .from("registrations")
          .update({
            status: newStatus,
            ...(updatePayload.admin_notes ? { admin_notes: updatePayload.admin_notes } : {}),
          })
          .eq("id", item.id);
        if (baseErr) throw baseErr;
      }

      await recordStatusHistory(item.id, "registration_status", item.status, newStatus, reason);

      let ticketNotice = "";
      let nextEmailStatus: string | undefined;
      if (newStatus === "confirmed") {
        const issuedRes = await issueTicketForRegistration("esports", item.id);
        const issuedTicket = issuedRes.ok ? issuedRes.ticket : null;
        if (issuedTicket) {
          setSelectedTicket(issuedTicket);
        }
        const teamTicketRef = issuedTicket?.ticket_ref || item.registration_ref;
        let pdfAttachments: { filename: string; base64Content: string; contentType: string }[] | undefined;

        try {
          const teamDoc = await generateTicketPdf({
            ticketRef: teamTicketRef,
            qrToken: issuedTicket?.qr_token,
            recipientName: item.captain_name,
            category: "Esports Squad",
            email: item.email,
            phone: item.phone,
            institution: item.institution || undefined,
            registrationType: "esports_team",
            teamName: item.team_name,
            projectTitle: item.gameTitle,
          });
          pdfAttachments = [
            {
              filename: teamDoc.fileName,
              base64Content: teamDoc.pdfBase64,
              contentType: "application/pdf",
            },
          ];

          await archiveTicketToNas(
            teamDoc,
            {
              ticketRef: teamTicketRef,
              qrToken: issuedTicket?.qr_token,
              recipientName: item.captain_name,
              category: "Esports Squad",
              email: item.email,
              phone: item.phone,
              institution: item.institution || undefined,
              registrationType: "esports_team",
              teamName: item.team_name,
              projectTitle: item.gameTitle,
            },
            item.id
          );

          const squadPlayers = item.players || [];
          for (let pIdx = 0; pIdx < squadPlayers.length; pIdx++) {
            const player = squadPlayers[pIdx];
            const playerTicketRef = `${item.registration_ref}-P${pIdx + 1}`;
            const playerDoc = await generateTicketPdf({
              ticketRef: playerTicketRef,
              qrToken: issuedTicket?.qr_token,
              recipientName: player.player_name,
              category: "Esports Player",
              email: item.email,
              phone: item.phone,
              institution: item.institution || undefined,
              registrationType: "esports_player",
              applicationRef: item.registration_ref,
              teamName: item.team_name,
              gamerTag: player.gamer_tag || undefined,
              playerSlot: pIdx + 1,
            });

            await archiveTicketToNas(
              playerDoc,
              {
                ticketRef: playerTicketRef,
                qrToken: issuedTicket?.qr_token,
                recipientName: player.player_name,
                category: "Esports Player",
                email: item.email,
                phone: item.phone,
                institution: item.institution || undefined,
                registrationType: "esports_player",
                applicationRef: item.registration_ref,
                teamName: item.team_name,
                gamerTag: player.gamer_tag || undefined,
                playerSlot: pIdx + 1,
              },
              item.id
            );
          }
        } catch (nasErr) {
          console.warn("Esports ticket generation / NAS archival notice:", nasErr);
        }

        ticketNotice = ` · Official team ticket issued (${teamTicketRef})`;

        // Best-effort email copy; ticket issuance never depends on email delivery
        try {
          const emailRes = await sendRegistrationConfirmationEmail(item.id, "esports", false, {
            recipientEmail: item.email,
            recipientName: item.captain_name,
            registrationRef: item.registration_ref,
            institution: item.institution || undefined,
            attachments: pdfAttachments,
          });
          const emailOk = Boolean(emailRes.ok && !emailRes.simulated);
          nextEmailStatus = emailOk ? "sent" : "failed";
          if (emailOk) {
            ticketNotice += " & emailed to captain.";
          }
        } catch {
          nextEmailStatus = "failed";
        }
      }

      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === item.id
            ? {
                ...r,
                status: newStatus,
                ...(shouldResetSelection ? { selection_status: "not_selected" } : {}),
                ...(nextEmailStatus ? { email_status: nextEmailStatus } : {}),
              }
            : r
        )
      );
      if (selectedReg && selectedReg.id === item.id) {
        setSelectedReg({
          ...selectedReg,
          status: newStatus,
          ...(shouldResetSelection
            ? { selection_status: "not_selected", effectiveSelectionStatus: "not_selected" }
            : {}),
          ...(nextEmailStatus ? { email_status: nextEmailStatus } : {}),
        });
      }
      setStatusMessage({
        type: "success",
        text: `Team "${item.team_name}" (${item.registration_ref}) status changed to ${newStatus}${ticketNotice}`,
      });
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Failed to update status: ${err.message || "Unknown error"}`,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const changeSelectionStatus = async (
    item: ProcessedEsportsRegistration,
    nextSelection: TournamentSelectionStatus,
    reason?: string
  ) => {
    if (!canSelectTeams) return;
    const validation = validateSelectionUpdate({
      team: item as unknown as Registration,
      nextSelection,
      reason,
    });
    if (!validation.ok) {
      setStatusMessage({ type: "error", text: validation.error });
      return;
    }

    setUpdatingId(item.id);
    setStatusMessage(null);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("registrations")
        .update({
          selection_status: nextSelection,
          selection_reason: reason || null,
          reviewed_by: user?.id || null,
          reviewed_at: nowIso,
        })
        .eq("id", item.id);

      if (error) throw error;

      await recordStatusHistory(
        item.id,
        "selection_status",
        item.effectiveSelectionStatus,
        nextSelection,
        reason
      );

      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === item.id ? { ...r, selection_status: nextSelection, selection_reason: reason || null } : r
        )
      );
      if (selectedReg && selectedReg.id === item.id) {
        setSelectedReg({
          ...selectedReg,
          selection_status: nextSelection,
          effectiveSelectionStatus: nextSelection,
          selection_reason: reason || null,
        });
      }

      setStatusMessage({
        type: "success",
        text: `Tournament selection for "${item.team_name}" updated to ${SELECTION_BADGE_MAP[nextSelection].label}.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Selection update failed (ensure 20261114 SQL migration is applied): ${err?.message || "Error"}`,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSeedUpdate = async (item: ProcessedEsportsRegistration, seedVal: number | null) => {
    if (!canSelectTeams) return;
    await supabase.from("registrations").update({ seed_number: seedVal }).eq("id", item.id);
    setRegistrations((prev) => prev.map((r) => (r.id === item.id ? { ...r, seed_number: seedVal } : r)));
    if (selectedReg && selectedReg.id === item.id) {
      setSelectedReg({ ...selectedReg, seed_number: seedVal });
    }
  };

  const handleResendEmail = async (item: ProcessedEsportsRegistration) => {
    if (!canResend || updatingId === item.id) return;
    setUpdatingId(item.id);
    setStatusMessage(null);
    const ticketRef = (item as any).captain_ticket_ref || item.registration_ref;
    try {
      let pdfAttachments: { filename: string; base64Content: string; contentType: string }[] | undefined;
      try {
        const teamDoc = await generateTicketPdf({
          ticketRef,
          recipientName: item.captain_name,
          category: "Esports Squad",
          email: item.email,
          phone: item.phone,
          institution: item.institution || undefined,
          registrationType: "esports_team",
          teamName: item.team_name,
          projectTitle: item.gameTitle,
        });
        pdfAttachments = [
          {
            filename: teamDoc.fileName,
            base64Content: teamDoc.pdfBase64,
            contentType: "application/pdf",
          },
        ];
      } catch {
        // continue
      }

      const emailRes = await sendRegistrationConfirmationEmail(item.id, "esports", true, {
        recipientEmail: item.email,
        recipientName: item.captain_name,
        registrationRef: item.registration_ref,
        institution: item.institution || undefined,
        attachments: pdfAttachments,
      });
      if (emailRes.ok && !emailRes.simulated) {
        setStatusMessage({
          type: "success",
          text: `Squad confirmation email re-sent successfully to captain (${item.email}).`,
        });
        setRegistrations((prev) =>
          prev.map((r) => (r.id === item.id ? { ...r, email_status: "sent" } : r))
        );
        if (selectedReg && selectedReg.id === item.id) {
          setSelectedReg({ ...selectedReg, email_status: "sent" });
        }
      } else {
        const nextStatus = item.email_status === "sent" ? "sent" : "failed";
        setRegistrations((prev) =>
          prev.map((r) => (r.id === item.id ? { ...r, email_status: nextStatus } : r))
        );
        if (selectedReg && selectedReg.id === item.id) {
          setSelectedReg({ ...selectedReg, email_status: nextStatus });
        }
        const statusSuffix = emailRes.httpStatusCode ? ` [HTTP ${emailRes.httpStatusCode}${emailRes.errorType ? ` · ${emailRes.errorType}` : ""}]` : "";
        throw new Error(`${emailRes.error || "Email delivery failed"}${statusSuffix}`);
      }
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Failed to resend confirmation email: ${err.message || "Unknown error"}`,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  // Safe Archive Handler
  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      const res = await archiveRegistrationRecord("esports", archiveTarget.id);
      if (!res.ok) {
        throw new Error(res.error);
      }

      const now = new Date().toISOString();
      markRegistrationArchivedLocal(archiveTarget.id, true);
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === archiveTarget.id
            ? {
                ...r,
                archived_at: now,
                admin_notes: r.admin_notes ? `${r.admin_notes}\n[ARCHIVED ${now}]` : `[ARCHIVED ${now}]`,
              }
            : r
        )
      );

      if (selectedReg && selectedReg.id === archiveTarget.id) {
        setSelectedReg({
          ...selectedReg,
          archived_at: now,
          admin_notes: selectedReg.admin_notes
            ? `${selectedReg.admin_notes}\n[ARCHIVED ${now}]`
            : `[ARCHIVED ${now}]`,
          isArchived: true,
        });
      }

      setStatusMessage({
        type: "success",
        text: `Team "${archiveTarget.team_name}" (${archiveTarget.registration_ref}) was successfully archived.`,
      });
      setArchiveTarget(null);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Failed to archive: ${err.message || "Unknown error"}`,
      });
    } finally {
      setIsArchiving(false);
    }
  };

  // Safe Restore Handler
  const handleRestore = async (item: ProcessedEsportsRegistration) => {
    setUpdatingId(item.id);
    try {
      const res = await restoreRegistrationRecord("esports", item.id);
      if (!res.ok) {
        throw new Error(res.error);
      }

      markRegistrationArchivedLocal(item.id, false);
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === item.id
            ? {
                ...r,
                archived_at: null,
                admin_notes: r.admin_notes?.replace(/\[ARCHIVED.*?\]/g, "").trim() || null,
              }
            : r
        )
      );

      if (selectedReg && selectedReg.id === item.id) {
        setSelectedReg({
          ...selectedReg,
          archived_at: null,
          admin_notes: selectedReg.admin_notes?.replace(/\[ARCHIVED.*?\]/g, "").trim() || null,
          isArchived: false,
        });
      }

      setStatusMessage({
        type: "success",
        text: `Team "${item.team_name}" (${item.registration_ref}) was restored to the active submissions list.`,
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Failed to restore: ${err.message || "Unknown error"}`,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  // Process data with Roster Health, Selection Status & Archive Status
  const processedRegistrations: ProcessedEsportsRegistration[] = useMemo(() => {
    return registrations.map((r) => {
      const gameTitle = r.games?.title || "Game TBA";
      const registeredCount = r.players?.length || 0;
      const expectedCount = getOfficialTeamSize(r.games?.title, r.games?.team_size);
      const isRosterValid = registeredCount === expectedCount;
      const isFlagged = !isRosterValid;
      const isArchived = isRegistrationArchived(r);
      const effectiveSelectionStatus: TournamentSelectionStatus =
        r.selection_status || (r.status === "declined" || r.status === "withdrawn" ? "not_selected" : "awaiting_selection");

      return {
        ...r,
        gameTitle,
        registeredCount,
        expectedCount,
        isRosterValid,
        isFlagged,
        isArchived,
        effectiveSelectionStatus,
        rosterSpecText: `${registeredCount} / ${expectedCount}`,
      };
    });
  }, [registrations]);

  // Filtered registrations
  const filteredRegistrations = useMemo(() => {
    return processedRegistrations.filter((r) => {
      if (viewScope === "active" && r.isArchived) return false;
      if (viewScope === "archived" && !r.isArchived) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (selectionFilter !== "all" && r.effectiveSelectionStatus !== selectionFilter) return false;

      // 3. Game Filter
      if (gameFilter !== "all") {
        if (!r.gameTitle.toLowerCase().includes(gameFilter.toLowerCase())) return false;
      }

      // 4. Roster Health Filter
      if (rosterHealthFilter === "valid" && !r.isRosterValid) return false;
      if (rosterHealthFilter === "flagged" && r.isRosterValid) return false;

      // 5. Search Filter
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      const playerMatch = r.players.some(
        (p) =>
          p.player_name.toLowerCase().includes(q) ||
          (p.gamer_tag && p.gamer_tag.toLowerCase().includes(q))
      );

      return (
        r.registration_ref.toLowerCase().includes(q) ||
        r.team_name.toLowerCase().includes(q) ||
        r.captain_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        (r.institution && r.institution.toLowerCase().includes(q)) ||
        r.gameTitle.toLowerCase().includes(q) ||
        playerMatch
      );
    });
  }, [processedRegistrations, viewScope, statusFilter, gameFilter, rosterHealthFilter, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalActive = 0;
    let confirmedActive = 0;
    let pendingActive = 0;
    let flaggedActive = 0;
    let archivedCount = 0;

    let valorant = 0;
    let bgmi = 0;
    let freefire = 0;

    processedRegistrations.forEach((r) => {
      if (r.isArchived) {
        archivedCount++;
      } else {
        totalActive++;
        if (r.status === "confirmed") confirmedActive++;
        if (r.status === "pending") pendingActive++;
        if (r.isFlagged) flaggedActive++;

        const g = r.gameTitle.toLowerCase();
        if (g.includes("val")) valorant++;
        else if (g.includes("bgmi")) bgmi++;
        else if (g.includes("free")) freefire++;
      }
    });

    return { totalActive, confirmedActive, pendingActive, flaggedActive, archivedCount, valorant, bgmi, freefire };
  }, [processedRegistrations]);

  // Export CSV
  const handleExportCSV = () => {
    const sanitizeCsv = (val: string | number | null | undefined): string => {
      const str = String(val ?? "");
      const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    const headers = [
      "Registration Ref",
      "Game",
      "Team Name",
      "Roster Size (Actual / Expected)",
      "Roster Status",
      "Captain / Lead",
      "Email",
      "Phone",
      "Institution",
      "Status",
      "Archived",
      "Submitted At",
      "Player 1",
      "Player 2",
      "Player 3",
      "Player 4",
      "Player 5",
    ];

    const rows = filteredRegistrations.map((r) => {
      const p1 = r.players[0] ? `${r.players[0].player_name} (${r.players[0].gamer_tag || "N/A"})` : "";
      const p2 = r.players[1] ? `${r.players[1].player_name} (${r.players[1].gamer_tag || "N/A"})` : "";
      const p3 = r.players[2] ? `${r.players[2].player_name} (${r.players[2].gamer_tag || "N/A"})` : "";
      const p4 = r.players[3] ? `${r.players[3].player_name} (${r.players[3].gamer_tag || "N/A"})` : "";
      const p5 = r.players[4] ? `${r.players[4].player_name} (${r.players[4].gamer_tag || "N/A"})` : "";

      return [
        sanitizeCsv(r.registration_ref),
        sanitizeCsv(r.gameTitle),
        sanitizeCsv(r.team_name),
        sanitizeCsv(`${r.registeredCount} / ${r.expectedCount}`),
        sanitizeCsv(r.isRosterValid ? "VALID" : "FLAGGED FOR REVIEW"),
        sanitizeCsv(r.captain_name),
        sanitizeCsv(r.email),
        sanitizeCsv(r.phone),
        sanitizeCsv(r.institution || "N/A"),
        sanitizeCsv(r.status),
        sanitizeCsv(r.isArchived ? "YES" : "NO"),
        sanitizeCsv(r.submitted_at),
        sanitizeCsv(p1),
        sanitizeCsv(p2),
        sanitizeCsv(p3),
        sanitizeCsv(p4),
        sanitizeCsv(p5),
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `supernova_esports_registrations_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              Esports Arena CRM
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            Esports Team Registrations
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Verify official collegiate rosters, validate team sizes (5 for VALORANT, 4 for BGMI/FREE FIRE), and manage squad approvals.
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

      {/* Metrics Row: Clean SaaS Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-slate-500 font-semibold">Active Squads</p>
          <p className="text-2xl font-display font-extrabold text-slate-900 mt-1">{metrics.totalActive}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-emerald-700 font-semibold">Confirmed Active</p>
          <p className="text-2xl font-display font-extrabold text-emerald-700 mt-1">{metrics.confirmedActive}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-amber-700 font-semibold">Pending Review</p>
          <p className="text-2xl font-display font-extrabold text-amber-600 mt-1">{metrics.pendingActive}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <p className="text-[11px] font-mono uppercase text-rose-700 font-semibold">Flagged Rosters</p>
          <p className="text-2xl font-display font-extrabold text-rose-600 mt-1">{metrics.flaggedActive}</p>
        </div>
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs col-span-2 sm:col-span-1">
          <p className="text-[11px] font-mono uppercase text-slate-500 font-semibold">Archived / Removed</p>
          <p className="text-2xl font-display font-extrabold text-slate-600 mt-1">{metrics.archivedCount}</p>
        </div>
      </div>

      {/* Toast Feedback Message */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between border shadow-2xs ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMessage.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage(null)} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Active vs Archived Submissions Toggle Tabs */}
          <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewScope("active")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewScope === "active"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Active Submissions ({metrics.totalActive})
            </button>
            <button
              type="button"
              onClick={() => setViewScope("archived")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewScope === "archived"
                  ? "bg-white text-rose-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Archive size={12} />
              <span>Archived ({metrics.archivedCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewScope("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewScope === "all"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Records
            </button>
          </div>

          <span className="text-xs text-slate-500 font-mono">
            Showing <strong className="text-slate-900">{filteredRegistrations.length}</strong> matches
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference, team, captain, phone, institution..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Game Filter */}
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Titles</option>
            <option value="valorant">VALORANT (5 Players)</option>
            <option value="bgmi">BGMI (4 Players)</option>
            <option value="free fire">FREE FIRE (4 Players)</option>
          </select>

          {/* Registration Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Reg Statuses</option>
            {REGISTRATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Tournament Selection Filter */}
          <select
            value={selectionFilter}
            onChange={(e) => setSelectionFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Selection States</option>
            <option value="awaiting_selection">Awaiting Selection</option>
            <option value="selected">Selected for Bracket</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="not_selected">Not Selected</option>
            <option value="disqualified">Disqualified</option>
          </select>

          {/* Roster Health Filter */}
          <select
            value={rosterHealthFilter}
            onChange={(e) => setRosterHealthFilter(e.target.value as "all" | "valid" | "flagged")}
            className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-blue-500"
          >
            <option value="all">All Rosters</option>
            <option value="valid">Valid Rosters</option>
            <option value="flagged">Flagged Mismatch</option>
          </select>
        </div>
      </div>

      {/* Main SaaS Registration Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 uppercase font-mono tracking-wider text-[11px]">
                <th className="py-3 px-4 font-semibold">Reference</th>
                <th className="py-3 px-4 font-semibold">Team Name</th>
                <th className="py-3 px-4 font-semibold">Tournament Title</th>
                <th className="py-3 px-4 font-semibold">Representative</th>
                <th className="py-3 px-4 font-semibold">Roster Health</th>
                <th className="py-3 px-4 font-semibold">Submitted</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 font-mono">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading esports rosters from Supabase...
                  </td>
                </tr>
              ) : filteredRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="font-semibold text-slate-800">No esports registrations match your current criteria.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {viewScope === "archived" ? "No archived esports teams found." : "Try adjusting filters or searching a different term."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRegistrations.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedReg(item)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    {/* Reference */}
                    <td className="py-3.5 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                      {item.registration_ref}
                    </td>

                    {/* Team Name & Institution */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 block text-sm group-hover:text-blue-700 transition-colors">
                        {item.team_name}
                      </span>
                      <span className="text-[11px] text-slate-500 block truncate max-w-[200px]">
                        {item.institution || "Independent"}
                      </span>
                    </td>

                    {/* Game & Platform */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {item.gameTitle.toLowerCase().includes("val") ? (
                          <Monitor size={13} className="text-sky-600" />
                        ) : (
                          <Smartphone size={13} className="text-amber-600" />
                        )}
                        <span className="font-semibold text-slate-800">{item.gameTitle}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        Required: {item.expectedCount} players
                      </span>
                    </td>

                    {/* Representative */}
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800">{item.captain_name}</p>
                      <p className="text-[11px] text-slate-500 font-mono truncate max-w-[170px]">{item.email}</p>
                    </td>

                    {/* Roster Health */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {item.isRosterValid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[11px] font-semibold">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          <span>{item.rosterSpecText}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 font-mono text-[11px] font-bold">
                          <AlertTriangle size={11} className="text-rose-600" />
                          <span>{item.rosterSpecText} · Flagged</span>
                        </span>
                      )}
                    </td>

                    {/* Submitted Date */}
                    <td className="py-3.5 px-4 text-slate-500 font-mono whitespace-nowrap">
                      {new Date(item.submitted_at).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    {/* Status Badge, Selection Pill & Email Pill */}
                    <td className="py-3.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <AdminStatusBadge status={item.status} isArchived={item.isArchived} />
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-mono text-[10px] font-bold uppercase ${
                              SELECTION_BADGE_MAP[item.effectiveSelectionStatus].tone
                            }`}
                          >
                            {SELECTION_BADGE_MAP[item.effectiveSelectionStatus].label}
                          </span>
                        </div>
                        {item.status === "confirmed" && (
                          <div>
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                                (item as any).email_status === "sent"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : (item as any).email_status === "failed"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              <Mail size={10} />
                              <span>{(item as any).email_status || "not_sent"}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedReg(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                          title="View complete team details and player roster"
                        >
                          <Eye size={12} />
                          <span>View</span>
                        </button>

                        {item.status === "confirmed" && canResend && (
                          <button
                            type="button"
                            onClick={() => handleResendEmail(item)}
                            disabled={updatingId === item.id}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Resend squad confirmation email to captain"
                          >
                            <Mail size={13} />
                          </button>
                        )}

                        {canEdit && (
                          item.isArchived ? (
                            <button
                              type="button"
                              onClick={() => handleRestore(item)}
                              disabled={updatingId === item.id}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors cursor-pointer"
                              title="Restore to active submissions"
                            >
                              <RotateCcw size={12} />
                              <span>Restore</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setArchiveTarget(item)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Archive / Delete this registration"
                            >
                              <Trash2 size={13} />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          REQUIREMENT 6: LARGE, PROFESSIONAL TEAM DETAIL DRAWER / MODAL
          ========================================================================= */}
      {selectedReg && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-fadeIn"
          onClick={() => setSelectedReg(null)}
        >
          <div
            className="w-full max-w-2xl bg-white border-l border-slate-200 h-full overflow-y-auto p-6 sm:p-8 flex flex-col justify-between shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded">
                      {selectedReg.registration_ref}
                    </span>
                    <AdminStatusBadge status={selectedReg.status} isArchived={selectedReg.isArchived} />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-display font-black text-slate-900 tracking-tight m-0">
                    {selectedReg.team_name}
                  </h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Submitted {new Date(selectedReg.submitted_at).toLocaleString("en-IN")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedReg(null)}
                  className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close detail drawer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Roster Health Banner */}
              <div>
                {selectedReg.isRosterValid ? (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs text-emerald-900">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold font-mono">
                        ROSTER HEALTH: VALID ({selectedReg.gameTitle} · {selectedReg.rosterSpecText} Players)
                      </p>
                      <p className="text-[11px] text-emerald-800/80 mt-0.5">
                        Matches official tournament specification. No extra or missing players.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2.5 text-xs text-rose-900">
                    <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                    <div>
                      <p className="font-bold font-mono">
                        ROSTER HEALTH: REVIEW REQUIRED ({selectedReg.registeredCount} / {selectedReg.expectedCount} Players)
                      </p>
                      <p className="text-[11px] text-rose-800/80 mt-0.5">
                        {selectedReg.registeredCount > selectedReg.expectedCount
                          ? `Roster has ${selectedReg.registeredCount - selectedReg.expectedCount} excess player(s). Official limit is ${selectedReg.expectedCount}.`
                          : `Roster is missing ${selectedReg.expectedCount - selectedReg.registeredCount} player(s). All ${selectedReg.expectedCount} positions are required.`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION A: Team & Tournament Information */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Team & Tournament Specifications
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Game Title</span>
                    <strong className="text-slate-900 text-sm">{selectedReg.gameTitle}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Platform</span>
                    <strong className="text-slate-900 text-sm">
                      {selectedReg.gameTitle.toLowerCase().includes("val") ? "PC Tournament" : "Mobile Tournament"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Substitutes Rule</span>
                    <span className="font-medium text-amber-700">Not Allowed (Official Rules)</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Institution / College</span>
                    <span className="font-medium text-slate-900">{selectedReg.institution || "Independent"}</span>
                  </div>
                </div>
              </div>

              {/* SECTION B: Representative Information */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Team Representative / Captain Contact
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Representative Name:</span>
                    <strong className="text-slate-900">{selectedReg.captain_name}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Mail size={12} /> Email Address:
                    </span>
                    <a href={`mailto:${selectedReg.email}`} className="text-blue-700 font-mono hover:underline">
                      {selectedReg.email}
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Phone size={12} /> Phone Number:
                    </span>
                    <a href={`tel:${selectedReg.phone}`} className="text-blue-700 font-mono hover:underline">
                      {selectedReg.phone}
                    </a>
                  </div>
                </div>
              </div>

              {/* SECTION C: COMPLETE PLAYER ROSTER (All Players Individually Visible) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 m-0">
                    Verified Player Roster ({selectedReg.players.length} Registered / {selectedReg.expectedCount} Expected)
                  </h3>
                  <span className="text-[11px] font-mono text-slate-500">
                    No Substitutes Allowed
                  </span>
                </div>

                {selectedReg.players.length === 0 ? (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    No individual player records found for this team.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500 font-mono text-[11px] uppercase">
                          <th className="py-2.5 px-3 w-14">Slot</th>
                          <th className="py-2.5 px-3">Player Name</th>
                          <th className="py-2.5 px-3">In-Game Tag / ID</th>
                          <th className="py-2.5 px-3">Visitor Ticket</th>
                          <th className="py-2.5 px-3 text-right">Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedReg.players.map((p, idx) => (
                          <tr key={p.id || idx} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-500">
                              #{idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">
                              {p.player_name}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {p.gamer_tag || "Not provided"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-xs font-bold text-blue-700">
                              <span className="bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                {selectedReg.registration_ref}-P{idx + 1}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {idx === 0 ? (
                                <span className="inline-block text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                  Captain
                                </span>
                              ) : (
                                <span className="inline-block text-[10px] font-mono text-slate-400">
                                  Starter
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Ticketing & Email Dispatch Card */}
              {/* Squad Ticketing, NAS Archival & Email Dispatch Card */}
              <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-purple-900">
                    Squad Ticketing & NAS Archival
                  </span>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-white text-purple-700 border border-purple-200">
                    Auto-Linked Roster Passes
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-600">Official Team Ticket:</span>
                  <strong className="font-mono text-xs text-purple-900">
                    {selectedReg.status === "confirmed" && !selectedReg.isArchived
                      ? selectedTicket?.ticket_ref || selectedReg.registration_ref
                      : "Pending Confirmation — Not Issued"}
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
                  <span className="text-slate-600">Captain Email:</span>
                  <strong className="font-mono text-xs text-purple-900">{selectedReg.email}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Email Status:</span>
                  <span className="font-semibold text-slate-800 capitalize">
                    {(selectedReg as any).email_status || (selectedReg.status === "confirmed" ? "not sent" : "pending approval")}
                  </span>
                </div>

                {/* NAS Archive Status */}
                {(() => {
                  const nasRecord = getLocalNasArchives().find((a) => a.ticketRef === (selectedTicket?.ticket_ref || selectedReg.registration_ref));
                  return (
                    <div className="pt-2 border-t border-purple-200/60 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">NAS Backup (Team Doc):</span>
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
                  {selectedReg.status === "confirmed" && !selectedReg.isArchived ? (
                    <button
                      type="button"
                      onClick={async () => {
                        let tkt = selectedTicket;
                        if (!tkt) {
                          const issued = await issueTicketForRegistration("esports", selectedReg.id);
                          if (issued.ok && issued.ticket) {
                            tkt = issued.ticket;
                            setSelectedTicket(tkt);
                          }
                        }
                        await downloadTicketPdfFile({
                          ticketRef: tkt?.ticket_ref || selectedReg.registration_ref,
                          qrToken: tkt?.qr_token,
                          recipientName: selectedReg.captain_name,
                          category: "Esports Squad",
                          email: selectedReg.email,
                          phone: selectedReg.phone,
                          institution: selectedReg.institution || undefined,
                          registrationType: "esports_team",
                          teamName: selectedReg.team_name,
                          projectTitle: selectedReg.gameTitle,
                        });
                      }}
                      className="py-2 px-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download size={13} />
                      <span>Download Team Pass PDF</span>
                    </button>
                  ) : (
                    <div className="py-2 px-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-mono font-semibold text-center">
                      Confirm Team to Issue Ticket
                    </div>
                  )}

                  {canResend && selectedReg.status === "confirmed" && (
                    <button
                      type="button"
                      disabled={updatingId === selectedReg.id}
                      onClick={() => handleResendEmail(selectedReg)}
                      className="py-2 px-3 rounded-lg bg-white hover:bg-purple-50 border border-purple-300 text-purple-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Mail size={13} />
                      <span>Resend Captain Email</span>
                    </button>
                  )}
                </div>
              </div>

              {/* SECTION D: Administrative Verification & Registration Status */}
              {(canApprove || canEdit || canReject) && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 m-0">
                    1. Registration Approval Status
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {canApprove && (
                      <button
                        type="button"
                        disabled={updatingId === selectedReg.id || selectedReg.status === "confirmed"}
                        onClick={() => changeStatus(selectedReg, "confirmed")}
                        className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <Check size={13} />
                        <span>Confirm</span>
                      </button>
                    )}

                    {canEdit && (
                      <button
                        type="button"
                        disabled={updatingId === selectedReg.id}
                        onClick={() => {
                          setReasonText("");
                          setReasonModal({
                            item: selectedReg,
                            kind: "registration",
                            nextValue: "correction_requested",
                            label: "Request Roster / Form Correction",
                          });
                        }}
                        className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <Clock size={13} />
                        <span>Correction</span>
                      </button>
                    )}

                    {canReject && (
                      <button
                        type="button"
                        disabled={updatingId === selectedReg.id}
                        onClick={() => {
                          setReasonText("");
                          setReasonModal({
                            item: selectedReg,
                            kind: "registration",
                            nextValue: "declined",
                            label: "Decline / Reject Registration",
                          });
                        }}
                        className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <Ban size={13} />
                        <span>Decline</span>
                      </button>
                    )}

                    {canEdit && (
                      <button
                        type="button"
                        disabled={updatingId === selectedReg.id || selectedReg.status === "withdrawn"}
                        onClick={() => {
                          setReasonText("");
                          setReasonModal({
                            item: selectedReg,
                            kind: "registration",
                            nextValue: "withdrawn",
                            label: "Mark Squad Withdrawn",
                          });
                        }}
                        className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <span>Withdraw</span>
                      </button>
                    )}

                    {canEdit && (
                      selectedReg.isArchived ? (
                        <button
                          type="button"
                          disabled={updatingId === selectedReg.id}
                          onClick={() => handleRestore(selectedReg)}
                          className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          <RotateCcw size={13} />
                          <span>Restore</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setArchiveTarget(selectedReg)}
                          className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-lg bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-semibold cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span>Archive</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* SECTION E: Tournament Selection Status (Independent of Approval) */}
              {canSelectTeams && (
                <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-900 m-0 flex items-center gap-1.5">
                      <Trophy size={13} />
                      <span>2. Tournament Bracket Selection</span>
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full border font-mono text-[10px] font-bold uppercase ${
                        SELECTION_BADGE_MAP[selectedReg.effectiveSelectionStatus].tone
                      }`}
                    >
                      {SELECTION_BADGE_MAP[selectedReg.effectiveSelectionStatus].label}
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-900/80 m-0">
                    Only confirmed teams marked <strong>Selected for Bracket</strong> are eligible to enter brackets in Esports Control.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      disabled={selectedReg.status !== "confirmed" || updatingId === selectedReg.id}
                      onClick={() => changeSelectionStatus(selectedReg, "selected")}
                      className="py-2 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                    >
                      Select Team
                    </button>
                    <button
                      type="button"
                      disabled={selectedReg.status !== "confirmed" || updatingId === selectedReg.id}
                      onClick={() => changeSelectionStatus(selectedReg, "waitlisted")}
                      className="py-2 px-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                    >
                      Waitlist
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === selectedReg.id}
                      onClick={() => changeSelectionStatus(selectedReg, "not_selected", "Not shortlisted for tournament slots")}
                      className="py-2 px-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      Not Selected
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === selectedReg.id}
                      onClick={() => {
                        setReasonText("");
                        setReasonModal({
                          item: selectedReg,
                          kind: "selection",
                          nextValue: "disqualified",
                          label: "Disqualify Team from Tournament",
                        });
                      }}
                      className="py-2 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Disqualify
                    </button>
                  </div>

                  {selectedReg.effectiveSelectionStatus === "selected" && (
                    <div className="flex items-center gap-2 pt-2 border-t border-indigo-200/70">
                      <label className="text-xs font-semibold text-indigo-950">Tournament Seed #:</label>
                      <input
                        type="number"
                        min={1}
                        max={128}
                        value={selectedReg.seed_number ?? ""}
                        onChange={(e) =>
                          handleSeedUpdate(selectedReg, e.target.value ? Number(e.target.value) : null)
                        }
                        placeholder="Auto"
                        className="w-24 h-8 px-2.5 rounded-lg border border-indigo-300 bg-white text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* SECTION F: Team Status Decision History */}
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2.5">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 m-0 flex items-center gap-1.5">
                  <History size={13} />
                  <span>Decision Audit History</span>
                </h3>
                {(historyByReg[selectedReg.id] || []).length === 0 ? (
                  <p className="text-xs text-slate-500 m-0">
                    Current state: Registration <strong>{selectedReg.status}</strong> · Selection{" "}
                    <strong>{selectedReg.effectiveSelectionStatus}</strong>. Future status & selection updates will be logged here.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {(historyByReg[selectedReg.id] || []).map((h) => (
                      <div key={h.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                        <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                          <strong className="text-slate-900">
                            {h.change_type === "selection_status" ? "Selection" : "Registration"}:{" "}
                            {h.previous_value || "initial"} → {h.next_value}
                          </strong>
                          <span className="text-slate-400">
                            {new Date(h.created_at).toLocaleString("en-IN")}
                          </span>
                        </div>
                        {h.reason && <p className="text-slate-700 m-0 mt-1">Reason: {h.reason}</p>}
                        {h.changed_by_email && (
                          <span className="text-[10px] font-mono text-slate-500 block mt-0.5">
                            By: {h.changed_by_email}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="pt-5 border-t border-slate-200 flex justify-end">
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

      {/* Mandatory Reason Modal */}
      {reasonModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setReasonModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 m-0">{reasonModal.label}</h3>
            <p className="text-xs text-slate-600 m-0">
              Provide a documented reason for <strong>{reasonModal.item.team_name}</strong> ({reasonModal.item.registration_ref}).
            </p>
            <textarea
              required
              rows={3}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Enter specific reason (required for audit log)..."
              className="w-full p-3 rounded-xl border border-slate-300 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReasonModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!reasonText.trim()}
                onClick={async () => {
                  const target = reasonModal;
                  const txt = reasonText.trim();
                  setReasonModal(null);
                  if (target.kind === "registration") {
                    await changeStatus(target.item, target.nextValue, txt);
                  } else {
                    await changeSelectionStatus(target.item, target.nextValue as TournamentSelectionStatus, txt);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Archive Confirmation Modal */}
      {archiveTarget && (
        <AdminArchiveConfirmModal
          isOpen={true}
          onClose={() => setArchiveTarget(null)}
          onConfirm={handleConfirmArchive}
          isProcessing={isArchiving}
          registrationRef={archiveTarget.registration_ref}
          name={archiveTarget.team_name}
          category={`Esports Squad (${archiveTarget.gameTitle})`}
        />
      )}
    </div>
  );
}
