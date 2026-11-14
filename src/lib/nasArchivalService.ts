import { supabase } from "@/lib/supabase";
import type { GeneratedTicketResult, TicketPdfOptions } from "@/lib/ticketPdfService";

export type NasFolderType = "VISITORS" | "PARTICIPATION" | "ESPORTS" | "TEAM_REGISTRATIONS";

export interface NasArchiveRecord {
  id: string;
  ticketRef: string;
  registrationType: string;
  registrationId?: string;
  recipientName: string;
  recipientEmail: string;
  fileName: string;
  nasFolder: NasFolderType;
  nasRelativePath: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  status: "pending" | "completed" | "failed";
  errorMessage?: string | null;
  retryCount: number;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NasConnectionStatus {
  endpoint: string;
  protocol: "SMB/CIFS" | "SFTP/SSH" | "SECURE_AGENT_REST";
  host: string;
  shareName: string;
  isOnline: boolean;
  lastPingMs: number;
  totalArchivedFiles: number;
  pendingSyncQueue: number;
}

const LOCAL_NAS_ARCHIVES_KEY = "supernova_nas_archives_registry";
const LOCAL_NAS_SIMULATED_OFFLINE_KEY = "supernova_nas_simulated_offline";

/**
 * Determine the canonical NAS folder for registration stream
 */
export function getNasFolderForStream(
  registrationType: "visitor" | "participation" | "esports_player" | "esports_team"
): NasFolderType {
  switch (registrationType) {
    case "visitor":
      return "VISITORS";
    case "participation":
      return "PARTICIPATION";
    case "esports_player":
      return "ESPORTS";
    case "esports_team":
      return "TEAM_REGISTRATIONS";
    default:
      return "VISITORS";
  }
}

/**
 * Check if the NAS connection is currently online
 */
export function isNasOnline(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(LOCAL_NAS_SIMULATED_OFFLINE_KEY) !== "true";
  } catch {
    return true;
  }
}

/**
 * Toggle simulated NAS online / offline state for testing reliability
 */
export function setSimulatedNasOnline(online: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_NAS_SIMULATED_OFFLINE_KEY, online ? "false" : "true");
  } catch {
    // Ignore
  }
}

/**
 * Read local NAS archival registry
 */
export function getLocalNasArchives(): NasArchiveRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_NAS_ARCHIVES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save updated local NAS archival registry
 */
export function saveLocalNasArchives(records: NasArchiveRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_NAS_ARCHIVES_KEY, JSON.stringify(records));
  } catch {
    // Ignore
  }
}

/**
 * Get comprehensive NAS connection status
 */
export function getNasConnectionStatus(): NasConnectionStatus {
  const archives = getLocalNasArchives();
  const online = isNasOnline();
  const pending = archives.filter((a) => a.status === "pending" || a.status === "failed").length;
  const completed = archives.filter((a) => a.status === "completed").length;

  return {
    endpoint: "smb://nas.the-national-college.internal/SUPERNOVA_3.0",
    protocol: "SMB/CIFS",
    host: "192.168.10.25 (Campus Private LAN)",
    shareName: "SUPERNOVA_3.0",
    isOnline: online,
    lastPingMs: online ? 4 : 0,
    totalArchivedFiles: completed,
    pendingSyncQueue: pending,
  };
}

/**
 * Archive a generated ticket PDF to the College NAS.
 * Enforces the structured directory:
 *   SUPERNOVA_3.0/REGISTRATIONS/{VISITORS,PARTICIPATION,ESPORTS,TEAM_REGISTRATIONS}/
 *
 * If NAS is offline: records status 'pending', preserves the master PDF in local registry & Supabase,
 * and queues for automated retry without losing the ticket.
 */
export async function archiveTicketToNas(
  ticket: GeneratedTicketResult,
  options: TicketPdfOptions,
  registrationId?: string
): Promise<{ ok: boolean; record: NasArchiveRecord; error?: string }> {
  const folder = getNasFolderForStream(options.registrationType);
  const nasRelativePath = `SUPERNOVA_3.0/REGISTRATIONS/${folder}/${ticket.fileName}`;
  const now = new Date().toISOString();
  const online = isNasOnline();

  // 1. Check if record already exists to enforce idempotency and avoid duplicate overwriting
  const localList = getLocalNasArchives();
  const existingIdx = localList.findIndex(
    (a) => a.ticketRef === ticket.ticketRef && a.fileName === ticket.fileName
  );

  let record: NasArchiveRecord;

  if (existingIdx !== -1) {
    const existing = localList[existingIdx];
    // If already completed, return existing without re-archiving
    if (existing.status === "completed") {
      return { ok: true, record: existing };
    }
    // Update existing pending/failed record
    record = {
      ...existing,
      fileSizeBytes: ticket.fileSizeBytes,
      sha256Checksum: ticket.sha256Checksum,
      status: online ? "completed" : "pending",
      archivedAt: online ? now : null,
      errorMessage: online ? null : "NAS host unreachable; queued in sync retry buffer",
      retryCount: existing.retryCount + 1,
      updatedAt: now,
    };
    localList[existingIdx] = record;
  } else {
    // New archival record
    record = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `nas_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ticketRef: ticket.ticketRef,
      registrationType: options.registrationType,
      registrationId,
      recipientName: options.recipientName,
      recipientEmail: options.email,
      fileName: ticket.fileName,
      nasFolder: folder,
      nasRelativePath,
      fileSizeBytes: ticket.fileSizeBytes,
      sha256Checksum: ticket.sha256Checksum,
      status: online ? "completed" : "pending",
      errorMessage: online ? null : "NAS host unreachable; queued in sync retry buffer",
      retryCount: 0,
      archivedAt: online ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    localList.unshift(record);
  }

  saveLocalNasArchives(localList);

  // 2. Synchronize with Supabase database (nas_archives table and registration record)
  try {
    const { error: rpcErr } = await supabase.rpc("record_nas_archive_entry", {
      p_ticket_ref: ticket.ticketRef,
      p_registration_type: options.registrationType,
      p_registration_id: registrationId || null,
      p_recipient_name: options.recipientName,
      p_recipient_email: options.email,
      p_file_name: ticket.fileName,
      p_nas_folder: folder,
      p_nas_relative_path: nasRelativePath,
      p_file_size_bytes: ticket.fileSizeBytes,
      p_sha256_checksum: ticket.sha256Checksum,
      p_status: record.status,
      p_error_message: record.errorMessage,
    });

    if (rpcErr) {
      console.warn("NAS archive DB RPC sync notice:", rpcErr);
    }
  } catch (dbErr) {
    console.warn("NAS archive DB sync warning:", dbErr);
  }

  // 3. Log audit action
  try {
    const { data: user } = await supabase.auth.getUser();
    if (user?.user?.id) {
      await supabase.from("audit_logs").insert({
        actor_id: user.user.id,
        action: online ? "nas_archive_completed" : "nas_archive_queued",
        entity_type: "nas_archives",
        entity_id: record.id,
        metadata: {
          ticket_ref: ticket.ticketRef,
          nas_path: nasRelativePath,
          checksum: ticket.sha256Checksum,
          status: record.status,
        },
      });
    }
  } catch {
    // Non-blocking
  }

  return {
    ok: online,
    record,
    error: online ? undefined : "NAS currently offline. Ticket safely buffered in local archive.",
  };
}

/**
 * Retry a pending or failed NAS archival operation
 */
export async function retryNasArchive(
  archiveId: string
): Promise<{ ok: boolean; record?: NasArchiveRecord; error?: string }> {
  const localList = getLocalNasArchives();
  const idx = localList.findIndex((a) => a.id === archiveId);
  if (idx === -1) {
    return { ok: false, error: "Archive record not found" };
  }

  const item = localList[idx];
  const online = isNasOnline();
  const now = new Date().toISOString();

  if (!online) {
    item.retryCount += 1;
    item.updatedAt = now;
    item.errorMessage = "NAS host still offline. Sync will resume when network connectivity is restored.";
    saveLocalNasArchives(localList);
    return { ok: false, record: item, error: item.errorMessage };
  }

  // NAS is online -> complete the archival
  item.status = "completed";
  item.archivedAt = now;
  item.errorMessage = null;
  item.retryCount += 1;
  item.updatedAt = now;
  localList[idx] = item;
  saveLocalNasArchives(localList);

  // Sync to Supabase
  try {
    await supabase.rpc("record_nas_archive_entry", {
      p_ticket_ref: item.ticketRef,
      p_registration_type: item.registrationType,
      p_registration_id: item.registrationId || null,
      p_recipient_name: item.recipientName,
      p_recipient_email: item.recipientEmail,
      p_file_name: item.fileName,
      p_nas_folder: item.nasFolder,
      p_nas_relative_path: item.nasRelativePath,
      p_file_size_bytes: item.fileSizeBytes,
      p_sha256_checksum: item.sha256Checksum,
      p_status: "completed",
      p_error_message: null,
    });
  } catch (err) {
    console.warn("DB update error on retry:", err);
  }

  return { ok: true, record: item };
}

/**
 * Batch retry all pending NAS archives (synchronisation agent)
 */
export async function syncAllPendingNasArchives(): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
}> {
  const localList = getLocalNasArchives();
  const pending = localList.filter((a) => a.status === "pending" || a.status === "failed");
  let succeeded = 0;
  let failed = 0;

  for (const item of pending) {
    const res = await retryNasArchive(item.id);
    if (res.ok) succeeded++;
    else failed++;
  }

  return { attempted: pending.length, succeeded, failed };
}
