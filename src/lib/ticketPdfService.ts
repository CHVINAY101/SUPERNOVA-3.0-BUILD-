import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { buildSecureQrPayload } from "./ticketing";

export interface TicketPdfOptions {
  ticketRef: string;
  qrToken?: string;
  recipientName: string;
  category: string;
  email: string;
  phone?: string;
  institution?: string;
  registrationType: "visitor" | "participation" | "esports_player" | "esports_team";
  applicationRef?: string;
  teamName?: string;
  projectTitle?: string;
  gamerTag?: string;
  playerSlot?: number;
  daysAttending?: string;
}

export interface GeneratedTicketResult {
  ticketRef: string;
  fileName: string;
  pdfBlob: Blob;
  pdfBase64: string;
  sha256Checksum: string;
  fileSizeBytes: number;
  qrPayload: string;
}

// In-memory / session cache to ensure identical PDF retention across retries
const TICKET_CACHE = new Map<string, GeneratedTicketResult>();

async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash << 5) - hash + bytes[i];
    hash |= 0;
  }
  return `sha256_${Math.abs(hash).toString(16).padStart(16, "0")}`;
}

export function getStandardTicketFileName(options: TicketPdfOptions): string {
  const sanitize = (str: string) =>
    str.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 32);

  const cleanRef = sanitize(options.ticketRef);
  const cleanName = sanitize(options.recipientName);

  if (options.registrationType === "visitor") {
    return `${cleanRef}_Visitor_${cleanName}.pdf`;
  }
  if (options.registrationType === "participation") {
    const cleanProj = sanitize(options.projectTitle || "Exhibit");
    return `${cleanRef}_Participation_${cleanProj}.pdf`;
  }
  if (options.registrationType === "esports_team") {
    const cleanTeam = sanitize(options.teamName || "Team");
    return `${cleanRef}_Team_${cleanTeam}_Pass.pdf`;
  }
  const slot = options.playerSlot ? `_P${options.playerSlot}` : "";
  return `${cleanRef}${slot}_Esports_${cleanName}.pdf`;
}

/**
 * Builds the QR payload embedded inside generated tickets.
 * Strictly zero PII: encodes only version, ticket_ref, and secure qr_token when present.
 */
export function buildTicketQrContent(ticketRef: string, qrToken?: string): string {
  if (qrToken && qrToken.trim().length > 0) {
    return buildSecureQrPayload(ticketRef, qrToken);
  }
  return JSON.stringify({
    v: 1,
    ref: String(ticketRef || "").trim().toUpperCase(),
  });
}

/**
 * Generates an official dark-cinematic Supernova 3.0 PDF Ticket Pass.
 * Includes only confirmed event details (20-21 Nov 2026, The National College, Basavanagudi).
 */
export async function generateTicketPdf(
  options: TicketPdfOptions,
  forceRegenerate = false
): Promise<GeneratedTicketResult> {
  const tokenKey = options.qrToken ? options.qrToken.slice(0, 12) : "ref-only";
  const cacheKey = `${options.ticketRef}_${tokenKey}_${options.registrationType}_${options.recipientName}`;
  if (!forceRegenerate && TICKET_CACHE.has(cacheKey)) {
    return TICKET_CACHE.get(cacheKey)!;
  }

  const qrVerificationPayload = buildTicketQrContent(options.ticketRef, options.qrToken);

  const qrDataUrl = await QRCode.toDataURL(qrVerificationPayload, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 320,
    color: {
      dark: "#0B1120",
      light: "#FFFFFF",
    },
  });

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  // 1. Dark Cinematic Obsidian Canvas
  doc.setFillColor(11, 17, 32); // #0B1120
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Top Header Strip & 4-Color Supernova Accent Bar
  doc.setFillColor(15, 23, 42); // #0F172A
  doc.rect(0, 0, pageWidth, 48, "F");

  doc.setFillColor(69, 73, 216); // #4549D8 Electric Indigo
  doc.rect(0, 48, pageWidth * 0.25, 2.5, "F");
  doc.setFillColor(56, 189, 248); // #38BDF8 Cyan
  doc.rect(pageWidth * 0.25, 48, pageWidth * 0.25, 2.5, "F");
  doc.setFillColor(213, 245, 66); // #D5F542 Lime
  doc.rect(pageWidth * 0.5, 48, pageWidth * 0.25, 2.5, "F");
  doc.setFillColor(255, 135, 61); // #FF873D Amber
  doc.rect(pageWidth * 0.75, 48, pageWidth * 0.25, 2.5, "F");

  // Brand Title
  doc.setTextColor(213, 245, 66); // #D5F542
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text("THE NATIONAL EDUCATION SOCIETY OF KARNATAKA", margin, 15);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("SUPERNOVA 3.0", margin, 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(148, 163, 184);
  doc.text("OFFICIAL ENTRY PASS · 20–21 NOVEMBER 2026", margin, 34);
  doc.setTextColor(56, 189, 248);
  doc.text("THE NATIONAL COLLEGE, BASAVANAGUDI, BENGALURU – 04", margin, 40.5);

  // Confirmed Pass Pill on Header Right
  doc.setFillColor(213, 245, 66);
  doc.roundedRect(pageWidth - margin - 38, 18, 38, 11, 2.5, 2.5, "F");
  doc.setTextColor(11, 17, 32);
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text("CONFIRMED", pageWidth - margin - 19, 25.2, { align: "center" });

  // 2. Main Dark Cinematic Pass Card
  const cardTop = 60;
  const cardHeight = 166;

  doc.setFillColor(19, 28, 49); // #131C31
  doc.setDrawColor(51, 65, 85); // #334155
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, cardTop, contentWidth, cardHeight, 5, 5, "FD");

  // Card Top Band
  doc.setFillColor(25, 37, 64); // #192540
  doc.roundedRect(margin + 0.5, cardTop + 0.5, contentWidth - 1, 26, 4.5, 4.5, "F");
  doc.rect(margin + 0.5, cardTop + 18, contentWidth - 1, 8.5, "F");

  doc.setTextColor(148, 163, 184);
  doc.setFont("courier", "bold");
  doc.setFontSize(8);
  doc.text("UNIQUE TICKET REFERENCE", margin + 8, cardTop + 9.5);

  doc.setTextColor(213, 245, 66); // Lime accent
  doc.setFont("courier", "bold");
  doc.setFontSize(17);
  doc.text(options.ticketRef, margin + 8, cardTop + 20);

  // Category Pill on Card Top Right
  const streamLabel =
    options.registrationType === "visitor"
      ? "VISITOR PASS"
      : options.registrationType === "participation"
      ? "PARTICIPATION PASS"
      : "ESPORTS PASS";
  doc.setFillColor(69, 73, 216);
  doc.roundedRect(margin + contentWidth - 50, cardTop + 7.5, 42, 11, 2.5, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text(streamLabel, margin + contentWidth - 29, cardTop + 14.5, { align: "center" });

  // Left Details Column
  const leftX = margin + 8;
  const maxTextW = contentWidth - 76;
  let y = cardTop + 38;

  const drawField = (label: string, value: string, valueColor: [number, number, number] = [248, 250, 252], size = 11) => {
    doc.setFont("courier", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(label, leftX, y);
    y += 5.5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
    const lines = doc.splitTextToSize(value, maxTextW);
    doc.text(lines.slice(0, 2), leftX, y);
    y += Math.max(1, Math.min(2, lines.length)) * 5.2 + 5;
  };

  drawField("PASS HOLDER / REPRESENTATIVE", options.recipientName, [255, 255, 255], 13.5);
  drawField("ACCESS STREAM / CATEGORY", options.category, [56, 189, 248], 10.5);

  if (options.institution) {
    drawField("INSTITUTION / AFFILIATION", options.institution, [226, 232, 240], 10);
  }

  if (options.teamName) {
    const tagStr = options.gamerTag ? ` (${options.gamerTag})` : "";
    drawField("ESPORTS TEAM", `${options.teamName}${tagStr}`, [255, 135, 61], 10.5);
  }

  if (options.projectTitle) {
    drawField(
      options.registrationType === "esports_team" || options.registrationType === "esports_player"
        ? "TOURNAMENT TITLE"
        : "PROJECT / EXHIBIT TITLE",
      options.projectTitle,
      [213, 245, 66],
      10
    );
  }

  drawField(
    "EVENT DATES & SCHEDULE",
    `20–21 November 2026 · ${options.daysAttending ? `Attendance: ${options.daysAttending} · ` : ""}Schedule TBA`,
    [226, 232, 240],
    9.5
  );

  // Right Column: High-Contrast Optical QR Container
  const qrBoxW = 54;
  const qrBoxH = 74;
  const qrBoxX = margin + contentWidth - qrBoxW - 7;
  const qrBoxY = cardTop + 36;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(56, 189, 248);
  doc.setLineWidth(0.7);
  doc.roundedRect(qrBoxX, qrBoxY, qrBoxW, qrBoxH, 4, 4, "FD");

  doc.addImage(qrDataUrl, "PNG", qrBoxX + 4, qrBoxY + 4, 46, 46);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(11, 17, 32);
  doc.text("SCAN AT GATE ENTRY", qrBoxX + qrBoxW / 2, qrBoxY + 56, { align: "center" });

  doc.setFont("courier", "bold");
  doc.setFontSize(7);
  doc.setTextColor(69, 73, 216);
  doc.text(options.ticketRef, qrBoxX + qrBoxW / 2, qrBoxY + 62, { align: "center" });

  doc.setFont("courier", "normal");
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text("SINGLE-USE DB VERIFIED", qrBoxX + qrBoxW / 2, qrBoxY + 68, { align: "center" });

  // Perforated Divider Inside Pass Card
  const perfY = cardTop + cardHeight - 20;
  doc.setDrawColor(71, 85, 105);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin + 6, perfY, margin + contentWidth - 6, perfY);
  doc.setLineDashPattern([], 0);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(203, 213, 225);
  doc.text(
    "Present this QR pass (digital or printed) along with a valid institutional/photo ID at the venue gate.",
    margin + contentWidth / 2,
    perfY + 10.5,
    { align: "center" }
  );

  // 3. Entrance Instructions & Verified Venue Panel
  const infoTop = cardTop + cardHeight + 10;
  doc.setFillColor(15, 23, 42);
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, infoTop, contentWidth, 40, 4, 4, "FD");

  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(56, 189, 248);
  doc.text("GATE ENTRY & VENUE INFORMATION", margin + 8, infoTop + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text("1. Venue: The National College, Basavanagudi, Bengaluru – 04 (20–21 November 2026).", margin + 8, infoTop + 16.5);
  doc.text("2. Event timings & schedule: To be announced (TBA) on the official Supernova 3.0 portal.", margin + 8, infoTop + 22.5);
  doc.text("3. Each QR code contains a unique single-use verification token validated live at gate entry.", margin + 8, infoTop + 28.5);
  doc.text("4. Helpdesk & enquiries: animationthenationalcollege@gmail.com", margin + 8, infoTop + 34.5);

  // Footer
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "SUPERNOVA 3.0 · THE NATIONAL COLLEGE, BASAVANAGUDI · DEPARTMENT OF ANIMATION",
    pageWidth / 2,
    286,
    { align: "center" }
  );

  const pdfBlob = doc.output("blob");
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const sha256Checksum = await computeSha256(arrayBuffer);
  const pdfBase64 = doc.output("datauristring");
  const fileName = getStandardTicketFileName(options);

  const result: GeneratedTicketResult = {
    ticketRef: options.ticketRef,
    fileName,
    pdfBlob,
    pdfBase64,
    sha256Checksum,
    fileSizeBytes: pdfBlob.size,
    qrPayload: qrVerificationPayload,
  };

  TICKET_CACHE.set(cacheKey, result);
  return result;
}

export async function downloadTicketPdfFile(options: TicketPdfOptions): Promise<void> {
  const generated = await generateTicketPdf(options);
  const url = URL.createObjectURL(generated.pdfBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = generated.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
