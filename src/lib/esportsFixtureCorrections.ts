import type {
  BattleRoyaleTeamResult,
  Game,
  Match,
  Registration,
  Tournament,
  TournamentSelectionStatus,
} from "../types/database.ts";
import type { PermissionKey } from "./rbac.ts";

// =============================================================================
// 1. Authorization & Role Gating (No Match Conductor Bypass)
// =============================================================================

export const FIXTURE_CORRECTION_PERMISSIONS: readonly PermissionKey[] = [
  "esports:edit",
  "tournament:select_teams",
  "tournament:build_bracket",
  "tournament:confirm_results",
  "tournament:resolve_disputes",
];

/**
 * Returns true for authorized Super Admin, CRM Admin / Event Admin, and
 * Esports Manager / Score Operator roles holding fixture/team control rights.
 * Strictly returns false for pure Match Conductor accounts (which only hold
 * `conductor:*` permissions).
 */
export function canPerformFixtureCorrection(
  permissions: Set<PermissionKey> | null | undefined,
  accountStatus: string | null | undefined = "active"
): boolean {
  if (!permissions || accountStatus !== "active") return false;
  return FIXTURE_CORRECTION_PERMISSIONS.some((p) => permissions.has(p));
}

export function canPerformTeamRenameOrDisqualify(
  permissions: Set<PermissionKey> | null | undefined,
  accountStatus: string | null | undefined = "active"
): boolean {
  if (!permissions || accountStatus !== "active") return false;
  return (
    permissions.has("esports:edit") ||
    permissions.has("esports:reject") ||
    permissions.has("esports:approve") ||
    permissions.has("tournament:select_teams") ||
    permissions.has("tournament:build_bracket") ||
    permissions.has("tournament:confirm_results") ||
    permissions.has("tournament:resolve_disputes")
  );
}

export function isConductorOnlyRole(
  permissions: Set<PermissionKey> | null | undefined
): boolean {
  if (!permissions) return false;
  const hasConductor =
    permissions.has("conductor:view_assigned") ||
    permissions.has("conductor:submit_result");
  return hasConductor && !canPerformFixtureCorrection(permissions);
}

// =============================================================================
// 2. Live Deployed Production RPC Parameter Builders & Result Normalizers
// =============================================================================

export interface RenameEsportsTeamParams {
  p_registration_id: string;
  p_expected_name: string;
  p_new_name: string;
  p_reason: string;
}

export interface ReplaceEsportsFixtureTeamParams {
  p_match_id: string;
  p_slot: "a" | "b";
  p_expected_team_id: string | null;
  p_replacement_team_id: string | null;
  p_reason: string;
}

export interface SwapEsportsFixtureSlotsParams {
  p_match_1: string;
  p_slot_1: "a" | "b";
  p_expected_team_1: string | null;
  p_match_2: string;
  p_slot_2: "a" | "b";
  p_expected_team_2: string | null;
  p_reason: string;
}

export interface PreviewEsportsFixtureCorrectionParams {
  p_match_ids: string[];
}

export interface SetEsportsTeamDisqualificationParams {
  p_registration_id: string;
  p_expected_selection_status: TournamentSelectionStatus | string | null;
  p_disqualified: boolean;
  p_reason: string;
  p_restore_status: TournamentSelectionStatus | string | null;
}

export function buildRenameEsportsTeamParams(input: {
  registrationId: string;
  expectedName: string;
  newName: string;
  reason: string;
}): { ok: true; params: RenameEsportsTeamParams } | { ok: false; error: string } {
  const newName = input.newName.trim();
  const reason = input.reason.trim();
  if (!input.registrationId) {
    return { ok: false, error: "Select a valid team before renaming." };
  }
  if (newName.length < 2 || newName.length > 80) {
    return { ok: false, error: "Team name must be between 2 and 80 characters." };
  }
  if (newName === input.expectedName.trim()) {
    return { ok: false, error: "Enter a new team name different from the current name." };
  }
  if (reason.length < 3) {
    return { ok: false, error: "Enter an audit reason (min 3 characters) to rename this team." };
  }
  return {
    ok: true,
    params: {
      p_registration_id: input.registrationId,
      p_expected_name: input.expectedName,
      p_new_name: newName,
      p_reason: reason,
    },
  };
}

export function buildReplaceEsportsFixtureTeamParams(input: {
  matchId: string;
  slot: "a" | "b";
  expectedTeamId: string | null;
  replacementTeamId: string | null;
  otherSlotTeamId?: string | null;
  reason: string;
}): { ok: true; params: ReplaceEsportsFixtureTeamParams } | { ok: false; error: string } {
  const reason = input.reason.trim();
  if (!input.matchId) {
    return { ok: false, error: "Select a valid fixture before replacing a team slot." };
  }
  if (input.slot !== "a" && input.slot !== "b") {
    return { ok: false, error: "Fixture slot must be 'a' or 'b'." };
  }
  if (
    input.replacementTeamId &&
    input.otherSlotTeamId &&
    input.replacementTeamId === input.otherSlotTeamId
  ) {
    return { ok: false, error: "Team A and Team B in the same fixture cannot be the same squad." };
  }
  if (input.expectedTeamId === input.replacementTeamId) {
    return { ok: false, error: "Choose a different team or TBD state for this slot." };
  }
  if (reason.length < 3) {
    return { ok: false, error: "Enter an audit reason (min 3 characters) for fixture team replacement." };
  }
  return {
    ok: true,
    params: {
      p_match_id: input.matchId,
      p_slot: input.slot,
      p_expected_team_id: input.expectedTeamId,
      p_replacement_team_id: input.replacementTeamId,
      p_reason: reason,
    },
  };
}

export function buildSwapEsportsFixtureSlotsParams(input: {
  match1Id: string;
  slot1: "a" | "b";
  expectedTeam1Id: string | null;
  match2Id: string;
  slot2: "a" | "b";
  expectedTeam2Id: string | null;
  reason: string;
}): { ok: true; params: SwapEsportsFixtureSlotsParams } | { ok: false; error: string } {
  const reason = input.reason.trim();
  if (!input.match1Id || !input.match2Id) {
    return { ok: false, error: "Select both source and target matches before swapping slots." };
  }
  if (input.match1Id === input.match2Id && input.slot1 === input.slot2) {
    return { ok: false, error: "Cannot swap the exact same match slot with itself." };
  }
  if (!input.expectedTeam1Id && !input.expectedTeam2Id) {
    return { ok: false, error: "At least one selected slot must contain a team." };
  }
  if (reason.length < 3) {
    return { ok: false, error: "Enter an audit reason (min 3 characters) to swap fixture slots." };
  }
  return {
    ok: true,
    params: {
      p_match_1: input.match1Id,
      p_slot_1: input.slot1,
      p_expected_team_1: input.expectedTeam1Id,
      p_match_2: input.match2Id,
      p_slot_2: input.slot2,
      p_expected_team_2: input.expectedTeam2Id,
      p_reason: reason,
    },
  };
}

export function buildSetDisqualificationParams(input: {
  registrationId: string;
  currentSelectionStatus: TournamentSelectionStatus | string | null | undefined;
  disqualified: boolean;
  reason: string;
  restoreStatus?: TournamentSelectionStatus | string | null;
}): { ok: true; params: SetEsportsTeamDisqualificationParams } | { ok: false; error: string } {
  const reason = input.reason.trim();
  if (!input.registrationId) {
    return { ok: false, error: "Invalid team registration selected." };
  }
  if (reason.length < 3) {
    return {
      ok: false,
      error: input.disqualified
        ? "Enter a disqualification reason (min 3 characters)."
        : "Enter a reinstatement reason (min 3 characters).",
    };
  }
  const expectedStatus = input.currentSelectionStatus || "awaiting_selection";
  const restoreStatus = input.disqualified
    ? null
    : input.restoreStatus || "selected";

  return {
    ok: true,
    params: {
      p_registration_id: input.registrationId,
      p_expected_selection_status: expectedStatus,
      p_disqualified: input.disqualified,
      p_reason: reason,
      p_restore_status: restoreStatus,
    },
  };
}

export interface FixtureRpcResult<T = Record<string, unknown>> {
  ok: boolean;
  data?: T;
  error?: string;
  rejectedByHistoricalLock?: boolean;
  requiresManualReviewSql?: boolean;
}

export function normalizeRpcErrorMessage(
  rpcName: string,
  err: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
  payload?: unknown
): { message: string; rejectedByHistoricalLock: boolean; requiresManualReviewSql: boolean } {
  if (payload && typeof payload === "object" && "ok" in payload && (payload as any).ok === false) {
    const msg = String((payload as any).error || (payload as any).message || `${rpcName} rejected the request.`);
    const lower = msg.toLowerCase();
    const lockHit =
      lower.includes("completed") ||
      lower.includes("confirmed") ||
      lower.includes("historical") ||
      lower.includes("result") ||
      lower.includes("downstream") ||
      lower.includes("attendance") ||
      lower.includes("locked");
    return {
      message: msg,
      rejectedByHistoricalLock: lockHit,
      requiresManualReviewSql: lockHit,
    };
  }

  const raw = String(err?.message || "");
  const code = String(err?.code || "");
  const lower = raw.toLowerCase();

  if (code === "PGRST202" || lower.includes("could not find the function")) {
    return {
      message: `Production RPC ${rpcName} was not found or schema cache is stale. Refresh or verify Supabase RPC permissions.`,
      rejectedByHistoricalLock: false,
      requiresManualReviewSql: true,
    };
  }

  if (code === "42501" || lower.includes("permission denied") || lower.includes("forbidden")) {
    return {
      message: `Permission denied for ${rpcName}: only active Super Admin, CRM Admin, or Esports Manager staff may execute fixture corrections.`,
      rejectedByHistoricalLock: false,
      requiresManualReviewSql: false,
    };
  }

  if (lower.includes("expected") || lower.includes("stale") || lower.includes("changed")) {
    return {
      message: `Concurrent edit detected (${raw}). Reloaded latest fixture state — please review and retry.`,
      rejectedByHistoricalLock: false,
      requiresManualReviewSql: false,
    };
  }

  const lockHit =
    lower.includes("completed") ||
    lower.includes("confirmed") ||
    lower.includes("historical") ||
    lower.includes("downstream") ||
    lower.includes("attendance") ||
    lower.includes("locked");

  return {
    message: raw || `${rpcName} failed.`,
    rejectedByHistoricalLock: lockHit,
    requiresManualReviewSql: lockHit,
  };
}

// =============================================================================
// 3. Game-Scoped Searchable Team Filtering & Live Name Propagation
// =============================================================================

export interface SearchTeamsOptions {
  includeStatuses?: Array<Registration["status"]>;
  excludeDisqualified?: boolean;
  excludeTeamIds?: string[];
  limit?: number;
}

export function filterTeamsForGameSearch(
  teams: Registration[],
  gameId: string,
  query: string,
  options: SearchTeamsOptions = {}
): Registration[] {
  const {
    includeStatuses = ["confirmed", "pending", "correction_requested"],
    excludeDisqualified = false,
    excludeTeamIds = [],
    limit = 60,
  } = options;

  const excludedSet = new Set(excludeTeamIds.filter(Boolean));
  const q = query.trim().toLowerCase();

  const eligible = teams.filter((t) => {
    if (gameId && t.game_id !== gameId) return false;
    if (!includeStatuses.includes(t.status)) return false;
    if (excludeDisqualified && t.selection_status === "disqualified") return false;
    if (excludedSet.has(t.id)) return false;
    if (!q) return true;
    const hay = `${t.team_name} ${t.registration_ref} ${t.captain_name} ${t.institution || ""}`.toLowerCase();
    return hay.includes(q);
  });

  // Sort: selected teams first, then confirmed non-disqualified, then seed/name
  return eligible
    .sort((a, b) => {
      const rank = (r: Registration) => {
        if (r.selection_status === "selected") return 0;
        if (r.selection_status === "disqualified") return 4;
        if (r.status === "confirmed") return 1;
        return 2;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (a.seed_number != null && b.seed_number != null && a.seed_number !== b.seed_number) {
        return a.seed_number - b.seed_number;
      }
      return a.team_name.localeCompare(b.team_name);
    })
    .slice(0, limit);
}

/**
 * Resolves the latest authoritative team name from live registrations (`teamMap`)
 * so `rename_esports_team` immediately propagates even inside Battle Royale
 * `br_results` JSONB snapshots without waiting for JSONB rewrites.
 */
export function resolveLiveTeamName(
  teamId: string | null | undefined,
  fallbackName: string | null | undefined,
  teamMap: Map<string, Registration> | Map<string, string>
): string {
  if (teamId) {
    const found = teamMap.get(teamId);
    if (typeof found === "string" && found.trim()) return found;
    if (found && typeof found === "object" && "team_name" in found && found.team_name) {
      return found.team_name;
    }
  }
  return fallbackName || "TBD";
}

export function hydrateBrResultsWithLiveTeamNames(
  rows: BattleRoyaleTeamResult[] | null | undefined,
  teamMap: Map<string, Registration>
): BattleRoyaleTeamResult[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const live = teamMap.get(row.team_id);
    return {
      ...row,
      team_name: live?.team_name || row.team_name,
      registration_ref: live?.registration_ref || row.registration_ref,
      institution: live?.institution ?? row.institution ?? null,
    };
  });
}

// =============================================================================
// 4. Affected Fixtures Discovery & Historical Supervision Analysis
// =============================================================================

export interface TeamAffectedMatchesSummary {
  upcomingMatches: Match[];
  historicalMatches: Match[];
  byeMatches: Match[];
  allMatches: Match[];
}

export function isMatchTeamParticipant(match: Match, teamId: string): boolean {
  if (!teamId) return false;
  if (match.team_a_id === teamId || match.team_b_id === teamId || match.winner_id === teamId) {
    return true;
  }
  if (Array.isArray(match.br_results) && match.br_results.some((r) => r.team_id === teamId)) {
    return true;
  }
  return false;
}

export function isHistoricalFixture(
  match: Match,
  allGameMatches: Match[],
  attendanceCount = 0
): boolean {
  if (attendanceCount > 0) return true;
  if (["live", "result_submitted", "completed", "disputed"].includes(match.status)) {
    return true;
  }
  if (match.winner_id || match.bracket_advanced_at || match.confirmed_at || match.submitted_at) {
    return true;
  }
  if ((match.score_a || 0) > 0 || (match.score_b || 0) > 0) {
    return true;
  }
  if (match.match_format === "BYE") {
    return true;
  }
  if (Array.isArray(match.br_results) && match.br_results.some((r) => r.placement != null || (r.kills || 0) > 0)) {
    return true;
  }
  // Check downstream progression already populated or completed
  if (match.next_match_id) {
    const next = allGameMatches.find((m) => m.id === match.next_match_id);
    if (next && (next.team_a_id || next.team_b_id || next.winner_id || ["live", "result_submitted", "completed"].includes(next.status))) {
      return true;
    }
  }
  if (match.loser_next_match_id) {
    const lNext = allGameMatches.find((m) => m.id === match.loser_next_match_id);
    if (lNext && (lNext.team_a_id || lNext.team_b_id || lNext.winner_id || ["live", "result_submitted", "completed"].includes(lNext.status))) {
      return true;
    }
  }
  return false;
}

export function findTeamAffectedMatches(
  matches: Match[],
  teamId: string
): TeamAffectedMatchesSummary {
  const participated = matches.filter((m) => isMatchTeamParticipant(m, teamId));
  const upcomingMatches: Match[] = [];
  const historicalMatches: Match[] = [];
  const byeMatches: Match[] = [];

  for (const m of participated) {
    if (m.match_format === "BYE") {
      byeMatches.push(m);
      continue;
    }
    if (["upcoming", "scheduled", "check_in", "ready", "postponed"].includes(m.status) && !m.winner_id) {
      upcomingMatches.push(m);
    } else if (["live", "result_submitted", "completed", "disputed"].includes(m.status) || Boolean(m.winner_id)) {
      historicalMatches.push(m);
    }
  }

  return {
    upcomingMatches,
    historicalMatches,
    byeMatches,
    allMatches: participated,
  };
}

export interface DownstreamImpactNode {
  matchId: string;
  matchCode: string;
  round: string;
  relation: "winner_feeds" | "loser_feeds" | "target";
  slot: "a" | "b" | null;
  status: Match["status"];
  currentTeamAName: string;
  currentTeamBName: string;
  currentScoreLabel: string;
  winnerName: string | null;
  requiresManualReconfirmation: boolean;
}

export interface SupervisedCorrectionAnalysis {
  requiresSupervision: boolean;
  reasons: string[];
  targetMatch: Match;
  existingAssignment: {
    teamAId: string | null;
    teamAName: string;
    teamBId: string | null;
    teamBName: string;
    scoreA: number;
    scoreB: number;
    winnerId: string | null;
    winnerName: string | null;
    status: Match["status"];
  };
  proposedAssignment: {
    teamAId: string | null;
    teamAName: string;
    teamBId: string | null;
    teamBName: string;
  };
  downstreamImpacts: DownstreamImpactNode[];
  matchesRequiringReconfirmation: DownstreamImpactNode[];
  serverPreviewSummary: string | null;
  rawServerPreview: Record<string, unknown> | null;
  silentWinnerTransferBlocked: boolean;
}

export function collectDownstreamChain(
  startMatch: Match,
  allMatches: Match[]
): Array<{ match: Match; relation: "winner_feeds" | "loser_feeds"; slot: "a" | "b" | null }> {
  const byId = new Map(allMatches.map((m) => [m.id, m]));
  const visited = new Set<string>([startMatch.id]);
  const queue: Array<{ match: Match; relation: "winner_feeds" | "loser_feeds"; slot: "a" | "b" | null }> = [];
  const result: Array<{ match: Match; relation: "winner_feeds" | "loser_feeds"; slot: "a" | "b" | null }> = [];

  const isSlotB = (slot?: string | null) => String(slot || "a").trim().toLowerCase() === "b";

  if (startMatch.next_match_id && byId.has(startMatch.next_match_id)) {
    const next = byId.get(startMatch.next_match_id)!;
    queue.push({
      match: next,
      relation: "winner_feeds",
      slot: isSlotB(startMatch.next_match_slot) ? "b" : "a",
    });
  }
  if (startMatch.loser_next_match_id && byId.has(startMatch.loser_next_match_id)) {
    const lNext = byId.get(startMatch.loser_next_match_id)!;
    queue.push({
      match: lNext,
      relation: "loser_feeds",
      slot: isSlotB(startMatch.loser_next_match_slot) ? "b" : "a",
    });
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.match.id)) continue;
    visited.add(current.match.id);
    result.push(current);

    if (current.match.next_match_id && byId.has(current.match.next_match_id)) {
      queue.push({
        match: byId.get(current.match.next_match_id)!,
        relation: "winner_feeds",
        slot: isSlotB(current.match.next_match_slot) ? "b" : "a",
      });
    }
    if (current.match.loser_next_match_id && byId.has(current.match.loser_next_match_id)) {
      queue.push({
        match: byId.get(current.match.loser_next_match_id)!,
        relation: "loser_feeds",
        slot: isSlotB(current.match.loser_next_match_slot) ? "b" : "a",
      });
    }
  }

  return result;
}

export function buildSupervisedCorrectionAnalysis(params: {
  targetMatch: Match;
  allGameMatches: Match[];
  teamMap: Map<string, Registration>;
  proposedTeamAId?: string | null;
  proposedTeamBId?: string | null;
  attendanceCount?: number;
  serverPreview?: Record<string, unknown> | null;
}): SupervisedCorrectionAnalysis {
  const { targetMatch, allGameMatches, teamMap, attendanceCount = 0, serverPreview = null } = params;

  const proposedTeamAId = params.proposedTeamAId !== undefined ? params.proposedTeamAId : targetMatch.team_a_id;
  const proposedTeamBId = params.proposedTeamBId !== undefined ? params.proposedTeamBId : targetMatch.team_b_id;

  const teamName = (id: string | null | undefined) =>
    id ? teamMap.get(id)?.team_name || "Registered Squad" : "TBD";

  const reasons: string[] = [];
  if (["completed", "result_submitted", "disputed", "live"].includes(targetMatch.status)) {
    reasons.push(`Match status is ${targetMatch.status.replace(/_/g, " ")}.`);
  }
  if (targetMatch.winner_id || (targetMatch.score_a || 0) > 0 || (targetMatch.score_b || 0) > 0) {
    reasons.push("Recorded match score or confirmed winner exists.");
  }
  if (targetMatch.match_format === "BYE") {
    reasons.push("Fixture is marked as an automatic BYE advancement.");
  }
  if (attendanceCount > 0) {
    reasons.push(`${attendanceCount} roster attendance verification record(s) exist.`);
  }

  const downstream = collectDownstreamChain(targetMatch, allGameMatches);
  const downstreamImpacts: DownstreamImpactNode[] = downstream.map(({ match: m, relation, slot }) => {
    const needsReconfirm =
      Boolean(m.winner_id) ||
      ["live", "result_submitted", "completed", "disputed"].includes(m.status) ||
      Boolean(m.team_a_id && relation === "winner_feeds" && slot !== "b") ||
      Boolean(m.team_b_id && relation === "winner_feeds" && slot === "b");

    return {
      matchId: m.id,
      matchCode: m.match_code || `M${m.match_number ?? 1}`,
      round: m.round || "Bracket",
      relation,
      slot,
      status: m.status,
      currentTeamAName: teamName(m.team_a_id),
      currentTeamBName: teamName(m.team_b_id),
      currentScoreLabel: m.match_format === "BYE" ? "BYE" : `${m.score_a} - ${m.score_b}`,
      winnerName: m.winner_id ? teamName(m.winner_id) : null,
      requiresManualReconfirmation: needsReconfirm,
    };
  });

  if (downstreamImpacts.some((d) => d.requiresManualReconfirmation)) {
    reasons.push("Downstream fixture slots or results have already progressed.");
  }

  const targetNeedsReconfirm =
    Boolean(targetMatch.winner_id) ||
    ["completed", "result_submitted", "disputed"].includes(targetMatch.status);

  const matchesRequiringReconfirmation: DownstreamImpactNode[] = [
    ...(targetNeedsReconfirm
      ? [
          {
            matchId: targetMatch.id,
            matchCode: targetMatch.match_code || `M${targetMatch.match_number ?? 1}`,
            round: targetMatch.round || "Bracket",
            relation: "target" as const,
            slot: null,
            status: targetMatch.status,
            currentTeamAName: teamName(targetMatch.team_a_id),
            currentTeamBName: teamName(targetMatch.team_b_id),
            currentScoreLabel:
              targetMatch.match_format === "BYE" ? "BYE" : `${targetMatch.score_a} - ${targetMatch.score_b}`,
            winnerName: targetMatch.winner_id ? teamName(targetMatch.winner_id) : null,
            requiresManualReconfirmation: true,
          },
        ]
      : []),
    ...downstreamImpacts.filter((d) => d.requiresManualReconfirmation),
  ];

  const teamsChanged =
    proposedTeamAId !== targetMatch.team_a_id || proposedTeamBId !== targetMatch.team_b_id;
  const silentWinnerTransferBlocked = Boolean(
    teamsChanged && (targetMatch.winner_id || (targetMatch.score_a || 0) > 0 || (targetMatch.score_b || 0) > 0)
  );

  let serverPreviewSummary: string | null = null;
  if (serverPreview && typeof serverPreview === "object") {
    const affectedCount = Array.isArray((serverPreview as any).affected_matches)
      ? (serverPreview as any).affected_matches.length
      : typeof (serverPreview as any).affected_count === "number"
      ? (serverPreview as any).affected_count
      : null;
    const summaryText =
      typeof (serverPreview as any).summary === "string"
        ? (serverPreview as any).summary
        : typeof (serverPreview as any).message === "string"
        ? (serverPreview as any).message
        : null;
    serverPreviewSummary =
      summaryText ||
      (affectedCount !== null
        ? `Server preview checked ${affectedCount} affected fixture(s).`
        : "Server impact preview verified.");
  }

  return {
    requiresSupervision: reasons.length > 0 || isHistoricalFixture(targetMatch, allGameMatches, attendanceCount),
    reasons,
    targetMatch,
    existingAssignment: {
      teamAId: targetMatch.team_a_id,
      teamAName: teamName(targetMatch.team_a_id),
      teamBId: targetMatch.team_b_id,
      teamBName: teamName(targetMatch.team_b_id),
      scoreA: targetMatch.score_a,
      scoreB: targetMatch.score_b,
      winnerId: targetMatch.winner_id,
      winnerName: targetMatch.winner_id ? teamName(targetMatch.winner_id) : null,
      status: targetMatch.status,
    },
    proposedAssignment: {
      teamAId: proposedTeamAId,
      teamAName: teamName(proposedTeamAId),
      teamBId: proposedTeamBId,
      teamBName: teamName(proposedTeamBId),
    },
    downstreamImpacts,
    matchesRequiringReconfirmation,
    serverPreviewSummary,
    rawServerPreview: serverPreview,
    silentWinnerTransferBlocked,
  };
}

// =============================================================================
// 5. Complete Tournament Integrity Audit (All Formats + Drift Checks)
// =============================================================================

export type AuditSeverity = "critical" | "warning" | "ok";

export interface TournamentAuditFinding {
  id: string;
  gameId: string;
  gameTitle: string;
  severity: AuditSeverity;
  category:
    | "match_numbering"
    | "progression_link"
    | "bye_resolution"
    | "disqualification_impact"
    | "score_confirmation"
    | "schedule_conductor"
    | "tournament_sync"
    | "format_alignment"
    | "team_uniqueness";
  title: string;
  detail: string;
  matchIds?: string[];
  registrationIds?: string[];
}

export interface TournamentAuditReport {
  checkedAt: string;
  gameTitle: string;
  formatLabel: string;
  totalMatches: number;
  criticalCount: number;
  warningCount: number;
  hasStartedDrift: boolean;
  findings: TournamentAuditFinding[];
}

export function runTournamentIntegrityAudit(params: {
  game: Game;
  tournament: Tournament;
  matches: Match[];
  teams: Registration[];
}): TournamentAuditReport {
  const { game, tournament, matches, teams } = params;
  const activeMatches = matches.filter((m) => m.status !== "cancelled");
  const findings: TournamentAuditFinding[] = [];
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const matchById = new Map(activeMatches.map((m) => [m.id, m]));
  const isBr = tournament.format === "battle_royale" || game.scoring_mode === "battle_royale";

  // 1. Check `tournaments.has_started` synchronization drift
  const realMatches = activeMatches.filter((m) => m.match_format !== "BYE");
  const hasLiveOrConfirmedMatches = realMatches.some((m) =>
    ["live", "result_submitted", "completed", "disputed"].includes(m.status) || Boolean(m.winner_id)
  );
  const hasStartedDrift = hasLiveOrConfirmedMatches && !tournament.has_started;
  if (hasStartedDrift) {
    findings.push({
      id: `${game.id}-has-started-drift`,
      gameId: game.id,
      gameTitle: game.title,
      severity: "critical",
      category: "tournament_sync",
      title: "tournaments.has_started out of sync with live/completed matches",
      detail:
        "Live or confirmed matches exist in the database while tournaments.has_started is still false. Sync tournament state or review the generated migration repair SQL.",
    });
  }

  // 2. Match format alignment between game & tournament
  if (
    game.match_format &&
    ["single_elimination", "double_elimination", "round_robin", "battle_royale", "head_to_head", "group_knockout"].includes(game.match_format) &&
    game.match_format !== tournament.format
  ) {
    findings.push({
      id: `${game.id}-format-mismatch`,
      gameId: game.id,
      gameTitle: game.title,
      severity: "warning",
      category: "format_alignment",
      title: "Game format & tournament format mismatch",
      detail: `games.match_format is "${game.match_format}" while tournaments.format is "${tournament.format}".`,
    });
  }

  // 3. Match numbering & match_code continuity/duplicates
  const seenCodes = new Map<string, string[]>();
  const seenPos = new Map<string, string[]>();
  for (const m of activeMatches) {
    const code = (m.match_code || `R${m.round_number || 1}-M${m.match_number || 1}`).trim();
    const list = seenCodes.get(code) || [];
    list.push(m.id);
    seenCodes.set(code, list);

    const posKey = `${m.bracket_side || "knockout"}:${m.round_number || 1}:${m.match_number || 1}`;
    const pList = seenPos.get(posKey) || [];
    pList.push(m.id);
    seenPos.set(posKey, pList);
  }
  for (const [code, ids] of seenCodes.entries()) {
    if (ids.length > 1) {
      findings.push({
        id: `${game.id}-dup-code-${code}`,
        gameId: game.id,
        gameTitle: game.title,
        severity: "warning",
        category: "match_numbering",
        title: `Duplicate match code "${code}"`,
        detail: `${ids.length} fixtures share match code ${code}.`,
        matchIds: ids,
      });
    }
  }
  for (const [posKey, ids] of seenPos.entries()) {
    if (ids.length > 1) {
      findings.push({
        id: `${game.id}-dup-pos-${posKey}`,
        gameId: game.id,
        gameTitle: game.title,
        severity: "critical",
        category: "match_numbering",
        title: `Duplicate bracket slot numbering (${posKey})`,
        detail: `${ids.length} fixtures share the same side/round/match number.`,
        matchIds: ids,
      });
    }
  }

  // 4. Same-team matchup & Disqualified team in active/upcoming fixture
  for (const m of activeMatches) {
    const code = m.match_code || `M${m.match_number ?? 1}`;
    if (!isBr && m.team_a_id && m.team_b_id && m.team_a_id === m.team_b_id) {
      findings.push({
        id: `${m.id}-self-play`,
        gameId: game.id,
        gameTitle: game.title,
        severity: "critical",
        category: "team_uniqueness",
        title: `${code} has the same team assigned to both slots`,
        detail: "Replace one slot using Edit Match so the squad does not play itself.",
        matchIds: [m.id],
      });
    }

    const isActiveOrUpcoming = ["upcoming", "scheduled", "check_in", "ready", "live", "postponed"].includes(m.status);
    if (isActiveOrUpcoming) {
      const slotTeams = isBr
        ? (m.br_results || []).map((r) => r.team_id)
        : [m.team_a_id, m.team_b_id].filter((x): x is string => Boolean(x));

      for (const tid of slotTeams) {
        const reg = teamById.get(tid);
        if (reg && reg.selection_status === "disqualified") {
          findings.push({
            id: `${m.id}-dq-${tid}`,
            gameId: game.id,
            gameTitle: game.title,
            severity: "critical",
            category: "disqualification_impact",
            title: `Disqualified team "${reg.team_name}" is still assigned to active ${code}`,
            detail: "Use Edit Match to replace this squad or resolve a forfeit.",
            matchIds: [m.id],
            registrationIds: [tid],
          });
        }
      }
    }

    // 5. Progression integrity (broken next_match_id / loser_next_match_id / BYE)
    if (m.next_match_id && !matchById.has(m.next_match_id)) {
      findings.push({
        id: `${m.id}-broken-next`,
        gameId: game.id,
        gameTitle: game.title,
        severity: "critical",
        category: "progression_link",
        title: `${code} winner target missing`,
        detail: `next_match_id (${m.next_match_id}) does not exist in this game's fixtures.`,
        matchIds: [m.id],
      });
    }
    if (m.loser_next_match_id && !matchById.has(m.loser_next_match_id)) {
      findings.push({
        id: `${m.id}-broken-loser-next`,
        gameId: game.id,
        gameTitle: game.title,
        severity: "critical",
        category: "progression_link",
        title: `${code} loser target missing`,
        detail: `loser_next_match_id (${m.loser_next_match_id}) does not exist in this game's fixtures.`,
        matchIds: [m.id],
      });
    }

    // Completed H2H / Elimination match without winner_id (excluding draw in round_robin / group_knockout)
    if (
      !isBr &&
      m.status === "completed" &&
      !m.winner_id &&
      m.bracket_side !== "group" &&
      tournament.format !== "round_robin"
    ) {
      findings.push({
        id: `${m.id}-missing-winner`,
        gameId: game.id,
        gameTitle: game.title,
        severity: "critical",
        category: "score_confirmation",
        title: `${code} is completed without a confirmed winner`,
        detail: "Open Edit Match to record and confirm the official winner.",
        matchIds: [m.id],
      });
    }

    // Completed match whose winner was NOT advanced into populated next match
    if (m.status === "completed" && m.winner_id && m.next_match_id) {
      const next = matchById.get(m.next_match_id);
      if (next) {
        const nextSlotIsB = String(m.next_match_slot || "a").trim().toLowerCase() === "b";
        const expectedSlotTeam = nextSlotIsB ? next.team_b_id : next.team_a_id;
        if (expectedSlotTeam !== m.winner_id) {
          findings.push({
            id: `${m.id}-unadvanced-winner`,
            gameId: game.id,
            gameTitle: game.title,
            severity: "warning",
            category: "progression_link",
            title: `${code} winner not synced to ${next.match_code || next.round}`,
            detail: `Expected winner in slot ${(m.next_match_slot || "a").toUpperCase()} of downstream match.`,
            matchIds: [m.id, next.id],
          });
        }
      }
    }

    // Unresolved BYE (both teams missing or BYE not completed)
    if (m.match_format === "BYE" && m.team_a_id && m.status !== "completed") {
      findings.push({
        id: `${m.id}-bye-pending`,
        gameId: game.id,
        gameTitle: game.title,
        severity: "warning",
        category: "bye_resolution",
        title: `BYE fixture ${code} is not marked completed`,
        detail: "Auto-BYE fixtures should complete and advance the assigned squad cleanly.",
        matchIds: [m.id],
      });
    }
  }

  // 6. Double Elimination Losers Track verification
  if (tournament.format === "double_elimination" && activeMatches.length > 0) {
    const hasWinners = activeMatches.some((m) => m.bracket_side === "winners");
    const hasLosers = activeMatches.some((m) => m.bracket_side === "losers");
    const hasGrandFinal = activeMatches.some((m) => m.bracket_side === "grand_final");
    if (!hasWinners || !hasLosers || !hasGrandFinal) {
      findings.push({
        id: `${game.id}-de-incomplete`,
        gameId: game.id,
        gameTitle: game.title,
        severity: "warning",
        category: "progression_link",
        title: "Double Elimination tracks incomplete",
        detail: "Expected winners, losers, and grand_final bracket tracks for double elimination.",
      });
    }
  }

  // 7. Scheduled match missing conductor or live public visibility check
  const publishedActive = realMatches.filter(
    (m) => m.is_published && ["scheduled", "check_in", "ready", "live"].includes(m.status) && !m.conductor_id
  );
  if (publishedActive.length > 0) {
    findings.push({
      id: `${game.id}-missing-conductors`,
      gameId: game.id,
      gameTitle: game.title,
      severity: "warning",
      category: "schedule_conductor",
      title: `${publishedActive.length} published match(es) have no conductor assigned`,
      detail: "Assign conductors via Edit Match or Schedule to enable match-day scoring.",
      matchIds: publishedActive.map((m) => m.id),
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    gameTitle: game.title,
    formatLabel: tournament.format.replace(/_/g, " "),
    totalMatches: activeMatches.length,
    criticalCount: findings.filter((f) => f.severity === "critical").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
    hasStartedDrift,
    findings,
  };
}
