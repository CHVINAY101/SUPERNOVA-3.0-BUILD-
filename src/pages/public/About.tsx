import { Link } from "react-router-dom";
import { SharedPageHeader } from "@/components/SharedPageHeader";
import { FESTIVAL_IMAGES } from "@/config/images";
import { 
  FESTIVAL_CONFIG, 
  getPrimaryButtonLabel, 
  getPrimaryButtonSubtext, 
  getPrimaryButtonHref 
} from "@/config/festival";

export default function About() {
  const primaryLabel = getPrimaryButtonLabel();
  const primarySubtext = getPrimaryButtonSubtext();
  const primaryHref = getPrimaryButtonHref();

  return (
    <div style={{ background: "#FFFFFF", color: "#0B0B1E", minHeight: "100vh" }}>
      {/* Shared Page Header */}
      <SharedPageHeader
        title="About Supernova 3.0"
        tag="FESTIVAL BACKGROUND"
        subtitle={FESTIVAL_CONFIG.SUBTEXT}
      />

      {/* Story text beside three-photo collage */}
      <section style={{ padding: "clamp(60px, 10vh, 100px) 0" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 clamp(16px, 4vw, 36px)" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "clamp(36px, 6vw, 64px)",
              alignItems: "center",
              marginBottom: "clamp(64px, 10vh, 96px)",
            }}
          >
            {/* Story text column */}
            <div>
              <span
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  color: "#2E2A8A",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  display: "inline-block",
                  marginBottom: 12,
                }}
              >
                THE FESTIVAL STORY
              </span>

              <h2
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontWeight: 900,
                  fontSize: "clamp(2rem, 4vw, 3.2rem)",
                  lineHeight: 1.12,
                  color: "#0B0B1E",
                  margin: "0 0 20px",
                  letterSpacing: "-0.02em",
                }}
              >
                DREAM • CREATE • COMPETE
              </h2>

              <p
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: "clamp(0.98rem, 1.4vw, 1.1rem)",
                  color: "#2E2A8A",
                  fontWeight: 600,
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                {FESTIVAL_CONFIG.SUBTEXT}
              </p>

              <p
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  color: "#38375A",
                  fontSize: "0.92rem",
                  lineHeight: 1.7,
                  marginBottom: 16,
                }}
              >
                Organised by <strong>The National Education Society of Karnataka</strong> through its premier institutions — <strong>The National College, Basavanagudi</strong> and <strong>National PU College, Jayanagar</strong> — in collaboration with the <strong>Department of Animation</strong>, Supernova 3.0 represents a convergence of academic inquiry, digital expression, and collegiate championship gaming. Hosted at <strong>The National College</strong> campus in Basavanagudi, the festival provides a platform for innovators and creators to showcase real-world projects.
              </p>

              <p
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  color: "#38375A",
                  fontSize: "0.92rem",
                  lineHeight: 1.7,
                  marginBottom: 28,
                }}
              >
                Across two intensive festival days on 20–21 November 2026, students and faculties from across Karnataka gather to test ideas, present research, and build lasting professional connections.
              </p>

              {/* Primary Action Button */}
              <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start" }}>
                <Link
                  to={primaryHref}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    height: 52,
                    padding: "0 28px",
                    borderRadius: "9999px",
                    background: "#F47B20",
                    color: "#FFFFFF",
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 800,
                    fontSize: "0.95rem",
                    letterSpacing: "0.02em",
                    textDecoration: "none",
                    boxShadow: "0 4px 18px rgba(244, 123, 32, 0.3)",
                    transition: "background 0.2s ease, transform 0.2s ease",
                  }}
                  onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                    e.currentTarget.style.background = "#E0670E";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                    e.currentTarget.style.background = "#F47B20";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <span>{primaryLabel}</span>
                </Link>
                {primarySubtext && (
                  <span
                    style={{
                      fontSize: "0.74rem",
                      color: "#6B688A",
                      fontWeight: 500,
                      marginTop: 6,
                      paddingLeft: 4,
                    }}
                  >
                    {primarySubtext}
                  </span>
                )}
              </div>
            </div>

            {/* Three-Photo Collage */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.8fr",
                gridTemplateRows: "200px 200px",
                gap: 16,
              }}
            >
              {/* Main Photo (Spans 2 rows) */}
              <div
                style={{
                  gridRow: "1 / span 2",
                  borderRadius: "20px",
                  overflow: "hidden",
                  boxShadow: "0 16px 40px rgba(46, 42, 138, 0.1)",
                  border: "1px solid rgba(46, 42, 138, 0.12)",
                  background: "#F6F3FF",
                }}
              >
                <img
                  src={FESTIVAL_IMAGES.about.historyCampus.src}
                  alt={FESTIVAL_IMAGES.about.historyCampus.alt}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>

              {/* Photo 2 (Top Right) */}
              <div
                style={{
                  borderRadius: "20px",
                  overflow: "hidden",
                  boxShadow: "0 12px 32px rgba(46, 42, 138, 0.08)",
                  border: "1px solid rgba(46, 42, 138, 0.12)",
                  background: "#F6F3FF",
                }}
              >
                <img
                  src={FESTIVAL_IMAGES.about.collegeLibrary.src}
                  alt={FESTIVAL_IMAGES.about.collegeLibrary.alt}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>

              {/* Photo 3 (Bottom Right) */}
              <div
                style={{
                  borderRadius: "20px",
                  overflow: "hidden",
                  boxShadow: "0 12px 32px rgba(46, 42, 138, 0.08)",
                  border: "1px solid rgba(46, 42, 138, 0.12)",
                  background: "#F6F3FF",
                }}
              >
                <img
                  src={FESTIVAL_IMAGES.about.trusteeBuilding.src}
                  alt={FESTIVAL_IMAGES.about.trusteeBuilding.alt}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            </div>
          </div>

          {/* Stats Bar using ONLY user-provided numbers: 4 Zones, 2 Days, 1 Centenary Campus */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 24,
              padding: "clamp(32px, 5vh, 48px)",
              borderRadius: "24px",
              background: "#F6F3FF",
              border: "1px solid rgba(46, 42, 138, 0.1)",
              textAlign: "center",
            }}
          >
            <div>
              <span
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: "clamp(2.4rem, 4vw, 3.6rem)",
                  fontWeight: 900,
                  color: "#2E2A8A",
                  lineHeight: 1,
                  display: "block",
                  marginBottom: 6,
                }}
              >
                4
              </span>
              <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "0.86rem", fontWeight: 700, color: "#38375A" }}>
                Flagship Zones: Science, Animation, Technology, E-Sports
              </span>
            </div>

            <div>
              <span
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: "clamp(2.4rem, 4vw, 3.6rem)",
                  fontWeight: 900,
                  color: "#5648B0",
                  lineHeight: 1,
                  display: "block",
                  marginBottom: 6,
                }}
              >
                2
              </span>
              <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "0.86rem", fontWeight: 700, color: "#38375A" }}>
                Festival Days: 20 – 21 November 2026
              </span>
            </div>

            <div>
              <span
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: "clamp(2.4rem, 4vw, 3.6rem)",
                  fontWeight: 900,
                  color: "#2E2A8A",
                  lineHeight: 1,
                  display: "block",
                  marginBottom: 6,
                }}
              >
                1
              </span>
              <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "0.86rem", fontWeight: 700, color: "#38375A" }}>
                Centenary Host Campus: The National College, Basavanagudi
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
