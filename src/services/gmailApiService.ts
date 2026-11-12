function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeSubject(subject: string): string {
  const bytes = new TextEncoder().encode(subject);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?utf-8?B?${btoa(binary)}?=`;
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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail profile request failed (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Send an email directly via the Gmail API using client-side OAuth Bearer token
 */
export async function sendGmailDirect(
  options: SendGmailOptions,
  token: string
): Promise<{ id: string; threadId: string }> {
  const { to, cc, bcc, subject, bodyHtml } = options;

  const cleanRecipient = to.trim();
  const cleanSubject = subject.trim();
  const fromAddress = "animationthenationalcollege@gmail.com";

  const headers: string[] = [
    `From: Supernova 3.0 <${fromAddress}>`,
    `To: ${cleanRecipient}`,
  ];

  if (cc && cc.trim()) {
    headers.push(`Cc: ${cc.trim()}`);
  }
  if (bcc && bcc.trim()) {
    headers.push(`Bcc: ${bcc.trim()}`);
  }

  headers.push(
    `Subject: ${encodeSubject(cleanSubject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`
  );

  const rawMessage = `${headers.join("\r\n")}\r\n\r\n${bodyHtml}`;
  const encodedRaw = base64UrlEncode(rawMessage);

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodedRaw }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      errData?.error?.message || `Gmail sending failed with HTTP status ${res.status}`
    );
  }

  return await res.json();
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
            date: dateHeader || (detailData.internalDate ? new Date(Number(detailData.internalDate)).toLocaleString() : undefined),
          };
        } catch {
          return { id: msg.id, threadId: msg.threadId };
        }
      })
    );

    return details;
  } catch (err) {
    console.warn("Could not list sent messages from Gmail:", err);
    return [];
  }
}
