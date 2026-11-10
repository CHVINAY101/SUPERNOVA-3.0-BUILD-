import React, { useState } from "react";
import { motion } from "framer-motion";

export const RetroStack: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [booted, setBooted] = useState(false);
  const [radioHover, setRadioHover] = useState(false);
  const [cassetteHover, setCassetteHover] = useState(false);
  const [floppyHover, setFloppyHover] = useState(false);

  return (
    <div
      className={`relative flex flex-col items-center justify-center max-w-[260px] w-full select-none ${className}`}
      style={{ filter: "drop-shadow(0 12px 24px rgba(21, 21, 53, 0.08))" }}
    >
      {/* 1. CRT Computer (Click to boot with typed text & blinking cursor) */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        onClick={() => setBooted((prev) => !prev)}
        className="w-full cursor-pointer relative z-20 group"
        title="Click to boot CRT monitor"
      >
        <svg viewBox="0 0 240 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
          {/* Bezel */}
          <rect x="10" y="10" width="220" height="135" rx="16" fill="#F0EFEA" stroke="#151535" strokeWidth="3" />
          <rect x="25" y="22" width="190" height="110" rx="10" fill="#151535" />

          {/* Screen Display */}
          {booted ? (
            <g>
              <rect x="28" y="25" width="184" height="104" rx="8" fill="#0A0A1F" />
              {/* Scanlines */}
              <line x1="28" y1="45" x2="212" y2="45" stroke="rgba(200, 245, 0, 0.15)" strokeWidth="1" />
              <line x1="28" y1="65" x2="212" y2="65" stroke="rgba(200, 245, 0, 0.15)" strokeWidth="1" />
              <line x1="28" y1="85" x2="212" y2="85" stroke="rgba(200, 245, 0, 0.15)" strokeWidth="1" />
              <line x1="28" y1="105" x2="212" y2="105" stroke="rgba(200, 245, 0, 0.15)" strokeWidth="1" />

              {/* Typed text */}
              <text x="36" y="52" fill="#C8F500" fontFamily="monospace" fontSize="10" fontWeight="bold">
                SUPERNOVA 3.0
              </text>
              <text x="36" y="72" fill="#C8F500" fontFamily="monospace" fontSize="9">
                CREATE. CONNECT.
              </text>
              <text x="36" y="90" fill="#C8F500" fontFamily="monospace" fontSize="9">
                CELEBRATE.
              </text>
              {/* Blinking cursor */}
              <rect x="108" y="81" width="6" height="10" fill="#C8F500" className="animate-pulse" />
            </g>
          ) : (
            <g>
              {/* Off Screen with soft glare */}
              <rect x="28" y="25" width="184" height="104" rx="8" fill="#1C1C3D" />
              <path d="M40 30L170 30L120 120L30 120Z" fill="white" opacity="0.04" />
              <text x="75" y="82" fill="#52527A" fontFamily="monospace" fontSize="10">
                CLICK TO BOOT
              </text>
            </g>
          )}

          {/* Power button & badge */}
          <circle cx="200" cy="138" r="4" fill={booted ? "#C8F500" : "#52527A"} stroke="#151535" strokeWidth="1.5" />
          <rect x="30" y="137" width="24" height="4" rx="2" fill="#151535" />
        </svg>
      </motion.div>

      {/* 2. Cassette & Floppy Row */}
      <div className="flex items-center justify-between w-full -mt-2 px-1 relative z-10">
        {/* Cassette (reels spin on hover) */}
        <motion.div
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          onMouseEnter={() => setCassetteHover(true)}
          onMouseLeave={() => setCassetteHover(false)}
          className="w-[124px] cursor-pointer"
          title="Hover to spin tape reels"
        >
          <svg viewBox="0 0 130 84" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
            <rect x="4" y="4" width="122" height="76" rx="8" fill="#FF7025" stroke="#151535" strokeWidth="2.5" />
            <rect x="18" y="16" width="94" height="50" rx="4" fill="#FFFFFF" stroke="#151535" strokeWidth="2" />

            {/* Left Reel */}
            <circle cx="44" cy="42" r="14" fill="#151535" />
            <circle cx="44" cy="42" r="6" fill="#FFFFFF" />
            <g className={cassetteHover ? "animate-spin origin-[44px_42px]" : ""}>
              <line x1="44" y1="30" x2="44" y2="54" stroke="#C8F500" strokeWidth="2" />
              <line x1="32" y1="42" x2="56" y2="42" stroke="#C8F500" strokeWidth="2" />
            </g>

            {/* Right Reel */}
            <circle cx="86" cy="42" r="14" fill="#151535" />
            <circle cx="86" cy="42" r="6" fill="#FFFFFF" />
            <g className={cassetteHover ? "animate-spin origin-[86px_42px]" : ""}>
              <line x1="86" y1="30" x2="86" y2="54" stroke="#C8F500" strokeWidth="2" />
              <line x1="74" y1="42" x2="98" y2="42" stroke="#C8F500" strokeWidth="2" />
            </g>

            <rect x="52" y="34" width="26" height="16" rx="2" fill="#151535" />
          </svg>
        </motion.div>

        {/* Floppy Disk (lifts and tilts on hover) */}
        <motion.div
          animate={floppyHover ? { y: -10, rotate: -6 } : { y: [0, -4, 0], rotate: 0 }}
          transition={{ duration: floppyHover ? 0.2 : 4.8, repeat: floppyHover ? 0 : Infinity, ease: "easeInOut" }}
          onMouseEnter={() => setFloppyHover(true)}
          onMouseLeave={() => setFloppyHover(false)}
          className="w-[110px] cursor-pointer"
          title="Hover to lift and tilt floppy"
        >
          <svg viewBox="0 0 110 110" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
            <path
              d="M10 10H86L102 26V100H10V10Z"
              fill="#EF28D0"
              stroke="#151535"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Shutter */}
            <rect x="32" y="12" width="46" height="34" rx="3" fill="#EAEAF2" stroke="#151535" strokeWidth="2" />
            <rect x="42" y="18" width="10" height="22" rx="2" fill="#151535" />
            {/* Label */}
            <rect x="22" y="58" width="66" height="36" rx="3" fill="#FFFFFF" stroke="#151535" strokeWidth="1.5" />
            <line x1="30" y1="68" x2="80" y2="68" stroke="#151535" strokeWidth="1.5" />
            <line x1="30" y1="76" x2="74" y2="76" stroke="#151535" strokeWidth="1.5" />
            <line x1="30" y1="84" x2="65" y2="84" stroke="#151535" strokeWidth="1.5" />
          </svg>
        </motion.div>
      </div>

      {/* 3. Vintage Radio (Dial spins on hover with EQ bars) */}
      <motion.div
        animate={{ y: [0, 5, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        onMouseEnter={() => setRadioHover(true)}
        onMouseLeave={() => setRadioHover(false)}
        className="w-full -mt-2 cursor-pointer relative z-0"
        title="Hover to spin radio dial and animate EQ"
      >
        <svg viewBox="0 0 240 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
          {/* Radio Chassis */}
          <rect x="10" y="8" width="220" height="74" rx="12" fill="#1719C9" stroke="#151535" strokeWidth="2.5" />
          {/* Speaker Grille */}
          <rect x="24" y="20" width="86" height="50" rx="8" fill="#151535" />
          {/* Equalizer Bars */}
          <rect x="34" y={radioHover ? 30 : 44} width="6" height={radioHover ? 32 : 18} rx="2" fill="#C8F500" className="transition-all duration-150" />
          <rect x="46" y={radioHover ? 24 : 36} width="6" height={radioHover ? 38 : 26} rx="2" fill="#FF7025" className="transition-all duration-150" />
          <rect x="58" y={radioHover ? 28 : 48} width="6" height={radioHover ? 34 : 14} rx="2" fill="#EF28D0" className="transition-all duration-150" />
          <rect x="70" y={radioHover ? 22 : 32} width="6" height={radioHover ? 40 : 30} rx="2" fill="#FFD52E" className="transition-all duration-150" />
          <rect x="82" y={radioHover ? 36 : 50} width="6" height={radioHover ? 26 : 12} rx="2" fill="#C8F500" className="transition-all duration-150" />

          {/* Tuner Display */}
          <rect x="120" y="20" width="96" height="24" rx="4" fill="#FFFFFF" stroke="#151535" strokeWidth="2" />
          <line x1="124" y1="32" x2="212" y2="32" stroke="#EAEAF2" strokeWidth="2" />
          {/* Tuner needle */}
          <line
            x1={radioHover ? 180 : 145}
            y1="22"
            x2={radioHover ? 180 : 145}
            y2="42"
            stroke="#EF28D0"
            strokeWidth="3"
            className="transition-all duration-300"
          />

          {/* Knobs */}
          <g className={radioHover ? "animate-spin origin-[145px_60px]" : ""}>
            <circle cx="145" cy="60" r="10" fill="#EAEAF2" stroke="#151535" strokeWidth="2" />
            <line x1="145" y1="52" x2="145" y2="60" stroke="#151535" strokeWidth="2" />
          </g>

          <g className={radioHover ? "animate-spin origin-[185px_60px]" : ""}>
            <circle cx="185" cy="60" r="10" fill="#EAEAF2" stroke="#151535" strokeWidth="2" />
            <line x1="185" y1="52" x2="185" y2="60" stroke="#151535" strokeWidth="2" />
          </g>
        </svg>
      </motion.div>
    </div>
  );
};
