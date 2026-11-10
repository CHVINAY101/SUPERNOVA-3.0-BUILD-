import React from "react";
import { motion } from "framer-motion";

export const HeroIllustration: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <div
      className={`relative w-full max-w-[560px] lg:max-w-[580px] mx-auto select-none ${className}`}
      style={{ filter: "drop-shadow(0 14px 28px rgba(25, 25, 54, 0.08))" }}
    >
      {/* Decorative Floating Shape 1: Soft Lavender Geo Ring (Top Left) */}
      <motion.div
        animate={{ y: [0, -6, 0], rotate: [0, 8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-5 -left-5 w-14 h-14 rounded-full border-[6px] border-[#C8B9F5] z-30 pointer-events-none drop-shadow-sm"
        aria-hidden="true"
      />

      {/* Decorative Floating Shape 2: Fresh Lime 8-Point Star (Top Right) */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute -top-6 -right-4 w-16 h-16 z-30 pointer-events-none drop-shadow-sm"
        aria-hidden="true"
      >
        <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
          <path
            d="M50 0L59 35L95 25L69 50L95 75L59 65L50 100L41 65L5 75L31 50L5 25L41 35Z"
            fill="#D5F542"
            stroke="#191936"
            strokeWidth="3"
          />
        </svg>
      </motion.div>

      {/* Main Workstation Container (Warm Cream / White with Ink Navy Outline) */}
      <div className="relative z-10 bg-[#FFFFFF] border-2 border-[#191936] rounded-[26px] p-5 sm:p-7 shadow-[5px_5px_0px_#191936]">
        {/* Computer Monitor Outer Housing */}
        <div className="bg-[#FAF9F4] border-2 border-[#191936] rounded-[22px] p-4 sm:p-5 shadow-[2.5px_2.5px_0px_#191936]">
          {/* Top Bezel with Playful Accent Dots */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E8E8EF]">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#FF873D] border border-[#191936]" />
              <span className="w-3 h-3 rounded-full bg-[#D5F542] border border-[#191936]" />
              <span className="w-3 h-3 rounded-full bg-[#A9D9F4] border border-[#191936]" />
            </div>
            <span className="font-heading text-xs sm:text-sm font-bold uppercase tracking-wider text-[#191936]">
              SUPERNOVA CREATIVE STATION
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#D5F542] border border-[#191936]" />
          </div>

          {/* Computer Screen: Cheerful Electric Blue & Sky Blue Canvas with Continuous Looping Animation */}
          <div className="relative rounded-2xl overflow-hidden min-h-[220px] sm:min-h-[250px] aspect-[16/10] bg-[#4549D8] border-2 border-[#191936] flex flex-col justify-between p-4 sm:p-5">
            {/* Subtle Grid Lines inside screen */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #FAF9F4 1px, transparent 1px), linear-gradient(to bottom, #FAF9F4 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
              aria-hidden="true"
            />

            {/* Top Screen Bar */}
            <div className="relative z-10 flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-md bg-[#D5F542] text-[#191936] font-heading font-bold text-[11px] tracking-wide uppercase border border-[#191936] shadow-xs">
                CANVAS ACTIVE
              </span>
              <span className="font-mono text-[10px] text-white/90 font-bold bg-white/20 px-2 py-0.5 rounded">
                20–21 NOV 2026
              </span>
            </div>

            {/* Central Animated World: CREATE. CONNECT. CELEBRATE. */}
            <div className="relative z-10 w-full h-full flex items-center justify-center my-1 sm:my-2">
              <svg
                viewBox="0 0 280 140"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full max-h-[160px] sm:max-h-[180px]"
              >
                {/* 1. CONNECT: Dynamic connecting dotted lines between creative hubs */}
                <line
                  x1="50"
                  y1="70"
                  x2="140"
                  y2="50"
                  stroke="#A9D9F4"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                />
                <line
                  x1="140"
                  y1="50"
                  x2="230"
                  y2="70"
                  stroke="#A9D9F4"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                />
                <line
                  x1="50"
                  y1="70"
                  x2="140"
                  y2="105"
                  stroke="#A9D9F4"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                />
                <line
                  x1="140"
                  y1="105"
                  x2="230"
                  y2="70"
                  stroke="#A9D9F4"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                />

                {/* Animated Signal Particle traversing connecting line via transform */}
                <motion.g
                  animate={{
                    x: [0, 90, 180, 90, 0],
                    y: [0, -20, 0, 35, 0],
                  }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <circle
                    cx="50"
                    cy="70"
                    r="4.5"
                    fill="#D5F542"
                    stroke="#191936"
                    strokeWidth="1.5"
                  />
                </motion.g>

                {/* Left Creative Node: CREATE (Pencil + Geometric Triangle) */}
                <motion.g
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <circle cx="50" cy="70" r="22" fill="#FAF9F4" stroke="#191936" strokeWidth="2.5" />
                  {/* Stylized creative pencil / crayon */}
                  <path
                    d="M42 80L58 64L62 68L46 84L40 85L42 80Z"
                    fill="#FF873D"
                    stroke="#191936"
                    strokeWidth="1.5"
                  />
                  <polygon points="40,85 42,80 46,84" fill="#191936" />
                  <circle cx="58" cy="58" r="3" fill="#D5F542" />
                </motion.g>

                {/* Center Creative Hub: CONNECT (Playful Rotating Ring & Spark) */}
                <motion.g
                  animate={{ rotate: 360 }}
                  transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
                  style={{ transformOrigin: "140px 75px" }}
                >
                  <circle
                    cx="140"
                    cy="75"
                    r="26"
                    fill="#C8B9F5"
                    stroke="#191936"
                    strokeWidth="2.5"
                  />
                  {/* Internal rotating geometric cutout */}
                  <rect
                    x="128"
                    y="63"
                    width="24"
                    height="24"
                    rx="4"
                    fill="#FAF9F4"
                    stroke="#191936"
                    strokeWidth="2"
                    transform="rotate(45 140 75)"
                  />
                  <circle cx="140" cy="75" r="4" fill="#4549D8" />
                </motion.g>

                {/* Right Creative Node: CELEBRATE (Fresh Lime Star / Trophy) */}
                <motion.g
                  animate={{ y: [0, 4, 0] }}
                  transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                >
                  <circle cx="230" cy="70" r="22" fill="#FAF9F4" stroke="#191936" strokeWidth="2.5" />
                  {/* Star shape */}
                  <polygon
                    points="230,55 234,65 244,66 236,73 239,83 230,77 221,83 224,73 216,66 226,65"
                    fill="#D5F542"
                    stroke="#191936"
                    strokeWidth="1.5"
                  />
                </motion.g>

                {/* Floating Confetti / Geo Particles */}
                <motion.rect
                  x="90"
                  y="30"
                  width="6"
                  height="6"
                  rx="1"
                  fill="#FF873D"
                  animate={{ y: [0, -6, 0], rotate: [0, 90, 180] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.circle
                  cx="190"
                  cy="35"
                  r="3.5"
                  fill="#D5F542"
                  animate={{ y: [0, 5, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                />
                <motion.polygon
                  points="95,110 101,118 89,118"
                  fill="#A9D9F4"
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                  style={{ transformOrigin: "95px 114px" }}
                />
                <motion.circle
                  cx="185"
                  cy="115"
                  r="3"
                  fill="#C8B9F5"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
                />
              </svg>
            </div>

            {/* Bottom Screen Label */}
            <div className="relative z-10 flex items-center justify-between pt-1 border-t border-white/20 text-[11px] font-heading font-bold text-white">
              <span>CREATE. CONNECT. CELEBRATE.</span>
              <span className="text-[#D5F542]">LIVE PREVIEW</span>
            </div>
          </div>

          {/* Monitor Base Stand */}
          <div className="flex flex-col items-center mt-3">
            <div className="w-16 h-3 bg-[#E8E8EF] border-x-2 border-b-2 border-[#191936]" />
            <div className="w-32 h-2.5 bg-[#FAF9F4] border-2 border-[#191936] rounded-full shadow-xs" />
          </div>
        </div>

        {/* Workstation Desk Accessories: Compact Playful Keyboard & Floppy Cartridge */}
        <div className="grid grid-cols-12 gap-3 mt-3 items-center">
          {/* Creative Compact Keyboard (8 columns) */}
          <div className="col-span-8 bg-[#FAF9F4] border-2 border-[#191936] rounded-xl p-2 shadow-[2px_2px_0px_#191936]">
            {/* Key Rows */}
            <div className="grid grid-cols-8 gap-1 mb-1">
              {["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FF873D", "#FFFFFF", "#FFFFFF", "#D5F542", "#FFFFFF"].map(
                (bg, idx) => (
                  <span
                    key={idx}
                    className="h-3 rounded-[3px] border border-[#191936] block"
                    style={{ backgroundColor: bg }}
                  />
                )
              )}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {["#C8B9F5", "#FFFFFF", "#4549D8", "#FFFFFF", "#FFFFFF", "#FF873D", "#A9D9F4"].map(
                (bg, idx) => (
                  <span
                    key={idx}
                    className="h-3 rounded-[3px] border border-[#191936] block"
                    style={{ backgroundColor: bg }}
                  />
                )
              )}
            </div>
          </div>

          {/* Creative Floppy Cartridge (4 columns) in Warm Orange */}
          <div className="col-span-4 bg-[#FF873D] border-2 border-[#191936] rounded-xl p-2 shadow-[2px_2px_0px_#191936] text-center flex flex-col justify-between h-full">
            <div className="bg-[#FFFFFF] border border-[#191936] rounded px-1 py-0.5 flex items-center justify-between">
              <span className="w-2 h-1.5 bg-[#191936] rounded-xs" />
              <span className="font-mono text-[8px] font-bold text-[#191936]">HD 1.44</span>
            </div>
            <span className="font-heading font-bold text-[9px] text-[#191936] uppercase tracking-wider truncate block mt-1">
              SUPERNOVA.3
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
