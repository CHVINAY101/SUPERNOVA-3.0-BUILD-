import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SITE_CONTENT } from "../content/site";
import { CheckCircle2, Copy, GraduationCap, Building2, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getOfficialTeamSize, validateEsportsRoster } from "@/utils/esportsRules";
import { 
  unifyAndLinkVisitor, 
  generateTicketReference, 
  sendRegistrationConfirmationEmail 
} from "@/lib/registrationOperations";
import { generateTicketPdf, downloadTicketPdfFile } from "@/lib/ticketPdfService";
import { archiveTicketToNas } from "@/lib/nasArchivalService";
import { Download } from "lucide-react";

type FormType = "participation" | "visitor" | "esports" | null;

interface PlayerRow {
  name: string;
  inGameId: string;
}

interface GameOption {
  id: string;
  title: string;
  team_size: number;
}

export const RegisterPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const content = SITE_CONTENT.registerPage;
  const meta = SITE_CONTENT.meta;
  const experiences = SITE_CONTENT.experiences.items;

  // Read URL query parameter: ?type=participation|visitor|esports
  const initialType = searchParams.get("type") as FormType;
  const [selectedType, setSelectedType] = useState<FormType>(
    initialType === "participation" || initialType === "visitor" || initialType === "esports"
      ? initialType
      : null
  );

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

  // Participation Form State
  const [partInstitution, setPartInstitution] = useState("");
  const [partContactPerson, setPartContactPerson] = useState("");
  const [partEmail, setPartEmail] = useState("");
  const [partPhone, setPartPhone] = useState("");
  const [partExperience, setPartExperience] = useState(experiences[0]?.title || "");
  const [partTitle, setPartTitle] = useState("");
  const [partDesc, setPartDesc] = useState("");
  const [partCount, setPartCount] = useState("1");

  // Visitor Form State
  const [visCategory, setVisCategory] = useState<"Student" | "General Visitor" | "Faculty / Staff">("Student");
  const [visName, setVisName] = useState("");
  const [visEmail, setVisEmail] = useState("");
  const [visPhone, setVisPhone] = useState("");
  
  // Student-specific fields
  const [visStudentClass, setVisStudentClass] = useState("10th Standard");
  const [visInstitutionSelect, setVisInstitutionSelect] = useState("The National College, Basavanagudi");
  const [visInstitutionOther, setVisInstitutionOther] = useState("");
  const [visStudentId, setVisStudentId] = useState("");
  const [visEsportsInterest, setVisEsportsInterest] = useState<boolean>(false);
  const [visPreferredGame, setVisPreferredGame] = useState<"VALORANT" | "BGMI" | "Free Fire">("VALORANT");
  const [visEsportsIntent, setVisEsportsIntent] = useState<"spectator" | "competing">("spectator");
  const [visInGameId, setVisInGameId] = useState("");
  const [visTeamName, setVisTeamName] = useState("");
  const [visCompetitionNotes, setVisCompetitionNotes] = useState("");

  // Faculty / Staff specific fields
  const [visDesignation, setVisDesignation] = useState("");

  // General Visitor specific fields
  const [visOrg, setVisOrg] = useState("");

  // Common visitor attendance
  const [visDays, setVisDays] = useState("Both");

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
  const [linkedVisitorTicket, setLinkedVisitorTicket] = useState<string | null>(null);
  const [squadRosterTickets, setSquadRosterTickets] = useState<{ name: string; tag?: string; ticket: string }[]>([]);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  // Generate Mailto fallback URL if needed
  const generateMailtoUrl = () => {
    const subject = encodeURIComponent(`SUPERNOVA 3.0 Registration — ${selectedType?.toUpperCase()}`);
    let body = `SUPERNOVA 3.0 REGISTRATION DETAILS\n\nRegistration Type: ${selectedType}\n`;

    if (selectedType === "participation") {
      body += `Institution: ${partInstitution}\n`;
      body += `Contact Person: ${partContactPerson}\n`;
      body += `Email: ${partEmail}\n`;
      body += `Phone: ${partPhone}\n`;
      body += `Experience Area: ${partExperience}\n`;
      body += `Project Title: ${partTitle}\n`;
      body += `Description: ${partDesc}\n`;
      body += `Number of Participants: ${partCount}\n`;
    } else if (selectedType === "visitor") {
      body += `Full Name: ${visName}\n`;
      body += `Email: ${visEmail}\n`;
      body += `Phone: ${visPhone}\n`;
      body += `Visitor Category: ${visCategory}\n`;
      if (visCategory === "Student") {
        body += `Class / Standard: ${visStudentClass}\n`;
        body += `School/College: ${visInstitutionSelect === "Other" ? visInstitutionOther : visInstitutionSelect}\n`;
        body += `Student Roll No / ID: ${visStudentId}\n`;
        body += `Esports Interest: ${visEsportsInterest ? "Yes" : "No"}\n`;
        if (visEsportsInterest) {
          body += `Preferred Game: ${visPreferredGame}\n`;
          body += `Participation Intent: ${visEsportsIntent}\n`;
          if (visEsportsIntent === "competing") {
            body += `In-Game ID: ${visInGameId}\n`;
            if (visTeamName) body += `Team Name: ${visTeamName}\n`;
            if (visCompetitionNotes) body += `Competition Notes: ${visCompetitionNotes}\n`;
          }
        }
      } else if (visCategory === "Faculty / Staff") {
        body += `Institution: ${visInstitutionSelect === "Other" ? visInstitutionOther : visInstitutionSelect}\n`;
        body += `Designation / Department: ${visDesignation}\n`;
      } else {
        body += `Organisation / Workplace: ${visOrg || "General"}\n`;
      }
      body += `Days Attending: ${visDays}\n`;
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

    if (!privacyAgreed) {
      alert("Please agree to the privacy notice before submitting.");
      return;
    }

    if (selectedType === "esports" && !espRulesAgreed) {
      alert("Please accept the tournament rules before submitting.");
      return;
    }

    // Conditional Validation for Visitor
    if (selectedType === "visitor") {
      if (!visName.trim() || visName.trim().length < 2) {
        alert("Please enter your full name.");
        return;
      }
      if (!visEmail.trim() || !visEmail.includes("@")) {
        alert("Please enter a valid email address.");
        return;
      }
      if (!visPhone.trim() || visPhone.trim().length < 10) {
        alert("Please enter a valid 10-digit mobile number.");
        return;
      }

      if (visCategory === "Student") {
        if (!visStudentClass) {
          alert("Please select your class/standard.");
          return;
        }
        if (visInstitutionSelect === "Other" && !visInstitutionOther.trim()) {
          alert("Please enter your school or college name.");
          return;
        }
        if (!visStudentId.trim()) {
          alert("Please enter your student roll number or student ID.");
          return;
        }
        if (visEsportsInterest && visEsportsIntent === "competing" && !visInGameId.trim()) {
          alert("Please enter your in-game player ID for tournament registration.");
          return;
        }
      } else if (visCategory === "Faculty / Staff") {
        if (visInstitutionSelect === "Other" && !visInstitutionOther.trim()) {
          alert("Please enter your institution name.");
          return;
        }
        if (!visDesignation.trim()) {
          alert("Please enter your designation or department.");
          return;
        }
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setLinkedVisitorTicket(null);
    setSquadRosterTickets([]);
    setEmailNotice(null);

    try {
      if (selectedType === "visitor") {
        const effectiveInstitution =
          visCategory === "Student" || visCategory === "Faculty / Staff"
            ? (visInstitutionSelect === "Other" ? visInstitutionOther.trim() : visInstitutionSelect.trim())
            : (visOrg.trim() || "General Visitor");

        let refStr = "";
        let visitorRecordId = "";

        // Attempt submit_visitor_registration_v2 with complete conditional fields
        const { data: v2Data, error: v2Error } = await supabase.rpc("submit_visitor_registration_v2", {
          p_full_name: visName.trim(),
          p_email: visEmail.trim().toLowerCase(),
          p_phone: visPhone.trim(),
          p_institution: effectiveInstitution,
          p_visitor_category: visCategory,
          p_student_class: visCategory === "Student" ? visStudentClass : null,
          p_student_id: visCategory === "Student" ? visStudentId.trim() : null,
          p_designation: visCategory === "Faculty / Staff" ? visDesignation.trim() : null,
          p_esports_interest: visCategory === "Student" ? visEsportsInterest : false,
          p_preferred_game: visCategory === "Student" && visEsportsInterest ? visPreferredGame : null,
          p_esports_intent: visCategory === "Student" && visEsportsInterest ? visEsportsIntent : null,
          p_in_game_id: visCategory === "Student" && visEsportsInterest && visEsportsIntent === "competing" ? visInGameId.trim() : null,
          p_team_name: visCategory === "Student" && visEsportsInterest && visEsportsIntent === "competing" ? visTeamName.trim() : null,
          p_competition_notes: visCategory === "Student" && visEsportsInterest && visEsportsIntent === "competing" ? visCompetitionNotes.trim() : null,
          p_days_attending: visDays,
          p_consent: true,
          p_website: "",
        });

        if (!v2Error && v2Data) {
          refStr = typeof v2Data === "string" ? v2Data : String(v2Data);
        } else {
          // If v2 is not yet deployed, fallback gracefully to base submit_visitor_registration
          let fallbackCat = "General visitor";
          if (visCategory === "Student") {
            fallbackCat = (visStudentClass.includes("PUC") || visStudentClass.includes("Degree"))
              ? "College student"
              : "School student";
          } else if (visCategory === "Faculty / Staff") {
            fallbackCat = "Teacher or educator";
          }

          const { data: fallbackData, error: fallbackError } = await supabase.rpc("submit_visitor_registration", {
            p_full_name: visName.trim(),
            p_email: visEmail.trim().toLowerCase(),
            p_phone: visPhone.trim(),
            p_institution: effectiveInstitution,
            p_visitor_category: fallbackCat,
            p_consent: true,
            p_website: "",
          });

          if (fallbackError) throw fallbackError;
          refStr = typeof fallbackData === "string" ? fallbackData : "SN3-26-REG";
        }

        setRegisteredRef(refStr);
        setLinkedVisitorTicket(refStr);

        // Generate digital ticket PDF and archive to NAS immediately
        try {
          const ticketRes = await generateTicketPdf({
            ticketRef: refStr,
            recipientName: visName.trim(),
            category: visCategory,
            email: visEmail.trim().toLowerCase(),
            phone: visPhone.trim(),
            institution: effectiveInstitution,
            registrationType: "visitor",
            daysAttending: visDays,
          });

          await archiveTicketToNas(ticketRes, {
            ticketRef: refStr,
            recipientName: visName.trim(),
            category: visCategory,
            email: visEmail.trim().toLowerCase(),
            phone: visPhone.trim(),
            institution: effectiveInstitution,
            registrationType: "visitor",
            daysAttending: visDays,
          });
        } catch (nasErr) {
          console.warn("NAS archival / PDF creation notice:", nasErr);
        }

        // 3. Confirm that ID / record exists in the database and trigger visitor confirmation email
        try {
          const { data: createdRecord } = await supabase
            .from("visitor_registrations")
            .select("id")
            .eq("registration_ref", refStr)
            .limit(1)
            .maybeSingle();

          if (createdRecord?.id) {
            visitorRecordId = createdRecord.id;
          }
        } catch {
          // RLS query fallback
        }

        // Trigger visitor confirmation email with full payload and error logging
        try {
          const emailRes = await sendRegistrationConfirmationEmail(
            visitorRecordId || refStr,
            "visitor",
            false,
            {
              recipientEmail: visEmail.trim().toLowerCase(),
              recipientName: visName.trim(),
              registrationRef: refStr,
              institution: effectiveInstitution,
              extraDetails: {
                category: visCategory,
                days: visDays,
              },
            }
          );

          if (!emailRes.ok) {
            console.error("Visitor confirmation email failure:", emailRes.error);
          }
        } catch (emailErr) {
          console.error("Direct visitor email dispatch exception:", emailErr);
        }

        setEmailNotice("An official confirmation email with your printable ticket pass has been dispatched to your email address.");
        setSubmitSuccess(true);
      } else if (selectedType === "esports") {
        if (!selectedGameId) {
          throw new Error("Please select a game for esports registration.");
        }
        const game = activeGames.find((g) => g.id === selectedGameId);
        const gameTitle = game?.title || "Tournament Title";
        const expectedCount = getOfficialTeamSize(game?.title, game?.team_size);

        // Multi-level frontend and submission handler validation
        const validation = validateEsportsRoster(gameTitle, espPlayers.slice(0, expectedCount));
        if (!validation.isValid) {
          throw new Error(validation.errorMessage || `All ${expectedCount} players are required.`);
        }

        // Construct payload using strictly the permitted number of players
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

        // Auto-create/link visitor record for captain (deduplicated)
        const capLink = await unifyAndLinkVisitor({
          name: espRep.trim(),
          email: espEmail.trim().toLowerCase(),
          phone: espPhone.trim(),
          institution: espInstitution.trim(),
          source: "esports_captain",
          linkedRef: refStr,
          category: "Esports Player",
          esportsInterest: true,
          preferredGame: gameTitle,
          teamName: espTeamName.trim(),
        });
        setLinkedVisitorTicket(capLink.ticketRef);

        // Auto-create/link visitor tickets for all squad players
        const rosterTickets: { name: string; tag?: string; ticket: string }[] = [];
        for (let i = 0; i < playersPayload.length; i++) {
          const player = playersPayload[i];
          const playerTicket = `${refStr}-P${i + 1}`;
          await unifyAndLinkVisitor({
            name: player.player_name,
            email: `${refStr.toLowerCase()}_p${i + 1}@esports.supernova`,
            phone: espPhone.trim(),
            institution: espInstitution.trim(),
            source: "esports_player",
            linkedRef: refStr,
            category: "Esports Player",
            esportsInterest: true,
            preferredGame: gameTitle,
            inGameId: player.gamer_tag,
            teamName: espTeamName.trim(),
          });
          rosterTickets.push({
            name: player.player_name,
            tag: player.gamer_tag,
            ticket: playerTicket,
          });
        }
        setSquadRosterTickets(rosterTickets);

        // Email rule: Do not send email immediately! Send only after admin approves.
        setEmailNotice(
          "Your esports squad registration has been logged for tournament bracket verification. Once an administrator approves your team, the captain will receive an email confirmation with full squad entry credentials."
        );
        setSubmitSuccess(true);
      } else if (selectedType === "participation") {
        let partRef = "";

        // Attempt RPC first
        const { data, error } = await supabase.rpc("submit_participation_registration", {
          p_full_name: partContactPerson.trim(),
          p_email: partEmail.trim().toLowerCase(),
          p_phone: partPhone.trim(),
          p_institution: partInstitution.trim(),
          p_category: "Innovator",
          p_area: partExperience,
          p_project_title: partTitle.trim(),
          p_project_description: partDesc.trim(),
          p_team_size: parseInt(partCount, 10) || 1,
          p_consent: true,
          p_website: "",
        });

        if (!error && data) {
          partRef = typeof data === "string" ? data : String(data);
        } else {
          // Direct fallback insert if RPC not present in schema cache
          partRef = generateTicketReference("SN3-26");
          const { error: insertErr } = await supabase.from("participation_registrations").insert({
            registration_ref: partRef,
            full_name: partContactPerson.trim(),
            email: partEmail.trim().toLowerCase(),
            phone: partPhone.trim(),
            institution: partInstitution.trim(),
            participant_category: "Innovator",
            participation_area: partExperience,
            project_title: partTitle.trim(),
            project_description: partDesc.trim(),
            team_members_count: parseInt(partCount, 10) || 1,
            status: "pending",
          });

          if (insertErr) {
            console.warn("Direct insert warning:", insertErr);
          }
        }

        setRegisteredRef(partRef);

        // Auto-create/link visitor record for participant (deduplicated)
        const partLink = await unifyAndLinkVisitor({
          name: partContactPerson.trim(),
          email: partEmail.trim().toLowerCase(),
          phone: partPhone.trim(),
          institution: partInstitution.trim(),
          source: "participation",
          linkedRef: partRef,
          category: "Project Participant",
        });
        setLinkedVisitorTicket(partLink.ticketRef);

        // Email rule: Do not send email immediately! Send only after admin approves.
        setEmailNotice(
          "Your project exhibit application has been submitted to the screening committee. Your official entry pass and confirmation email will be issued once approved by the event administrators."
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
        {/* Step 1: Choose Option */}
        <div className="text-center mb-8">
          <label className="text-base sm:text-lg font-bold text-[#191936]">
            {content.chooseLabel}
          </label>
        </div>

        {/* Three Cards (3 columns, 24px gaps, stacked on mobile) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {content.cards.map((card) => {
            const isSelected = selectedType === card.id;

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedType(card.id)}
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
                  {selectedType === "participation" && "Participation form"}
                  {selectedType === "visitor" && "Visitor form"}
                  {selectedType === "esports" && "Esports team form"}
                </h2>
                <p className="text-sm text-[#191936]/70 mt-1">
                  Please complete the details below. Required fields are marked with an asterisk (*).
                </p>
              </div>

              {submitSuccess ? (
                <div className="text-center py-8 space-y-5">
                  <div className="w-16 h-16 rounded-full bg-[#D5F542] border-2 border-[#191936] mx-auto flex items-center justify-center text-[#191936]">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-heading text-2xl sm:text-3xl font-black text-[#191936] uppercase tracking-tight">
                      {selectedType === "visitor" ? "Visitor Pass Issued" : "Registration Received"}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#191936]/80 max-w-md mx-auto mt-1">
                      {selectedType === "visitor"
                        ? "Your entry badge credentials have been generated and dispatched."
                        : "Thank you for registering for Supernova 3.0 at The National College, Basavanagudi."}
                    </p>
                  </div>

                  {/* Primary Registration Reference */}
                  {registeredRef && (
                    <div className="bg-[#F8F7FC] border-2 border-[#191936] rounded-2xl p-4 sm:p-5 max-w-lg mx-auto text-left shadow-[4px_4px_0px_#191936]">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-[#52527A] font-bold">
                          {selectedType === "visitor"
                            ? "Visitor Ticket Number"
                            : selectedType === "esports"
                            ? "Esports Squad Application Code"
                            : "Project Application Code"}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#D5F542] text-[#191936] uppercase">
                          {selectedType === "visitor" ? "Confirmed Pass" : "Logged for Review"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xl sm:text-2xl font-black text-[#4549D8] tracking-wider select-all">
                          {registeredRef}
                        </span>
                        <button
                          type="button"
                          onClick={copyRefToClipboard}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#191936] bg-white text-xs font-mono font-bold text-[#191936] hover:bg-[#D5F542] transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedRef ? "Copied!" : "Copy"}
                        </button>
                      </div>

                      {/* Linked Visitor Pass if participation */}
                      {selectedType === "participation" && linkedVisitorTicket && (
                        <div className="mt-3 pt-3 border-t border-[#EAEAF2] flex items-center justify-between text-xs">
                          <span className="text-[#52527A] font-medium">Auto-Linked Visitor Entry Pass:</span>
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {linkedVisitorTicket}
                          </span>
                        </div>
                      )}

                      {/* Download Ticket PDF button for direct visitors */}
                      {selectedType === "visitor" && (
                        <div className="mt-4 pt-3 border-t border-[#EAEAF2] flex items-center justify-between">
                          <span className="text-xs text-[#52527A]">Download official entry pass:</span>
                          <button
                            type="button"
                            onClick={() =>
                              downloadTicketPdfFile({
                                ticketRef: registeredRef,
                                recipientName: visName.trim() || "Visitor",
                                category: visCategory,
                                email: visEmail.trim(),
                                phone: visPhone.trim(),
                                institution:
                                  visCategory === "Student" || visCategory === "Faculty / Staff"
                                    ? (visInstitutionSelect === "Other" ? visInstitutionOther.trim() : visInstitutionSelect.trim())
                                    : (visOrg.trim() || "General Visitor"),
                                registrationType: "visitor",
                                daysAttending: visDays,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-[#191936] bg-[#D5F542] text-xs font-mono font-bold text-[#191936] hover:bg-[#befc15] shadow-[2px_2px_0px_#191936] transition-transform active:translate-y-0.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Ticket PDF
                          </button>
                        </div>
                      )}

                      {/* Notice */}
                      {emailNotice && (
                        <p className="text-[11px] text-[#52527A] mt-3 leading-relaxed border-t border-[#EAEAF2] pt-2.5">
                          {emailNotice}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Esports Squad Passes */}
                  {selectedType === "esports" && squadRosterTickets.length > 0 && (
                    <div className="bg-white border-2 border-[#191936] rounded-2xl p-4 max-w-lg mx-auto text-left shadow-[4px_4px_0px_#191936]">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-[#191936] font-bold mb-2">
                        Roster Visitor Tickets (Active upon Approval)
                      </div>
                      <div className="space-y-1.5 text-xs">
                        {squadRosterTickets.map((r, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-2 rounded-lg bg-[#F8F7FC] border border-[#EAEAF2]"
                          >
                            <span className="font-semibold text-slate-800">
                              {i + 1}. {r.name} {r.tag ? `(${r.tag})` : ""}
                            </span>
                            <span className="font-mono text-xs font-bold text-[#4549D8] bg-white px-2 py-0.5 rounded border border-slate-200">
                              {r.ticket}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Event Details Card */}
                  <div className="p-3.5 rounded-xl bg-[#F0F2FD] border border-[#4549D8]/30 max-w-lg mx-auto text-left text-xs text-[#191936]">
                    <div className="font-bold uppercase tracking-wider text-[11px] text-[#4549D8] mb-1">
                      Event Schedule & Venue
                    </div>
                    <div>20–21 November 2026 · The National College, Basavanagudi, Bengaluru – 560004</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSubmitSuccess(false);
                      setRegisteredRef(null);
                      setLinkedVisitorTicket(null);
                      setSquadRosterTickets([]);
                      setEmailNotice(null);
                    }}
                    className="btn-secondary mt-2 cursor-pointer"
                  >
                    Submit another response
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
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

                  {/* 1. PARTICIPATION FORM FIELDS */}
                  {selectedType === "participation" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="md:col-span-2">
                        <label className="form-label">Institution Name *</label>
                        <input
                          type="text"
                          required
                          value={partInstitution}
                          onChange={(e) => setPartInstitution(e.target.value)}
                          placeholder="e.g. The National College"
                          className="form-input"
                        />
                      </div>

                      <div>
                        <label className="form-label">Contact Person *</label>
                        <input
                          type="text"
                          required
                          value={partContactPerson}
                          onChange={(e) => setPartContactPerson(e.target.value)}
                          placeholder="Full name"
                          className="form-input"
                        />
                      </div>

                      <div>
                        <label className="form-label">Email Address *</label>
                        <input
                          type="email"
                          required
                          value={partEmail}
                          onChange={(e) => setPartEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="form-input"
                        />
                      </div>

                      <div>
                        <label className="form-label">Phone Number *</label>
                        <input
                          type="tel"
                          required
                          value={partPhone}
                          onChange={(e) => setPartPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                          className="form-input"
                        />
                      </div>

                      <div>
                        <label className="form-label">Experience Area *</label>
                        <select
                          value={partExperience}
                          onChange={(e) => setPartExperience(e.target.value)}
                          className="form-input"
                        >
                          {experiences.map((exp) => (
                            <option key={exp.id} value={exp.title}>
                              {exp.num}. {exp.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="form-label">Project or Exhibit Title *</label>
                        <input
                          type="text"
                          required
                          value={partTitle}
                          onChange={(e) => setPartTitle(e.target.value)}
                          placeholder="Title of your project or showcase"
                          className="form-input"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <div className="flex justify-between items-center mb-1">
                          <label className="form-label mb-0">Short Description (Max 300 chars) *</label>
                          <span className="text-xs font-mono text-[#191936]/60">
                            {partDesc.length}/300
                          </span>
                        </div>
                        <textarea
                          required
                          maxLength={300}
                          rows={3}
                          value={partDesc}
                          onChange={(e) => setPartDesc(e.target.value)}
                          placeholder="Brief summary of your project..."
                          className="w-full p-4 border-2 border-[#D8D8E5] rounded-xl text-base text-[#191936] outline-none focus:border-[#4549D8]"
                        />
                      </div>

                      <div>
                        <label className="form-label">Number of Participants *</label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          required
                          value={partCount}
                          onChange={(e) => setPartCount(e.target.value)}
                          className="form-input"
                        />
                      </div>
                    </div>
                  )}

                  {/* 2. VISITOR FORM FIELDS (PART A CONDITIONAL IMPLEMENTATION) */}
                  {selectedType === "visitor" && (
                    <div className="space-y-6">
                      {/* Category Selector Tabs */}
                      <div>
                        <label className="form-label font-bold text-sm text-[#191936] mb-2 block">
                          Select Visitor Category *
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {[
                            { id: "Student", label: "Student", desc: "School, PUC, or Degree students", icon: GraduationCap },
                            { id: "General Visitor", label: "General Visitor", desc: "Parents, alumni & public guests", icon: Users },
                            { id: "Faculty / Staff", label: "Faculty / Staff", desc: "Educators, lecturers & academic staff", icon: Building2 },
                          ].map((cat) => {
                            const Icon = cat.icon;
                            const isSelected = visCategory === cat.id;
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => setVisCategory(cat.id as any)}
                                className={`p-4 rounded-2xl text-left border-2 transition-all cursor-pointer flex flex-col justify-between ${
                                  isSelected
                                    ? "bg-[#191936] text-white border-[#191936] shadow-[4px_4px_0px_#4549D8]"
                                    : "bg-[#F8F7FC] text-[#191936] border-[#D8D8E5] hover:border-[#191936]/50"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <Icon size={20} className={isSelected ? "text-[#D5F542]" : "text-[#4549D8]"} />
                                  {isSelected && <span className="w-2 h-2 rounded-full bg-[#D5F542]" />}
                                </div>
                                <div>
                                  <div className="font-heading font-extrabold text-sm uppercase">{cat.label}</div>
                                  <div className={`text-[11px] mt-0.5 leading-snug ${isSelected ? "text-white/70" : "text-[#191936]/60"}`}>
                                    {cat.desc}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Primary Contact Details (Common to all categories) */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                        <div>
                          <label className="form-label">Full Name *</label>
                          <input
                            type="text"
                            required
                            value={visName}
                            onChange={(e) => setVisName(e.target.value)}
                            placeholder="Enter your name"
                            className="form-input"
                          />
                        </div>

                        <div>
                          <label className="form-label">Mobile Number *</label>
                          <input
                            type="tel"
                            required
                            value={visPhone}
                            onChange={(e) => setVisPhone(e.target.value)}
                            placeholder="+91 98765 43210"
                            className="form-input"
                          />
                        </div>

                        <div>
                          <label className="form-label">Email Address *</label>
                          <input
                            type="email"
                            required
                            value={visEmail}
                            onChange={(e) => setVisEmail(e.target.value)}
                            placeholder="name@example.com"
                            className="form-input"
                          />
                        </div>
                      </div>

                      {/* CONDITIONAL SUB-SECTION: STUDENT */}
                      {visCategory === "Student" && (
                        <div className="p-5 sm:p-6 rounded-2xl bg-[#F0F2FD] border-2 border-[#4549D8]/30 space-y-5 animate-fadeIn">
                          <div className="flex items-center gap-2 pb-2 border-b border-[#4549D8]/20">
                            <GraduationCap size={18} className="text-[#4549D8]" />
                            <h3 className="font-heading font-extrabold text-sm uppercase text-[#191936] tracking-wide">
                              Student Academic Details
                            </h3>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Class / Standard Dropdown */}
                            <div>
                              <label className="form-label">Class / Standard *</label>
                              <select
                                value={visStudentClass}
                                onChange={(e) => setVisStudentClass(e.target.value)}
                                className="form-input bg-white"
                              >
                                <option value="8th Standard">8th Standard</option>
                                <option value="9th Standard">9th Standard</option>
                                <option value="10th Standard">10th Standard</option>
                                <option value="PUC First Year">PUC First Year</option>
                                <option value="PUC Second Year">PUC Second Year</option>
                                <option value="Degree">Degree</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>

                            {/* Student Roll No / ID */}
                            <div>
                              <label className="form-label">Student Roll Number / Student ID *</label>
                              <input
                                type="text"
                                required
                                value={visStudentId}
                                onChange={(e) => setVisStudentId(e.target.value)}
                                placeholder="e.g. 24NCB1042 or Roll 42"
                                className="form-input bg-white"
                              />
                            </div>

                            {/* School / College Dropdown */}
                            <div className="sm:col-span-2">
                              <label className="form-label">School / College Name *</label>
                              <select
                                value={visInstitutionSelect}
                                onChange={(e) => setVisInstitutionSelect(e.target.value)}
                                className="form-input bg-white"
                              >
                                <option value="The National College, Basavanagudi">The National College, Basavanagudi</option>
                                <option value="National PU College, Jayanagar">National PU College, Jayanagar</option>
                                <option value="National PU College, Basavanagudi">National PU College, Basavanagudi</option>
                                <option value="National High School, Basavanagudi">National High School, Basavanagudi</option>
                                <option value="National English School">National English School</option>
                                <option value="National Degree College, Jayanagar">National Degree College, Jayanagar</option>
                                <option value="DR.HNCE">DR.HNCE</option>
                                <option value="Bangalore University">Bangalore University</option>
                                <option value="Other">Other Institution (Enter name below)</option>
                              </select>
                            </div>

                            {/* Custom Institution Input if Other selected */}
                            {visInstitutionSelect === "Other" && (
                              <div className="sm:col-span-2 animate-fadeIn">
                                <label className="form-label">Enter Institution / School Name *</label>
                                <input
                                  type="text"
                                  required
                                  value={visInstitutionOther}
                                  onChange={(e) => setVisInstitutionOther(e.target.value)}
                                  placeholder="Full school or college name"
                                  className="form-input bg-white"
                                />
                              </div>
                            )}
                          </div>

                          {/* Esports Interest Dynamic Section */}
                          <div className="pt-3 border-t border-[#4549D8]/20 space-y-4">
                            <div>
                              <label className="form-label font-bold text-sm text-[#191936] block mb-1">
                                Are you interested in the Supernova Esports Arena? *
                              </label>
                              <p className="text-xs text-[#191936]/70 mb-3">
                                Experience official collegiate tournaments for VALORANT, BGMI, and Free Fire.
                              </p>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setVisEsportsInterest(true)}
                                  className={`px-6 py-2.5 rounded-xl font-mono text-xs font-bold uppercase transition-all cursor-pointer ${
                                    visEsportsInterest
                                      ? "bg-[#4549D8] text-white shadow-sm"
                                      : "bg-white text-[#191936] border border-[#D8D8E5] hover:bg-gray-50"
                                  }`}
                                >
                                  Yes, I'm Interested
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setVisEsportsInterest(false)}
                                  className={`px-6 py-2.5 rounded-xl font-mono text-xs font-bold uppercase transition-all cursor-pointer ${
                                    !visEsportsInterest
                                      ? "bg-[#191936] text-white shadow-sm"
                                      : "bg-white text-[#191936] border border-[#D8D8E5] hover:bg-gray-50"
                                  }`}
                                >
                                  No, Just Visiting
                                </button>
                              </div>
                            </div>

                            {/* Conditional Game Selection & Competing Details */}
                            {visEsportsInterest && (
                              <div className="p-4 rounded-xl bg-white border border-[#4549D8]/30 space-y-4 animate-fadeIn">
                                {/* Preferred Game */}
                                <div>
                                  <label className="form-label">Preferred Esports Game *</label>
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {[
                                      { id: "VALORANT", label: "VALORANT", type: "PC 5v5 Tactical", color: "#FF4655" },
                                      { id: "BGMI", label: "BGMI", type: "Mobile Battle Royale", color: "#F5A623" },
                                      { id: "Free Fire", label: "Free Fire", type: "Mobile Survival", color: "#FF6A00" },
                                    ].map((g) => {
                                      const isSelected = visPreferredGame === g.id;
                                      return (
                                        <button
                                          key={g.id}
                                          type="button"
                                          onClick={() => setVisPreferredGame(g.id as any)}
                                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                            isSelected
                                              ? "border-2 shadow-sm font-bold"
                                              : "border-gray-200 hover:border-gray-400"
                                          }`}
                                          style={{
                                            borderColor: isSelected ? g.color : undefined,
                                            backgroundColor: isSelected ? `${g.color}10` : undefined,
                                          }}
                                        >
                                          <div className="font-display text-sm font-extrabold" style={{ color: isSelected ? g.color : "#191936" }}>
                                            {g.label}
                                          </div>
                                          <div className="text-[10px] text-gray-500 font-mono mt-0.5">{g.type}</div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Spectator vs Competitor Intent */}
                                <div>
                                  <label className="form-label">How do you plan to participate? *</label>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button
                                      type="button"
                                      onClick={() => setVisEsportsIntent("spectator")}
                                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                        visEsportsIntent === "spectator"
                                          ? "bg-[#191936] text-white border-[#191936] font-bold"
                                          : "bg-gray-50 text-gray-800 border-gray-200"
                                      }`}
                                    >
                                      <div className="font-heading text-xs uppercase">Spectator / Audience</div>
                                      <div className="text-[11px] opacity-75 mt-0.5">I want to watch the live championship matches in the arena (no gamer ID required).</div>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setVisEsportsIntent("competing")}
                                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                        visEsportsIntent === "competing"
                                          ? "bg-[#4549D8] text-white border-[#4549D8] font-bold"
                                          : "bg-gray-50 text-gray-800 border-gray-200"
                                      }`}
                                    >
                                      <div className="font-heading text-xs uppercase">Register to Compete</div>
                                      <div className="text-[11px] opacity-75 mt-0.5">I am registering to play in tournament fixtures (collects In-Game ID & Team).</div>
                                    </button>
                                  </div>
                                </div>

                                {/* Competing Details: In-Game ID & Team */}
                                {visEsportsIntent === "competing" && (
                                  <div className="pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
                                    <div>
                                      <label className="form-label">
                                        In-Game Player ID / Gamer Tag *
                                      </label>
                                      <input
                                        type="text"
                                        required
                                        value={visInGameId}
                                        onChange={(e) => setVisInGameId(e.target.value)}
                                        placeholder={
                                          visPreferredGame === "VALORANT"
                                            ? "e.g. Phoenix#1234"
                                            : "e.g. BGMI UID: 5123456789"
                                        }
                                        className="form-input !h-10 text-xs"
                                      />
                                    </div>

                                    <div>
                                      <label className="form-label">Team Name (if applicable)</label>
                                      <input
                                        type="text"
                                        value={visTeamName}
                                        onChange={(e) => setVisTeamName(e.target.value)}
                                        placeholder="e.g. Basavanagudi Blasters"
                                        className="form-input !h-10 text-xs"
                                      />
                                    </div>

                                    <div className="sm:col-span-2">
                                      <label className="form-label">Additional Competition Details (Optional)</label>
                                      <input
                                        type="text"
                                        value={visCompetitionNotes}
                                        onChange={(e) => setVisCompetitionNotes(e.target.value)}
                                        placeholder="Device model, preferred role (e.g. Duelist, IGL, Assaulter), or teammate info"
                                        className="form-input !h-10 text-xs"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* CONDITIONAL SUB-SECTION: FACULTY / STAFF */}
                      {visCategory === "Faculty / Staff" && (
                        <div className="p-5 sm:p-6 rounded-2xl bg-[#FFF6EE] border-2 border-[#FF873D]/30 space-y-4 animate-fadeIn">
                          <div className="flex items-center gap-2 pb-2 border-b border-[#FF873D]/20">
                            <Building2 size={18} className="text-[#FF873D]" />
                            <h3 className="font-heading font-extrabold text-sm uppercase text-[#191936] tracking-wide">
                              Institutional & Faculty Details
                            </h3>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="form-label">Institution / College Name *</label>
                              <select
                                value={visInstitutionSelect}
                                onChange={(e) => setVisInstitutionSelect(e.target.value)}
                                className="form-input bg-white"
                              >
                                <option value="The National College, Basavanagudi">The National College, Basavanagudi</option>
                                <option value="National PU College, Jayanagar">National PU College, Jayanagar</option>
                                <option value="National PU College, Basavanagudi">National PU College, Basavanagudi</option>
                                <option value="National High School, Basavanagudi">National High School, Basavanagudi</option>
                                <option value="National English School">National English School</option>
                                <option value="National Degree College, Jayanagar">National Degree College, Jayanagar</option>
                                <option value="DR.HNCE">DR.HNCE</option>
                                <option value="Bangalore University">Bangalore University</option>
                                <option value="Other">Other Institution (Enter name below)</option>
                              </select>
                            </div>

                            <div>
                              <label className="form-label">Designation / Department *</label>
                              <input
                                type="text"
                                required
                                value={visDesignation}
                                onChange={(e) => setVisDesignation(e.target.value)}
                                placeholder="e.g. Assistant Professor, Physics / Lecturer"
                                className="form-input bg-white"
                              />
                            </div>

                            {visInstitutionSelect === "Other" && (
                              <div className="sm:col-span-2 animate-fadeIn">
                                <label className="form-label">Enter Institution Name *</label>
                                <input
                                  type="text"
                                  required
                                  value={visInstitutionOther}
                                  onChange={(e) => setVisInstitutionOther(e.target.value)}
                                  placeholder="Full institution name"
                                  className="form-input bg-white"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* CONDITIONAL SUB-SECTION: GENERAL VISITOR */}
                      {visCategory === "General Visitor" && (
                        <div className="p-5 sm:p-6 rounded-2xl bg-[#F8F7FC] border border-[#EAEAF2] space-y-4 animate-fadeIn">
                          <div>
                            <label className="form-label">Organisation / Workplace / Background (Optional)</label>
                            <input
                              type="text"
                              value={visOrg}
                              onChange={(e) => setVisOrg(e.target.value)}
                              placeholder="e.g. Parent, Alumni, Independent Guest, Company"
                              className="form-input bg-white"
                            />
                            <p className="text-[11px] text-[#191936]/60 mt-1">
                              General visitors do not need to provide student roll numbers or school credentials.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Days Attending (Common to all categories) */}
                      <div>
                        <label className="form-label">Festival Days Attending *</label>
                        <select
                          value={visDays}
                          onChange={(e) => setVisDays(e.target.value)}
                          className="form-input"
                        >
                          <option value="Both">Both Days (20 & 21 November 2026)</option>
                          <option value="Day 1">Day 1 Only (20 November 2026)</option>
                          <option value="Day 2">Day 2 Only (21 November 2026)</option>
                        </select>
                      </div>
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
    </div>
  );
};
