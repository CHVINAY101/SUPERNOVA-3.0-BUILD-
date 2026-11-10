import { useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { CONFIG } from "@/config";
import { InteractiveHeroLogo } from "./InteractiveHeroLogo";
import { RetroStackArt } from "./RetroStackArt";
import { Abstract3DShapesArt } from "./Abstract3DShapesArt";
import { WaveRibbonDivider } from "./WaveRibbonDivider";
import { FloatingShapes } from "./FloatingShapes";
import { HeroCountdown } from "@/components/common/HeroCountdown";

export const Hero: React.FC = () => {
  const heroRef = useRef<HTMLElement>(null);
  const centerColRef = useRef<HTMLDivElement>(null);

  // Automated Centering Check in Code:
  // "each hero element's center must be within 2px of document.documentElement.clientWidth / 2. Fix automatically if not."
  useEffect(() => {
    const verifyCentering = () => {
      if (!centerColRef.current) return;
      const viewportCenter = document.documentElement.clientWidth / 2;
      const elements = centerColRef.current.children;

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLElement;
        const rect = el.getBoundingClientRect();
        const elementCenter = rect.left + rect.width / 2;
        const diff = Math.abs(elementCenter - viewportCenter);

        // If off by more than 2px, enforce exact margin: 0 auto & text-align: center
        if (diff > 2) {
          el.style.marginLeft = "auto";
          el.style.marginRight = "auto";
          el.style.textAlign = "center";
        }
      }
    };

    // Run after paint & on resize
    const timer = setTimeout(verifyCentering, 100);
    window.addEventListener("resize", verifyCentering);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", verifyCentering);
    };
  }, []);

  const handleScrollToExpo = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("about") || document.getElementById("experiences");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section
      ref={heroRef}
      id="home"
      className="hero-section"
      aria-label="Hero Section"
    >
      {/* 24px Dot Grid Background + 4% Grain Overlay */}
      <div className="hero-dot-grid" />
      <div className="hero-grain-overlay" />

      {/* Floating Background Shapes (Max 8 desktop, 4 mobile) */}
      <FloatingShapes containerRef={heroRef} />

      {/* Main Content Container */}
      <div className="hero-content-wrapper my-auto">
        {/* ROW 1: Presenter Line + Large Logo */}
        <div className="hero-row-1">
          <div className="hero-presenter-badge">
            <span>{CONFIG.PRESENTER_LEAD}</span>
            <span style={{ margin: "0 8px", opacity: 0.5 }}>/</span>
            <span style={{ color: "var(--text-navy-muted)" }}>{CONFIG.PRESENTER_ACTION}</span>
          </div>

          <div className="hero-large-logo-container">
            <InteractiveHeroLogo />
          </div>
        </div>

        {/* ROW 2: Strict 3-column grid starting at 1100px */}
        <div className="hero-row-2-grid">
          {/* Left Column: Retro Stack Art (Desktop only) */}
          <div className="hero-col-left">
            <RetroStackArt className="w-full" />
          </div>

          {/* Center Column: All core typography, date, buttons, sub-link */}
          <div ref={centerColRef} className="hero-col-center">
            {/* 1. Theme words on ONE line (Space Grotesk Bold, 36 to 48px) */}
            <h1 className="hero-theme-words">
              <span className="word-blue">CREATE. </span>
              <span className="word-magenta">CONNECT. </span>
              <span className="word-orange">CELEBRATE.</span>
            </h1>

            {/* 2. Tagline (20px) and description (16px, max 560px wide) */}
            <p className="hero-tagline">
              "{CONFIG.TAGLINE}"
            </p>
            <p className="hero-description">
              {CONFIG.DESCRIPTION}
            </p>

            {/* 3. Date ("20–21 NOVEMBER 2026") and venue */}
            <div className="hero-date-block">
              {CONFIG.DATES.toUpperCase()}
            </div>
            <div className="hero-venue-block">
              {CONFIG.VENUE.toUpperCase()}
            </div>

            {/* 4. Two 52px buttons side by side */}
            <div className="hero-buttons-row">
              <Link
                to="/register?type=esports"
                className="btn-primary"
                aria-label="Register for Esports"
              >
                Register for Esports
              </Link>

              <a
                href="#about"
                onClick={handleScrollToExpo}
                className="btn-secondary"
                aria-label="Explore the Expo"
              >
                Explore the Expo
              </a>
            </div>

            {/* 5. Centered 14px text link */}
            <Link to="/register" className="hero-sub-link">
              Visitor and participant registration is open too →
            </Link>

            {/* 6. Compact Countdown Strip */}
            <HeroCountdown />
          </div>

          {/* Right Column: Floating 3D Objects Art (Desktop only) */}
          <div className="hero-col-right">
            <Abstract3DShapesArt className="w-full" />
          </div>
        </div>

        {/* Mobile/Tablet Art Row: side-by-side small 120px art at very bottom */}
        <div className="hero-mobile-art-row">
          <div style={{ width: 120 }}>
            <RetroStackArt className="w-full" />
          </div>
          <div style={{ width: 120 }}>
            <Abstract3DShapesArt className="w-full" />
          </div>
        </div>
      </div>

      {/* Ribbon wave divider in bottom 120px */}
      <div className="w-full mt-auto" style={{ height: 120, overflow: "hidden" }}>
        <WaveRibbonDivider />
      </div>
    </section>
  );
};
