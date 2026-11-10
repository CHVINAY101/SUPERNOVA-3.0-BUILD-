import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { CONFIG, getInstagramDisplay } from "@/config";

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState("home");
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  const navLinksRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const magneticBtnRef = useRef<HTMLAnchorElement>(null);

  const location = useLocation();
  const isHomePage = location.pathname === "/";

  const NAV_LINKS = [
    { label: "Home", href: "/#home", id: "home" },
    { label: "About", href: "/#about", id: "about" },
    { label: "Experiences", href: "/#experiences", id: "experiences" },
    { label: "Esports", href: "/#esports", id: "esports" },
    { label: "Schedule", href: "/#schedule", id: "schedule" },
    { label: "Contact", href: "/#contact", id: "contact" },
  ];

  // 1. Scroll listener: Shrink to 56px after 80px + calculate scroll progress %
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setIsScrolled(scrollY > 80);

      // Scroll progress
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollY / docHeight) * 100 : 0;
      setScrollProgress(Math.min(100, Math.max(0, progress)));

      // Section scroll spy
      if (isHomePage) {
        const sections = NAV_LINKS.map((link) => link.id);
        for (let i = sections.length - 1; i >= 0; i--) {
          const el = document.getElementById(sections[i]);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top <= 140) {
              setActiveSection(sections[i]);
              return;
            }
          }
        }
        if (scrollY < 180) {
          setActiveSection("home");
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHomePage]);

  // 2. Sliding navy capsule (8% opacity) that glides to hovered link and rests on active section
  useEffect(() => {
    const targetId = hoveredSection || activeSection;
    if (!navLinksRef.current || !capsuleRef.current) return;

    const targetEl = navLinksRef.current.querySelector<HTMLElement>(`[data-link-id="${targetId}"]`);
    if (targetEl) {
      const parentRect = navLinksRef.current.getBoundingClientRect();
      const elRect = targetEl.getBoundingClientRect();

      const left = elRect.left - parentRect.left;
      const width = elRect.width;

      capsuleRef.current.style.opacity = "1";
      capsuleRef.current.style.width = `${width}px`;
      capsuleRef.current.style.transform = `translateX(${left}px)`;
    } else {
      capsuleRef.current.style.opacity = "0";
    }
  }, [activeSection, hoveredSection]);

  // 3. Magnetic pull on Register Now button (at most 8px)
  const handleBtnMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const btn = magneticBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    // Clamp to at most 8px
    const maxPull = 8;
    const pullX = Math.max(-maxPull, Math.min(maxPull, x * 0.25));
    const pullY = Math.max(-maxPull, Math.min(maxPull, y * 0.25));

    btn.style.transform = `translate(${pullX}px, ${pullY}px)`;
  };

  const handleBtnMouseLeave = () => {
    if (magneticBtnRef.current) {
      magneticBtnRef.current.style.transform = "translate(0px, 0px)";
    }
  };

  // 4. Body scroll lock and Escape to close mobile menu
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setMobileMenuOpen(false);
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [mobileMenuOpen]);

  const handleLinkClick = (href: string) => {
    setMobileMenuOpen(false);
    if (isHomePage && href.startsWith("/#")) {
      const targetId = href.replace("/#", "");
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  const instaBasavanagudi = getInstagramDisplay("nationalCollegeBasavanagudi");
  const instaNcba = getInstagramDisplay("nationalNcba");

  return (
    <>
      {/* Floating Glass Pill Navigation */}
      <nav
        aria-label="Primary Navigation"
        className={`floating-nav-wrapper ${isScrolled ? "scrolled" : ""}`}
      >
        <div className="floating-nav-pill">
          {/* Scroll Progress Line Along Bottom Edge (3px Ribbon Gradient) */}
          <div
            className="nav-scroll-progress-line"
            style={{ width: `${scrollProgress}%` }}
          />

          {/* 1. Logo (At least 40px tall, ~180px wide) */}
          <Link
            to="/"
            className="nav-brand-container"
            aria-label={CONFIG.EVENT_NAME}
            style={{ display: "flex", alignItems: "center" }}
          >
            <img
              src={CONFIG.LOGO_PATH}
              alt={CONFIG.EVENT_NAME}
              className="nav-brand-logo"
              style={{
                height: 40,
                width: "auto",
                minWidth: 140,
                maxWidth: 190,
                objectFit: "contain",
              }}
            />
          </Link>

          {/* 2. Links centered: Home, About, Experiences, Esports, Schedule, Contact */}
          <div
            ref={navLinksRef}
            className="nav-links-center"
            onMouseLeave={() => setHoveredSection(null)}
          >
            {/* Sliding navy capsule (8% opacity) */}
            <div ref={capsuleRef} className="nav-sliding-capsule" />

            {NAV_LINKS.map((link) => {
              const isActive = isHomePage && activeSection === link.id;
              return (
                <a
                  key={link.id}
                  data-link-id={link.id}
                  href={link.href}
                  onMouseEnter={() => setHoveredSection(link.id)}
                  onClick={(e) => {
                    if (isHomePage) {
                      e.preventDefault();
                      handleLinkClick(link.href);
                    }
                  }}
                  className={`nav-link-btn ${isActive ? "active" : ""}`}
                  style={{
                    color: isActive ? "#1719C9" : "#151535",
                  }}
                >
                  {link.label}
                </a>
              );
            })}
          </div>

          {/* 3. Register Now: 48px lime pill, 2px navy outline, hard shadow, sliding arrow icon */}
          <div className="nav-desktop-action" style={{ display: "flex", alignItems: "center" }}>
            <Link
              ref={magneticBtnRef}
              to="/register"
              onMouseMove={handleBtnMouseMove}
              onMouseLeave={handleBtnMouseLeave}
              className="btn-nav-register"
            >
              <span>Register Now</span>
              <svg
                className="nav-arrow"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#151535"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>

          {/* Mobile Menu Button (< 900px) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="nav-mobile-toggle-btn"
            aria-label="Open Navigation Menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#151535"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <span>Menu</span>
          </button>
        </div>
      </nav>

      {/* Full-Screen Electric-Blue Mobile Overlay (< 900px) */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            backgroundColor: "#1719C9",
            color: "#FFFFFF",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "24px 20px 32px 20px",
            overflowY: "auto",
            animation: "overlayFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Top Bar with Logo & Close Button */}
          <div style={{ display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "space-between" }}>
            <img
              src={CONFIG.LOGO_PATH}
              alt={CONFIG.EVENT_NAME}
              style={{ height: 36, width: "auto", filter: "brightness(0) invert(1)" }}
            />

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                border: "1.5px solid rgba(255, 255, 255, 0.4)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              aria-label="Close Navigation Menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* 40px White Links Sliding up in Stagger */}
          <div style={{ margin: "auto 0", display: "flex", flexDirection: "column", gap: "20px", padding: "32px 0" }}>
            {NAV_LINKS.map((link, idx) => (
              <a
                key={link.id}
                href={link.href}
                onClick={(e) => {
                  if (isHomePage) e.preventDefault();
                  handleLinkClick(link.href);
                }}
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: 40,
                  fontWeight: 700,
                  color: "#FFFFFF",
                  textDecoration: "none",
                  letterSpacing: "-0.02em",
                  animation: `slideUpLink 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                  animationDelay: `${0.05 + idx * 0.05}s`,
                  opacity: 0,
                  transform: "translateY(20px)",
                }}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Bottom Area: Full-width Lime Register Now Button, Socials, Helpdesk */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", borderTop: "1px solid rgba(255, 255, 255, 0.2)", paddingTop: 20 }}>
            <Link
              to="/register"
              onClick={() => setMobileMenuOpen(false)}
              className="btn-primary"
              style={{
                width: "100%",
                height: 54,
                fontSize: 16,
                backgroundColor: "#C8F500",
                color: "#151535",
                border: "2px solid #151535",
                borderRadius: 9999,
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              Register Now →
            </Link>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "rgba(255, 255, 255, 0.85)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{instaBasavanagudi.name}:</span>
                {instaBasavanagudi.url ? (
                  <a href={instaBasavanagudi.url} target="_blank" rel="noopener noreferrer" style={{ color: "#FFFFFF", textDecoration: "underline" }}>
                    Instagram ↗
                  </a>
                ) : (
                  <span style={{ color: "rgba(255, 255, 255, 0.6)", fontStyle: "italic" }}>Details coming soon</span>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{instaNcba.name}:</span>
                {instaNcba.url ? (
                  <a href={instaNcba.url} target="_blank" rel="noopener noreferrer" style={{ color: "#FFFFFF", textDecoration: "underline" }}>
                    Instagram ↗
                  </a>
                ) : (
                  <span style={{ color: "rgba(255, 255, 255, 0.6)", fontStyle: "italic" }}>Details coming soon</span>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4 }}>
                <span>Helpdesk:</span>
                <a href={`mailto:${CONFIG.HELPDESK_EMAIL}`} style={{ color: "#C8F500", fontWeight: 600 }}>
                  {CONFIG.HELPDESK_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUpLink {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
};
