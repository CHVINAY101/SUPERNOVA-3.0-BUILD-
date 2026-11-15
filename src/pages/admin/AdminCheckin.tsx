import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { LiveGateQrScanner } from "@/components/admin/LiveGateQrScanner";
import {
  DEFAULT_WRISTBAND_CATEGORIES,
  buildCheckInInsertPayload,
  buildRegistrationCheckInPatch,
  computeEntryStatistics,
  evaluateEsportsPlayerEntry,
  evaluateVisitorEntry,
  formatCheckInDatabaseError,
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
import {
  checkinGateTicket,
  issueTicketForRegistration,
  submitVisitorAndIssueTicket,
  verifyGateTicket,
} from "@/lib/ticketClient";
import { buildTicketQrContent, downloadTicketPdfFile } from "@/lib/ticketPdfService";
import {
  FACULTY_DESIGNATION_OPTIONS,
  VISITOR_CATEGORY_CARDS,
  buildVisitorDisplaySubtitle,
  getDbCategoryFromId,
  normalizeVisitorCategory,
  resolveFacultyDesignationValue,
  validateVisitorFormFields,
  type CanonicalVisitorCategory,
  type VisitorCategoryId,
} from "@/lib/visitorCategories";
import {
  Search,
  CheckCircle,
  CheckCircle2,
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
  Camera,
  Download,
  Mail,
  GraduationCap,
  UserCheck,
  Briefcase,
} from "lucide-react";

const SUGGESTED_INSTITUTIONS = [
  "The National College, Basavanagudi",
  "National PU College, Jayanagar",
  "National PU College, Basavanagudi",
  "National High School, Basavanagudi",
  "National English School",
  "National Degree College, Jayanagar",
  "DR.HNCE",
  "Bangalore University",
];

interface EntrySubject {
  key: string;
  id: string;
  /** ONLY populated for Esports entries referencing public.registrations(id). Null for Visitor. */
  registrationId: string | null;
  visitorRegistrationId?: string | null;
  playerId?: string | null;
  ticketRef: string;
  altTicketRef?: string;
  teamRef?: string;
  name: string;
  gamerTag?: string | null;
  phone?: string;
  email: string;
  institution: string;
  studentClass?: string | null;
  designation?: string | null;
  normalizedCategory?: CanonicalVisitorCategory;
  registrationSource?: "public" | "walk_in";
  subjectType: "visitor" | "esports_player";
  categoryOrGame: string;
  count: number;
  status: RegistrationStatus | string;
  selectionStatus?: TournamentSelectionStatus;
  rosterRole?: string;
  isAutoLinked?: boolean;
  adminNotes?: string | null;
}

interface WalkInIssuedPass {
  registrationId?: string;
  registrationRef: string;
  ticketRef: string;
  qrToken?: string;
  qrDataUrl: string;
  fullName: string;
  email: string;
  visitorCategory: CanonicalVisitorCategory;
  displaySubtitle: string;
  studentClass: string | null;
  designation: string | null;
  institution: string | null;
  checkedInDays: Partial<
    Record<EventDaySession, { at: string; by: string; wristband?: string | null }>
  >;
}

function isMissingRpcError(err: any): boolean {
  const code = String(err?.code || "").toUpperCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    (msg.includes("function") && msg.includes("does not exist"))
  );
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
  const canUseGateScanner = canScanVisitor || canScanEsports;

  const canCheckInGateCategory = useCallback(
    (category?: string | null) => {
      if (category === "visitor") return canCheckInVisitor;
      if (category === "esports") return canCheckInEsports;
      return false;
    },
    [canCheckInVisitor, canCheckInEsports]
  );

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
  const [cameraScannerActive, setCameraScannerActive] = useState(false);
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

  // Walk-in Modal (Uses the 3 Visitor Categories & Shared Conditional Rules)
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInCategoryId, setWalkInCategoryId] = useState<VisitorCategoryId | null>(null);
  const [walkInName, setWalkInName] = useState("");
  const [walkInEmail, setWalkInEmail] = useState("");
  const [walkInStudentClass, setWalkInStudentClass] = useState("");
  const [walkInDesignationOption, setWalkInDesignationOption] = useState("");
  const [walkInCustomDesignation, setWalkInCustomDesignation] = useState("");
  const [walkInInstitution, setWalkInInstitution] = useState("");
  const [walkInErrors, setWalkInErrors] = useState<Record<string, string>>({});
  const [walkInSubmitError, setWalkInSubmitError] = useState<string | null>(null);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);
  const [walkInIssued, setWalkInIssued] = useState<WalkInIssuedPass | null>(null);
  const [walkInBandCategory, setWalkInBandCategory] = useState<string>("");
  const [walkInBandCode, setWalkInBandCode] = useState("");
  const [walkInCheckingIn, setWalkInCheckingIn] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const openWalkInModal = (prefillName = "") => {
    setWalkInCategoryId(null);
    setWalkInName(prefillName);
    setWalkInEmail("");
    setWalkInStudentClass("");
    setWalkInDesignationOption("");
    setWalkInCustomDesignation("");
    setWalkInInstitution("");
    setWalkInErrors({});
    setWalkInSubmitError(null);
    setWalkInIssued(null);
    setWalkInBandCode("");
    setWalkInBandCategory(
      wristbandCategories.find((c) => c.slug === "general-visitor" && c.is_active)?.name ||
        wristbandCategories.find((c) => c.is_active)?.name ||
        "General Visitor"
    );
    setWalkInOpen(true);
  };

  const handleVerifyGateInput = useCallback(
    async (rawOrQuery: string, targetDay: EventDaySession = eventDay) => {
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
        const res = await verifyGateTicket(trimmed, targetDay);
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
    },
    [eventDay]
  );

  const handleSelectEventDay = (day: EventDaySession) => {
    setEventDay(day);
    if (rawQrInput.trim() && gateVerification) {
      void handleVerifyGateInput(rawQrInput, day);
    }
  };

  const handleAuthoritativeGateCheckIn = async () => {
    if (!gateVerification?.ticket?.ticket_ref) return;
    const tkt = gateVerification.ticket;
    if (!canCheckInGateCategory(tkt.registration_category)) {
      setStatusMessage({
        type: "error",
        text: `Forbidden: Your staff role cannot confirm check-in for "${tkt.registration_category}" passes.`,
      });
      return;
    }

    setCheckingInGate(true);
    setStatusMessage(null);
    try {
      const parsed = parseSecureQrPayload(rawQrInput);
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

      if (res.ok && res.verdict === "VALID") {
        setGateVerification({
          ...res,
          verdict: "VALID",
          can_check_in: false,
          reason: `Checked in atomically for ${eventDay} — pass is now marked as used.`,
          ticket: {
            ...tkt,
            checked_in_at: res.checked_in_at || new Date().toISOString(),
            checked_in_by_email: res.checked_in_by || user?.email || null,
          },
        });
        setStatusMessage({
          type: "success",
          text: `Gate Entry Approved & Checked In: ${tkt.display_name} (${tkt.ticket_ref}) on ${eventDay}.`,
        });
        await fetchEntryData();
      } else {
        setGateVerification({
          ...res,
          can_check_in: false,
          ticket: {
            ...tkt,
            checked_in_at: res.checked_in_at || tkt.checked_in_at || null,
            checked_in_by_email: res.checked_in_by || tkt.checked_in_by_email || null,
          },
        });
        setStatusMessage({
          type: "error",
          text: res.error || res.reason || `Entry blocked: ${res.verdict}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err?.message || "Gate check-in failed.",
      });
    } finally {
      setCheckingInGate(false);
    }
  };

  const fetchEntryData = useCallback(async () => {
    try {
      const [visRes, espRes, playersRes, ciRes, wbCatRes, wbIssRes] = await Promise.all([
        canScanVisitor
          ? supabase.from("visitor_registrations").select("*").order("submitted_at", { ascending: false })
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
  }, [canScanVisitor, canScanEsports]);

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
        const primaryRef = v.ticket_ref || v.registration_ref;
        const altRef =
          v.registration_ref && v.ticket_ref && v.registration_ref !== v.ticket_ref
            ? v.registration_ref
            : undefined;
        const isWalkIn =
          v.registration_source === "walk_in" ||
          String(v.visitor_category || "").toLowerCase().includes("walk") ||
          String(v.admin_notes || "").includes("[WALK_IN]") ||
          String(v.registration_ref || "").toUpperCase().startsWith("SN3-VIS-WALK");
        const normalizedCategory = normalizeVisitorCategory(
          v.visitor_category,
          v.student_class,
          v.designation
        );
        list.push({
          key: `vis-${v.id}`,
          id: v.id,
          registrationId: null,
          visitorRegistrationId: v.id,
          playerId: null,
          ticketRef: primaryRef,
          altTicketRef: altRef,
          name: v.full_name,
          email: v.email || "",
          institution: v.institution || "",
          studentClass: v.student_class || null,
          designation: v.designation || null,
          normalizedCategory,
          registrationSource: isWalkIn ? "walk_in" : "public",
          subjectType: "visitor",
          categoryOrGame: buildVisitorDisplaySubtitle({
            visitorCategory: v.visitor_category,
            studentClass: v.student_class,
            designation: v.designation,
          }),
          count: 1,
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
            visitorRegistrationId: null,
            playerId: null,
            ticketRef: team.captain_ticket_ref || team.registration_ref,
            altTicketRef:
              team.captain_ticket_ref && team.captain_ticket_ref !== team.registration_ref
                ? team.registration_ref
                : undefined,
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
              visitorRegistrationId: null,
              playerId: p.id,
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

    return list;
  }, [visitorsRaw, esportsTeamsRaw, esportsPlayersRaw, canScanVisitor, canScanEsports]);

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
        s.ticketRef.toLowerCase().includes(q) ||
        Boolean(s.altTicketRef && s.altTicketRef.toLowerCase().includes(q)) ||
        Boolean(s.teamRef && s.teamRef.toLowerCase().includes(q));
      if (s.isAutoLinked && !refMatches) return false;

      return (
        refMatches ||
        s.name.toLowerCase().includes(q) ||
        (s.gamerTag && s.gamerTag.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.studentClass && s.studentClass.toLowerCase().includes(q)) ||
        (s.designation && s.designation.toLowerCase().includes(q)) ||
        (s.normalizedCategory && s.normalizedCategory.toLowerCase().includes(q)) ||
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
        return (
          c.ticket_ref.toLowerCase() === subject.ticketRef.toLowerCase() ||
          Boolean(subject.altTicketRef && c.ticket_ref.toLowerCase() === subject.altTicketRef.toLowerCase())
        );
      }
      if (subject.subjectType === "visitor") {
        return c.visitor_registration_id === subject.id || c.registration_id === subject.id;
      }
      if (subject.playerId && c.player_id) {
        return c.player_id === subject.playerId;
      }
      return Boolean(subject.registrationId && c.registration_id === subject.registrationId);
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
      // Try atomic SECURITY DEFINER RPC first.
      // Only pass p_registration_id for esports entries (public.registrations.id);
      // visitor entries resolve via p_ticket_ref / visitor_registration_id on the server
      // so check_ins.registration_id never receives a wrong-table UUID.
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("perform_event_checkin", {
        p_ticket_ref: subject.ticketRef,
        p_subject_type: subject.subjectType,
        p_event_day: eventDay,
        p_registration_id: subject.subjectType === "esports_player" ? subject.registrationId : null,
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
      } else if (isMissingRpcError(rpcErr)) {
        // Fallback only when RPC migration hasn't been pushed yet — strictly preserve
        // check_ins_registration_id_fkey by mapping each category to its proper FK column
        // and never passing email strings into UUID checked_in_by.
        const fullPayload = buildCheckInInsertPayload({
          registrationId: subject.registrationId,
          visitorRegistrationId: subject.visitorRegistrationId,
          playerId: subject.playerId,
          ticketRef: subject.ticketRef,
          subjectType: subject.subjectType,
          eventDay,
          actorUserId: user?.id,
          actorEmail,
          checkedInAt: nowIso,
          wristbandCategory: bandCategory,
          wristbandCode: bandCode,
          isOverride,
          overrideReason: reason,
          includeExtendedColumns: true,
        });
        const { error: insertErr } = await supabase.from("check_ins").insert(fullPayload);
        if (insertErr) throw insertErr;
      } else if (rpcErr) {
        throw rpcErr;
      }

      // Sync check_in_status on primary table (UUID-safe checked_in_by)
      if (subject.subjectType === "visitor") {
        const patch = buildRegistrationCheckInPatch({
          checkedIn: true,
          actorUserId: user?.id,
          actorEmail,
          checkedInAt: nowIso,
          includeEmailColumn: true,
        });
        const { error: visErr } = await supabase
          .from("visitor_registrations")
          .update(patch)
          .eq("id", subject.id);
        if (visErr && (visErr.code === "42703" || String(visErr.message || "").includes("checked_in_by_email"))) {
          await supabase
            .from("visitor_registrations")
            .update(
              buildRegistrationCheckInPatch({
                checkedIn: true,
                actorUserId: user?.id,
                actorEmail,
                checkedInAt: nowIso,
                includeEmailColumn: false,
              })
            )
            .eq("id", subject.id);
        }
      } else if (subject.subjectType === "esports_player") {
        if (subject.playerId) {
          await supabase
            .from("players")
            .update({ check_in_status: "checked_in", check_in_at: nowIso })
            .eq("id", subject.playerId);
        }
        if (subject.registrationId) {
          const patch = buildRegistrationCheckInPatch({
            checkedIn: true,
            actorUserId: user?.id,
            actorEmail,
            checkedInAt: nowIso,
            includeEmailColumn: true,
          });
          const { error: regErr } = await supabase
            .from("registrations")
            .update(patch)
            .eq("id", subject.registrationId);
          if (regErr && (regErr.code === "42703" || String(regErr.message || "").includes("checked_in_by_email"))) {
            await supabase
              .from("registrations")
              .update(
                buildRegistrationCheckInPatch({
                  checkedIn: true,
                  actorUserId: user?.id,
                  actorEmail,
                  checkedInAt: nowIso,
                  includeEmailColumn: false,
                })
              )
              .eq("id", subject.registrationId);
          }
        }
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
        text: `Check-in failed: ${formatCheckInDatabaseError(err)}`,
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
        registration_id:
          replaceTarget.subject.visitorRegistrationId ||
          replaceTarget.subject.registrationId ||
          replaceTarget.subject.id,
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

  const clearWalkInFieldError = (key: string) => {
    setWalkInErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateWalkIn || walkInSubmitting) return;

    const errors = validateVisitorFormFields({
      categoryId: walkInCategoryId,
      fullName: walkInName,
      email: walkInEmail,
      studentClass: walkInStudentClass,
      designationOption: walkInDesignationOption,
      customDesignation: walkInCustomDesignation,
      institution: walkInInstitution,
    });

    if (Object.keys(errors).length > 0 || !walkInCategoryId) {
      setWalkInErrors(errors);
      setWalkInSubmitError(Object.values(errors)[0] || "Please complete all required fields.");
      return;
    }

    setWalkInErrors({});
    setWalkInSubmitError(null);
    setWalkInSubmitting(true);

    try {
      const canonicalCategory = getDbCategoryFromId(walkInCategoryId);
      const cleanName = walkInName.trim();
      const cleanEmail = walkInEmail.trim().toLowerCase();
      const cleanClass = walkInCategoryId === "student" ? walkInStudentClass.trim() : null;
      const cleanDesignation =
        walkInCategoryId === "faculty"
          ? resolveFacultyDesignationValue(walkInDesignationOption, walkInCustomDesignation)
          : null;
      const cleanInstitution = walkInInstitution.trim() || null;
      const displaySubtitle = buildVisitorDisplaySubtitle({
        visitorCategory: canonicalCategory,
        studentClass: cleanClass,
        designation: cleanDesignation,
      });

      const submissionRes = await submitVisitorAndIssueTicket({
        fullName: cleanName,
        email: cleanEmail,
        phone: null,
        institution: cleanInstitution,
        visitorCategory: canonicalCategory,
        studentClass: cleanClass,
        designation: cleanDesignation,
        daysAttending: "Both",
        registrationSource: "walk_in",
      });

      let ticket = submissionRes.ticket || null;
      if (!ticket && submissionRes.registrationId) {
        const issued = await issueTicketForRegistration("visitor", submissionRes.registrationId);
        if (issued.ok && issued.ticket) {
          ticket = issued.ticket;
        }
      }

      const ticketRef = ticket?.ticket_ref || submissionRes.registrationRef;
      const qrToken = ticket?.qr_token;
      const qrPayload = buildTicketQrContent(ticketRef, qrToken);
      const qrDataUrl = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "H",
        margin: 1,
        width: 240,
        color: { dark: "#0B1120", light: "#FFFFFF" },
      });

      setWalkInIssued({
        registrationId: submissionRes.registrationId,
        registrationRef: submissionRes.registrationRef,
        ticketRef,
        qrToken,
        qrDataUrl,
        fullName: cleanName,
        email: cleanEmail,
        visitorCategory: canonicalCategory,
        displaySubtitle,
        studentClass: cleanClass,
        designation: cleanDesignation,
        institution: cleanInstitution,
        checkedInDays: {},
      });

      setSearchQuery(ticketRef);
      setStatusMessage({
        type: "success",
        text: `Walk-in visitor pass issued for ${cleanName} (${canonicalCategory} · ${ticketRef}). Ready for PDF download or gate check-in.`,
      });
      await fetchEntryData();
    } catch (err: any) {
      setWalkInSubmitError(formatCheckInDatabaseError(err) || err?.message || "Walk-in registration failed.");
    } finally {
      setWalkInSubmitting(false);
    }
  };

  const handleWalkInImmediateCheckIn = async () => {
    if (!walkInIssued || !canCheckInVisitor || walkInCheckingIn) return;
    if (walkInIssued.checkedInDays[eventDay]) return;

    setWalkInCheckingIn(true);
    setWalkInSubmitError(null);
    const bandCategory = canIssueWristband
      ? walkInBandCategory ||
        wristbandCategories.find((c) => c.slug === "general-visitor" && c.is_active)?.name ||
        "General Visitor"
      : null;
    const bandCode = canIssueWristband ? walkInBandCode.trim() || null : null;

    try {
      const res = await checkinGateTicket({
        ticketRef: walkInIssued.ticketRef,
        qrToken: walkInIssued.qrToken || null,
        eventDay,
        wristbandCategory: bandCategory,
        wristbandCode: bandCode,
        notes: "Walk-in gate entry check-in",
      });

      if (res.ok && res.verdict === "VALID") {
        const checkedAt = res.checked_in_at || new Date().toISOString();
        const checkedBy = res.checked_in_by || user?.email || "Gate Staff";
        setWalkInIssued((prev) =>
          prev
            ? {
                ...prev,
                checkedInDays: {
                  ...prev.checkedInDays,
                  [eventDay]: { at: checkedAt, by: checkedBy, wristband: bandCategory },
                },
              }
            : null
        );
        setStatusMessage({
          type: "success",
          text: `Walk-in Visitor Checked In: ${walkInIssued.fullName} (${walkInIssued.ticketRef}) on ${eventDay}.`,
        });
        await fetchEntryData();
        return;
      }

      if (res.duplicate && res.checked_in_at) {
        const checkedBy = res.checked_in_by || user?.email || "Gate Staff";
        setWalkInIssued((prev) =>
          prev
            ? {
                ...prev,
                checkedInDays: {
                  ...prev.checkedInDays,
                  [eventDay]: {
                    at: res.checked_in_at!,
                    by: checkedBy,
                    wristband: bandCategory,
                  },
                },
              }
            : null
        );
        setWalkInSubmitError(`ALREADY CHECKED IN on ${eventDay} by ${checkedBy}.`);
        return;
      }

      // Legacy fallback only when checkin_gate_ticket RPC is not yet deployed
      const errLower = String(res.error || "").toLowerCase();
      if (errLower.includes("not yet deployed") || errLower.includes("does not exist")) {
        const matchedVisitor = visitorsRaw.find(
          (v) =>
            v.id === walkInIssued.registrationId ||
            v.registration_ref === walkInIssued.registrationRef ||
            v.ticket_ref === walkInIssued.ticketRef
        );
        if (matchedVisitor?.id) {
          await executeCheckIn(
            {
              key: `vis-${matchedVisitor.id}`,
              id: matchedVisitor.id,
              registrationId: null,
              visitorRegistrationId: matchedVisitor.id,
              playerId: null,
              ticketRef: walkInIssued.ticketRef,
              name: walkInIssued.fullName,
              email: walkInIssued.email,
              institution: walkInIssued.institution || "",
              studentClass: walkInIssued.studentClass,
              designation: walkInIssued.designation,
              normalizedCategory: walkInIssued.visitorCategory,
              registrationSource: "walk_in",
              subjectType: "visitor",
              categoryOrGame: walkInIssued.displaySubtitle,
              count: 1,
              status: "confirmed",
            },
            false,
            ""
          );
          setWalkInIssued((prev) =>
            prev
              ? {
                  ...prev,
                  checkedInDays: {
                    ...prev.checkedInDays,
                    [eventDay]: {
                      at: new Date().toISOString(),
                      by: user?.email || "Gate Staff",
                      wristband: bandCategory,
                    },
                  },
                }
              : null
          );
          return;
        }
      }

      setWalkInSubmitError(res.error || res.reason || "Unable to complete walk-in gate check-in.");
    } catch (err: any) {
      setWalkInSubmitError(formatCheckInDatabaseError(err));
    } finally {
      setWalkInCheckingIn(false);
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
              onClick={() => openWalkInModal()}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-mono font-bold uppercase tracking-wide cursor-pointer shadow-xs"
            >
              <UserPlus size={15} />
              <span>WALK-IN VISITOR REGISTRATION</span>
            </button>
          )}

          {canUseGateScanner && (
            <button
              type="button"
              onClick={() => setCameraScannerActive((prev) => !prev)}
              aria-pressed={cameraScannerActive}
              className={`min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl text-xs font-mono font-black uppercase tracking-wide cursor-pointer transition-colors shadow-xs ${
                cameraScannerActive
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-[#0B1120] hover:bg-slate-800 text-[#D5F542] border border-slate-700"
              }`}
            >
              <Camera size={16} />
              <span>{cameraScannerActive ? "STOP CAMERA SCANNER" : "START CAMERA SCANNER"}</span>
            </button>
          )}

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
              onClick={() => handleSelectEventDay(day)}
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

      {/* Live Camera QR Scanner (Permission requested ONLY after clicking START CAMERA SCANNER) */}
      <LiveGateQrScanner
        active={cameraScannerActive}
        isAuthorized={canUseGateScanner}
        onStop={() => setCameraScannerActive(false)}
        onVerifyDecodedQr={async (decodedText) => {
          await handleVerifyGateInput(decodedText);
        }}
        onInvalidQrScan={(reason) => {
          setGateVerification({
            ok: false,
            verdict: "INVALID",
            can_check_in: false,
            reason,
            error: reason,
          });
        }}
        title={
          canScanEsports && !canScanVisitor
            ? "Live Esports Pass Camera Scanner"
            : "Live Gate Camera QR Scanner"
        }
      />

      {/* Search & DB Ticket Verification Bar (Backup Manual Search) */}
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

            {gateVerification.can_check_in &&
              gateVerification.ticket &&
              canCheckInGateCategory(gateVerification.ticket.registration_category) && (
                <button
                  type="button"
                  disabled={checkingInGate}
                  onClick={handleAuthoritativeGateCheckIn}
                  className="min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle size={16} />
                  <span>
                    {checkingInGate
                      ? "Confirming Check-In..."
                      : `Confirm Check-In (${eventDay.slice(-2)} Nov)`}
                  </span>
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
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <QrCode size={32} className="mx-auto text-slate-400" />
          <div>
            <h3 className="text-base font-bold text-slate-900 m-0">
              Ready for Gate Verification ({eventDay})
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-0">
              Click <strong>START CAMERA SCANNER</strong> to scan attendee QR passes with live rear-camera support, or use the manual ticket-number search above as a backup.
            </p>
          </div>
          {canUseGateScanner && !cameraScannerActive && (
            <div>
              <button
                type="button"
                onClick={() => setCameraScannerActive(true)}
                className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-[#D5F542] font-mono text-xs font-black uppercase tracking-wide cursor-pointer"
              >
                <Camera size={16} />
                <span>START CAMERA SCANNER</span>
              </button>
            </div>
          )}
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
              onClick={() => openWalkInModal(searchQuery.trim())}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-mono font-bold uppercase tracking-wide cursor-pointer"
            >
              <UserPlus size={14} />
              <span>WALK-IN VISITOR REGISTRATION</span>
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
              const visitorRow = visitorsRaw.find((v) => v.id === subject.id) || null;
              return evaluateVisitorEntry({
                visitor: visitorRow,
                checkIns: checkins,
                eventDay,
                requestedTrack: trackFilter === "esports_player" ? "esports" : "visitor",
              });
            })();

            const canAct =
              subject.subjectType === "visitor" ? canCheckInVisitor : canCheckInEsports;

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
                          : "bg-purple-50 text-purple-700 border-purple-200"
                      }`}
                    >
                      {subject.subjectType === "visitor" ? "Visitor Pass" : "Esports Player"}
                    </span>

                    {subject.subjectType === "visitor" && subject.normalizedCategory && (
                      <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {subject.normalizedCategory}
                      </span>
                    )}

                    {subject.subjectType === "visitor" && subject.registrationSource === "walk_in" && (
                      <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        WALK-IN
                      </span>
                    )}

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
                    {subject.institution && (
                      <span className="inline-flex items-center gap-1">
                        <Building2 size={12} /> {subject.institution}
                      </span>
                    )}
                    {subject.studentClass && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <GraduationCap size={12} /> {subject.studentClass}
                      </span>
                    )}
                    {subject.designation && (
                      <span className="inline-flex items-center gap-1 font-mono text-amber-800">
                        <Briefcase size={12} /> {subject.designation}
                      </span>
                    )}
                    {subject.email && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Mail size={12} /> {subject.email}
                      </span>
                    )}
                    {subject.subjectType === "esports_player" && subject.phone && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Phone size={12} /> {subject.phone}
                      </span>
                    )}
                    {subject.subjectType === "esports_player" && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Gamepad2 size={12} /> {subject.categoryOrGame}
                      </span>
                    )}
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

      {/* Walk-In Visitor Registration Modal (Existing Three-Category Visitor System + Ticket + Gate Check-In) */}
      {walkInOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="walkin-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={() => setWalkInOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-slate-900 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[10px] font-bold uppercase">
                    Gate Desk · Walk-In
                  </span>
                </div>
                <h3 id="walkin-modal-title" className="text-base sm:text-lg font-black text-slate-900 m-0 uppercase tracking-tight">
                  WALK-IN VISITOR REGISTRATION
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close walk-in modal"
                onClick={() => setWalkInOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {walkInSubmitError && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-start gap-2"
              >
                <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-600" />
                <span>{walkInSubmitError}</span>
              </div>
            )}

            {!walkInIssued ? (
              <form onSubmit={handleWalkInSubmit} noValidate className="space-y-4">
                <p className="text-xs text-slate-600 m-0">
                  Registers the walk-in visitor directly into the Visitor CRM with a unique verifiable QR ticket pass using the same category rules as public Visitor Registration.
                </p>

                {/* 3 Visitor Category Selector Cards */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    Select Visitor Category *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {VISITOR_CATEGORY_CARDS.map((card) => {
                      const isSelected = walkInCategoryId === card.id;
                      const IconComp =
                        card.id === "student"
                          ? GraduationCap
                          : card.id === "faculty"
                          ? Building2
                          : UserCheck;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          aria-pressed={isSelected}
                          data-walkin-category-card={card.id}
                          onClick={() => {
                            setWalkInCategoryId(card.id);
                            setWalkInSubmitError(null);
                            clearWalkInFieldError("category");
                            clearWalkInFieldError("studentClass");
                            clearWalkInFieldError("designationOption");
                            clearWalkInFieldError("customDesignation");
                            clearWalkInFieldError("institution");
                          }}
                          className={`text-left p-3 rounded-xl transition-all flex flex-col justify-between min-h-[112px] cursor-pointer border ${
                            isSelected
                              ? "bg-blue-50/80 border-blue-600 ring-2 ring-blue-500/20"
                              : "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                isSelected ? "bg-blue-600 text-white" : "bg-white text-blue-600 border border-slate-200"
                              }`}
                            >
                              <IconComp size={14} />
                            </div>
                            {isSelected && <CheckCircle2 size={16} className="text-blue-600 shrink-0" />}
                          </div>
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-tight text-slate-900 leading-snug mb-0.5">
                              {card.title}
                            </div>
                            <p className="text-[10px] text-slate-600 leading-snug m-0">
                              {card.shortDescription}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {walkInErrors.category && (
                    <p role="alert" className="text-[11px] font-medium text-rose-600 mt-1.5 m-0">
                      {walkInErrors.category}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="walkin-full-name" className="block text-xs font-bold text-slate-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      id="walkin-full-name"
                      type="text"
                      required
                      maxLength={120}
                      value={walkInName}
                      onChange={(e) => {
                        setWalkInName(e.target.value);
                        clearWalkInFieldError("fullName");
                      }}
                      placeholder="Enter visitor's full name"
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm ${
                        walkInErrors.fullName ? "border-rose-500 bg-rose-50/40" : "border-slate-300"
                      }`}
                    />
                    {walkInErrors.fullName && (
                      <p role="alert" className="text-[11px] font-medium text-rose-600 mt-1 m-0">
                        {walkInErrors.fullName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="walkin-email" className="block text-xs font-bold text-slate-700 mb-1">
                      Email Address *
                    </label>
                    <input
                      id="walkin-email"
                      type="email"
                      required
                      maxLength={254}
                      value={walkInEmail}
                      onChange={(e) => {
                        setWalkInEmail(e.target.value);
                        clearWalkInFieldError("email");
                      }}
                      placeholder="name@example.com"
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm ${
                        walkInErrors.email ? "border-rose-500 bg-rose-50/40" : "border-slate-300"
                      }`}
                    />
                    {walkInErrors.email && (
                      <p role="alert" className="text-[11px] font-medium text-rose-600 mt-1 m-0">
                        {walkInErrors.email}
                      </p>
                    )}
                  </div>

                  {walkInCategoryId === "student" && (
                    <>
                      <div>
                        <label htmlFor="walkin-class-course" className="block text-xs font-bold text-slate-700 mb-1">
                          Class / Course *
                        </label>
                        <input
                          id="walkin-class-course"
                          type="text"
                          required
                          maxLength={120}
                          value={walkInStudentClass}
                          onChange={(e) => {
                            setWalkInStudentClass(e.target.value);
                            clearWalkInFieldError("studentClass");
                          }}
                          placeholder="e.g. II PUC Science, B.Sc. CS, 10th Standard"
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm ${
                            walkInErrors.studentClass ? "border-rose-500 bg-rose-50/40" : "border-slate-300"
                          }`}
                        />
                        {walkInErrors.studentClass && (
                          <p role="alert" className="text-[11px] font-medium text-rose-600 mt-1 m-0">
                            {walkInErrors.studentClass}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="walkin-institution" className="block text-xs font-bold text-slate-700 mb-1">
                          College / Institution Name *
                        </label>
                        <input
                          id="walkin-institution"
                          type="text"
                          required
                          maxLength={150}
                          list="walkin-institutions-list"
                          value={walkInInstitution}
                          onChange={(e) => {
                            setWalkInInstitution(e.target.value);
                            clearWalkInFieldError("institution");
                          }}
                          placeholder="School, college or institution name"
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm ${
                            walkInErrors.institution ? "border-rose-500 bg-rose-50/40" : "border-slate-300"
                          }`}
                        />
                        {walkInErrors.institution && (
                          <p role="alert" className="text-[11px] font-medium text-rose-600 mt-1 m-0">
                            {walkInErrors.institution}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {walkInCategoryId === "faculty" && (
                    <>
                      <div>
                        <label htmlFor="walkin-designation" className="block text-xs font-bold text-slate-700 mb-1">
                          Designation / Role *
                        </label>
                        <select
                          id="walkin-designation"
                          required
                          value={walkInDesignationOption}
                          onChange={(e) => {
                            setWalkInDesignationOption(e.target.value);
                            clearWalkInFieldError("designationOption");
                            if (e.target.value !== "Other") {
                              clearWalkInFieldError("customDesignation");
                            }
                          }}
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm bg-white ${
                            walkInErrors.designationOption ? "border-rose-500 bg-rose-50/40" : "border-slate-300"
                          }`}
                        >
                          <option value="">Select designation / role...</option>
                          {FACULTY_DESIGNATION_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        {walkInErrors.designationOption && (
                          <p role="alert" className="text-[11px] font-medium text-rose-600 mt-1 m-0">
                            {walkInErrors.designationOption}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="walkin-institution" className="block text-xs font-bold text-slate-700 mb-1">
                          College / Institution Name *
                        </label>
                        <input
                          id="walkin-institution"
                          type="text"
                          required
                          maxLength={150}
                          list="walkin-institutions-list"
                          value={walkInInstitution}
                          onChange={(e) => {
                            setWalkInInstitution(e.target.value);
                            clearWalkInFieldError("institution");
                          }}
                          placeholder="School, college or institution name"
                          className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm ${
                            walkInErrors.institution ? "border-rose-500 bg-rose-50/40" : "border-slate-300"
                          }`}
                        />
                        {walkInErrors.institution && (
                          <p role="alert" className="text-[11px] font-medium text-rose-600 mt-1 m-0">
                            {walkInErrors.institution}
                          </p>
                        )}
                      </div>

                      {walkInDesignationOption === "Other" && (
                        <div className="sm:col-span-2">
                          <label htmlFor="walkin-custom-designation" className="block text-xs font-bold text-slate-700 mb-1">
                            Specify Designation / Role *
                          </label>
                          <input
                            id="walkin-custom-designation"
                            type="text"
                            required
                            maxLength={120}
                            value={walkInCustomDesignation}
                            onChange={(e) => {
                              setWalkInCustomDesignation(e.target.value);
                              clearWalkInFieldError("customDesignation");
                            }}
                            placeholder="e.g. Research Coordinator, Academic Advisor, Dean"
                            className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm ${
                              walkInErrors.customDesignation ? "border-rose-500 bg-rose-50/40" : "border-slate-300"
                            }`}
                          />
                          {walkInErrors.customDesignation && (
                            <p role="alert" className="text-[11px] font-medium text-rose-600 mt-1 m-0">
                              {walkInErrors.customDesignation}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {walkInCategoryId === "general" && (
                    <div className="sm:col-span-2">
                      <label htmlFor="walkin-institution" className="block text-xs font-bold text-slate-700 mb-1">
                        College / Institution Name (Optional)
                      </label>
                      <input
                        id="walkin-institution"
                        type="text"
                        maxLength={150}
                        list="walkin-institutions-list"
                        value={walkInInstitution}
                        onChange={(e) => {
                          setWalkInInstitution(e.target.value);
                          clearWalkInFieldError("institution");
                        }}
                        placeholder="Optional — school, college or community affiliation"
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm ${
                          walkInErrors.institution ? "border-rose-500 bg-rose-50/40" : "border-slate-300"
                        }`}
                      />
                      {walkInErrors.institution && (
                        <p role="alert" className="text-[11px] font-medium text-rose-600 mt-1 m-0">
                          {walkInErrors.institution}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <datalist id="walkin-institutions-list">
                  {SUGGESTED_INSTITUTIONS.map((inst) => (
                    <option key={inst} value={inst} />
                  ))}
                </datalist>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setWalkInOpen(false)}
                    className="min-h-[42px] px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={walkInSubmitting}
                    className="min-h-[42px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                  >
                    {walkInSubmitting ? "Registering & Issuing Pass..." : "Register & Issue Visitor Ticket"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {/* Issued Walk-In Pass Card */}
                <div className="bg-[#0B1120] text-white rounded-2xl p-4 sm:p-5 border border-slate-800 grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4 items-center">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 font-mono text-[10px] font-bold uppercase">
                        WALK-IN
                      </span>
                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 font-mono text-[10px] font-bold uppercase">
                        {walkInIssued.visitorCategory}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#D5F542] text-[#0B1120] font-mono text-[10px] font-bold uppercase">
                        CONFIRMED PASS
                      </span>
                    </div>
                    <div className="font-mono text-lg sm:text-xl font-black text-[#D5F542] tracking-wider select-all">
                      {walkInIssued.ticketRef}
                    </div>
                    <div className="text-xs text-slate-200 space-y-0.5">
                      <p className="font-bold text-white m-0">{walkInIssued.fullName}</p>
                      <p className="text-slate-300 font-mono text-[11px] m-0">{walkInIssued.email}</p>
                      <p className="text-slate-300 text-[11px] m-0">
                        {walkInIssued.displaySubtitle}
                        {walkInIssued.institution ? ` · ${walkInIssued.institution}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-2 text-center border-2 border-cyan-400/70 mx-auto w-[140px]">
                    <img
                      src={walkInIssued.qrDataUrl}
                      alt={`Walk-In QR ${walkInIssued.ticketRef}`}
                      className="w-28 h-28 mx-auto block"
                    />
                    <span className="block mt-1 text-[9px] font-mono font-bold text-[#0B1120] uppercase">
                      GATE QR PASS
                    </span>
                  </div>
                </div>

                {/* PDF Download Action */}
                <button
                  type="button"
                  onClick={() =>
                    downloadTicketPdfFile({
                      ticketRef: walkInIssued.ticketRef,
                      qrToken: walkInIssued.qrToken,
                      recipientName: walkInIssued.fullName,
                      category: walkInIssued.displaySubtitle,
                      email: walkInIssued.email,
                      institution: walkInIssued.institution || undefined,
                      registrationType: "visitor",
                      daysAttending: "Both",
                    })
                  }
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-mono font-bold uppercase tracking-wide cursor-pointer"
                >
                  <Download size={15} />
                  <span>Download Official Ticket (PDF)</span>
                </button>

                {/* Immediate Gate Verification & Check-In */}
                {canCheckInVisitor && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold uppercase text-slate-700">
                        Gate Check-In ({eventDay})
                      </span>
                      <div className="inline-flex gap-1">
                        {(["2026-11-20", "2026-11-21"] as EventDaySession[]).map((day, idx) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => setEventDay(day)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer ${
                              eventDay === day
                                ? "bg-slate-900 text-white"
                                : "bg-white border border-slate-200 text-slate-600"
                            }`}
                          >
                            Day {idx + 1}
                          </button>
                        ))}
                      </div>
                    </div>

                    {walkInIssued.checkedInDays[eventDay] ? (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
                        <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                        <span>
                          CHECKED IN for {eventDay} at{" "}
                          {new Date(walkInIssued.checkedInDays[eventDay]!.at).toLocaleTimeString("en-IN")} by{" "}
                          {walkInIssued.checkedInDays[eventDay]!.by}
                          {walkInIssued.checkedInDays[eventDay]!.wristband
                            ? ` · Wristband: ${walkInIssued.checkedInDays[eventDay]!.wristband}`
                            : ""}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {canIssueWristband && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <select
                              aria-label="Walk-in Wristband Category"
                              value={walkInBandCategory}
                              onChange={(e) => setWalkInBandCategory(e.target.value)}
                              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800"
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
                              placeholder="Band ID (optional)"
                              value={walkInBandCode}
                              onChange={(e) => setWalkInBandCode(e.target.value)}
                              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-900"
                            />
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={walkInCheckingIn}
                          onClick={handleWalkInImmediateCheckIn}
                          className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold cursor-pointer"
                        >
                          <CheckCircle size={16} />
                          <span>
                            {walkInCheckingIn
                              ? "Checking In..."
                              : `Verify & Complete Gate Check-In (${eventDay.slice(-2)} Nov)`}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => openWalkInModal()}
                    className="min-h-[40px] px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Register Another Walk-In
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalkInOpen(false)}
                    className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
