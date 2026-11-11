/**
 * SUPERNOVA 3.0 — OFFICIAL ESPORTS TOURNAMENT RULES & ROSTER SPECIFICATIONS
 * 
 * Enforces exact collegiate tournament team sizes:
 * - VALORANT: exactly 5 players (PC Tournament)
 * - FREE FIRE: exactly 4 players (Mobile Tournament)
 * - BGMI: exactly 4 players (Mobile Tournament)
 * 
 * Substitutes: NOT ALLOWED under official tournament rules.
 */

export interface OfficialGameConfig {
  idKey: "valorant" | "freefire" | "bgmi";
  title: string;
  divisionLabel: string;
  teamSize: number;
  platform: "PC" | "Mobile";
  allowSubstitutes: false;
}

export const OFFICIAL_GAME_RULES: Record<string, OfficialGameConfig> = {
  valorant: {
    idKey: "valorant",
    title: "VALORANT",
    divisionLabel: "PC Tournament",
    teamSize: 5,
    platform: "PC",
    allowSubstitutes: false,
  },
  "free fire": {
    idKey: "freefire",
    title: "FREE FIRE",
    divisionLabel: "Mobile Tournament",
    teamSize: 4,
    platform: "Mobile",
    allowSubstitutes: false,
  },
  freefire: {
    idKey: "freefire",
    title: "FREE FIRE",
    divisionLabel: "Mobile Tournament",
    teamSize: 4,
    platform: "Mobile",
    allowSubstitutes: false,
  },
  bgmi: {
    idKey: "bgmi",
    title: "BGMI",
    divisionLabel: "Mobile Tournament",
    teamSize: 4,
    platform: "Mobile",
    allowSubstitutes: false,
  },
};

/**
 * Resolves the official team size for any game title, ID, or slug.
 * Always returns 5 for VALORANT, 4 for FREE FIRE, and 4 for BGMI.
 */
export function getOfficialTeamSize(gameTitleOrId?: string, fallbackSize?: number | null): number {
  if (!gameTitleOrId) {
    return fallbackSize && fallbackSize > 0 ? fallbackSize : 4;
  }
  const normalized = gameTitleOrId.toLowerCase().trim();
  for (const [key, config] of Object.entries(OFFICIAL_GAME_RULES)) {
    if (normalized.includes(key)) {
      return config.teamSize;
    }
  }
  return fallbackSize && fallbackSize > 0 ? fallbackSize : 4;
}

/**
 * Returns formatted game specification string (e.g. "VALORANT — 5/5 players")
 */
export function formatRosterSpec(gameTitle: string, registeredCount: number): {
  badgeText: string;
  expectedCount: number;
  isValid: boolean;
  isFlagged: boolean;
} {
  const expectedCount = getOfficialTeamSize(gameTitle);
  const isValid = registeredCount === expectedCount;
  const isFlagged = !isValid;
  const badgeText = `${gameTitle} — ${registeredCount}/${expectedCount} players`;

  return {
    badgeText,
    expectedCount,
    isValid,
    isFlagged,
  };
}

export interface PlayerInput {
  name: string;
  inGameId: string;
}

export interface RosterValidationResult {
  isValid: boolean;
  expectedSize: number;
  actualSize: number;
  errorMessage?: string;
  playerErrors: Record<number, { name?: string; inGameId?: string }>;
}

/**
 * Validates an esports roster against the game's official rules.
 */
export function validateEsportsRoster(
  gameTitle: string,
  players: PlayerInput[]
): RosterValidationResult {
  const expectedSize = getOfficialTeamSize(gameTitle);
  const actualSize = players.length;
  const playerErrors: Record<number, { name?: string; inGameId?: string }> = {};

  if (actualSize !== expectedSize) {
    return {
      isValid: false,
      expectedSize,
      actualSize,
      errorMessage: `${gameTitle} requires exactly ${expectedSize} players (received ${actualSize}).`,
      playerErrors,
    };
  }

  let hasFieldErrors = false;
  for (let i = 0; i < expectedSize; i++) {
    const p = players[i];
    const pName = p?.name?.trim() || "";
    const pId = p?.inGameId?.trim() || "";
    const errors: { name?: string; inGameId?: string } = {};

    if (!pName) {
      errors.name = `Player ${i + 1} full name is required.`;
      hasFieldErrors = true;
    } else if (pName.length < 2 || pName.length > 80) {
      errors.name = `Player ${i + 1} name must be between 2 and 80 characters.`;
      hasFieldErrors = true;
    }

    if (!pId) {
      errors.inGameId = `Player ${i + 1} in-game ID is required.`;
      hasFieldErrors = true;
    } else if (pId.length < 2 || pId.length > 40) {
      errors.inGameId = `Player ${i + 1} in-game ID must be between 2 and 40 characters.`;
      hasFieldErrors = true;
    }

    if (errors.name || errors.inGameId) {
      playerErrors[i] = errors;
    }
  }

  if (hasFieldErrors) {
    const firstError = Object.values(playerErrors)[0];
    const msg = firstError?.name || firstError?.inGameId || "Please complete all player information.";
    return {
      isValid: false,
      expectedSize,
      actualSize,
      errorMessage: msg,
      playerErrors,
    };
  }

  return {
    isValid: true,
    expectedSize,
    actualSize,
    playerErrors: {},
  };
}
