import type {
  CheckIn,
  EventDaySession,
  Player,
  Registration,
  TournamentSelectionStatus,
  VisitorRegistration,
  WristbandCategory,
  WristbandIssuance,
} from "@/types/database";

export const EVENT_DAYS: { id: EventDaySession; label: string; dateLabel: string }[] = [
  { id: "2026-11-20", label: "Day 1", dateLabel: "20 Nov 2026" },
  { id: "2026-11-21", label: "Day 2", dateLabel: "21 Nov 2026" },
];

export const DEFAULT_WRISTBAND_CATEGORIES: WristbandCategory[] = [
  {
    id: "wb-general-visitor",
    name: "General Visitor",
    slug: "general-visitor",
    audience: "visitor",
    color_hex: "#2563EB",
    is_active: true,
    sort_order: 1,
  },
  {
    id: "wb-esports-participant",
    name: "Esports Participant",
    slug: "esports-participant",
    audience: "esports",
    color_hex: "#7C3AED",
    is_active: true,
    sort_order: 2,
  },
];

export interface ParsedQrTicket {
  ok: boolean;
  ticketRef: string;
  rawInput: string;
  ignoredUntrustedClaims: boolean;
  error?: string;
}

const TICKET_REF_REGEX = /\b(SN3-[A-Z0-9-]{4,32})\b/i;

/**
 * Extracts ONLY the canonical registration / player ticket reference from QR payloads
 * (plain ref, URL query/path, or JSON string). Untrusted status/role/category claims
 * inside QR payloads are always ignored and marked so verification relies solely on DB state.
 */
export function parseTicketQrPayload(rawPayload: string): ParsedQrTicket {
  const trimmed = String(rawPayload || "").trim();
  if (!trimmed) {
    return { ok: false, ticketRef: "", rawInput: trimmed, ignoredUntrustedClaims: false, error: "Empty QR payload." };
  }

  let ignoredUntrustedClaims = false;

  // 1. JSON payload check (e.g. {"ticketRef":"SN3-26-ABC123","status":"confirmed"})
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        if ("status" in parsed || "selection_status" in parsed || "eligible" in parsed || "role" in parsed) {
          ignoredUntrustedClaims = true;
        }
        const candidate =
          parsed.ticketRef ||
          parsed.ticket_ref ||
          parsed.registrationRef ||
          parsed.registration_ref ||
          parsed.ref ||
          parsed.code ||
          "";
        const match = String(candidate).toUpperCase().match(TICKET_REF_REGEX);
        if (match) {
          return { ok: true, ticketRef: match[1], rawInput: trimmed, ignoredUntrustedClaims };
        }
      }
    } catch {
      // Fall through to regex extraction
    }
  }

  // 2. URL payload check (e.g. https://.../verify?ticket=SN3-VIS-123456&status=confirmed)
  if (trimmed.includes("://") || trimmed.includes("?")) {
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : `https://verify.local/${trimmed.replace(/^\/+/, "")}`);
      if (url.searchParams.has("status") || url.searchParams.has("eligible")) {
        ignoredUntrustedClaims = true;
      }
      const paramCandidate =
        url.searchParams.get("ticket") ||
        url.searchParams.get("ref") ||
        url.searchParams.get("code") ||
        url.pathname;
      const match = String(paramCandidate || "").toUpperCase().match(TICKET_REF_REGEX);
      if (match) {
        return { ok: true, ticketRef: match[1], rawInput: trimmed, ignoredUntrustedClaims };
      }
    } catch {
      // Fall through
    }
  }

  // 3. Direct ticket reference or text containing SN3-*
  const directMatch = trimmed.toUpperCase().match(TICKET_REF_REGEX);
  if (directMatch) {
    return { ok: true, ticketRef: directMatch[1], rawInput: trimmed, ignoredUntrustedClaims };
  }

  return {
    ok: false,
    ticketRef: trimmed.toUpperCase(),
    rawInput: trimmed,
    ignoredUntrustedClaims,
    error: "Invalid or unrecognized Supernova ticket format.",
  };
}

export interface EntryVerificationDecision {
  decision:
    | "eligible"
    | "entry_only_no_tournament"
    | "already_checked_in"
    | "denied";
  reason: string;
  subjectType: "visitor" | "esports_player";
  ticketRef: string;
  holderName: string;
  categoryLabel: string;
  recommendedWristbandSlug: string;
  tournamentEligible: boolean;
  priorCheckIn?: {
    checkedInAt: string;
    checkedInBy: string;
    eventDay: EventDaySession;
    wristbandCategory?: string | null;
  };
}

export function isRecordArchived(record: { archived_at?: string | null; admin_notes?: string | null }): boolean {
  if (record.archived_at) return true;
  if (record.admin_notes && record.admin_notes.includes("[ARCHIVED")) return true;
  return false;
}

/**
 * Evaluates a Visitor ticket against authoritative DB records and multi-day check-in logs.
 * Explicitly blocks visitor tickets from qualifying for esports tournament entry.
 */
export function evaluateVisitorEntry(params: {
  visitor: (VisitorRegistration & { archived_at?: string | null }) | null;
  checkIns: CheckIn[];
  eventDay: EventDaySession;
  requestedTrack?: "visitor" | "esports";
}): EntryVerificationDecision {
  const { visitor, checkIns, eventDay, requestedTrack = "visitor" } = params;

  if (!visitor) {
    return {
      decision: "denied",
      reason: "Ticket reference not found in registered visitor records.",
      subjectType: "visitor",
      ticketRef: "",
      holderName: "Unknown",
      categoryLabel: "Unregistered",
      recommendedWristbandSlug: "general-visitor",
      tournamentEligible: false,
    };
  }

  if (requestedTrack === "esports") {
    return {
      decision: "denied",
      reason:
        "Visitor passes do not qualify for Esports Player tournament entry. Scan the player's official esports ticket.",
      subjectType: "visitor",
      ticketRef: visitor.registration_ref,
      holderName: visitor.full_name,
      categoryLabel: visitor.visitor_category || "General Visitor",
      recommendedWristbandSlug: "general-visitor",
      tournamentEligible: false,
    };
  }

  if (isRecordArchived(visitor)) {
    return {
      decision: "denied",
      reason: "Visitor registration has been archived or revoked.",
      subjectType: "visitor",
      ticketRef: visitor.registration_ref,
      holderName: visitor.full_name,
      categoryLabel: visitor.visitor_category || "General Visitor",
      recommendedWristbandSlug: "general-visitor",
      tournamentEligible: false,
    };
  }

  if (visitor.status !== "confirmed") {
    return {
      decision: "denied",
      reason: `Visitor pass status is "${visitor.status}". Only confirmed passes may enter.`,
      subjectType: "visitor",
      ticketRef: visitor.registration_ref,
      holderName: visitor.full_name,
      categoryLabel: visitor.visitor_category || "General Visitor",
      recommendedWristbandSlug: "general-visitor",
      tournamentEligible: false,
    };
  }

  // Check multi-day duplicate protection for the selected eventDay
  const prior = checkIns.find(
    (c) =>
      !c.is_override &&
      (c.ticket_ref === visitor.registration_ref || c.registration_id === visitor.id) &&
      (c.event_day || "2026-11-20") === eventDay &&
      (c.subject_type || "visitor") === "visitor"
  );

  if (prior) {
    return {
      decision: "already_checked_in",
      reason: `ALREADY CHECKED IN on ${eventDay}. Supervisor override required for documented re-entry.`,
      subjectType: "visitor",
      ticketRef: visitor.registration_ref,
      holderName: visitor.full_name,
      categoryLabel: visitor.visitor_category || "General Visitor",
      recommendedWristbandSlug: "general-visitor",
      tournamentEligible: false,
      priorCheckIn: {
        checkedInAt: prior.checked_in_at,
        checkedInBy: prior.checked_in_by_email || prior.checked_in_by || "Gate Staff",
        eventDay: (prior.event_day || eventDay) as EventDaySession,
        wristbandCategory: prior.wristband_category || null,
      },
    };
  }

  return {
    decision: "eligible",
    reason: `Valid confirmed Visitor Pass for ${eventDay}.`,
    subjectType: "visitor",
    ticketRef: visitor.registration_ref,
    holderName: visitor.full_name,
    categoryLabel: visitor.visitor_category || "General Visitor",
    recommendedWristbandSlug: "general-visitor",
    tournamentEligible: false,
  };
}

/**
 * Evaluates an Esports Player pass against team registration status, independent
 * tournament selection status, roster membership, and multi-day duplicate check-ins.
 */
export function evaluateEsportsPlayerEntry(params: {
  team: (Registration & { archived_at?: string | null }) | null;
  player: Player | null;
  playerTicketRef: string;
  gameTitle: string;
  checkIns: CheckIn[];
  eventDay: EventDaySession;
  allowApprovedUnselectedEntryOnly?: boolean;
}): EntryVerificationDecision {
  const {
    team,
    player,
    playerTicketRef,
    gameTitle,
    checkIns,
    eventDay,
    allowApprovedUnselectedEntryOnly = true,
  } = params;

  if (!team || !player) {
    return {
      decision: "denied",
      reason: "Esports player ticket does not match an active squad roster.",
      subjectType: "esports_player",
      ticketRef: playerTicketRef,
      holderName: player?.player_name || "Unknown Player",
      categoryLabel: gameTitle || "Esports",
      recommendedWristbandSlug: "esports-participant",
      tournamentEligible: false,
    };
  }

  if (isRecordArchived(team)) {
    return {
      decision: "denied",
      reason: `Team "${team.team_name}" registration is archived.`,
      subjectType: "esports_player",
      ticketRef: playerTicketRef,
      holderName: player.player_name,
      categoryLabel: `${gameTitle} · ${team.team_name}`,
      recommendedWristbandSlug: "esports-participant",
      tournamentEligible: false,
    };
  }

  // Registration status check
  if (team.status !== "confirmed") {
    return {
      decision: "denied",
      reason: `Team "${team.team_name}" registration is "${team.status}". Pending, declined, or withdrawn teams cannot check in.`,
      subjectType: "esports_player",
      ticketRef: playerTicketRef,
      holderName: player.player_name,
      categoryLabel: `${gameTitle} · ${team.team_name}`,
      recommendedWristbandSlug: "esports-participant",
      tournamentEligible: false,
    };
  }

  const selectionStatus: TournamentSelectionStatus =
    team.selection_status || "awaiting_selection";

  if (selectionStatus === "disqualified") {
    return {
      decision: "denied",
      reason: `Team "${team.team_name}" is DISQUALIFIED from tournament entry.`,
      subjectType: "esports_player",
      ticketRef: playerTicketRef,
      holderName: player.player_name,
      categoryLabel: `${gameTitle} · ${team.team_name}`,
      recommendedWristbandSlug: "esports-participant",
      tournamentEligible: false,
    };
  }

  // Duplicate check-in guard for the selected event day
  const prior = checkIns.find(
    (c) =>
      !c.is_override &&
      (c.player_id === player.id || c.ticket_ref === playerTicketRef) &&
      (c.event_day || "2026-11-20") === eventDay &&
      c.subject_type === "esports_player"
  );

  if (prior) {
    return {
      decision: "already_checked_in",
      reason: `ALREADY CHECKED IN on ${eventDay}. Duplicate esports check-in blocked.`,
      subjectType: "esports_player",
      ticketRef: playerTicketRef,
      holderName: player.player_name,
      categoryLabel: `${gameTitle} · ${team.team_name}`,
      recommendedWristbandSlug: "esports-participant",
      tournamentEligible: selectionStatus === "selected",
      priorCheckIn: {
        checkedInAt: prior.checked_in_at,
        checkedInBy: prior.checked_in_by_email || prior.checked_in_by || "Esports Entry Staff",
        eventDay: (prior.event_day || eventDay) as EventDaySession,
        wristbandCategory: prior.wristband_category || null,
      },
    };
  }

  // Approved but NOT Selected rule
  if (selectionStatus !== "selected") {
    if (allowApprovedUnselectedEntryOnly) {
      return {
        decision: "entry_only_no_tournament",
        reason: `Team "${team.team_name}" is approved but "${selectionStatus.replace(/_/g, " ")}". General venue entry allowed per organizer policy; NOT eligible for tournament matches.`,
        subjectType: "esports_player",
        ticketRef: playerTicketRef,
        holderName: player.player_name,
        categoryLabel: `${gameTitle} · ${team.team_name} (Entry Only)`,
        recommendedWristbandSlug: "general-visitor",
        tournamentEligible: false,
      };
    }
    return {
      decision: "denied",
      reason: `Team "${team.team_name}" is "${selectionStatus.replace(/_/g, " ")}" and not selected for tournament entry.`,
      subjectType: "esports_player",
      ticketRef: playerTicketRef,
      holderName: player.player_name,
      categoryLabel: `${gameTitle} · ${team.team_name}`,
      recommendedWristbandSlug: "esports-participant",
      tournamentEligible: false,
    };
  }

  return {
    decision: "eligible",
    reason: `Verified selected esports competitor for ${gameTitle} (${team.team_name}).`,
    subjectType: "esports_player",
    ticketRef: playerTicketRef,
    holderName: player.player_name,
    categoryLabel: `${gameTitle} · ${team.team_name}`,
    recommendedWristbandSlug: "esports-participant",
    tournamentEligible: true,
  };
}

export function validateWristbandIssuance(params: {
  categories: WristbandCategory[];
  existingIssuances: WristbandIssuance[];
  categoryIdOrSlug: string;
  ticketRef: string;
  eventDay: EventDaySession;
  isReplacement?: boolean;
  replacementReason?: string;
}): { ok: true; category: WristbandCategory; activeToReplace?: WristbandIssuance } | { ok: false; error: string } {
  const category = params.categories.find(
    (c) => c.is_active && (c.id === params.categoryIdOrSlug || c.slug === params.categoryIdOrSlug)
  );
  if (!category) {
    return { ok: false, error: "Selected wristband category does not exist or is inactive." };
  }

  const activeExisting = params.existingIssuances.find(
    (w) =>
      w.ticket_ref === params.ticketRef &&
      w.event_day === params.eventDay &&
      w.status === "active"
  );

  if (activeExisting && !params.isReplacement) {
    return {
      ok: false,
      error: `Duplicate wristband blocked: "${activeExisting.category_name}" wristband already issued to ${params.ticketRef} on ${params.eventDay}. Use Replacement workflow if damaged or lost.`,
    };
  }

  if (params.isReplacement) {
    if (!activeExisting) {
      return { ok: false, error: "No active wristband found to replace for this ticket and event day." };
    }
    if (!params.replacementReason || params.replacementReason.trim().length < 4) {
      return { ok: false, error: "A documented replacement reason (min 4 characters) is required." };
    }
    return { ok: true, category, activeToReplace: activeExisting };
  }

  return { ok: true, category };
}

export interface EntryStatsSummary {
  totalRegisteredVisitors: number;
  totalVisitorsCheckedIn: number;
  totalEsportsPlayersExpected: number;
  totalEsportsPlayersCheckedIn: number;
  pendingVerificationVisitors: number;
  pendingVerificationEsportsPlayers: number;
  wristbandsByCategory: Record<string, number>;
  entriesByDay: Record<EventDaySession, number>;
  checkInsByStaff: Record<string, number>;
}

/**
 * Checks whether a visitor_registrations row was auto-linked solely from an esports player
 * registration so visitor counts never double-count esports competitors.
 */
export function isAutoLinkedEsportsVisitorRecord(visitor: VisitorRegistration): boolean {
  const notes = (visitor.admin_notes || "").toUpperCase();
  const cat = (visitor.visitor_category || "").toLowerCase();
  return (
    notes.includes("[AUTO_LINKED_ESPORTS") ||
    notes.includes("[LINKED_ESPORTS") ||
    cat === "esports player" ||
    cat === "esports competitor"
  );
}

export function computeEntryStatistics(params: {
  visitors: (VisitorRegistration & { archived_at?: string | null })[];
  esportsTeams: (Registration & { archived_at?: string | null })[];
  players: Player[];
  checkIns: CheckIn[];
  wristbands: WristbandIssuance[];
}): EntryStatsSummary {
  const activeVisitors = params.visitors.filter((v) => !isRecordArchived(v));
  const activeTeams = params.esportsTeams.filter((t) => !isRecordArchived(t));
  const activeTeamIds = new Set(activeTeams.map((t) => t.id));
  const confirmedSelectedTeamIds = new Set(
    activeTeams
      .filter((t) => t.status === "confirmed" && (t.selection_status || "awaiting_selection") === "selected")
      .map((t) => t.id)
  );

  // Deduplicate visitors so auto-linked esports player visitor records are not double-counted
  const esportsEmails = new Set(activeTeams.map((t) => t.email.trim().toLowerCase()));
  const standaloneConfirmedVisitors = activeVisitors.filter((v) => {
    if (v.status !== "confirmed") return false;
    if (isAutoLinkedEsportsVisitorRecord(v)) return false;
    // Also guard by category + esports email match
    if (esportsEmails.has(v.email.trim().toLowerCase()) && v.visitor_category?.toLowerCase().includes("esports")) {
      return false;
    }
    return true;
  });

  const totalRegisteredVisitors = standaloneConfirmedVisitors.reduce(
    (sum, v) => sum + Math.max(1, v.visitor_count || 1),
    0
  );

  const activePlayers = params.players.filter((p) => activeTeamIds.has(p.registration_id));
  const selectedPlayers = activePlayers.filter((p) => confirmedSelectedTeamIds.has(p.registration_id));

  // Unique checked-in visitors & esports players across check_ins (ignoring duplicate overrides)
  const checkedInVisitorRefs = new Set<string>();
  const checkedInPlayerRefs = new Set<string>();
  const entriesByDay: Record<EventDaySession, number> = {
    "2026-11-20": 0,
    "2026-11-21": 0,
  };
  const checkInsByStaff: Record<string, number> = {};

  for (const ci of params.checkIns) {
    if (ci.is_override) continue;
    const day: EventDaySession = ci.event_day === "2026-11-21" ? "2026-11-21" : "2026-11-20";
    entriesByDay[day] = (entriesByDay[day] || 0) + 1;

    const staffKey = ci.checked_in_by_email || ci.checked_in_by || "Unknown Staff";
    checkInsByStaff[staffKey] = (checkInsByStaff[staffKey] || 0) + 1;

    if (ci.subject_type === "esports_player" && (ci.player_id || ci.ticket_ref)) {
      checkedInPlayerRefs.add(ci.player_id || ci.ticket_ref || ci.id);
    } else if ((ci.subject_type || "visitor") === "visitor" && (ci.ticket_ref || ci.registration_id)) {
      checkedInVisitorRefs.add(ci.ticket_ref || ci.registration_id || ci.id);
    }
  }

  // Include legacy checked-in flags when check_ins rows aren't present
  for (const v of standaloneConfirmedVisitors) {
    if (v.check_in_status === "checked_in") {
      checkedInVisitorRefs.add(v.registration_ref);
    }
  }
  for (const p of selectedPlayers) {
    if (p.check_in_status === "checked_in") {
      checkedInPlayerRefs.add(p.id);
    }
  }

  const wristbandsByCategory: Record<string, number> = {};
  for (const wb of params.wristbands) {
    if (wb.status === "voided") continue;
    if (wb.status === "active") {
      wristbandsByCategory[wb.category_name] = (wristbandsByCategory[wb.category_name] || 0) + 1;
    }
  }

  return {
    totalRegisteredVisitors,
    totalVisitorsCheckedIn: checkedInVisitorRefs.size,
    totalEsportsPlayersExpected: selectedPlayers.length,
    totalEsportsPlayersCheckedIn: checkedInPlayerRefs.size,
    pendingVerificationVisitors: Math.max(0, standaloneConfirmedVisitors.length - checkedInVisitorRefs.size),
    pendingVerificationEsportsPlayers: Math.max(0, selectedPlayers.length - checkedInPlayerRefs.size),
    wristbandsByCategory,
    entriesByDay,
    checkInsByStaff,
  };
}
