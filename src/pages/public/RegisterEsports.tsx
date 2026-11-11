import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHero } from "@/components/PageLayout";
import { ConfirmationCard, Field, ReviewRow, StepIndicator, SubmitError } from "@/components/registration/RegistrationUI";
import { supabase } from "@/lib/supabase";
import { isValidEmail, isValidName, isValidPhone } from "@/lib/validation";
import { getOfficialTeamSize } from "@/utils/esportsRules";

interface GameOption {
  id: string;
  title: string;
  team_size: number | null;
  rules: string | null;
}

interface PlayerDraft {
  name: string;
  gamerId: string;
}

interface Draft {
  teamName: string;
  gameId: string;
  institution: string;
  repName: string;
  email: string;
  phone: string;
  players: PlayerDraft[];
  website: string;
  consent: boolean;
}

const STEPS = ["Team", "Representative", "Players", "Review"];

const initialDraft: Draft = {
  teamName: "", gameId: "", institution: "", repName: "", email: "", phone: "",
  players: [{ name: "", gamerId: "" }], website: "", consent: false,
};

type Errors = Record<string, string>;

function validateStep(step: number, draft: Draft, teamSize: number | null): Errors {
  const errors: Errors = {};
  if (step === 0) {
    if (!isValidName(draft.teamName, 80)) errors.teamName = "Enter a team name of 2 to 80 characters.";
    if (!draft.gameId) errors.gameId = "Select a game.";
    if (!isValidName(draft.institution, 120)) errors.institution = "Enter your institution or organisation.";
  }
  if (step === 1) {
    if (!isValidName(draft.repName)) errors.repName = "Enter the representative's full name.";
    if (!isValidEmail(draft.email)) errors.email = "Enter a valid email address.";
    if (!isValidPhone(draft.phone)) errors.phone = "Enter a valid mobile number (10 to 15 digits).";
  }
  if (step === 2) {
    if (teamSize !== null && draft.players.length !== teamSize) {
      errors.players = `This game needs exactly ${teamSize} players.`;
    }
    draft.players.forEach((player, index) => {
      if (!isValidName(player.name)) errors[`player-${index}`] = "Enter the player's full name (2 to 80 characters).";
      if (!isValidName(player.gamerId, 40)) errors[`gamer-${index}`] = "Enter the player's game ID (2 to 40 characters).";
    });
  }
  return errors;
}

import type { RegistrationControl } from "@/types/database";
import { Lock } from "lucide-react";

function submitMessage(message: string | undefined) {
  if (message?.includes("Registrations are closed") || message?.includes("closed")) {
    return message.replace("Registrations are closed:", "").trim() || "Esports registrations are currently closed.";
  }
  if (message?.includes("Duplicate")) return "This team is already registered for this game with the same email address.";
  if (message?.includes("Too many")) return "Too many submissions from this email address. Please try again later.";
  return "We could not submit your registration. Please check your details and try again.";
}

export default function RegisterEsports() {
  const [games, setGames] = useState<GameOption[] | null>(null);
  const [gamesError, setGamesError] = useState(false);
  const [control, setControl] = useState<RegistrationControl | null>(null);
  const [controlLoading, setControlLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("registration_controls")
      .select("*")
      .eq("form_type", "esports")
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setControl(data[0] as RegistrationControl);
        }
        setControlLoading(false);
      });

    supabase
      .from("games")
      .select("id, title, team_size, rules")
      .eq("is_active", true)
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("games load failed", error);
          setGamesError(true);
          return;
        }
        setGames((data ?? []) as GameOption[]);
      });
  }, []);

  const isClosed = Boolean(
    control && (
      !control.is_open ||
      (control.opens_at && new Date() < new Date(control.opens_at)) ||
      (control.closes_at && new Date() > new Date(control.closes_at))
    )
  );

  const selectedGame = games?.find((game) => game.id === draft.gameId) ?? null;
  const teamSize = selectedGame ? getOfficialTeamSize(selectedGame.title, selectedGame.team_size) : null;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const selectGame = (gameId: string) => {
    const game = games?.find((item) => item.id === gameId) ?? null;
    const requiredSize = game ? getOfficialTeamSize(game.title, game.team_size) : null;
    setDraft((current) => ({
      ...current,
      gameId,
      players: requiredSize ? Array.from({ length: requiredSize }, (_, i) => current.players[i] ?? { name: "", gamerId: "" }) : current.players,
    }));
    setErrors((current) => ({ ...current, gameId: "" }));
  };

  const setPlayer = (index: number, field: keyof PlayerDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      players: current.players.map((player, i) => (i === index ? { ...player, [field]: value } : player)),
    }));
    setErrors((current) => ({ ...current, [`player-${index}`]: "", [`gamer-${index}`]: "" }));
  };

  const addPlayer = () => setDraft((current) => ({ ...current, players: [...current.players, { name: "", gamerId: "" }] }));
  const removePlayer = (index: number) =>
    setDraft((current) => ({ ...current, players: current.players.filter((_, i) => i !== index) }));

  const goNext = () => {
    const nextErrors = validateStep(step, draft, teamSize);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setStep(step + 1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (step !== STEPS.length - 1) {
      goNext();
      return;
    }
    if (submitting) return;
    const reviewErrors: Errors = {};
    if (!draft.consent) reviewErrors.consent = "You must agree to the tournament rules and privacy notice.";
    setErrors(reviewErrors);
    if (Object.keys(reviewErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    const { data, error } = await supabase.rpc("submit_esports_registration", {
      p_team_name: draft.teamName.trim(),
      p_game_id: draft.gameId,
      p_institution: draft.institution.trim(),
      p_captain_name: draft.repName.trim(),
      p_email: draft.email.trim(),
      p_phone: draft.phone,
      p_players: (teamSize ? draft.players.slice(0, teamSize) : draft.players).map((player) => ({
        player_name: player.name.trim(),
        gamer_tag: player.gamerId.trim(),
      })),
      p_consent: draft.consent,
      p_website: draft.website,
    });
    setSubmitting(false);

    if (error || typeof data !== "string" || data.length === 0) {
      console.error("esports registration failed", error);
      setSubmitError(submitMessage(error?.message));
      return;
    }
    setReference(data);
  };

  if (reference) {
    return (
      <>
        <PageHero title="Esports Registration" subtitle="Supernova 3.0 Esports Tournament, second edition." />
        <section className="container section">
          <ConfirmationCard reference={reference} title="Your team is registered">
            <p>Keep this reference for your records. The organisers will contact your representative using the email address you provided.</p>
            <p style={{ marginTop: 12 }}>Registration fees, deadlines and tournament rules: To be announced.</p>
            <p style={{ marginTop: 24 }}><Link to="/esports" className="btn btn-secondary">Back to the esports page</Link></p>
          </ConfirmationCard>
        </section>
      </>
    );
  }

  if (isClosed && !controlLoading) {
    return (
      <>
        <PageHero
          title="Esports Registration"
          subtitle="Supernova 3.0 Collegiate Championships · The National College"
        />
        <section className="container section">
          <div className="card" style={{ maxWidth: 600, margin: "0 auto", padding: "48px 32px", textAlign: "center", background: "#ffffff" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.12)",
                color: "#ef4444",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 20px",
              }}
            >
              <Lock size={32} />
            </div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--ink)", marginBottom: 12 }}>
              Registrations Are Currently Closed
            </h2>
            <p style={{ color: "var(--ink-soft)", fontSize: "1rem", lineHeight: 1.6, marginBottom: 28 }}>
              {control?.closed_message || "Registrations are now closed for Supernova 3.0 Esports Tournament."}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <Link to="/register" className="btn btn-secondary">
                View All Pathways
              </Link>
              <Link to="/esports" className="btn btn-primary">
                Explore Esports Page
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  const isLast = step === STEPS.length - 1;

  return (
    <>
      <PageHero
        title="Esports Registration"
        subtitle={control?.intro_text || "Register your team for the Supernova 3.0 Esports Tournament. The National College, 20–21 November 2026."}
      />
      <section className="container section" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 40, alignItems: "start" }}>
        <div>
          <StepIndicator steps={STEPS} current={step} />
          <form onSubmit={submit} noValidate>
            {step === 0 && (
              <div style={{ display: "grid", gap: 20 }}>
                <Field label="Team name" error={errors.teamName}>
                  <input className="input" value={draft.teamName} maxLength={80} onChange={(e) => update("teamName", e.target.value)} />
                </Field>
                <Field label="Game" error={errors.gameId}>
                  {gamesError ? (
                    <p className="tbd">Games could not be loaded. Please refresh the page.</p>
                  ) : games === null ? (
                    <p className="tbd">Loading games…</p>
                  ) : games.length === 0 ? (
                    <p className="tbd">No game is open for registration yet. Game titles: To be announced.</p>
                  ) : (
                    <select className="input" value={draft.gameId} onChange={(e) => selectGame(e.target.value)}>
                      <option value="">Select a game</option>
                      {games.map((game) => <option key={game.id} value={game.id}>{game.title}</option>)}
                    </select>
                  )}
                </Field>
                {selectedGame && (
                  <div className="card" style={{ padding: 20 }}>
                    <p style={{ fontWeight: 700 }}>Team size: {teamSize ?? "To be announced"}</p>
                    <p style={{ marginTop: 8, color: "var(--ink-soft)", whiteSpace: "pre-wrap" }}>{selectedGame.rules || "Tournament rules: To be announced."}</p>
                  </div>
                )}
                <Field label="Institution or organisation" error={errors.institution}>
                  <input className="input" value={draft.institution} maxLength={120} onChange={(e) => update("institution", e.target.value)} />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div style={{ display: "grid", gap: 20 }}>
                <Field label="Team representative's full name" error={errors.repName}>
                  <input className="input" value={draft.repName} maxLength={80} autoComplete="name" onChange={(e) => update("repName", e.target.value)} />
                </Field>
                <Field label="Email address" error={errors.email}>
                  <input className="input" type="email" value={draft.email} autoComplete="email" onChange={(e) => update("email", e.target.value)} />
                </Field>
                <Field label="Mobile number" error={errors.phone}>
                  <input className="input" type="tel" value={draft.phone} autoComplete="tel" onChange={(e) => update("phone", e.target.value)} />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: "grid", gap: 16 }}>
                <p style={{ color: "var(--ink-soft)" }}>
                  Team size: {teamSize ?? "To be announced"}.
                  {teamSize === null && " Add the players in your team."}
                </p>
                {errors.players && <p role="alert" style={{ color: "#b42318", fontSize: ".85rem" }}>{errors.players}</p>}
                {draft.players.map((player, index) => (
                  <div key={index} style={{ display: "grid", gap: 16, padding: 20, border: "1px solid var(--line)", borderRadius: 16 }}>
                    <Field label={`Player ${index + 1} full name`} error={errors[`player-${index}`]}>
                      <input className="input" value={player.name} maxLength={80} onChange={(e) => setPlayer(index, "name", e.target.value)} />
                    </Field>
                    <Field label={`Player ${index + 1} game ID`} error={errors[`gamer-${index}`]}>
                      <input className="input" value={player.gamerId} maxLength={40} onChange={(e) => setPlayer(index, "gamerId", e.target.value)} />
                    </Field>
                    {teamSize === null && draft.players.length > 1 && (
                      <button type="button" className="btn btn-ghost" onClick={() => removePlayer(index)} aria-label={`Remove player ${index + 1}`} style={{ justifySelf: "start" }}>Remove player</button>
                    )}
                  </div>
                ))}
                {teamSize === null && (
                  <button type="button" className="btn btn-secondary" onClick={addPlayer} style={{ justifySelf: "start" }}>Add player</button>
                )}
              </div>
            )}

            {step === 3 && (
              <div style={{ display: "grid", gap: 24 }}>
                <div className="card" style={{ padding: 24 }}>
                  <ReviewRow label="Team name" value={draft.teamName} />
                  <ReviewRow label="Game" value={selectedGame?.title ?? ""} />
                  <ReviewRow label="Institution" value={draft.institution} />
                  <ReviewRow label="Representative" value={draft.repName} />
                  <ReviewRow label="Email" value={draft.email} />
                  <ReviewRow label="Mobile" value={draft.phone} />
                  <ReviewRow label="Players" value={draft.players.map((player) => `${player.name.trim()} (ID: ${player.gamerId.trim()})`).join(", ")} />
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Edit team</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Edit representative</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>Edit players</button>
                  </div>
                </div>
                <label style={{ display: "flex", gap: 12, alignItems: "flex-start", color: "var(--ink-soft)", fontSize: ".92rem" }}>
                  <input type="checkbox" checked={draft.consent} onChange={(e) => update("consent", e.target.checked)} style={{ marginTop: 4 }} />
                  <span>I agree to the approved tournament rules and the privacy notice. I understand my details will be used only to manage this registration. Rules: To be announced.</span>
                </label>
                {errors.consent && <p role="alert" style={{ color: "#b42318", fontSize: ".85rem" }}>{errors.consent}</p>}
                <input
                  type="text"
                  name="website"
                  value={draft.website}
                  onChange={(e) => update("website", e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ position: "absolute", left: "-10000px", width: 1, height: 1, opacity: 0 }}
                />
                <button type="submit" className="btn btn-primary" disabled={submitting || games === null || games.length === 0}>
                  {submitting ? "Submitting…" : "Submit registration"}
                </button>
              </div>
            )}
            <SubmitError message={submitError} />

            {!isLast && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 32 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</button>
                <button type="button" className="btn btn-primary" onClick={goNext}>Continue</button>
              </div>
            )}
          </form>
        </div>

        <aside className="card" style={{ padding: 24, position: "sticky", top: 96 }}>
          <p style={{ fontWeight: 700, marginBottom: 12 }}>Before you register</p>
          <p style={{ color: "var(--ink-soft)", fontSize: ".9rem", lineHeight: 1.6 }}>
            Registration fee: To be announced.<br />
            Registration deadline: To be announced.<br />
            Eligibility: To be announced.
          </p>
          <p style={{ marginTop: 16, color: "var(--ink-soft)", fontSize: ".9rem" }}>
            Visitor? <Link to="/register/visitor" style={{ color: "var(--sky-deep)", fontWeight: 600 }}>Register as a visitor</Link>
          </p>
        </aside>
      </section>
    </>
  );
}
