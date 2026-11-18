import type {
  CompetitionMode,
  Game,
  Match,
  MatchDispute,
  MatchResultHistoryEntry,
  Player,
  Registration,
  Tournament,
  TournamentFormat,
} from "@/types/database";
import { DEFAULT_BR_PLACEMENT_POINTS } from "@/lib/tournamentEngine";

export type EsportsSectionId =
  | "overview"
  | "teams"
  | "tournament_matches"
  | "live_results"
  | "settings";

export interface ConductorOption {
  user_id: string;
  email: string;
  full_name: string | null;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ParsedBrRules {
  placementPoints: Record<number, number>;
  pointsPerKill: number;
  teamsPerLobby: number;
  qualificationCount: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  bestOf: string;
}

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
  battle_royale: "Battle Royale (Multi-Round Lobby)",
  head_to_head: "Head-to-Head Series",
  group_knockout: "Group Stage + Knockout",
  custom: "Custom Format",
};

export const COMPETITION_MODE_LABELS: Record<CompetitionMode, string> = {
  team: "Team vs Team",
  squad: "Squad (4–5 Players)",
  duo: "Duo (2 Players)",
  solo: "Solo (1v1)",
  lobby_br: "Multi-Squad BR Lobby",
};

export function parseTournamentScoringRules(
  tournament?: Tournament | null,
  game?: Game | null
): ParsedBrRules {
  const raw =
    (tournament?.rules_snapshot as Record<string, any> | null) ||
    (game?.scoring_config as Record<string, any> | null) ||
    {};

  const rawPlacement = raw.placement_points || raw.placementPoints || {};
  const placementPoints: Record<number, number> = { ...DEFAULT_BR_PLACEMENT_POINTS };
  if (rawPlacement && typeof rawPlacement === "object") {
    for (const [k, v] of Object.entries(rawPlacement)) {
      const rank = Number(k);
      const pts = Number(v);
      if (Number.isInteger(rank) && rank >= 1 && Number.isFinite(pts)) {
        placementPoints[rank] = pts;
      }
    }
  }

  const parsedTeamsPerLobby = Number(raw.teams_per_lobby ?? raw.teamsPerLobby);
  const parsedQualification = Number(raw.qualification_count ?? raw.qualificationCount);

  return {
    placementPoints,
    pointsPerKill: Number.isFinite(Number(raw.points_per_kill ?? raw.pointsPerKill))
      ? Number(raw.points_per_kill ?? raw.pointsPerKill)
      : 1,
    teamsPerLobby:
      Number.isFinite(parsedTeamsPerLobby) && parsedTeamsPerLobby >= 2
        ? Math.trunc(parsedTeamsPerLobby)
        : 12,
    qualificationCount:
      Number.isFinite(parsedQualification) && parsedQualification >= 1
        ? Math.trunc(parsedQualification)
        : 0,
    winPoints: Number.isFinite(Number(raw.win_points)) ? Number(raw.win_points) : 3,
    drawPoints: Number.isFinite(Number(raw.draw_points)) ? Number(raw.draw_points) : 1,
    lossPoints: Number.isFinite(Number(raw.loss_points)) ? Number(raw.loss_points) : 0,
    bestOf: typeof raw.best_of === "string" && raw.best_of ? raw.best_of : "BO1",
  };
}

export function isBattleRoyaleTournament(
  tournament?: Pick<Tournament, "format" | "scoring_mode"> | null,
  game?: Pick<Game, "match_format" | "scoring_mode" | "title"> | null
): boolean {
  const fmt = tournament?.format || (game?.match_format as TournamentFormat | undefined);
  const sc = tournament?.scoring_mode || game?.scoring_mode;
  return fmt === "battle_royale" || sc === "battle_royale";
}

export interface EsportsWorkspaceSharedData {
  games: Game[];
  selectedGame: Game | null;
  tournament: Tournament;
  hasPersistedTournament: boolean;
  approvedTeams: Registration[];
  selectedTeams: Registration[];
  allGameTeams: Registration[];
  players: Player[];
  matches: Match[];
  allMatches: Match[]; // across all games for cross-game conflict checking
  disputes: MatchDispute[];
  history: MatchResultHistoryEntry[];
  auditLogs: AuditLogRow[];
  conductors: ConductorOption[];
  teamMap: Map<string, Registration>;
}
