import React, { useEffect, useState } from "react";

export const RibbonWave: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Gentle wave shift with scroll
  const offset = Math.sin(scrollY * 0.005) * 12;

  return (
    <div
      className={`relative w-full overflow-hidden pointer-events-none select-none ${className}`}
      style={{ height: "120px" }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 120"
        fill="none"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full block"
      >
        <defs>
          <linearGradient id="ribbonBand" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EF28D0" />
            <stop offset="35%" stopColor="#FF7025" />
            <stop offset="70%" stopColor="#C8F500" />
            <stop offset="100%" stopColor="#1719C9" />
          </linearGradient>
        </defs>

        {/* Thick SVG ribbon with smooth curve */}
        <path
          d={`M0 80 C 320 ${60 + offset}, 640 ${100 - offset}, 960 ${70 + offset}, 1440 ${85} L 1440 120 L 0 120 Z`}
          fill="url(#ribbonBand)"
          opacity="0.9"
        />

        {/* Light highlight stroke on top of the ribbon */}
        <path
          d={`M0 80 C 320 ${60 + offset}, 640 ${100 - offset}, 960 ${70 + offset}, 1440 ${85}`}
          stroke="#FFFFFF"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>
    </div>
  );
};
