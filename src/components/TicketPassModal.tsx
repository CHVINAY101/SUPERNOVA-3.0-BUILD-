import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { X, Download, Copy, CheckCircle2, ShieldCheck, MapPin, Calendar } from "lucide-react";
import { buildTicketQrContent, downloadTicketPdfFile } from "@/lib/ticketPdfService";
import type { TicketCategory } from "@/types/database";

export interface TicketPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketRef: string;
  qrToken?: string;
  registrationCategory: TicketCategory;
  displayName: string;
  subtitle?: string | null;
  institution?: string | null;
  email?: string;
  phone?: string;
  teamName?: string;
  projectTitle?: string;
  daysAttending?: string;
  issuedAt?: string | null;
  checkedInAt?: string | null;
}

export const TicketPassModal: React.FC<TicketPassModalProps> = ({
  isOpen,
  onClose,
  ticketRef,
  qrToken,
  registrationCategory,
  displayName,
  subtitle,
  institution,
  email,
  phone,
  teamName,
  projectTitle,
  daysAttending,
  issuedAt,
  checkedInAt,
}) => {
  const [qrImageUrl, setQrImageUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isOpen || !ticketRef) return;
    let active = true;
    const payload = buildTicketQrContent(ticketRef, qrToken);
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 280,
      color: { dark: "#0B1120", light: "#FFFFFF" },
    })
      .then((url) => {
        if (active) setQrImageUrl(url);
      })
      .catch(() => {
        if (active) setQrImageUrl("");
      });
    return () => {
      active = false;
    };
  }, [isOpen, ticketRef, qrToken]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const streamLabel =
    registrationCategory === "visitor"
      ? "Visitor Pass"
      : registrationCategory === "participation"
      ? "Participation Pass"
      : "Esports Pass";

  const handleCopy = () => {
    navigator.clipboard.writeText(ticketRef);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      await downloadTicketPdfFile({
        ticketRef,
        qrToken,
        recipientName: displayName,
        category: subtitle || streamLabel,
        email: email || "",
        phone,
        institution: institution || undefined,
        registrationType:
          registrationCategory === "esports"
            ? "esports_team"
            : registrationCategory === "participation"
            ? "participation"
            : "visitor",
        teamName,
        projectTitle,
        daysAttending,
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sn3-pass-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#0B1120] text-white rounded-3xl border border-slate-700 shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
      >
        {/* Top Accent Ribbon */}
        <div className="h-1.5 flex" aria-hidden="true">
          <span className="flex-1 bg-[#4549D8]" />
          <span className="flex-1 bg-[#38BDF8]" />
          <span className="flex-1 bg-[#D5F542]" />
          <span className="flex-1 bg-[#FF873D]" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[#D5F542] block">
              Official Supernova 3.0 Entry Pass
            </span>
            <h2
              id="sn3-pass-modal-title"
              className="text-lg font-display font-black uppercase tracking-tight text-white m-0"
            >
              {streamLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ticket pass"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pass Body */}
        <div className="p-6 space-y-5">
          <div className="rounded-2xl bg-[#131C31] border border-slate-700/90 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                  Ticket Reference
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-xl font-black text-[#D5F542] tracking-wider">
                    {ticketRef}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-mono font-semibold text-slate-200 cursor-pointer"
                  >
                    <Copy size={12} />
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold uppercase ${
                  checkedInAt
                    ? "bg-amber-500/20 text-amber-300 border border-amber-400/40"
                    : "bg-[#D5F542] text-[#0B1120]"
                }`}
              >
                <CheckCircle2 size={12} />
                <span>{checkedInAt ? "Checked In" : "Confirmed"}</span>
              </span>
            </div>

            {/* QR + Details Split */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_168px] gap-4 items-center pt-3 border-t border-slate-700/80">
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                    Pass Holder
                  </span>
                  <strong className="text-base font-bold text-white block mt-0.5">
                    {displayName}
                  </strong>
                </div>

                {subtitle && (
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-400 block">
                      Category / Details
                    </span>
                    <span className="text-cyan-300 font-semibold block mt-0.5">{subtitle}</span>
                  </div>
                )}

                {institution && (
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-400 block">
                      Institution
                    </span>
                    <span className="text-slate-200 block mt-0.5">{institution}</span>
                  </div>
                )}

                {issuedAt && (
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-400 block">
                      Issued At
                    </span>
                    <span className="font-mono text-[11px] text-slate-300 block mt-0.5">
                      {new Date(issuedAt).toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
              </div>

              {/* Optical QR Block */}
              <div className="bg-white rounded-2xl p-3 text-center border-2 border-cyan-400/70 mx-auto w-[168px]">
                {qrImageUrl ? (
                  <img
                    src={qrImageUrl}
                    alt={`QR verification code for ${ticketRef}`}
                    className="w-36 h-36 mx-auto block"
                  />
                ) : (
                  <div className="w-36 h-36 mx-auto flex items-center justify-center text-xs font-mono text-slate-500">
                    Generating QR...
                  </div>
                )}
                <span className="block mt-1.5 text-[10px] font-mono font-bold text-[#0B1120] uppercase">
                  Scan at Gate Entry
                </span>
              </div>
            </div>
          </div>

          {/* Confirmed Event Facts & Entrance Instructions */}
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2 text-cyan-300 font-mono text-[11px] font-bold uppercase">
              <ShieldCheck size={14} />
              <span>Entrance Instructions</span>
            </div>
            <p className="flex items-start gap-2 m-0">
              <Calendar size={13} className="text-[#D5F542] shrink-0 mt-0.5" />
              <span>20–21 November 2026 · Event timings & schedule: TBA</span>
            </p>
            <p className="flex items-start gap-2 m-0">
              <MapPin size={13} className="text-[#38BDF8] shrink-0 mt-0.5" />
              <span>The National College, Basavanagudi, Bengaluru – 04</span>
            </p>
            <p className="text-slate-400 m-0 pt-1">
              Present this pass (digital or downloaded PDF) together with a valid institutional or photo ID at the entrance gate.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownloadPdf}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-[#D5F542] hover:bg-[#c6e830] text-[#0B1120] font-mono text-xs font-black uppercase tracking-wide cursor-pointer disabled:opacity-60"
            >
              <Download size={15} />
              <span>{downloading ? "Preparing PDF..." : "Download PDF Ticket"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
