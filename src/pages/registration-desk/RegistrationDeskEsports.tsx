import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  getEducationSuggestionsForType,
  getGameClosedDisplayMessage,
  normalizeEsportsGameAvailabilityList,
  PLAYER_INSTITUTION_TYPES,
} from "@/lib/esportsRegistrationControls";
import {
  getOfficialTeamSize,
  validateEsportsRosterWithEducation,
  type PlayerFieldErrors,
  type PlayerInput,
} from "@/utils/esportsRules";
import { isValidEmail, isValidInstitution, isValidName, isValidPhone } from "@/lib/validation";
import type { EsportsGameAvailability, Game, RegistrationControl } from "@/types/database";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Gamepad2,
  Lock,
  RefreshCw,
} from "lucide-react";

const EMPTY_PLAYER = (): Required<PlayerInput> => ({
  name: "",
  inGameId: "",
  institutionType: "",
  institutionName: "",
  courseOrClass: "",
  currentYearOrClass: "",
});

export default function RegistrationDeskEsports() {
  const { hasPermission } = useAuth();
  const canCreateEsports = hasPermission("esports:create");
  const submitLockRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const cachedPlayersRef = useRef<Required<PlayerInput>[]>([]);

  const [loadingGames, setLoadingGames] = useState(true);
  const [availabilityList, setAvailabilityList] = useState<EsportsGameAvailability[]>([]);
  const [portalControl, setPortalControl] = useState<RegistrationControl | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string>("");

  // Team & Captain Details
  const [teamName, setTeamName] = useState("");
  const [captainName, setCaptainName] = useState("");
  const [captainEmail, setCaptainEmail] = useState("");
  const [captainPhone, setCaptainPhone] = useState("");
  const [institution, setInstitution] = useState("");
  const [players, setPlayers] = useState<Required<PlayerInput>[]>([
    EMPTY_PLAYER(),
    EMPTY_PLAYER(),
    EMPTY_PLAYER(),
    EMPTY_PLAYER(),
    EMPTY_PLAYER(),
  ]);
  const [rulesAgreed, setRulesAgreed] = useState(false);
  const [consentAgreed, setConsentAgreed] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [playerErrors, setPlayerErrors] = useState<Record<number, PlayerFieldErrors>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submittedApplication, setSubmittedApplication] = useState<{
    applicationRef: string;
    teamName: string;
    gameTitle: string;
    captainName: string;
    playerCount: number;
  } | null>(null);

  const loadAvailability = useCallback(async () => {
    setLoadingGames(true);
    try {
      const [availRes, gamesRes, regsRes, ctrlRes] = await Promise.all([
        supabase.rpc("get_esports_registration_availability"),
        supabase.from("games").select("*").order("sort_order", { ascending: true }),
        supabase.from("registrations").select("id, game_id, status, admin_notes, submitted_at, archived_at"),
        supabase.from("registration_controls").select("*").eq("form_type", "esports").limit(1),
      ]);

      const loadedGames = !gamesRes.error && Array.isArray(gamesRes.data) ? (gamesRes.data as Game[]) : [];
      const loadedRegs = !regsRes.error && Array.isArray(regsRes.data) ? (regsRes.data as any[]) : [];
      const espCtrl =
        !ctrlRes.error && Array.isArray(ctrlRes.data) && ctrlRes.data.length > 0
          ? (ctrlRes.data[0] as RegistrationControl)
          : null;

      const list = normalizeEsportsGameAvailabilityList({
        rpcRows: !availRes.error && Array.isArray(availRes.data) ? availRes.data : [],
        games: loadedGames,
        registrations: loadedRegs,
        portalControl: espCtrl,
      }).filter((g) => g.is_active && g.is_published);

      setPortalControl(espCtrl);
      setAvailabilityList(list);

      setSelectedGameId((prev) => {
        if (prev && list.some((g) => g.id === prev)) return prev;
        const firstOpen = list.find((g) => g.is_effectively_open) || list[0];
        if (firstOpen) {
          const size = getOfficialTeamSize(firstOpen.title, firstOpen.team_size);
          setPlayers(Array.from({ length: size }, (_, i) => cachedPlayersRef.current[i] || EMPTY_PLAYER()));
          return firstOpen.id;
        }
        return "";
      });
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to load esports game availability.");
    } finally {
      setLoadingGames(false);
    }
  }, []);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const selectedGame = useMemo(
    () => availabilityList.find((g) => g.id === selectedGameId) || null,
    [availabilityList, selectedGameId]
  );

  const requiredPlayerCount = selectedGame
    ? getOfficialTeamSize(selectedGame.title, selectedGame.team_size)
    : 4;

  const portalClosedMessage = (() => {
    if (!portalControl) return null;
    const now = new Date();
    if (!portalControl.is_open) {
      return portalControl.closed_message?.trim() || "Esports registrations are currently closed.";
    }
    if (portalControl.opens_at && now < new Date(portalControl.opens_at)) {
      return "Esports registrations have not opened yet.";
    }
    if (portalControl.closes_at && now > new Date(portalControl.closes_at)) {
      return "Esports registrations have closed.";
    }
    return null;
  })();

  const selectedGameClosedMsg = selectedGame
    ? getGameClosedDisplayMessage(selectedGame, portalClosedMessage)
    : portalClosedMessage;
  const selectedGameClosed = Boolean(
    (selectedGame && !selectedGame.is_effectively_open) || portalClosedMessage
  );

  const handleSelectGame = (game: EsportsGameAvailability) => {
    setSelectedGameId(game.id);
    setSubmitError(null);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.selectedGameId;
      return next;
    });
    setPlayerErrors({});

    const nextCount = getOfficialTeamSize(game.title, game.team_size);
    setPlayers((prev) => {
      prev.forEach((p, idx) => {
        cachedPlayersRef.current[idx] = { ...p };
      });
      return Array.from({ length: nextCount }, (_, i) => ({
        ...(prev[i] || cachedPlayersRef.current[i] || EMPTY_PLAYER()),
      }));
    });
  };

  const handlePlayerFieldChange = (
    idx: number,
    field: keyof Required<PlayerInput>,
    value: string
  ) => {
    setPlayers((prev) => {
      const next = prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row));
      if (next[idx]) cachedPlayersRef.current[idx] = { ...next[idx] };
      return next;
    });
    setPlayerErrors((prev) => {
      const rowErr = prev[idx];
      if (!rowErr || !rowErr[field]) return prev;
      const updated = { ...rowErr };
      delete updated[field];
      return { ...prev, [idx]: updated };
    });
  };

  const applyTeamInstitutionToPlayers = () => {
    const cleanInst = institution.trim();
    if (!cleanInst) return;
    setPlayers((prev) =>
      prev.map((row, idx) => {
        const updated = row.institutionName.trim() ? row : { ...row, institutionName: cleanInst };
        cachedPlayersRef.current[idx] = updated;
        return updated;
      })
    );
  };

  const resetForNextSquad = () => {
    setTeamName("");
    setCaptainName("");
    setCaptainEmail("");
    setCaptainPhone("");
    setInstitution("");
    setRulesAgreed(false);
    setConsentAgreed(true);
    setFieldErrors({});
    setPlayerErrors({});
    setSubmitError(null);
    setSubmittedApplication(null);
    cachedPlayersRef.current = [];
    setPlayers(Array.from({ length: requiredPlayerCount }, () => EMPTY_PLAYER()));
  };

  const clearFieldErr = (key: string) => {
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
      const target =
        root.querySelector<HTMLElement>('[aria-invalid="true"]') ||
        root.querySelector<HTMLElement>('[role="alert"]');
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        if (typeof (target as any).focus === "function" && target.tagName !== "P" && target.tagName !== "DIV") {
          target.focus({ preventScroll: true });
        }
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateEsports || submitLockRef.current || isSubmitting) return;

    const errors: Record<string, string> = {};
    if (!selectedGame) {
      errors.selectedGameId = "Please select a game title.";
    } else if (selectedGameClosed) {
      errors.selectedGameId =
        selectedGameClosedMsg || `Registrations for ${selectedGame.title} are currently closed.`;
    }
    if (!isValidName(teamName, 100)) {
      errors.teamName = "Enter a valid team name (2 to 100 characters).";
    }
    if (!isValidName(captainName, 120)) {
      errors.captainName = "Enter the captain / representative full name.";
    }
    if (!isValidEmail(captainEmail)) {
      errors.captainEmail = "Enter a valid representative email address.";
    }
    if (!isValidPhone(captainPhone)) {
      errors.captainPhone = "Enter a valid 10–15 digit mobile number.";
    }
    if (!isValidInstitution(institution, 150)) {
      errors.institution = "Enter the team's primary college / institution name.";
    }
    if (!rulesAgreed) {
      errors.rulesAgreed = "Confirm the squad agrees to the official tournament rules.";
    }
    if (!consentAgreed) {
      errors.consentAgreed = "Consent is required to submit the esports application.";
    }

    const activeRoster = players.slice(0, requiredPlayerCount);
    const rosterCheck = validateEsportsRosterWithEducation(
      selectedGame?.title || "Esports",
      activeRoster
    );

    if (Object.keys(errors).length > 0 || !rosterCheck.isValid) {
      setFieldErrors(errors);
      setPlayerErrors(rosterCheck.playerErrors);
      setSubmitError(
        errors.selectedGameId ||
          Object.values(errors)[0] ||
          rosterCheck.errorMessage ||
          "Please complete all squad & player education fields."
      );
      focusFirstInvalidControl();
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    setPlayerErrors({});

    try {
      const playersPayload = activeRoster.map((p) => ({
        player_name: p.name.trim(),
        gamer_tag: p.inGameId.trim(),
        institution_type: p.institutionType,
        institution_name: p.institutionName.trim(),
        course_or_class: p.courseOrClass.trim(),
        current_year_or_class: p.currentYearOrClass.trim(),
      }));

      const { data, error } = await supabase.rpc("submit_esports_registration", {
        p_team_name: teamName.trim(),
        p_game_id: selectedGame!.id,
        p_institution: institution.trim(),
        p_captain_name: captainName.trim(),
        p_email: captainEmail.trim().toLowerCase(),
        p_phone: captainPhone.trim(),
        p_players: playersPayload,
        p_consent: true,
        p_website: "",
      });

      if (error) throw error;

      const applicationRef = typeof data === "string" ? data : "SN3-ESPORTS";
      setSubmittedApplication({
        applicationRef,
        teamName: teamName.trim(),
        gameTitle: selectedGame!.title,
        captainName: captainName.trim(),
        playerCount: playersPayload.length,
      });

      // Refresh live slot counters immediately after submission
      await loadAvailability();
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to submit esports squad application.");
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight m-0">
            Esports Registration
          </h1>
          <p className="text-sm text-slate-600 mt-1 mb-0">
            Fields marked * are required. Passes unlock after coordinator approval.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAvailability}
          disabled={loadingGames}
          className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-60 shrink-0"
        >
          <RefreshCw size={14} className={loadingGames ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {!canCreateEsports ? (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-3">
          <Lock size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm space-y-1">
            <p className="font-bold m-0">Esports Registration Permission Restricted</p>
            <p className="m-0 text-amber-900">
              Your account does not currently hold the <code className="font-mono text-xs">esports:create</code> permission. Contact a Super Admin if you need esports registration access restored.
            </p>
          </div>
        </div>
      ) : submittedApplication ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-3 pb-4 border-b border-slate-200">
            <CheckCircle2 size={24} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-700 m-0">
                Application Recorded
              </p>
              <h2 className="text-xl font-display font-bold text-slate-900 m-0 mt-0.5 break-words">
                {submittedApplication.teamName} · {submittedApplication.gameTitle}
              </h2>
              <p className="text-sm text-slate-600 mt-1 m-0">
                Reference: <strong className="font-mono text-slate-900">{submittedApplication.applicationRef}</strong>
              </p>
              <p className="text-xs text-slate-500 mt-0.5 m-0">
                Captain: {submittedApplication.captainName} · {submittedApplication.playerCount} Players
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-950">
            <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-bold m-0">Pending Approval</p>
              <p className="m-0 text-amber-900 leading-relaxed">
                This application awaits Esports Coordinator approval. The QR team pass will unlock once approved.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={resetForNextSquad}
              className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold cursor-pointer"
            >
              <Gamepad2 size={18} />
              <span>Register Next Team</span>
            </button>

            <Link
              to="/registration-desk/search"
              className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-sm font-semibold text-slate-800 no-underline"
            >
              <span>Check Application Status</span>
            </Link>
          </div>
        </div>
      ) : (
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* 1. Game Selector */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 m-0">
              1. Select Game *
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {availabilityList.map((game) => {
                const isSelected = game.id === selectedGameId;
                const teamSize = getOfficialTeamSize(game.title, game.team_size);
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => handleSelectGame(game)}
                    className={`text-left p-4 rounded-xl border transition-colors min-h-[88px] flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/70"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 w-full">
                      <span className="text-sm font-bold text-slate-900">{game.title}</span>
                      <span
                        className={`text-xs font-semibold ${
                          game.is_effectively_open ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {game.is_effectively_open
                          ? "Open"
                          : game.status_reason === "capacity_reached"
                          ? "Full"
                          : "Closed"}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-slate-600 space-y-0.5 tabular-nums">
                      <div>{teamSize} players required</div>
                      <div>
                        Teams: {game.total_registered_teams}
                        {game.max_teams !== null
                          ? ` / ${game.max_teams} (${game.slots_remaining ?? 0} left)`
                          : " · Open slots"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedGameClosed && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5 text-sm">
                <Lock size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong>{selectedGame?.title || "Esports"} Closed: </strong>
                  <span>{selectedGameClosedMsg}</span>
                </div>
              </div>
            )}
          </section>

          {/* 2. Team & Captain Details (Single Column Mobile-First) */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 m-0">
              2. Team & Captain Details
            </h2>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label htmlFor="desk-esp-team" className="text-sm font-semibold text-slate-800 block mb-1.5">
                  Team / Squad Name *
                </label>
                <input
                  id="desk-esp-team"
                  type="text"
                  required
                  aria-invalid={Boolean(fieldErrors.teamName)}
                  disabled={selectedGameClosed || isSubmitting}
                  value={teamName}
                  onChange={(e) => {
                    setTeamName(e.target.value);
                    clearFieldErr("teamName");
                  }}
                  placeholder="Official team name"
                  className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 ${
                    fieldErrors.teamName ? "border-rose-500" : "border-slate-300"
                  }`}
                />
                {fieldErrors.teamName && (
                  <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.teamName}</p>
                )}
              </div>

              <div>
                <label htmlFor="desk-esp-inst" className="text-sm font-semibold text-slate-800 block mb-1.5">
                  Primary College / Institution *
                </label>
                <input
                  id="desk-esp-inst"
                  type="text"
                  required
                  aria-invalid={Boolean(fieldErrors.institution)}
                  disabled={selectedGameClosed || isSubmitting}
                  value={institution}
                  onChange={(e) => {
                    setInstitution(e.target.value);
                    clearFieldErr("institution");
                  }}
                  placeholder="Represented college / school name"
                  className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 ${
                    fieldErrors.institution ? "border-rose-500" : "border-slate-300"
                  }`}
                />
                {fieldErrors.institution && (
                  <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.institution}</p>
                )}
              </div>

              <div>
                <label htmlFor="desk-esp-rep" className="text-sm font-semibold text-slate-800 block mb-1.5">
                  Captain / Representative Name *
                </label>
                <input
                  id="desk-esp-rep"
                  type="text"
                  autoComplete="name"
                  required
                  aria-invalid={Boolean(fieldErrors.captainName)}
                  disabled={selectedGameClosed || isSubmitting}
                  value={captainName}
                  onChange={(e) => {
                    setCaptainName(e.target.value);
                    clearFieldErr("captainName");
                  }}
                  placeholder="Captain full name"
                  className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 ${
                    fieldErrors.captainName ? "border-rose-500" : "border-slate-300"
                  }`}
                />
                {fieldErrors.captainName && (
                  <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.captainName}</p>
                )}
              </div>

              <div>
                <label htmlFor="desk-esp-email" className="text-sm font-semibold text-slate-800 block mb-1.5">
                  Captain Email Address *
                </label>
                <input
                  id="desk-esp-email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  required
                  aria-invalid={Boolean(fieldErrors.captainEmail)}
                  disabled={selectedGameClosed || isSubmitting}
                  value={captainEmail}
                  onChange={(e) => {
                    setCaptainEmail(e.target.value);
                    clearFieldErr("captainEmail");
                  }}
                  placeholder="captain@example.com"
                  className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 ${
                    fieldErrors.captainEmail ? "border-rose-500" : "border-slate-300"
                  }`}
                />
                {fieldErrors.captainEmail && (
                  <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.captainEmail}</p>
                )}
              </div>

              <div>
                <label htmlFor="desk-esp-phone" className="text-sm font-semibold text-slate-800 block mb-1.5">
                  Captain 10-Digit Mobile Number *
                </label>
                <input
                  id="desk-esp-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  aria-invalid={Boolean(fieldErrors.captainPhone)}
                  disabled={selectedGameClosed || isSubmitting}
                  value={captainPhone}
                  onChange={(e) => {
                    setCaptainPhone(e.target.value);
                    clearFieldErr("captainPhone");
                  }}
                  placeholder="9876543210"
                  className={`w-full h-12 px-4 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 ${
                    fieldErrors.captainPhone ? "border-rose-500" : "border-slate-300"
                  }`}
                />
                {fieldErrors.captainPhone && (
                  <p role="alert" className="text-sm text-rose-600 mt-1 m-0">{fieldErrors.captainPhone}</p>
                )}
              </div>
            </div>
          </section>

          {/* 3. Mandatory Player Roster + 4 Educational Fields */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 m-0">
                3. Players ({requiredPlayerCount} Required)
              </h2>
              <p className="text-sm text-slate-600 m-0">
                Every player must complete Name, In-Game ID, and all 4 education fields.
              </p>

              {institution.trim().length >= 2 && (
                <button
                  type="button"
                  disabled={selectedGameClosed || isSubmitting}
                  onClick={applyTeamInstitutionToPlayers}
                  className="min-h-[44px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  Copy Team Institution to Blank Players
                </button>
              )}
            </div>

            <div className="space-y-4">
              {players.slice(0, requiredPlayerCount).map((player, idx) => {
                const rowErr = playerErrors[idx] || {};
                const suggestions = getEducationSuggestionsForType(player.institutionType);
                const courseDatalistId = `desk-course-list-${idx}`;
                const yearDatalistId = `desk-year-list-${idx}`;

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
                  >
                    <div className="border-b border-slate-200 pb-2">
                      <span className="text-sm font-bold text-slate-900">
                        Player {idx + 1} {idx === 0 ? "· Captain" : ""}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3.5">
                      <div>
                        <label className="text-sm font-semibold text-slate-800 block mb-1">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          required
                          aria-invalid={Boolean(rowErr.name)}
                          disabled={selectedGameClosed || isSubmitting}
                          value={player.name}
                          onChange={(e) => handlePlayerFieldChange(idx, "name", e.target.value)}
                          placeholder={`Player ${idx + 1} name`}
                          className={`w-full h-12 px-3.5 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 ${
                            rowErr.name ? "border-rose-500" : "border-slate-300"
                          }`}
                        />
                        {rowErr.name && (
                          <p role="alert" className="text-xs text-rose-600 mt-1 m-0">{rowErr.name}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-semibold text-slate-800 block mb-1">
                          In-Game ID / UID *
                        </label>
                        <input
                          type="text"
                          required
                          aria-invalid={Boolean(rowErr.inGameId)}
                          disabled={selectedGameClosed || isSubmitting}
                          value={player.inGameId}
                          onChange={(e) => handlePlayerFieldChange(idx, "inGameId", e.target.value)}
                          placeholder={selectedGame?.title.includes("VALORANT") ? "Name#TAG" : "UID / Character ID"}
                          className={`w-full h-12 px-3.5 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 font-mono ${
                            rowErr.inGameId ? "border-rose-500" : "border-slate-300"
                          }`}
                        />
                        {rowErr.inGameId && (
                          <p role="alert" className="text-xs text-rose-600 mt-1 m-0">{rowErr.inGameId}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-semibold text-slate-800 block mb-1">
                          Institution Type *
                        </label>
                        <select
                          required
                          aria-invalid={Boolean(rowErr.institutionType)}
                          disabled={selectedGameClosed || isSubmitting}
                          value={player.institutionType}
                          onChange={(e) =>
                            handlePlayerFieldChange(idx, "institutionType", e.target.value)
                          }
                          className={`w-full h-12 px-3.5 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 ${
                            rowErr.institutionType ? "border-rose-500" : "border-slate-300"
                          }`}
                        >
                          <option value="">Select type...</option>
                          {PLAYER_INSTITUTION_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        {rowErr.institutionType && (
                          <p role="alert" className="text-xs text-rose-600 mt-1 m-0">{rowErr.institutionType}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-semibold text-slate-800 block mb-1">
                          School / College / Institution Name *
                        </label>
                        <input
                          type="text"
                          required
                          aria-invalid={Boolean(rowErr.institutionName)}
                          disabled={selectedGameClosed || isSubmitting}
                          value={player.institutionName}
                          onChange={(e) =>
                            handlePlayerFieldChange(idx, "institutionName", e.target.value)
                          }
                          placeholder="Full institution name"
                          className={`w-full h-12 px-3.5 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 ${
                            rowErr.institutionName ? "border-rose-500" : "border-slate-300"
                          }`}
                        />
                        {rowErr.institutionName && (
                          <p role="alert" className="text-xs text-rose-600 mt-1 m-0">{rowErr.institutionName}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-semibold text-slate-800 block mb-1">
                          {suggestions.courseLabel}
                        </label>
                        <input
                          type="text"
                          required
                          aria-invalid={Boolean(rowErr.courseOrClass)}
                          list={courseDatalistId}
                          disabled={selectedGameClosed || isSubmitting}
                          value={player.courseOrClass}
                          onChange={(e) =>
                            handlePlayerFieldChange(idx, "courseOrClass", e.target.value)
                          }
                          placeholder={suggestions.coursePlaceholder}
                          className={`w-full h-12 px-3.5 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 ${
                            rowErr.courseOrClass ? "border-rose-500" : "border-slate-300"
                          }`}
                        />
                        <datalist id={courseDatalistId}>
                          {suggestions.courseSuggestions.map((opt) => (
                            <option key={opt} value={opt} />
                          ))}
                        </datalist>
                        {rowErr.courseOrClass && (
                          <p role="alert" className="text-xs text-rose-600 mt-1 m-0">{rowErr.courseOrClass}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-sm font-semibold text-slate-800 block mb-1">
                          {suggestions.yearLabel}
                        </label>
                        <input
                          type="text"
                          required
                          aria-invalid={Boolean(rowErr.currentYearOrClass)}
                          list={yearDatalistId}
                          disabled={selectedGameClosed || isSubmitting}
                          value={player.currentYearOrClass}
                          onChange={(e) =>
                            handlePlayerFieldChange(idx, "currentYearOrClass", e.target.value)
                          }
                          placeholder={suggestions.yearPlaceholder}
                          className={`w-full h-12 px-3.5 rounded-xl border bg-white text-base text-slate-900 focus:outline-hidden focus:border-indigo-600 ${
                            rowErr.currentYearOrClass ? "border-rose-500" : "border-slate-300"
                          }`}
                        />
                        <datalist id={yearDatalistId}>
                          {suggestions.yearSuggestions.map((opt) => (
                            <option key={opt} value={opt} />
                          ))}
                        </datalist>
                        {rowErr.currentYearOrClass && (
                          <p role="alert" className="text-xs text-rose-600 mt-1 m-0">
                            {rowErr.currentYearOrClass}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4. Agreements & Submit */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer text-sm text-slate-700 min-h-[44px]">
              <input
                type="checkbox"
                aria-invalid={Boolean(fieldErrors.rulesAgreed)}
                checked={rulesAgreed}
                disabled={selectedGameClosed || isSubmitting}
                onChange={(e) => {
                  setRulesAgreed(e.target.checked);
                  clearFieldErr("rulesAgreed");
                }}
                className="mt-0.5 w-5 h-5 accent-indigo-600 rounded shrink-0"
              />
              <span>
                Squad agrees to official Supernova 3.0 tournament rules ({requiredPlayerCount} players, no substitutes).
              </span>
            </label>
            {fieldErrors.rulesAgreed && (
              <p role="alert" className="text-sm text-rose-600 m-0">{fieldErrors.rulesAgreed}</p>
            )}

            <label className="flex items-start gap-3 cursor-pointer text-sm text-slate-700 min-h-[44px]">
              <input
                type="checkbox"
                aria-invalid={Boolean(fieldErrors.consentAgreed)}
                checked={consentAgreed}
                disabled={selectedGameClosed || isSubmitting}
                onChange={(e) => {
                  setConsentAgreed(e.target.checked);
                  clearFieldErr("consentAgreed");
                }}
                className="mt-0.5 w-5 h-5 accent-indigo-600 rounded shrink-0"
              />
              <span>
                Details are accurate; entry passes issue upon Coordinator approval.
              </span>
            </label>
            {fieldErrors.consentAgreed && (
              <p role="alert" className="text-sm text-rose-600 m-0">{fieldErrors.consentAgreed}</p>
            )}

            {submitError && (
              <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 font-medium flex items-start gap-2.5">
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-600" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={selectedGameClosed || isSubmitting || !selectedGame}
                className="min-h-[48px] w-full px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  <>
                    <Gamepad2 size={18} />
                    <span>Submit Esports Application</span>
                  </>
                )}
              </button>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
