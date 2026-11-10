import { Link } from "react-router-dom";
import { PageHero } from "@/components/PageLayout";
import { ShieldCheck, Lock, Eye, FileText } from "lucide-react";

export default function Privacy() {
  return (
    <>
      <PageHero
        title="Privacy Policy & Notice"
        subtitle="How Supernova 3.0 and National Education Society of Karnataka protect and handle your registration data."
      />

      <section className="container section" style={{ maxWidth: 880 }}>
        <div className="card" style={{ background: "#ffffff", padding: "clamp(32px, 5vw, 56px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--pale-blue)", color: "var(--cobalt)", display: "grid", placeItems: "center" }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <p className="hm-kicker" style={{ color: "var(--cobalt)" }}>OFFICIAL DATA PROTECTION POLICY</p>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Supernova 3.0 Event Data Privacy</h2>
            </div>
          </div>

          <div style={{ color: "var(--ink-soft)", lineHeight: 1.7, fontSize: "0.98rem", display: "grid", gap: 24 }}>
            <div>
              <h3 style={{ fontSize: "1.15rem", color: "var(--ink)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <Eye size={18} color="var(--cobalt)" /> 1. Information We Collect
              </h3>
              <p>
                When registering for Supernova 3.0—whether as a project participant, general visitor, or esports tournament roster—we collect your name, email address, mobile contact number, institutional affiliation (school or college), and relevant project or gamer tags.
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: "1.15rem", color: "var(--ink)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <FileText size={18} color="var(--cobalt)" /> 2. Purpose of Collection
              </h3>
              <p>
                Your data is collected strictly for:
              </p>
              <ul style={{ paddingLeft: 20, marginTop: 8, listStyle: "disc" }}>
                <li>Generating and verifying visitor and participant campus entry passes.</li>
                <li>Communicating schedule updates, stall allocations, tournament brackets, and security advisories.</li>
                <li>Verifying academic eligibility and team roster compositions.</li>
                <li>Ensuring campus safety in coordination with The National College administration.</li>
              </ul>
            </div>

            <div>
              <h3 style={{ fontSize: "1.15rem", color: "var(--ink)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <Lock size={18} color="var(--cobalt)" /> 3. Data Protection & Security
              </h3>
              <p>
                We do not sell, rent, or publicly disclose your personal registration data to any commercial third parties or advertisers. Access is restricted to authorized National Education Society festival organizers and event administrators. We never ask for or store your gaming account passwords or credentials.
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: "1.15rem", color: "var(--ink)", marginBottom: 8 }}>
                4. Data Retention & Contact
              </h3>
              <p>
                Registration records are retained solely for the duration of the event lifecycle and official certificate issuance. For any privacy queries or data removal requests, please contact our festival desk at{" "}
                <a href="mailto:supernova@nationalcollege.edu" style={{ color: "var(--cobalt)", fontWeight: 700 }}>
                  supernova@nationalcollege.edu
                </a>.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1.5px solid var(--line-soft)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <span style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>Last updated: October 2026</span>
            <Link to="/" className="btn btn-secondary">
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
