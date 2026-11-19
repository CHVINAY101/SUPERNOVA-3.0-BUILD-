import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SITE_CONTENT } from "../content/site";
import { CheckCircle2, Copy, Download, Eye, QrCode, Search, Clock, AlertCircle, X, Ticket, GraduationCap, Building2, UserCheck } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabase";
import {
  getOfficialTeamSize,
  validateEsportsRosterWithEducation,
  type PlayerFieldErrors,
} from "@/utils/esportsRules";
import {
  PLAYER_INSTITUTION_TYPES,
  getEducationSuggestionsForType,
  getGameClosedDisplayMessage,
  normalizeEsportsGameAvailabilityList,
} from "@/lib/esportsRegistrationControls";
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
import type {
  EsportsGameAvailability,
  Game,
  PlayerInstitutionType,
  PublicTicketLookupResult,
  Registration,
  RegistrationControl,
  TicketRecord,
} from "@/types/database";

type FormType = "visitor" | "esports" | null;

interface PlayerRow {
  name: string;
  inGameId: string;
  institutionType: PlayerInstitutionType | "";
  institutionName: string;
  courseOrClass: string;
  currentYearOrClass: string;
}

const EMPTY_PLAYER_ROW = (): PlayerRow => ({
  name: "",
  inGameId: "",
  institutionType: "",
  institutionName: "",
  courseOrClass: "",
  currentYearOrClass: "",
});

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

  // Active games & per-game registration availability from Supabase
  const [activeGames, setActiveGames] = useState<GameOption[]>([]);
  const [availabilityByGameId, setAvailabilityByGameId] = useState<
    Record<string, EsportsGameAvailability>
  >({});
  const [portalClosedNotice, setPortalClosedNotice] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const cachedPlayersRef = useRef<Record<number, PlayerRow>>({});

  useEffect(() => {
    let active = true;
    async function loadGames() {
      try {
        const [{ data: availRpcData, error: availRpcErr }, { data: gamesData, error }, { data: portalCtrl }] =
          await Promise.all([
            supabase.rpc("get_esports_registration_availability"),
            supabase
              .from("games")
              .select("*")
              .eq("is_active", true)
              .eq("is_published", true)
              .order("sort_order", { ascending: true }),
            supabase
              .from("registration_controls")
              .select("is_open, opens_at, closes_at, closed_message")
              .eq("form_type", "esports")
              .maybeSingle(),
          ]);

        if (!active) return;

        if (portalCtrl && !portalCtrl.is_open) {
          setPortalClosedNotice(
            portalCtrl.closed_message ||
              "Esports squad registrations are currently closed by the organizers."
          );
        } else {
          setPortalClosedNotice(null);
        }

        const loadedGames = !error && Array.isArray(gamesData) ? (gamesData as Game[]) : [];
        const rpcRows = !availRpcErr && Array.isArray(availRpcData) ? availRpcData : [];

        if (loadedGames.length > 0 || rpcRows.length > 0) {
          let regsList: Registration[] = [];
          if (availRpcErr) {
            try {
              const { data: regsData } = await supabase
                .from("registrations")
                .select("id, game_id, status, admin_notes");
              regsList = (regsData || []) as Registration[];
            } catch {
              regsList = [];
            }
          }

          const normalized = normalizeEsportsGameAvailabilityList({
            rpcRows,
            games: loadedGames,
            registrations: regsList,
            portalControl: (portalCtrl as RegistrationControl | null) || null,
          });

          const availMap: Record<string, EsportsGameAvailability> = {};
          for (const item of normalized) {
            availMap[item.id] = item;
          }

          setActiveGames(
            normalized.map((g) => ({
              id: g.id,
              title: g.title,
              team_size: g.team_size ?? getOfficialTeamSize(g.title),
            }))
          );
          setAvailabilityByGameId(availMap);

          // Select preferred game from URL (?type=esports&game=...) or first open game
          const urlGameParam = (searchParams.get("game") || "").toLowerCase().trim();
          let initialTarget = normalized[0];
          if (urlGameParam) {
            const matched = normalized.find(
              (g) => g.title.toLowerCase().includes(urlGameParam) || g.id === urlGameParam
            );
            if (matched) initialTarget = matched;
          } else {
            const firstOpen = normalized.find(
              (g) => g.registration_open !== false && g.is_effectively_open !== false
            );
            if (firstOpen) initialTarget = firstOpen;
          }

          if (initialTarget) {
            setSelectedGameId(initialTarget.id);
            const requiredCount = getOfficialTeamSize(
              initialTarget.title,
              initialTarget.team_size ?? undefined
            );
            setEspPlayers(
              Array.from({ length: requiredCount }, (_, i) => ({
                name: cachedPlayersRef.current[i]?.name || "",
                inGameId: cachedPlayersRef.current[i]?.inGameId || "",
                institutionType: cachedPlayersRef.current[i]?.institutionType || "",
                institutionName: cachedPlayersRef.current[i]?.institutionName || "",
                courseOrClass: cachedPlayersRef.current[i]?.courseOrClass || "",
                currentYearOrClass: cachedPlayersRef.current[i]?.currentYearOrClass || "",
              }))
            );
          }
        }
      } catch (err) {
        console.warn("Could not load games list:", err);
      }
    }
    loadGames();
    return () => {
      active = false;
    };
  }, [searchParams]);

  // Three-Category Visitor Form State
  const [visCategoryId, setVisCategoryId] = useState<VisitorCategoryId | null>(null);
  const [visName, setVisName] = useState("");
  const [visEmail, setVisEmail] = useState("");
  const [visPhone, setVisPhone] = useState("");
  const [visStudentClass, setVisStudentClass] = useState("");
  const [visDesignationOption, setVisDesignationOption] = useState("");
  const [visCustomDesignation, setVisCustomDesignation] = useState("");
  const [visInstitution, setVisInstitution] = useState("");
  const [visPromoConsent, setVisPromoConsent] = useState(false);

  // Esports Form State
  const [espTeamName, setEspTeamName] = useState("");
  const [espRep, setEspRep] = useState("");
  const [espEmail, setEspEmail] = useState("");
  const [espPhone, setEspPhone] = useState("");
  const [espInstitution, setEspInstitution] = useState("");
  const [espPlayers, setEspPlayers] = useState<PlayerRow[]>([
    EMPTY_PLAYER_ROW(),
    EMPTY_PLAYER_ROW(),
    EMPTY_PLAYER_ROW(),
    EMPTY_PLAYER_ROW(),
    EMPTY_PLAYER_ROW(),
  ]);
  const [espRulesAgreed, setEspRulesAgreed] = useState(false);

  // Common State
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [registeredRef, setRegisteredRef] = useState<string | null>(null);
  const [issuedVisitorTicket, setIssuedVisitorTicket] = useState<TicketRecord | null>(null);
  const [visitorQrPreviewUrl, setVisitorQrPreviewUrl] = useState<string>("");
  const [passModalOpen, setPassModalOpen] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [playerFieldErrors, setPlayerFieldErrors] = useState<Record<number, PlayerFieldErrors>>({});

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const focusFirstInvalidControl = () => {
    window.requestAnimationFrame(() => {
      const root = formRef.current;
      if (!root) return;
      const invalidEl = root.querySelector<HTMLElement>(
        '[aria-invalid="true"], input[aria-invalid="true"], select[aria-invalid="true"]'
      );
      const target =
        invalidEl ||
        root.querySelector<HTMLElement>('[role="alert"]');
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof (target as any).focus === "function" && target.tagName !== "P" && target.tagName !== "DIV") {
          target.focus({ preventScroll: true });
        }
      }
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
    clearFieldError("selectedGameId");
    setPlayerFieldErrors({});
    setSubmitError(null);
    const game = activeGames.find((g) => g.id === gameId);
    const targetSize = getOfficialTeamSize(game?.title, game?.team_size);

    setEspPlayers((prev) => {
      // 1. Sync current player rows to session cache
      prev.forEach((p, idx) => {
        if (
          p.name ||
          p.inGameId ||
          p.institutionType ||
          p.institutionName ||
          p.courseOrClass ||
          p.currentYearOrClass
        ) {
          cachedPlayersRef.current[idx] = { ...p };
        }
      });

      // 2. Build exactly targetSize rows preserving valid positions (players 1..targetSize)
      const reconciled: PlayerRow[] = Array.from({ length: targetSize }, (_, i) => {
        if (prev[i]) {
          return { ...prev[i] };
        }
        if (cachedPlayersRef.current[i]) {
          return { ...cachedPlayersRef.current[i] };
        }
        return EMPTY_PLAYER_ROW();
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
    setPlayerFieldErrors((prev) => {
      const existing = prev[idx];
      if (!existing || !existing[field]) return prev;
      const updatedRow = { ...existing };
      delete updatedRow[field];
      return { ...prev, [idx]: updatedRow };
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
      body += `Contact Mobile: ${visPhone}\n`;
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
        body += `  Player ${i + 1}: ${p.name} (ID: ${p.inGameId}) · ${p.institutionType || "-"} · ${p.institutionName || "-"} · ${p.courseOrClass || "-"} · ${p.currentYearOrClass || "-"}\n`;
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

  const selectedGameAvailability = selectedGameId ? availabilityByGameId[selectedGameId] : undefined;
  const selectedGameClosedMsg = selectedGameAvailability
    ? getGameClosedDisplayMessage(selectedGameAvailability, portalClosedNotice)
    : portalClosedNotice;
  const selectedGameClosed = Boolean(
    selectedType === "esports" &&
      ((selectedGameAvailability && !selectedGameAvailability.is_effectively_open) ||
        portalClosedNotice)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot || submitLockRef.current || isSubmitting) return;

    const errors: Record<string, string> = {};
    let nextPlayerErrors: Record<number, PlayerFieldErrors> = {};
    let rosterErrorMsg: string | undefined;

    if (selectedType === "visitor") {
      const visValidationErrors = validateVisitorFormFields({
        categoryId: visCategoryId,
        fullName: visName,
        email: visEmail,
        phone: visPhone,
        studentClass: visStudentClass,
        designationOption: visDesignationOption,
        customDesignation: visCustomDesignation,
        institution: visInstitution,
      });
      Object.assign(errors, visValidationErrors);
    } else if (selectedType === "esports") {
      if (!selectedGameId) {
        errors.selectedGameId = "Please select a game for esports registration.";
      } else if (selectedGameClosed) {
        errors.selectedGameId =
          selectedGameClosedMsg || "Registrations for the selected game are currently closed.";
      }
      if (!isValidName(espTeamName, 100)) {
        errors.espTeamName = "Please enter your team name (at least 2 characters).";
      }
      if (!isValidName(espRep, 120)) {
        errors.espRep = "Please enter the team representative name.";
      }
      if (!isValidEmail(espEmail)) {
        errors.espEmail = "Please enter a valid representative email address.";
      }
      if (!isValidPhone(espPhone)) {
        errors.espPhone = "Please enter a valid 10–15 digit mobile number.";
      }
      if (!isValidInstitution(espInstitution, 150)) {
        errors.espInstitution = "Please enter your college or institution name.";
      }
      if (selectedGameId) {
        const selectedGame = activeGames.find((g) => g.id === selectedGameId);
        const gameTitle = selectedGame?.title || "Tournament Title";
        const expectedCount = getOfficialTeamSize(selectedGame?.title, selectedGame?.team_size);
        const rosterValidation = validateEsportsRosterWithEducation(
          gameTitle,
          espPlayers.slice(0, expectedCount)
        );
        if (!rosterValidation.isValid) {
          nextPlayerErrors = rosterValidation.playerErrors;
          rosterErrorMsg = rosterValidation.errorMessage;
        }
      }
      if (!espRulesAgreed) {
        errors.espRulesAgreed = "Please accept the tournament rules before submitting.";
      }
    }

    if (!privacyAgreed) {
      errors.privacyAgreed = "Please agree to the privacy notice before submitting.";
    }

    if (Object.keys(errors).length > 0 || Object.keys(nextPlayerErrors).length > 0 || rosterErrorMsg) {
      setFieldErrors(errors);
      setPlayerFieldErrors(nextPlayerErrors);
      const firstMsg = errors.selectedGameId || Object.values(errors)[0] || rosterErrorMsg;
      setSubmitError(firstMsg || "Please complete all required fields before submitting.");
      focusFirstInvalidControl();
      return;
    }

    setFieldErrors({});
    setPlayerFieldErrors({});
    submitLockRef.current = true;
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
        const cleanPhone = visPhone.trim();
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
          phone: cleanPhone,
          institution: cleanInstitution,
          visitorCategory: canonicalCategory,
          studentClass: cleanClass,
          designation: cleanDesignation,
          daysAttending: "Both",
          promoConsent: visPromoConsent,
        });

        const ticketRef = submissionRes.ticket?.ticket_ref || submissionRes.registrationRef;
        const qrToken = submissionRes.ticket?.qr_token;
        setRegisteredRef(ticketRef);
        setIssuedVisitorTicket(submissionRes.ticket || null);

        // Generate PDF ticket (with secure token when available) and archive best-effort
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

        setEmailNotice(
          "Your official visitor pass, QR code, and downloadable PDF ticket are ready above. Save or download your pass now to present at the venue gate on 20–21 November 2026."
        );
        setSubmitSuccess(true);
      } else if (selectedType === "esports") {
        if (!selectedGameId) {
          throw new Error("Please select a game for esports registration.");
        }
        if (selectedGameClosed) {
          throw new Error(
            selectedGameClosedMsg || "Registrations for the selected game are currently closed."
          );
        }
        const game = activeGames.find((g) => g.id === selectedGameId);
        const gameTitle = game?.title || "Tournament Title";
        const expectedCount = getOfficialTeamSize(game?.title, game?.team_size);

        const validation = validateEsportsRosterWithEducation(
          gameTitle,
          espPlayers.slice(0, expectedCount)
        );
        if (!validation.isValid) {
          setPlayerFieldErrors(validation.playerErrors);
          throw new Error(validation.errorMessage || `All ${expectedCount} players and their educational details are required.`);
        }

        const playersPayload = espPlayers.slice(0, expectedCount).map((p) => ({
          player_name: p.name.trim(),
          gamer_tag: p.inGameId.trim(),
          institution_type: p.institutionType,
          institution_name: p.institutionName.trim(),
          course_or_class: p.courseOrClass.trim(),
          current_year_or_class: p.currentYearOrClass.trim(),
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
      submitLockRef.current = false;
    }
  };



  return (
    <div className="w-full bg-[#F8F7FC] min-h-screen pb-20">
      {/* Header Band */}
      <div className="pt-8 sm:pt-12 pb-8 sm:pb-12 bg-white border-b border-[#EAEAF2] relative">
        <div className="max-w-3xl mx-auto px-4 sm:px-8 text-center">
          <span className="inline-block text-xs uppercase tracking-[0.2em] font-mono text-blue-600 font-bold mb-2">
            {content.eyebrow}
          </span>
          <h1 className="text-3xl sm:text-5xl font-display font-extrabold uppercase tracking-tight text-[#0F172A] mb-3">
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

      <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-8 sm:pt-10">
        {/* Step 1: Choose Option + Existing Pass Lookup CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
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
            className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-[#191936] bg-white hover:bg-[#D5F542] text-xs font-mono font-bold text-[#191936] shadow-[3px_3px_0px_#191936] transition-all cursor-pointer"
          >
            <Ticket className="w-4 h-4 text-[#4549D8] shrink-0" />
            <span>Already Registered? Find Pass</span>
          </button>
        </div>

        {/* Two Registration Cards (Visitor Pass & Esports) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-10">
          {content.cards.map((card) => {
            const isSelected = selectedType === card.id;

            return (
              <button
                key={card.id}
                type="button"
                aria-pressed={isSelected}
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
                className={`text-left p-5 rounded-2xl bg-white transition-all duration-200 relative flex flex-col justify-start gap-2 cursor-pointer ${
                  isSelected
                    ? "border-[3px] border-[#191936] shadow-[5px_5px_0px_#191936] -translate-y-0.5"
                    : "border border-[#EAEAF2] hover:border-[#191936]/40 hover:shadow-md"
                }`}
              >
                <div className="flex items-center justify-between gap-2 w-full mb-2">
                  <h3 className="font-heading text-xl sm:text-2xl font-black text-[#191936] uppercase m-0">
                    {card.title}
                  </h3>
                  {isSelected && (
                    <CheckCircle2 className="w-6 h-6 text-[#4549D8] shrink-0" />
                  )}
                </div>

                <p className="text-sm font-medium text-[#191936]/80 leading-relaxed m-0">
                  {card.line}
                </p>
              </button>
            );
          })}
        </div>

        {/* Step 2: Single-Column Form Panel */}
        <AnimatePresence mode="wait">
          {selectedType && (
            <motion.div
              key={selectedType}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              className="max-w-xl mx-auto bg-white rounded-2xl border-2 border-[#191936] shadow-[5px_5px_0px_#191936] p-5 sm:p-8"
            >
              {/* Form Title */}
              <div className="mb-6 pb-4 border-b border-[#EAEAF2]">
                <h2 className="font-heading text-2xl font-black uppercase text-[#191936] m-0">
                  {selectedType === "visitor" && "Visitor Registration"}
                  {selectedType === "esports" && "Esports Registration"}
                </h2>
                <p className="text-sm text-[#191936]/75 mt-1 mb-0">
                  Fields marked with * are required.
                </p>
              </div>

              {submitSuccess ? (
                <div className="py-2 space-y-5">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl border-2 border-[#191936] shrink-0 flex items-center justify-center text-[#191936] ${
                        selectedType === "visitor" ? "bg-[#D5F542]" : "bg-[#FFF3CD]"
                      }`}
                    >
                      {selectedType === "visitor" ? (
                        <CheckCircle2 className="w-6 h-6" />
                      ) : (
                        <Clock className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-heading text-xl sm:text-2xl font-black text-[#191936] uppercase tracking-tight m-0">
                        {selectedType === "visitor"
                          ? "Registration Complete"
                          : "Esports Application Submitted"}
                      </h3>
                      <p className="text-sm text-[#191936]/80 mt-1 m-0">
                        {selectedType === "visitor"
                          ? "Your visitor pass and QR code are ready below."
                          : "Pending coordinator approval. Your pass unlocks once approved."}
                      </p>
                    </div>
                  </div>

                  {/* Primary Registration / Ticket Reference & QR */}
                  {registeredRef && (
                    <div className="bg-[#0B1120] text-white border-2 border-[#191936] rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
                          Registration Reference
                        </span>
                        <span
                          className={`text-xs font-mono font-bold uppercase ${
                            selectedType === "visitor" ? "text-[#D5F542]" : "text-amber-300"
                          }`}
                        >
                          {selectedType === "visitor" ? "Active Pass" : "Pending Approval"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-mono text-xl sm:text-2xl font-black text-[#D5F542] tracking-wider select-all break-all">
                          {registeredRef}
                        </span>
                        <button
                          type="button"
                          onClick={copyRefToClipboard}
                          className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-slate-600 bg-slate-800 text-xs font-mono font-bold text-white hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <Copy className="w-4 h-4" />
                          <span>{copiedRef ? "Copied" : "Copy"}</span>
                        </button>
                      </div>

                      {/* Immediate Visitor QR Preview + Download Pass */}
                      {selectedType === "visitor" && (
                        <div className="pt-4 border-t border-slate-800 space-y-4 text-center">
                          <div className="bg-white rounded-2xl p-3 text-center border-2 border-cyan-400/70 mx-auto w-[184px]">
                            {visitorQrPreviewUrl ? (
                              <img
                                src={visitorQrPreviewUrl}
                                alt={`Visitor QR Code ${registeredRef}`}
                                className="w-40 h-40 mx-auto block"
                              />
                            ) : (
                              <div className="w-40 h-40 mx-auto flex items-center justify-center text-xs font-mono text-slate-500">
                                Loading QR...
                              </div>
                            )}
                          </div>

                          <div className="text-left text-xs text-slate-300 space-y-1">
                            <p className="font-bold text-white text-sm m-0">
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
                            {visInstitution.trim() && (
                              <p className="text-slate-400 m-0">{visInstitution.trim()}</p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 gap-2.5">
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
                              className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-[#D5F542] hover:bg-[#c6e830] text-sm font-mono font-black text-[#0B1120] cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                              <span>Download Pass</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setPassModalOpen(true)}
                              className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono font-bold text-white cursor-pointer"
                            >
                              <Eye className="w-4 h-4 text-cyan-300" />
                              <span>View Full Ticket</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Pending approval instructions for Esports */}
                      {selectedType === "esports" && (
                        <div className="pt-3 border-t border-slate-800 space-y-3">
                          <p className="text-xs text-slate-300 m-0">
                            Save your reference code to check coordinator approval status and download your squad pass once approved.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setLookupRef(registeredRef);
                              setLookupEmail(espEmail);
                              setLookupPhone(espPhone);
                              setLookupResult(null);
                              setLookupOpen(true);
                            }}
                            className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono font-bold text-cyan-300 cursor-pointer"
                          >
                            <Search className="w-4 h-4" />
                            <span>Check Pass Status</span>
                          </button>
                        </div>
                      )}

                      {emailNotice && (
                        <p className="text-xs text-slate-300 leading-relaxed border-t border-slate-800 pt-3 m-0">
                          {emailNotice}
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setSubmitSuccess(false);
                      setRegisteredRef(null);
                      setIssuedVisitorTicket(null);
                      setVisitorQrPreviewUrl("");
                      setEmailNotice(null);
                      setFieldErrors({});
                      setPlayerFieldErrors({});
                      setSubmitError(null);
                      setPrivacyAgreed(false);
                      if (selectedType === "visitor") {
                        setVisCategoryId(null);
                        setVisName("");
                        setVisEmail("");
                        setVisPhone("");
                        setVisStudentClass("");
                        setVisDesignationOption("");
                        setVisCustomDesignation("");
                        setVisInstitution("");
                        setVisPromoConsent(false);
                      } else if (selectedType === "esports") {
                        setEspTeamName("");
                        setEspRep("");
                        setEspEmail("");
                        setEspPhone("");
                        setEspInstitution("");
                        setEspRulesAgreed(false);
                        cachedPlayersRef.current = {};
                        const selectedGame = activeGames.find((g) => g.id === selectedGameId);
                        const expectedCount = getOfficialTeamSize(
                          selectedGame?.title,
                          selectedGame?.team_size
                        );
                        setEspPlayers(Array.from({ length: expectedCount }, () => EMPTY_PLAYER_ROW()));
                      }
                    }}
                    className="min-h-[48px] w-full inline-flex items-center justify-center px-5 rounded-xl border-2 border-[#191936] bg-white hover:bg-[#F0F2FD] text-sm font-mono font-bold text-[#191936] shadow-[3px_3px_0px_#191936] transition-all cursor-pointer"
                  >
                    {selectedType === "esports" ? "Register Next Team" : "Register Next Visitor"}
                  </button>
                </div>
              ) : (
                <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-6">
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
                          Visitor Category *
                        </label>
                        <div className="grid grid-cols-1 gap-3">
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
                                className={`text-left p-4 rounded-xl transition-all duration-150 flex items-center justify-between gap-3 min-h-[68px] cursor-pointer ${
                                  isSelected
                                    ? "bg-[#F0F2FD] border-2 border-[#191936] shadow-[3px_3px_0px_#191936]"
                                    : "bg-[#F8F7FC] border border-[#EAEAF2] hover:border-[#191936]/50 hover:bg-white"
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                                      isSelected
                                        ? "bg-[#4549D8] text-white border-[#191936]"
                                        : "bg-white text-[#4549D8] border-[#EAEAF2]"
                                    }`}
                                  >
                                    <IconComp className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="font-heading text-sm font-black uppercase tracking-tight text-[#191936] m-0">
                                      {card.title}
                                    </h3>
                                    <p className="text-xs text-[#191936]/75 leading-snug mt-0.5 mb-0">
                                      {card.shortDescription}
                                    </p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <CheckCircle2 className="w-5 h-5 text-[#4549D8] shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {fieldErrors.category && (
                          <p role="alert" className="text-sm font-medium text-red-600 mt-2">
                            {fieldErrors.category}
                          </p>
                        )}
                      </div>

                      {/* Common Mandatory Fields (Single-Column Mobile-First) */}
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label htmlFor="visitor-full-name" className="form-label">
                            Full Name *
                          </label>
                          <input
                            id="visitor-full-name"
                            name="full_name"
                            type="text"
                            autoComplete="name"
                            required
                            aria-invalid={Boolean(fieldErrors.fullName)}
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
                            <p role="alert" className="text-sm font-medium text-red-600 mt-1">
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
                            inputMode="email"
                            autoCapitalize="none"
                            autoComplete="email"
                            required
                            aria-invalid={Boolean(fieldErrors.email)}
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
                            <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                              {fieldErrors.email}
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="visitor-phone" className="form-label">
                            Contact Mobile Number *
                          </label>
                          <input
                            id="visitor-phone"
                            name="phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            required
                            aria-invalid={Boolean(fieldErrors.phone)}
                            maxLength={20}
                            value={visPhone}
                            onChange={(e) => {
                              setVisPhone(e.target.value);
                              clearFieldError("phone");
                            }}
                            placeholder="10-digit mobile number"
                            className={`form-input ${fieldErrors.phone ? "!border-red-500" : ""}`}
                          />
                          <p className="text-xs text-[#191936]/70 mt-1 mb-0">
                            Used only for event check-in coordination or important event-day updates. Younger students may provide a parent or guardian mobile number.
                          </p>
                          {fieldErrors.phone && (
                            <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                              {fieldErrors.phone}
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
                                aria-invalid={Boolean(fieldErrors.studentClass)}
                                maxLength={120}
                                value={visStudentClass}
                                onChange={(e) => {
                                  setVisStudentClass(e.target.value);
                                  clearFieldError("studentClass");
                                }}
                                placeholder="e.g. II PUC Science, B.Sc., 10th Standard"
                                className={`form-input ${fieldErrors.studentClass ? "!border-red-500" : ""}`}
                              />
                              {fieldErrors.studentClass && (
                                <p role="alert" className="text-sm font-medium text-red-600 mt-1">
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
                                aria-invalid={Boolean(fieldErrors.institution)}
                                maxLength={150}
                                list="visitor-institutions-list"
                                value={visInstitution}
                                onChange={(e) => {
                                  setVisInstitution(e.target.value);
                                  clearFieldError("institution");
                                }}
                                placeholder="Enter your school or college name"
                                className={`form-input ${fieldErrors.institution ? "!border-red-500" : ""}`}
                              />
                              {fieldErrors.institution && (
                                <p role="alert" className="text-sm font-medium text-red-600 mt-1">
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
                                aria-invalid={Boolean(fieldErrors.designationOption)}
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
                                <p role="alert" className="text-sm font-medium text-red-600 mt-1">
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
                                aria-invalid={Boolean(fieldErrors.institution)}
                                maxLength={150}
                                list="visitor-institutions-list"
                                value={visInstitution}
                                onChange={(e) => {
                                  setVisInstitution(e.target.value);
                                  clearFieldError("institution");
                                }}
                                placeholder="Enter your school or college name"
                                className={`form-input ${fieldErrors.institution ? "!border-red-500" : ""}`}
                              />
                              {fieldErrors.institution && (
                                <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                                  {fieldErrors.institution}
                                </p>
                              )}
                            </div>

                            {visDesignationOption === "Other" && (
                              <div>
                                <label htmlFor="visitor-custom-designation" className="form-label">
                                  Specify Designation / Role *
                                </label>
                                <input
                                  id="visitor-custom-designation"
                                  name="custom_designation"
                                  type="text"
                                  required
                                  aria-invalid={Boolean(fieldErrors.customDesignation)}
                                  maxLength={120}
                                  value={visCustomDesignation}
                                  onChange={(e) => {
                                    setVisCustomDesignation(e.target.value);
                                    clearFieldError("customDesignation");
                                  }}
                                  placeholder="e.g. Research Coordinator, Dean"
                                  className={`form-input ${fieldErrors.customDesignation ? "!border-red-500" : ""}`}
                                />
                                {fieldErrors.customDesignation && (
                                  <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                                    {fieldErrors.customDesignation}
                                  </p>
                                )}
                              </div>
                            )}
                          </>
                        )}

                        {/* Conditional: GENERAL VISITOR */}
                        {visCategoryId === "general" && (
                          <div>
                            <label htmlFor="visitor-institution" className="form-label">
                              College / Institution Name (Optional)
                            </label>
                            <input
                              id="visitor-institution"
                              name="institution"
                              type="text"
                              aria-invalid={Boolean(fieldErrors.institution)}
                              maxLength={150}
                              list="visitor-institutions-list"
                              value={visInstitution}
                              onChange={(e) => {
                                setVisInstitution(e.target.value);
                                clearFieldError("institution");
                              }}
                              placeholder="Optional affiliation"
                              className={`form-input ${fieldErrors.institution ? "!border-red-500" : ""}`}
                            />
                            {fieldErrors.institution && (
                              <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                                {fieldErrors.institution}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {!visCategoryId && (
                        <div className="p-3.5 rounded-xl bg-[#F8F7FC] border border-[#EAEAF2] text-sm text-[#191936]/75">
                          Choose a visitor category above to complete your registration.
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
                      {selectedGameClosed && selectedGameClosedMsg && (
                        <div
                          role="alert"
                          className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 flex items-start gap-3 text-xs sm:text-sm"
                        >
                          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="block font-bold uppercase tracking-tight text-rose-900 mb-0.5">
                              {activeGames.find((g) => g.id === selectedGameId)?.title || "Game"} Registration Closed
                            </strong>
                            <span>{selectedGameClosedMsg}</span>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label htmlFor="esp-team-name" className="form-label">Team Name *</label>
                          <input
                            id="esp-team-name"
                            type="text"
                            required
                            aria-invalid={Boolean(fieldErrors.espTeamName)}
                            value={espTeamName}
                            onChange={(e) => {
                              setEspTeamName(e.target.value);
                              clearFieldError("espTeamName");
                            }}
                            placeholder="e.g. Supernova Strikers"
                            className={`form-input ${fieldErrors.espTeamName ? "!border-red-500" : ""}`}
                          />
                          {fieldErrors.espTeamName && (
                            <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                              {fieldErrors.espTeamName}
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="esp-game-select" className="form-label">Game Title *</label>
                          <select
                            id="esp-game-select"
                            aria-invalid={Boolean(fieldErrors.selectedGameId)}
                            value={selectedGameId}
                            onChange={(e) => handleGameChange(e.target.value)}
                            className={`form-input ${fieldErrors.selectedGameId ? "!border-red-500" : ""}`}
                          >
                            {activeGames.length > 0 ? (
                              activeGames.map((game) => {
                                const avail = availabilityByGameId[game.id];
                                const isClosed = avail ? !avail.is_effectively_open : false;
                                return (
                                  <option key={game.id} value={game.id}>
                                    {game.title} ({getOfficialTeamSize(game.title, game.team_size)} players)
                                    {isClosed ? " — [CLOSED]" : ""}
                                  </option>
                                );
                              })
                            ) : (
                              <option value="">Loading official games...</option>
                            )}
                          </select>
                          {fieldErrors.selectedGameId && (
                            <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                              {fieldErrors.selectedGameId}
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="esp-rep-name" className="form-label">Team Representative *</label>
                          <input
                            id="esp-rep-name"
                            type="text"
                            autoComplete="name"
                            required
                            aria-invalid={Boolean(fieldErrors.espRep)}
                            value={espRep}
                            onChange={(e) => {
                              setEspRep(e.target.value);
                              clearFieldError("espRep");
                            }}
                            placeholder="Captain or Manager name"
                            className={`form-input ${fieldErrors.espRep ? "!border-red-500" : ""}`}
                          />
                          {fieldErrors.espRep && (
                            <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                              {fieldErrors.espRep}
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="esp-rep-email" className="form-label">Representative Email *</label>
                          <input
                            id="esp-rep-email"
                            type="email"
                            inputMode="email"
                            autoCapitalize="none"
                            autoComplete="email"
                            required
                            aria-invalid={Boolean(fieldErrors.espEmail)}
                            value={espEmail}
                            onChange={(e) => {
                              setEspEmail(e.target.value);
                              clearFieldError("espEmail");
                            }}
                            placeholder="rep@example.com"
                            className={`form-input ${fieldErrors.espEmail ? "!border-red-500" : ""}`}
                          />
                          {fieldErrors.espEmail && (
                            <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                              {fieldErrors.espEmail}
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="esp-rep-phone" className="form-label">Representative Phone *</label>
                          <input
                            id="esp-rep-phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            required
                            aria-invalid={Boolean(fieldErrors.espPhone)}
                            value={espPhone}
                            onChange={(e) => {
                              setEspPhone(e.target.value);
                              clearFieldError("espPhone");
                            }}
                            placeholder="10-digit mobile number"
                            className={`form-input ${fieldErrors.espPhone ? "!border-red-500" : ""}`}
                          />
                          {fieldErrors.espPhone && (
                            <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                              {fieldErrors.espPhone}
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="esp-institution" className="form-label">Team Institution / College *</label>
                          <input
                            id="esp-institution"
                            type="text"
                            required
                            aria-invalid={Boolean(fieldErrors.espInstitution)}
                            list="visitor-institutions-list"
                            value={espInstitution}
                            onChange={(e) => {
                              setEspInstitution(e.target.value);
                              clearFieldError("espInstitution");
                            }}
                            placeholder="Primary college or institution name"
                            className={`form-input ${fieldErrors.espInstitution ? "!border-red-500" : ""}`}
                          />
                          {fieldErrors.espInstitution && (
                            <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                              {fieldErrors.espInstitution}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Player Rows: Official Team Sizes + Mandatory 4 Educational Fields Per Player */}
                      <div className="pt-4 border-t border-[#EAEAF2]">
                        <div className="mb-3 space-y-1">
                          <label className="form-label font-bold text-base mb-0">
                            Team Players ({espPlayers.length} /{" "}
                            {getOfficialTeamSize(
                              activeGames.find((g) => g.id === selectedGameId)?.title,
                              activeGames.find((g) => g.id === selectedGameId)?.team_size
                            )}{" "}
                            Required) *
                          </label>
                          <p className="text-xs text-[#191936]/70 m-0">
                            Full name, In-Game ID, and all 4 educational details are required for every player.
                          </p>
                        </div>

                        <div className="space-y-4">
                          {espPlayers.map((player, idx) => {
                            const rowErr = playerFieldErrors[idx] || {};
                            const eduSug = getEducationSuggestionsForType(player.institutionType);
                            return (
                              <div
                                key={idx}
                                data-player-card={idx + 1}
                                className="p-4 rounded-2xl bg-[#F8F7FC] border border-[#EAEAF2] space-y-3.5"
                              >
                                <div className="flex items-center justify-between gap-2 border-b border-[#EAEAF2] pb-2">
                                  <span className="font-mono text-xs font-bold text-[#191936]">
                                    Player #{idx + 1} {idx === 0 ? "· Squad Lead" : ""}
                                  </span>
                                  <span className="text-xs font-medium text-[#191936]/65">
                                    All fields required *
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 gap-3.5">
                                  <div>
                                    <label htmlFor={`player-${idx}-name`} className="block text-sm font-bold text-[#191936] mb-1">
                                      Player {idx + 1} Full Name *
                                    </label>
                                    <input
                                      id={`player-${idx}-name`}
                                      type="text"
                                      required
                                      aria-invalid={Boolean(rowErr.name)}
                                      value={player.name}
                                      onChange={(e) => handlePlayerChange(idx, "name", e.target.value)}
                                      placeholder={`Player ${idx + 1} Full Name`}
                                      className={`form-input w-full ${rowErr.name ? "!border-red-500" : ""}`}
                                    />
                                    {rowErr.name && (
                                      <p role="alert" className="text-xs font-medium text-red-600 mt-1 m-0">
                                        {rowErr.name}
                                      </p>
                                    )}
                                  </div>

                                  <div>
                                    <label htmlFor={`player-${idx}-ign`} className="block text-sm font-bold text-[#191936] mb-1">
                                      Player {idx + 1} In-Game ID / Tag *
                                    </label>
                                    <input
                                      id={`player-${idx}-ign`}
                                      type="text"
                                      required
                                      aria-invalid={Boolean(rowErr.inGameId)}
                                      value={player.inGameId}
                                      onChange={(e) => handlePlayerChange(idx, "inGameId", e.target.value)}
                                      placeholder={`Player ${idx + 1} In-Game Tag/ID`}
                                      className={`form-input w-full font-mono ${rowErr.inGameId ? "!border-red-500" : ""}`}
                                    />
                                    {rowErr.inGameId && (
                                      <p role="alert" className="text-xs font-medium text-red-600 mt-1 m-0">
                                        {rowErr.inGameId}
                                      </p>
                                    )}
                                  </div>

                                  <div>
                                    <label htmlFor={`player-${idx}-inst-type`} className="block text-sm font-bold text-[#191936] mb-1">
                                      Institution Type *
                                    </label>
                                    <select
                                      id={`player-${idx}-inst-type`}
                                      required
                                      aria-invalid={Boolean(rowErr.institutionType)}
                                      value={player.institutionType}
                                      onChange={(e) =>
                                        handlePlayerChange(idx, "institutionType", e.target.value)
                                      }
                                      className={`form-input w-full bg-white ${rowErr.institutionType ? "!border-red-500" : ""}`}
                                    >
                                      <option value="">Select School / College / Other...</option>
                                      {PLAYER_INSTITUTION_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                          {t}
                                        </option>
                                      ))}
                                    </select>
                                    {rowErr.institutionType && (
                                      <p role="alert" className="text-xs font-medium text-red-600 mt-1 m-0">
                                        {rowErr.institutionType}
                                      </p>
                                    )}
                                  </div>

                                  <div>
                                    <label htmlFor={`player-${idx}-inst-name`} className="block text-sm font-bold text-[#191936] mb-1">
                                      School / College / Institution Name *
                                    </label>
                                    <input
                                      id={`player-${idx}-inst-name`}
                                      type="text"
                                      required
                                      aria-invalid={Boolean(rowErr.institutionName)}
                                      maxLength={150}
                                      list="visitor-institutions-list"
                                      value={player.institutionName}
                                      onChange={(e) =>
                                        handlePlayerChange(idx, "institutionName", e.target.value)
                                      }
                                      placeholder="Full school, college or institution name"
                                      className={`form-input w-full ${rowErr.institutionName ? "!border-red-500" : ""}`}
                                    />
                                    {rowErr.institutionName && (
                                      <p role="alert" className="text-xs font-medium text-red-600 mt-1 m-0">
                                        {rowErr.institutionName}
                                      </p>
                                    )}
                                  </div>

                                  <div>
                                    <label htmlFor={`player-${idx}-course`} className="block text-sm font-bold text-[#191936] mb-1">
                                      {eduSug.courseLabel}
                                    </label>
                                    <input
                                      id={`player-${idx}-course`}
                                      type="text"
                                      required
                                      aria-invalid={Boolean(rowErr.courseOrClass)}
                                      maxLength={100}
                                      list={`sn3-player-course-${idx}`}
                                      value={player.courseOrClass}
                                      onChange={(e) =>
                                        handlePlayerChange(idx, "courseOrClass", e.target.value)
                                      }
                                      placeholder={eduSug.coursePlaceholder}
                                      className={`form-input w-full ${rowErr.courseOrClass ? "!border-red-500" : ""}`}
                                    />
                                    <datalist id={`sn3-player-course-${idx}`}>
                                      {eduSug.courseSuggestions.map((s) => (
                                        <option key={s} value={s} />
                                      ))}
                                    </datalist>
                                    {rowErr.courseOrClass && (
                                      <p role="alert" className="text-xs font-medium text-red-600 mt-1 m-0">
                                        {rowErr.courseOrClass}
                                      </p>
                                    )}
                                  </div>

                                  <div>
                                    <label htmlFor={`player-${idx}-year`} className="block text-sm font-bold text-[#191936] mb-1">
                                      {eduSug.yearLabel}
                                    </label>
                                    <input
                                      id={`player-${idx}-year`}
                                      type="text"
                                      required
                                      aria-invalid={Boolean(rowErr.currentYearOrClass)}
                                      maxLength={80}
                                      list={`sn3-player-year-${idx}`}
                                      value={player.currentYearOrClass}
                                      onChange={(e) =>
                                        handlePlayerChange(idx, "currentYearOrClass", e.target.value)
                                      }
                                      placeholder={eduSug.yearPlaceholder}
                                      className={`form-input w-full ${rowErr.currentYearOrClass ? "!border-red-500" : ""}`}
                                    />
                                    <datalist id={`sn3-player-year-${idx}`}>
                                      {eduSug.yearSuggestions.map((s) => (
                                        <option key={s} value={s} />
                                      ))}
                                    </datalist>
                                    {rowErr.currentYearOrClass && (
                                      <p role="alert" className="text-xs font-medium text-red-600 mt-1 m-0">
                                        {rowErr.currentYearOrClass}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Rules Checkbox */}
                      <div className="pt-2">
                        <label className="flex items-start gap-3 cursor-pointer text-sm text-[#191936] min-h-[44px]">
                          <input
                            type="checkbox"
                            required
                            aria-invalid={Boolean(fieldErrors.espRulesAgreed)}
                            checked={espRulesAgreed}
                            onChange={(e) => {
                              setEspRulesAgreed(e.target.checked);
                              clearFieldError("espRulesAgreed");
                            }}
                            className="w-5 h-5 mt-0.5 rounded border-gray-300 text-[#4549D8] shrink-0"
                          />
                          <span>{content.rulesCheckboxLabel}</span>
                        </label>
                        {fieldErrors.espRulesAgreed && (
                          <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                            {fieldErrors.espRulesAgreed}
                          </p>
                        )}
                      </div>

                      <datalist id="visitor-institutions-list">
                        {SUGGESTED_INSTITUTIONS.map((inst) => (
                          <option key={inst} value={inst} />
                        ))}
                      </datalist>
                    </div>
                  )}

                  {/* Common Privacy Policy & Optional Updates Checkboxes */}
                  <div className="pt-2 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer text-sm text-[#191936] min-h-[44px]">
                      <input
                        type="checkbox"
                        required
                        aria-invalid={Boolean(fieldErrors.privacyAgreed)}
                        checked={privacyAgreed}
                        onChange={(e) => {
                          setPrivacyAgreed(e.target.checked);
                          clearFieldError("privacyAgreed");
                        }}
                        className="w-5 h-5 mt-0.5 rounded border-gray-300 text-[#4549D8] shrink-0"
                      />
                      <span>{content.privacyCheckboxLabel}</span>
                    </label>
                    {fieldErrors.privacyAgreed && (
                      <p role="alert" className="text-sm font-medium text-red-600 mt-1">
                        {fieldErrors.privacyAgreed}
                      </p>
                    )}

                    {selectedType === "visitor" && (
                      <label
                        htmlFor="visitor-promo-consent"
                        className="flex items-start gap-3 cursor-pointer text-xs sm:text-sm text-[#191936]/80 min-h-[44px]"
                      >
                        <input
                          id="visitor-promo-consent"
                          type="checkbox"
                          checked={visPromoConsent}
                          onChange={(e) => setVisPromoConsent(e.target.checked)}
                          className="w-5 h-5 mt-0.5 rounded border-gray-300 text-[#4549D8] shrink-0"
                        />
                        <span>
                          Optional: Send me updates about future college fest events and institutional programs.
                        </span>
                      </label>
                    )}
                  </div>

                  {/* Error Message */}
                  {submitError && (
                    <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
                      {submitError}
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="pt-2 flex flex-col gap-3">
                    <button
                      type="submit"
                      disabled={isSubmitting || selectedGameClosed}
                      className="btn-primary w-full justify-center text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {selectedGameClosed
                        ? "Registrations Closed for Selected Game"
                        : isSubmitting
                        ? "Submitting..."
                        : "Submit Registration"}
                    </button>

                    {!selectedGameClosed && (
                      <a
                        href={generateMailtoUrl()}
                        className="text-center text-xs font-semibold text-[#4549D8] hover:underline py-2"
                      >
                        Or submit via email client →
                      </a>
                    )}
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
