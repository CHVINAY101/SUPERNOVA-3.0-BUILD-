import type {
  Match,
  MatchDispute,
  MatchStatus,
  Registration,
  RegistrationStatus,
  Tournament,
  TournamentFormat,
  TournamentScoringMode,
  TournamentSelectionStatus,
} from "@/types/database";
import type { PermissionKey } from "@/lib/rbac";

export interface GeneratedMatchSpec {
  id: string;
  tournament_id: string;
  game_id: string;
  round: string;
  round_number: number;
  match_number: number;
  bracket_side: "winners" | "losers" | "grand_final" | "group" | "knockout";
  group_name: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  status: MatchStatus;
  score_a: number;
  score_b: number;
  winner_id: string | null;
  next_match_id: string | null;
  next_match_slot: "a" | "b" | null;
  loser_next_match_id: string | null;
  loser_next_match_slot: "a" | "b" | null;
  station: string | null;
  conductor_id: string | null;
  match_format: string | null;
  scheduled_start: string | null;
  is_published: boolean;
}

export function canTeamEnterTournament(team: Registration): { ok: boolean; reason?: string } {
  if (team.status !== "confirmed") {
    return {
      ok: false,
      reason: `Team "${team.team_name}" registration status is "${team.status}". Only approved (confirmed) teams can be selected.`,
    };
  }
  const sel: TournamentSelectionStatus = team.selection_status || "awaiting_selection";
  if (sel !== "selected") {
    return {
      ok: false,
      reason: `Team "${team.team_name}" selection status is "${sel}". Approved teams require explicit "selected" status before entering brackets.`,
    };
  }
  return { ok: true };
}

export function validateSelectionUpdate(params: {
  team: Registration;
  nextSelection: TournamentSelectionStatus;
  reason?: string;
}): { ok: true } | { ok: false; error: string } {
  if (params.nextSelection === "selected" && params.team.status !== "confirmed") {
    return {
      ok: false,
      error: `Cannot select "${params.team.team_name}" for tournament play while registration status is "${params.team.status}". Approve registration first.`,
    };
  }
  if (
    (params.nextSelection === "not_selected" || params.nextSelection === "disqualified") &&
    params.reason !== undefined &&
    params.reason.trim().length > 0 &&
    params.reason.trim().length < 3
  ) {
    return { ok: false, error: "Rejection/disqualification reason must be at least 3 characters." };
  }
  return { ok: true };
}

export function validateRegistrationStatusUpdate(params: {
  nextStatus: RegistrationStatus;
  reason?: string;
}): { ok: true } | { ok: false; error: string } {
  if (
    (params.nextStatus === "declined" || params.nextStatus === "correction_requested") &&
    (!params.reason || params.reason.trim().length < 4)
  ) {
    return {
      ok: false,
      error: "Please enter a clear reason or correction note (min 4 characters).",
    };
  }
  return { ok: true };
}

function deterministicShuffle<T>(items: T[], seedStr = "supernova-3"): T[] {
  const arr = [...items];
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  for (let i = arr.length - 1; i > 0; i--) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    const j = Math.abs(hash) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function orderTeamsForBracket(
  teams: Registration[],
  seedingMode: "manual" | "random" | "registration_order",
  shuffleSeed?: string
): Registration[] {
  const eligible = teams.filter((t) => canTeamEnterTournament(t).ok);
  if (seedingMode === "manual") {
    return [...eligible].sort((a, b) => {
      const sa = a.seed_number ?? 9999;
      const sb = b.seed_number ?? 9999;
      if (sa !== sb) return sa - sb;
      return a.submitted_at.localeCompare(b.submitted_at);
    });
  }
  if (seedingMode === "random") {
    return deterministicShuffle(eligible, shuffleSeed || "supernova-random");
  }
  return [...eligible].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
}

export function isTournamentStructureLocked(tournament: Tournament, existingMatches: Match[]): boolean {
  if (tournament.has_started || tournament.status === "locked" || tournament.status === "completed") {
    return true;
  }
  return existingMatches.some((m) =>
    ["live", "result_submitted", "completed", "disputed"].includes(m.status)
  );
}

export function canRegenerateBracket(params: {
  tournament: Tournament;
  existingMatches: Match[];
  confirmedStructuralOverride?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const started = isTournamentStructureLocked(params.tournament, params.existingMatches);
  if (started && !params.confirmedStructuralOverride) {
    return {
      ok: false,
      error:
        "Tournament matches have already started or completed. Structural edits are locked unless explicitly confirmed with an audit override.",
    };
  }
  if (params.existingMatches.length > 0 && !params.confirmedStructuralOverride) {
    return {
      ok: false,
      error:
        "A bracket already exists for this tournament. Confirm regeneration to cleanly replace existing unstarted matches without creating duplicates.",
    };
  }
  return { ok: true };
}

function makeUuidLike(seedPrefix: string, idx: number): string {
  // Deterministic valid UUID v4-formatted ID for clean preview/idempotent structures
  const hex = `${seedPrefix}${idx}`.split("").reduce((acc, ch) => {
    return ((acc * 31 + ch.charCodeAt(0)) >>> 0);
  }, 123456789);
  const p1 = (hex >>> 0).toString(16).padStart(8, "0").slice(0, 8);
  const p2 = ((idx + 100) & 0xffff).toString(16).padStart(4, "0");
  const p3 = (0x4000 | ((idx * 17) & 0x0fff)).toString(16).padStart(4, "0");
  const p4 = (0x8000 | ((idx * 37) & 0x3fff)).toString(16).padStart(4, "0");
  const p5 = (idx + 1).toString(16).padStart(12, "0");
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

/**
 * Generates clean, duplicate-free tournament fixtures with Bye handling, bracket links,
 * round labels, and default scheduling. Supports Single Elimination, Double Elimination,
 * Round Robin, and Group Stage -> Knockout.
 */
export function generateTournamentMatches(params: {
  tournamentId: string;
  gameId: string;
  format: TournamentFormat;
  teams: Registration[];
  seedingMode: "manual" | "random" | "registration_order";
  shuffleSeed?: string;
  matchFormatLabel?: string | null;
  defaultStation?: string | null;
  defaultConductorId?: string | null;
  startIso?: string;
  matchDurationMinutes?: number;
  groupCount?: number;
  advancePerGroup?: number;
  idGenerator?: (index: number) => string;
}): { ok: true; matches: GeneratedMatchSpec[]; teamCount: number } | { ok: false; error: string } {
  const ordered = orderTeamsForBracket(params.teams, params.seedingMode, params.shuffleSeed);
  if (ordered.length < 2) {
    return {
      ok: false,
      error: "At least 2 approved & selected teams are required to build a tournament bracket.",
    };
  }

  const nextId = (idx: number) =>
    params.idGenerator ? params.idGenerator(idx) : makeUuidLike(params.tournamentId.slice(0, 6), idx);
  let seqIdx = 0;
  const startBase = params.startIso ? new Date(params.startIso).getTime() : new Date("2026-11-20T10:00:00Z").getTime();
  const durationMs = Math.max(15, params.matchDurationMinutes || 45) * 60_000;
  const formatLabel = params.matchFormatLabel || "Bo1";
  const matches: GeneratedMatchSpec[] = [];

  if (params.format === "single_elimination" || params.format === "custom") {
    const n = ordered.length;
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const totalRounds = Math.log2(bracketSize);
    const padded: (Registration | null)[] = [...ordered];
    while (padded.length < bracketSize) padded.push(null);

    // Pre-create round shells from final backwards or round 1 forwards with known IDs
    const roundMatchIds: string[][] = [];
    for (let r = 1; r <= totalRounds; r++) {
      const countInRound = bracketSize / Math.pow(2, r);
      const ids: string[] = [];
      for (let m = 0; m < countInRound; m++) {
        ids.push(nextId(++seqIdx));
      }
      roundMatchIds.push(ids);
    }

    const roundTitle = (r: number) => {
      if (r === totalRounds) return "Grand Final";
      if (r === totalRounds - 1) return "Semifinals";
      if (r === totalRounds - 2) return "Quarterfinals";
      return `Round ${r}`;
    };

    for (let r = 1; r <= totalRounds; r++) {
      const ids = roundMatchIds[r - 1];
      const nextIds = r < totalRounds ? roundMatchIds[r] : null;
      for (let m = 0; m < ids.length; m++) {
        let teamA: string | null = null;
        let teamB: string | null = null;
        if (r === 1) {
          // Standard top-vs-bottom seeding pairs (0 vs bracketSize-1, etc. simplified adjacent for clarity)
          teamA = padded[m * 2]?.id || null;
          teamB = padded[m * 2 + 1]?.id || null;
        }
        const isBye = r === 1 && ((teamA && !teamB) || (!teamA && teamB));
        const byeWinner = isBye ? teamA || teamB : null;
        const nextMatchId = nextIds ? nextIds[Math.floor(m / 2)] : null;
        const nextSlot: "a" | "b" | null = nextIds ? (m % 2 === 0 ? "a" : "b") : null;

        matches.push({
          id: ids[m],
          tournament_id: params.tournamentId,
          game_id: params.gameId,
          round: roundTitle(r),
          round_number: r,
          match_number: m + 1,
          bracket_side: "winners",
          group_name: null,
          team_a_id: teamA,
          team_b_id: teamB,
          status: isBye ? "completed" : "scheduled",
          score_a: isBye && byeWinner === teamA ? 1 : 0,
          score_b: isBye && byeWinner === teamB ? 1 : 0,
          winner_id: byeWinner,
          next_match_id: nextMatchId,
          next_match_slot: nextSlot,
          loser_next_match_id: null,
          loser_next_match_slot: null,
          station: params.defaultStation || "Arena Stage 1",
          conductor_id: params.defaultConductorId || null,
          match_format: formatLabel,
          scheduled_start: new Date(startBase + (r - 1) * durationMs * 2 + m * durationMs).toISOString(),
          is_published: true,
        });
      }
    }

    // Auto-propagate R1 Byes directly into R2 slots without double-advancing
    for (const r1m of matches.filter((x) => x.round_number === 1 && x.winner_id && x.next_match_id)) {
      const target = matches.find((t) => t.id === r1m.next_match_id);
      if (target) {
        if (r1m.next_match_slot === "a") target.team_a_id = r1m.winner_id;
        else target.team_b_id = r1m.winner_id;
      }
    }

    return { ok: true, matches, teamCount: ordered.length };
  }

  if (params.format === "double_elimination") {
    const n = ordered.length;
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const wRounds = Math.log2(bracketSize);
    const padded: (Registration | null)[] = [...ordered];
    while (padded.length < bracketSize) padded.push(null);

    const winnersIds: string[][] = [];
    for (let r = 1; r <= wRounds; r++) {
      const cnt = bracketSize / Math.pow(2, r);
      winnersIds.push(Array.from({ length: cnt }, () => nextId(++seqIdx)));
    }

    // Losers bracket (simplified 1 match per W-round drop + losers progression into Grand Final)
    const losersCount = Math.max(1, winnersIds[0].length / 2);
    const losersRound1Ids = Array.from({ length: losersCount }, () => nextId(++seqIdx));
    const grandFinalId = nextId(++seqIdx);

    for (let r = 1; r <= wRounds; r++) {
      const ids = winnersIds[r - 1];
      const nextW = r < wRounds ? winnersIds[r] : [grandFinalId];
      for (let m = 0; m < ids.length; m++) {
        const teamA = r === 1 ? padded[m * 2]?.id || null : null;
        const teamB = r === 1 ? padded[m * 2 + 1]?.id || null : null;
        const isBye = r === 1 && ((teamA && !teamB) || (!teamA && teamB));
        const byeWinner = isBye ? teamA || teamB : null;
        const nextMatchId = r < wRounds ? nextW[Math.floor(m / 2)] : grandFinalId;
        const nextSlot: "a" | "b" = r < wRounds ? (m % 2 === 0 ? "a" : "b") : "a";
        const loserTargetId = r === 1 ? losersRound1Ids[Math.floor(m / 2)] || null : null;
        const loserSlot: "a" | "b" | null = loserTargetId ? (m % 2 === 0 ? "a" : "b") : null;

        matches.push({
          id: ids[m],
          tournament_id: params.tournamentId,
          game_id: params.gameId,
          round: r === wRounds ? "Winners Final" : `Winners Round ${r}`,
          round_number: r,
          match_number: m + 1,
          bracket_side: "winners",
          group_name: null,
          team_a_id: teamA,
          team_b_id: teamB,
          status: isBye ? "completed" : "scheduled",
          score_a: isBye && byeWinner === teamA ? 1 : 0,
          score_b: isBye && byeWinner === teamB ? 1 : 0,
          winner_id: byeWinner,
          next_match_id: nextMatchId,
          next_match_slot: nextSlot,
          loser_next_match_id: isBye ? null : loserTargetId,
          loser_next_match_slot: isBye ? null : loserSlot,
          station: params.defaultStation || "Arena Stage 1",
          conductor_id: params.defaultConductorId || null,
          match_format: formatLabel,
          scheduled_start: new Date(startBase + (r - 1) * durationMs * 2 + m * durationMs).toISOString(),
          is_published: true,
        });
      }
    }

    for (let m = 0; m < losersRound1Ids.length; m++) {
      matches.push({
        id: losersRound1Ids[m],
        tournament_id: params.tournamentId,
        game_id: params.gameId,
        round: losersRound1Ids.length === 1 ? "Losers Final" : `Losers Round 1 · M${m + 1}`,
        round_number: wRounds + 1,
        match_number: m + 1,
        bracket_side: "losers",
        group_name: null,
        team_a_id: null,
        team_b_id: null,
        status: "scheduled",
        score_a: 0,
        score_b: 0,
        winner_id: null,
        next_match_id: grandFinalId,
        next_match_slot: "b",
        loser_next_match_id: null,
        loser_next_match_slot: null,
        station: params.defaultStation || "Arena Stage 2",
        conductor_id: params.defaultConductorId || null,
        match_format: formatLabel,
        scheduled_start: new Date(startBase + wRounds * durationMs * 2 + m * durationMs).toISOString(),
        is_published: true,
      });
    }

    matches.push({
      id: grandFinalId,
      tournament_id: params.tournamentId,
      game_id: params.gameId,
      round: "Grand Final",
      round_number: wRounds + 2,
      match_number: 1,
      bracket_side: "grand_final",
      group_name: null,
      team_a_id: null,
      team_b_id: null,
      status: "scheduled",
      score_a: 0,
      score_b: 0,
      winner_id: null,
      next_match_id: null,
      next_match_slot: null,
      loser_next_match_id: null,
      loser_next_match_slot: null,
      station: params.defaultStation || "Main Stage",
      conductor_id: params.defaultConductorId || null,
      match_format: formatLabel,
      scheduled_start: new Date(startBase + (wRounds + 1) * durationMs * 2).toISOString(),
      is_published: true,
    });

    for (const r1m of matches.filter((x) => x.bracket_side === "winners" && x.round_number === 1 && x.winner_id && x.next_match_id)) {
      const target = matches.find((t) => t.id === r1m.next_match_id);
      if (target) {
        if (r1m.next_match_slot === "a") target.team_a_id = r1m.winner_id;
        else target.team_b_id = r1m.winner_id;
      }
    }

    return { ok: true, matches, teamCount: ordered.length };
  }

  if (params.format === "round_robin") {
    const list: (Registration | null)[] = [...ordered];
    if (list.length % 2 === 1) list.push(null); // Bye slot
    const numTeams = list.length;
    const totalRounds = numTeams - 1;
    let matchCounter = 0;

    for (let round = 0; round < totalRounds; round++) {
      for (let idx = 0; idx < numTeams / 2; idx++) {
        const a = list[idx];
        const b = list[numTeams - 1 - idx];
        if (a && b) {
          matchCounter++;
          matches.push({
            id: nextId(++seqIdx),
            tournament_id: params.tournamentId,
            game_id: params.gameId,
            round: `Round ${round + 1}`,
            round_number: round + 1,
            match_number: matchCounter,
            bracket_side: "group",
            group_name: "League",
            team_a_id: a.id,
            team_b_id: b.id,
            status: "scheduled",
            score_a: 0,
            score_b: 0,
            winner_id: null,
            next_match_id: null,
            next_match_slot: null,
            loser_next_match_id: null,
            loser_next_match_slot: null,
            station: params.defaultStation || "Arena Stage 1",
            conductor_id: params.defaultConductorId || null,
            match_format: formatLabel,
            scheduled_start: new Date(startBase + (matchCounter - 1) * durationMs).toISOString(),
            is_published: true,
          });
        }
      }
      // Circle rotation keeping index 0 fixed
      const last = list.pop()!;
      list.splice(1, 0, last);
    }

    return { ok: true, matches, teamCount: ordered.length };
  }

  // Group Stage + Knockout
  const groupCount = Math.max(2, Math.min(4, params.groupCount || 2));
  const groups: Registration[][] = Array.from({ length: groupCount }, () => []);
  ordered.forEach((team, idx) => {
    groups[idx % groupCount].push(team);
  });

  let matchCounter = 0;
  groups.forEach((grpTeams, gIdx) => {
    const groupLetter = String.fromCharCode(65 + gIdx); // A, B, C...
    for (let i = 0; i < grpTeams.length; i++) {
      for (let j = i + 1; j < grpTeams.length; j++) {
        matchCounter++;
        matches.push({
          id: nextId(++seqIdx),
          tournament_id: params.tournamentId,
          game_id: params.gameId,
          round: `Group ${groupLetter}`,
          round_number: 1,
          match_number: matchCounter,
          bracket_side: "group",
          group_name: `Group ${groupLetter}`,
          team_a_id: grpTeams[i].id,
          team_b_id: grpTeams[j].id,
          status: "scheduled",
          score_a: 0,
          score_b: 0,
          winner_id: null,
          next_match_id: null,
          next_match_slot: null,
          loser_next_match_id: null,
          loser_next_match_slot: null,
          station: params.defaultStation || `Stage ${groupLetter}`,
          conductor_id: params.defaultConductorId || null,
          match_format: formatLabel,
          scheduled_start: new Date(startBase + (matchCounter - 1) * durationMs).toISOString(),
          is_published: true,
        });
      }
    }
  });

  // Add Knockout Semifinals + Grand Final placeholders
  const finalId = nextId(++seqIdx);
  const semiAId = nextId(++seqIdx);
  const semiBId = nextId(++seqIdx);

  matches.push(
    {
      id: semiAId,
      tournament_id: params.tournamentId,
      game_id: params.gameId,
      round: "Knockout Semifinal A",
      round_number: 2,
      match_number: 1,
      bracket_side: "knockout",
      group_name: null,
      team_a_id: null,
      team_b_id: null,
      status: "scheduled",
      score_a: 0,
      score_b: 0,
      winner_id: null,
      next_match_id: finalId,
      next_match_slot: "a",
      loser_next_match_id: null,
      loser_next_match_slot: null,
      station: params.defaultStation || "Main Stage",
      conductor_id: params.defaultConductorId || null,
      match_format: formatLabel,
      scheduled_start: new Date(startBase + (matchCounter + 1) * durationMs).toISOString(),
      is_published: true,
    },
    {
      id: semiBId,
      tournament_id: params.tournamentId,
      game_id: params.gameId,
      round: "Knockout Semifinal B",
      round_number: 2,
      match_number: 2,
      bracket_side: "knockout",
      group_name: null,
      team_a_id: null,
      team_b_id: null,
      status: "scheduled",
      score_a: 0,
      score_b: 0,
      winner_id: null,
      next_match_id: finalId,
      next_match_slot: "b",
      loser_next_match_id: null,
      loser_next_match_slot: null,
      station: params.defaultStation || "Main Stage",
      conductor_id: params.defaultConductorId || null,
      match_format: formatLabel,
      scheduled_start: new Date(startBase + (matchCounter + 2) * durationMs).toISOString(),
      is_published: true,
    },
    {
      id: finalId,
      tournament_id: params.tournamentId,
      game_id: params.gameId,
      round: "Grand Final",
      round_number: 3,
      match_number: 1,
      bracket_side: "grand_final",
      group_name: null,
      team_a_id: null,
      team_b_id: null,
      status: "scheduled",
      score_a: 0,
      score_b: 0,
      winner_id: null,
      next_match_id: null,
      next_match_slot: null,
      loser_next_match_id: null,
      loser_next_match_slot: null,
      station: params.defaultStation || "Main Stage",
      conductor_id: params.defaultConductorId || null,
      match_format: formatLabel,
      scheduled_start: new Date(startBase + (matchCounter + 3) * durationMs).toISOString(),
      is_published: true,
    }
  );

  return { ok: true, matches, teamCount: ordered.length };
}

// -----------------------------------------------------------------------------
// Game-Specific Scoring Engines
// -----------------------------------------------------------------------------
export interface RoundMapScore {
  mapName: string;
  scoreA: number;
  scoreB: number;
}

export function calculateRoundBasedOutcome(params: {
  teamAId: string;
  teamBId: string;
  maps: RoundMapScore[];
}): { scoreA: number; scoreB: number; winnerId: string | null } {
  let mapsWonA = 0;
  let mapsWonB = 0;
  let totalRoundsA = 0;
  let totalRoundsB = 0;

  for (const m of params.maps) {
    totalRoundsA += Math.max(0, m.scoreA);
    totalRoundsB += Math.max(0, m.scoreB);
    if (m.scoreA > m.scoreB) mapsWonA++;
    else if (m.scoreB > m.scoreA) mapsWonB++;
  }

  // If single map (Bo1), use round scores directly; otherwise map wins
  const isSingleMap = params.maps.length === 1;
  const finalA = isSingleMap ? totalRoundsA : mapsWonA;
  const finalB = isSingleMap ? totalRoundsB : mapsWonB;
  const winnerId = finalA > finalB ? params.teamAId : finalB > finalA ? params.teamBId : null;

  return { scoreA: finalA, scoreB: finalB, winnerId };
}

export interface BattleRoyaleLobbyEntry {
  teamId: string;
  teamName: string;
  placement: number;
  kills: number;
}

export interface BattleRoyaleStandingRow extends BattleRoyaleLobbyEntry {
  placementPoints: number;
  killPoints: number;
  totalPoints: number;
  rank: number;
}

export const DEFAULT_BR_PLACEMENT_POINTS: Record<number, number> = {
  1: 15,
  2: 12,
  3: 10,
  4: 8,
  5: 6,
  6: 4,
  7: 2,
  8: 1,
};

export function calculateBattleRoyaleStandings(
  entries: BattleRoyaleLobbyEntry[],
  placementPointsTable: Record<number, number> = DEFAULT_BR_PLACEMENT_POINTS,
  pointsPerKill = 1
): BattleRoyaleStandingRow[] {
  const scored = entries.map((e) => {
    const placementPoints = placementPointsTable[e.placement] ?? 0;
    const killPoints = Math.max(0, e.kills) * pointsPerKill;
    const totalPoints = placementPoints + killPoints;
    return {
      ...e,
      placementPoints,
      killPoints,
      totalPoints,
      rank: 0,
    };
  });

  scored.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.placementPoints !== a.placementPoints) return b.placementPoints - a.placementPoints;
    if (b.kills !== a.kills) return b.kills - a.kills;
    return a.placement - b.placement;
  });

  return scored.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export interface GroupStandingRow {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDiff: number;
  points: number;
}

export function calculateGroupStandings(
  teamIds: string[],
  matches: Match[],
  pointsConfig = { win: 3, draw: 1, loss: 0 }
): GroupStandingRow[] {
  const map = new Map<string, GroupStandingRow>();
  for (const id of teamIds) {
    map.set(id, {
      teamId: id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      scoreDiff: 0,
      points: 0,
    });
  }

  for (const m of matches) {
    if (m.status !== "completed" || !m.team_a_id || !m.team_b_id) continue;
    const rowA = map.get(m.team_a_id);
    const rowB = map.get(m.team_b_id);
    if (!rowA || !rowB) continue;

    rowA.played++;
    rowB.played++;
    rowA.scoreFor += m.score_a;
    rowA.scoreAgainst += m.score_b;
    rowB.scoreFor += m.score_b;
    rowB.scoreAgainst += m.score_a;

    if (m.winner_id === m.team_a_id || (!m.winner_id && m.score_a > m.score_b)) {
      rowA.wins++;
      rowA.points += pointsConfig.win;
      rowB.losses++;
      rowB.points += pointsConfig.loss;
    } else if (m.winner_id === m.team_b_id || (!m.winner_id && m.score_b > m.score_a)) {
      rowB.wins++;
      rowB.points += pointsConfig.win;
      rowA.losses++;
      rowA.points += pointsConfig.loss;
    } else {
      rowA.draws++;
      rowB.draws++;
      rowA.points += pointsConfig.draw;
      rowB.points += pointsConfig.draw;
    }
  }

  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    scoreDiff: r.scoreFor - r.scoreAgainst,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
    return b.scoreFor - a.scoreFor;
  });

  return rows;
}

// -----------------------------------------------------------------------------
// Conductor Authorization, Result Submission, Confirmation & Dispute Lifecycle
// -----------------------------------------------------------------------------
export function authorizeConductorMatchOperation(params: {
  match: Match;
  actorUserId: string;
  permissions: Set<PermissionKey>;
}): { ok: true } | { ok: false; error: string } {
  const isManager =
    params.permissions.has("tournament:confirm_results") ||
    params.permissions.has("tournament:assign_conductors") ||
    params.permissions.has("esports:edit");

  if (isManager) {
    return { ok: true };
  }

  if (!params.permissions.has("conductor:view_assigned")) {
    return { ok: false, error: "Forbidden: Conductor permission required." };
  }

  if (!params.match.conductor_id || params.match.conductor_id !== params.actorUserId) {
    return {
      ok: false,
      error: "Access denied: Match Conductors can only operate matches explicitly assigned to them.",
    };
  }

  return { ok: true };
}

export function submitMatchResultDraft(params: {
  match: Match;
  actorUserId: string;
  permissions: Set<PermissionKey>;
  scoreA: number;
  scoreB: number;
  winnerId: string | null;
  detailedScores?: Record<string, unknown>;
  requireManagerConfirmation: boolean;
  notes?: string;
}): { ok: true; updatedMatch: Match } | { ok: false; error: string } {
  const auth = authorizeConductorMatchOperation({
    match: params.match,
    actorUserId: params.actorUserId,
    permissions: params.permissions,
  });
  if (!auth.ok) return auth;

  if (!params.permissions.has("conductor:submit_result") && !params.permissions.has("tournament:confirm_results")) {
    return { ok: false, error: "Forbidden: Missing conductor:submit_result permission." };
  }

  if (params.match.status === "disputed") {
    return { ok: false, error: "Match is currently DISPUTED and frozen pending manager resolution." };
  }

  if (params.match.bracket_advanced_at) {
    return { ok: false, error: "Match result has already been confirmed and advanced in the bracket." };
  }

  const nowIso = new Date().toISOString();
  const nextStatus: MatchStatus = params.requireManagerConfirmation ? "result_submitted" : "completed";

  return {
    ok: true,
    updatedMatch: {
      ...params.match,
      score_a: Math.max(0, params.scoreA),
      score_b: Math.max(0, params.scoreB),
      winner_id: params.winnerId,
      detailed_scores: params.detailedScores || params.match.detailed_scores || null,
      status: nextStatus,
      result_status: params.requireManagerConfirmation ? "submitted" : "confirmed",
      submitted_by: params.actorUserId,
      submitted_at: nowIso,
      notes: params.notes || params.match.notes || null,
      updated_at: nowIso,
    },
  };
}

/**
 * Confirms a submitted match result and atomically advances the winner (and loser in Double Elim)
 * into downstream bracket slots. Strictly guards against double advancement.
 */
export function confirmAndAdvanceMatchResult(params: {
  matches: Match[];
  matchId: string;
  managerUserId: string;
  permissions: Set<PermissionKey>;
  overrideScoreA?: number;
  overrideScoreB?: number;
  overrideWinnerId?: string | null;
}): { ok: true; matches: Match[]; advancedToMatchId: string | null } | { ok: false; error: string } {
  if (!params.permissions.has("tournament:confirm_results") && !params.permissions.has("esports:approve")) {
    return { ok: false, error: "Forbidden: Only Esports Managers or Admins can confirm match results." };
  }

  const idx = params.matches.findIndex((m) => m.id === params.matchId);
  if (idx === -1) {
    return { ok: false, error: "Match not found." };
  }

  const current = params.matches[idx];
  if (current.status === "disputed") {
    return { ok: false, error: "Cannot confirm or advance a disputed match until the dispute is resolved." };
  }

  if (current.bracket_advanced_at) {
    return {
      ok: false,
      error: "Duplicate advancement blocked: this match has already advanced its winner to the next round.",
    };
  }

  const scoreA = typeof params.overrideScoreA === "number" ? params.overrideScoreA : current.score_a;
  const scoreB = typeof params.overrideScoreB === "number" ? params.overrideScoreB : current.score_b;
  const winnerId = params.overrideWinnerId !== undefined ? params.overrideWinnerId : current.winner_id;

  if (!winnerId || (winnerId !== current.team_a_id && winnerId !== current.team_b_id)) {
    return { ok: false, error: "A valid match winner belonging to Team A or Team B must be selected before confirmation." };
  }

  const loserId = winnerId === current.team_a_id ? current.team_b_id : current.team_a_id;
  const nowIso = new Date().toISOString();

  const updated = params.matches.map((m) => ({ ...m }));
  updated[idx] = {
    ...updated[idx],
    score_a: scoreA,
    score_b: scoreB,
    winner_id: winnerId,
    status: "completed",
    result_status: "confirmed",
    confirmed_by: params.managerUserId,
    confirmed_at: nowIso,
    bracket_advanced_at: nowIso,
    updated_at: nowIso,
  };

  if (current.next_match_id) {
    const nextIdx = updated.findIndex((m) => m.id === current.next_match_id);
    if (nextIdx !== -1) {
      if (current.next_match_slot === "b") {
        updated[nextIdx].team_b_id = winnerId;
      } else {
        updated[nextIdx].team_a_id = winnerId;
      }
      updated[nextIdx].updated_at = nowIso;
    }
  }

  if (current.loser_next_match_id && loserId) {
    const loserIdx = updated.findIndex((m) => m.id === current.loser_next_match_id);
    if (loserIdx !== -1) {
      if (current.loser_next_match_slot === "b") {
        updated[loserIdx].team_b_id = loserId;
      } else {
        updated[loserIdx].team_a_id = loserId;
      }
      updated[loserIdx].updated_at = nowIso;
    }
  }

  return {
    ok: true,
    matches: updated,
    advancedToMatchId: current.next_match_id || null,
  };
}

export function escalateMatchDispute(params: {
  match: Match;
  reporterUserId: string;
  reason: string;
}): { ok: true; updatedMatch: Match; dispute: MatchDispute } | { ok: false; error: string } {
  if (!params.reason || params.reason.trim().length < 5) {
    return { ok: false, error: "Dispute reason must be at least 5 characters." };
  }
  const nowIso = new Date().toISOString();
  return {
    ok: true,
    updatedMatch: {
      ...params.match,
      status: "disputed",
      result_status: "disputed",
      updated_at: nowIso,
    },
    dispute: {
      id: `disp-${params.match.id}-${Date.now()}`,
      match_id: params.match.id,
      reported_by: params.reporterUserId,
      reason: params.reason.trim(),
      status: "open",
      original_submission: {
        score_a: params.match.score_a,
        score_b: params.match.score_b,
        winner_id: params.match.winner_id,
        submitted_by: params.match.submitted_by || null,
        submitted_at: params.match.submitted_at || null,
      },
      created_at: nowIso,
    },
  };
}

export function resolveMatchDispute(params: {
  matches: Match[];
  dispute: MatchDispute;
  managerUserId: string;
  permissions: Set<PermissionKey>;
  correctedScoreA: number;
  correctedScoreB: number;
  correctedWinnerId: string;
  resolutionNotes: string;
}): { ok: true; matches: Match[]; resolvedDispute: MatchDispute } | { ok: false; error: string } {
  if (!params.permissions.has("tournament:resolve_disputes")) {
    return { ok: false, error: "Forbidden: tournament:resolve_disputes permission required." };
  }
  if (!params.resolutionNotes || params.resolutionNotes.trim().length < 5) {
    return { ok: false, error: "Resolution notes (min 5 characters) are required for audit history." };
  }

  const idx = params.matches.findIndex((m) => m.id === params.dispute.match_id);
  if (idx === -1) {
    return { ok: false, error: "Disputed match not found." };
  }

  const nowIso = new Date().toISOString();
  const unfrozen = params.matches.map((m, i) =>
    i === idx
      ? {
          ...m,
          status: "result_submitted" as MatchStatus,
          result_status: "submitted" as const,
          score_a: params.correctedScoreA,
          score_b: params.correctedScoreB,
          winner_id: params.correctedWinnerId,
          updated_at: nowIso,
        }
      : m
  );

  const confirmed = confirmAndAdvanceMatchResult({
    matches: unfrozen,
    matchId: params.dispute.match_id,
    managerUserId: params.managerUserId,
    permissions: params.permissions,
    overrideScoreA: params.correctedScoreA,
    overrideScoreB: params.correctedScoreB,
    overrideWinnerId: params.correctedWinnerId,
  });

  if (!confirmed.ok) {
    return confirmed;
  }

  return {
    ok: true,
    matches: confirmed.matches,
    resolvedDispute: {
      ...params.dispute,
      status: "resolved",
      resolution_notes: params.resolutionNotes.trim(),
      resolved_by: params.managerUserId,
      resolved_at: nowIso,
    },
  };
}

export function normalizeScoringModeLabel(mode?: TournamentScoringMode | string | null): string {
  switch (mode) {
    case "round_based":
      return "Round-Based (Maps / Rounds)";
    case "battle_royale":
      return "Battle Royale (Placement + Kills)";
    case "group_points":
      return "Group Points (W / D / L + Diff)";
    default:
      return "Custom Rules";
  }
}
