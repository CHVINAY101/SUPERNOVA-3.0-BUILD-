import {
  base64UrlEncodeMime,
  buildRfc2822MimeMessage,
  containsHeaderInjection,
  redactSensitiveText,
  validateEmailList,
  validateRecipientEmail,
  type EmailAttachmentInput,
} from "@/lib/emailPayload";
import { clearGoogleAccessToken } from "@/lib/googleAuth";

export class GmailAuthExpiredError extends Error {
  constructor(message = "Google Gmail OAuth access token expired or was revoked. Please reconnect Gmail.") {
    super(message);
    this.name = "GmailAuthExpiredError";
  }
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface SendGmailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  attachments?: EmailAttachmentInput[];
}

export interface GmailSentMessage {
  id: string;
  threadId: string;
  snippet?: string;
  subject?: string;
  to?: string;
  date?: string;
}

/**
 * Fetch profile information of the authenticated Gmail user
 */
export async function fetchGmailProfile(token: string): Promise<GmailProfile> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    clearGoogleAccessToken();
    throw new GmailAuthExpiredError();
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(redactSensitiveText(`Gmail profile request failed (${res.status}): ${errText}`));
  }

  return await res.json();
}

/**
 * Send an email directly via the Gmail API using client-side OAuth Bearer token.
 * Validates recipient/cc/bcc, builds RFC 2822 multipart/mixed MIME with optional PDF attachments,
 * and handles OAuth 401 expiry cleanly.
 */
export async function sendGmailDirect(
  options: SendGmailOptions,
  token: string
): Promise<{ id: string; threadId: string }> {
  if (!token) {
    throw new GmailAuthExpiredError("Gmail OAuth token missing. Connect Gmail first.");
  }

  const toCheck = validateRecipientEmail(options.to);
  if (!toCheck.valid || !toCheck.normalizedEmail) {
    throw new Error(toCheck.error || "Invalid recipient email address.");
  }

  const ccCheck = validateEmailList(options.cc);
  if (!ccCheck.valid) {
    throw new Error(`Invalid CC address: ${ccCheck.error}`);
  }

  const bccCheck = validateEmailList(options.bcc);
  if (!bccCheck.valid) {
    throw new Error(`Invalid BCC address: ${bccCheck.error}`);
  }

  const cleanSubject = options.subject.trim();
  if (!cleanSubject || containsHeaderInjection(cleanSubject)) {
    throw new Error("A valid email subject is required.");
  }

  if (!options.bodyHtml || !options.bodyHtml.trim()) {
    throw new Error("Email message body cannot be empty.");
  }

  const fromAddress = "animationthenationalcollege@gmail.com";
  const rawMime = buildRfc2822MimeMessage({
    from: `Supernova 3.0 <${fromAddress}>`,
    to: toCheck.normalizedEmail,
    cc: ccCheck.list.join(", "),
    bcc: bccCheck.list.join(", "),
    subject: cleanSubject,
    bodyHtml: options.bodyHtml,
    attachments: options.attachments,
  });

  const encodedRaw = base64UrlEncodeMime(rawMime);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodedRaw }),
  });

  if (res.status === 401) {
    clearGoogleAccessToken();
    throw new GmailAuthExpiredError();
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      redactSensitiveText(errData?.error?.message || `Gmail sending failed with HTTP status ${res.status}`)
    );
  }

  const data = await res.json();
  if (!data?.id) {
    throw new Error("Gmail API succeeded without returning a message ID.");
  }

  return data;
}

/**
 * Lists recent sent emails directly from Gmail
 */
export async function listRecentSentFromGmail(
  token: string,
  maxResults = 10
): Promise<GmailSentMessage[]> {
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:sent&maxResults=${maxResults}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (listRes.status === 401) {
      clearGoogleAccessToken();
      throw new GmailAuthExpiredError();
    }

    if (!listRes.ok) return [];

    const data = await listRes.json();
    if (!data.messages || !Array.isArray(data.messages)) return [];

    const details: GmailSentMessage[] = await Promise.all(
      data.messages.slice(0, 10).map(async (msg: { id: string; threadId: string }) => {
        try {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!detailRes.ok) return { id: msg.id, threadId: msg.threadId };

          const detailData = await detailRes.json();
          const headers = detailData.payload?.headers || [];
          const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value;
          const toHeader = headers.find((h: any) => h.name.toLowerCase() === "to")?.value;
          const dateHeader = headers.find((h: any) => h.name.toLowerCase() === "date")?.value;

          return {
            id: msg.id,
            threadId: msg.threadId,
            snippet: detailData.snippet,
            subject: subjectHeader || "(No Subject)",
            to: toHeader || "(Unknown recipient)",
            date:
              dateHeader ||
              (detailData.internalDate ? new Date(Number(detailData.internalDate)).toLocaleString() : undefined),
          };
        } catch {
          return { id: msg.id, threadId: msg.threadId };
        }
      })
    );

    return details;
  } catch (err) {
    if (err instanceof GmailAuthExpiredError) throw err;
    console.warn("Could not list sent messages from Gmail:", err);
    return [];
  }
}
