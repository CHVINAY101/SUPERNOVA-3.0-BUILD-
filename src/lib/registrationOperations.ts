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

/**
 * Safely archive a registration (soft delete).
 * Uses the authenticated RPC for visitor & esports, and table update for participation.
 */
export async function archiveRegistrationRecord(
  registrationType: RegistrationTargetType,
  registrationId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (registrationType === "visitor" || registrationType === "esports") {
      const { data, error } = await supabase.rpc("archive_registration", {
        p_type: registrationType,
        p_id: registrationId,
      });

      if (error) {
        // Fallback to direct update if RPC fails for any unexpected reason
        const table = registrationType === "visitor" ? "visitor_registrations" : "registrations";
        const { error: directError } = await supabase
          .from(table)
          .update({ archived_at: new Date().toISOString() })
          .eq("id", registrationId);

        if (directError) {
          return { ok: false, error: directError.message || "Failed to archive registration" };
        }
        return { ok: true };
      }

      if (data && data.ok === false) {
        return { ok: false, error: data.error || "Record not found or already archived" };
      }
      return { ok: true };
    } else {
      // Participation registrations
      const { error } = await supabase
        .from("participation_registrations")
        .update({
          archived_at: new Date().toISOString(),
        })
        .eq("id", registrationId);

      if (error) {
        return { ok: false, error: error.message || "Failed to archive participation record" };
      }

      // Record in audit log
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id) {
          await supabase.from("audit_logs").insert({
            actor_id: userData.user.id,
            action: "archive_registration",
            table_name: "participation_registrations",
            record_id: registrationId,
            metadata: { registration_type: "participation", archived_at: new Date().toISOString() },
          });
        }
      } catch {
        // Non-blocking audit log
      }

      return { ok: true };
    }
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

    const { error } = await supabase
      .from(table)
      .update({
        archived_at: null,
        archived_by: null,
      })
      .eq("id", registrationId);

    if (error) {
      return { ok: false, error: error.message || `Failed to restore ${registrationType} record` };
    }

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
