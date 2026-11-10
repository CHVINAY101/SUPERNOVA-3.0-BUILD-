import { Link } from "react-router-dom";
import { Palette, CheckCircle2, ArrowRight, Calendar, MapPin, Lightbulb, Compass } from "lucide-react";
import { Reveal } from "@/components/Reveal";

const CATEGORIES = [
  {
    icon: Lightbulb,
    title: "Young Inventors & Sustainable Models",
    desc: "Innovative miniature models illustrating renewable clean energy, waste segregation, water harvesting, and smart city architectures.",
  },
  {
    icon: Palette,
    title: "Visual Art & Creative Expressions",
    desc: "Original canvas paintings, clay sculptures, recycled scrap sculptures, and creative dioramas reflecting student viewpoints on nature and technology.",
  },
  {
    icon: Compass,
    title: "Interactive Fun Science Stations",
    desc: "Hands-on puzzle boards, optical illusion devices, magnetic games, and mathematical wonders created by school students.",
  },
];

export default function SchoolExhibition() {
  return (
    <div style={{ background: "var(--paper)", minHeight: "100vh" }}>
      {/* Editorial Hero */}
      <section
        style={{
          background: "linear-gradient(180deg, rgba(243, 229, 155, 0.45) 0%, var(--paper) 100%)",
          padding: "clamp(88px, 12vw, 140px) 0 64px",
          borderBottom: "1.5px solid var(--line)",
        }}
      >
        <div className="container">
          <div style={{ maxWidth: 780 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: "999px", background: "var(--coral)", color: "#ffffff", fontSize: "0.76rem", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 20 }}>
              <Palette size={14} />
              EVENT ZONE 02 · SCHOOL KIDS' EXHIBITION
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.6rem, 6vw, 5rem)",
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
                color: "var(--ink)",
                marginBottom: 20,
              }}
            >
              Celebrate the imagination of young creators.
            </h1>
            <p style={{ fontSize: "1.15rem", lineHeight: 1.6, color: "var(--ink-soft)", marginBottom: 32 }}>
              Celebrate the creativity and imagination of young minds as school students present their ideas, projects, artwork and talents.
            </p>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <Link to="/register/participation" className="btn btn-coral">
                Register a Student Project <ArrowRight size={16} />
              </Link>
              <Link to="/register/visitor" className="btn btn-secondary" style={{ background: "#ffffff" }}>
                Get Family Visitor Pass
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Highlights & Showcase */}
      <section className="section">
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "clamp(32px, 5vw, 64px)", alignItems: "center", marginBottom: 72 }}>
            <Reveal>
              <div
                style={{
                  borderRadius: "28px",
                  overflow: "hidden",
                  aspectRatio: "4 / 3",
                  border: "1.5px solid var(--line)",
                  boxShadow: "0 20px 40px -15px rgba(0,0,0,0.15)",
                }}
              >
                <img
                  src="https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80"
                  alt="School Kids' Creative Exhibition"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            </Reveal>

            <Reveal delay={150}>
              <div>
                <p className="hm-kicker" style={{ color: "var(--coral)" }}>STUDENT TALENT & CURIOSITY</p>
                <h2 style={{ fontSize: "clamp(2rem, 3.8vw, 3rem)", marginTop: 12, marginBottom: 20 }}>
                  Empowering young minds to express big ideas.
                </h2>
                <p style={{ color: "var(--ink-soft)", lineHeight: 1.65, fontSize: "1.05rem", marginBottom: 24 }}>
                  Featuring original creations by students of National English School, National High School, and guest partner schools. The exhibition celebrates hands-on craftsmanship, artistic storytelling, and early scientific inquiry.
                </p>

                <div style={{ display: "grid", gap: 12, marginBottom: 32 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.92rem", fontWeight: 600 }}>
                    <CheckCircle2 size={18} color="var(--coral)" /> Open to primary and high school students across all grades
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.92rem", fontWeight: 600 }}>
                    <CheckCircle2 size={18} color="var(--coral)" /> Interactive activity corners for visiting children & families
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.92rem", fontWeight: 600 }}>
                    <CheckCircle2 size={18} color="var(--coral)" /> Special jury appreciation medals and merit certificates
                  </div>
                </div>

                <div style={{ display: "flex", gap: 20, fontSize: "0.88rem", color: "var(--ink-muted)", paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Calendar size={14} /> 20–21 Nov 2026</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> Central Courtyard & Activity Hall</span>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Exhibition Focus Tracks */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {CATEGORIES.map((cat, idx) => {
              const Icon = cat.icon;
              return (
                <div key={idx} className="card card-hover" style={{ background: "#ffffff", padding: "36px 28px" }}>
                  <div style={{ width: 52, height: 52, borderRadius: "16px", background: "rgba(240, 120, 85, 0.15)", color: "var(--coral)", display: "grid", placeItems: "center", marginBottom: 20 }}>
                    <Icon size={26} />
                  </div>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 10 }}>{cat.title}</h3>
                  <p style={{ color: "var(--ink-soft)", fontSize: "0.92rem", lineHeight: 1.6 }}>{cat.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
