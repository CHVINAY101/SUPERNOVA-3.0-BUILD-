import { jsPDF } from "jspdf";
import QRCode from "qrcode";

export interface TicketPdfOptions {
  ticketRef: string;
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

/**
 * Compute SHA-256 checksum of ArrayBuffer
 */
async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback simple hash
  let hash = 0;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash << 5) - hash + bytes[i];
    hash |= 0;
  }
  return `sha256_${Math.abs(hash).toString(16).padStart(16, "0")}`;
}

/**
 * Generate standard clean filename for ticket
 */
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
    return `${cleanRef}_Team_${cleanTeam}_Confirmation.pdf`;
  }
  // esports player
  const slot = options.playerSlot ? `_P${options.playerSlot}` : "";
  return `${cleanRef}${slot}_Esports_${cleanName}.pdf`;
}

/**
 * Generates an official, high-fidelity Supernova 3.0 PDF Ticket Pass.
 * Enforces idempotency: if ticket has already been generated in this session,
 * returns the exact cached original PDF.
 */
export async function generateTicketPdf(
  options: TicketPdfOptions,
  forceRegenerate = false
): Promise<GeneratedTicketResult> {
  const cacheKey = `${options.ticketRef}_${options.registrationType}_${options.recipientName}`;
  if (!forceRegenerate && TICKET_CACHE.has(cacheKey)) {
    return TICKET_CACHE.get(cacheKey)!;
  }

  // 1. Generate secure QR Code
  const qrVerificationPayload = JSON.stringify({
    event: "SUPERNOVA_3.0",
    ticket: options.ticketRef,
    attendee: options.recipientName,
    cat: options.category,
    dates: "20-21 NOV 2026",
    venue: "The National College, Basavanagudi",
    type: options.registrationType,
    verified_by: "animationthenationalcollege@gmail.com",
  });

  const qrDataUrl = await QRCode.toDataURL(qrVerificationPayload, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 280,
    color: {
      dark: "#0B1120",
      light: "#FFFFFF",
    },
  });

  // 2. Build PDF Document (A4 format: 210mm x 297mm)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  // Background Canvas: Soft Warm Neutral
  doc.setFillColor(248, 249, 252);
  doc.rect(0, 0, 210, 297, "F");

  // Top Deep Navy Header Banner
  doc.setFillColor(11, 17, 32); // #0B1120
  doc.rect(0, 0, 210, 52, "F");

  // Color Ribbon Accent Line
  doc.setFillColor(69, 73, 216); // #4549D8
  doc.rect(0, 50, 52.5, 2.5, "F");
  doc.setFillColor(255, 135, 61); // #FF873D
  doc.rect(52.5, 50, 52.5, 2.5, "F");
  doc.setFillColor(213, 245, 66); // #D5F542
  doc.rect(105, 50, 52.5, 2.5, "F");
  doc.setFillColor(56, 189, 248); // #38BDF8
  doc.rect(157.5, 50, 52.5, 2.5, "F");

  // Event Header Text
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("SUPERNOVA 3.0", margin, 22);

  doc.setFontSize(10);
  doc.setTextColor(56, 189, 248); // Cyan
  doc.text("OFFICIAL ACCESS PASS & ENTRY CREDENTIALS", margin, 30);

  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text("20–21 NOVEMBER 2026 · THE NATIONAL COLLEGE, BASAVANAGUDI, BENGALURU – 560004", margin, 38);

  // Main Ticket Card Box
  const cardTop = 64;
  const cardHeight = 168;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, cardTop, contentWidth, cardHeight, 6, 6, "FD");

  // Ticket Header Section
  doc.setFillColor(241, 245, 249);
  doc.rect(margin + 0.5, cardTop + 0.5, contentWidth - 1, 24, "F");

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8.5);
  doc.setFont("courier", "bold");
  doc.text("TICKET REFERENCE / BADGE ID", margin + 8, cardTop + 10);

  doc.setFontSize(17);
  doc.setTextColor(69, 73, 216); // Electric Blue
  doc.text(options.ticketRef, margin + 8, cardTop + 20);

  // Status Badge in Card Header
  doc.setFillColor(213, 245, 66); // Neon Lime
  doc.setDrawColor(11, 17, 32);
  doc.roundedRect(margin + contentWidth - 42, cardTop + 7, 34, 11, 3, 3, "FD");
  doc.setTextColor(11, 17, 32);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CONFIRMED", margin + contentWidth - 25, cardTop + 14.5, { align: "center" });

  // Left Column: Attendee Details
  const leftColX = margin + 8;
  let cursorY = cardTop + 36;

  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("ATTENDEE / REPRESENTATIVE NAME", leftColX, cursorY);

  cursorY += 6;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(13);
  doc.text(options.recipientName, leftColX, cursorY);

  cursorY += 10;
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text("CATEGORY / ACCESS STREAM", leftColX, cursorY);

  cursorY += 5;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(10);
  doc.text(options.category, leftColX, cursorY);

  if (options.institution) {
    cursorY += 10;
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text("INSTITUTION / ORGANIZATION", leftColX, cursorY);

    cursorY += 5;
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9.5);
    doc.text(options.institution, leftColX, cursorY);
  }

  // Stream-specific details
  if (options.projectTitle) {
    cursorY += 10;
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text("EXHIBIT PROJECT TITLE", leftColX, cursorY);

    cursorY += 5;
    doc.setTextColor(16, 185, 129); // Emerald
    doc.setFontSize(10);
    doc.text(options.projectTitle.slice(0, 45), leftColX, cursorY);
  }

  if (options.teamName) {
    cursorY += 10;
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text("ESPORTS TEAM NAME", leftColX, cursorY);

    cursorY += 5;
    doc.setTextColor(139, 92, 246); // Purple
    doc.setFontSize(10);
    const tagInfo = options.gamerTag ? ` (In-Game: ${options.gamerTag})` : "";
    doc.text(`${options.teamName}${tagInfo}`.slice(0, 45), leftColX, cursorY);
  }

  cursorY += 10;
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text("EVENT DATES & REPORTING TIME", leftColX, cursorY);

  cursorY += 5;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.text("20–21 November 2026 · Gates Open 08:30 AM IST", leftColX, cursorY);

  // Right Column: QR Code verification box
  const qrBoxX = margin + contentWidth - 58;
  const qrBoxY = cardTop + 34;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(qrBoxX, qrBoxY, 50, 68, 4, 4, "FD");

  doc.addImage(qrDataUrl, "PNG", qrBoxX + 4, qrBoxY + 4, 42, 42);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text("GATE VERIFICATION", qrBoxX + 25, qrBoxY + 52, { align: "center" });

  doc.setFont("courier", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Scan at Entry Counter", qrBoxX + 25, qrBoxY + 58, { align: "center" });
  doc.text(options.ticketRef, qrBoxX + 25, qrBoxY + 63, { align: "center" });

  // Dashed Cut Line below Ticket
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(margin, cardTop + cardHeight - 20, margin + contentWidth, cardTop + cardHeight - 20);
  doc.setLineDashPattern([], 0); // reset

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Please present this digital pass or physical printout at the registration desk upon campus arrival.",
    margin + contentWidth / 2,
    cardTop + cardHeight - 8,
    { align: "center" }
  );

  // Security & Guidelines Card
  const infoTop = cardTop + cardHeight + 10;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, infoTop, contentWidth, 38, 4, 4, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("IMPORTANT EVENT GUIDELINES & CAMPUS PROTOCOLS", margin + 8, infoTop + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("1. Attendees must carry a valid institutional photo ID card matching this pass.", margin + 8, infoTop + 16);
  doc.text("2. Esports competitors must report 45 minutes prior to scheduled bracket matches.", margin + 8, infoTop + 22);
  doc.text("3. High-voltage equipment and drones require prior staging clearance from coordinators.", margin + 8, infoTop + 28);
  doc.text("4. Inquiries & support: animationthenationalcollege@gmail.com", margin + 8, infoTop + 34);

  // Footer Notice
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Supernova 3.0 · Department of Animation · The National College, Basavanagudi, Bengaluru – 560004",
    pageWidth / 2,
    286,
    { align: "center" }
  );

  // 3. Export Output
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

  // Cache deterministic result
  TICKET_CACHE.set(cacheKey, result);
  return result;
}

/**
 * Trigger immediate browser download of the PDF ticket
 */
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
