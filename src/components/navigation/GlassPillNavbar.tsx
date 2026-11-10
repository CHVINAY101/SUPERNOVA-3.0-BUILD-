import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { CONFIG, getInstagramDisplay } from "@/config";
import { MagneticButton } from "@/components/common/MagneticButton";

const NAV_LINKS = [
  { id: "home", label: "Home", href: "/#home" },
  { id: "about", label: "About", href: "/#about" },
  { id: "experiences", label: "Experiences", href: "/#experiences" },
  { id: "esports", label: "Esports", href: "/#esports" },
  { id: "schedule", label: "Schedule", href: "/#schedule" },
  { id: "contact", label: "Contact", href: "/#contact" },
];

export const GlassPillNavbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState("home");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinksContainerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isHome = location.pathname === "/";

  // Capsule indicator position
  const [capsuleStyle, setCapsuleStyle] = useState({ left: 0, width: 0, opacity: 0 });

  // Scroll listener for 80px shrink, scroll progress, and scroll-spy
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setScrolled(scrollY > 80);

      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(1, Math.max(0, scrollY / docHeight)) : 0;
      setScrollProgress(progress);

      if (!isHome) return;

      const sections = NAV_LINKS.map((l) => l.id);
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i]);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 160) {
            setActiveSection(sections[i]);
            return;
          }
        }
      }
      if (scrollY < 200) {
        setActiveSection("home");
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHome]);

  // Update sliding capsule position based on hovered or active link
  useEffect(() => {
    if (!navLinksContainerRef.current) return;
    const container = navLinksContainerRef.current;
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>(".glass-nav-link"));

    const targetIdx = hoveredIndex !== null ? hoveredIndex : NAV_LINKS.findIndex((l) => l.id === activeSection);

    if (targetIdx >= 0 && links[targetIdx]) {
      const linkEl = links[targetIdx];
      setCapsuleStyle({
        left: linkEl.offsetLeft,
        width: linkEl.offsetWidth,
        opacity: 1,
      });
    } else {
      setCapsuleStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  }, [hoveredIndex, activeSection, scrolled]);

  // Body scroll lock & Escape key handling for mobile overlay
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setMobileMenuOpen(false);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", onKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [mobileMenuOpen]);

  const handleLinkClick = (href: string) => {
    setMobileMenuOpen(false);
    if (isHome && href.startsWith("/#")) {
      const id = href.replace("/#", "");
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const instaBasavanagudi = getInstagramDisplay("nationalCollegeBasavanagudi");
  const instaNcba = getInstagramDisplay("nationalNcba");

  return (
    <>
      {/* Floating Glass Pill Navigation */}
      <header
        className={`nav-glass-pill ${scrolled ? "scrolled" : ""}`}
        aria-label="Festival Navigation"
      >
        {/* 1. Left: Brand Logo (At least 40px tall, ~180px wide) */}
        <div className="flex items-center">
          <Link
            to="/"
            onClick={() => handleLinkClick("/#home")}
            className="flex items-center transition-transform hover:scale-105"
            aria-label={CONFIG.EVENT_NAME}
          >
            <img
              src={CONFIG.LOGO_PATH}
              alt={CONFIG.EVENT_NAME}
              style={{
                height: scrolled ? 38 : 42,
                width: "auto",
                minWidth: 150,
                maxWidth: 190,
                transition: "height 0.3s ease",
              }}
              className="object-contain block"
            />
          </Link>
        </div>

        {/* 2. Center: Navigation Links with Sliding Capsule (Desktop >= 900px) */}
        <div className="hidden desktop-nav-visible items-center justify-center relative">
          <div
            ref={navLinksContainerRef}
            className="flex items-center gap-2 relative px-2 py-1"
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Sliding Capsule Indicator */}
            <div
              className="nav-link-capsule"
              style={{
                left: `${capsuleStyle.left}px`,
                width: `${capsuleStyle.width}px`,
                opacity: capsuleStyle.opacity,
              }}
            />

            {NAV_LINKS.map((link, idx) => {
              const isActive = isHome && activeSection === link.id;
              return (
                <a
                  key={link.id}
                  href={link.href}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onClick={(e) => {
                    if (isHome) {
                      e.preventDefault();
                      handleLinkClick(link.href);
                    }
                  }}
                  className="glass-nav-link relative z-10 px-3.5 py-1.5 text-[15px] font-semibold text-[#151535] hover:text-[#1719C9] transition-colors whitespace-nowrap"
                  style={{
                    color: isActive ? "#1719C9" : "#151535",
                  }}
                >
                  {link.label}
                </a>
              );
            })}
          </div>
        </div>

        {/* 3. Right: Register Now Magnetic Button (48px lime pill with arrow) */}
        <div className="flex items-center justify-end">
          <div className="hidden desktop-nav-visible items-center">
            <MagneticButton to="/register" variant="lime" showArrow>
              Register Now
            </MagneticButton>
          </div>

          {/* Mobile "Menu" Button (Below 900px, 48px round pill) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex mobile-menu-btn-visible items-center justify-center font-bold text-sm px-4 h-10 rounded-full bg-[#151535] text-white hover:bg-[#1719C9] transition-colors"
            style={{ minHeight: 40 }}
            aria-label="Open Festival Menu"
          >
            Menu
          </button>
        </div>

        {/* Bottom 3px Ribbon Scroll-Progress Line */}
        <div
          className="nav-scroll-progress"
          style={{
            transform: `scaleX(${scrollProgress})`,
          }}
        />
      </header>

      {/* Mobile Full-Screen Electric-Blue Overlay */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Festival Navigation Menu"
          className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto"
          style={{
            backgroundColor: "#1719C9",
            color: "#FFFFFF",
            padding: "24px 20px 36px 20px",
          }}
        >
          {/* Top Header inside overlay: Logo & Morphing Close Icon */}
          <div className="flex items-center justify-between w-full">
            <img
              src={CONFIG.LOGO_PATH}
              alt={CONFIG.EVENT_NAME}
              style={{ height: 36, filter: "brightness(0) invert(1)" }}
              className="object-contain"
            />

            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="w-12 h-12 rounded-full flex items-center justify-center bg-white/15 text-white hover:bg-white/25 transition-colors border border-white/20"
              aria-label="Close Navigation Menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Staggered 40px White Display Links */}
          <nav className="my-auto py-6 flex flex-col gap-4">
            {NAV_LINKS.map((link, idx) => (
              <a
                key={link.id}
                href={link.href}
                onClick={(e) => {
                  if (isHome) e.preventDefault();
                  handleLinkClick(link.href);
                }}
                className="font-heading text-[38px] sm:text-[44px] font-bold text-white hover:text-[#C8F500] transition-colors leading-tight"
                style={{
                  animation: `fadeSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                  animationDelay: `${idx * 0.06}s`,
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Bottom Area: Full-width Lime Register Button, Instagram, Helpdesk */}
          <div className="flex flex-col gap-4 pt-4 border-t border-white/20">
            <Link
              to="/register"
              onClick={() => setMobileMenuOpen(false)}
              className="btn-magnetic-lime w-full text-center"
              style={{ height: 54, fontSize: 16 }}
            >
              Register Now →
            </Link>

            <div className="flex flex-col gap-1.5 text-xs text-white/80 pt-2">
              <div className="flex items-center justify-between">
                <span>{instaBasavanagudi.name}:</span>
                {instaBasavanagudi.url ? (
                  <a href={instaBasavanagudi.url} target="_blank" rel="noreferrer" className="underline font-bold text-[#C8F500]">
                    Instagram ↗
                  </a>
                ) : (
                  <span className="italic text-white/60">Details coming soon</span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span>{instaNcba.name}:</span>
                {instaNcba.url ? (
                  <a href={instaNcba.url} target="_blank" rel="noreferrer" className="underline font-bold text-[#C8F500]">
                    Instagram ↗
                  </a>
                ) : (
                  <span className="italic text-white/60">Details coming soon</span>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span>Helpdesk:</span>
                <a href={`mailto:${CONFIG.HELPDESK_EMAIL}`} className="font-mono text-white underline">
                  {CONFIG.HELPDESK_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
};
