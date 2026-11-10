import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

/**
 * Mobile Sticky Register Bar
 * 56px tall plus safe-area inset, shown only after hero scrolls out,
 * hidden on /register and while any input/textarea is focused.
 */
export const MobileStickyBar: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const location = useLocation();

  const isRegisterPage = location.pathname.startsWith("/register");

  useEffect(() => {
    // Show after hero scrolls out (approx 500px)
    const handleScroll = () => {
      if (window.scrollY > 480) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    // Track input focus across page
    const handleFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        setInputFocused(true);
      }
    };

    const handleFocusOut = () => {
      setInputFocused(false);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  if (isRegisterPage || !visible || inputFocused) {
    return null;
  }

  return (
    <aside
      aria-label="Quick Registration Action"
      className="fixed bottom-0 left-0 right-0 z-40 block lg:hidden select-none"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid #EAEAF2",
        padding: "8px 16px calc(8px + env(safe-area-inset-bottom, 0px)) 16px",
        boxShadow: "0 -4px 16px rgba(21, 21, 53, 0.08)",
      }}
    >
      <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
        <div className="flex flex-col">
          <span className="font-heading text-xs font-bold text-[#151535] leading-tight">
            SUPERNOVA 3.0
          </span>
          <span className="text-[11px] text-[#52527A] font-medium">
            20–21 Nov 2026 · Registrations Open
          </span>
        </div>

        <Link
          to="/register"
          className="btn-primary"
          style={{
            height: 44,
            padding: "0 20px",
            fontSize: 14,
            width: "auto",
            minWidth: 130,
          }}
        >
          Register Now
        </Link>
      </div>
    </aside>
  );
};
