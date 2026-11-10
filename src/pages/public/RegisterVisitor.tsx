import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHero } from "@/components/PageLayout";
import { ConfirmationCard, Field, ReviewRow, StepIndicator, SubmitError } from "@/components/registration/RegistrationUI";
import { supabase } from "@/lib/supabase";
import { isValidEmail, isValidName, isValidPhone } from "@/lib/validation";

const VISITOR_CATEGORIES = [
  "School student",
  "College student",
  "Teacher or educator",
  "Parent or guardian",
  "Working professional",
  "General visitor",
  "Other",
];

interface Draft {
  fullName: string;
  email: string;
  phone: string;
  institution: string;
  category: string;
  website: string;
  consent: boolean;
}

const STEPS = ["About you", "Visit details", "Review"];

const initialDraft: Draft = {
  fullName: "", email: "", phone: "", institution: "", category: "", website: "", consent: false,
};

type Errors = Record<string, string>;

function validateStep(step: number, draft: Draft): Errors {
  const errors: Errors = {};
  if (step === 0) {
    if (!isValidName(draft.fullName, 120)) errors.fullName = "Enter your full name (2 to 120 characters).";
    if (!isValidEmail(draft.email)) errors.email = "Enter a valid email address.";
    if (!isValidPhone(draft.phone)) errors.phone = "Enter a valid mobile number (10 to 15 digits).";
  }
  if (step === 1) {
    if (draft.institution.trim().length > 120) errors.institution = "Keep this under 120 characters.";
    if (!VISITOR_CATEGORIES.includes(draft.category)) errors.category = "Select the category that describes you.";
  }
  return errors;
}

function submitMessage(message: string | undefined) {
  if (message?.includes("Duplicate")) return "A visitor registration already exists for this email address.";
  if (message?.includes("Too many")) return "Too many submissions from this email address. Please try again later.";
  return "We could not submit your registration. Please check your details and try again.";
}

export default function RegisterVisitor() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const goNext = () => {
    const nextErrors = validateStep(step, draft);
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
    if (!draft.consent) reviewErrors.consent = "Please agree to the privacy notice to continue.";
    setErrors(reviewErrors);
    if (Object.keys(reviewErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    const { data, error } = await supabase.rpc("submit_visitor_registration", {
      p_full_name: draft.fullName.trim(),
      p_email: draft.email.trim(),
      p_phone: draft.phone,
      p_institution: draft.institution.trim(),
      p_visitor_category: draft.category,
      p_consent: draft.consent,
      p_website: draft.website,
    });
    setSubmitting(false);

    if (error || typeof data !== "string" || data.length === 0) {
      console.error("visitor registration failed", error);
      setSubmitError(submitMessage(error?.message));
      return;
    }
    setReference(data);
  };

  if (reference) {
    return (
      <>
        <PageHero title="Visitor Registration" subtitle="Thank you for planning your visit to Supernova 3.0." />
        <section className="container section">
          <ConfirmationCard reference={reference} title="You are registered">
            <p>Keep this reference for your records. Event dates: 20–21 November 2026. Venue: The National College.</p>
            <p style={{ marginTop: 12 }}>Entry arrangements, fees and attendance rules: To be announced.</p>
            <p style={{ marginTop: 24 }}><Link to="/schedule" className="btn btn-secondary">View the schedule</Link></p>
          </ConfirmationCard>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHero title="Visitor Registration" subtitle="Welcome. Register in a few short steps to visit Supernova 3.0 on 20–21 November 2026 at The National College." />
      <section className="container section" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 40, alignItems: "start" }}>
        <div>
          <StepIndicator steps={STEPS} current={step} />
          <form onSubmit={submit} noValidate style={{ position: "relative" }}>
            {step === 0 && (
              <div style={{ display: "grid", gap: 20 }}>
                <Field label="Full name" error={errors.fullName}>
                  <input className="input" value={draft.fullName} maxLength={120} autoComplete="name" onChange={(e) => update("fullName", e.target.value)} />
                </Field>
                <Field label="Email address" error={errors.email}>
                  <input className="input" type="email" value={draft.email} autoComplete="email" onChange={(e) => update("email", e.target.value)} />
                </Field>
                <Field label="Mobile number" error={errors.phone}>
                  <input className="input" type="tel" value={draft.phone} autoComplete="tel" onChange={(e) => update("phone", e.target.value)} />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div style={{ display: "grid", gap: 20 }}>
                <Field label="Visitor category" error={errors.category}>
                  <select className="input" value={draft.category} onChange={(e) => update("category", e.target.value)}>
                    <option value="">Select a category</option>
                    {VISITOR_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </Field>
                <Field label="Institution or organisation (optional)" error={errors.institution}>
                  <input className="input" value={draft.institution} maxLength={120} onChange={(e) => update("institution", e.target.value)} />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: "grid", gap: 24 }}>
                <div className="card" style={{ padding: 24 }}>
                  <ReviewRow label="Full name" value={draft.fullName} />
                  <ReviewRow label="Email" value={draft.email} />
                  <ReviewRow label="Mobile" value={draft.phone} />
                  <ReviewRow label="Category" value={draft.category} />
                  <ReviewRow label="Institution" value={draft.institution} />
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Edit about you</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Edit visit details</button>
                  </div>
                </div>
                <label style={{ display: "flex", gap: 12, alignItems: "flex-start", color: "var(--ink-soft)", fontSize: ".92rem" }}>
                  <input type="checkbox" checked={draft.consent} onChange={(e) => update("consent", e.target.checked)} style={{ marginTop: 4 }} />
                  <span>I agree to the privacy notice. My details will be used only to manage my visit registration.</span>
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
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit registration"}
                </button>
              </div>
            )}
            <SubmitError message={submitError} />

            {step < STEPS.length - 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 32 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</button>
                <button type="button" className="btn btn-primary" onClick={goNext}>Continue</button>
              </div>
            )}
          </form>
        </div>

        <aside className="card" style={{ padding: 24, position: "sticky", top: 96 }}>
          <p style={{ fontWeight: 700, marginBottom: 12 }}>What happens next</p>
          <p style={{ color: "var(--ink-soft)", fontSize: ".9rem", lineHeight: 1.6 }}>
            You will receive a registration reference on this page once your details are saved.
            Guardian consent for school students: To be announced.
          </p>
          <p style={{ marginTop: 16, color: "var(--ink-soft)", fontSize: ".9rem" }}>
            Competing as a team? <Link to="/register/esports" style={{ color: "var(--sky-deep)", fontWeight: 600 }}>Register for Esports</Link>
          </p>
        </aside>
      </section>
    </>
  );
}
