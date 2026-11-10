import { Link } from "react-router-dom";
import { SharedPageHeader } from "@/components/SharedPageHeader";
import { FESTIVAL_IMAGES } from "@/config/images";
import { 
  FESTIVAL_CONFIG, 
  getPrimaryButtonLabel, 
  getPrimaryButtonSubtext, 
  getPrimaryButtonHref 
} from "@/config/festival";
import { CheckCircle2 } from "lucide-react";

interface ZoneData {
  id: string;
  title: string;
  tag: string;
  accent: string;
  image: string;
  alt: string;
  summary: string;
  highlights: string[];
  venue: string;
  dates: string;
  fees: string;
  rules: string;
}

const ZONES_DATA: ZoneData[] = [
  {
    id: "science",
    title: "Science",
    tag: "ZONE 01 · EXPERIMENTS & DISCOVERY",
    accent: "#2E2A8A",
    image: FESTIVAL_IMAGES.home.zones.science.src,
    alt: FESTIVAL_IMAGES.home.zones.science.alt,
    summary:
      "A flagship exhibition of live scientific models, experimental engineering demonstrations, robotics mechanisms, and applied physics prototypes developed by collegiate and higher secondary students.",
    highlights: [
      "Working mechanical prototypes and microcontroller robotics",
      "Interactive laser optics and electromagnetic apparatus",
      "Student research kiosks and jury evaluations",
      "Live mentor feedback sessions",
    ],
    venue: "Main Quadrangle & Physics Ground Floor",
    dates: "20 – 21 NOVEMBER 2026",
    fees: "Details coming soon",
    rules: "Details coming soon",
  },
  {
    id: "animation",
    title: "Animation",
    tag: "ZONE 02 · DIGITAL ART & SCREENINGS",
    accent: "#5648B0",
    image: FESTIVAL_IMAGES.home.zones.animation.src,
    alt: FESTIVAL_IMAGES.home.zones.animation.alt,
    summary:
      "Curated by the Department of Animation, featuring original 2D & 3D character animation reels, digital sculpting galleries, concept matte paintings, and interactive visual effects screenings.",
    highlights: [
      "Auditorium screenings of original 2D and 3D student short films",
      "Game development environments and character portfolio displays",
      "Live digital drawing and concept art demonstrations",
      "Visual effects post-production panels",
    ],
    venue: "Centenary Auditorium & Animation Labs",
    dates: "20 – 21 NOVEMBER 2026",
    fees: "Details coming soon",
    rules: "Details coming soon",
  },
  {
    id: "technology",
    title: "Technology",
    tag: "ZONE 03 · ROBOTICS & CODE",
    accent: "#2E2A8A",
    image: FESTIVAL_IMAGES.home.zones.technology.src,
    alt: FESTIVAL_IMAGES.home.zones.technology.alt,
    summary:
      "A cutting-edge forum bringing together student technologists, embedded systems developers, AI experimenters, and collegiate hardware designers presenting solutions for real-world impact.",
    highlights: [
      "Live microcontroller and embedded systems demonstrations",
      "Hardware-software interface arenas",
      "Student project speed pitches to visiting engineers",
      "Interactive technical challenge floor",
    ],
    venue: "Electronics Wing & Seminar Hall 1",
    dates: "20 – 21 NOVEMBER 2026",
    fees: "Details coming soon",
    rules: "Details coming soon",
  },
  {
    id: "esports",
    title: "E-Sports",
    tag: "ZONE 04 · BRACKETS & COMPETITION",
    accent: "#5648B0",
    image: FESTIVAL_IMAGES.home.zones.esports.src,
    alt: FESTIVAL_IMAGES.home.zones.esports.alt,
    summary:
      "High-energy collegiate competitive gaming tournament featuring verified bracket play, live commentary, spectator theater, and collegiate championship hardware showdowns.",
    highlights: [
      "PC tournament battlestations with high-refresh monitors",
      "Live stage projection with student casters and analyst desk",
      "Bracket knockout matches leading to the Grand Finals",
      "Custom tournament lobby security and ping-verified routing",
    ],
    venue: "Indoor Sports Complex & Esports Arena",
    dates: "20 – 21 NOVEMBER 2026",
    fees: "Details coming soon",
    rules: "Details coming soon",
  },
];

export default function Events() {
  const primaryLabel = getPrimaryButtonLabel();
  const primarySubtext = getPrimaryButtonSubtext();
  const primaryHref = getPrimaryButtonHref();

  return (
    <div style={{ background: "#FFFFFF", color: "#0B0B1E", minHeight: "100vh" }}>
      {/* Shared Page Header */}
      <SharedPageHeader
        title="Four Flagship Zones"
        tag="FESTIVAL PILLARS"
        subtitle={FESTIVAL_CONFIG.SUBTEXT}
      />

      {/* Four Alternating Image-and-Text Sections */}
      <div style={{ padding: "clamp(60px, 10vh, 100px) 0" }}>
        <div
          style={{
            maxWidth: 1320,
            margin: "0 auto",
            padding: "0 clamp(16px, 4vw, 36px)",
            display: "grid",
            gap: "clamp(60px, 10vh, 110px)",
          }}
        >
          {ZONES_DATA.map((zone, index) => {
            const isReversed = index % 2 === 1;

            return (
              <section
                key={zone.id}
                id={zone.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: "clamp(36px, 6vw, 64px)",
                  alignItems: "center",
                }}
              >
                {/* Image Column (Alternates side) */}
                <div
                  style={{
                    order: isReversed ? 2 : 1,
                    position: "relative",
                    borderRadius: "24px",
                    overflow: "hidden",
                    aspectRatio: "4/3",
                    boxShadow: "0 16px 48px rgba(46, 42, 138, 0.08)",
                    border: "1px solid rgba(46, 42, 138, 0.12)",
                    background: "#F6F3FF",
                  }}
                >
                  <img
                    src={zone.image}
                    alt={zone.alt}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  {/* Subtle Indigo Duotone Overlay */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(46, 42, 138, 0.22)",
                      mixBlendMode: "multiply",
                    }}
                  />
                </div>

                {/* Content Column */}
                <div style={{ order: isReversed ? 1 : 2 }}>
                  <span
                    style={{
                      fontFamily: "'Unbounded', sans-serif",
                      fontSize: "0.74rem",
                      fontWeight: 800,
                      color: zone.accent,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      display: "block",
                      marginBottom: 10,
                    }}
                  >
                    {zone.tag}
                  </span>

                  <h2
                    style={{
                      fontFamily: "'Unbounded', sans-serif",
                      fontWeight: 900,
                      fontSize: "clamp(2rem, 3.8vw, 3rem)",
                      color: "#0B0B1E",
                      margin: "0 0 16px",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.1,
                    }}
                  >
                    {zone.title}
                  </h2>

                  <p
                    style={{
                      fontFamily: "'Montserrat', sans-serif",
                      color: "#38375A",
                      fontSize: "clamp(0.95rem, 1.3vw, 1.05rem)",
                      lineHeight: 1.65,
                      marginBottom: 24,
                    }}
                  >
                    {zone.summary}
                  </p>

                  {/* Highlights Bullet List */}
                  <div style={{ marginBottom: 24 }}>
                    <h4
                      style={{
                        fontFamily: "'Unbounded', sans-serif",
                        fontSize: "0.82rem",
                        fontWeight: 800,
                        color: "#2E2A8A",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        margin: "0 0 12px",
                      }}
                    >
                      Zone Highlights
                    </h4>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                      {zone.highlights.map((h, i) => (
                        <li
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            fontFamily: "'Montserrat', sans-serif",
                            fontSize: "0.88rem",
                            color: "#38375A",
                            lineHeight: 1.5,
                          }}
                        >
                          <CheckCircle2 size={16} color={zone.accent} style={{ flexShrink: 0, marginTop: 3 }} />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Meta Chips: Venue, Dates, Rules */}
                  <div
                    style={{
                      padding: "16px 20px",
                      borderRadius: "16px",
                      background: "#F6F3FF",
                      border: "1px solid rgba(46, 42, 138, 0.1)",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      marginBottom: 28,
                      fontSize: "0.82rem",
                    }}
                  >
                    <div>
                      <span style={{ color: "#6B688A", display: "block", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 600 }}>
                        Venue
                      </span>
                      <strong style={{ color: "#0B0B1E" }}>{zone.venue}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#6B688A", display: "block", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 600 }}>
                        Dates
                      </span>
                      <strong style={{ color: "#0B0B1E" }}>{zone.dates}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#6B688A", display: "block", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 600 }}>
                        Registration Fee
                      </span>
                      <strong style={{ color: "#5648B0" }}>{zone.fees}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#6B688A", display: "block", fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 600 }}>
                        Eligibility & Rules
                      </span>
                      <strong style={{ color: "#5648B0" }}>{zone.rules}</strong>
                    </div>
                  </div>

                  {/* Primary Button */}
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
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#E0670E";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={(e) => {
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
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
