import { useState, useEffect } from "react";
import { CONFIG } from "@/config";

export const Preloader: React.FC = () => {
  const [active, setActive] = useState(false);
  const [ribbonDrawn, setRibbonDrawn] = useState(false);
  const [logoVisible, setLogoVisible] = useState(false);

  useEffect(() => {
    // Only run on the first visit per session
    const seen = sessionStorage.getItem("supernova_preloader_seen");
    if (seen) return;

    setActive(true);

    const ribbonTimer = setTimeout(() => {
      setRibbonDrawn(true);
    }, 100);

    const logoTimer = setTimeout(() => {
      setLogoVisible(true);
    }, 450);

    const dismissTimer = setTimeout(() => {
      handleDismiss();
    }, 1200);

    // Hard fallback: never block beyond 1.5s
    const hardLimitTimer = setTimeout(() => {
      handleDismiss();
    }, 1500);

    return () => {
      clearTimeout(ribbonTimer);
      clearTimeout(logoTimer);
      clearTimeout(dismissTimer);
      clearTimeout(hardLimitTimer);
    };
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem("supernova_preloader_seen", "true");
    setActive(false);
  };

  if (!active) return null;

  return (
    <div
      onClick={handleDismiss}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white cursor-pointer select-none"
      style={{
        backgroundColor: "#FFFFFF",
        transition: "opacity 0.4s ease",
      }}
      aria-label="Loading Supernova 3.0 (click to skip)"
    >
      <div className="relative flex flex-col items-center max-w-sm px-6 text-center">
        {/* Logo fade up */}
        <div
          style={{
            transform: logoVisible ? "translateY(0)" : "translateY(16px)",
            opacity: logoVisible ? 1 : 0,
            transition: "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease",
          }}
        >
          <img
            src={CONFIG.LOGO_PATH}
            alt={CONFIG.EVENT_NAME}
            style={{ height: 48, width: "auto" }}
            className="object-contain mb-6"
          />
        </div>

        {/* Drawing Ribbon SVG */}
        <svg width="260" height="24" viewBox="0 0 260 24" fill="none">
          <defs>
            <linearGradient id="preloadRibbon" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#E6007A" />
              <stop offset="35%" stopColor="#FF6B00" />
              <stop offset="70%" stopColor="#C8F500" />
              <stop offset="100%" stopColor="#1719C9" />
            </linearGradient>
          </defs>
          <path
            d="M 10,12 Q 70,2 130,12 T 250,12"
            fill="none"
            stroke="url(#preloadRibbon)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="260"
            strokeDashoffset={ribbonDrawn ? 0 : 260}
            style={{
              transition: "stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </svg>

        <span className="text-[11px] font-bold text-[#52527A] tracking-widest uppercase mt-4">
          Click anywhere to skip
        </span>
      </div>
    </div>
  );
};
