import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { QrTicketScannerModal } from "@/components/admin/QrTicketScannerModal";
import {
  DEFAULT_WRISTBAND_CATEGORIES,
  computeEntryStatistics,
  evaluateEsportsPlayerEntry,
  evaluateVisitorEntry,
  isAutoLinkedEsportsVisitorRecord,
  validateWristbandIssuance,
} from "@/lib/entryOperations";
import type {
  CheckIn,
  EventDaySession,
  GateVerificationResult,
  RegistrationStatus,
  TournamentSelectionStatus,
  WristbandCategory,
  WristbandIssuance,
} from "@/types/database";
import { parseSecureQrPayload } from "@/lib/ticketing";
import { checkinGateTicket, verifyGateTicket } from "@/lib/ticketClient";
import {
  Search,
  CheckCircle,
  XCircle,
  Gamepad2,
  UserPlus,
  QrCode,
  RefreshCw,
  AlertTriangle,
  Building2,
  Phone,
  X,
  ShieldAlert,
  Tag,
  Calendar,
  Settings,
  Repeat,
  ShieldCheck,
} from "lucide-react";

interface EntrySubject {
  key: string;
  id: string;
  registrationId: string;
  ticketRef: string;
  teamRef?: string;
  name: string;
  gamerTag?: string | null;
  phone: string;
  email: string;
  institution: string;
  subjectType: "visitor" | "esports_player" | "participation";
  categoryOrGame: string;
  count: number;
  status: RegistrationStatus | string;
  selectionStatus?: TournamentSelectionStatus;
  rosterRole?: string;
  isAutoLinked?: boolean;
  adminNotes?: string | null;
}

export default function AdminCheckin() {
  const { user, hasPermission } = useAuth();

  const canScanVisitor = hasPermission(["entry:scan_visitor", "visitor:view"]);
  const canCheckInVisitor = hasPermission(["entry:checkin_visitor", "visitor:edit"]);
  const canScanEsports = hasPermission(["entry:scan_esports", "esports:view"]);
  const canCheckInEsports = hasPermission(["entry:checkin_esports", "esports:edit"]);
  const canIssueWristband = hasPermission("entry:issue_wristband");
  const canOverrideCheckin = hasPermission("entry:override_checkin");
  const canManageWristbands = hasPermission("entry:manage_wristbands");
  const canCreateWalkIn = hasPermission("visitor:create");
  const canViewParticipation = hasPermission("participation:view");
  const canCheckInParticipation = hasPermission("participation:edit");

  const [eventDay, setEventDay] = useState<EventDaySession>("2026-11-20");
  const [allowUnselectedEntry, setAllowUnselectedEntry] = useState(true);
  const [trackFilter, setTrackFilter] = useState<"all" | "visitor" | "esports_player">(
    canScanVisitor && !canScanEsports
      ? "visitor"
      : !canScanVisitor && canScanEsports
      ? "esports_player"
      : "all"
  );

  const [visitorsRaw, setVisitorsRaw] = useState<any[]>([]);
  const [esportsTeamsRaw, setEsportsTeamsRaw] = useState<any[]>([]);
  const [esportsPlayersRaw, setEsportsPlayersRaw] = useState<any[]>([]);
  const [participationsRaw, setParticipationsRaw] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [wristbandCategories, setWristbandCategories] = useState<WristbandCategory[]>(
    DEFAULT_WRISTBAND_CATEGORIES
  );
  const [wristbandIssuances, setWristbandIssuances] = useState<WristbandIssuance[]>([]);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [rawQrInput, setRawQrInput] = useState("");
  const [gateVerification, setGateVerification] = useState<GateVerificationResult | null>(null);
  const [verifyingGate, setVerifyingGate] = useState(false);
  const [checkingInGate, setCheckingInGate] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Selected wristband choice per ticket key
  const [selectedBandByKey, setSelectedBandByKey] = useState<Record<string, string>>({});
  const [bandCodeByKey, setBandCodeByKey] = useState<Record<string, string>>({});

  // Supervisor Override Modal
  const [overrideTarget, setOverrideTarget] = useState<{
    subject: EntrySubject;
    priorAt?: string | null;
    priorBy?: string | null;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [submittingOverride, setSubmittingOverride] = useState(false);

  // Wristband Replacement Modal
  const [replaceTarget, setReplaceTarget] = useState<{
    subject: EntrySubject;
    existing: WristbandIssuance;
  } | null>(null);
  const [replaceReason, setReplaceReason] = useState("");
  const [replaceCategoryName, setReplaceCategoryName] = useState("");
  const [replaceCode, setReplaceCode] = useState("");
  const [submittingReplace, setSubmittingReplace] = useState(false);

  // Super Admin Wristband Config Modal
  const [configOpen, setConfigOpen] = useState(false);
  const [newBandName, setNewBandName] = useState("");
  const [newBandColor, setNewBandColor] = useState("#0EA5E9");
  const [newBandDesc, setNewBandDesc] = useState("");
  const [savingBand, setSavingBand] = useState(false);

  // Walk-in Modal
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInEmail, setWalkInEmail] = useState("");
  const [walkInInstitution, setWalkInInstitution] = useState("");
  const [walkInCount, setWalkInCount] = useState(1);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleVerifyGateInput = useCallback(async (rawOrQuery: string) => {
    const trimmed = rawOrQuery.trim();
    if (!trimmed) {
      setGateVerification(null);
      return;
    }
    setRawQrInput(trimmed);
    setVerifyingGate(true);
    setStatusMessage(null);
    try {
      const parsed = parseSecureQrPayload(trimmed);
      const res = await verifyGateTicket(trimmed);
      setGateVerification(res);
      const displayRef = parsed.ticketRef || res.ticket?.ticket_ref || trimmed;
      setSearchQuery(displayRef);
    } catch (err: any) {
      setGateVerification({
        ok: false,
        verdict: "INVALID",
        can_check_in: false,
        error: err?.message || "Gate verification request failed.",
      });
    } finally {
      setVerifyingGate(false);
    }
  }, []);

  const handleAuthoritativeGateCheckIn = async () => {
    if (!gateVerification?.ticket?.ticket_ref) return;
    setCheckingInGate(true);
    setStatusMessage(null);
    try {
      const parsed = parseSecureQrPayload(rawQrInput);
      const tkt = gateVerification.ticket;
      const defaultBand =
        tkt.registration_category === "esports"
          ? wristbandCategories.find((c) => c.slug === "esports-participant")?.name || "Esports Participant"
          : wristbandCategories.find((c) => c.slug === "general-visitor")?.name || "General Visitor";

      const res = await checkinGateTicket({
        ticketRef: tkt.ticket_ref,
        qrToken: parsed.qrToken,
        eventDay,
        wristbandCategory: canIssueWristband ? defaultBand : null,
      });

      setGateVerification(res);
      if (res.ok && res.verdict === "VALID") {
        setStatusMessage({
          type: "success",
          text: `Gate Entry Approved & Checked In: ${tkt.display_name} (${tkt.ticket_ref}) on ${eventDay}.`,
        });
        await fetchEntryData();
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || res.reason || `Entry blocked: ${res.verdict}`,
        });
      }
    } finally {
      setCheckingInGate(false);
    }
  };

  const fetchEntryData = useCallback(async () => {
    try {
      const [visRes, partRes, espRes, playersRes, ciRes, wbCatRes, wbIssRes] = await Promise.all([
        canScanVisitor
          ? supabase.from("visitor_registrations").select("*").order("submitted_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        canViewParticipation
          ? supabase.from("participation_registrations").select("*").order("submitted_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        canScanEsports
          ? supabase
              .from("registrations")
              .select("*, games(id, title)")
              .order("submitted_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        canScanEsports
          ? supabase.from("players").select("*").order("created_at", { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("check_ins").select("*").order("checked_in_at", { ascending: false }),
        supabase.from("wristband_categories").select("*").order("sort_order", { ascending: true }),
        supabase.from("wristband_issuances").select("*").order("issued_at", { ascending: false }),
      ]);

      setVisitorsRaw(visRes.data || []);
      setParticipationsRaw(partRes.data || []);
      setEsportsTeamsRaw(espRes.data || []);
      setEsportsPlayersRaw(playersRes.data || []);
      setCheckins((ciRes.data as CheckIn[]) || []);

      if (!wbCatRes.error && Array.isArray(wbCatRes.data) && wbCatRes.data.length > 0) {
        setWristbandCategories(wbCatRes.data as WristbandCategory[]);
      }
      if (!wbIssRes.error && Array.isArray(wbIssRes.data)) {
        setWristbandIssuances(wbIssRes.data as WristbandIssuance[]);
      }
    } catch (err) {
      console.warn("Failed to load entry verification data:", err);
    } finally {
      setLoading(false);
    }
  }, [canScanVisitor, canViewParticipation, canScanEsports]);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "check_ins", onRefresh: fetchEntryData },
      { table: "visitor_registrations", onRefresh: fetchEntryData },
      { table: "registrations", onRefresh: fetchEntryData },
      { table: "players", onRefresh: fetchEntryData },
      { table: "wristband_issuances", onRefresh: fetchEntryData },
    ],
    "admin-checkin"
  );

  useEffect(() => {
    fetchEntryData();
  }, [fetchEntryData]);

  // Build searchable entry directory
  const subjects: EntrySubject[] = useMemo(() => {
    const list: EntrySubject[] = [];

    if (canScanVisitor) {
      for (const v of visitorsRaw) {
        const autoLinked = isAutoLinkedEsportsVisitorRecord(v);
        // Only surface true visitors under Visitor Gate unless specifically searched by ref
        list.push({
          key: `vis-${v.id}`,
          id: v.id,
          registrationId: v.id,
          ticketRef: v.registration_ref,
          name: v.full_name,
          phone: v.phone || "",
          email: v.email || "",
          institution: v.institution || "General Visitor",
          subjectType: "visitor",
          categoryOrGame: v.visitor_category || "General Visitor",
          count: v.visitor_count || 1,
          status: v.status || "pending",
          isAutoLinked: autoLinked,
          adminNotes: v.admin_notes,
        });
      }
    }

    if (canScanEsports) {
      const teamById = new Map<string, any>();
      esportsTeamsRaw.forEach((t) => teamById.set(t.id, t));

      const playersByReg = new Map<string, any[]>();
      esportsPlayersRaw.forEach((p) => {
        const arr = playersByReg.get(p.registration_id) || [];
        arr.push(p);
        playersByReg.set(p.registration_id, arr);
      });

      for (const team of esportsTeamsRaw) {
        const roster = playersByReg.get(team.id) || [];
        const gameTitle = team.games?.title || "Esports";
        const selectionStatus: TournamentSelectionStatus =
          team.selection_status || (team.status === "confirmed" ? "awaiting_selection" : "not_selected");

        if (roster.length === 0) {
          list.push({
            key: `esp-team-${team.id}`,
            id: team.id,
            registrationId: team.id,
            ticketRef: team.registration_ref,
            teamRef: team.registration_ref,
            name: `${team.team_name} (Captain: ${team.captain_name})`,
            phone: team.phone || "",
            email: team.email || "",
            institution: team.institution || "Collegiate Squad",
            subjectType: "esports_player",
            categoryOrGame: `${gameTitle} · Team ${team.team_name}`,
            count: 1,
            status: team.status || "pending",
            selectionStatus,
            rosterRole: "captain",
          });
        } else {
          roster.forEach((p: any, idx: number) => {
            const pTicket = p.player_ticket_ref || `${team.registration_ref}-P${idx + 1}`;
            list.push({
              key: `esp-player-${p.id}`,
              id: p.id,
              registrationId: team.id,
              ticketRef: pTicket,
              teamRef: team.registration_ref,
              name: p.player_name,
              gamerTag: p.gamer_tag,
              phone: team.phone || "",
              email: team.email || "",
              institution: `${team.team_name} (${team.institution || "College"})`,
              subjectType: "esports_player",
              categoryOrGame: `${gameTitle} · Slot #${idx + 1}`,
              count: 1,
              status: team.status || "pending",
              selectionStatus,
              rosterRole: p.roster_role || (idx === 0 ? "captain" : "starter"),
            });
          });
        }
      }
    }

    if (canViewParticipation) {
      for (const p of participationsRaw) {
        list.push({
          key: `part-${p.id}`,
          id: p.id,
          registrationId: p.id,
          ticketRef: p.registration_ref,
          name: p.full_name,
          phone: p.phone || "",
          email: p.email || "",
          institution: p.institution || "Exhibitor",
          subjectType: "participation",
          categoryOrGame: `${p.participation_area || "Science Expo"} · ${p.project_title || "Project"}`,
          count: p.team_members_count || 1,
          status: p.status || "pending",
        });
      }
    }

    return list;
  }, [visitorsRaw, esportsTeamsRaw, esportsPlayersRaw, participationsRaw, canScanVisitor, canScanEsports, canViewParticipation]);

  const stats = useMemo(
    () =>
      computeEntryStatistics({
        visitors: visitorsRaw,
        esportsTeams: esportsTeamsRaw,
        players: esportsPlayersRaw,
        checkIns: checkins,
        wristbands: wristbandIssuances,
      }),
    [visitorsRaw, esportsTeamsRaw, esportsPlayersRaw, checkins, wristbandIssuances]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return subjects.filter((s) => {
      if (trackFilter === "visitor" && s.subjectType !== "visitor") return false;
      if (trackFilter === "esports_player" && s.subjectType !== "esports_player") return false;

      // Cross-check scenario: if esports entry staff scans a visitor ref (or vice-versa), still show with denial verdict if ref matches directly!
      const refMatches =
        s.ticketRef.toLowerCase().includes(q) || (s.teamRef && s.teamRef.toLowerCase().includes(q));
      if (s.isAutoLinked && !refMatches) return false;

      return (
        refMatches ||
        s.name.toLowerCase().includes(q) ||
        (s.gamerTag && s.gamerTag.toLowerCase().includes(q)) ||
        s.phone.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.institution.toLowerCase().includes(q)
      );
    });
  }, [subjects, searchQuery, trackFilter]);

  const getDailyCheckinForSubject = (subject: EntrySubject) => {
    return checkins.find((c) => {
      const dayMatch = (c.event_day || "2026-11-20") === eventDay;
      if (!dayMatch) return false;
      if (c.ticket_ref) {
        return c.ticket_ref.toLowerCase() === subject.ticketRef.toLowerCase();
      }
      return c.registration_id === subject.registrationId;
    });
  };

  const getActiveWristband = (ticketRef: string) => {
    return wristbandIssuances.find(
      (w) =>
        w.ticket_ref.toLowerCase() === ticketRef.toLowerCase() &&
        w.event_day === eventDay &&
        w.status === "active"
    );
  };

  const getDefaultBandForSubject = (subject: EntrySubject) => {
    if (selectedBandByKey[subject.key]) return selectedBandByKey[subject.key];
    if (subject.subjectType === "esports_player") {
      return (
        wristbandCategories.find((c) => c.slug === "esports-participant")?.name ||
        "Esports Participant"
      );
    }
    return (
      wristbandCategories.find((c) => c.slug === "general-visitor")?.name ||
      "General Visitor"
    );
  };

  const executeCheckIn = async (
    subject: EntrySubject,
    isOverride = false,
    reason = ""
  ) => {
    setStatusMessage(null);
    const bandCategory = canIssueWristband ? getDefaultBandForSubject(subject) : undefined;
    const bandCode = bandCodeByKey[subject.key]?.trim() || undefined;
    const actorEmail = user?.email || "entry-staff@supernova.edu";
    const nowIso = new Date().toISOString();

    if (bandCategory) {
      const bandObj = wristbandCategories.find((c) => c.name === bandCategory);
      const bandGuard = validateWristbandIssuance({
        categories: wristbandCategories,
        existingIssuances: wristbandIssuances,
        categoryIdOrSlug: bandObj?.slug || bandObj?.id || bandCategory,
        ticketRef: subject.ticketRef,
        eventDay,
      });
      if (!bandGuard.ok && !isOverride) {
        // Check-in can still proceed without duplicating wristband if already wearing active band
      }
    }

    try {
      // Try atomic SECURITY DEFINER RPC first
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("perform_event_checkin", {
        p_ticket_ref: subject.ticketRef,
        p_subject_type: subject.subjectType,
        p_event_day: eventDay,
        p_registration_id: subject.registrationId,
        p_wristband_category: bandCategory || null,
        p_wristband_code: bandCode || null,
        p_is_override: isOverride,
        p_override_reason: reason || null,
      });

      if (!rpcErr && rpcRes) {
        if (!rpcRes.ok) {
          setStatusMessage({
            type: "error",
            text: rpcRes.duplicate
              ? `ALREADY CHECKED IN (${subject.ticketRef}) on ${eventDay} at ${new Date(
                  rpcRes.checked_in_at
                ).toLocaleTimeString()} by ${rpcRes.checked_in_by || "staff"}`
              : rpcRes.error || "Check-in blocked.",
          });
          return;
        }
      } else {
        // Fallback when 20261114 migration hasn't been pushed yet
        const { error: insertErr } = await supabase.from("check_ins").insert({
          registration_id: subject.registrationId,
          check_in_type: subject.subjectType === "esports_player" ? "team" : "individual",
          checked_in_by: actorEmail,
          checked_in_at: nowIso,
          notes: `[${eventDay}] ${subject.ticketRef} (${subject.subjectType})${
            bandCategory ? ` · Wristband: ${bandCategory}` : ""
          }${isOverride ? ` · OVERRIDE: ${reason}` : ""}`,
        });
        if (insertErr) throw insertErr;
      }

      // Sync check_in_status on primary table
      if (subject.subjectType === "visitor") {
        await supabase
          .from("visitor_registrations")
          .update({
            check_in_status: "checked_in",
            checked_in_at: nowIso,
            checked_in_by: actorEmail,
          })
          .eq("id", subject.id);
      } else if (subject.subjectType === "esports_player") {
        await supabase
          .from("players")
          .update({ check_in_status: "checked_in", check_in_at: nowIso })
          .eq("id", subject.id);
      } else if (subject.subjectType === "participation") {
        await supabase
          .from("participation_registrations")
          .update({
            check_in_status: "checked_in",
            checked_in_at: nowIso,
            checked_in_by: actorEmail,
          })
          .eq("id", subject.id);
      }

      setStatusMessage({
        type: "success",
        text: `${isOverride ? "Supervisor Override " : ""}Check-in complete for ${subject.name} (${
          subject.ticketRef
        }) on ${eventDay}${bandCategory ? ` · Wristband: ${bandCategory}` : ""}.`,
      });
      await fetchEntryData();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Check-in failed: ${err?.message || "Database error"}`,
      });
    }
  };

  const handleConfirmOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideTarget || !overrideReason.trim()) return;
    setSubmittingOverride(true);
    await executeCheckIn(overrideTarget.subject, true, overrideReason.trim());
    setSubmittingOverride(false);
    setOverrideTarget(null);
    setOverrideReason("");
  };

  const handleReplaceWristband = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceTarget || !replaceReason.trim()) return;
    setSubmittingReplace(true);
    const nowIso = new Date().toISOString();
    try {
      await supabase
        .from("wristband_issuances")
        .update({
          status: "replaced",
          replacement_reason: replaceReason.trim(),
          replaced_by: user?.id || null,
          replaced_at: nowIso,
        })
        .eq("id", replaceTarget.existing.id);

      const nextCatName = replaceCategoryName || replaceTarget.existing.category_name;
      const catObj = wristbandCategories.find((c) => c.name === nextCatName);
      await supabase.from("wristband_issuances").insert({
        ticket_ref: replaceTarget.subject.ticketRef,
        registration_id: replaceTarget.subject.registrationId,
        subject_type: replaceTarget.subject.subjectType,
        event_day: eventDay,
        category_id: catObj?.id || null,
        category_name: nextCatName,
        wristband_code: replaceCode.trim() || null,
        issued_by: user?.id || null,
        issued_by_email: user?.email || "entry-staff@supernova.edu",
        issued_at: nowIso,
        status: "active",
      });

      await supabase.from("audit_logs").insert({
        actor_id: user?.id || null,
        action: "wristband_replaced",
        entity_type: "wristband_issuances",
        entity_id: replaceTarget.existing.id,
        metadata: {
          ticket_ref: replaceTarget.subject.ticketRef,
          event_day: eventDay,
          reason: replaceReason.trim(),
          next_category: nextCatName,
        },
      });

      setStatusMessage({
        type: "success",
        text: `Wristband replaced for ${replaceTarget.subject.name} (${nextCatName}). Reason logged.`,
      });
      setReplaceTarget(null);
      setReplaceReason("");
      setReplaceCode("");
      await fetchEntryData();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Wristband replacement failed: ${err?.message || "Error"}`,
      });
    } finally {
      setSubmittingReplace(false);
    }
  };

  const handleCreateBandCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageWristbands || !newBandName.trim()) return;
    setSavingBand(true);
    try {
      const slug = newBandName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      const { error } = await supabase.from("wristband_categories").insert({
        name: newBandName.trim(),
        slug,
        color_hex: newBandColor,
        badge_label: newBandName.trim().toUpperCase().slice(0, 12),
        description: newBandDesc.trim() || null,
        is_active: true,
        sort_order: wristbandCategories.length + 1,
      });
      if (error) throw error;
      setNewBandName("");
      setNewBandDesc("");
      setStatusMessage({ type: "success", text: "Wristband category added." });
      await fetchEntryData();
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Could not create category: ${err?.message || "Migration required"}`,
      });
    } finally {
      setSavingBand(false);
    }
  };

  const handleToggleBandCategory = async (cat: WristbandCategory) => {
    if (!canManageWristbands) return;
    await supabase
      .from("wristband_categories")
      .update({ is_active: !cat.is_active })
      .eq("id", cat.id);
    await fetchEntryData();
  };

  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateWalkIn || !walkInName.trim()) return;
    setWalkInSubmitting(true);
    setStatusMessage(null);
    try {
      const ref = `SN3-VIS-WALK-${Math.floor(100000 + Math.random() * 900000)}`;
      const nowIso = new Date().toISOString();
      const actor = user?.email || "gate-staff@supernova.edu";

      const { data: inserted, error } = await supabase
        .from("visitor_registrations")
        .insert({
          registration_ref: ref,
          full_name: walkInName.trim(),
          phone: walkInPhone.trim() || "+91 00000 00000",
          email: walkInEmail.trim() || "walkin@supernova.org",
          institution: walkInInstitution.trim() || "Walk-in Guest",
          visitor_category: "General visitor",
          visitor_count: walkInCount,
          status: "confirmed",
          admin_notes: `On-the-spot walk-in at Gate Desk by ${actor}`,
          check_in_status: "checked_in",
          checked_in_at: nowIso,
          checked_in_by: actor,
          submitted_at: nowIso,
        })
        .select();

      if (error) throw error;
      const newId = Array.isArray(inserted) ? inserted[0]?.id : (inserted as any)?.id;

      await executeCheckIn(
        {
          key: `vis-${newId}`,
          id: newId,
          registrationId: newId,
          ticketRef: ref,
          name: walkInName.trim(),
          phone: walkInPhone.trim(),
          email: walkInEmail.trim(),
          institution: walkInInstitution.trim() || "Walk-in Guest",
          subjectType: "visitor",
          categoryOrGame: "Walk-in Visitor",
          count: walkInCount,
          status: "confirmed",
        },
        false,
        ""
      );

      setSearchQuery(ref);
      setWalkInName("");
      setWalkInPhone("");
      setWalkInEmail("");
      setWalkInInstitution("");
      setWalkInCount(1);
      setWalkInOpen(false);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Walk-in failed: ${err?.message || "Error"}` });
    } finally {
      setWalkInSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 inline-block">
            Ticket Verification / Gate Entry
          </span>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            Ticket Verification / Gate Entry
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 m-0">
            Scan QR codes or search ticket numbers to verify authenticity (VALID / ALREADY USED / INVALID), prevent duplicate entry, and issue wristbands.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />

          {canManageWristbands && (
            <button
              type="button"
              onClick={() => setConfigOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Settings size={14} />
              <span>Wristband Config</span>
            </button>
          )}

          {canCreateWalkIn && (
            <button
              type="button"
              onClick={() => setWalkInOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Walk-in Pass</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setQrModalOpen(true)}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            <QrCode size={15} />
            <span>Scan Camera QR</span>
          </button>

          <button
            type="button"
            onClick={fetchEntryData}
            aria-label="Refresh entry records"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Event Day & Policy Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase text-slate-500 mr-1">
            <Calendar size={14} /> Active Session:
          </span>
          {(["2026-11-20", "2026-11-21"] as EventDaySession[]).map((day, idx) => (
            <button
              key={day}
              type="button"
              onClick={() => setEventDay(day)}
              className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold font-mono cursor-pointer transition-colors ${
                eventDay === day
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Day {idx + 1} · {day}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {canScanVisitor && canScanEsports && (
            <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
              {[
                { id: "all", label: "All Passes" },
                { id: "visitor", label: "Visitors" },
                { id: "esports_player", label: "Esports" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrackFilter(t.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    trackFilter === t.id ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {canScanEsports && (
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={allowUnselectedEntry}
                onChange={(e) => setAllowUnselectedEntry(e.target.checked)}
                className="accent-blue-600"
              />
              <span>Allow general entry for approved non-selected esports squads</span>
            </label>
          )}
        </div>
      </div>

      {/* Entry Statistics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-slate-500 font-semibold block">
            Registered Visitors
          </span>
          <span className="text-2xl font-display font-black text-slate-900 tabular-nums mt-1 block">
            {stats.totalRegisteredVisitors}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">Excludes auto-linked esports</span>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-emerald-700 font-semibold block">
            Checked-In Visitors
          </span>
          <span className="text-2xl font-display font-black text-emerald-700 tabular-nums mt-1 block">
            {stats.totalVisitorsCheckedIn}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            Day 1: {stats.entriesByDay["2026-11-20"]} · Day 2: {stats.entriesByDay["2026-11-21"]}
          </span>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-purple-700 font-semibold block">
            Esports Players Verified
          </span>
          <span className="text-2xl font-display font-black text-purple-700 tabular-nums mt-1 block">
            {stats.totalEsportsPlayersCheckedIn}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            Selected roster: {stats.totalEsportsPlayersExpected}
          </span>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
          <span className="text-[11px] font-mono uppercase text-amber-700 font-semibold block">
            Pending Verification
          </span>
          <span className="text-2xl font-display font-black text-amber-700 tabular-nums mt-1 block">
            {stats.pendingVerificationVisitors + stats.pendingVerificationEsportsPlayers}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">Awaiting gate arrival</span>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs col-span-2 lg:col-span-1">
          <span className="text-[11px] font-mono uppercase text-blue-700 font-semibold block">
            Wristbands Issued
          </span>
          <span className="text-2xl font-display font-black text-blue-700 tabular-nums mt-1 block">
            {Object.values(stats.wristbandsByCategory).reduce((a, b) => a + b, 0)}
          </span>
          <span className="text-[11px] text-slate-500 font-mono truncate block">
            {Object.entries(stats.wristbandsByCategory)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ") || "0 active"}
          </span>
        </div>
      </div>

      {/* Search & DB Ticket Verification Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleVerifyGateInput(searchQuery);
        }}
        className="flex flex-col sm:flex-row gap-2.5"
      >
        <div className="relative flex-1">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim()) {
                setGateVerification(null);
              }
            }}
            placeholder="Scan QR or enter Ticket Reference (SN3-VIS-..., SN3-26-...), Name, Team, or Phone..."
            className="w-full h-14 pl-12 pr-12 text-sm sm:text-base font-medium bg-white border-2 border-slate-200 focus:border-blue-600 rounded-2xl shadow-2xs text-slate-900 placeholder-slate-400 focus:outline-hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setRawQrInput("");
                setGateVerification(null);
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={verifyingGate || !searchQuery.trim()}
          className="h-14 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0"
        >
          <ShieldCheck size={16} />
          <span>{verifyingGate ? "Verifying..." : "Verify Ticket"}</span>
        </button>
      </form>

      {/* Authoritative DB Ticket Verification Verdict Card */}
      {gateVerification && (
        <div
          className={`rounded-2xl border-2 p-5 shadow-xs space-y-3 ${
            gateVerification.verdict === "VALID"
              ? "bg-emerald-50 border-emerald-400"
              : gateVerification.verdict === "ALREADY USED"
              ? "bg-amber-50 border-amber-400"
              : "bg-rose-50 border-rose-400"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`px-3 py-1 rounded-lg font-mono text-xs font-black uppercase tracking-wider ${
                  gateVerification.verdict === "VALID"
                    ? "bg-emerald-700 text-white"
                    : gateVerification.verdict === "ALREADY USED"
                    ? "bg-amber-700 text-white"
                    : "bg-rose-700 text-white"
                }`}
              >
                {gateVerification.verdict}
              </span>
              {gateVerification.ticket && (
                <>
                  <span className="font-mono text-base font-black text-slate-900">
                    {gateVerification.ticket.ticket_ref}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/80 border border-slate-300 font-mono text-[10px] font-bold uppercase text-slate-700">
                    {gateVerification.ticket.registration_category}
                  </span>
                </>
              )}
            </div>

            {gateVerification.can_check_in && gateVerification.ticket && (
              <button
                type="button"
                disabled={checkingInGate}
                onClick={handleAuthoritativeGateCheckIn}
                className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle size={16} />
                <span>{checkingInGate ? "Checking In..." : `Check In Ticket (${eventDay.slice(-2)} Nov)`}</span>
              </button>
            )}
          </div>

          {gateVerification.ticket ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-800 pt-2 border-t border-black/10">
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Holder / Team</span>
                <strong className="text-sm text-slate-900">{gateVerification.ticket.display_name}</strong>
                {gateVerification.ticket.subtitle && (
                  <span className="block text-slate-600">{gateVerification.ticket.subtitle}</span>
                )}
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Institution</span>
                <span className="font-semibold">{gateVerification.ticket.institution || "General"}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Verification Detail</span>
                <span className="font-semibold block">{gateVerification.reason || gateVerification.error}</span>
                {gateVerification.ticket.checked_in_by_email && (
                  <span className="text-[11px] font-mono text-slate-600 block">
                    Checked in by: {gateVerification.ticket.checked_in_by_email}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs sm:text-sm font-semibold text-rose-900 m-0">
              {gateVerification.reason || gateVerification.error}
            </p>
          )}
        </div>
      )}

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between border ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMessage.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage(null)} className="p-1 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Search Results */}
      {searchQuery.trim() === "" ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
          <QrCode size={32} className="mx-auto mb-2 text-slate-400" />
          <h3 className="text-base font-bold text-slate-900 m-0">Ready for Gate Verification ({eventDay})</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Tap "Scan Camera QR" or search by Ticket ID, Attendee Name, or Esports Player Code above.
          </p>
          {Object.keys(stats.checkInsByStaff).length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-slate-500">
              <span className="font-bold text-slate-700">Check-ins by staff:</span>
              {Object.entries(stats.checkInsByStaff).map(([staff, cnt]) => (
                <span key={staff} className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                  {staff}: {cnt}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-8 text-center">
          <XCircle size={32} className="mx-auto mb-2 text-rose-500" />
          <h3 className="text-base font-bold text-rose-900 m-0">No Matching Ticket Found</h3>
          <p className="text-xs text-slate-600 mt-1 mb-4">
            No pass matching "{searchQuery}" within your active gate permissions.
          </p>
          {canCreateWalkIn && (
            <button
              type="button"
              onClick={() => {
                setWalkInName(searchQuery);
                setWalkInOpen(true);
              }}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Issue Walk-in Visitor Pass</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((subject) => {
            const existingDaily = getDailyCheckinForSubject(subject);
            const activeBand = getActiveWristband(subject.ticketRef);
            const selectedBand = getDefaultBandForSubject(subject);

            const verdict = (() => {
              if (subject.subjectType === "esports_player") {
                const teamRow = esportsTeamsRaw.find((t) => t.id === subject.registrationId) || null;
                const playerRow = esportsPlayersRaw.find((p) => p.id === subject.id) || null;
                return evaluateEsportsPlayerEntry({
                  team: teamRow,
                  player: playerRow,
                  playerTicketRef: subject.ticketRef,
                  gameTitle: teamRow?.games?.title || subject.categoryOrGame || "Esports",
                  checkIns: checkins,
                  eventDay,
                  allowApprovedUnselectedEntryOnly: allowUnselectedEntry,
                });
              }
              if (subject.subjectType === "visitor") {
                const visitorRow = visitorsRaw.find((v) => v.id === subject.id) || null;
                return evaluateVisitorEntry({
                  visitor: visitorRow,
                  checkIns: checkins,
                  eventDay,
                  requestedTrack: trackFilter === "esports_player" ? "esports" : "visitor",
                });
              }
              const confirmed = subject.status === "confirmed";
              return {
                decision: !confirmed
                  ? ("denied" as const)
                  : existingDaily
                  ? ("already_checked_in" as const)
                  : ("eligible" as const),
                reason: !confirmed
                  ? `Participation registration is "${subject.status}". Only confirmed passes may enter.`
                  : existingDaily
                  ? `ALREADY CHECKED IN on ${eventDay}.`
                  : `Valid confirmed participation pass for ${eventDay}.`,
                subjectType: "visitor" as const,
                ticketRef: subject.ticketRef,
                holderName: subject.name,
                categoryLabel: subject.categoryOrGame,
                recommendedWristbandSlug: "general-visitor",
                tournamentEligible: false,
              };
            })();

            const canAct =
              subject.subjectType === "visitor"
                ? canCheckInVisitor
                : subject.subjectType === "esports_player"
                ? canCheckInEsports
                : canCheckInParticipation;

            const isDenied = verdict.decision === "denied";
            const isDuplicate = verdict.decision === "already_checked_in";
            const isEntryOnly = verdict.decision === "entry_only_no_tournament";
            const headline =
              verdict.decision === "eligible"
                ? "Verified Eligible"
                : verdict.decision === "entry_only_no_tournament"
                ? "Entry Only (No Match)"
                : verdict.decision === "already_checked_in"
                ? "Already Checked In"
                : "Entry Denied";

            return (
              <div
                key={subject.key}
                className={`bg-white border rounded-2xl p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isDuplicate
                    ? "border-amber-400 bg-amber-50/20"
                    : isDenied
                    ? "border-rose-300 bg-rose-50/20"
                    : "border-slate-200/90"
                }`}
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${
                        subject.subjectType === "visitor"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : subject.subjectType === "esports_player"
                          ? "bg-purple-50 text-purple-700 border-purple-200"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}
                    >
                      {subject.subjectType === "visitor"
                        ? "Visitor Pass"
                        : subject.subjectType === "esports_player"
                        ? "Esports Player"
                        : "Project Exhibitor"}
                    </span>

                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                      {subject.ticketRef}
                    </span>

                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                        isDenied
                          ? "bg-rose-50 text-rose-800 border-rose-200"
                          : isDuplicate
                          ? "bg-amber-50 text-amber-800 border-amber-300"
                          : isEntryOnly
                          ? "bg-amber-50 text-amber-900 border-amber-300"
                          : "bg-emerald-50 text-emerald-800 border-emerald-200"
                      }`}
                    >
                      {headline}
                    </span>

                    {subject.subjectType === "esports_player" && (
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded ${
                          verdict.tournamentEligible
                            ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {verdict.tournamentEligible ? "Tournament Eligible" : "No Match Eligibility"}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-slate-900 m-0">
                    {subject.name}{" "}
                    {subject.gamerTag && (
                      <span className="text-xs font-mono text-purple-700 font-semibold">
                        ({subject.gamerTag})
                      </span>
                    )}
                  </h3>

                  <div className="flex items-center gap-4 flex-wrap text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={12} /> {subject.institution}
                    </span>
                    {subject.phone && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Phone size={12} /> {subject.phone}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Gamepad2 size={12} /> {subject.categoryOrGame}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 m-0">{verdict.reason}</p>

                  {activeBand && (
                    <div className="inline-flex items-center gap-2 text-xs font-mono bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg text-slate-800 mt-1">
                      <Tag size={12} className="text-blue-600" />
                      <span>
                        Active Wristband: <strong>{activeBand.category_name}</strong>
                        {activeBand.wristband_code ? ` · #${activeBand.wristband_code}` : ""}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Controls */}
                <div className="shrink-0 flex flex-col sm:items-end gap-2 min-w-[240px]">
                  {!isDenied && !isDuplicate && canAct && (
                    <div className="w-full space-y-2">
                      {canIssueWristband && (
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            aria-label="Wristband Category"
                            value={selectedBand}
                            onChange={(e) =>
                              setSelectedBandByKey((prev) => ({ ...prev, [subject.key]: e.target.value }))
                            }
                            className="h-10 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800"
                          >
                            {wristbandCategories
                              .filter((c) => c.is_active)
                              .map((c) => (
                                <option key={c.id} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Band ID (opt)"
                            value={bandCodeByKey[subject.key] || ""}
                            onChange={(e) =>
                              setBandCodeByKey((prev) => ({ ...prev, [subject.key]: e.target.value }))
                            }
                            className="h-10 px-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono text-slate-900"
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => executeCheckIn(subject, false, "")}
                        className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold cursor-pointer"
                      >
                        <CheckCircle size={16} />
                        <span>Verify & Check In ({eventDay.slice(-2)} Nov)</span>
                      </button>
                    </div>
                  )}

                  {isDuplicate && (
                    <div className="flex flex-col sm:items-end gap-2 w-full">
                      <div className="w-full p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-semibold text-center">
                        ALREADY CHECKED IN ON {eventDay}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {activeBand && canIssueWristband && (
                          <button
                            type="button"
                            onClick={() => {
                              setReplaceTarget({ subject, existing: activeBand });
                              setReplaceCategoryName(activeBand.category_name);
                            }}
                            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            <Repeat size={13} />
                            <span>Replace Band</span>
                          </button>
                        )}
                        {canOverrideCheckin && (
                          <button
                            type="button"
                            onClick={() =>
                              setOverrideTarget({
                                subject,
                                priorAt: existingDaily?.checked_in_at,
                                priorBy: existingDaily?.checked_in_by_email || existingDaily?.checked_in_by,
                              })
                            }
                            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                          >
                            <ShieldCheck size={13} />
                            <span>Supervisor Override</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {isDenied && (
                    <div className="w-full p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold text-center">
                      ENTRY DENIED — VERIFICATION FAILED
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Real Camera QR Scanner Modal */}
      <QrTicketScannerModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        onScanSuccess={(rawPayloadOrRef) => {
          void handleVerifyGateInput(rawPayloadOrRef);
        }}
        title={
          canScanEsports && !canScanVisitor
            ? "Scan Esports Player QR"
            : "Scan Festival Pass QR"
        }
      />

      {/* Supervisor Override Modal */}
      {overrideTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setOverrideTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">Supervisor Duplicate Override</h3>
                <p className="text-xs text-slate-500 m-0">{overrideTarget.subject.ticketRef}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 m-0 leading-relaxed">
              This pass was already checked in on {eventDay}. Provide a mandatory audit reason to authorize re-entry override.
            </p>
            <form onSubmit={handleConfirmOverride} className="space-y-3">
              <textarea
                required
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Lost wristband replaced after ID check at Main Desk"
                className="w-full p-3 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:border-blue-600"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOverrideTarget(null)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOverride}
                  className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingOverride ? "Logging..." : "Authorize Override"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wristband Replacement Modal */}
      {replaceTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setReplaceTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 m-0">Replace Wristband</h3>
            <p className="text-xs text-slate-600 m-0">
              Logging replacement for <strong>{replaceTarget.subject.name}</strong> ({replaceTarget.subject.ticketRef}).
            </p>
            <form onSubmit={handleReplaceWristband} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={replaceCategoryName}
                  onChange={(e) => setReplaceCategoryName(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs"
                >
                  {wristbandCategories
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">New Physical Band ID (Optional)</label>
                <input
                  type="text"
                  value={replaceCode}
                  onChange={(e) => setReplaceCode(e.target.value)}
                  placeholder="e.g. WB-402"
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Replacement Reason *</label>
                <textarea
                  required
                  rows={2}
                  value={replaceReason}
                  onChange={(e) => setReplaceReason(e.target.value)}
                  placeholder="e.g. Band torn during equipment setup"
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReplaceTarget(null)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReplace}
                  className="min-h-[40px] px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                >
                  {submittingReplace ? "Saving..." : "Confirm Replacement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Super Admin Wristband Category Config Modal */}
      {configOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setConfigOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 m-0">Wristband Categories</h3>
              <button type="button" onClick={() => setConfigOpen(false)} className="p-1 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {wristbandCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-4 h-4 rounded-full shrink-0 border border-slate-300"
                      style={{ backgroundColor: cat.color_hex }}
                    />
                    <div>
                      <strong className="text-slate-900 block">{cat.name}</strong>
                      <span className="text-[11px] text-slate-500">{cat.description || cat.slug}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleBandCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase cursor-pointer ${
                      cat.is_active
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {cat.is_active ? "Active" : "Disabled"}
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleCreateBandCategory} className="space-y-3 pt-3 border-t border-slate-200">
              <p className="text-xs font-bold text-slate-800 m-0">Add Wristband Category</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={newBandName}
                  onChange={(e) => setNewBandName(e.target.value)}
                  placeholder="e.g. VIP / Volunteer"
                  className="col-span-2 h-10 px-3 rounded-xl border border-slate-300 text-xs"
                />
                <input
                  type="color"
                  value={newBandColor}
                  onChange={(e) => setNewBandColor(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-300 p-1 cursor-pointer"
                />
              </div>
              <input
                type="text"
                value={newBandDesc}
                onChange={(e) => setNewBandDesc(e.target.value)}
                placeholder="Optional access note"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs"
              />
              <button
                type="submit"
                disabled={savingBand}
                className="w-full min-h-[40px] rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
              >
                {savingBand ? "Saving..." : "Add Category"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Walk-in Modal */}
      {walkInOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
          onClick={() => setWalkInOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-slate-900"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900 m-0">Issue Walk-in Visitor Pass</h3>
              <button type="button" onClick={() => setWalkInOpen(false)} className="p-1.5 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Party Size</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={walkInCount}
                    onChange={(e) => setWalkInCount(Number(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Institution</label>
                  <input
                    type="text"
                    value={walkInInstitution}
                    onChange={(e) => setWalkInInstitution(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setWalkInOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={walkInSubmitting}
                  className="min-h-[40px] px-4 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                >
                  {walkInSubmitting ? "Issuing..." : "Confirm & Check In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
