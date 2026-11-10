import { supabase } from "@/lib/supabase";

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

export async function archiveRegistrationRecord(
  registrationType: "visitor" | "esports",
  registrationId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("archive_registration", {
    p_type: registrationType,
    p_id: registrationId,
  });

  if (error) {
    return { ok: false, error: error.message || "Failed to archive registration" };
  }
  if (data && data.ok === false) {
    return { ok: false, error: data.error || "Record not found or already archived" };
  }
  return { ok: true };
}
