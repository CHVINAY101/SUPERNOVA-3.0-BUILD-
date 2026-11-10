import { useState, useEffect, type FC } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ArrowRight, Menu, X, Mail } from "lucide-react";
import { SITE_CONTENT } from "@/content/site";

interface NavLinkItem {
  id: string;
  label: string;
  href?: string;
}

const NAV_ITEMS: NavLinkItem[] = [
  { id: "home", label: "Home", href: "/" },
  { id: "about", label: "About", href: "/about" },
  { id: "experiences", label: "Events", href: "/events" },
  { id: "schedule", label: "Schedule", href: "/schedule" },
  { id: "gallery", label: "Gallery", href: "/gallery" },
  { id: "organisers", label: "Institutions", href: "/#organisers" },
  { id: "contact", label: "Contact", href: "/contact" },
];

export const Nav: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  // On homepage, nav is hidden initially and reveals only when scrolling beyond hero.
  // On all other routes, nav is visible immediately.
  const [showNav, setShowNav] = useState(!isHomePage);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");

  // Keep showNav updated when changing routes
  useEffect(() => {
    if (!isHomePage) {
      setShowNav(true);
    } else {
      setShowNav(window.scrollY > 380);
    }
  }, [isHomePage, location.pathname]);

  // Scroll detection & IntersectionObserver for scroll-triggered navigation on homepage
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
          // Reveal nav once scrolled past ~380px
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

    const heroEl = document.getElementById("home");
    let observer: IntersectionObserver | null = null;
    if (heroEl) {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry.isIntersecting || entry.intersectionRatio < 0.25) {
            if (window.scrollY > 300) setShowNav(true);
          } else if (entry.intersectionRatio > 0.6 && window.scrollY < 200) {
            setShowNav(false);
          }
        },
        { threshold: [0, 0.25, 0.6, 1.0] }
      );
      observer.observe(heroEl);
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (observer) observer.disconnect();
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
      { rootMargin: "-30% 0px -40% 0px" }
    );

    NAV_ITEMS.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isHomePage]);

  // Lock body scroll when mobile menu is open
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

    if (isHomePage) {
      const el = document.getElementById(item.id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }

    if (item.href) {
      navigate(item.href);
    }
  };

  return (
    <>
      {/* Modern Minimal Floating Capsule Navigation */}
      <header
        role="banner"
        className={`fixed top-3 sm:top-4 inset-x-0 mx-auto w-[calc(100%-24px)] max-w-5xl z-50 transition-all duration-300 ease-out ${
          showNav
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "-translate-y-16 opacity-0 pointer-events-none"
        }`}
      >
        <div className="bg-[#191936]/88 backdrop-blur-xl border border-white/15 rounded-full px-4 sm:px-6 py-2 shadow-[0_12px_36px_rgba(15,15,35,0.28)] flex items-center justify-between gap-3 sm:gap-4 transition-all">
          {/* Brand Logo */}
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
              src="/assets/aistudio/Futuristic_Supernova_3.0_Logo_png_c0ddbd5c.png"
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
            className="hidden md:flex items-center gap-1 lg:gap-1.5"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = isHomePage
                ? activeSection === item.id
                : location.pathname === item.href;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-heading font-medium tracking-wide uppercase transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "text-[#D5F542] bg-white/15 shadow-sm font-semibold"
                      : "text-white/75 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Action CTA & Mobile Trigger */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-1.5 h-9 px-4 sm:px-5 rounded-full bg-[#D5F542] text-[#191936] font-heading font-bold text-xs uppercase tracking-wider hover:bg-[#E2FF4A] shadow-[0_2px_10px_rgba(213,245,66,0.3)] hover:scale-[1.03] active:scale-[0.98] transition-all whitespace-nowrap"
              aria-label="Register Now"
            >
              <span>Register Now</span>
              <ArrowRight size={13} strokeWidth={2.5} />
            </Link>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/15 text-white hover:bg-white/20 transition-colors"
              aria-label="Open Navigation Menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Modern Responsive Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
          className="fixed inset-0 z-[100] flex flex-col justify-between p-6 sm:p-8 bg-[#191936]/96 backdrop-blur-2xl text-white overflow-y-auto animate-fadeIn"
        >
          {/* Top Bar with Brand & Close Button */}
          <div className="flex items-center justify-between pb-5 border-b border-white/10">
            <img
              src="/assets/aistudio/Futuristic_Supernova_3.0_Logo_png_c0ddbd5c.png"
              alt="SUPERNOVA 3.0"
              className="h-8 w-auto object-contain"
            />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="w-10 h-10 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              aria-label="Close Navigation Menu"
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation Links with Refined Typography */}
          <div className="flex flex-col gap-2 my-auto py-6">
            {NAV_ITEMS.map((item) => {
              const isActive = isHomePage
                ? activeSection === item.id
                : location.pathname === item.href;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item)}
                  className={`text-left font-heading text-xl sm:text-2xl font-semibold tracking-wide uppercase py-3 px-2 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                    isActive
                      ? "text-[#D5F542] bg-white/10 font-bold"
                      : "text-white/80 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <span>{item.label}</span>
                  <ArrowRight size={18} className="opacity-50" />
                </button>
              );
            })}
          </div>

          {/* Bottom Actions */}
          <div className="flex flex-col gap-4 pt-6 border-t border-white/10">
            <Link
              to="/register"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex items-center justify-center gap-2 h-12 rounded-full bg-[#D5F542] text-[#191936] font-heading font-extrabold text-sm uppercase tracking-wider hover:bg-[#E2FF4A] shadow-lg transition-all"
            >
              <span>REGISTER NOW</span>
              <ArrowRight size={16} />
            </Link>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/60 pt-2 font-body">
              <span>The National College, Basavanagudi</span>
              <a
                href={`mailto:${SITE_CONTENT.meta.helpdeskEmail}`}
                className="inline-flex items-center gap-1.5 text-white/70 hover:text-[#D5F542] transition-colors"
              >
                <Mail size={13} />
                <span>{SITE_CONTENT.meta.helpdeskEmail}</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Nav;
