import { supabase } from "@/lib/supabase";
import {
  buildRenameEsportsTeamParams,
  buildReplaceEsportsFixtureTeamParams,
  buildSetDisqualificationParams,
  buildSwapEsportsFixtureSlotsParams,
  normalizeRpcErrorMessage,
  type FixtureRpcResult,
} from "@/lib/esportsFixtureCorrections";
import type { TournamentSelectionStatus } from "@/types/database";

/**
 * Invokes `rename_esports_team` in live production Supabase.
 * Never falls back to direct table updates on rejection.
 */
export async function callRenameEsportsTeamRpc(input: {
  registrationId: string;
  expectedName: string;
  newName: string;
  reason: string;
}): Promise<FixtureRpcResult> {
  const built = buildRenameEsportsTeamParams(input);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  const { data, error } = await supabase.rpc("rename_esports_team", built.params);
  if (error || (data && typeof data === "object" && (data as any).ok === false)) {
    const norm = normalizeRpcErrorMessage("rename_esports_team", error, data);
    return {
      ok: false,
      error: norm.message,
      rejectedByHistoricalLock: norm.rejectedByHistoricalLock,
      requiresManualReviewSql: norm.requiresManualReviewSql,
    };
  }
  return { ok: true, data: (data || {}) as Record<string, unknown> };
}

/**
 * Invokes `replace_esports_fixture_team` in live production Supabase.
 * Never bypasses a rejected RPC with direct `.from("matches").update(...)`.
 */
export async function callReplaceEsportsFixtureTeamRpc(input: {
  matchId: string;
  slot: "a" | "b";
  expectedTeamId: string | null;
  replacementTeamId: string | null;
  otherSlotTeamId?: string | null;
  reason: string;
}): Promise<FixtureRpcResult> {
  const built = buildReplaceEsportsFixtureTeamParams(input);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  const { data, error } = await supabase.rpc("replace_esports_fixture_team", built.params);
  if (error || (data && typeof data === "object" && (data as any).ok === false)) {
    const norm = normalizeRpcErrorMessage("replace_esports_fixture_team", error, data);
    return {
      ok: false,
      error: norm.message,
      rejectedByHistoricalLock: norm.rejectedByHistoricalLock,
      requiresManualReviewSql: norm.requiresManualReviewSql,
    };
  }
  return { ok: true, data: (data || {}) as Record<string, unknown> };
}

/**
 * Invokes `swap_esports_fixture_slots` in live production Supabase.
 * Never bypasses a rejected RPC with direct `.from("matches").update(...)`.
 */
export async function callSwapEsportsFixtureSlotsRpc(input: {
  match1Id: string;
  slot1: "a" | "b";
  expectedTeam1Id: string | null;
  match2Id: string;
  slot2: "a" | "b";
  expectedTeam2Id: string | null;
  reason: string;
}): Promise<FixtureRpcResult> {
  const built = buildSwapEsportsFixtureSlotsParams(input);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  const { data, error } = await supabase.rpc("swap_esports_fixture_slots", built.params);
  if (error || (data && typeof data === "object" && (data as any).ok === false)) {
    const norm = normalizeRpcErrorMessage("swap_esports_fixture_slots", error, data);
    return {
      ok: false,
      error: norm.message,
      rejectedByHistoricalLock: norm.rejectedByHistoricalLock,
      requiresManualReviewSql: norm.requiresManualReviewSql,
    };
  }
  return { ok: true, data: (data || {}) as Record<string, unknown> };
}

/**
 * Invokes `preview_esports_fixture_correction` in live production Supabase.
 */
export async function callPreviewEsportsFixtureCorrectionRpc(
  matchIds: string[]
): Promise<FixtureRpcResult> {
  const cleanIds = Array.from(new Set(matchIds.filter(Boolean)));
  if (cleanIds.length === 0) {
    return { ok: false, error: "At least one match ID is required for preview." };
  }

  const { data, error } = await supabase.rpc("preview_esports_fixture_correction", {
    p_match_ids: cleanIds,
  });
  if (error || (data && typeof data === "object" && (data as any).ok === false)) {
    const norm = normalizeRpcErrorMessage("preview_esports_fixture_correction", error, data);
    return {
      ok: false,
      error: norm.message,
      rejectedByHistoricalLock: norm.rejectedByHistoricalLock,
      requiresManualReviewSql: norm.requiresManualReviewSql,
    };
  }
  return { ok: true, data: (data || {}) as Record<string, unknown> };
}

/**
 * Invokes `set_esports_team_disqualification` in live production Supabase.
 * Caller must await this result before confirming status in UI.
 */
export async function callSetEsportsTeamDisqualificationRpc(input: {
  registrationId: string;
  currentSelectionStatus: TournamentSelectionStatus | string | null | undefined;
  disqualified: boolean;
  reason: string;
  restoreStatus?: TournamentSelectionStatus | string | null;
}): Promise<FixtureRpcResult> {
  const built = buildSetDisqualificationParams(input);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  const { data, error } = await supabase.rpc("set_esports_team_disqualification", built.params);
  if (error || (data && typeof data === "object" && (data as any).ok === false)) {
    const norm = normalizeRpcErrorMessage("set_esports_team_disqualification", error, data);
    return {
      ok: false,
      error: norm.message,
      rejectedByHistoricalLock: norm.rejectedByHistoricalLock,
      requiresManualReviewSql: norm.requiresManualReviewSql,
    };
  }
  return { ok: true, data: (data || {}) as Record<string, unknown> };
}
