import { useEffect } from "react";
import { Link } from "react-router-dom";
import { X, Sparkles, Users, Gamepad2, ArrowRight } from "lucide-react";

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RegistrationModal({ isOpen, onClose }: RegistrationModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reg-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "rgba(23, 23, 27, 0.72)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          width: "min(100%, 780px)",
          background: "var(--paper)",
          borderRadius: "28px",
          padding: "clamp(24px, 4vw, 44px)",
          boxShadow: "0 30px 60px -20px rgba(23, 23, 27, 0.4)",
          border: "1px solid var(--line)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close registration panel"
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--paper-deep)",
            border: "1px solid var(--line-soft)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            color: "var(--ink)",
            transition: "all 0.2s ease",
          }}
        >
          <X size={20} />
        </button>

        <p className="hm-kicker" style={{ color: "var(--cobalt)" }}>SUPERNOVA 3.0 REGISTRATION</p>
        <h2 id="reg-modal-title" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)", marginTop: 8, marginBottom: 8, letterSpacing: "-0.03em" }}>
          Choose your experience path
        </h2>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem", marginBottom: 32, maxWidth: 540 }}>
          Select how you wish to take part in Supernova 3.0 at The National College (20–21 November 2026).
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          {/* 01 Participation */}
          <Link
            to="/register/participation"
            onClick={onClose}
            className="reg-choice-card"
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 20,
              alignItems: "center",
              padding: "24px",
              background: "#ffffff",
              borderRadius: "20px",
              border: "1.5px solid var(--line)",
              textDecoration: "none",
              color: "inherit",
              transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "16px",
                background: "var(--pale-blue)",
                color: "var(--cobalt)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Sparkles size={26} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.1em", color: "var(--cobalt)" }}>01</span>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Participation Registration</h3>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--ink-soft)", marginTop: 4 }}>
                For student researchers, innovators, school creators, and animation exhibitors showcasing projects.
              </p>
            </div>
            <ArrowRight size={20} color="var(--cobalt)" />
          </Link>

          {/* 02 Visitor */}
          <Link
            to="/register/visitor"
            onClick={onClose}
            className="reg-choice-card"
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 20,
              alignItems: "center",
              padding: "24px",
              background: "#ffffff",
              borderRadius: "20px",
              border: "1.5px solid var(--line)",
              textDecoration: "none",
              color: "inherit",
              transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "16px",
                background: "rgba(169, 228, 197, 0.4)",
                color: "#1f754c",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Users size={26} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.1em", color: "#1f754c" }}>02</span>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Visitor Registration</h3>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--ink-soft)", marginTop: 4 }}>
                Free entry pass for school & college students, teachers, parents, and general public visitors.
              </p>
            </div>
            <ArrowRight size={20} color="#1f754c" />
          </Link>

          {/* 03 Esports */}
          <Link
            to="/register/esports"
            onClick={onClose}
            className="reg-choice-card"
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 20,
              alignItems: "center",
              padding: "24px",
              background: "#ffffff",
              borderRadius: "20px",
              border: "1.5px solid var(--line)",
              textDecoration: "none",
              color: "inherit",
              transition: "transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "16px",
                background: "rgba(240, 120, 85, 0.2)",
                color: "var(--coral)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Gamepad2 size={26} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.1em", color: "var(--coral)" }}>03</span>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Esports Tournament Roster</h3>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--ink-soft)", marginTop: 4 }}>
                Team entry for VALORANT (5 players), FREE FIRE (4 players), or BGMI (4 players).
              </p>
            </div>
            <ArrowRight size={20} color="var(--coral)" />
          </Link>
        </div>
      </div>
    </div>
  );
}
