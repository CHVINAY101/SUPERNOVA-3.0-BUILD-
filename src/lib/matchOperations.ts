import type { BattleRoyaleTeamResult, Match, MatchStatus } from "../types/database.ts";
import { toUuidOrNull } from "./entryOperations.ts";
import { computeEndIso } from "./scheduling.ts";

export const CANONICAL_MATCH_STATUSES: readonly MatchStatus[] = [
  "upcoming",
  "scheduled",
  "check_in",
  "ready",
  "live",
  "result_submitted",
  "completed",
  "disputed",
  "postponed",
  "cancelled",
] as const;

export const INITIAL_MATCH_STATUS_OPTIONS: { value: MatchStatus; label: string }[] = [
  { value: "upcoming", label: "Upcoming (Unscheduled)" },
  { value: "scheduled", label: "Scheduled" },
  { value: "check_in", label: "Check-in Open" },
  { value: "ready", label: "Ready" },
  { value: "live", label: "Live Now" },
];

export const ALL_MATCH_STATUS_OPTIONS: { value: MatchStatus; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "scheduled", label: "Scheduled" },
  { value: "check_in", label: "Check-in Open" },
  { value: "ready", label: "Ready" },
  { value: "live", label: "Live" },
  { value: "result_submitted", label: "Result Submitted" },
  { value: "completed", label: "Completed" },
  { value: "disputed", label: "Disputed" },
  { value: "postponed", label: "Postponed" },
  { value: "cancelled", label: "Cancelled" },
];

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  upcoming: "Upcoming",
  scheduled: "Scheduled",
  check_in: "Check-in Open",
  ready: "Ready",
  live: "Live",
  result_submitted: "Result Submitted",
  completed: "Completed",
  disputed: "Disputed",
  postponed: "Postponed",
  cancelled: "Cancelled",
};

export function isValidMatchStatus(status: unknown): status is MatchStatus {
  return typeof status === "string" && (CANONICAL_MATCH_STATUSES as readonly string[]).includes(status);
}

export interface CreateMatchFormInput {
  gameId: string;
  tournamentId?: string | null;
  matchCode?: string | null;
  roundName: string;
  roundNumber?: number;
  matchNumber?: number;
  bracketSide?: Match["bracket_side"];
  teamAId?: string | null;
  teamBId?: string | null;
  brResults?: BattleRoyaleTeamResult[];
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  durationMinutes?: number;
  isScheduled?: boolean;
  station?: string;
  conductorId?: string;
  conductorEmail?: string | null;
  matchFormat?: string;
  status: MatchStatus;
  isPublished?: boolean;
  notes?: string;
}

export function validateCreateMatchInput(
  input: CreateMatchFormInput
): { ok: true } | { ok: false; error: string } {
  if (!toUuidOrNull(input.gameId)) {
    return { ok: false, error: "Select a valid esports game before creating a match." };
  }
  if (!input.roundName || !input.roundName.trim()) {
    return { ok: false, error: "Round name is required (e.g. Group Stage, Semifinal 1, Match Lobby 1)." };
  }

  const isBrLobby =
    input.bracketSide === "battle_royale" ||
    (input.matchFormat || "").toUpperCase().includes("BR");

  if (isBrLobby) {
    if (!input.brResults || input.brResults.length < 2) {
      return {
        ok: false,
        error: "Battle Royale lobby matches require at least 2 participating teams.",
      };
    }
  } else {
    if (!toUuidOrNull(input.teamAId) || !toUuidOrNull(input.teamBId)) {
      return { ok: false, error: "Select both Team A and Team B before creating a match." };
    }
    if (input.teamAId === input.teamBId) {
      return { ok: false, error: "Team A and Team B must be two distinct teams." };
    }
  }

  if (!isValidMatchStatus(input.status)) {
    return { ok: false, error: `Invalid match status "${String(input.status)}".` };
  }
  const matchNum = Number(input.matchNumber ?? 1);
  if (!Number.isInteger(matchNum) || matchNum < 1) {
    return { ok: false, error: "Match number must be a whole number of 1 or higher." };
  }
  const roundNum = Number(input.roundNumber ?? 1);
  if (!Number.isInteger(roundNum) || roundNum < 1) {
    return { ok: false, error: "Round number must be a whole number of 1 or higher." };
  }
  if (input.scheduledStart) {
    const parsed = new Date(input.scheduledStart);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Enter a valid scheduled start date and time." };
    }
  }
  return { ok: true };
}

export function buildMatchInsertPayload(input: CreateMatchFormInput): Record<string, any> {
  const safeScheduled = input.scheduledStart
    ? new Date(input.scheduledStart).toISOString()
    : null;
  const durationMinutes = Math.max(10, Math.min(480, Math.trunc(Number(input.durationMinutes ?? 30))));
  const safeEnd = safeScheduled
    ? input.scheduledEnd
      ? new Date(input.scheduledEnd).toISOString()
      : computeEndIso(safeScheduled, durationMinutes)
    : null;
  const safeConductorId = toUuidOrNull(input.conductorId);
  const safeTournamentId = toUuidOrNull(input.tournamentId);
  const isBrLobby =
    input.bracketSide === "battle_royale" ||
    (input.matchFormat || "").toUpperCase().includes("BR");

  return {
    ...(safeTournamentId ? { tournament_id: safeTournamentId } : {}),
    game_id: input.gameId,
    ...(input.matchCode?.trim() ? { match_code: input.matchCode.trim() } : {}),
    round: input.roundName.trim(),
    round_number: Math.max(1, Math.trunc(Number(input.roundNumber ?? 1))),
    match_number: Math.max(1, Math.trunc(Number(input.matchNumber ?? 1))),
    bracket_side: input.bracketSide || (isBrLobby ? "battle_royale" : "winners"),
    team_a_id: isBrLobby ? null : toUuidOrNull(input.teamAId),
    team_b_id: isBrLobby ? null : toUuidOrNull(input.teamBId),
    ...(isBrLobby && input.brResults ? { br_results: input.brResults } : {}),
    scheduled_start: safeScheduled,
    scheduled_end: safeEnd,
    duration_minutes: durationMinutes,
    is_scheduled: typeof input.isScheduled === "boolean" ? input.isScheduled : Boolean(safeScheduled),
    station: input.station?.trim() || null,
    conductor_id: safeConductorId,
    conductor_email: safeConductorId ? input.conductorEmail?.trim() || null : null,
    match_format: input.matchFormat?.trim() || (isBrLobby ? "BR Lobby" : "BO1"),
    score_a: 0,
    score_b: 0,
    status: input.status,
    result_status: "pending",
    is_published: input.isPublished !== false,
    notes: input.notes?.trim() || null,
  };
}

/**
 * Translates PostgreSQL / PostgREST errors on public.matches into clear,
 * actionable diagnostics without hiding the underlying database error code.
 */
export function formatMatchDatabaseError(err: any, attemptedStatus?: string): string {
  const rawMsg =
    typeof err === "string"
      ? err
      : err?.message || err?.error || err?.details || "Database error";
  const msg = String(rawMsg).trim() || "Database error";
  const code = String(err?.code || "").trim().toUpperCase();
  const codeSuffix = code ? ` [${code}]` : "";
  const lower = msg.toLowerCase();

  if (code === "23514" || lower.includes("matches_status_check") || lower.includes("violates check constraint")) {
    if (lower.includes("matches_status_check")) {
      const statusDetail = attemptedStatus ? ` ("${attemptedStatus}")` : "";
      return (
        `Match status${statusDetail} was rejected by database constraint matches_status_check. ` +
        `Ensure migrations 20261120000000 and 20261122000000 are applied on Supabase ` +
        `so all canonical statuses (${CANONICAL_MATCH_STATUSES.join(", ")}) are permitted. (${msg}${codeSuffix})`
      );
    }
    return `Database check constraint violation: ${msg}${codeSuffix}`;
  }

  if (
    code === "42703" ||
    code === "PGRST204" ||
    lower.includes("could not find the '") ||
    (lower.includes("column ") && lower.includes("does not exist"))
  ) {
    const colMatch =
      msg.match(/could not find the '([^']+)' column/i) ||
      msg.match(/column\s+(?:[a-z0-9_]+\.)?"?([a-z0-9_]+)"?\s+(?:of\s+relation\s+"[^"]+"\s+)?does not exist/i);
    const colLabel = colMatch?.[1] ? ` (${colMatch[1]})` : "";
    return (
      `Missing database column${colLabel} on public.matches. ` +
      `Apply migration 20261122000000_esports_control_centre_revamp.sql and reload the schema cache. ` +
      `(${msg}${codeSuffix})`
    );
  }

  if (code === "23503" || lower.includes("foreign key constraint")) {
    const fkMatch = msg.match(/constraint\s+"([^"]+)"/i);
    const fkLabel = fkMatch?.[1] ? ` (${fkMatch[1]})` : "";
    return `Invalid team, game, tournament, or conductor reference${fkLabel}: ${msg}${codeSuffix}`;
  }

  if (
    code === "42501" ||
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("forbidden") ||
    lower.includes("not authorized")
  ) {
    return `Permission denied on matches table: ${msg}${codeSuffix}`;
  }

  if (code === "PGRST202" || code === "42883") {
    return `Missing database RPC for match operation. Apply migration 20261122000000_esports_control_centre_revamp.sql. (${msg}${codeSuffix})`;
  }

  return `${code ? `[${code}] ` : ""}${msg}`;
}
