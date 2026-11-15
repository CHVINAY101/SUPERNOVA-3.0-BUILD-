import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SITE_CONTENT } from "../content/site";
import { CheckCircle2, Copy, Download, Eye, QrCode, Search, Clock, AlertCircle, X, Ticket, GraduationCap, Building2, UserCheck } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabase";
import { getOfficialTeamSize, validateEsportsRoster } from "@/utils/esportsRules";
import { sendRegistrationConfirmationEmail } from "@/lib/registrationOperations";
import {
  isValidEmail,
  isValidInstitution,
  isValidName,
  isValidPhone,
} from "@/lib/validation";
import {
  FACULTY_DESIGNATION_OPTIONS,
  VISITOR_CATEGORY_CARDS,
  buildVisitorDisplaySubtitle,
  getDbCategoryFromId,
  resolveFacultyDesignationValue,
  validateVisitorFormFields,
  type VisitorCategoryId,
} from "@/lib/visitorCategories";
import {
  buildTicketQrContent,
  generateTicketPdf,
  downloadTicketPdfFile,
} from "@/lib/ticketPdfService";
import { archiveTicketToNas } from "@/lib/nasArchivalService";
import { lookupPublicTicket, submitVisitorAndIssueTicket } from "@/lib/ticketClient";
import { TicketPassModal } from "@/components/TicketPassModal";
import type { PublicTicketLookupResult, TicketRecord } from "@/types/database";

type FormType = "visitor" | "esports" | null;

interface PlayerRow {
  name: string;
  inGameId: string;
}

interface GameOption {
  id: string;
  title: string;
  team_size: number;
}

const SUGGESTED_INSTITUTIONS = [
  "The National College, Basavanagudi",
  "National PU College, Jayanagar",
  "National PU College, Basavanagudi",
  "National High School, Basavanagudi",
  "National English School",
  "National Degree College, Jayanagar",
  "DR.HNCE",
  "Bangalore University",
];

export const RegisterPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const content = SITE_CONTENT.registerPage;
  const meta = SITE_CONTENT.meta;

  // Read URL query parameter: ?type=visitor|esports
  const initialType = searchParams.get("type");
  const [selectedType, setSelectedType] = useState<FormType>(
    initialType === "visitor" || initialType === "esports" ? initialType : null
  );

  useEffect(() => {
    const paramType = searchParams.get("type");
    if (paramType === "visitor" || paramType === "esports") {
      setSelectedType(paramType);
    } else if (paramType === "participation") {
      setSelectedType(null);
    }
  }, [searchParams]);

  // Active games from Supabase
  const [activeGames, setActiveGames] = useState<GameOption[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const cachedPlayersRef = useRef<Record<number, PlayerRow>>({});

  useEffect(() => {
    async function loadGames() {
      try {
        const { data, error } = await supabase
          .from("games")
          .select("id, title, team_size")
          .eq("is_active", true)
          .eq("is_published", true)
          .order("sort_order", { ascending: true });
        if (!error && data && data.length > 0) {
          setActiveGames(data);
          
          // Check if URL specified a preferred game (e.g. ?type=esports&game=bgmi)
          const urlGameParam = (searchParams.get("game") || "").toLowerCase().trim();
          let targetGame = data[0];
          if (urlGameParam) {
            const matched = data.find((g) => g.title.toLowerCase().includes(urlGameParam) || g.id === urlGameParam);
            if (matched) targetGame = matched;
          }
          
          setSelectedGameId(targetGame.id);
          const requiredCount = getOfficialTeamSize(targetGame.title, targetGame.team_size);
          setEspPlayers(
            Array.from({ length: requiredCount }, (_, i) => ({
              name: cachedPlayersRef.current[i]?.name || "",
              inGameId: cachedPlayersRef.current[i]?.inGameId || "",
            }))
          );
        }
      } catch (err) {
        console.warn("Could not load games list:", err);
      }
    }
    loadGames();
  }, [searchParams]);

  // Three-Category Visitor Form State (No Registration Number / No Mobile)
  const [visCategoryId, setVisCategoryId] = useState<VisitorCategoryId | null>(null);
  const [visName, setVisName] = useState("");
  const [visEmail, setVisEmail] = useState("");
  const [visStudentClass, setVisStudentClass] = useState("");
  const [visDesignationOption, setVisDesignationOption] = useState("");
  const [visCustomDesignation, setVisCustomDesignation] = useState("");
  const [visInstitution, setVisInstitution] = useState("");

  // Esports Form State
  const [espTeamName, setEspTeamName] = useState("");
  const [espRep, setEspRep] = useState("");
  const [espEmail, setEspEmail] = useState("");
  const [espPhone, setEspPhone] = useState("");
  const [espInstitution, setEspInstitution] = useState("");
  const [espPlayers, setEspPlayers] = useState<PlayerRow[]>([
    { name: "", inGameId: "" },
    { name: "", inGameId: "" },
    { name: "", inGameId: "" },
    { name: "", inGameId: "" },
    { name: "", inGameId: "" },
  ]);
  const [espRulesAgreed, setEspRulesAgreed] = useState(false);

  // Common State
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [registeredRef, setRegisteredRef] = useState<string | null>(null);
  const [issuedVisitorTicket, setIssuedVisitorTicket] = useState<TicketRecord | null>(null);
  const [visitorQrPreviewUrl, setVisitorQrPreviewUrl] = useState<string>("");
  const [passModalOpen, setPassModalOpen] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Anti-IDOR Public Pass Lookup Modal State
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupRef, setLookupRef] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<PublicTicketLookupResult | null>(null);
  const [lookupPassModalOpen, setLookupPassModalOpen] = useState(false);

  useEffect(() => {
    if (!lookupOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLookupOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lookupOpen]);

  useEffect(() => {
    if (!submitSuccess || selectedType !== "visitor" || !registeredRef) {
      setVisitorQrPreviewUrl("");
      return;
    }
    let active = true;
    const qrContent = buildTicketQrContent(
      issuedVisitorTicket?.ticket_ref || registeredRef,
      issuedVisitorTicket?.qr_token
    );
    QRCode.toDataURL(qrContent, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 240,
      color: { dark: "#0B1120", light: "#FFFFFF" },
    })
      .then((url) => {
        if (active) setVisitorQrPreviewUrl(url);
      })
      .catch(() => {
        if (active) setVisitorQrPreviewUrl("");
      });
    return () => {
      active = false;
    };
  }, [submitSuccess, selectedType, registeredRef, issuedVisitorTicket]);

  const handleLookupPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupRef.trim() || !isValidEmail(lookupEmail)) {
      setLookupResult({
        ok: false,
        status: "error",
        error: "Please enter both your Registration / Ticket Reference and a valid Registered Email address.",
      });
      return;
    }
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const res = await lookupPublicTicket({
        reference: lookupRef,
        email: lookupEmail,
        phone: lookupPhone.trim() || null,
      });
      setLookupResult(res);
    } finally {
      setLookupLoading(false);
    }
  };

  // When game selection changes, resize players roster to match exact official team_size
  const handleGameChange = (gameId: string) => {
    setSelectedGameId(gameId);
    const game = activeGames.find((g) => g.id === gameId);
    const targetSize = getOfficialTeamSize(game?.title, game?.team_size);

    setEspPlayers((prev) => {
      // 1. Sync current player rows to session cache
      prev.forEach((p, idx) => {
        if (p.name || p.inGameId) {
          cachedPlayersRef.current[idx] = { ...p };
        }
      });

      // 2. Build exactly targetSize rows preserving valid positions (players 1..targetSize)
      // and restoring from cache if user previously entered them during this session
      const reconciled: PlayerRow[] = Array.from({ length: targetSize }, (_, i) => {
        if (prev[i]) {
          return { ...prev[i] };
        }
        if (cachedPlayersRef.current[i]) {
          return { ...cachedPlayersRef.current[i] };
        }
        return { name: "", inGameId: "" };
      });

      return reconciled;
    });
  };

  const handlePlayerChange = (idx: number, field: keyof PlayerRow, val: string) => {
    setEspPlayers((prev) => {
      const updated = prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p));
      if (updated[idx]) {
        cachedPlayersRef.current[idx] = { ...updated[idx] };
      }
      return updated;
    });
  };

  // Generate Mailto fallback url if needed
  const generateMailtoUrl = () => {
    const subject = encodeURIComponent(`SUPERNOVA 3.0 Registration — ${selectedType?.toUpperCase()}`);
    let body = `SUPERNOVA 3.0 REGISTRATION DETAILS\n\nRegistration Type: ${selectedType}\n`;

    if (selectedType === "visitor") {
      const catLabel = visCategoryId ? getDbCategoryFromId(visCategoryId) : "Not Selected";
      body += `Visitor Category: ${catLabel}\n`;
      body += `Full Name: ${visName}\n`;
      body += `Email: ${visEmail}\n`;
      if (visCategoryId === "student") {
        body += `Class / Course: ${visStudentClass}\n`;
        body += `College / Institution Name: ${visInstitution}\n`;
      } else if (visCategoryId === "faculty") {
        const desig = resolveFacultyDesignationValue(visDesignationOption, visCustomDesignation);
        body += `Designation / Role: ${desig}\n`;
        body += `College / Institution Name: ${visInstitution}\n`;
      } else if (visInstitution.trim()) {
        body += `College / Institution Name: ${visInstitution}\n`;
      }
    } else if (selectedType === "esports") {
      body += `Team Name: ${espTeamName}\n`;
      body += `Game: ${activeGames.find((g) => g.id === selectedGameId)?.title || selectedGameId}\n`;
      body += `Representative: ${espRep}\n`;
      body += `Email: ${espEmail}\n`;
      body += `Phone: ${espPhone}\n`;
      body += `Institution: ${espInstitution}\n`;
      body += `Players:\n`;
      espPlayers.forEach((p, i) => {
        body += `  Player ${i + 1}: ${p.name} (ID: ${p.inGameId})\n`;
      });
    }

    return `mailto:${meta.helpdeskEmail}?subject=${subject}&body=${encodeURIComponent(body)}`;
  };

  const copyRefToClipboard = () => {
    if (registeredRef) {
      navigator.clipboard.writeText(registeredRef);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return; // bot detected

    const errors: Record<string, string> = {};

    if (selectedType === "visitor") {
      const visValidationErrors = validateVisitorFormFields({
        categoryId: visCategoryId,
        fullName: visName,
        email: visEmail,
        studentClass: visStudentClass,
        designationOption: visDesignationOption,
        customDesignation: visCustomDesignation,
        institution: visInstitution,
      });
      Object.assign(errors, visValidationErrors);
    } else if (selectedType === "esports") {
      if (!isValidName(espTeamName, 100)) {
        errors.espTeamName = "Please enter your team name (at least 2 characters).";
      }
      if (!selectedGameId) {
        errors.selectedGameId = "Please select a game for esports registration.";
      }
      if (!isValidName(espRep, 120)) {
        errors.espRep = "Please enter the team representative name.";
      }
      if (!isValidEmail(espEmail)) {
        errors.espEmail = "Please enter a valid representative email address.";
      }
      if (!isValidPhone(espPhone)) {
        errors.espPhone = "Please enter a valid 10-digit mobile number.";
      }
      if (!isValidInstitution(espInstitution, 150)) {
        errors.espInstitution = "Please enter your college or institution name.";
      }
      if (!espRulesAgreed) {
        errors.espRulesAgreed = "Please accept the tournament rules before submitting.";
      }
    }

    if (!privacyAgreed) {
      errors.privacyAgreed = "Please agree to the privacy notice before submitting.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstMsg = Object.values(errors)[0];
      setSubmitError(firstMsg || "Please complete all required fields before submitting.");
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    setSubmitError(null);
    setIssuedVisitorTicket(null);
    setVisitorQrPreviewUrl("");
    setEmailNotice(null);

    try {
      if (selectedType === "visitor" && visCategoryId) {
        const canonicalCategory = getDbCategoryFromId(visCategoryId);
        const cleanName = visName.trim();
        const cleanEmail = visEmail.trim().toLowerCase();
        const cleanClass = visCategoryId === "student" ? visStudentClass.trim() : null;
        const cleanDesignation =
          visCategoryId === "faculty"
            ? resolveFacultyDesignationValue(visDesignationOption, visCustomDesignation)
            : null;
        const cleanInstitution = visInstitution.trim() || null;
        const displaySubtitle = buildVisitorDisplaySubtitle({
          visitorCategory: canonicalCategory,
          studentClass: cleanClass,
          designation: cleanDesignation,
        });

        const submissionRes = await submitVisitorAndIssueTicket({
          fullName: cleanName,
          email: cleanEmail,
          phone: null,
          institution: cleanInstitution,
          visitorCategory: canonicalCategory,
          studentClass: cleanClass,
          designation: cleanDesignation,
          daysAttending: "Both",
        });

        const ticketRef = submissionRes.ticket?.ticket_ref || submissionRes.registrationRef;
        const qrToken = submissionRes.ticket?.qr_token;
        setRegisteredRef(ticketRef);
        setIssuedVisitorTicket(submissionRes.ticket || null);

        // Generate PDF ticket (with secure token when available) and archive best-effort
        let ticketPdfAttachments: { filename: string; contentType: string; base64Content: string }[] = [];
        try {
          const ticketRes = await generateTicketPdf({
            ticketRef,
            qrToken,
            recipientName: cleanName,
            category: displaySubtitle,
            email: cleanEmail,
            institution: cleanInstitution || undefined,
            registrationType: "visitor",
            daysAttending: "Both",
          });

          ticketPdfAttachments = [
            {
              filename: ticketRes.fileName,
              contentType: "application/pdf",
              base64Content: ticketRes.pdfBase64,
            },
          ];

          await archiveTicketToNas(ticketRes, {
            ticketRef,
            qrToken,
            recipientName: cleanName,
            category: displaySubtitle,
            email: cleanEmail,
            institution: cleanInstitution || undefined,
            registrationType: "visitor",
            daysAttending: "Both",
          });
        } catch (nasErr) {
          console.warn("NAS archival / PDF creation notice:", nasErr);
        }

        // Best-effort email copy (ticket issuance does NOT depend on email delivery)
        let emailNoticeText =
          "Your official pass is active immediately above — download your PDF ticket or screenshot your QR pass now. Email delivery unavailable; please save or download your pass directly.";
        try {
          const emailRes = await sendRegistrationConfirmationEmail(
            submissionRes.registrationId || ticketRef,
            "visitor",
            false,
            {
              recipientEmail: cleanEmail,
              recipientName: cleanName,
              registrationRef: ticketRef,
              institution: cleanInstitution || undefined,
              extraDetails: {
                category: canonicalCategory,
                student_class: cleanClass || undefined,
                designation: cleanDesignation || undefined,
                days: "Both",
              },
              attachments: ticketPdfAttachments,
            }
          );

          if (emailRes.ok && !emailRes.simulated) {
            emailNoticeText =
              "Your official pass is active immediately above, and a copy of your PDF ticket has also been emailed to you.";
          } else if (emailRes.unavailable) {
            emailNoticeText =
              "Your official pass is active immediately above — download your PDF ticket or screenshot your QR pass now. Email delivery unavailable; please save or download your pass directly.";
          }
        } catch {
          // Email is optional; ticket pass is already generated and downloadable directly
        }

        setEmailNotice(emailNoticeText);
        setSubmitSuccess(true);
      } else if (selectedType === "esports") {
        if (!selectedGameId) {
          throw new Error("Please select a game for esports registration.");
        }
        const game = activeGames.find((g) => g.id === selectedGameId);
        const gameTitle = game?.title || "Tournament Title";
        const expectedCount = getOfficialTeamSize(game?.title, game?.team_size);

        const validation = validateEsportsRoster(gameTitle, espPlayers.slice(0, expectedCount));
        if (!validation.isValid) {
          throw new Error(validation.errorMessage || `All ${expectedCount} players are required.`);
        }

        const playersPayload = espPlayers.slice(0, expectedCount).map((p) => ({
          player_name: p.name.trim(),
          gamer_tag: p.inGameId.trim(),
        }));

        if (playersPayload.length !== expectedCount) {
          throw new Error(
            `${gameTitle} requires exactly ${expectedCount} players (current payload: ${playersPayload.length}). Extra or missing players are not allowed.`
          );
        }

        const { data, error } = await supabase.rpc("submit_esports_registration", {
          p_team_name: espTeamName.trim(),
          p_game_id: selectedGameId,
          p_institution: espInstitution.trim(),
          p_captain_name: espRep.trim(),
          p_email: espEmail.trim().toLowerCase(),
          p_phone: espPhone.trim(),
          p_players: playersPayload,
          p_consent: true,
          p_website: "",
        });

        if (error) throw error;
        const refStr = typeof data === "string" ? data : "SN3-26-REG";
        setRegisteredRef(refStr);

        // Strictly NO ticket issuance until esports confirmation succeeds
        setEmailNotice(
          "Your esports squad registration has been submitted for verification. Your official team pass and QR ticket will be issued and unlocked for download only after confirmation is completed."
        );
        setSubmitSuccess(true);
      }
    } catch (err: any) {
      setSubmitError(err.message || "An error occurred during submission.");
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <div className="w-full bg-[#F8F7FC] min-h-screen pb-24">
      {/* Header Band */}
      <div className="pt-8 sm:pt-12 pb-12 sm:pb-16 bg-white border-b border-[#EAEAF2] relative">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 text-center">
          <span className="inline-block text-xs uppercase tracking-[0.2em] font-mono text-blue-600 font-bold mb-3">
            {content.eyebrow}
          </span>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-display font-extrabold uppercase tracking-tight text-[#0F172A] mb-4">
            {content.heading}
          </h1>
          <p className="font-mono text-xs sm:text-sm font-semibold text-slate-600 max-w-2xl mx-auto">
            {content.datesVenueLine}
          </p>
        </div>

        {/* 4-color bottom ribbon line */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 flex" aria-hidden="true">
          <span className="flex-1 bg-[#4549D8]" />
          <span className="flex-1 bg-[#FF873D]" />
          <span className="flex-1 bg-[#D5F542]" />
          <span className="flex-1 bg-[#A9D9F4]" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 sm:px-8 pt-12">
        {/* Step 1: Choose Option + Existing Pass Lookup CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="text-center sm:text-left">
            <label className="text-base sm:text-lg font-bold text-[#191936] block">
              {content.chooseLabel}
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setLookupResult(null);
              setLookupOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-[#191936] bg-white hover:bg-[#D5F542] text-xs font-mono font-bold text-[#191936] shadow-[3px_3px_0px_#191936] transition-all cursor-pointer"
          >
            <Ticket className="w-4 h-4 text-[#4549D8]" />
            <span>Already Registered? View / Download Official Pass</span>
          </button>
        </div>

        {/* Two Registration Cards (Visitor Pass & Esports) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-12">
          {content.cards.map((card) => {
            const isSelected = selectedType === card.id;

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  const nextType = card.id as FormType;
                  setSelectedType(nextType);
                  if (nextType) {
                    setSearchParams({ type: nextType });
                  }
                  setSubmitSuccess(false);
                  setSubmitError(null);
                  setFieldErrors({});
                }}
                className={`text-left p-6 rounded-[20px] bg-white transition-all duration-200 relative min-h-[200px] flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? "border-[3px] border-[#191936] shadow-[6px_6px_0px_#191936] -translate-y-1"
                    : "border border-[#EAEAF2] hover:border-[#191936]/40 hover:shadow-md"
                }`}
              >
                {/* Top Badge & Check Icon */}
                <div className="flex items-center justify-between w-full mb-4">
                  <span
                    className="inline-block px-3.5 py-2 rounded-full text-xs font-mono font-bold uppercase tracking-wider text-[#191936] leading-none"
                    style={{ backgroundColor: card.badgeBg }}
                  >
                    {card.badge}
                  </span>
                  {isSelected && (
                    <CheckCircle2 className="w-6 h-6 text-[#4549D8] flex-shrink-0" />
                  )}
                </div>

                {/* Title & One Line Only */}
                <div>
                  <h3 className="font-heading text-2xl font-black text-[#191936] uppercase mb-2">
                    {card.title}
                  </h3>
                  <p className="text-sm font-medium text-[#191936]/80 leading-relaxed">
                    {card.line}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Step 2: Form Panel (48px below cards, max 760px, centered, white, 20px radius) */}
        <AnimatePresence mode="wait">
          {selectedType && (
            <motion.div
              key={selectedType}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.2 }}
              className="max-w-[760px] mx-auto bg-white rounded-[24px] border-2 border-[#191936] shadow-[6px_6px_0px_#191936] p-6 sm:p-10"
            >
              {/* Form Title */}
              <div className="mb-8 pb-4 border-b border-[#EAEAF2]">
                <h2 className="font-heading text-2xl sm:text-3xl font-black uppercase text-[#191936]">
                  {selectedType === "visitor" && "Visitor form"}
                  {selectedType === "esports" && "Esports team form"}
                </h2>
                <p className="text-sm text-[#191936]/70 mt-1">
                  Please complete the details below. Required fields are marked with an asterisk (*).
                </p>
              </div>

              {submitSuccess ? (
                <div className="text-center py-6 space-y-5">
                  <div
                    className={`w-16 h-16 rounded-full border-2 border-[#191936] mx-auto flex items-center justify-center text-[#191936] ${
                      selectedType === "visitor" ? "bg-[#D5F542]" : "bg-[#FFF3CD]"
                    }`}
                  >
                    {selectedType === "visitor" ? (
                      <CheckCircle2 className="w-8 h-8" />
                    ) : (
                      <Clock className="w-8 h-8" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-heading text-2xl sm:text-3xl font-black text-[#191936] uppercase tracking-tight">
                      {selectedType === "visitor"
                        ? "Registration Successful — Official Pass Issued"
                        : "Esports Registration Submitted"}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#191936]/80 max-w-md mx-auto mt-1">
                      {selectedType === "visitor"
                        ? "Your visitor pass is active immediately. View or download your PDF QR ticket below."
                        : "Your registration is currently pending confirmation. Your official pass will be issued once approved."}
                    </p>
                  </div>

                  {/* Primary Registration / Ticket Reference */}
                  {registeredRef && (
                    <div className="bg-[#0B1120] text-white border-2 border-[#191936] rounded-2xl p-5 sm:p-6 max-w-xl mx-auto text-left shadow-[6px_6px_0px_#4549D8] space-y-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300 font-bold">
                          {selectedType === "visitor"
                            ? "Unique Ticket Reference"
                            : "Esports Application Reference"}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase ${
                            selectedType === "visitor"
                              ? "bg-[#D5F542] text-[#0B1120]"
                              : "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                          }`}
                        >
                          {selectedType === "visitor"
                            ? "Confirmed · Active Pass"
                            : "Pending Approval — No Ticket Yet"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xl sm:text-2xl font-black text-[#D5F542] tracking-wider select-all">
                          {registeredRef}
                        </span>
                        <button
                          type="button"
                          onClick={copyRefToClipboard}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800 text-xs font-mono font-bold text-white hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedRef ? "Copied!" : "Copy"}
                        </button>
                      </div>

                      {/* Immediate Visitor QR Preview + View Ticket + Download PDF */}
                      {selectedType === "visitor" && (
                        <div className="pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-[1fr_152px] gap-4 items-center">
                          <div className="space-y-3">
                            <div className="text-xs text-slate-300 space-y-1">
                              <p className="font-bold text-white m-0">
                                {visName.trim() || "Visitor"} ·{" "}
                                {buildVisitorDisplaySubtitle({
                                  visitorCategory: visCategoryId
                                    ? getDbCategoryFromId(visCategoryId)
                                    : "General Visitor",
                                  studentClass: visCategoryId === "student" ? visStudentClass : null,
                                  designation:
                                    visCategoryId === "faculty"
                                      ? resolveFacultyDesignationValue(
                                          visDesignationOption,
                                          visCustomDesignation
                                        )
                                      : null,
                                })}
                              </p>
                              <p className="text-slate-400 m-0">
                                {visInstitution.trim() ? `${visInstitution.trim()} · ` : ""}
                                20–21 November 2026
                              </p>
                              <p className="text-cyan-300 text-[11px] m-0">
                                Present this QR pass (digital or printed PDF) with valid photo ID at the venue entrance.
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setPassModalOpen(true)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono font-bold text-white cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-cyan-300" />
                                <span>View Ticket</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  downloadTicketPdfFile({
                                    ticketRef: issuedVisitorTicket?.ticket_ref || registeredRef,
                                    qrToken: issuedVisitorTicket?.qr_token,
                                    recipientName: visName.trim() || "Visitor",
                                    category: buildVisitorDisplaySubtitle({
                                      visitorCategory: visCategoryId
                                        ? getDbCategoryFromId(visCategoryId)
                                        : "General Visitor",
                                      studentClass:
                                        visCategoryId === "student" ? visStudentClass : null,
                                      designation:
                                        visCategoryId === "faculty"
                                          ? resolveFacultyDesignationValue(
                                              visDesignationOption,
                                              visCustomDesignation
                                            )
                                          : null,
                                    }),
                                    email: visEmail.trim(),
                                    institution: visInstitution.trim() || undefined,
                                    registrationType: "visitor",
                                    daysAttending: "Both",
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D5F542] hover:bg-[#c6e830] text-xs font-mono font-black text-[#0B1120] cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download PDF</span>
                              </button>
                            </div>
                          </div>

                          {/* Inline QR Preview */}
                          <div className="bg-white rounded-2xl p-2.5 text-center border-2 border-cyan-400/70 mx-auto w-[152px]">
                            {visitorQrPreviewUrl ? (
                              <img
                                src={visitorQrPreviewUrl}
                                alt={`Visitor QR Code ${registeredRef}`}
                                className="w-32 h-32 mx-auto block"
                              />
                            ) : (
                              <div className="w-32 h-32 mx-auto flex items-center justify-center text-[11px] font-mono text-slate-500">
                                Loading QR...
                              </div>
                            )}
                            <span className="block mt-1 text-[10px] font-mono font-bold text-[#0B1120] uppercase">
                              QR Preview
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Pending approval instructions for Esports */}
                      {selectedType === "esports" && (
                        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <span className="text-xs text-slate-300">
                            Save your reference code to check approval status & download your PDF pass later.
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setLookupRef(registeredRef);
                              setLookupEmail(espEmail);
                              setLookupPhone(espPhone);
                              setLookupResult(null);
                              setLookupOpen(true);
                            }}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-mono font-bold text-cyan-300 cursor-pointer"
                          >
                            <Search className="w-3.5 h-3.5" />
                            <span>Check Pass Status</span>
                          </button>
                        </div>
                      )}

                      {emailNotice && (
                        <p className="text-[11px] text-slate-300 leading-relaxed border-t border-slate-800 pt-3 m-0">
                          {emailNotice}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Event Details Card */}
                  <div className="p-3.5 rounded-xl bg-[#F0F2FD] border border-[#4549D8]/30 max-w-xl mx-auto text-left text-xs text-[#191936]">
                    <div className="font-bold uppercase tracking-wider text-[11px] text-[#4549D8] mb-1">
                      Confirmed Venue & Dates
                    </div>
                    <div>
                      20–21 November 2026 · The National College, Basavanagudi, Bengaluru – 04 · Schedule: TBA
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSubmitSuccess(false);
                      setRegisteredRef(null);
                      setIssuedVisitorTicket(null);
                      setVisitorQrPreviewUrl("");
                      setEmailNotice(null);
                    }}
                    className="btn-secondary mt-2 cursor-pointer"
                  >
                    Submit another response
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-6">
                  {/* Honeypot field (hidden) */}
                  <input
                    type="text"
                    name="supernova_hp"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    style={{ display: "none" }}
                    tabIndex={-1}
                    autoComplete="off"
                  />

                  {/* 1. THREE-CATEGORY VISITOR FORM (STUDENT / FACULTY & DELEGATES / GENERAL) */}
                  {selectedType === "visitor" && (
                    <div className="space-y-6">
                      {/* Visitor Category Selector Cards */}
                      <div>
                        <label className="form-label mb-2.5 block">
                          Select Visitor Category *
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                          {VISITOR_CATEGORY_CARDS.map((card) => {
                            const isSelected = visCategoryId === card.id;
                            const IconComp =
                              card.id === "student"
                                ? GraduationCap
                                : card.id === "faculty"
                                ? Building2
                                : UserCheck;
                            return (
                              <button
                                key={card.id}
                                type="button"
                                aria-pressed={isSelected}
                                data-visitor-category-card={card.id}
                                onClick={() => {
                                  setVisCategoryId(card.id);
                                  setSubmitError(null);
                                  clearFieldError("category");
                                  clearFieldError("studentClass");
                                  clearFieldError("designationOption");
                                  clearFieldError("customDesignation");
                                  clearFieldError("institution");
                                }}
                                className={`text-left p-4 rounded-2xl transition-all duration-150 flex flex-col justify-between min-h-[144px] cursor-pointer ${
                                  isSelected
                                    ? "bg-[#F0F2FD] border-2 border-[#191936] shadow-[4px_4px_0px_#191936] -translate-y-0.5"
                                    : "bg-[#F8F7FC] border border-[#EAEAF2] hover:border-[#191936]/50 hover:bg-white"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2 mb-3">
                                  <div
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                                      isSelected
                                        ? "bg-[#4549D8] text-white border-[#191936]"
                                        : "bg-white text-[#4549D8] border-[#EAEAF2]"
                                    }`}
                                  >
                                    <IconComp className="w-4 h-4" />
                                  </div>
                                  {isSelected && (
                                    <CheckCircle2 className="w-5 h-5 text-[#4549D8] shrink-0" />
                                  )}
                                </div>
                                <div>
                                  <h3 className="font-heading text-xs sm:text-[13px] font-black uppercase tracking-tight text-[#191936] mb-1 leading-snug">
                                    {card.title}
                                  </h3>
                                  <p className="text-[11px] text-[#191936]/75 leading-relaxed m-0">
                                    {card.shortDescription}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {fieldErrors.category && (
                          <p role="alert" className="text-xs font-medium text-red-600 mt-2">
                            {fieldErrors.category}
                          </p>
                        )}
                      </div>

                      {/* Common Mandatory Fields (Full Name + Email Address) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label htmlFor="visitor-full-name" className="form-label">
                            Full Name *
                          </label>
                          <input
                            id="visitor-full-name"
                            name="full_name"
                            type="text"
                            required
                            maxLength={120}
                            value={visName}
                            onChange={(e) => {
                              setVisName(e.target.value);
                              clearFieldError("fullName");
                            }}
                            placeholder="Enter your full name"
                            className={`form-input ${fieldErrors.fullName ? "!border-red-500" : ""}`}
                          />
                          {fieldErrors.fullName && (
                            <p role="alert" className="text-xs font-medium text-red-600 mt-1">
                              {fieldErrors.fullName}
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="visitor-email" className="form-label">
                            Email Address *
                          </label>
                          <input
                            id="visitor-email"
                            name="email"
                            type="email"
                            required
                            maxLength={254}
                            value={visEmail}
                            onChange={(e) => {
                              setVisEmail(e.target.value);
                              clearFieldError("email");
                            }}
                            placeholder="name@example.com"
                            className={`form-input ${fieldErrors.email ? "!border-red-500" : ""}`}
                          />
                          {fieldErrors.email && (
                            <p role="alert" className="text-xs font-medium text-red-600 mt-1">
                              {fieldErrors.email}
                            </p>
                          )}
                        </div>

                        {/* Conditional: STUDENT VISITOR */}
                        {visCategoryId === "student" && (
                          <>
                            <div>
                              <label htmlFor="visitor-class-course" className="form-label">
                                Class / Course *
                              </label>
                              <input
                                id="visitor-class-course"
                                name="student_class"
                                type="text"
                                required
                                maxLength={120}
                                value={visStudentClass}
                                onChange={(e) => {
                                  setVisStudentClass(e.target.value);
                                  clearFieldError("studentClass");
                                }}
                                placeholder="e.g. II PUC Science, B.Sc. Computer Science, 10th Standard"
                                className={`form-input ${fieldErrors.studentClass ? "!border-red-500" : ""}`}
                              />
                              {fieldErrors.studentClass && (
                                <p role="alert" className="text-xs font-medium text-red-600 mt-1">
                                  {fieldErrors.studentClass}
                                </p>
                              )}
                            </div>

                            <div>
                              <label htmlFor="visitor-institution" className="form-label">
                                College / Institution Name *
                              </label>
                              <input
                                id="visitor-institution"
                                name="institution"
                                type="text"
                                required
                                maxLength={150}
                                list="visitor-institutions-list"
                                value={visInstitution}
                                onChange={(e) => {
                                  setVisInstitution(e.target.value);
                                  clearFieldError("institution");
                                }}
                                placeholder="Enter your school, college or institution name"
                                className={`form-input ${fieldErrors.institution ? "!border-red-500" : ""}`}
                              />
                              {fieldErrors.institution && (
                                <p role="alert" className="text-xs font-medium text-red-600 mt-1">
                                  {fieldErrors.institution}
                                </p>
                              )}
                            </div>
                          </>
                        )}

                        {/* Conditional: FACULTY & INSTITUTIONAL DELEGATES */}
                        {visCategoryId === "faculty" && (
                          <>
                            <div>
                              <label htmlFor="visitor-designation" className="form-label">
                                Designation / Role *
                              </label>
                              <select
                                id="visitor-designation"
                                name="designation"
                                required
                                value={visDesignationOption}
                                onChange={(e) => {
                                  setVisDesignationOption(e.target.value);
                                  clearFieldError("designationOption");
                                  if (e.target.value !== "Other") {
                                    clearFieldError("customDesignation");
                                  }
                                }}
                                className={`form-input ${fieldErrors.designationOption ? "!border-red-500" : ""}`}
                              >
                                <option value="">Select designation / role...</option>
                                {FACULTY_DESIGNATION_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                              {fieldErrors.designationOption && (
                                <p role="alert" className="text-xs font-medium text-red-600 mt-1">
                                  {fieldErrors.designationOption}
                                </p>
                              )}
                            </div>

                            <div>
                              <label htmlFor="visitor-institution" className="form-label">
                                College / Institution Name *
                              </label>
                              <input
                                id="visitor-institution"
                                name="institution"
                                type="text"
                                required
                                maxLength={150}
                                list="visitor-institutions-list"
                                value={visInstitution}
                                onChange={(e) => {
                                  setVisInstitution(e.target.value);
                                  clearFieldError("institution");
                                }}
                                placeholder="Enter your school, college or institution name"
                                className={`form-input ${fieldErrors.institution ? "!border-red-500" : ""}`}
                              />
                              {fieldErrors.institution && (
                                <p role="alert" className="text-xs font-medium text-red-600 mt-1">
                                  {fieldErrors.institution}
                                </p>
                              )}
                            </div>

                            {visDesignationOption === "Other" && (
                              <div className="md:col-span-2">
                                <label htmlFor="visitor-custom-designation" className="form-label">
                                  Specify Designation / Role *
                                </label>
                                <input
                                  id="visitor-custom-designation"
                                  name="custom_designation"
                                  type="text"
                                  required
                                  maxLength={120}
                                  value={visCustomDesignation}
                                  onChange={(e) => {
                                    setVisCustomDesignation(e.target.value);
                                    clearFieldError("customDesignation");
                                  }}
                                  placeholder="e.g. Research Coordinator, Academic Advisor, Dean"
                                  className={`form-input ${fieldErrors.customDesignation ? "!border-red-500" : ""}`}
                                />
                                {fieldErrors.customDesignation && (
                                  <p role="alert" className="text-xs font-medium text-red-600 mt-1">
                                    {fieldErrors.customDesignation}
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        )}

                        {/* Conditional: GENERAL VISITOR */}
                        {visCategoryId === "general" && (
                          <div className="md:col-span-2">
                            <label htmlFor="visitor-institution" className="form-label">
                              College / Institution Name (Optional)
                            </label>
                            <input
                              id="visitor-institution"
                              name="institution"
                              type="text"
                              maxLength={150}
                              list="visitor-institutions-list"
                              value={visInstitution}
                              onChange={(e) => {
                                setVisInstitution(e.target.value);
                                clearFieldError("institution");
                              }}
                              placeholder="Optional — school, college, organization or community affiliation"
                              className={`form-input ${fieldErrors.institution ? "!border-red-500" : ""}`}
                            />
                            {fieldErrors.institution && (
                              <p role="alert" className="text-xs font-medium text-red-600 mt-1">
                                {fieldErrors.institution}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {!visCategoryId && (
                        <div className="p-3.5 rounded-xl bg-[#F8F7FC] border border-[#EAEAF2] text-xs text-[#191936]/75">
                          Please choose one of the three visitor categories above (<strong>Student Visitor</strong>,{" "}
                          <strong>Faculty &amp; Institutional Delegates</strong>, or <strong>General Visitor</strong>) to complete your registration details.
                        </div>
                      )}

                      <datalist id="visitor-institutions-list">
                        {SUGGESTED_INSTITUTIONS.map((inst) => (
                          <option key={inst} value={inst} />
                        ))}
                      </datalist>
                    </div>
                  )}

                  {/* 3. ESPORTS TEAM FORM FIELDS */}
                  {selectedType === "esports" && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="form-label">Team Name *</label>
                          <input
                            type="text"
                            required
                            value={espTeamName}
                            onChange={(e) => setEspTeamName(e.target.value)}
                            placeholder="e.g. Supernova Strikers"
                            className="form-input"
                          />
                        </div>

                        <div>
                          <label className="form-label">Game Title *</label>
                          <select
                            value={selectedGameId}
                            onChange={(e) => handleGameChange(e.target.value)}
                            className="form-input"
                          >
                            {activeGames.length > 0 ? (
                              activeGames.map((game) => (
                                <option key={game.id} value={game.id}>
                                  {game.title} ({game.team_size} players)
                                </option>
                              ))
                            ) : (
                              <option value="">Loading official games...</option>
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="form-label">Team Representative *</label>
                          <input
                            type="text"
                            required
                            value={espRep}
                            onChange={(e) => setEspRep(e.target.value)}
                            placeholder="Captain or Manager name"
                            className="form-input"
                          />
                        </div>

                        <div>
                          <label className="form-label">Representative Email *</label>
                          <input
                            type="email"
                            required
                            value={espEmail}
                            onChange={(e) => setEspEmail(e.target.value)}
                            placeholder="rep@example.com"
                            className="form-input"
                          />
                        </div>

                        <div>
                          <label className="form-label">Representative Phone *</label>
                          <input
                            type="tel"
                            required
                            value={espPhone}
                            onChange={(e) => setEspPhone(e.target.value)}
                            placeholder="+91 98765 43210"
                            className="form-input"
                          />
                        </div>

                        <div>
                          <label className="form-label">Institution / College *</label>
                          <input
                            type="text"
                            required
                            value={espInstitution}
                            onChange={(e) => setEspInstitution(e.target.value)}
                            placeholder="College or institution name"
                            className="form-input"
                          />
                        </div>
                      </div>

                      {/* Player Rows: Strictly Enforced Official Tournament Team Sizes */}
                      <div className="pt-4 border-t border-[#EAEAF2]">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                          <div>
                            <label className="form-label font-bold text-base mb-0">
                              Team Players (
                              {activeGames.find((g) => g.id === selectedGameId)?.title || "Official Title"} — exactly{" "}
                              {getOfficialTeamSize(
                                activeGames.find((g) => g.id === selectedGameId)?.title,
                                activeGames.find((g) => g.id === selectedGameId)?.team_size
                              )}{" "}
                              players required)
                            </label>
                            <p className="text-xs text-[#191936]/60 mt-0.5">
                              Substitutes are not permitted. All roster positions are mandatory.
                            </p>
                          </div>
                          <span className="self-start sm:self-auto font-mono text-xs font-bold px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-blue-700">
                            {espPlayers.length} /{" "}
                            {getOfficialTeamSize(
                              activeGames.find((g) => g.id === selectedGameId)?.title,
                              activeGames.find((g) => g.id === selectedGameId)?.team_size
                            )}{" "}
                            Required
                          </span>
                        </div>

                        <div className="space-y-3">
                          {espPlayers.map((player, idx) => (
                            <div
                              key={idx}
                              className="p-3.5 rounded-xl bg-[#F8F7FC] border border-[#EAEAF2] space-y-2.5 sm:space-y-0 sm:flex sm:items-center sm:gap-3"
                            >
                              <div className="flex items-center justify-between sm:justify-start gap-2 shrink-0 sm:w-28">
                                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-[#EAEAF2] text-[#191936]">
                                  Player #{idx + 1}
                                </span>
                                {idx === 0 && (
                                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                    Lead
                                  </span>
                                )}
                              </div>
                              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div>
                                  <label className="sr-only">Player {idx + 1} Full Name</label>
                                  <input
                                    type="text"
                                    required
                                    value={player.name}
                                    onChange={(e) => handlePlayerChange(idx, "name", e.target.value)}
                                    placeholder={`Player ${idx + 1} Full Name *`}
                                    className="form-input !h-10 text-sm w-full"
                                  />
                                </div>
                                <div>
                                  <label className="sr-only">Player {idx + 1} In-Game ID</label>
                                  <input
                                    type="text"
                                    required
                                    value={player.inGameId}
                                    onChange={(e) => handlePlayerChange(idx, "inGameId", e.target.value)}
                                    placeholder={`Player ${idx + 1} In-Game Tag/ID *`}
                                    className="form-input !h-10 text-sm w-full font-mono"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Rules Checkbox */}
                      <div className="pt-2">
                        <label className="flex items-start gap-3 cursor-pointer text-sm text-[#191936]">
                          <input
                            type="checkbox"
                            required
                            checked={espRulesAgreed}
                            onChange={(e) => setEspRulesAgreed(e.target.checked)}
                            className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#4549D8]"
                          />
                          <span>{content.rulesCheckboxLabel}</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Common Privacy Policy Checkbox */}
                  <div className="pt-2">
                    <label className="flex items-start gap-3 cursor-pointer text-sm text-[#191936]">
                      <input
                        type="checkbox"
                        required
                        checked={privacyAgreed}
                        onChange={(e) => setPrivacyAgreed(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#4549D8]"
                      />
                      <span>{content.privacyCheckboxLabel}</span>
                    </label>
                  </div>



                  {/* Error Message */}
                  {submitError && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                      {submitError}
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary w-full sm:w-auto"
                    >
                      {isSubmitting ? "Submitting..." : "Submit Registration"}
                    </button>

                    <a
                      href={generateMailtoUrl()}
                      className="text-xs font-semibold text-[#4549D8] hover:underline"
                    >
                      Or submit via email client →
                    </a>
                  </div>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Support & Contact Footer */}
        <div className="mt-16 text-center text-sm text-[#191936]/70 space-y-2">
          <p>
            Need help with your registration? Contact our helpdesk at{" "}
            <a
              href={`mailto:${meta.helpdeskEmail}`}
              className="text-[#4549D8] font-bold hover:underline"
            >
              {meta.helpdeskEmail}
            </a>
          </p>
          <div className="flex items-center justify-center gap-4 text-xs">
            <span>The National College, Basavanagudi</span>
            <span>•</span>
            <span>National NCBA</span>
          </div>
        </div>
      </div>

      {/* View Ticket Modal for Fresh Visitor Pass */}
      {registeredRef && (
        <TicketPassModal
          isOpen={passModalOpen}
          onClose={() => setPassModalOpen(false)}
          ticketRef={issuedVisitorTicket?.ticket_ref || registeredRef}
          qrToken={issuedVisitorTicket?.qr_token}
          registrationCategory="visitor"
          displayName={visName.trim() || "Visitor"}
          subtitle={buildVisitorDisplaySubtitle({
            visitorCategory: visCategoryId
              ? getDbCategoryFromId(visCategoryId)
              : "General Visitor",
            studentClass: visCategoryId === "student" ? visStudentClass : null,
            designation:
              visCategoryId === "faculty"
                ? resolveFacultyDesignationValue(visDesignationOption, visCustomDesignation)
                : null,
          })}
          institution={visInstitution.trim() || undefined}
          email={visEmail.trim()}
          daysAttending="Both"
          issuedAt={issuedVisitorTicket?.issued_at}
          checkedInAt={issuedVisitorTicket?.checked_in_at}
        />
      )}

      {/* Anti-IDOR Official Pass Lookup & Re-Download Modal */}
      {lookupOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sn3-pass-lookup-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={() => setLookupOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl border-2 border-[#191936] shadow-[8px_8px_0px_#191936] overflow-hidden"
          >
            <div className="px-6 py-4 bg-[#0B1120] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <QrCode className="w-5 h-5 text-[#D5F542]" />
                <div>
                  <h2 id="sn3-pass-lookup-title" className="text-base font-display font-black uppercase text-white m-0">
                    Retrieve Official Pass
                  </h2>
                  <p className="text-[11px] font-mono text-cyan-300 m-0">
                    Visitor passes verify via Reference + Email; Esports passes also require Mobile
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLookupOpen(false)}
                aria-label="Close pass lookup"
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <form onSubmit={handleLookupPass} noValidate className="space-y-3.5">
                <div>
                  <label className="form-label">Registration / Ticket Reference *</label>
                  <input
                    type="text"
                    required
                    value={lookupRef}
                    onChange={(e) => setLookupRef(e.target.value.toUpperCase())}
                    placeholder="e.g. SN3-26-481209"
                    className="form-input font-mono uppercase"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Registered Email *</label>
                    <input
                      type="email"
                      required
                      value={lookupEmail}
                      onChange={(e) => setLookupEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Registered Phone (Esports only)</label>
                    <input
                      type="tel"
                      value={lookupPhone}
                      onChange={(e) => setLookupPhone(e.target.value)}
                      placeholder="Required for Esports squads"
                      className="form-input font-mono"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="btn-primary w-full justify-center cursor-pointer"
                >
                  {lookupLoading ? "Checking..." : "Verify & Retrieve Pass"}
                </button>
              </form>

              {lookupResult && (
                <div className="pt-2">
                  {lookupResult.ok && lookupResult.ticket ? (
                    <div className="p-4 rounded-2xl bg-[#0B1120] text-white border border-slate-700 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono uppercase text-slate-400 block">
                            Verified Pass Ready
                          </span>
                          <strong className="font-mono text-lg text-[#D5F542]">
                            {lookupResult.ticket.ticket_ref}
                          </strong>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-[#D5F542] text-[#0B1120] font-mono text-[10px] font-black uppercase">
                          {lookupResult.ticket.checked_in_at ? "Checked In" : "Active Pass"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300">
                        <strong className="text-white block">{lookupResult.ticket.display_name}</strong>
                        <span>{lookupResult.ticket.subtitle || lookupResult.ticket.registration_category}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setLookupPassModalOpen(true)}
                          className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-white cursor-pointer"
                        >
                          <Eye size={14} />
                          <span>View Pass & QR</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadTicketPdfFile({
                              ticketRef: lookupResult.ticket!.ticket_ref,
                              qrToken: lookupResult.ticket!.qr_token,
                              recipientName: lookupResult.ticket!.display_name,
                              category:
                                lookupResult.ticket!.subtitle ||
                                lookupResult.ticket!.registration_category,
                              email: lookupEmail.trim(),
                              phone: lookupPhone.trim() || undefined,
                              institution: lookupResult.ticket!.institution || undefined,
                              registrationType:
                                lookupResult.ticket!.registration_category === "esports"
                                  ? "esports_team"
                                  : "visitor",
                            })
                          }
                          className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-[#D5F542] hover:bg-[#c6e830] text-xs font-mono font-black text-[#0B1120] cursor-pointer"
                        >
                          <Download size={14} />
                          <span>Download PDF</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                        lookupResult.status === "pending_approval"
                          ? "bg-amber-50 border-amber-300 text-amber-900"
                          : "bg-rose-50 border-rose-200 text-rose-900"
                      }`}
                    >
                      {lookupResult.status === "pending_approval" ? (
                        <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <strong className="block mb-0.5">
                          {lookupResult.status === "pending_approval"
                            ? "Pending Confirmation — Pass Not Yet Issued"
                            : "Unable to Retrieve Pass"}
                        </strong>
                        <span>{lookupResult.error}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Ticket Pass Preview Modal for Looked-up Pass */}
      {lookupResult?.ok && lookupResult.ticket && (
        <TicketPassModal
          isOpen={lookupPassModalOpen}
          onClose={() => setLookupPassModalOpen(false)}
          ticketRef={lookupResult.ticket.ticket_ref}
          qrToken={lookupResult.ticket.qr_token}
          registrationCategory={lookupResult.ticket.registration_category}
          displayName={lookupResult.ticket.display_name}
          subtitle={lookupResult.ticket.subtitle}
          institution={lookupResult.ticket.institution}
          email={lookupEmail.trim()}
          phone={lookupPhone.trim()}
          issuedAt={lookupResult.ticket.issued_at}
          checkedInAt={lookupResult.ticket.checked_in_at}
        />
      )}
    </div>
  );
};
