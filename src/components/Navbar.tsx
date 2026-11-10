import { useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X, Mail } from "lucide-react";
import { InstagramIcon } from "@/components/icons/InstagramIcon";
import { 
  FESTIVAL_CONFIG, 
  getPrimaryButtonLabel, 
  getPrimaryButtonHref 
} from "@/config/festival";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/events", label: "Events" },
  { to: "/schedule", label: "Schedule" },
  { to: "/gallery", label: "Gallery" },
  { to: "/updates", label: "Updates" },
  { to: "/contact", label: "Contact" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Body scroll lock & Escape key handler for mobile drawer
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  const primaryLabel = getPrimaryButtonLabel();
  const primaryHref = getPrimaryButtonHref();

  return (
    <>
      <header
        role="banner"
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "backdrop-blur-md bg-white/85 shadow-sm border-b border-indigo-900/10"
            : "bg-transparent border-b border-transparent"
        }`}
        style={{
          height: "var(--nav-height, 72px)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            height: "100%",
            margin: "0 auto",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          {/* Brand Logo Left: Official lockup, 36px tall */}
          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              flexShrink: 0,
            }}
            aria-label="Supernova 3.0 Home"
          >
            <img
              src="/assets/brand/supernova-logo.png"
              alt="Supernova 3.0"
              style={{
                height: 36,
                width: "auto",
                display: "block",
                objectFit: "contain",
              }}
            />
          </Link>

          {/* Desktop Nav Links */}
          <nav
            className="hidden md:flex items-center gap-7"
            aria-label="Main Navigation"
          >
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                style={({ isActive }) => ({
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: "0.88rem",
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#2E2A8A" : "#38375A",
                  textDecoration: "none",
                  letterSpacing: "0.02em",
                  padding: "4px 0",
                  position: "relative",
                  transition: "color 0.2s ease",
                  whiteSpace: "nowrap",
                })}
              >
                {({ isActive }) => (
                  <>
                    <span>{link.label}</span>
                    {isActive && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: -2,
                          left: 0,
                          right: 0,
                          height: 2,
                          background: "#2E2A8A",
                          borderRadius: 2,
                        }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Desktop Right: 44px Register Now Button */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              to={primaryHref}
              style={{
                height: 44,
                padding: "0 22px",
                borderRadius: "9999px",
                background: "#F47B20",
                color: "#FFFFFF",
                fontFamily: "'Montserrat', sans-serif",
                fontSize: "0.88rem",
                fontWeight: 800,
                letterSpacing: "0.03em",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 10px rgba(244, 123, 32, 0.25)",
                transition: "background 0.2s ease, transform 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#E0670E";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#F47B20";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {primaryLabel}
            </Link>
          </div>

          {/* Mobile Hamburger Button (48x48) */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="md:hidden"
            style={{
              width: 48,
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              color: "#0B0B1E",
              cursor: "pointer",
              padding: 0,
            }}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <Menu size={28} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {/* Full-screen Mobile Nav Drawer */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Drawer"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "#FFFFFF",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "24px 24px calc(24px + env(safe-area-inset-bottom, 0px))",
            overflowY: "auto",
          }}
        >
          {/* Drawer Top: Logo + 48px Close Button */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 64,
            }}
          >
            <img
              src="/assets/brand/supernova-logo.png"
              alt="Supernova 3.0"
              style={{
                height: 32,
                width: "auto",
                objectFit: "contain",
              }}
            />

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              style={{
                width: 48,
                height: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(46, 42, 138, 0.06)",
                border: "none",
                borderRadius: "50%",
                color: "#0B0B1E",
                cursor: "pointer",
              }}
              aria-label="Close menu"
            >
              <X size={26} strokeWidth={2.2} />
            </button>
          </div>

          {/* Drawer Links: 28px in display font with 20px gap */}
          <nav
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              margin: "36px 0",
            }}
            aria-label="Mobile Menu Links"
          >
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                onClick={() => setMobileOpen(false)}
                style={({ isActive }) => ({
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: 28,
                  fontWeight: 900,
                  color: isActive ? "#2E2A8A" : "#0B0B1E",
                  textDecoration: "none",
                  letterSpacing: "-0.02em",
                  display: "inline-block",
                })}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Drawer Bottom: Register Now button, 2 Instagram links, helpdesk email */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              paddingTop: 24,
              borderTop: "1px solid rgba(46, 42, 138, 0.12)",
            }}
          >
            {/* Register Now button (54px full-width) */}
            <Link
              to={primaryHref}
              onClick={() => setMobileOpen(false)}
              style={{
                width: "100%",
                height: 54,
                borderRadius: "9999px",
                background: "#F47B20",
                color: "#FFFFFF",
                fontFamily: "'Montserrat', sans-serif",
                fontSize: "1rem",
                fontWeight: 800,
                letterSpacing: "0.04em",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 16px rgba(244, 123, 32, 0.35)",
              }}
            >
              {primaryLabel}
            </Link>

            {/* 2 Instagram Links */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {FESTIVAL_CONFIG.SOCIAL_LINKS.map((social) => (
                <div
                  key={social.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: "0.85rem",
                    color: "#6B688A",
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 600,
                  }}
                >
                  <InstagramIcon size={18} color="#5648B0" />
                  <span>{social.label}</span>
                  {social.isPlaceholder && (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: "#9994B8",
                        background: "rgba(46, 42, 138, 0.05)",
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}
                    >
                      (Config placeholder)
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Helpdesk Email mailto link */}
            <a
              href={`mailto:${FESTIVAL_CONFIG.HELPDESK_EMAIL}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.86rem",
                color: "#2E2A8A",
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Mail size={16} />
              <span>Helpdesk: {FESTIVAL_CONFIG.HELPDESK_EMAIL}</span>
            </a>
          </div>
        </div>
      )}

      {/* Global CSS variable for nav height */}
      <style>{`
        :root {
          --nav-height: 72px;
        }
        @media (max-width: 767px) {
          :root {
            --nav-height: 64px;
          }
        }
      `}</style>
    </>
  );
}
