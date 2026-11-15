import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { RegistrationControl, FormOption } from "@/types/database";
import { Sparkles, CheckCircle2, ArrowLeft, Lock } from "lucide-react";

interface ParticipationDraft {
  fullName: string;
  email: string;
  phone: string;
  institution: string;
  category: string;
  participationArea: string;
  projectTitle: string;
  projectDescription: string;
  teamSize: number;
  consent: boolean;
}

const DEFAULT_AREAS = [
  {
    id: "Science Expo",
    title: "Science & Innovation Expo",
    desc: "Working models, scientific experiments, robotics prototypes, and applied research.",
  },
  {
    id: "School Kids' Exhibition",
    title: "School Kids' Creative Exhibition",
    desc: "Class projects, arts and craft models, eco-inventions, and young student ideas.",
  },
  {
    id: "Department of Animation Showcase",
    title: "Department of Animation Showcase",
    desc: "3D animation reels, character designs, digital illustrations, and VFX shorts.",
  },
];

const DEFAULT_CATEGORIES = [
  "School student (Grades 1–10)",
  "Pre-University student (11th/12th/PUC)",
  "College / Undergraduate student",
  "Postgraduate / Academic researcher",
  "Independent creator / Educator",
];

export default function RegisterParticipation() {
  const [control, setControl] = useState<RegistrationControl | null>(null);
  const [controlLoading, setControlLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [areas, setAreas] = useState<typeof DEFAULT_AREAS>(DEFAULT_AREAS);

  const [draft, setDraft] = useState<ParticipationDraft>({
    fullName: "",
    email: "",
    phone: "",
    institution: "",
    category: DEFAULT_CATEGORIES[0],
    participationArea: DEFAULT_AREAS[0].id,
    projectTitle: "",
    projectDescription: "",
    teamSize: 1,
    consent: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Fetch registration controls
    supabase
      .from("registration_controls")
      .select("*")
      .eq("form_type", "participation")
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setControl(data[0] as RegistrationControl);
        }
        setControlLoading(false);
      });

    // 2. Fetch dynamic form options
    supabase
      .from("form_options")
      .select("*")
      .eq("form_type", "participation")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const opts = data as FormOption[];
          const dynamicCats = opts.filter((o) => o.field_key === "participant_category").map((o) => o.label);
          if (dynamicCats.length > 0) {
            setCategories(dynamicCats);
            setDraft((d) => ({ ...d, category: dynamicCats[0] }));
          }

          const dynamicAreas = opts.filter((o) => o.field_key === "participation_area");
          if (dynamicAreas.length > 0) {
            const mappedAreas = dynamicAreas.map((a) => ({
              id: a.value,
              title: a.label,
              desc: `Dedicated exhibition pavilion for ${a.label}.`,
            }));
            setAreas(mappedAreas);
            setDraft((d) => ({ ...d, participationArea: mappedAreas[0].id }));
          }
        }
      });
  }, []);

  const isClosed = Boolean(
    control && (
      !control.is_open ||
      (control.opens_at && new Date() < new Date(control.opens_at)) ||
      (control.closes_at && new Date() > new Date(control.closes_at))
    )
  );

  const validate = () => {
    const errs: Record<string, string> = {};
    if (draft.fullName.trim().length < 2) errs.fullName = "Please enter participant full name.";
    if (!draft.email.includes("@") || !draft.email.includes(".")) errs.email = "Please enter a valid email address.";
    const cleanPhone = draft.phone.replace(/[\s-+()]/g, "");
    if (!/^\d{10,15}$/.test(cleanPhone)) errs.phone = "Enter a valid 10-digit mobile number.";
    if (!draft.institution.trim()) errs.institution = "Please specify your school, college or organisation.";
    if (!draft.projectTitle.trim()) errs.projectTitle = "Please provide the title of your exhibit / project.";
    if (!draft.consent) errs.consent = "Agreement to participant exhibition guidelines is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate() || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const { data, error } = await supabase.rpc("submit_participation_registration", {
        p_full_name: draft.fullName.trim(),
        p_email: draft.email.trim(),
        p_phone: draft.phone.trim(),
        p_institution: draft.institution.trim(),
        p_category: draft.category,
        p_area: draft.participationArea,
        p_project_title: draft.projectTitle.trim(),
        p_project_description: draft.projectDescription.trim(),
        p_team_size: draft.teamSize,
      });

      setSubmitting(false);

      if (error) {
        if (error.message?.includes("Registrations are closed") || error.message?.includes("closed")) {
          setSubmitError(error.message.replace("Registrations are closed:", "").trim() || "Registrations are currently closed.");
        } else {
          setSubmitError(error.message || "Submission could not be completed. Please verify all fields and retry.");
        }
        return;
      }

      if (typeof data !== "string" || !data) {
        setSubmitError("Submission could not be completed. Please verify all fields and retry.");
        return;
      }

      setReference(data);
    } catch (err: any) {
      setSubmitting(false);
      setSubmitError(err.message || "An unexpected error occurred. Please try again.");
    }
  };

  if (reference) {
    return (
      <div style={{ background: "var(--paper)", minHeight: "80vh", padding: "80px 20px" }}>
        <div className="container" style={{ maxWidth: 640 }}>
          <div className="card" style={{ background: "#ffffff", padding: "clamp(32px, 5vw, 48px)", textAlign: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(49, 91, 219, 0.12)",
                color: "var(--cobalt)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 20px",
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <p className="hm-kicker">SUBMISSION CONFIRMED</p>
            <h1 style={{ fontSize: "2rem", marginTop: 8, marginBottom: 12 }}>You're registered to exhibit!</h1>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: 28 }}>
              Thank you, <strong>{draft.fullName}</strong>. Your project has been registered for{" "}
              <strong>{draft.participationArea}</strong> at Supernova 3.0.
            </p>

            <div
              style={{
                background: "var(--paper-deep)",
                border: "2px dashed var(--line)",
                borderRadius: "16px",
                padding: "20px",
                marginBottom: 28,
              }}
            >
              <p style={{ fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.1em", color: "var(--ink-muted)", textTransform: "uppercase" }}>
                Official Registration Reference
              </p>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 800, color: "var(--cobalt)", marginTop: 6 }}>
                {reference}
              </p>
            </div>

            <div style={{ textAlign: "left", fontSize: "0.88rem", color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 32 }}>
              <p>• <strong>Project:</strong> {draft.projectTitle}</p>
              <p>• <strong>Institution:</strong> {draft.institution}</p>
              <p>• <strong>Venue:</strong> The National College, Basavanagudi, Bengaluru</p>
              <p>• <strong>Dates:</strong> 20–21 November 2026</p>
              <p style={{ marginTop: 8, fontStyle: "italic" }}>
                Exhibition stall allocation and safety guidelines will be forwarded to {draft.email}.
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link to="/schedule" className="btn btn-secondary">
                View Festival Schedule
              </Link>
              <Link to="/" className="btn btn-primary">
                Return to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isClosed && !controlLoading) {
    return (
      <div style={{ background: "var(--paper)", minHeight: "80vh", padding: "80px 20px" }}>
        <div className="container" style={{ maxWidth: 640 }}>
          <div className="card" style={{ background: "#ffffff", padding: "clamp(32px, 5vw, 48px)", textAlign: "center" }}>
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
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--ink)", marginBottom: 12 }}>
              Participation Registrations Closed
            </h1>
            <p style={{ color: "var(--ink-soft)", fontSize: "1rem", lineHeight: 1.6, marginBottom: 28 }}>
              {control?.closed_message || "Registrations are now closed for project and stall exhibits."}
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <Link to="/register" className="btn btn-secondary">
                View All Pathways
              </Link>
              <Link to="/" className="btn btn-primary">
                Return to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--paper)", minHeight: "90vh", padding: "64px 20px 96px" }}>
      <div className="container" style={{ maxWidth: 760 }}>
        <Link to="/register" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 700, color: "var(--ink-soft)", marginBottom: 24 }}>
          <ArrowLeft size={16} /> All registration pathways
        </Link>

        <div style={{ marginBottom: 36 }}>
          <p className="hm-kicker">01 · PARTICIPATION REGISTRATION</p>
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 3.2rem)", marginTop: 8, marginBottom: 12 }}>
            Register your exhibit or project
          </h1>
          <p style={{ color: "var(--ink-soft)", fontSize: "1.05rem", lineHeight: 1.6 }}>
            {control?.intro_text ||
              "For student researchers, young school creators, and animation exhibitors. Present your working models, art showcases, and technology demonstrations."}
          </p>
        </div>

        {submitError && (
          <div style={{ padding: "16px 20px", borderRadius: "12px", background: "rgba(229, 72, 77, 0.1)", border: "1.5px solid var(--red)", color: "var(--red)", marginBottom: 24, fontSize: "0.9rem" }}>
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="card" style={{ background: "#ffffff", padding: "clamp(28px, 4.5vw, 44px)" }}>
          {/* STEP 1: SELECT AREA */}
          <div style={{ marginBottom: 32 }}>
            <label className="label">Select Participation Zone *</label>
            <div style={{ display: "grid", gap: 12 }}>
              {areas.map((area) => (
                <label
                  key={area.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 14,
                    padding: "16px 20px",
                    borderRadius: "14px",
                    border: draft.participationArea === area.id ? "2px solid var(--cobalt)" : "1.5px solid var(--line)",
                    background: draft.participationArea === area.id ? "var(--pale-blue)" : "var(--paper)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <input
                    type="radio"
                    name="participationArea"
                    value={area.id}
                    checked={draft.participationArea === area.id}
                    onChange={(e) => setDraft({ ...draft, participationArea: e.target.value })}
                    style={{ marginTop: 4 }}
                  />
                  <div>
                    <strong style={{ display: "block", fontSize: "1rem", color: "var(--ink)", marginBottom: 4 }}>
                      {area.title}
                    </strong>
                    <span style={{ fontSize: "0.86rem", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                      {area.desc}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* STEP 2: PARTICIPANT DETAILS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
            <div>
              <label className="label">Participant / Team Lead Full Name *</label>
              <input
                className="input"
                required
                value={draft.fullName}
                placeholder="e.g. Ananya Rao"
                onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
              />
              {errors.fullName && <p style={{ color: "var(--red)", fontSize: "0.8rem", marginTop: 4 }}>{errors.fullName}</p>}
            </div>

            <div>
              <label className="label">Email Address *</label>
              <input
                type="email"
                className="input"
                required
                value={draft.email}
                placeholder="ananya@example.com"
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
              {errors.email && <p style={{ color: "var(--red)", fontSize: "0.8rem", marginTop: 4 }}>{errors.email}</p>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
            <div>
              <label className="label">Mobile Number (WhatsApp updates) *</label>
              <input
                className="input"
                required
                value={draft.phone}
                placeholder="9845012345"
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
              {errors.phone && <p style={{ color: "var(--red)", fontSize: "0.8rem", marginTop: 4 }}>{errors.phone}</p>}
            </div>

            <div>
              <label className="label">School, College or Institution *</label>
              <input
                className="input"
                required
                value={draft.institution}
                placeholder="e.g. The National College, Basavanagudi"
                onChange={(e) => setDraft({ ...draft, institution: e.target.value })}
              />
              {errors.institution && <p style={{ color: "var(--red)", fontSize: "0.8rem", marginTop: 4 }}>{errors.institution}</p>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 24 }}>
            <div>
              <label className="label">Participant Category *</label>
              <select
                className="select"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Team Size (Total members at stall)</label>
              <input
                type="number"
                min={1}
                max={10}
                className="input"
                value={draft.teamSize}
                onChange={(e) => setDraft({ ...draft, teamSize: Number(e.target.value) || 1 })}
              />
            </div>
          </div>

          {/* STEP 3: PROJECT OVERVIEW */}
          <div style={{ marginBottom: 20 }}>
            <label className="label">Exhibit / Project Title *</label>
            <input
              className="input"
              required
              value={draft.projectTitle}
              placeholder="e.g. Autonomous Solar Powered Bio-Filter Prototype"
              onChange={(e) => setDraft({ ...draft, projectTitle: e.target.value })}
            />
            {errors.projectTitle && <p style={{ color: "var(--red)", fontSize: "0.8rem", marginTop: 4 }}>{errors.projectTitle}</p>}
          </div>

          <div style={{ marginBottom: 28 }}>
            <label className="label">Project Summary & Power Requirements (Optional)</label>
            <textarea
              className="input"
              rows={4}
              value={draft.projectDescription}
              placeholder="Describe your working model, requirements (e.g. 230V AC socket, water basin, display table), and core concept..."
              onChange={(e) => setDraft({ ...draft, projectDescription: e.target.value })}
            />
          </div>

          {/* CONSENT */}
          <div style={{ marginBottom: 32 }}>
            <label
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: 12,
                cursor: "pointer",
                padding: "16px",
                borderRadius: "12px",
                background: "var(--paper)",
              }}
            >
              <input
                type="checkbox"
                checked={draft.consent}
                onChange={(e) => setDraft({ ...draft, consent: e.target.checked })}
                style={{ marginTop: 3 }}
              />
              <span style={{ fontSize: "0.88rem", color: "var(--ink)", lineHeight: 1.5 }}>
                {control?.consent_text ||
                  "I confirm that this exhibit represents original student/faculty work and agree to follow Supernova 3.0 campus code of conduct and safety instructions."}
              </span>
            </label>
            {errors.consent && <p style={{ color: "var(--red)", fontSize: "0.8rem", marginTop: 4 }}>{errors.consent}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "16px", fontSize: "1rem" }}
          >
            <Sparkles size={18} />
            {submitting ? "Submitting Registration…" : "Complete Exhibit Registration"}
          </button>
        </form>
      </div>
    </div>
  );
}
