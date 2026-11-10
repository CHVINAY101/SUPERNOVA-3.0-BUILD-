import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { 
  FESTIVAL_CONFIG, 
  getPrimaryButtonLabel, 
  getPrimaryButtonHref,
  calculateCountdown,
  CountdownValues
} from "@/config/festival";
import { SupernovaLogo } from "@/components/home/SupernovaLogo";
import { InteractiveBackground } from "@/components/InteractiveBackground";
import { ChevronDown } from "lucide-react";

export function HomeHero() {
  const heroRef = useRef<HTMLElement>(null);
  const organiserRef = useRef<HTMLDivElement>(null);
  const mottoRef = useRef<HTMLDivElement>(null);
  const datesRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const countdownRef = useRef<HTMLDivElement>(null);
  const scrollCueRef = useRef<HTMLDivElement>(null);

  const [countdown, setCountdown] = useState<CountdownValues>(() => 
    calculateCountdown(FESTIVAL_CONFIG.COUNTDOWN_TARGET_ISO)
  );

  const [isMobile, setIsMobile] = useState<boolean>(() => 
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  const [contentVisible, setContentVisible] = useState<boolean>(false);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(calculateCountdown(FESTIVAL_CONFIG.COUNTDOWN_TARGET_ISO));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Sequential hero content fade-up after logo entrance (1.5s)
  const handleLogoEntranceComplete = useCallback(() => {
    setContentVisible(true);
  }, []);

  // Centering check in code:
  // Every hero element's center must be within 2px of document.documentElement.clientWidth / 2
  // Use clientWidth so the scrollbar doesn't skew it. Fix automatically if not.
  const verifyAndFixCentering = useCallback(() => {
    if (typeof window === "undefined") return;
    const clientWidth = document.documentElement.clientWidth;
    const viewportCenter = clientWidth / 2;

    const refs = [
      organiserRef.current,
      mottoRef.current,
      datesRef.current,
      buttonsRef.current,
      countdownRef.current,
      scrollCueRef.current,
    ];

    refs.forEach((el) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const elCenter = rect.left + rect.width / 2;
      const diff = viewportCenter - elCenter;
      if (Math.abs(diff) > 2) {
        const currentMarginLeft = parseFloat(el.style.marginLeft || "0");
        el.style.marginLeft = `${(currentMarginLeft + diff).toFixed(1)}px`;
      }
    });
  }, []);

  useEffect(() => {
    const timeout = setTimeout(verifyAndFixCentering, 250);
    window.addEventListener("resize", verifyAndFixCentering, { passive: true });
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("resize", verifyAndFixCentering);
    };
  }, [verifyAndFixCentering, contentVisible, isMobile]);

  const handleScrollToZones = (e: React.MouseEvent) => {
    e.preventDefault();
    const zonesEl = document.getElementById("zones");
    if (zonesEl) {
      zonesEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  const primaryHref = getPrimaryButtonHref();
  const primaryLabel = getPrimaryButtonLabel();

  return (
    <section
      ref={heroRef}
      className="hero-section-root"
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? "84px 20px 32px" : "96px 24px 36px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
      aria-label="Supernova 3.0 Hero"
    >
      {/* Background with 10 thin outline line-art shapes & exclusion zones */}
      <InteractiveBackground />

      {/* Hero Content Container:
          Everything centered on one axis, fits one screen at 1440x900,
          at least 32px between groups (20px on mobile) */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 1200,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: isMobile ? 20 : 32,
          margin: "0 auto",
        }}
      >
        {/* a) "THE NATIONAL EDUCATION SOCIETY OF KARNATAKA" (13px, bold, letter-spaced, indigo #2E2A8A),
            then "PRESENTS" (12px, letter-spaced). Text only, centered, with no logo or icon beside it. */}
        <div
          ref={organiserRef}
          className="hero-organiser-group"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            opacity: contentVisible ? 1 : 0.85,
            transform: contentVisible ? "translateY(0)" : "translateY(6px)",
            transition: "opacity 0.6s ease, transform 0.6s ease",
          }}
        >
          <span
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.18em",
              color: "#2E2A8A",
              textTransform: "uppercase",
              display: "block",
            }}
          >
            {FESTIVAL_CONFIG.ORGANISER_LEAD}
          </span>
          <span
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.24em",
              color: "#5648B0",
              textTransform: "uppercase",
              display: "block",
            }}
          >
            {FESTIVAL_CONFIG.PRESENTS}
          </span>
        </div>

        {/* b) The logo lockup at min(80vw, 960px) wide on desktop and 92vw on mobile. Do not restack it. */}
        <div className="hero-title-group" style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          <SupernovaLogo onEntranceComplete={handleLogoEntranceComplete} />
        </div>

        {/* c) "DREAM • CREATE • COMPETE" (17px, display font, letter-spaced) with a thin line on each side. */}
        <div
          ref={mottoRef}
          className="hero-motto-group"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: isMobile ? 12 : 24,
            width: "100%",
            maxWidth: 680,
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s",
          }}
        >
          <div
            style={{
              flex: 1,
              height: 1,
              background: "linear-gradient(90deg, transparent 0%, rgba(46, 42, 138, 0.28) 100%)",
            }}
          />
          <span
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontSize: isMobile ? 15 : 17,
              fontWeight: 800,
              letterSpacing: "0.12em",
              color: "#0B0B1E",
              whiteSpace: "nowrap",
            }}
          >
            {FESTIVAL_CONFIG.MOTTO}
          </span>
          <div
            style={{
              flex: 1,
              height: 1,
              background: "linear-gradient(90deg, rgba(46, 42, 138, 0.28) 0%, transparent 100%)",
            }}
          />
        </div>

        {/* d) "20 – 21 NOVEMBER 2026", then "THE NATIONAL COLLEGE · BASAVANAGUDI, BENGALURU – 04" (16px; on mobile 3 stacked lines: 20px, 15px, 13px). */}
        <div
          ref={datesRef}
          className="hero-dates-group"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: isMobile ? 4 : 6,
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.6s ease 0.2s, transform 0.6s ease 0.2s",
          }}
        >
          {!isMobile ? (
            <>
              <span
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  color: "#2E2A8A",
                }}
              >
                {FESTIVAL_CONFIG.DATES}
              </span>
              <span
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#38375A",
                  letterSpacing: "0.04em",
                }}
              >
                {FESTIVAL_CONFIG.VENUE} · {FESTIVAL_CONFIG.CITY}
              </span>
            </>
          ) : (
            // Mobile: 3 stacked lines: 20px, 15px, 13px
            <>
              <span
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: "0.06em",
                  color: "#2E2A8A",
                  lineHeight: 1.2,
                }}
              >
                {FESTIVAL_CONFIG.DATES}
              </span>
              <span
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#0B0B1E",
                  lineHeight: 1.2,
                }}
              >
                {FESTIVAL_CONFIG.VENUE}
              </span>
              <span
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#5648B0",
                  letterSpacing: "0.02em",
                  lineHeight: 1.2,
                }}
              >
                {FESTIVAL_CONFIG.CITY}
              </span>
            </>
          )}
        </div>

        {/* e) Two buttons side by side, both exactly 52px tall: "Register Now" (orange, primary, goes to /register)
            and "Explore the Event" (outlined, scrolls to Zones). No caption under either. (Mobile: 54px full-width stacked). */}
        <div
          ref={buttonsRef}
          className="hero-buttons-group"
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: "center",
            justifyContent: "center",
            gap: isMobile ? 12 : 16,
            width: isMobile ? "100%" : "auto",
            maxWidth: isMobile ? 360 : "none",
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.6s ease 0.3s, transform 0.6s ease 0.3s",
          }}
        >
          <Link
            to={primaryHref}
            style={{
              height: isMobile ? 54 : 52,
              width: isMobile ? "100%" : "auto",
              padding: "0 34px",
              boxSizing: "border-box",
              borderRadius: "9999px",
              background: "#F47B20",
              color: "#FFFFFF",
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: "0.04em",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 18px rgba(244, 123, 32, 0.3)",
              transition: "background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#E0670E";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(244, 123, 32, 0.38)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#F47B20";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 18px rgba(244, 123, 32, 0.3)";
            }}
          >
            {primaryLabel}
          </Link>

          <a
            href="#zones"
            onClick={handleScrollToZones}
            style={{
              height: isMobile ? 54 : 52,
              width: isMobile ? "100%" : "auto",
              padding: "0 32px",
              boxSizing: "border-box",
              borderRadius: "9999px",
              background: "transparent",
              color: "#2E2A8A",
              border: "1.5px solid #2E2A8A",
              fontFamily: "'Montserrat', sans-serif",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.03em",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.2s ease, color 0.2s ease, transform 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(46, 42, 138, 0.06)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Explore the Event
          </a>
        </div>

        {/* f) Countdown to 20 Nov 2026 00:00 IST: numerals 36px (28px on mobile), labels 11px, thin dividers, no box. */}
        <div
          ref={countdownRef}
          className="hero-countdown-group"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: isMobile ? 12 : 24,
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.6s ease 0.4s, transform 0.6s ease 0.4s",
          }}
          aria-label="Countdown to Supernova 3.0"
        >
          <div style={{ textAlign: "center", minWidth: isMobile ? 48 : 64 }}>
            <span
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: isMobile ? 28 : 36,
                fontWeight: 900,
                color: "#0B0B1E",
                lineHeight: 1,
                display: "block",
              }}
            >
              {String(countdown.days).padStart(2, "0")}
            </span>
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                color: "#6B688A",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "block",
                marginTop: 4,
              }}
            >
              Days
            </span>
          </div>

          <span style={{ fontSize: isMobile ? 20 : 26, color: "rgba(46, 42, 138, 0.25)", alignSelf: "flex-start", marginTop: 4 }}>
            :
          </span>

          <div style={{ textAlign: "center", minWidth: isMobile ? 48 : 64 }}>
            <span
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: isMobile ? 28 : 36,
                fontWeight: 900,
                color: "#0B0B1E",
                lineHeight: 1,
                display: "block",
              }}
            >
              {String(countdown.hours).padStart(2, "0")}
            </span>
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                color: "#6B688A",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "block",
                marginTop: 4,
              }}
            >
              Hours
            </span>
          </div>

          <span style={{ fontSize: isMobile ? 20 : 26, color: "rgba(46, 42, 138, 0.25)", alignSelf: "flex-start", marginTop: 4 }}>
            :
          </span>

          <div style={{ textAlign: "center", minWidth: isMobile ? 48 : 64 }}>
            <span
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: isMobile ? 28 : 36,
                fontWeight: 900,
                color: "#0B0B1E",
                lineHeight: 1,
                display: "block",
              }}
            >
              {String(countdown.minutes).padStart(2, "0")}
            </span>
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                color: "#6B688A",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "block",
                marginTop: 4,
              }}
            >
              Mins
            </span>
          </div>

          <span style={{ fontSize: isMobile ? 20 : 26, color: "rgba(46, 42, 138, 0.25)", alignSelf: "flex-start", marginTop: 4 }}>
            :
          </span>

          <div style={{ textAlign: "center", minWidth: isMobile ? 48 : 64 }}>
            <span
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: isMobile ? 28 : 36,
                fontWeight: 900,
                color: "#5648B0",
                lineHeight: 1,
                display: "block",
              }}
            >
              {String(countdown.seconds).padStart(2, "0")}
            </span>
            <span
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                color: "#6B688A",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "block",
                marginTop: 4,
              }}
            >
              Secs
            </span>
          </div>
        </div>

        {/* g) A small down-arrow scroll cue */}
        <div
          ref={scrollCueRef}
          className="hero-scroll-cue"
          style={{
            marginTop: 4,
            opacity: contentVisible ? 0.75 : 0,
            transition: "opacity 0.6s ease 0.5s",
          }}
        >
          <a
            href="#zones"
            onClick={handleScrollToZones}
            aria-label="Scroll down to Zones"
            style={{
              color: "#5648B0",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              animation: "bounceCue 2s infinite ease-in-out",
            }}
          >
            <ChevronDown size={22} strokeWidth={2.2} />
          </a>
        </div>
      </div>

      <style>{`
        @keyframes bounceCue {
          0%, 20%, 50%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(6px);
          }
          60% {
            transform: translateY(3px);
          }
        }
      `}</style>
    </section>
  );
}
