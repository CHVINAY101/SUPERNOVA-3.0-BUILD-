import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CONFIG, getInstagramDisplay } from "@/config";
import { WaveRibbonDivider } from "@/components/stage1/WaveRibbonDivider";
import { Check, Plus, Trash2, Mail, AlertCircle, RefreshCw } from "lucide-react";

type RegistrationType = "participation" | "visitor" | "esports";

const EXPERIENCES = [
  "Science Expo",
  "Animation & VFX",
  "Esports Arena",
  "Ideas in Motion",
  "School Innovators",
  "Retro Tech History",
  "Masterclass Hub",
  "Industry Connect",
];

interface PlayerRow {
  name: string;
  gamerId: string;
}

export default function Register() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlType = searchParams.get("type") as RegistrationType | null;

  // Nothing is preselected unless the URL has ?type=participation|visitor|esports
  const [selectedType, setSelectedType] = useState<RegistrationType | null>(() => {
    if (urlType && ["participation", "visitor", "esports"].includes(urlType)) {
      return urlType;
    }
    return null;
  });

  useEffect(() => {
    if (urlType && ["participation", "visitor", "esports"].includes(urlType)) {
      setSelectedType(urlType);
    }
  }, [urlType]);

  const handleSelectCard = (type: RegistrationType) => {
    setSelectedType(type);
    setSearchParams({ type });
    setSubmitState("idle");
    setErrorMessage("");
  };

  // Common submission states
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Participation form state
  const [partInstitution, setPartInstitution] = useState("");
  const [partContactPerson, setPartContactPerson] = useState("");
  const [partEmail, setPartEmail] = useState("");
  const [partPhone, setPartPhone] = useState("");
  const [partArea, setPartArea] = useState(EXPERIENCES[0]);
  const [partProjectTitle, setPartProjectTitle] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [partParticipantsCount, setPartParticipantsCount] = useState("1");
  const [partPrivacyAgreed, setPartPrivacyAgreed] = useState(false);

  // Visitor form state
  const [visFullName, setVisFullName] = useState("");
  const [visEmail, setVisEmail] = useState("");
  const [visPhone, setVisPhone] = useState("");
  const [visOrganisation, setVisOrganisation] = useState("");
  const [visType, setVisType] = useState("Student");
  const [visDays, setVisDays] = useState("Both");
  const [visPrivacyAgreed, setVisPrivacyAgreed] = useState(false);

  // Esports form state
  const urlGame = searchParams.get("game");
  const getInitialGame = () => {
    if (urlGame) {
      const lower = urlGame.toLowerCase();
      if (lower.includes("val")) return "VALORANT";
      if (lower.includes("bgmi")) return "BGMI";
      if (lower.includes("free")) return "FREE FIRE";
    }
    return CONFIG.ESPORTS_GAMES[0] || "VALORANT";
  };

  const [espTeamName, setEspTeamName] = useState("");
  const [espGame, setEspGame] = useState<string>(getInitialGame);
  const [espTeamRep, setEspTeamRep] = useState("");
  const [espEmail, setEspEmail] = useState("");
  const [espPhone, setEspPhone] = useState("");
  const [espInstitution, setEspInstitution] = useState("");
  const [espPlayers, setEspPlayers] = useState<PlayerRow[]>([{ name: "", gamerId: "" }]);
  const [espRulesAgreed, setEspRulesAgreed] = useState(false);
  const [espPrivacyAgreed, setEspPrivacyAgreed] = useState(false);

  useEffect(() => {
    if (urlGame) {
      const lower = urlGame.toLowerCase();
      if (lower.includes("val")) setEspGame("VALORANT");
      else if (lower.includes("bgmi")) setEspGame("BGMI");
      else if (lower.includes("free")) setEspGame("FREE FIRE");
    }
  }, [urlGame]);

  const addPlayerRow = () => {
    setEspPlayers((prev) => [...prev, { name: "", gamerId: "" }]);
  };

  const removePlayerRow = (index: number) => {
    if (espPlayers.length <= 1) return;
    setEspPlayers((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePlayerRow = (index: number, field: keyof PlayerRow, value: string) => {
    setEspPlayers((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Endpoint check
  const endpoint = selectedType ? CONFIG.FORM_ENDPOINTS[selectedType] : "";
  const isEndpointConfigured = Boolean(endpoint && endpoint.trim().length > 0);

  // Generate mailto fallback url
  const getMailtoUrl = () => {
    const email = CONFIG.HELPDESK_EMAIL;
    let subject = `[Registration] ${selectedType ? selectedType.toUpperCase() : "General"} Form`;
    let body = `Hello Supernova 3.0 Team,\n\nPlease find my registration details below:\n\n`;

    if (selectedType === "participation") {
      subject = `[Registration] Participation Form - ${partProjectTitle || partInstitution}`;
      body += `Institution: ${partInstitution}\nContact Person: ${partContactPerson}\nEmail: ${partEmail}\nPhone: ${partPhone}\nExperience Area: ${partArea}\nProject Title: ${partProjectTitle}\nDescription: ${partDescription}\nNumber of Participants: ${partParticipantsCount}\n`;
    } else if (selectedType === "visitor") {
      subject = `[Registration] Visitor Form - ${visFullName}`;
      body += `Full Name: ${visFullName}\nEmail: ${visEmail}\nPhone: ${visPhone}\nSchool/College/Organisation: ${visOrganisation}\nVisitor Type: ${visType}\nDays Attending: ${visDays}\n`;
    } else if (selectedType === "esports") {
      subject = `[Registration] Esports Team Form - ${espTeamName}`;
      body += `Team Name: ${espTeamName}\nGame: ${espGame || "Games to be announced"}\nTeam Representative: ${espTeamRep}\nEmail: ${espEmail}\nPhone: ${espPhone}\nInstitution: ${espInstitution}\n\nPlayers:\n`;
      espPlayers.forEach((p, idx) => {
        body += `Player ${idx + 1}: ${p.name || "N/A"} (ID: ${p.gamerId || "N/A"})\n`;
      });
    }

    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;

    if (!isEndpointConfigured) {
      // If endpoint is not connected, user can use the fallback mailto link
      return;
    }

    setSubmitState("submitting");
    setErrorMessage("");

    try {
      let payload: any = { type: selectedType, submitted_at: new Date().toISOString() };

      if (selectedType === "participation") {
        payload = {
          ...payload,
          institution: partInstitution,
          contact_person: partContactPerson,
          email: partEmail,
          phone: partPhone,
          experience_area: partArea,
          project_title: partProjectTitle,
          description: partDescription,
          participants_count: partParticipantsCount,
        };
      } else if (selectedType === "visitor") {
        payload = {
          ...payload,
          full_name: visFullName,
          email: visEmail,
          phone: visPhone,
          organisation: visOrganisation,
          visitor_type: visType,
          days_attending: visDays,
        };
      } else if (selectedType === "esports") {
        payload = {
          ...payload,
          team_name: espTeamName,
          game: espGame || "Games to be announced",
          team_representative: espTeamRep,
          email: espEmail,
          phone: espPhone,
          institution: espInstitution,
          players: espPlayers,
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      setSubmitState("success");
    } catch (err: any) {
      setSubmitState("error");
      setErrorMessage(err.message || "Unable to submit form. Please retry or contact the helpdesk.");
    }
  };

  const handleReset = () => {
    setSubmitState("idle");
    setErrorMessage("");
  };

  const instaBasavanagudi = getInstagramDisplay("nationalCollegeBasavanagudi");
  const instaNcba = getInstagramDisplay("nationalNcba");

  return (
    <div className="w-full bg-white text-[#151535] min-h-screen">
      {/* Header band: starts 120px below top so nav pill never covers it */}
      <section
        style={{ minHeight: 260, height: "32vh" }}
        className="w-full bg-[#F8F7FC] relative pt-[120px] pb-8 flex flex-col justify-between overflow-hidden border-b border-[#EAEAF2]"
      >
        <div className="site-container my-auto text-center">
          <span className="section-label">REGISTRATION</span>
          <h1 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-bold text-[#151535] tracking-tight mb-2">
            REGISTER FOR SUPERNOVA 3.0
          </h1>
          <p className="font-body text-xs sm:text-sm font-semibold tracking-wider text-[#52527A] uppercase">
            20–21 NOVEMBER 2026 · THE NATIONAL COLLEGE, BASAVANAGUDI, BENGALURU – 04
          </p>
        </div>

        {/* Ribbon along bottom edge */}
        <div className="w-full h-8 overflow-hidden pointer-events-none opacity-50">
          <WaveRibbonDivider />
        </div>
      </section>

      {/* Main Container */}
      <section className="section-padding bg-white">
        <div className="site-container max-w-5xl mx-auto">
          {/* Label (16px) */}
          <div className="text-center mb-6">
            <span className="font-body text-base font-semibold text-[#151535]">
              Choose how you'd like to take part.
            </span>
          </div>

          {/* Three cards: 3 columns, 24px gaps, stacked on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Card 1: PARTICIPATE */}
            <div
              onClick={() => handleSelectCard("participation")}
              style={{
                minHeight: 200,
                borderRadius: 20,
                padding: 24,
                border: selectedType === "participation" ? "3px solid #151535" : "1px solid #EAEAF2",
                boxShadow: selectedType === "participation" ? "4px 4px 0px #151535" : "none",
              }}
              className="relative cursor-pointer transition-all bg-white flex flex-col justify-between select-none"
            >
              {/* Badge + Check indicator */}
              <div className="flex items-center justify-between mb-4">
                <span
                  style={{
                    backgroundColor: "#C8F500",
                    color: "#151535",
                    padding: "8px 14px",
                    lineHeight: 1,
                    fontSize: 12,
                    letterSpacing: "0.08em",
                  }}
                  className="rounded-full font-bold uppercase inline-block whitespace-nowrap"
                >
                  PARTICIPATE
                </span>
                {selectedType === "participation" && (
                  <span className="w-7 h-7 rounded-full bg-[#151535] text-white flex items-center justify-center">
                    <Check size={16} strokeWidth={3} />
                  </span>
                )}
              </div>

              {/* Title display 28px and ONE line only */}
              <div>
                <h2 className="font-heading text-[28px] font-bold text-[#151535] leading-tight mb-2">
                  PARTICIPATE
                </h2>
                <p className="font-body text-sm font-medium text-[#52527A] leading-normal m-0">
                  Showcase your project, exhibit or idea.
                </p>
              </div>
            </div>

            {/* Card 2: VISIT */}
            <div
              onClick={() => handleSelectCard("visitor")}
              style={{
                minHeight: 200,
                borderRadius: 20,
                padding: 24,
                border: selectedType === "visitor" ? "3px solid #151535" : "1px solid #EAEAF2",
                boxShadow: selectedType === "visitor" ? "4px 4px 0px #151535" : "none",
              }}
              className="relative cursor-pointer transition-all bg-white flex flex-col justify-between select-none"
            >
              {/* Badge + Check indicator */}
              <div className="flex items-center justify-between mb-4">
                <span
                  style={{
                    backgroundColor: "#FFD600",
                    color: "#151535",
                    padding: "8px 14px",
                    lineHeight: 1,
                    fontSize: 12,
                    letterSpacing: "0.08em",
                  }}
                  className="rounded-full font-bold uppercase inline-block whitespace-nowrap"
                >
                  VISIT
                </span>
                {selectedType === "visitor" && (
                  <span className="w-7 h-7 rounded-full bg-[#151535] text-white flex items-center justify-center">
                    <Check size={16} strokeWidth={3} />
                  </span>
                )}
              </div>

              {/* Title display 28px and ONE line only */}
              <div>
                <h2 className="font-heading text-[28px] font-bold text-[#151535] leading-tight mb-2">
                  VISIT
                </h2>
                <p className="font-body text-sm font-medium text-[#52527A] leading-normal m-0">
                  Attend the expo on one or both days.
                </p>
              </div>
            </div>

            {/* Card 3: ESPORTS */}
            <div
              onClick={() => handleSelectCard("esports")}
              style={{
                minHeight: 200,
                borderRadius: 20,
                padding: 24,
                border: selectedType === "esports" ? "3px solid #151535" : "1px solid #EAEAF2",
                boxShadow: selectedType === "esports" ? "4px 4px 0px #151535" : "none",
              }}
              className="relative cursor-pointer transition-all bg-white flex flex-col justify-between select-none"
            >
              {/* Badge + Check indicator */}
              <div className="flex items-center justify-between mb-4">
                <span
                  style={{
                    backgroundColor: "#FF6B00",
                    color: "#FFFFFF",
                    padding: "8px 14px",
                    lineHeight: 1,
                    fontSize: 12,
                    letterSpacing: "0.08em",
                  }}
                  className="rounded-full font-bold uppercase inline-block whitespace-nowrap"
                >
                  ESPORTS
                </span>
                {selectedType === "esports" && (
                  <span className="w-7 h-7 rounded-full bg-[#151535] text-white flex items-center justify-center">
                    <Check size={16} strokeWidth={3} />
                  </span>
                )}
              </div>

              {/* Title display 28px and ONE line only */}
              <div>
                <h2 className="font-heading text-[28px] font-bold text-[#151535] leading-tight mb-2">
                  ESPORTS
                </h2>
                <p className="font-body text-sm font-medium text-[#52527A] leading-normal m-0">
                  Register your team.
                </p>
              </div>
            </div>
          </div>

          {/* Form Panel: 48px below the cards, max 760px, centered, white, 20px radius */}
          {selectedType && (
            <div
              style={{
                maxWidth: 760,
                borderRadius: 20,
              }}
              className="mx-auto bg-white border border-[#EAEAF2] p-6 sm:p-10 shadow-sm mt-12"
            >
              {/* Form Title */}
              <div className="border-b border-[#EAEAF2] pb-6 mb-8">
                <h2 className="font-heading text-2xl sm:text-3xl font-bold text-[#151535]">
                  {selectedType === "participation" && "Participation form"}
                  {selectedType === "visitor" && "Visitor form"}
                  {selectedType === "esports" && "Esports team form"}
                </h2>
              </div>

              {/* SUCCESS STATE */}
              {submitState === "success" && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-[#C8F500] border-2 border-[#151535] text-[#151535] flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                    ✓
                  </div>
                  <h3 className="font-heading text-2xl font-bold text-[#151535] mb-2">
                    Registration Submitted
                  </h3>
                  <p className="font-body text-sm text-[#52527A] max-w-md mx-auto mb-6">
                    Thank you for registering for SUPERNOVA 3.0.
                  </p>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="btn-primary"
                    style={{ height: 52 }}
                  >
                    Register another entry
                  </button>
                </div>
              )}

              {/* ERROR STATE */}
              {submitState === "error" && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center my-6">
                  <div className="flex items-center justify-center gap-2 text-red-700 font-bold mb-2">
                    <AlertCircle size={20} />
                    <span>Submission Failed</span>
                  </div>
                  <p className="text-sm text-red-600 mb-4">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="btn-primary inline-flex items-center gap-2"
                    style={{ height: 48, padding: "0 24px" }}
                  >
                    <RefreshCw size={16} />
                    <span>Retry Submission</span>
                  </button>
                </div>
              )}

              {/* FORM NOT CONNECTED YET BANNER WITH MAILTO FALLBACK */}
              {!isEndpointConfigured && submitState !== "success" && (
                <div className="bg-[#F8F7FC] border border-[#1719C9]/30 rounded-xl p-5 mb-8">
                  <div className="flex items-start gap-3">
                    <Mail className="text-[#1719C9] flex-shrink-0 mt-0.5" size={20} />
                    <div className="text-left text-sm">
                      <p className="font-bold text-[#151535] mb-1">
                        Form not connected yet
                      </p>
                      <p className="text-[#52527A] mb-3">
                        The live database endpoint has not been connected yet. You can submit your registration details directly to our helpdesk via email:
                      </p>
                      <a
                        href={getMailtoUrl()}
                        className="btn-primary inline-flex items-center gap-2"
                        style={{ height: 44, padding: "0 20px", fontSize: 14 }}
                      >
                        <Mail size={16} />
                        <span>Send via Email Fallback</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* FORM FIELDS */}
              {submitState !== "success" && (
                <form onSubmit={handleSubmit}>
                  {/* PARTICIPATION FORM */}
                  {selectedType === "participation" && (
                    <div className="flex flex-col gap-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Institution Name */}
                        <div>
                          <label className="form-label" htmlFor="partInstitution">
                            Institution name
                          </label>
                          <input
                            id="partInstitution"
                            type="text"
                            required
                            value={partInstitution}
                            onChange={(e) => setPartInstitution(e.target.value)}
                            className="form-input text-base"
                            placeholder="Institution name"
                          />
                        </div>

                        {/* Contact Person */}
                        <div>
                          <label className="form-label" htmlFor="partContactPerson">
                            Contact person
                          </label>
                          <input
                            id="partContactPerson"
                            type="text"
                            required
                            value={partContactPerson}
                            onChange={(e) => setPartContactPerson(e.target.value)}
                            className="form-input text-base"
                            placeholder="Contact person"
                          />
                        </div>

                        {/* Email */}
                        <div>
                          <label className="form-label" htmlFor="partEmail">
                            Email
                          </label>
                          <input
                            id="partEmail"
                            type="email"
                            required
                            value={partEmail}
                            onChange={(e) => setPartEmail(e.target.value)}
                            className="form-input text-base"
                            placeholder="Email address"
                          />
                        </div>

                        {/* Phone */}
                        <div>
                          <label className="form-label" htmlFor="partPhone">
                            Phone
                          </label>
                          <input
                            id="partPhone"
                            type="tel"
                            required
                            value={partPhone}
                            onChange={(e) => setPartPhone(e.target.value)}
                            className="form-input text-base"
                            placeholder="Phone number"
                          />
                        </div>
                      </div>

                      {/* Experience Area */}
                      <div>
                        <label className="form-label" htmlFor="partArea">
                          Experience area
                        </label>
                        <select
                          id="partArea"
                          value={partArea}
                          onChange={(e) => setPartArea(e.target.value)}
                          className="form-input text-base bg-white"
                        >
                          {EXPERIENCES.map((exp) => (
                            <option key={exp} value={exp}>
                              {exp}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Project or Exhibit Title */}
                      <div>
                        <label className="form-label" htmlFor="partProjectTitle">
                          Project or exhibit title
                        </label>
                        <input
                          id="partProjectTitle"
                          type="text"
                          required
                          value={partProjectTitle}
                          onChange={(e) => setPartProjectTitle(e.target.value)}
                          className="form-input text-base"
                          placeholder="Project or exhibit title"
                        />
                      </div>

                      {/* Short Description (300 characters max with counter) */}
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="form-label mb-0" htmlFor="partDescription">
                            Short description
                          </label>
                          <span className="text-xs font-mono text-[#52527A]">
                            {partDescription.length} / 300
                          </span>
                        </div>
                        <textarea
                          id="partDescription"
                          maxLength={300}
                          rows={3}
                          value={partDescription}
                          onChange={(e) => setPartDescription(e.target.value)}
                          className="w-full p-3 border border-[#EAEAF2] rounded-xl font-body text-base text-[#151535] outline-none focus:border-[#1719C9]"
                          placeholder="Brief description of your exhibit..."
                        />
                      </div>

                      {/* Number of Participants */}
                      <div>
                        <label className="form-label" htmlFor="partParticipantsCount">
                          Number of participants
                        </label>
                        <input
                          id="partParticipantsCount"
                          type="number"
                          min={1}
                          required
                          value={partParticipantsCount}
                          onChange={(e) => setPartParticipantsCount(e.target.value)}
                          className="form-input text-base"
                        />
                      </div>

                      {/* Required Privacy Policy Checkbox */}
                      <div className="pt-2">
                        <label className="flex items-start gap-2.5 cursor-pointer text-sm font-medium text-[#151535]">
                          <input
                            type="checkbox"
                            required
                            checked={partPrivacyAgreed}
                            onChange={(e) => setPartPrivacyAgreed(e.target.checked)}
                            className="mt-1 w-4 h-4 rounded border-[#EAEAF2]"
                          />
                          <span>I agree to the privacy policy [text to be approved]</span>
                        </label>
                      </div>

                      {/* Submit */}
                      <div className="pt-4">
                        <button
                          type="submit"
                          disabled={submitState === "submitting" || !isEndpointConfigured}
                          className="btn-primary w-full"
                          style={{ height: 52 }}
                        >
                          {submitState === "submitting" ? "Submitting..." : "Submit Registration"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* VISITOR FORM */}
                  {selectedType === "visitor" && (
                    <div className="flex flex-col gap-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Full Name */}
                        <div>
                          <label className="form-label" htmlFor="visFullName">
                            Full name
                          </label>
                          <input
                            id="visFullName"
                            type="text"
                            required
                            value={visFullName}
                            onChange={(e) => setVisFullName(e.target.value)}
                            className="form-input text-base"
                            placeholder="Full name"
                          />
                        </div>

                        {/* Email */}
                        <div>
                          <label className="form-label" htmlFor="visEmail">
                            Email
                          </label>
                          <input
                            id="visEmail"
                            type="email"
                            required
                            value={visEmail}
                            onChange={(e) => setVisEmail(e.target.value)}
                            className="form-input text-base"
                            placeholder="Email address"
                          />
                        </div>

                        {/* Phone */}
                        <div>
                          <label className="form-label" htmlFor="visPhone">
                            Phone
                          </label>
                          <input
                            id="visPhone"
                            type="tel"
                            required
                            value={visPhone}
                            onChange={(e) => setVisPhone(e.target.value)}
                            className="form-input text-base"
                            placeholder="Phone number"
                          />
                        </div>

                        {/* School, college or organisation */}
                        <div>
                          <label className="form-label" htmlFor="visOrganisation">
                            School, college or organisation
                          </label>
                          <input
                            id="visOrganisation"
                            type="text"
                            required
                            value={visOrganisation}
                            onChange={(e) => setVisOrganisation(e.target.value)}
                            className="form-input text-base"
                            placeholder="School, college or organisation"
                          />
                        </div>

                        {/* Visitor Type */}
                        <div>
                          <label className="form-label" htmlFor="visType">
                            Visitor type
                          </label>
                          <select
                            id="visType"
                            value={visType}
                            onChange={(e) => setVisType(e.target.value)}
                            className="form-input text-base bg-white"
                          >
                            <option value="Student">Student</option>
                            <option value="Teacher">Teacher</option>
                            <option value="Parent">Parent</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>

                        {/* Days Attending */}
                        <div>
                          <label className="form-label" htmlFor="visDays">
                            Days attending
                          </label>
                          <select
                            id="visDays"
                            value={visDays}
                            onChange={(e) => setVisDays(e.target.value)}
                            className="form-input text-base bg-white"
                          >
                            <option value="Day 1">Day 1</option>
                            <option value="Day 2">Day 2</option>
                            <option value="Both">Both</option>
                          </select>
                        </div>
                      </div>

                      {/* Required Privacy Policy Checkbox */}
                      <div className="pt-2">
                        <label className="flex items-start gap-2.5 cursor-pointer text-sm font-medium text-[#151535]">
                          <input
                            type="checkbox"
                            required
                            checked={visPrivacyAgreed}
                            onChange={(e) => setVisPrivacyAgreed(e.target.checked)}
                            className="mt-1 w-4 h-4 rounded border-[#EAEAF2]"
                          />
                          <span>I agree to the privacy policy [text to be approved]</span>
                        </label>
                      </div>

                      {/* Submit */}
                      <div className="pt-4">
                        <button
                          type="submit"
                          disabled={submitState === "submitting" || !isEndpointConfigured}
                          className="btn-primary w-full"
                          style={{ height: 52 }}
                        >
                          {submitState === "submitting" ? "Submitting..." : "Submit Registration"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ESPORTS TEAM FORM */}
                  {selectedType === "esports" && (
                    <div className="flex flex-col gap-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Team Name */}
                        <div>
                          <label className="form-label" htmlFor="espTeamName">
                            Team name
                          </label>
                          <input
                            id="espTeamName"
                            type="text"
                            required
                            value={espTeamName}
                            onChange={(e) => setEspTeamName(e.target.value)}
                            className="form-input text-base"
                            placeholder="Team name"
                          />
                        </div>

                        {/* Game: disabled select "Games to be announced" while CONFIG.ESPORTS_GAMES is empty */}
                        <div>
                          <label className="form-label" htmlFor="espGame">
                            Game
                          </label>
                          <select
                            id="espGame"
                            disabled={CONFIG.ESPORTS_GAMES.length === 0}
                            value={espGame}
                            onChange={(e) => setEspGame(e.target.value)}
                            className="form-input text-base bg-white disabled:bg-gray-100 disabled:text-gray-500"
                          >
                            {CONFIG.ESPORTS_GAMES.length === 0 ? (
                              <option value="">Games to be announced</option>
                            ) : (
                              CONFIG.ESPORTS_GAMES.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))
                            )}
                          </select>
                        </div>

                        {/* Team Representative */}
                        <div>
                          <label className="form-label" htmlFor="espTeamRep">
                            Team representative
                          </label>
                          <input
                            id="espTeamRep"
                            type="text"
                            required
                            value={espTeamRep}
                            onChange={(e) => setEspTeamRep(e.target.value)}
                            className="form-input text-base"
                            placeholder="Representative / Captain name"
                          />
                        </div>

                        {/* Email */}
                        <div>
                          <label className="form-label" htmlFor="espEmail">
                            Email
                          </label>
                          <input
                            id="espEmail"
                            type="email"
                            required
                            value={espEmail}
                            onChange={(e) => setEspEmail(e.target.value)}
                            className="form-input text-base"
                            placeholder="Email address"
                          />
                        </div>

                        {/* Phone */}
                        <div>
                          <label className="form-label" htmlFor="espPhone">
                            Phone
                          </label>
                          <input
                            id="espPhone"
                            type="tel"
                            required
                            value={espPhone}
                            onChange={(e) => setEspPhone(e.target.value)}
                            className="form-input text-base"
                            placeholder="Phone number"
                          />
                        </div>

                        {/* Institution */}
                        <div>
                          <label className="form-label" htmlFor="espInstitution">
                            Institution
                          </label>
                          <input
                            id="espInstitution"
                            type="text"
                            required
                            value={espInstitution}
                            onChange={(e) => setEspInstitution(e.target.value)}
                            className="form-input text-base"
                            placeholder="College / Institution"
                          />
                        </div>
                      </div>

                      {/* Player Rows (Name plus in-game ID, starting at 1, add and remove) */}
                      <div className="pt-4 border-t border-[#EAEAF2]">
                        <div className="flex items-center justify-between mb-3">
                          <label className="form-label mb-0">Player Roster</label>
                          <button
                            type="button"
                            onClick={addPlayerRow}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1719C9] hover:underline"
                          >
                            <Plus size={14} />
                            <span>Add player</span>
                          </button>
                        </div>

                        <div className="flex flex-col gap-3">
                          {espPlayers.map((player, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col sm:flex-row items-center gap-3 p-3 bg-[#F8F7FC] rounded-xl border border-[#EAEAF2]"
                            >
                              <span className="text-xs font-bold text-[#52527A] w-16 flex-shrink-0">
                                Player {idx + 1}
                              </span>
                              <input
                                type="text"
                                required
                                value={player.name}
                                onChange={(e) => updatePlayerRow(idx, "name", e.target.value)}
                                className="form-input text-base flex-1"
                                placeholder="Player name"
                              />
                              <input
                                type="text"
                                required
                                value={player.gamerId}
                                onChange={(e) => updatePlayerRow(idx, "gamerId", e.target.value)}
                                className="form-input text-base flex-1"
                                placeholder="In-game ID"
                              />
                              {espPlayers.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removePlayerRow(idx)}
                                  aria-label={`Remove Player ${idx + 1}`}
                                  className="text-red-500 hover:text-red-700 p-2"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Rules Checkbox */}
                      <div className="pt-2">
                        <label className="flex items-start gap-2.5 cursor-pointer text-sm font-medium text-[#151535]">
                          <input
                            type="checkbox"
                            required
                            checked={espRulesAgreed}
                            onChange={(e) => setEspRulesAgreed(e.target.checked)}
                            className="mt-1 w-4 h-4 rounded border-[#EAEAF2]"
                          />
                          <span>Tournament rules [to be approved]</span>
                        </label>
                      </div>

                      {/* Required Privacy Policy Checkbox */}
                      <div>
                        <label className="flex items-start gap-2.5 cursor-pointer text-sm font-medium text-[#151535]">
                          <input
                            type="checkbox"
                            required
                            checked={espPrivacyAgreed}
                            onChange={(e) => setEspPrivacyAgreed(e.target.checked)}
                            className="mt-1 w-4 h-4 rounded border-[#EAEAF2]"
                          />
                          <span>I agree to the privacy policy [text to be approved]</span>
                        </label>
                      </div>

                      {/* Submit */}
                      <div className="pt-4">
                        <button
                          type="submit"
                          disabled={submitState === "submitting" || !isEndpointConfigured}
                          className="btn-primary w-full"
                          style={{ height: 52 }}
                        >
                          {submitState === "submitting" ? "Submitting..." : "Submit Registration"}
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}

              {/* Below the form: the helpdesk email and both Instagram pages */}
              <div className="mt-8 pt-6 border-t border-[#EAEAF2] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#52527A]">
                <div>
                  <span className="font-semibold text-[#151535]">Helpdesk:</span>{" "}
                  <a
                    href={`mailto:${CONFIG.HELPDESK_EMAIL}`}
                    className="text-[#1719C9] underline"
                  >
                    {CONFIG.HELPDESK_EMAIL}
                  </a>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    <strong>Instagram:</strong>{" "}
                    {instaBasavanagudi.url ? (
                      <a
                        href={instaBasavanagudi.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1719C9] underline"
                      >
                        {instaBasavanagudi.name}
                      </a>
                    ) : (
                      <span className="text-[#52527A] italic">{instaBasavanagudi.name} (TBA)</span>
                    )}
                  </span>
                  <span>·</span>
                  <span>
                    {instaNcba.url ? (
                      <a
                        href={instaNcba.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1719C9] underline"
                      >
                        {instaNcba.name}
                      </a>
                    ) : (
                      <span className="text-[#52527A] italic">{instaNcba.name} (TBA)</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
