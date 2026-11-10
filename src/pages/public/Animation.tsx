import { Link } from "react-router-dom";
import { Film, CheckCircle2, ArrowRight, Calendar, MapPin, Monitor, Wand2 } from "lucide-react";
import { Reveal } from "@/components/Reveal";

const SHOWCASE_PILLARS = [
  {
    icon: Film,
    title: "3D Animation & Short Film Screenings",
    desc: "Original character animations, narrative short films, environmental world-building, and digital rigging reels by students of the Animation Department.",
  },
  {
    icon: Wand2,
    title: "Visual Effects (VFX) & Compositing",
    desc: "Live-action green-screen integration, procedural fluid simulations, particle effects, and cinematic breakdowns demonstrating digital illusion.",
  },
  {
    icon: Monitor,
    title: "Concept Art, UI/UX & Game Art Design",
    desc: "Digital matte paintings, stylized character model sheets, immersive virtual environments, and interactive game art design pipelines.",
  },
];

export default function Animation() {
  return (
    <div style={{ background: "var(--paper)", minHeight: "100vh" }}>
      {/* Editorial Hero */}
      <section
        style={{
          background: "linear-gradient(180deg, rgba(119, 85, 216, 0.16) 0%, var(--paper) 100%)",
          padding: "clamp(88px, 12vw, 140px) 0 64px",
          borderBottom: "1.5px solid var(--line)",
        }}
      >
        <div className="container">
          <div style={{ maxWidth: 800 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: "999px", background: "var(--violet)", color: "#ffffff", fontSize: "0.76rem", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 20 }}>
              <Film size={14} />
              EVENT ZONE 03 · DEPARTMENT OF ANIMATION SHOWCASE
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
              Step into digital creativity & visual storytelling.
            </h1>
            <p style={{ fontSize: "1.15rem", lineHeight: 1.6, color: "var(--ink-soft)", marginBottom: 32 }}>
              Step into the world of digital creativity and visual storytelling. Explore animation, graphic design, visual effects and the art of bringing imagination to life.
            </p>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <Link to="/register/participation" className="btn btn-primary" style={{ background: "var(--violet)", borderColor: "var(--violet)" }}>
                Submit Animation / VFX Reel <ArrowRight size={16} />
              </Link>
              <Link to="/register/visitor" className="btn btn-secondary" style={{ background: "#ffffff" }}>
                Attend Showcase & Screenings
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
                  src="https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80"
                  alt="Department of Animation Showcase"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            </Reveal>

            <Reveal delay={150}>
              <div>
                <p className="hm-kicker" style={{ color: "var(--violet)" }}>CREATIVE MEDIA EXCELLENCE</p>
                <h2 style={{ fontSize: "clamp(2rem, 3.8vw, 3rem)", marginTop: 12, marginBottom: 20 }}>
                  Crafted by animators, VFX artists & visionaries.
                </h2>
                <p style={{ color: "var(--ink-soft)", lineHeight: 1.65, fontSize: "1.05rem", marginBottom: 24 }}>
                  The Department of Animation at The National College is a pioneering hub in digital arts education. For Supernova 3.0, the department opens its state-of-the-art media labs and digital theatre for non-stop screenings, live digital sculpting workshops, and portfolio reviews.
                </p>

                <div style={{ display: "grid", gap: 12, marginBottom: 32 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.92rem", fontWeight: 600 }}>
                    <CheckCircle2 size={18} color="var(--violet)" /> High-definition cinema screening theatre with surround sound
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.92rem", fontWeight: 600 }}>
                    <CheckCircle2 size={18} color="var(--violet)" /> Interactive digital drawing tablets & motion-capture demo stations
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.92rem", fontWeight: 600 }}>
                    <CheckCircle2 size={18} color="var(--violet)" /> Networking with industry directors, VFX supervisors & recruiters
                  </div>
                </div>

                <div style={{ display: "flex", gap: 20, fontSize: "0.88rem", color: "var(--ink-muted)", paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Calendar size={14} /> 20–21 Nov 2026</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> Design Studio & Media Lab</span>
                </div>
              </div>
            </Reveal>
          </div>

          {/* 3 Pillars */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            {SHOWCASE_PILLARS.map((p, idx) => {
              const Icon = p.icon;
              return (
                <div key={idx} className="card card-hover" style={{ background: "#ffffff", padding: "36px 28px" }}>
                  <div style={{ width: 52, height: 52, borderRadius: "16px", background: "rgba(119, 85, 216, 0.15)", color: "var(--violet)", display: "grid", placeItems: "center", marginBottom: 20 }}>
                    <Icon size={26} />
                  </div>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 10 }}>{p.title}</h3>
                  <p style={{ color: "var(--ink-soft)", fontSize: "0.92rem", lineHeight: 1.6 }}>{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
