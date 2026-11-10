import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { getPrimaryButtonLabel, getPrimaryButtonHref } from "@/config/festival";

export function StickyRegisterBar() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Hidden on /register
  const isRegisterPage = location.pathname.startsWith("/register");

  useEffect(() => {
    const handleScroll = () => {
      // Appears after scrolling past hero (approx 500-600px)
      const pastHero = window.scrollY > 480;
      setVisible(pastHero);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Hidden when any form input is focused on mobile
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        setIsInputFocused(true);
      }
    };

    const handleFocusOut = () => {
      setIsInputFocused(false);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  if (isRegisterPage || !visible || isInputFocused) {
    return null;
  }

  const primaryLabel = getPrimaryButtonLabel();
  const primaryHref = getPrimaryButtonHref();

  return (
    <aside
      className="mobile-sticky-register-bar"
      aria-label="Quick Registration Action"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 890,
        background: "rgba(255, 255, 255, 0.94)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(46, 42, 138, 0.12)",
        padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
        boxShadow: "0 -4px 20px rgba(11, 11, 30, 0.08)",
        display: "block",
      }}
    >
      <Link
        to={primaryHref}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
          boxShadow: "0 4px 16px rgba(244, 123, 32, 0.35)",
        }}
      >
        {primaryLabel}
      </Link>
    </aside>
  );
}
