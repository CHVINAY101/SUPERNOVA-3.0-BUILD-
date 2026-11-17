import type {
  EsportsGameAvailability,
  EsportsRegistrationStatusReason,
  Game,
  PlayerInstitutionType,
  Registration,
  RegistrationControl,
} from "../types/database.ts";

export const PLAYER_INSTITUTION_TYPES: readonly PlayerInstitutionType[] = [
  "School",
  "College",
  "Other",
] as const;

export const SCHOOL_COURSE_SUGGESTIONS = [
  "High School (8th – 10th)",
  "PUC — Science (PCMB / PCMC)",
  "PUC — Commerce",
  "PUC — Arts",
  "Class 10 (SSLC / CBSE / ICSE)",
  "Class 11",
  "Class 12",
] as const;

export const SCHOOL_YEAR_CLASS_SUGGESTIONS = [
  "Class 8",
  "Class 9",
  "Class 10",
  "Class 11 / 1st PUC",
  "Class 12 / 2nd PUC",
] as const;

export const COLLEGE_COURSE_SUGGESTIONS = [
  "BCA",
  "B.Com",
  "B.Sc",
  "BA",
  "BBA",
  "BE / B.Tech",
  "MCA",
  "M.Sc",
  "M.Com",
  "MBA",
] as const;

export const COLLEGE_YEAR_SUGGESTIONS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
  "5th Year",
  "Postgraduate 1st Year",
  "Postgraduate 2nd Year",
] as const;

export const OTHER_COURSE_SUGGESTIONS = [
  "Diploma",
  "Polytechnic",
  "ITI / Vocational",
  "Open University",
] as const;

export const OTHER_YEAR_SUGGESTIONS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "Semester 1–2",
  "Semester 3–4",
  "Semester 5–6",
] as const;

export function getEducationSuggestionsForType(institutionType?: string | null): {
  courseLabel: string;
  coursePlaceholder: string;
  courseSuggestions: readonly string[];
  yearLabel: string;
  yearPlaceholder: string;
  yearSuggestions: readonly string[];
} {
  if (institutionType === "School") {
    return {
      courseLabel: "Class / Stream *",
      coursePlaceholder: "e.g. Class 10, PUC Science, High School",
      courseSuggestions: SCHOOL_COURSE_SUGGESTIONS,
      yearLabel: "Current Class *",
      yearPlaceholder: "e.g. Class 10, Class 11 / 1st PUC, Class 12",
      yearSuggestions: SCHOOL_YEAR_CLASS_SUGGESTIONS,
    };
  }
  if (institutionType === "College") {
    return {
      courseLabel: "Course / Degree *",
      coursePlaceholder: "e.g. BCA, B.Com, B.Sc, BA, BE",
      courseSuggestions: COLLEGE_COURSE_SUGGESTIONS,
      yearLabel: "Current Year *",
      yearPlaceholder: "e.g. 1st Year, 2nd Year, 3rd Year",
      yearSuggestions: COLLEGE_YEAR_SUGGESTIONS,
    };
  }
  return {
    courseLabel: "Course / Class *",
    coursePlaceholder: "e.g. Diploma, Polytechnic, PUC, B.Sc",
    courseSuggestions: OTHER_COURSE_SUGGESTIONS,
    yearLabel: "Current Year / Class *",
    yearPlaceholder: "e.g. 1st Year, 2nd Year, Class 12",
    yearSuggestions: OTHER_YEAR_SUGGESTIONS,
  };
}

export function isValidPlayerInstitutionType(value?: string | null): value is PlayerInstitutionType {
  return value === "School" || value === "College" || value === "Other";
}

export interface PlayerEducationInput {
  institutionType?: string | null;
  institutionName?: string | null;
  courseOrClass?: string | null;
  currentYearOrClass?: string | null;
}

export interface PlayerEducationErrors {
  institutionType?: string;
  institutionName?: string;
  courseOrClass?: string;
  currentYearOrClass?: string;
}

export function validatePlayerEducation(
  input: PlayerEducationInput,
  playerIndex: number
): PlayerEducationErrors {
  const errors: PlayerEducationErrors = {};
  const label = `Player ${playerIndex + 1}`;
  const instType = (input.institutionType || "").trim();
  const instName = (input.institutionName || "").trim();
  const course = (input.courseOrClass || "").trim();
  const yearClass = (input.currentYearOrClass || "").trim();

  if (!isValidPlayerInstitutionType(instType)) {
    errors.institutionType = `${label}: Select Institution Type (School, College, or Other).`;
  }

  if (instName.length < 2 || instName.length > 150) {
    errors.institutionName = `${label}: Enter full School / College / Institution name (2–150 chars).`;
  }

  if (course.length < 1 || course.length > 100) {
    errors.courseOrClass = `${label}: Enter Course / Class (e.g., BCA, B.Com, PUC, Class 10).`;
  }

  if (yearClass.length < 1 || yearClass.length > 80) {
    errors.currentYearOrClass = `${label}: Enter Current Year / Class (e.g., 1st Year, Class 12).`;
  }

  return errors;
}

export interface GameRegistrationStats {
  game: Game;
  totalRegisteredTeams: number;
  approvedTeams: number;
  pendingTeams: number;
  declinedOrWithdrawnTeams: number;
  activeCapacityTeams: number;
  slotsRemaining: number | null;
  isAtCapacity: boolean;
  isEffectivelyOpen: boolean;
  statusReason: EsportsRegistrationStatusReason;
}

function isRegistrationArchivedSimple(reg: { admin_notes?: string | null; archived_at?: string | null }): boolean {
  if (reg.archived_at) return true;
  if (typeof reg.admin_notes === "string" && reg.admin_notes.includes("[ARCHIVED")) return true;
  return false;
}

export function computeGameRegistrationStats(
  games: Game[],
  registrations: (Pick<Registration, "id" | "game_id" | "status" | "admin_notes"> & { archived_at?: string | null })[],
  portalControl?: Pick<RegistrationControl, "is_open" | "opens_at" | "closes_at"> | null,
  now = new Date()
): GameRegistrationStats[] {
  const portalBlockedReason = (() => {
    if (!portalControl) return null;
    if (!portalControl.is_open) return "portal_closed" as const;
    if (portalControl.opens_at && now < new Date(portalControl.opens_at)) return "portal_scheduled" as const;
    if (portalControl.closes_at && now > new Date(portalControl.closes_at)) return "portal_expired" as const;
    return null;
  })();

  return games.map((game) => {
    const gameRegs = registrations.filter((r) => r.game_id === game.id && !isRegistrationArchivedSimple(r));
    const totalRegisteredTeams = gameRegs.length;
    const approvedTeams = gameRegs.filter((r) => r.status === "confirmed").length;
    const pendingTeams = gameRegs.filter((r) => r.status === "pending").length;
    const declinedOrWithdrawnTeams = gameRegs.filter(
      (r) => r.status === "declined" || r.status === "withdrawn"
    ).length;
    const activeCapacityTeams = gameRegs.filter(
      (r) => r.status !== "declined" && r.status !== "withdrawn"
    ).length;

    const maxTeams = typeof game.max_teams === "number" && game.max_teams > 0 ? game.max_teams : null;
    const regOpen = game.registration_open !== false;
    const autoClose = game.auto_close_at_capacity !== false;
    const overrideOpen = game.registration_override_open === true;
    const isAtCapacity = maxTeams !== null && activeCapacityTeams >= maxTeams;
    const slotsRemaining = maxTeams === null ? null : Math.max(0, maxTeams - activeCapacityTeams);

    let statusReason: EsportsRegistrationStatusReason = "open";
    if (portalBlockedReason) {
      statusReason = portalBlockedReason;
    } else if (!regOpen && isAtCapacity && autoClose) {
      statusReason = "capacity_reached";
    } else if (!regOpen) {
      statusReason = "manual_closed";
    } else if (isAtCapacity && !overrideOpen) {
      statusReason = "capacity_reached";
    } else if (isAtCapacity && overrideOpen) {
      statusReason = "open_override";
    }

    const isEffectivelyOpen =
      Boolean(game.is_active) &&
      Boolean(game.is_published) &&
      !portalBlockedReason &&
      regOpen &&
      (!isAtCapacity || overrideOpen);

    return {
      game,
      totalRegisteredTeams,
      approvedTeams,
      pendingTeams,
      declinedOrWithdrawnTeams,
      activeCapacityTeams,
      slotsRemaining,
      isAtCapacity,
      isEffectivelyOpen,
      statusReason,
    };
  });
}

export function getGameClosedDisplayMessage(
  availability: Pick<
    EsportsGameAvailability,
    "title" | "is_effectively_open" | "status_reason" | "max_teams" | "registration_closed_message"
  >,
  portalClosedMessage?: string | null
): string | null {
  if (availability.is_effectively_open) return null;

  switch (availability.status_reason) {
    case "portal_closed":
      return portalClosedMessage?.trim() || "Esports squad registrations are currently closed by the organizers.";
    case "portal_scheduled":
      return "Esports registrations have not opened yet.";
    case "portal_expired":
      return "Esports registrations have closed.";
    case "capacity_reached":
      return (
        availability.registration_closed_message?.trim() ||
        `Registrations for ${availability.title} are automatically closed because the maximum capacity (${availability.max_teams} teams) has been reached.`
      );
    case "manual_closed":
    default:
      return (
        availability.registration_closed_message?.trim() ||
        `Registrations for ${availability.title} are currently closed.`
      );
  }
}

export function simulateGameControlAction(
  current: GameRegistrationStats,
  action: "open" | "close" | "reopen_override" | "update_settings",
  updates?: {
    maxTeams?: number | null;
    autoCloseAtCapacity?: boolean;
    closedMessage?: string | null;
  }
): Game {
  const nextMax =
    updates && "maxTeams" in updates
      ? updates.maxTeams && updates.maxTeams > 0
        ? updates.maxTeams
        : null
      : current.game.max_teams ?? null;

  const nextAutoClose =
    updates && typeof updates.autoCloseAtCapacity === "boolean"
      ? updates.autoCloseAtCapacity
      : current.game.auto_close_at_capacity !== false;

  const nextMsg =
    updates && "closedMessage" in updates
      ? updates.closedMessage?.trim() || null
      : current.game.registration_closed_message ?? null;

  let nextOpen = current.game.registration_open !== false;
  let nextOverride = current.game.registration_override_open === true;

  if (action === "close") {
    nextOpen = false;
    nextOverride = false;
  } else if (action === "reopen_override") {
    nextOpen = true;
    nextOverride = true;
  } else if (action === "open") {
    nextOpen = true;
    nextOverride = Boolean(nextMax !== null && current.activeCapacityTeams >= nextMax);
  } else {
    if (nextMax === null || current.activeCapacityTeams < nextMax) {
      nextOverride = false;
    } else if (nextAutoClose && nextMax !== null && current.activeCapacityTeams >= nextMax && !nextOverride) {
      nextOpen = false;
    }
  }

  return {
    ...current.game,
    registration_open: nextOpen,
    max_teams: nextMax,
    auto_close_at_capacity: nextAutoClose,
    registration_override_open: nextOverride,
    registration_closed_message: nextMsg,
  };
}

export interface FlattenedEsportsPlayerRow {
  id: string;
  registrationId: string;
  registrationRef: string;
  teamName: string;
  teamStatus: string;
  isArchived: boolean;
  gameTitle: string;
  gamerTag: string | null;
  playerName: string;
  institutionType: string | null;
  institutionName: string | null;
  courseOrClass: string | null;
  currentYearOrClass: string | null;
  submittedAt: string;
  isLegacyMissingEducation: boolean;
}

export function isLegacyPlayerEducationMissing(player: {
  institution_type?: string | null;
  institution_name?: string | null;
  course_or_class?: string | null;
  current_year_or_class?: string | null;
}): boolean {
  return (
    !player.institution_type?.trim() ||
    !player.institution_name?.trim() ||
    !player.course_or_class?.trim() ||
    !player.current_year_or_class?.trim()
  );
}

export function flattenEsportsPlayersDirectory(
  registrations: Array<{
    id: string;
    registration_ref: string;
    team_name: string;
    status: string;
    institution: string | null;
    submitted_at: string;
    archived_at?: string | null;
    admin_notes?: string | null;
    games?: { title: string } | null;
    players?: Array<{
      id: string;
      player_name: string;
      gamer_tag: string | null;
      institution_type?: string | null;
      institution_name?: string | null;
      course_or_class?: string | null;
      current_year_or_class?: string | null;
    }>;
  }>
): FlattenedEsportsPlayerRow[] {
  const rows: FlattenedEsportsPlayerRow[] = [];
  for (const reg of registrations) {
    const archived = isRegistrationArchivedSimple(reg);
    const gameTitle = reg.games?.title || "Game TBA";
    for (const p of reg.players || []) {
      rows.push({
        id: p.id,
        registrationId: reg.id,
        registrationRef: reg.registration_ref,
        teamName: reg.team_name,
        teamStatus: reg.status,
        isArchived: archived,
        gameTitle,
        gamerTag: p.gamer_tag || null,
        playerName: p.player_name,
        institutionType: p.institution_type?.trim() || null,
        institutionName: p.institution_name?.trim() || null,
        courseOrClass: p.course_or_class?.trim() || null,
        currentYearOrClass: p.current_year_or_class?.trim() || null,
        submittedAt: reg.submitted_at,
        isLegacyMissingEducation: isLegacyPlayerEducationMissing(p),
      });
    }
  }
  return rows;
}

export interface EsportsPlayersDirectoryFilter {
  searchQuery?: string;
  game?: string;
  institutionType?: string;
  institutionName?: string;
  courseOrClass?: string;
  currentYearOrClass?: string;
  includeArchived?: boolean;
}

export function filterEsportsPlayersDirectory(
  rows: FlattenedEsportsPlayerRow[],
  filter: EsportsPlayersDirectoryFilter
): FlattenedEsportsPlayerRow[] {
  const q = (filter.searchQuery || "").toLowerCase().trim();
  const game = (filter.game || "all").toLowerCase().trim();
  const instType = (filter.institutionType || "all").trim();
  const instName = (filter.institutionName || "").toLowerCase().trim();
  const course = (filter.courseOrClass || "").toLowerCase().trim();
  const yearClass = (filter.currentYearOrClass || "").toLowerCase().trim();

  return rows.filter((row) => {
    if (!filter.includeArchived && row.isArchived) return false;
    if (game !== "all" && !row.gameTitle.toLowerCase().includes(game)) return false;

    if (instType !== "all") {
      if (instType === "Legacy") {
        if (!row.isLegacyMissingEducation) return false;
      } else if ((row.institutionType || "") !== instType) {
        return false;
      }
    }

    if (instName && !(row.institutionName || "").toLowerCase().includes(instName)) return false;
    if (course && !(row.courseOrClass || "").toLowerCase().includes(course)) return false;
    if (yearClass && !(row.currentYearOrClass || "").toLowerCase().includes(yearClass)) return false;

    if (q) {
      const hay = [
        row.playerName,
        row.gamerTag,
        row.teamName,
        row.registrationRef,
        row.gameTitle,
        row.institutionType,
        row.institutionName,
        row.courseOrClass,
        row.currentYearOrClass,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}
