import { supabase } from "@/lib/supabase";

export type RegistrationTargetType = "visitor" | "esports" | "participation";

export async function sendRegistrationConfirmationEmail(
  registrationId: string,
  registrationType: "visitor" | "esports",
  isResend = false
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("send-registration-confirmation", {
    body: { registrationId, registrationType, isResend },
  });

  if (error) {
    return { ok: false, error: error.message || "Failed to invoke confirmation email service" };
  }
  if (data?.error) {
    return { ok: false, error: data.error };
  }
  return { ok: true };
}

const LOCAL_ARCHIVED_KEY = "supernova_archived_registrations";

export function getLocalArchivedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LOCAL_ARCHIVED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markRegistrationArchivedLocal(id: string, isArchived: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const current = getLocalArchivedIds();
    if (isArchived) {
      current.add(id);
    } else {
      current.delete(id);
    }
    localStorage.setItem(LOCAL_ARCHIVED_KEY, JSON.stringify(Array.from(current)));
  } catch {
    // Ignore storage errors
  }
}

export function isRegistrationArchived(record: {
  id?: string;
  archived_at?: string | null;
  admin_notes?: string | null;
}): boolean {
  if (record.archived_at) return true;
  if (record.admin_notes && record.admin_notes.includes("[ARCHIVED")) return true;
  if (record.id) {
    const local = getLocalArchivedIds();
    if (local.has(record.id)) return true;
  }
  return false;
}

/**
 * Safely archive a registration (soft delete).
 * Attempts database soft-delete, with graceful fallback to admin_notes + local registry
 * if archived_at column is not present in the database.
 */
export async function archiveRegistrationRecord(
  registrationType: RegistrationTargetType,
  registrationId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const table =
      registrationType === "visitor"
        ? "visitor_registrations"
        : registrationType === "esports"
        ? "registrations"
        : "participation_registrations";

    let dbSucceeded = false;

    // Try RPC first if visitor or esports
    if (registrationType === "visitor" || registrationType === "esports") {
      try {
        const { data, error } = await supabase.rpc("archive_registration", {
          p_type: registrationType,
          p_id: registrationId,
        });
        if (!error && data?.ok !== false) {
          dbSucceeded = true;
        }
      } catch {
        // RPC not present in schema cache, proceed to direct update
      }
    }

    if (!dbSucceeded) {
      // Attempt direct update with archived_at
      const { error: directError } = await supabase
        .from(table)
        .update({ archived_at: new Date().toISOString() })
        .eq("id", registrationId);

      if (!directError) {
        dbSucceeded = true;
      } else if (directError.code === "42703" || directError.message?.includes("archived_at")) {
        // Column archived_at does not exist: update admin_notes to mark archived
        const { data: currentRecord } = await supabase
          .from(table)
          .select("admin_notes")
          .eq("id", registrationId)
          .maybeSingle();

        const currentNotes = (currentRecord as any)?.admin_notes || "";
        const updatedNotes = currentNotes
          ? `${currentNotes}\n[ARCHIVED ${new Date().toISOString()}]`
          : `[ARCHIVED ${new Date().toISOString()}]`;

        await supabase
          .from(table)
          .update({ admin_notes: updatedNotes })
          .eq("id", registrationId);
        
        dbSucceeded = true;
      } else {
        return { ok: false, error: directError.message || "Failed to archive registration" };
      }
    }

    // Always update local registry
    markRegistrationArchivedLocal(registrationId, true);

    // Audit log
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        await supabase.from("audit_logs").insert({
          actor_id: userData.user.id,
          action: "archive_registration",
          table_name: table,
          record_id: registrationId,
          metadata: { registration_type: registrationType, archived_at: new Date().toISOString() },
        });
      }
    } catch {
      // Non-blocking audit log
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Unexpected error archiving record" };
  }
}

/**
 * Safely restore an archived registration back to the active list.
 * Preserves the original submission data, player records, and approval status.
 */
export async function restoreRegistrationRecord(
  registrationType: RegistrationTargetType,
  registrationId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const table =
      registrationType === "visitor"
        ? "visitor_registrations"
        : registrationType === "esports"
        ? "registrations"
        : "participation_registrations";

    // Attempt direct clear of archived_at
    const { error } = await supabase
      .from(table)
      .update({
        archived_at: null,
        archived_by: null,
      })
      .eq("id", registrationId);

    if (error && (error.code === "42703" || error.message?.includes("archived_at"))) {
      // Clean archived tag from admin_notes
      const { data: currentRecord } = await supabase
        .from(table)
        .select("admin_notes")
        .eq("id", registrationId)
        .maybeSingle();

      const currentNotes = (currentRecord as any)?.admin_notes || "";
      const cleanedNotes = currentNotes
        .replace(/\[ARCHIVED.*?\]/g, "")
        .trim();

      await supabase
        .from(table)
        .update({ admin_notes: cleanedNotes || null })
        .eq("id", registrationId);
    } else if (error) {
      return { ok: false, error: error.message || `Failed to restore ${registrationType} record` };
    }

    // Always clear from local registry
    markRegistrationArchivedLocal(registrationId, false);

    // Record in audit log
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        await supabase.from("audit_logs").insert({
          actor_id: userData.user.id,
          action: "restore_registration",
          table_name: table,
          record_id: registrationId,
          metadata: { registration_type: registrationType, restored_at: new Date().toISOString() },
        });
      }
    } catch {
      // Non-blocking audit log
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Unexpected error restoring record" };
  }
}
