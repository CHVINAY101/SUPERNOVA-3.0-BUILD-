import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHero } from "@/components/PageLayout";
import { ConfirmationCard, Field, ReviewRow, StepIndicator, SubmitError } from "@/components/registration/RegistrationUI";
import { submitVisitorAndIssueTicket } from "@/lib/ticketClient";
import { isValidClassCourse, isValidEmail, isValidInstitution, isValidName } from "@/lib/validation";

interface Draft {
  fullName: string;
  email: string;
  studentClass: string;
  institution: string;
  website: string;
  consent: boolean;
}

const STEPS = ["Your details", "Review"];

const initialDraft: Draft = {
  fullName: "",
  email: "",
  studentClass: "",
  institution: "",
  website: "",
  consent: false,
};

type Errors = Record<string, string>;

function validateStep(step: number, draft: Draft): Errors {
  const errors: Errors = {};
  if (step === 0) {
    if (!isValidName(draft.fullName, 120)) errors.fullName = "Enter your full name (2 to 120 characters).";
    if (!isValidEmail(draft.email)) errors.email = "Enter a valid email address.";
    if (!isValidClassCourse(draft.studentClass, 120)) errors.studentClass = "Enter your Class / Course.";
    if (!isValidInstitution(draft.institution, 150)) errors.institution = "Enter your College / Institution Name.";
  }
  return errors;
}

function submitMessage(message: string | undefined) {
  if (message?.includes("Duplicate")) return "A visitor registration already exists for this email address.";
  if (message?.includes("Too many")) return "Too many submissions from this email address. Please try again later.";
  return message || "We could not submit your registration. Please check your details and try again.";
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
    if (submitting || draft.website) return;

    const fieldErrors = validateStep(0, draft);
    if (!draft.consent) fieldErrors.consent = "Please agree to the privacy notice to continue.";
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await submitVisitorAndIssueTicket({
        fullName: draft.fullName.trim(),
        email: draft.email.trim().toLowerCase(),
        phone: null,
        institution: draft.institution.trim(),
        visitorCategory: "Student",
        studentClass: draft.studentClass.trim(),
        daysAttending: "Both",
      });
      setReference(res.ticket?.ticket_ref || res.registrationRef);
    } catch (err: any) {
      console.error("visitor registration failed", err);
      setSubmitError(submitMessage(err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  if (reference) {
    return (
      <>
        <PageHero title="Visitor Registration" subtitle="Thank you for planning your visit to Supernova 3.0." />
        <section className="container section">
          <ConfirmationCard reference={reference} title="You are registered">
            <p>Keep this reference for your records. Event dates: 20–21 November 2026. Venue: The National College.</p>
            <p style={{ marginTop: 24 }}><Link to="/schedule" className="btn btn-secondary">View the schedule</Link></p>
          </ConfirmationCard>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHero title="Visitor Registration" subtitle="Welcome. Register with your basic details to attend Supernova 3.0 on 20–21 November 2026 at The National College." />
      <section className="container section" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 40, alignItems: "start" }}>
        <div>
          <StepIndicator steps={STEPS} current={step} />
          <form onSubmit={submit} noValidate style={{ position: "relative" }}>
            {step === 0 && (
              <div style={{ display: "grid", gap: 20 }}>
                <Field label="Full Name *" error={errors.fullName}>
                  <input className="input" value={draft.fullName} maxLength={120} autoComplete="name" onChange={(e) => update("fullName", e.target.value)} />
                </Field>
                <Field label="Email Address *" error={errors.email}>
                  <input className="input" type="email" value={draft.email} autoComplete="email" onChange={(e) => update("email", e.target.value)} />
                </Field>
                <Field label="Class / Course *" error={errors.studentClass}>
                  <input className="input" value={draft.studentClass} maxLength={120} placeholder="e.g. II PUC Science / B.Sc. / 10th Standard" onChange={(e) => update("studentClass", e.target.value)} />
                </Field>
                <Field label="College / Institution Name *" error={errors.institution}>
                  <input className="input" value={draft.institution} maxLength={150} placeholder="Your school, college or institution" onChange={(e) => update("institution", e.target.value)} />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div style={{ display: "grid", gap: 24 }}>
                <div className="card" style={{ padding: 24 }}>
                  <ReviewRow label="Full Name" value={draft.fullName} />
                  <ReviewRow label="Email Address" value={draft.email} />
                  <ReviewRow label="Class / Course" value={draft.studentClass} />
                  <ReviewRow label="College / Institution" value={draft.institution} />
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Edit details</button>
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
          </p>
          <p style={{ marginTop: 16, color: "var(--ink-soft)", fontSize: ".9rem" }}>
            Competing as a team? <Link to="/register/esports" style={{ color: "var(--sky-deep)", fontWeight: 600 }}>Register for Esports</Link>
          </p>
        </aside>
      </section>
    </>
  );
}
