import { useState, useEffect, type FC } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";

interface NavLinkItem {
  id: string;
  label: string;
  href: string;
  anchorId?: string;
}

const NAV_ITEMS: NavLinkItem[] = [
  { id: "home", label: "Home", href: "/", anchorId: "home" },
  { id: "about", label: "About", href: "/about", anchorId: "about" },
  { id: "events", label: "Events", href: "/events", anchorId: "experiences" },
  { id: "animation", label: "Animation", href: "/animation", anchorId: "animation-preview" },
  { id: "esports", label: "Esports", href: "/esports", anchorId: "esports" },
  { id: "schedule", label: "Schedule", href: "/schedule", anchorId: "schedule" },
  { id: "gallery", label: "Gallery", href: "/gallery" },
  { id: "contact", label: "Contact", href: "/contact", anchorId: "contact" },
];

export const Nav: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  // On homepage, nav is hidden initially and reveals smoothly when scrolling past the hero.
  // On all other routes, nav is visible immediately.
  const [showNav, setShowNav] = useState(!isHomePage);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");

  // Keep visibility in sync when route changes
  useEffect(() => {
    if (!isHomePage) {
      setShowNav(true);
    } else {
      setShowNav(window.scrollY > 380);
    }
    setMobileMenuOpen(false);
  }, [isHomePage, location.pathname]);

  // Scroll detection for homepage hero reveal
  useEffect(() => {
    if (!isHomePage) {
      setShowNav(true);
      return;
    }

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          if (scrollY > 380) {
            setShowNav(true);
          } else if (scrollY < 120) {
            setShowNav(false);
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [isHomePage]);

  // Active section spy for homepage
  useEffect(() => {
    if (!isHomePage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-25% 0px -45% 0px" }
    );

    NAV_ITEMS.forEach((item) => {
      const targetId = item.anchorId || item.id;
      const el = document.getElementById(targetId);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isHomePage]);

  // Prevent background scrolling when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleNavClick = (item: NavLinkItem) => {
    setMobileMenuOpen(false);

    if (isHomePage && item.anchorId) {
      const el = document.getElementById(item.anchorId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }

    navigate(item.href);
  };

  const isItemActive = (item: NavLinkItem) => {
    if (isHomePage) {
      return activeSection === (item.anchorId || item.id);
    }
    return location.pathname === item.href;
  };

  return (
    <>
      {/* Compact Floating Navigation Bar */}
      <header
        role="banner"
        className={`fixed top-3 sm:top-4 inset-x-0 mx-auto w-[calc(100%-24px)] max-w-5xl z-50 transition-all duration-300 ease-out ${
          showNav
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "-translate-y-16 opacity-0 pointer-events-none"
        }`}
      >
        <div className="bg-[#0B1120]/85 backdrop-blur-md border border-slate-700/50 rounded-full px-3.5 sm:px-5 py-2 shadow-lg shadow-black/25 flex items-center justify-between gap-3 transition-colors">
          {/* Supernova Brand Logo */}
          <Link
            to="/"
            onClick={() => {
              if (isHomePage) {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            className="flex items-center gap-2 select-none group shrink-0"
            aria-label="SUPERNOVA 3.0 Home"
          >
            <img
              src="/assets/aistudio/3-Photoroom_7b0b3a46.png"
              alt="SUPERNOVA 3.0"
              className="h-7 sm:h-8 w-auto object-contain block transition-transform group-hover:scale-105"
              onError={(e) => {
                e.currentTarget.src = "/assets/brand/supernova-logo.png";
              }}
            />
          </Link>

          {/* Desktop Navigation Links */}
          <nav
            role="navigation"
            aria-label="Primary Navigation"
            className="hidden lg:flex items-center gap-1"
          >
            {NAV_ITEMS.map((item) => {
              const active = isItemActive(item);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item)}
                  className={`px-3 py-1.5 rounded-full text-xs font-sans font-medium tracking-wide transition-all duration-150 cursor-pointer ${
                    active
                      ? "text-sky-400 bg-sky-400/10 font-semibold shadow-xs"
                      : "text-slate-300 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Registration Action & Mobile Hamburger */}
          <div className="flex items-center gap-2">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-1.5 h-8 sm:h-9 px-3.5 sm:px-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-sans font-semibold text-xs tracking-wide shadow-sm hover:shadow-blue-500/25 active:scale-95 transition-all whitespace-nowrap"
              aria-label="Register Now"
            >
              <span>Register</span>
              <ArrowRight size={13} strokeWidth={2.2} />
            </Link>

            {/* Mobile Hamburger Trigger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-200 hover:text-white hover:bg-slate-700/80 transition-colors"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Responsive Mobile Dropdown Drawer */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-fadeIn"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Dropdown Card */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
            className="fixed top-16 inset-x-4 max-w-sm mx-auto z-50 bg-[#0B1120]/95 backdrop-blur-xl border border-slate-700/70 rounded-2xl p-4 shadow-2xl lg:hidden flex flex-col gap-1 animate-fadeIn"
          >
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800">
              <span className="text-[11px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
                Supernova Navigation
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center hover:text-white"
                aria-label="Close menu"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isItemActive(item);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item)}
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left text-sm font-sans font-medium transition-colors flex items-center justify-between cursor-pointer ${
                      active
                        ? "text-sky-400 bg-sky-400/10 font-semibold"
                        : "text-slate-200 hover:text-white hover:bg-slate-800/60"
                    }`}
                  >
                    <span>{item.label}</span>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 mt-2 border-t border-slate-800">
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-sans font-semibold text-xs uppercase tracking-wider shadow-sm transition-all"
              >
                <span>Register for Supernova 3.0</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Nav;
