import { useRef } from "react";

interface SharedPageHeaderProps {
  title: string;
  subtitle?: string;
  tag?: string;
}

export function SharedPageHeader({ title, subtitle, tag }: SharedPageHeaderProps) {
  const lettersRef = useRef<(HTMLSpanElement | null)[]>([]);

  // Subtle letter hover wave on page title
  const handleMouseMove = (e: React.MouseEvent) => {
    const mx = e.clientX;
    const my = e.clientY;

    lettersRef.current.forEach((span) => {
      if (!span) return;
      const rect = span.getBoundingClientRect();
      const lx = rect.left + rect.width / 2;
      const ly = rect.top + rect.height / 2;
      const dist = Math.hypot(mx - lx, my - ly);
      if (dist < 180) {
        const p = 1 - dist / 180;
        span.style.transform = `translateY(${-p * 8}px) scale(${1 + p * 0.06})`;
        span.style.color = p > 0.5 ? "#2E2A8A" : "#5648B0";
      } else {
        span.style.transform = "none";
        span.style.color = "#0B0B1E";
      }
    });
  };

  const handleMouseLeave = () => {
    lettersRef.current.forEach((span) => {
      if (span) {
        span.style.transform = "none";
        span.style.color = "#0B0B1E";
      }
    });
  };

  const chars = title.split("");

  return (
    <div
      style={{
        position: "relative",
        height: "clamp(300px, 40vh, 420px)",
        width: "100%",
        background: "linear-gradient(180deg, #F6F3FF 0%, #FFFFFF 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "clamp(84px, 12vh, 108px) 24px 36px",
        overflow: "hidden",
        borderBottom: "1px solid rgba(46, 42, 138, 0.08)",
        boxSizing: "border-box",
      }}
    >
      {/* Drifting Background Line Art Shapes (Mid-violet #7C6CF5, 30-40% opacity) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 1,
          opacity: 0.35,
        }}
      >
        <div style={{ position: "absolute", top: "18%", left: "8%" }}>
          <svg width="65" height="65" viewBox="0 0 24 24" fill="none" stroke="#7C6CF5" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(30 12 12)" />
            <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-30 12 12)" />
          </svg>
        </div>
        <div style={{ position: "absolute", top: "22%", right: "10%" }}>
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#7C6CF5" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          </svg>
        </div>
        <div style={{ position: "absolute", bottom: "16%", left: "16%" }}>
          <svg width="55" height="55" viewBox="0 0 24 24" fill="none" stroke="#7C6CF5" strokeWidth="1.6" strokeLinecap="round">
            <rect x="2" y="6" width="20" height="12" rx="4" />
            <path d="M6 12h4M8 10v4" />
          </svg>
        </div>
        <div style={{ position: "absolute", bottom: "15%", right: "18%" }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#7C6CF5" strokeWidth="1.6" strokeLinecap="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m10 8 6 4-6 4V8z" />
          </svg>
        </div>
      </div>

      {/* Header Content */}
      <div style={{ position: "relative", zIndex: 10, maxWidth: 880, margin: "0 auto" }}>
        {tag && (
          <span
            style={{
              padding: "4px 14px",
              borderRadius: "9999px",
              background: "rgba(46, 42, 138, 0.08)",
              border: "1px solid rgba(46, 42, 138, 0.2)",
              color: "#2E2A8A",
              fontFamily: "'Montserrat', sans-serif",
              fontSize: "0.76rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              display: "inline-block",
              marginBottom: 14,
            }}
          >
            {tag}
          </span>
        )}

        <h1
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: "clamp(2.2rem, 5.2vw, 4.2rem)",
            lineHeight: 1.08,
            color: "#0B0B1E",
            letterSpacing: "-0.03em",
            margin: "0 0 14px",
            userSelect: "none",
          }}
        >
          {chars.map((c, i) => (
            <span
              key={i}
              ref={(el) => (lettersRef.current[i] = el)}
              style={{
                display: "inline-block",
                transition: "transform 0.15s ease, color 0.15s ease",
              }}
            >
              {c === " " ? "\u00A0" : c}
            </span>
          ))}
        </h1>

        {subtitle && (
          <p
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: "clamp(0.92rem, 1.4vw, 1.06rem)",
              color: "#38375A",
              maxWidth: 620,
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
