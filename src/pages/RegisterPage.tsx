import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SITE_CONTENT } from "../content/site";
import { CheckCircle2, Plus, Trash2, Copy } from "lucide-react";
import { supabase } from "../lib/supabase";

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
          setSelectedGameId(data[0].id);
          // Set initial player count according to first game's team_size
          const count = data[0].team_size || 5;
          setEspPlayers(Array.from({ length: count }, () => ({ name: "", inGameId: "" })));
        }
      } catch (err) {
        console.warn("Could not load games list:", err);
      }
    }
    loadGames();
  }, []);

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
  const [visName, setVisName] = useState("");
  const [visEmail, setVisEmail] = useState("");
  const [visPhone, setVisPhone] = useState("");
  const [visOrg, setVisOrg] = useState("");
  const [visType, setVisType] = useState("College student");
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
  const [copiedRef, setCopiedRef] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // When game selection changes, resize players roster to match team_size
  const handleGameChange = (gameId: string) => {
    setSelectedGameId(gameId);
    const game = activeGames.find((g) => g.id === gameId);
    const targetSize = game?.team_size || 5;
    setEspPlayers((prev) => {
      if (prev.length === targetSize) return prev;
      if (prev.length < targetSize) {
        const added = Array.from({ length: targetSize - prev.length }, () => ({
          name: "",
          inGameId: "",
        }));
        return [...prev, ...added];
      }
      return prev.slice(0, targetSize);
    });
  };

  // Add/remove player for esports
  const handleAddPlayer = () => {
    setEspPlayers((prev) => [...prev, { name: "", inGameId: "" }]);
  };

  const handleRemovePlayer = (idx: number) => {
    if (espPlayers.length <= 1) return;
    setEspPlayers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePlayerChange = (idx: number, field: keyof PlayerRow, val: string) => {
    setEspPlayers((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p))
    );
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
      body += `School/College/Organisation: ${visOrg}\n`;
      body += `Visitor Type: ${visType}\n`;
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
      alert("Please agree to the privacy policy before submitting.");
      return;
    }

    if (selectedType === "esports" && !espRulesAgreed) {
      alert("Please accept the tournament rules before submitting.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (selectedType === "visitor") {
        // Map visitor category to valid constraint strings
        const categoryMap: Record<string, string> = {
          "School student": "School student",
          "College student": "College student",
          "Teacher": "Teacher or educator",
          "Teacher or educator": "Teacher or educator",
          "Parent": "Parent or guardian",
          "Parent or guardian": "Parent or guardian",
          "Professional": "Working professional",
          "Working professional": "Working professional",
          "General visitor": "General visitor",
          "Other": "Other",
        };
        const mappedCat = categoryMap[visType] || "College student";

        const { data, error } = await supabase.rpc("submit_visitor_registration", {
          p_full_name: visName.trim(),
          p_email: visEmail.trim().toLowerCase(),
          p_phone: visPhone.trim(),
          p_institution: visOrg.trim(),
          p_visitor_category: mappedCat,
          p_consent: true,
          p_website: "",
        });

        if (error) throw error;
        setRegisteredRef(typeof data === "string" ? data : "SN3-26-REG");
        setSubmitSuccess(true);
      } else if (selectedType === "esports") {
        if (!selectedGameId) {
          throw new Error("Please select a game for esports registration.");
        }
        const game = activeGames.find((g) => g.id === selectedGameId);
        if (game?.team_size && espPlayers.length !== game.team_size) {
          throw new Error(
            `${game.title} requires exactly ${game.team_size} players (current: ${espPlayers.length}).`
          );
        }

        const playersPayload = espPlayers.map((p) => ({
          player_name: p.name.trim(),
          gamer_tag: p.inGameId.trim(),
        }));

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
        setRegisteredRef(typeof data === "string" ? data : "SN3-26-REG");
        setSubmitSuccess(true);
      } else if (selectedType === "participation") {
        // Enforce strict single secure backend RPC workflow
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

        if (error) {
          if (error.code === "PGRST202" || error.message?.includes("Could not find the function")) {
            throw new Error(
              "Participation registration service is currently undergoing database activation. Please apply the migration script in Supabase or contact support."
            );
          }
          throw error;
        }

        if (!data) {
          throw new Error("No registration reference returned from the database.");
        }

        setRegisteredRef(typeof data === "string" ? data : String(data));
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
      {/* Header Band (min 260px, off-white, ribbon along bottom edge) */}
      <div className="pt-36 pb-16 bg-white border-b border-[#EAEAF2] relative">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 text-center">
          <span className="inline-block text-xs uppercase tracking-[0.2em] font-mono text-[#4549D8] font-bold mb-3">
            {content.eyebrow}
          </span>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-[#191936] mb-4">
            {content.heading}
          </h1>
          <p className="font-mono text-xs sm:text-sm font-semibold text-[#191936]/70 max-w-2xl mx-auto">
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
                <div className="text-center py-10 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-[#D5F542] border-2 border-[#191936] mx-auto flex items-center justify-center text-[#191936]">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="font-heading text-2xl font-bold text-[#191936]">
                    {content.successTitle}
                  </h3>
                  <p className="text-sm text-[#191936]/80 max-w-md mx-auto">
                    {content.successSubtitle}
                  </p>

                  {registeredRef && (
                    <div className="bg-[#F8F7FC] border-2 border-[#191936] rounded-2xl p-4 max-w-md mx-auto my-4 text-left shadow-[4px_4px_0px_#191936]">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-[#52527A] font-bold mb-1">
                        Official Registration Reference
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xl sm:text-2xl font-black text-[#4549D8] tracking-wider select-all">
                          {registeredRef}
                        </span>
                        <button
                          type="button"
                          onClick={copyRefToClipboard}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#191936] bg-white text-xs font-mono font-bold text-[#191936] hover:bg-[#D5F542] transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedRef ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <p className="text-[11px] text-[#52527A] mt-2">
                        Save this reference for your event badge pickup at the registration desk.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setSubmitSuccess(false);
                      setRegisteredRef(null);
                    }}
                    className="btn-secondary mt-4"
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

                  {/* 2. VISITOR FORM FIELDS */}
                  {selectedType === "visitor" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="form-label">Full Name *</label>
                        <input
                          type="text"
                          required
                          value={visName}
                          onChange={(e) => setVisName(e.target.value)}
                          placeholder="Your name"
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

                      <div>
                        <label className="form-label">Phone Number *</label>
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
                        <label className="form-label">School, College or Organisation *</label>
                        <input
                          type="text"
                          required
                          value={visOrg}
                          onChange={(e) => setVisOrg(e.target.value)}
                          placeholder="Organisation name"
                          className="form-input"
                        />
                      </div>

                      <div>
                        <label className="form-label">Visitor Type *</label>
                        <select
                          value={visType}
                          onChange={(e) => setVisType(e.target.value)}
                          className="form-input"
                        >
                          <option value="Student">Student</option>
                          <option value="Teacher">Teacher</option>
                          <option value="Parent">Parent</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="form-label">Days Attending *</label>
                        <select
                          value={visDays}
                          onChange={(e) => setVisDays(e.target.value)}
                          className="form-input"
                        >
                          <option value="Day 1">Day 1 (20 Nov)</option>
                          <option value="Day 2">Day 2 (21 Nov)</option>
                          <option value="Both">Both Days</option>
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

                      {/* Player Rows */}
                      <div className="pt-4 border-t border-[#EAEAF2]">
                        <div className="flex items-center justify-between mb-3">
                          <label className="form-label font-bold text-base mb-0">
                            Team Players
                          </label>
                          <button
                            type="button"
                            onClick={handleAddPlayer}
                            className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#4549D8] bg-white border border-[#4549D8] px-3 py-1.5 rounded-full hover:bg-[#4549D8] hover:text-white transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Player
                          </button>
                        </div>

                        <div className="space-y-3">
                          {espPlayers.map((player, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-3 p-3 rounded-xl bg-[#F8F7FC] border border-[#EAEAF2]"
                            >
                              <span className="font-mono text-xs font-bold w-6 text-[#191936]/60 text-center">
                                #{idx + 1}
                              </span>
                              <input
                                type="text"
                                required
                                value={player.name}
                                onChange={(e) => handlePlayerChange(idx, "name", e.target.value)}
                                placeholder="Player Name"
                                className="form-input !h-10 text-sm flex-1"
                              />
                              <input
                                type="text"
                                required
                                value={player.inGameId}
                                onChange={(e) => handlePlayerChange(idx, "inGameId", e.target.value)}
                                placeholder="In-Game ID"
                                className="form-input !h-10 text-sm flex-1"
                              />
                              {espPlayers.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemovePlayer(idx)}
                                  className="p-2 text-red-500 hover:text-red-700"
                                  title="Remove player"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
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
