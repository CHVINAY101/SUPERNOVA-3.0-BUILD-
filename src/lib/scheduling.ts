import type { Match } from "../types/database.ts";

const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+05:30 Asia/Kolkata (fixed, no DST)

/**
 * Formats an ISO timestamp in Asia/Kolkata (IST) for human display.
 */
export function formatIstDateTime(isoString?: string | null): string {
  if (!isoString) return "Unscheduled";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return String(isoString);
  return (
    d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " IST"
  );
}

export function formatIstDateOnly(isoString?: string | null): string {
  if (!isoString) return "Unscheduled";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return String(isoString);
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatIstTimeOnly(isoString?: string | null): string {
  if (!isoString) return "TBD";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return String(isoString);
  return (
    d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " IST"
  );
}

export function formatIstTimeRange(
  startIso?: string | null,
  endIso?: string | null,
  durationMinutes = 30
): string {
  if (!startIso) return "Unscheduled";
  const startMs = new Date(startIso).getTime();
  if (Number.isNaN(startMs)) return "Unscheduled";
  const resolvedEnd = endIso ? new Date(endIso) : new Date(startMs + Math.max(5, durationMinutes) * 60_000);
  const startLabel = new Date(startMs).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const endLabel = resolvedEnd.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${startLabel} – ${endLabel} IST`;
}

/**
 * Extracts IST YYYY-MM-DD for `<input type="date" />` regardless of browser timezone.
 */
export function toIstDateInput(isoString?: string | null): string {
  if (!isoString) return "2026-11-20";
  const ms = new Date(isoString).getTime();
  if (Number.isNaN(ms)) return "2026-11-20";
  const ist = new Date(ms + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Extracts IST HH:mm for `<input type="time" />` regardless of browser timezone.
 */
export function toIstTimeInput(isoString?: string | null): string {
  if (!isoString) return "10:00";
  const ms = new Date(isoString).getTime();
  if (Number.isNaN(ms)) return "10:00";
  const ist = new Date(ms + IST_OFFSET_MS);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Converts IST date (`YYYY-MM-DD`) and time (`HH:mm`) into an ISO UTC timestamp string.
 */
export function istInputsToIso(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const candidate = new Date(`${dateStr}T${normalizedTime}+05:30`);
  if (Number.isNaN(candidate.getTime())) return null;
  return candidate.toISOString();
}

export function computeEndIso(startIso: string, durationMinutes: number): string {
  const startMs = new Date(startIso).getTime();
  const safeDur = Math.max(5, Math.min(480, Math.round(durationMinutes || 30)));
  return new Date(startMs + safeDur * 60_000).toISOString();
}

export function isMatchScheduled(match: Pick<Match, "scheduled_start" | "is_scheduled">): boolean {
  if (typeof match.is_scheduled === "boolean") {
    return match.is_scheduled && Boolean(match.scheduled_start);
  }
  return Boolean(match.scheduled_start);
}

export interface ScheduleCandidate {
  matchId: string;
  startIso: string;
  endIso?: string | null;
  durationMinutes?: number;
  teamAId?: string | null;
  teamBId?: string | null;
  brTeamIds?: string[];
  conductorId?: string | null;
  station?: string | null;
}

export interface ScheduleConflictItem {
  conflictingMatchId: string;
  matchLabel: string;
  windowLabel: string;
  overlappingTeamIds?: string[];
  reason: string;
}

export interface ScheduleConflictReport {
  hasBlockingConflict: boolean;
  hasWarning: boolean;
  teamConflicts: ScheduleConflictItem[];
  conductorConflicts: ScheduleConflictItem[];
  stationConflicts: ScheduleConflictItem[];
}

function getMatchParticipantIds(m: {
  team_a_id?: string | null;
  team_b_id?: string | null;
  br_results?: { team_id: string }[] | null;
}): string[] {
  const ids = new Set<string>();
  if (m.team_a_id) ids.add(m.team_a_id);
  if (m.team_b_id) ids.add(m.team_b_id);
  if (Array.isArray(m.br_results)) {
    for (const row of m.br_results) {
      if (row?.team_id) ids.add(row.team_id);
    }
  }
  return Array.from(ids);
}

/**
 * Detects time overlaps in IST between a candidate match schedule and existing scheduled matches.
 * - Team time overlaps are HARD BLOCKS (a team cannot play two matches simultaneously).
 * - Conductor and Arena/Room overlaps are non-blocking WARNINGS for operator visibility.
 */
export function detectScheduleConflicts(
  candidate: ScheduleCandidate,
  allMatches: Match[]
): ScheduleConflictReport {
  const candStart = new Date(candidate.startIso).getTime();
  const candEnd = candidate.endIso
    ? new Date(candidate.endIso).getTime()
    : candStart + Math.max(5, candidate.durationMinutes || 30) * 60_000;

  const empty: ScheduleConflictReport = {
    hasBlockingConflict: false,
    hasWarning: false,
    teamConflicts: [],
    conductorConflicts: [],
    stationConflicts: [],
  };

  if (Number.isNaN(candStart) || Number.isNaN(candEnd) || candEnd <= candStart) {
    return empty;
  }

  const candTeamIds = new Set<string>();
  if (candidate.teamAId) candTeamIds.add(candidate.teamAId);
  if (candidate.teamBId) candTeamIds.add(candidate.teamBId);
  if (Array.isArray(candidate.brTeamIds)) {
    for (const tid of candidate.brTeamIds) {
      if (tid) candTeamIds.add(tid);
    }
  }

  const normalizedStation = candidate.station?.trim().toLowerCase() || "";

  for (const m of allMatches) {
    if (m.id === candidate.matchId) continue;
    if (m.status === "cancelled" || m.status === "postponed") continue;
    if (!isMatchScheduled(m) || !m.scheduled_start) continue;

    const exStart = new Date(m.scheduled_start).getTime();
    if (Number.isNaN(exStart)) continue;
    const exEnd = m.scheduled_end
      ? new Date(m.scheduled_end).getTime()
      : exStart + Math.max(5, m.duration_minutes || 30) * 60_000;

    // Half-open interval overlap check: [start, end)
    const overlaps = exStart < candEnd && candStart < exEnd;
    if (!overlaps) continue;

    const label = m.match_code ? `${m.match_code} (${m.round || "Match"})` : m.round || `Match #${m.match_number || ""}`;
    const windowLabel = formatIstTimeRange(m.scheduled_start, m.scheduled_end, m.duration_minutes || 30);

    // 1. Team overlap check (HARD BLOCK)
    const existingTeams = getMatchParticipantIds(m);
    const sharedTeams = existingTeams.filter((tid) => candTeamIds.has(tid));
    if (sharedTeams.length > 0) {
      empty.teamConflicts.push({
        conflictingMatchId: m.id,
        matchLabel: label,
        windowLabel,
        overlappingTeamIds: sharedTeams,
        reason: `Team overlap blocked: conflicting with ${label} (${windowLabel}).`,
      });
    }

    // 2. Conductor overlap warning
    if (candidate.conductorId && m.conductor_id && candidate.conductorId === m.conductor_id) {
      empty.conductorConflicts.push({
        conflictingMatchId: m.id,
        matchLabel: label,
        windowLabel,
        reason: `Conductor already assigned to ${label} during ${windowLabel}.`,
      });
    }

    // 3. Station / Arena overlap warning
    if (
      normalizedStation &&
      m.station &&
      m.station.trim().toLowerCase() === normalizedStation
    ) {
      empty.stationConflicts.push({
        conflictingMatchId: m.id,
        matchLabel: label,
        windowLabel,
        reason: `Arena/Room "${m.station}" is already booked for ${label} during ${windowLabel}.`,
      });
    }
  }

  empty.hasBlockingConflict = empty.teamConflicts.length > 0;
  empty.hasWarning = empty.conductorConflicts.length > 0 || empty.stationConflicts.length > 0;
  return empty;
}
