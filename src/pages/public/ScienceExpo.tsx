import { Link } from "react-router-dom";
import { Atom, CheckCircle2, ArrowRight, Calendar, MapPin, Beaker, Cpu, Microscope } from "lucide-react";
import { Reveal } from "@/components/Reveal";

const EXHIBIT_TRACKS = [
  {
    icon: Cpu,
    title: "Robotics & Automation Arena",
    desc: "Autonomous obstacle avoidance bots, line-followers, robotic arms, and drone prototypes designed by college and school teams.",
  },
  {
    icon: Microscope,
    title: "Applied Science & Innovation Pavilion",
    desc: "Renewable solar IoT systems, bio-filtration setups, smart agricultural irrigation, and working physics models.",
  },
  {
    icon: Beaker,
    title: "Live Chemistry & Physical Phenomena Lab",
    desc: "Interactive demonstrations uncovering the wonders of matter, crystallization, exothermic reactions, and fluid dynamics.",
  },
];

export default function ScienceExpo() {
  return (
    <div style={{ background: "var(--paper)", minHeight: "100vh" }}>
      {/* Editorial Page Hero */}
      <section
        style={{
          background: "linear-gradient(180deg, var(--pale-blue) 0%, var(--paper) 100%)",
          padding: "clamp(88px, 12vw, 140px) 0 64px",
          borderBottom: "1.5px solid var(--line)",
        }}
      >
        <div className="container">
          <div style={{ maxWidth: 780 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: "999px", background: "var(--cobalt)", color: "#ffffff", fontSize: "0.76rem", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 20 }}>
              <Atom size={14} />
              EVENT ZONE 01 · SCIENCE EXPO
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
              Discover the fascinating world of science in motion.
            </h1>
            <p style={{ fontSize: "1.15rem", lineHeight: 1.6, color: "var(--ink-soft)", marginBottom: 32 }}>
              Discover the fascinating world of science through experiments, innovative models, interactive demonstrations and ideas that bring learning to life.
            </p>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <Link to="/register/participation" className="btn btn-primary" style={{ background: "var(--cobalt)", borderColor: "var(--cobalt)" }}>
                Register Your Science Project <ArrowRight size={16} />
              </Link>
              <Link to="/register/visitor" className="btn btn-secondary" style={{ background: "#ffffff" }}>
                Get Free Visitor Pass
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Highlights & Key Details */}
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
                  src="https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80"
                  alt="Science Expo Quadrangle Exhibits"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            </Reveal>

            <Reveal delay={150}>
              <div>
                <p className="hm-kicker">QUADRANGLE SHOWCASE</p>
                <h2 style={{ fontSize: "clamp(2rem, 3.8vw, 3rem)", marginTop: 12, marginBottom: 20 }}>
                  Where theory transforms into tangible reality.
                </h2>
                <p style={{ color: "var(--ink-soft)", lineHeight: 1.65, fontSize: "1.05rem", marginBottom: 24 }}>
                  The Science Expo brings together students from secondary schools, pre-university colleges, and undergraduate institutes across Karnataka. Exhibitors present working prototypes that address real-world challenges in energy, robotics, healthcare, and sustainable engineering.
                </p>

                <div style={{ display: "grid", gap: 12, marginBottom: 32 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.92rem", fontWeight: 600 }}>
                    <CheckCircle2 size={18} color="var(--cobalt)" /> Dedicated stall space with power points & presentation display boards
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.92rem", fontWeight: 600 }}>
                    <CheckCircle2 size={18} color="var(--cobalt)" /> Evaluation by eminent scientists & faculty from NES of Karnataka
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.92rem", fontWeight: 600 }}>
                    <CheckCircle2 size={18} color="var(--cobalt)" /> Cash awards, trophies and certificates of innovation
                  </div>
                </div>

                <div style={{ display: "flex", gap: 20, fontSize: "0.88rem", color: "var(--ink-muted)", paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Calendar size={14} /> 20–21 Nov 2026</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> Science Block Quadrangle</span>
                </div>
              </div>
            </Reveal>
          </div>

          {/* 3 Exhibition Tracks */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, marginTop: 40 }}>
            {EXHIBIT_TRACKS.map((t, idx) => {
              const Icon = t.icon;
              return (
                <div key={idx} className="card card-hover" style={{ background: "#ffffff", padding: "36px 28px" }}>
                  <div style={{ width: 52, height: 52, borderRadius: "16px", background: "var(--pale-blue)", color: "var(--cobalt)", display: "grid", placeItems: "center", marginBottom: 20 }}>
                    <Icon size={26} />
                  </div>
                  <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 10 }}>{t.title}</h3>
                  <p style={{ color: "var(--ink-soft)", fontSize: "0.92rem", lineHeight: 1.6 }}>{t.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
