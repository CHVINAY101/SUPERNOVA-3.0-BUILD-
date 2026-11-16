import type {
  BattleRoyaleTeamResult,
  Match,
  MatchDispute,
  MatchStatus,
  Registration,
  RegistrationStatus,
  Tournament,
  TournamentFormat,
  TournamentScoringMode,
  TournamentSelectionStatus,
} from "../types/database.ts";
import type { PermissionKey } from "./rbac.ts";

export interface GeneratedMatchSpec {
  id: string;
  tournament_id: string;
  game_id: string;
  match_code: string;
  bracket_position: string;
  round: string;
  round_number: number;
  match_number: number;
  bracket_side:
    | "winners"
    | "losers"
    | "grand_final"
    | "group"
    | "knockout"
    | "battle_royale"
    | "head_to_head";
  group_name: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  br_results: BattleRoyaleTeamResult[];
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
  scheduled_end: string | null;
  duration_minutes: number;
  is_scheduled: boolean;
  is_published: boolean;
}

export function getGameCodePrefix(gameTitle?: string | null): string {
  const upper = (gameTitle || "").toUpperCase().trim();
  if (upper.includes("VALORANT")) return "VAL";
  if (upper.includes("FREE FIRE")) return "FF";
  if (upper.includes("BGMI")) return "BGMI";
  const cleaned = upper.replace(/[^A-Z0-9]/g, "");
  return cleaned.slice(0, 4) || "ESP";
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
        "A bracket or fixture list already exists for this game. Confirm regeneration to cleanly replace existing unstarted matches without creating duplicates.",
    };
  }
  return { ok: true };
}

function generateSafeUuid(seedPrefix: string, idx: number): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const hex = `${seedPrefix}${idx}`.split("").reduce((acc, ch) => {
    return (acc * 31 + ch.charCodeAt(0)) >>> 0;
  }, 123456789);
  const p1 = (hex >>> 0).toString(16).padStart(8, "0").slice(0, 8);
  const p2 = ((idx + 100) & 0xffff).toString(16).padStart(4, "0");
  const p3 = (0x4000 | ((idx * 17) & 0x0fff)).toString(16).padStart(4, "0");
  const p4 = (0x8000 | ((idx * 37) & 0x3fff)).toString(16).padStart(4, "0");
  const p5 = (idx + 1).toString(16).padStart(12, "0");
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

/**
 * Computes Round 1 pairings cleanly for any N >= 2 in power-of-2 brackets of size B = 2^ceil(log2(N)).
 * Guarantees ZERO (null, null) empty matches by distributing exact (B - N) Byes to single teams.
 */
function buildRoundOnePairs(ordered: Registration[], bracketSize: number): [string | null, string | null][] {
  const matchCount = bracketSize / 2;
  const numRealMatches = ordered.length - matchCount;
  const pairs: [string | null, string | null][] = [];
  let cursor = 0;

  for (let m = 0; m < matchCount; m++) {
    if (m < numRealMatches) {
      const a = ordered[cursor++]?.id || null;
      const b = ordered[cursor++]?.id || null;
      pairs.push([a, b]);
    } else {
      const a = ordered[cursor++]?.id || null;
      pairs.push([a, null]);
    }
  }
  return pairs;
}

/**
 * Generates clean, duplicate-free tournament fixtures with Bye handling, bracket links,
 * human-readable match codes, and optional unscheduled creation (`leaveUnscheduled: true`)
 * so admins explicitly approve match schedules in IST.
 */
export function generateTournamentMatches(params: {
  tournamentId: string;
  gameId: string;
  gameTitle?: string | null;
  format: TournamentFormat;
  teams: Registration[];
  seedingMode: "manual" | "random" | "registration_order";
  approvedTeamLimit?: number | null;
  shuffleSeed?: string;
  matchFormatLabel?: string | null;
  defaultStation?: string | null;
  defaultConductorId?: string | null;
  startIso?: string;
  matchDurationMinutes?: number;
  totalRounds?: number;
  teamsPerLobby?: number;
  groupCount?: number;
  advancePerGroup?: number;
  leaveUnscheduled?: boolean;
  isPublished?: boolean;
  idGenerator?: (index: number) => string;
}): { ok: true; matches: GeneratedMatchSpec[]; teamCount: number } | { ok: false; error: string } {
  let ordered = orderTeamsForBracket(params.teams, params.seedingMode, params.shuffleSeed);
  if (params.approvedTeamLimit && params.approvedTeamLimit >= 2) {
    ordered = ordered.slice(0, params.approvedTeamLimit);
  }

  if (ordered.length < 2) {
    return {
      ok: false,
      error: "At least 2 approved & selected teams are required to build tournament fixtures.",
    };
  }

  const nextId = (idx: number) =>
    params.idGenerator ? params.idGenerator(idx) : generateSafeUuid(params.tournamentId.slice(0, 6), idx);
  let seqIdx = 0;

  const prefix = getGameCodePrefix(params.gameTitle);
  const leaveUnscheduled = Boolean(params.leaveUnscheduled);
  const durationMinutes = Math.max(10, Math.min(480, params.matchDurationMinutes || 30));
  const durationMs = durationMinutes * 60_000;
  const startBase = params.startIso
    ? new Date(params.startIso).getTime()
    : new Date("2026-11-20T04:30:00.000Z").getTime(); // 10:00 AM IST
  const formatLabel = params.matchFormatLabel || (params.format === "battle_royale" ? "BR Lobby" : "BO1");
  const isPublished = params.isPublished !== false;
  const matches: GeneratedMatchSpec[] = [];

  const computeSchedule = (slotOffsetIndex: number, isBye = false) => {
    if (leaveUnscheduled || isBye) {
      return {
        scheduled_start: null,
        scheduled_end: null,
        is_scheduled: false,
      };
    }
    const st = new Date(startBase + slotOffsetIndex * durationMs);
    const en = new Date(st.getTime() + durationMs);
    return {
      scheduled_start: st.toISOString(),
      scheduled_end: en.toISOString(),
      is_scheduled: true,
    };
  };

  // ---------------------------------------------------------------------------
  // 1. BATTLE ROYALE (Free Fire / BGMI Multi-Lobby Multi-Round Points Championship)
  // ---------------------------------------------------------------------------
  if (params.format === "battle_royale") {
    const numRounds = Math.max(1, Math.min(12, Math.trunc(params.totalRounds || 3)));
    const lobbyCapacity =
      params.teamsPerLobby && params.teamsPerLobby >= 2
        ? Math.max(2, Math.min(100, Math.trunc(params.teamsPerLobby)))
        : ordered.length;
    const lobbyCount = Math.max(1, Math.ceil(ordered.length / lobbyCapacity));
    let slotCursor = 0;

    for (let r = 1; r <= numRounds; r++) {
      // Distribute teams into balanced lobbies; rotate interleaving offset across rounds when >1 lobby
      const lobbies: Registration[][] = Array.from({ length: lobbyCount }, () => []);
      ordered.forEach((team, idx) => {
        const lobbyIdx =
          lobbyCount === 1
            ? 0
            : (idx + (r - 1)) % lobbyCount;
        lobbies[lobbyIdx].push(team);
      });

      for (let lIdx = 0; lIdx < lobbies.length; lIdx++) {
        const lobbyTeams = lobbies[lIdx];
        if (lobbyTeams.length === 0) continue;

        const lobbyNum = lIdx + 1;
        const sched = computeSchedule(slotCursor++, false);
        const lobbyRoster: BattleRoyaleTeamResult[] = lobbyTeams.map((t) => ({
          team_id: t.id,
          team_name: t.team_name,
          registration_ref: t.registration_ref,
          institution: t.institution,
          placement: null,
          kills: 0,
          placement_points: 0,
          kill_points: 0,
          total_points: 0,
        }));

        matches.push({
          id: nextId(++seqIdx),
          tournament_id: params.tournamentId,
          game_id: params.gameId,
          match_code: `${prefix}-R${String(r).padStart(2, "0")}-L${String(lobbyNum).padStart(2, "0")}`,
          bracket_position: `BR-R${r}-L${lobbyNum}`,
          round:
            lobbyCount > 1
              ? `Round ${r} · Lobby ${lobbyNum}`
              : numRounds === 1
              ? "Championship Lobby"
              : `Match ${r} (Lobby Points)`,
          round_number: r,
          match_number: lobbyNum,
          bracket_side: "battle_royale",
          group_name: lobbyCount > 1 ? `Lobby ${lobbyNum}` : "BR Lobby",
          team_a_id: null,
          team_b_id: null,
          br_results: lobbyRoster,
          status: sched.is_scheduled ? "scheduled" : "upcoming",
          score_a: 0,
          score_b: 0,
          winner_id: null,
          next_match_id: null,
          next_match_slot: null,
          loser_next_match_id: null,
          loser_next_match_slot: null,
          station:
            lobbyCount > 1
              ? `${params.defaultStation || "BR Arena"} · Lobby ${lobbyNum}`
              : params.defaultStation || "BR Arena Lobby",
          conductor_id: params.defaultConductorId || null,
          match_format: "BR Lobby",
          scheduled_start: sched.scheduled_start,
          scheduled_end: sched.scheduled_end,
          duration_minutes: durationMinutes,
          is_scheduled: sched.is_scheduled,
          is_published: isPublished,
        });
      }
    }

    return { ok: true, matches, teamCount: ordered.length };
  }

  // ---------------------------------------------------------------------------
  // 2. HEAD-TO-HEAD (Clash Squad / TDM Series or Structured Pairings)
  // ---------------------------------------------------------------------------
  if (params.format === "head_to_head") {
    const list: (Registration | null)[] = [...ordered];
    if (list.length % 2 === 1) list.push(null);
    const numTeams = list.length;
    const maxRounds = Math.min(numTeams - 1, Math.max(1, params.totalRounds || numTeams - 1));
    let matchCounter = 0;

    for (let r = 0; r < maxRounds; r++) {
      for (let idx = 0; idx < numTeams / 2; idx++) {
        const a = list[idx];
        const b = list[numTeams - 1 - idx];
        if (a && b) {
          matchCounter++;
          const sched = computeSchedule(matchCounter - 1, false);
          matches.push({
            id: nextId(++seqIdx),
            tournament_id: params.tournamentId,
            game_id: params.gameId,
            match_code: `${prefix}-H2H-M${String(matchCounter).padStart(2, "0")}`,
            bracket_position: `H2H-R${r + 1}-P${idx + 1}`,
            round: `Head-to-Head Round ${r + 1}`,
            round_number: r + 1,
            match_number: matchCounter,
            bracket_side: "head_to_head",
            group_name: "Head-to-Head",
            team_a_id: a.id,
            team_b_id: b.id,
            br_results: [],
            status: sched.is_scheduled ? "scheduled" : "upcoming",
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
            scheduled_start: sched.scheduled_start,
            scheduled_end: sched.scheduled_end,
            duration_minutes: durationMinutes,
            is_scheduled: sched.is_scheduled,
            is_published: isPublished,
          });
        }
      }
      const last = list.pop()!;
      list.splice(1, 0, last);
    }

    return { ok: true, matches, teamCount: ordered.length };
  }

  // ---------------------------------------------------------------------------
  // 3. SINGLE ELIMINATION (or custom fallback)
  // ---------------------------------------------------------------------------
  if (params.format === "single_elimination" || params.format === "custom") {
    const n = ordered.length;
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const totalRounds = Math.log2(bracketSize);
    const r1Pairs = buildRoundOnePairs(ordered, bracketSize);

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

    let globalMatchIndex = 0;
    for (let r = 1; r <= totalRounds; r++) {
      const ids = roundMatchIds[r - 1];
      const nextIds = r < totalRounds ? roundMatchIds[r] : null;
      for (let m = 0; m < ids.length; m++) {
        const teamA = r === 1 ? r1Pairs[m][0] : null;
        const teamB = r === 1 ? r1Pairs[m][1] : null;
        const isBye = Boolean(r === 1 && ((teamA && !teamB) || (!teamA && teamB)));
        const byeWinner = isBye ? teamA || teamB : null;
        const nextMatchId = nextIds ? nextIds[Math.floor(m / 2)] : null;
        const nextSlot: "a" | "b" | null = nextIds ? (m % 2 === 0 ? "a" : "b") : null;
        const sched = computeSchedule(isBye ? globalMatchIndex : globalMatchIndex++, isBye);

        matches.push({
          id: ids[m],
          tournament_id: params.tournamentId,
          game_id: params.gameId,
          match_code: `${prefix}-R${r}-M${String(m + 1).padStart(2, "0")}`,
          bracket_position: `W-R${r}-P${m + 1}`,
          round: roundTitle(r),
          round_number: r,
          match_number: m + 1,
          bracket_side: r === totalRounds ? "grand_final" : "winners",
          group_name: null,
          team_a_id: teamA,
          team_b_id: teamB,
          br_results: [],
          status: isBye ? "completed" : sched.is_scheduled ? "scheduled" : "upcoming",
          score_a: isBye && byeWinner === teamA ? 1 : 0,
          score_b: isBye && byeWinner === teamB ? 1 : 0,
          winner_id: byeWinner,
          next_match_id: nextMatchId,
          next_match_slot: nextSlot,
          loser_next_match_id: null,
          loser_next_match_slot: null,
          station: isBye ? null : params.defaultStation || "Arena Stage 1",
          conductor_id: isBye ? null : params.defaultConductorId || null,
          match_format: isBye ? "BYE" : formatLabel,
          scheduled_start: sched.scheduled_start,
          scheduled_end: sched.scheduled_end,
          duration_minutes: durationMinutes,
          is_scheduled: sched.is_scheduled,
          is_published: isPublished,
        });
      }
    }

    // Auto-propagate R1 Byes cleanly into R2 slots without locking progression
    for (const r1m of matches.filter((x) => x.round_number === 1 && x.winner_id && x.next_match_id)) {
      const target = matches.find((t) => t.id === r1m.next_match_id);
      if (target) {
        if (r1m.next_match_slot === "a") target.team_a_id = r1m.winner_id;
        else target.team_b_id = r1m.winner_id;
      }
    }

    return { ok: true, matches, teamCount: ordered.length };
  }

  // ---------------------------------------------------------------------------
  // 4. DOUBLE ELIMINATION
  // ---------------------------------------------------------------------------
  if (params.format === "double_elimination") {
    const n = ordered.length;
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const wRounds = Math.log2(bracketSize);
    const r1Pairs = buildRoundOnePairs(ordered, bracketSize);

    const winnersIds: string[][] = [];
    for (let r = 1; r <= wRounds; r++) {
      const cnt = bracketSize / Math.pow(2, r);
      winnersIds.push(Array.from({ length: cnt }, () => nextId(++seqIdx)));
    }

    const losersCount = Math.max(1, winnersIds[0].length / 2);
    const losersRound1Ids = Array.from({ length: losersCount }, () => nextId(++seqIdx));
    const grandFinalId = nextId(++seqIdx);
    let slotCursor = 0;

    for (let r = 1; r <= wRounds; r++) {
      const ids = winnersIds[r - 1];
      const nextW = r < wRounds ? winnersIds[r] : [grandFinalId];
      for (let m = 0; m < ids.length; m++) {
        const teamA = r === 1 ? r1Pairs[m][0] : null;
        const teamB = r === 1 ? r1Pairs[m][1] : null;
        const isBye = Boolean(r === 1 && ((teamA && !teamB) || (!teamA && teamB)));
        const byeWinner = isBye ? teamA || teamB : null;
        const nextMatchId = r < wRounds ? nextW[Math.floor(m / 2)] : grandFinalId;
        const nextSlot: "a" | "b" = r < wRounds ? (m % 2 === 0 ? "a" : "b") : "a";
        const loserTargetId = r === 1 ? losersRound1Ids[Math.floor(m / 2)] || null : null;
        const loserSlot: "a" | "b" | null = loserTargetId ? (m % 2 === 0 ? "a" : "b") : null;
        const sched = computeSchedule(isBye ? slotCursor : slotCursor++, isBye);

        matches.push({
          id: ids[m],
          tournament_id: params.tournamentId,
          game_id: params.gameId,
          match_code: `${prefix}-WR${r}-M${String(m + 1).padStart(2, "0")}`,
          bracket_position: `W-R${r}-P${m + 1}`,
          round: r === wRounds ? "Winners Final" : `Winners Round ${r}`,
          round_number: r,
          match_number: m + 1,
          bracket_side: "winners",
          group_name: null,
          team_a_id: teamA,
          team_b_id: teamB,
          br_results: [],
          status: isBye ? "completed" : sched.is_scheduled ? "scheduled" : "upcoming",
          score_a: isBye && byeWinner === teamA ? 1 : 0,
          score_b: isBye && byeWinner === teamB ? 1 : 0,
          winner_id: byeWinner,
          next_match_id: nextMatchId,
          next_match_slot: nextSlot,
          loser_next_match_id: isBye ? null : loserTargetId,
          loser_next_match_slot: isBye ? null : loserSlot,
          station: isBye ? null : params.defaultStation || "Arena Stage 1",
          conductor_id: isBye ? null : params.defaultConductorId || null,
          match_format: isBye ? "BYE" : formatLabel,
          scheduled_start: sched.scheduled_start,
          scheduled_end: sched.scheduled_end,
          duration_minutes: durationMinutes,
          is_scheduled: sched.is_scheduled,
          is_published: isPublished,
        });
      }
    }

    for (let m = 0; m < losersRound1Ids.length; m++) {
      const sched = computeSchedule(slotCursor++, false);
      matches.push({
        id: losersRound1Ids[m],
        tournament_id: params.tournamentId,
        game_id: params.gameId,
        match_code: `${prefix}-LR1-M${String(m + 1).padStart(2, "0")}`,
        bracket_position: `L-R1-P${m + 1}`,
        round: losersRound1Ids.length === 1 ? "Losers Final" : `Losers Round 1 · M${m + 1}`,
        round_number: wRounds + 1,
        match_number: m + 1,
        bracket_side: "losers",
        group_name: null,
        team_a_id: null,
        team_b_id: null,
        br_results: [],
        status: sched.is_scheduled ? "scheduled" : "upcoming",
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
        scheduled_start: sched.scheduled_start,
        scheduled_end: sched.scheduled_end,
        duration_minutes: durationMinutes,
        is_scheduled: sched.is_scheduled,
        is_published: isPublished,
      });
    }

    const gfSched = computeSchedule(slotCursor++, false);
    matches.push({
      id: grandFinalId,
      tournament_id: params.tournamentId,
      game_id: params.gameId,
      match_code: `${prefix}-GF-01`,
      bracket_position: "GF-1",
      round: "Grand Final",
      round_number: wRounds + 2,
      match_number: 1,
      bracket_side: "grand_final",
      group_name: null,
      team_a_id: null,
      team_b_id: null,
      br_results: [],
      status: gfSched.is_scheduled ? "scheduled" : "upcoming",
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
      scheduled_start: gfSched.scheduled_start,
      scheduled_end: gfSched.scheduled_end,
      duration_minutes: durationMinutes,
      is_scheduled: gfSched.is_scheduled,
      is_published: isPublished,
    });

    for (const r1m of matches.filter(
      (x) => x.bracket_side === "winners" && x.round_number === 1 && x.winner_id && x.next_match_id
    )) {
      const target = matches.find((t) => t.id === r1m.next_match_id);
      if (target) {
        if (r1m.next_match_slot === "a") target.team_a_id = r1m.winner_id;
        else target.team_b_id = r1m.winner_id;
      }
    }

    return { ok: true, matches, teamCount: ordered.length };
  }

  // ---------------------------------------------------------------------------
  // 5. ROUND ROBIN LEAGUE
  // ---------------------------------------------------------------------------
  if (params.format === "round_robin") {
    const list: (Registration | null)[] = [...ordered];
    if (list.length % 2 === 1) list.push(null);
    const numTeams = list.length;
    const totalRounds = numTeams - 1;
    let matchCounter = 0;

    for (let round = 0; round < totalRounds; round++) {
      for (let idx = 0; idx < numTeams / 2; idx++) {
        const a = list[idx];
        const b = list[numTeams - 1 - idx];
        if (a && b) {
          matchCounter++;
          const sched = computeSchedule(matchCounter - 1, false);
          matches.push({
            id: nextId(++seqIdx),
            tournament_id: params.tournamentId,
            game_id: params.gameId,
            match_code: `${prefix}-RR-M${String(matchCounter).padStart(2, "0")}`,
            bracket_position: `RR-R${round + 1}-P${idx + 1}`,
            round: `Round ${round + 1}`,
            round_number: round + 1,
            match_number: matchCounter,
            bracket_side: "group",
            group_name: "League",
            team_a_id: a.id,
            team_b_id: b.id,
            br_results: [],
            status: sched.is_scheduled ? "scheduled" : "upcoming",
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
            scheduled_start: sched.scheduled_start,
            scheduled_end: sched.scheduled_end,
            duration_minutes: durationMinutes,
            is_scheduled: sched.is_scheduled,
            is_published: isPublished,
          });
        }
      }
      const last = list.pop()!;
      list.splice(1, 0, last);
    }

    return { ok: true, matches, teamCount: ordered.length };
  }

  // ---------------------------------------------------------------------------
  // 6. GROUP STAGE + KNOCKOUT
  // ---------------------------------------------------------------------------
  const groupCount = Math.max(2, Math.min(4, params.groupCount || 2));
  const groups: Registration[][] = Array.from({ length: groupCount }, () => []);
  ordered.forEach((team, idx) => {
    groups[idx % groupCount].push(team);
  });

  let matchCounter = 0;
  groups.forEach((grpTeams, gIdx) => {
    const groupLetter = String.fromCharCode(65 + gIdx);
    for (let i = 0; i < grpTeams.length; i++) {
      for (let j = i + 1; j < grpTeams.length; j++) {
        matchCounter++;
        const sched = computeSchedule(matchCounter - 1, false);
        matches.push({
          id: nextId(++seqIdx),
          tournament_id: params.tournamentId,
          game_id: params.gameId,
          match_code: `${prefix}-G${groupLetter}-M${String(matchCounter).padStart(2, "0")}`,
          bracket_position: `GRP-${groupLetter}-M${matchCounter}`,
          round: `Group ${groupLetter}`,
          round_number: 1,
          match_number: matchCounter,
          bracket_side: "group",
          group_name: `Group ${groupLetter}`,
          team_a_id: grpTeams[i].id,
          team_b_id: grpTeams[j].id,
          br_results: [],
          status: sched.is_scheduled ? "scheduled" : "upcoming",
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
          scheduled_start: sched.scheduled_start,
          scheduled_end: sched.scheduled_end,
          duration_minutes: durationMinutes,
          is_scheduled: sched.is_scheduled,
          is_published: isPublished,
        });
      }
    }
  });

  const finalId = nextId(++seqIdx);
  const semiAId = nextId(++seqIdx);
  const semiBId = nextId(++seqIdx);
  const semiASched = computeSchedule(matchCounter, false);
  const semiBSched = computeSchedule(matchCounter + 1, false);
  const finalSched = computeSchedule(matchCounter + 2, false);

  matches.push(
    {
      id: semiAId,
      tournament_id: params.tournamentId,
      game_id: params.gameId,
      match_code: `${prefix}-SF-01`,
      bracket_position: "KO-SF-1",
      round: "Knockout Semifinal A",
      round_number: 2,
      match_number: 1,
      bracket_side: "knockout",
      group_name: null,
      team_a_id: null,
      team_b_id: null,
      br_results: [],
      status: semiASched.is_scheduled ? "scheduled" : "upcoming",
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
      scheduled_start: semiASched.scheduled_start,
      scheduled_end: semiASched.scheduled_end,
      duration_minutes: durationMinutes,
      is_scheduled: semiASched.is_scheduled,
      is_published: isPublished,
    },
    {
      id: semiBId,
      tournament_id: params.tournamentId,
      game_id: params.gameId,
      match_code: `${prefix}-SF-02`,
      bracket_position: "KO-SF-2",
      round: "Knockout Semifinal B",
      round_number: 2,
      match_number: 2,
      bracket_side: "knockout",
      group_name: null,
      team_a_id: null,
      team_b_id: null,
      br_results: [],
      status: semiBSched.is_scheduled ? "scheduled" : "upcoming",
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
      scheduled_start: semiBSched.scheduled_start,
      scheduled_end: semiBSched.scheduled_end,
      duration_minutes: durationMinutes,
      is_scheduled: semiBSched.is_scheduled,
      is_published: isPublished,
    },
    {
      id: finalId,
      tournament_id: params.tournamentId,
      game_id: params.gameId,
      match_code: `${prefix}-GF-01`,
      bracket_position: "GF-1",
      round: "Grand Final",
      round_number: 3,
      match_number: 1,
      bracket_side: "grand_final",
      group_name: null,
      team_a_id: null,
      team_b_id: null,
      br_results: [],
      status: finalSched.is_scheduled ? "scheduled" : "upcoming",
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
      scheduled_start: finalSched.scheduled_start,
      scheduled_end: finalSched.scheduled_end,
      duration_minutes: durationMinutes,
      is_scheduled: finalSched.is_scheduled,
      is_published: isPublished,
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
    const placementPoints = e.placement > 0 ? placementPointsTable[e.placement] ?? 0 : 0;
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
    return (a.placement || 999) - (b.placement || 999);
  });

  return scored.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export interface CumulativeBrStandingRow {
  rank: number;
  teamId: string;
  teamName: string;
  institution?: string | null;
  roundsPlayed: number;
  wins: number;
  bestPlacement: number | null;
  totalKills: number;
  totalPlacementPoints: number;
  totalKillPoints: number;
  totalPoints: number;
}

export function calculateCumulativeBattleRoyaleStandings(params: {
  teams: Pick<Registration, "id" | "team_name" | "institution">[];
  matches: Match[];
  placementPointsTable?: Record<number, number>;
  pointsPerKill?: number;
  includeSubmittedDrafts?: boolean;
}): CumulativeBrStandingRow[] {
  const table = params.placementPointsTable || DEFAULT_BR_PLACEMENT_POINTS;
  const ppk = typeof params.pointsPerKill === "number" ? params.pointsPerKill : 1;
  const agg = new Map<string, CumulativeBrStandingRow>();

  for (const t of params.teams) {
    agg.set(t.id, {
      rank: 0,
      teamId: t.id,
      teamName: t.team_name,
      institution: t.institution,
      roundsPlayed: 0,
      wins: 0,
      bestPlacement: null,
      totalKills: 0,
      totalPlacementPoints: 0,
      totalKillPoints: 0,
      totalPoints: 0,
    });
  }

  for (const m of params.matches) {
    const allowed =
      m.status === "completed" || (Boolean(params.includeSubmittedDrafts) && m.status === "result_submitted");
    if (!allowed || !Array.isArray(m.br_results) || m.br_results.length === 0) continue;

    for (const entry of m.br_results) {
      if (!entry.team_id) continue;
      const existing = agg.get(entry.team_id) || {
        rank: 0,
        teamId: entry.team_id,
        teamName: entry.team_name || entry.team_id,
        institution: entry.institution || null,
        roundsPlayed: 0,
        wins: 0,
        bestPlacement: null,
        totalKills: 0,
        totalPlacementPoints: 0,
        totalKillPoints: 0,
        totalPoints: 0,
      };

      const placement = entry.placement && entry.placement > 0 ? entry.placement : null;
      const kills = Math.max(0, Number(entry.kills) || 0);
      const placementPts = placement ? table[placement] ?? Number(entry.placement_points || 0) : 0;
      const killPts = kills * ppk;

      if (placement !== null || kills > 0) {
        existing.roundsPlayed += 1;
      }
      if (placement === 1) {
        existing.wins += 1;
      }
      if (placement !== null && (existing.bestPlacement === null || placement < existing.bestPlacement)) {
        existing.bestPlacement = placement;
      }
      existing.totalKills += kills;
      existing.totalPlacementPoints += placementPts;
      existing.totalKillPoints += killPts;
      existing.totalPoints += placementPts + killPts;
      agg.set(entry.team_id, existing);
    }
  }

  const rows = Array.from(agg.values());
  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.totalPlacementPoints !== a.totalPlacementPoints) return b.totalPlacementPoints - a.totalPlacementPoints;
    if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
    if ((a.bestPlacement ?? 999) !== (b.bestPlacement ?? 999)) {
      return (a.bestPlacement ?? 999) - (b.bestPlacement ?? 999);
    }
    return a.teamName.localeCompare(b.teamName);
  });

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
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
  brResults?: BattleRoyaleTeamResult[];
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
      br_results: params.brResults ?? params.match.br_results ?? [],
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
 * into downstream bracket slots. Strictly guards against double advancement and skips H2H
 * bracket advancement for Battle Royale lobbies.
 */
export function confirmAndAdvanceMatchResult(params: {
  matches: Match[];
  matchId: string;
  managerUserId: string;
  permissions: Set<PermissionKey>;
  overrideScoreA?: number;
  overrideScoreB?: number;
  overrideWinnerId?: string | null;
  overrideBrResults?: BattleRoyaleTeamResult[];
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

  const isBr =
    current.bracket_side === "battle_royale" ||
    (current.match_format || "").toUpperCase().includes("BR") ||
    (Array.isArray(params.overrideBrResults) && params.overrideBrResults.length > 0);

  const nowIso = new Date().toISOString();
  const updated = params.matches.map((m) => ({ ...m }));

  if (isBr) {
    const brRows = params.overrideBrResults ?? current.br_results ?? [];
    if (brRows.length === 0) {
      return { ok: false, error: "Battle Royale match requires lobby placement & kill scores before confirmation." };
    }
    const topTeam = [...brRows].sort((a, b) => (b.total_points || 0) - (a.total_points || 0))[0];
    updated[idx] = {
      ...updated[idx],
      br_results: brRows,
      winner_id: params.overrideWinnerId ?? topTeam?.team_id ?? null,
      status: "completed",
      result_status: "confirmed",
      confirmed_by: params.managerUserId,
      confirmed_at: nowIso,
      bracket_advanced_at: nowIso,
      updated_at: nowIso,
    };
    return {
      ok: true,
      matches: updated,
      advancedToMatchId: null,
    };
  }

  const scoreA = typeof params.overrideScoreA === "number" ? params.overrideScoreA : current.score_a;
  const scoreB = typeof params.overrideScoreB === "number" ? params.overrideScoreB : current.score_b;
  const winnerId = params.overrideWinnerId !== undefined ? params.overrideWinnerId : current.winner_id;

  if (!winnerId || (winnerId !== current.team_a_id && winnerId !== current.team_b_id)) {
    return {
      ok: false,
      error: "A valid match winner belonging to Team A or Team B must be selected before confirmation.",
    };
  }

  const loserId = winnerId === current.team_a_id ? current.team_b_id : current.team_a_id;

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

// -----------------------------------------------------------------------------
// Rewind & Remap Engine (Undo Result, Cascade Detection, Pre-Play Swap)
// -----------------------------------------------------------------------------
export function findDependentDownstreamMatches(
  matches: Match[],
  matchId: string
): {
  directIds: string[];
  allDownstream: Match[];
  startedDownstream: Match[];
} {
  const source = matches.find((m) => m.id === matchId);
  if (!source) {
    return { directIds: [], allDownstream: [], startedDownstream: [] };
  }

  const directIds = [source.next_match_id, source.loser_next_match_id].filter(Boolean) as string[];
  const visited = new Set<string>();
  const queue = [...directIds];
  const allDownstream: Match[] = [];

  while (queue.length > 0) {
    const curId = queue.shift()!;
    if (visited.has(curId)) continue;
    visited.add(curId);
    const m = matches.find((x) => x.id === curId);
    if (!m) continue;
    allDownstream.push(m);
    if (m.next_match_id) queue.push(m.next_match_id);
    if (m.loser_next_match_id) queue.push(m.loser_next_match_id);
  }

  const startedDownstream = allDownstream.filter((m) =>
    ["live", "result_submitted", "completed", "disputed"].includes(m.status)
  );

  return { directIds, allDownstream, startedDownstream };
}

export function undoMatchResultAndRewind(params: {
  matches: Match[];
  matchId: string;
  managerUserId: string;
  permissions: Set<PermissionKey>;
  reason: string;
  forceCascade?: boolean;
}):
  | { ok: true; matches: Match[]; affectedMatchIds: string[] }
  | { ok: false; error: string; requiresCascade?: boolean; dependentMatches?: Match[] } {
  if (
    !params.permissions.has("tournament:confirm_results") &&
    !params.permissions.has("tournament:resolve_disputes") &&
    !params.permissions.has("esports:edit")
  ) {
    return { ok: false, error: "Forbidden: Manager confirmation permission required to undo a match result." };
  }

  if (!params.reason || params.reason.trim().length < 4) {
    return { ok: false, error: "A clear rewind/correction reason (min 4 characters) is mandatory." };
  }

  const target = params.matches.find((m) => m.id === params.matchId);
  if (!target) {
    return { ok: false, error: "Match not found." };
  }

  const deps = findDependentDownstreamMatches(params.matches, params.matchId);
  if (deps.startedDownstream.length > 0 && !params.forceCascade) {
    return {
      ok: false,
      requiresCascade: true,
      dependentMatches: deps.startedDownstream,
      error: `Downstream match(es) (${deps.startedDownstream
        .map((d) => d.match_code || d.round)
        .join(", ")}) already have activity or results. Confirm cascade rewind to clear them cleanly.`,
    };
  }

  const nowIso = new Date().toISOString();
  const prevWinner = target.winner_id;
  const prevLoser =
    prevWinner && prevWinner === target.team_a_id
      ? target.team_b_id
      : prevWinner && prevWinner === target.team_b_id
      ? target.team_a_id
      : null;

  const cascadeIds = new Set(deps.startedDownstream.map((m) => m.id));
  const affectedMatchIds = [params.matchId];

  const updated = params.matches.map((m) => {
    if (m.id === params.matchId) {
      return {
        ...m,
        status: (m.scheduled_start ? "scheduled" : "upcoming") as MatchStatus,
        result_status: "pending" as const,
        winner_id: null,
        confirmed_by: null,
        confirmed_at: null,
        bracket_advanced_at: null,
        undo_count: (m.undo_count || 0) + 1,
        last_undone_at: nowIso,
        last_undone_by: params.managerUserId,
        undo_reason: params.reason.trim(),
        updated_at: nowIso,
      };
    }

    let copy = { ...m };
    let touched = false;

    if (target.next_match_id === m.id && prevWinner) {
      if (target.next_match_slot === "b" && copy.team_b_id === prevWinner) {
        copy.team_b_id = null;
        touched = true;
      } else if (target.next_match_slot !== "b" && copy.team_a_id === prevWinner) {
        copy.team_a_id = null;
        touched = true;
      }
    }

    if (target.loser_next_match_id === m.id && prevLoser) {
      if (target.loser_next_match_slot === "b" && copy.team_b_id === prevLoser) {
        copy.team_b_id = null;
        touched = true;
      } else if (target.loser_next_match_slot !== "b" && copy.team_a_id === prevLoser) {
        copy.team_a_id = null;
        touched = true;
      }
    }

    if (params.forceCascade && cascadeIds.has(m.id)) {
      copy = {
        ...copy,
        status: (copy.scheduled_start ? "scheduled" : "upcoming") as MatchStatus,
        result_status: "pending",
        score_a: 0,
        score_b: 0,
        winner_id: null,
        confirmed_by: null,
        confirmed_at: null,
        bracket_advanced_at: null,
        undo_count: (copy.undo_count || 0) + 1,
        last_undone_at: nowIso,
        last_undone_by: params.managerUserId,
        undo_reason: `Cascade rewind: ${params.reason.trim()}`,
        updated_at: nowIso,
      };
      touched = true;
    } else if (params.forceCascade && deps.allDownstream.some((d) => d.id === m.id)) {
      // Clear further downstream slots populated by cascaded matches
      const feeders = deps.allDownstream.filter(
        (d) => (d.next_match_id === m.id || d.loser_next_match_id === m.id) && d.winner_id
      );
      for (const f of feeders) {
        if (f.next_match_id === m.id && f.winner_id) {
          if (f.next_match_slot === "b" && copy.team_b_id === f.winner_id) copy.team_b_id = null;
          if (f.next_match_slot !== "b" && copy.team_a_id === f.winner_id) copy.team_a_id = null;
          touched = true;
        }
      }
    }

    if (touched) {
      copy.updated_at = nowIso;
      affectedMatchIds.push(m.id);
    }
    return copy;
  });

  return { ok: true, matches: updated, affectedMatchIds };
}

export function reassignTeamsInMatch(params: {
  matches: Match[];
  matchId: string;
  teamAId: string | null;
  teamBId: string | null;
}): { ok: true; matches: Match[] } | { ok: false; error: string } {
  const target = params.matches.find((m) => m.id === params.matchId);
  if (!target) {
    return { ok: false, error: "Match not found." };
  }
  if (["live", "result_submitted", "completed"].includes(target.status)) {
    return {
      ok: false,
      error: "Cannot remap teams while match is live or completed. Undo the match result first.",
    };
  }
  if (params.teamAId && params.teamBId && params.teamAId === params.teamBId) {
    return { ok: false, error: "Team A and Team B cannot be the same squad." };
  }

  const nowIso = new Date().toISOString();
  return {
    ok: true,
    matches: params.matches.map((m) =>
      m.id === params.matchId
        ? {
            ...m,
            team_a_id: params.teamAId,
            team_b_id: params.teamBId,
            updated_at: nowIso,
          }
        : m
    ),
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
        br_results: params.match.br_results || [],
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
  correctedBrResults?: BattleRoyaleTeamResult[];
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
          br_results: params.correctedBrResults ?? m.br_results ?? [],
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
    overrideBrResults: params.correctedBrResults,
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
