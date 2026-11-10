import { useState, useEffect } from "react";

/**
 * Retro Technology Stack (CRT computer, radio, floppy disk, cassette tape)
 * STEP 5 Light Interactions:
 * - Click the CRT to boot it: screen flickers on and types "SUPERNOVA 3.0 / CREATE. CONNECT. CELEBRATE." with blinking cursor.
 * - Hover radio: spins the dial and animates EQ bars.
 * - Hover cassette: spins its reels.
 * - Hover floppy: lifts and tilts.
 */
export const RetroStackArt = ({ className = "" }: { className?: string }) => {
  // CRT Boot & Typing State
  const [crtBooted, setCrtBooted] = useState(false);
  const [crtText, setCrtText] = useState("");
  const fullText = "SUPERNOVA 3.0\nCREATE. CONNECT. CELEBRATE.";

  useEffect(() => {
    if (!crtBooted) {
      setCrtText("");
      return;
    }
    let idx = 0;
    const interval = setInterval(() => {
      idx++;
      setCrtText(fullText.slice(0, idx));
      if (idx >= fullText.length) {
        clearInterval(interval);
      }
    }, 45);
    return () => clearInterval(interval);
  }, [crtBooted]);

  const handleCrtClick = () => {
    setCrtBooted((prev) => !prev);
  };

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ maxWidth: 300, width: "100%" }}
    >
      <svg
        viewBox="0 0 280 430"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-sm"
        aria-label="Retro Technology Stack"
      >
        <defs>
          <filter id="hardShadow" x="0" y="0" width="120%" height="120%" filterUnits="userSpaceOnUse">
            <feOffset dx="4" dy="4" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.082   0 0 0 0 0.082   0 0 0 0 0.208  0 0 0 1 0" />
            <feBlend in="SourceGraphic" in2="hardOffset" mode="normal" />
          </filter>
        </defs>

        {/* 1. CRT Computer (Top) - Click to boot */}
        <g
          id="crt-computer"
          onClick={handleCrtClick}
          style={{ cursor: "pointer" }}
          className="group"
        >
          {/* Base Stand */}
          <polygon points="90,170 160,170 175,190 75,190" fill="#EAEAF2" stroke="#151535" strokeWidth="3" />

          {/* Hard Shadow */}
          <rect x="34" y="24" width="190" height="150" rx="16" fill="#151535" />

          {/* Computer Body */}
          <rect
            x="30"
            y="20"
            width="190"
            height="150"
            rx="16"
            fill="#F8F7FC"
            stroke="#151535"
            strokeWidth="3"
            className="transition-colors group-hover:fill-white"
          />

          {/* Screen Bezel */}
          <rect x="46" y="34" width="128" height="98" rx="10" fill="#151535" stroke="#151535" strokeWidth="2" />

          {/* Screen Display */}
          <rect
            x="52"
            y="40"
            width="116"
            height="86"
            rx="6"
            fill={crtBooted ? "#0B0B1E" : "#1719C9"}
            style={{
              transition: "fill 0.3s ease",
            }}
          />

          {/* CRT Screen Content: Booted typing vs Idle lines */}
          {crtBooted ? (
            <g>
              {/* Scanline CRT Flicker */}
              <rect x="52" y="40" width="116" height="86" fill="rgba(200, 245, 0, 0.06)" />
              <text
                x="58"
                y="62"
                fill="#C8F500"
                fontFamily="monospace"
                fontSize="8.5"
                fontWeight="bold"
              >
                {crtText.split("\n")[0]}
              </text>
              <text
                x="58"
                y="80"
                fill="#FFFFFF"
                fontFamily="monospace"
                fontSize="7.5"
                fontWeight="bold"
              >
                {crtText.split("\n")[1] || ""}
              </text>
              {/* Blinking Prompt Cursor */}
              <rect
                x={crtText.length > 13 ? 58 + ((crtText.length - 14) * 5) : 58 + (crtText.length * 5)}
                y={crtText.length > 13 ? 73 : 53}
                width="5"
                height="8"
                fill="#C8F500"
                className="animate-pulse"
              />
            </g>
          ) : (
            <g>
              {/* Idle screen display */}
              <line x1="62" y1="56" x2="110" y2="56" stroke="#C8F500" strokeWidth="3" strokeLinecap="round" />
              <line x1="62" y1="68" x2="148" y2="68" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="62" y1="80" x2="132" y2="80" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="62" y1="92" x2="100" y2="92" stroke="#FF6B00" strokeWidth="2.5" strokeLinecap="round" />
              <rect x="106" y="88" width="6" height="8" fill="#C8F500" />
              <text x="60" y="114" fill="#CFC8F5" fontFamily="monospace" fontSize="7">
                [Click to boot]
              </text>
            </g>
          )}

          {/* Power button & vents */}
          <circle
            cx="195"
            cy="50"
            r="7"
            fill={crtBooted ? "#C8F500" : "#FF6B00"}
            stroke="#151535"
            strokeWidth="2.5"
          />
          <circle cx="195" cy="74" r="5" fill="#FFD600" stroke="#151535" strokeWidth="2" />
          <line x1="186" y1="100" x2="204" y2="100" stroke="#151535" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="186" y1="108" x2="204" y2="108" stroke="#151535" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="186" y1="116" x2="204" y2="116" stroke="#151535" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* 2. Vintage Radio (Middle Right) - Hover spins dial & animates EQ bars */}
        <g id="vintage-radio" transform="translate(90, 168)" className="group" style={{ cursor: "pointer" }}>
          <rect x="4" y="4" width="165" height="110" rx="14" fill="#151535" />
          <rect x="0" y="0" width="165" height="110" rx="14" fill="#FF6B00" stroke="#151535" strokeWidth="3" />
          {/* Antenna */}
          <line x1="20" y1="0" x2="5" y2="-45" stroke="#151535" strokeWidth="3" strokeLinecap="round" />
          <circle cx="5" cy="-45" r="4" fill="#FFD600" stroke="#151535" strokeWidth="2" />

          {/* Speaker Grill */}
          <circle cx="55" cy="55" r="36" fill="#F8F7FC" stroke="#151535" strokeWidth="3" />
          <circle cx="55" cy="55" r="24" fill="#151535" />
          <circle cx="55" cy="55" r="10" fill="#FFD600" />

          {/* Tuning Dial */}
          <rect x="105" y="24" width="45" height="30" rx="4" fill="#151535" stroke="#151535" strokeWidth="2" />
          {/* Animated EQ Bars inside dial */}
          <rect x="110" y="40" width="3" height="10" fill="#C8F500" className="radio-eq-1" />
          <rect x="116" y="34" width="3" height="16" fill="#E6007A" className="radio-eq-2" />
          <rect x="122" y="30" width="3" height="20" fill="#FFD600" className="radio-eq-3" />
          <rect x="128" y="36" width="3" height="14" fill="#C8F500" className="radio-eq-4" />
          <rect x="134" y="32" width="3" height="18" fill="#1719C9" className="radio-eq-2" />
          <rect x="140" y="38" width="3" height="12" fill="#E6007A" className="radio-eq-1" />

          {/* Knobs */}
          <circle cx="116" cy="78" r="10" fill="#FFFFFF" stroke="#151535" strokeWidth="2.5" />
          <circle cx="140" cy="78" r="10" fill="#FFFFFF" stroke="#151535" strokeWidth="2.5" />
        </g>

        {/* 3. 3.5" Floppy Disk (Middle Left) - Lifts and tilts on hover */}
        <g id="floppy-disk" transform="translate(10, 215)" className="floppy-hover-group" style={{ cursor: "pointer" }}>
          <rect x="4" y="4" width="115" height="115" rx="6" fill="#151535" />
          <rect x="0" y="0" width="115" height="115" rx="6" fill="#E6007A" stroke="#151535" strokeWidth="3" />
          {/* Top Notch Cutout */}
          <polygon points="100,0 115,15 115,0" fill="#FFFFFF" />
          {/* Metal Shutter */}
          <rect x="22" y="0" width="65" height="42" fill="#EAEAF2" stroke="#151535" strokeWidth="2.5" />
          <rect x="42" y="10" width="18" height="24" rx="2" fill="#151535" />
          {/* Paper Label */}
          <rect x="14" y="52" width="87" height="52" rx="3" fill="#C8F500" stroke="#151535" strokeWidth="2" />
          <line x1="22" y1="66" x2="90" y2="66" stroke="#151535" strokeWidth="2" strokeLinecap="round" />
          <line x1="22" y1="78" x2="80" y2="78" stroke="#151535" strokeWidth="2" strokeLinecap="round" />
          <line x1="22" y1="90" x2="68" y2="90" stroke="#151535" strokeWidth="2" strokeLinecap="round" />
          <rect x="8" y="98" width="8" height="8" fill="#151535" />
        </g>

        {/* 4. Audio Cassette Tape (Bottom) - Hover spins reels */}
        <g id="cassette-tape" transform="translate(45, 310)" className="cassette-hover-group" style={{ cursor: "pointer" }}>
          <rect x="4" y="4" width="180" height="105" rx="10" fill="#151535" />
          <rect x="0" y="0" width="180" height="105" rx="10" fill="#8438FF" stroke="#151535" strokeWidth="3" />
          <rect x="18" y="15" width="144" height="75" rx="6" fill="#FFD600" stroke="#151535" strokeWidth="2.5" />
          <rect x="42" y="32" width="96" height="40" rx="6" fill="#151535" />

          {/* Left Reel */}
          <g transform="translate(62, 52)" className="cassette-reel">
            <circle cx="0" cy="0" r="12" fill="#FFFFFF" stroke="#151535" strokeWidth="2" />
            <circle cx="0" cy="0" r="5" fill="#151535" />
            <line x1="-10" y1="0" x2="10" y2="0" stroke="#151535" strokeWidth="1.5" />
            <line x1="0" y1="-10" x2="0" y2="10" stroke="#151535" strokeWidth="1.5" />
          </g>

          {/* Right Reel */}
          <g transform="translate(118, 52)" className="cassette-reel">
            <circle cx="0" cy="0" r="12" fill="#FFFFFF" stroke="#151535" strokeWidth="2" />
            <circle cx="0" cy="0" r="5" fill="#151535" />
            <line x1="-10" y1="0" x2="10" y2="0" stroke="#151535" strokeWidth="1.5" />
            <line x1="0" y1="-10" x2="0" y2="10" stroke="#151535" strokeWidth="1.5" />
          </g>

          <line x1="28" y1="24" x2="152" y2="24" stroke="#151535" strokeWidth="2" strokeLinecap="round" />
          <line x1="38" y1="82" x2="142" y2="82" stroke="#151535" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </svg>

      <style>{`
        /* Floppy disk lifts and tilts on hover */
        .floppy-hover-group {
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: center;
        }
        .floppy-hover-group:hover {
          transform: translate(10px, 202px) rotate(-8deg) scale(1.05);
        }

        /* Cassette reels spin on hover */
        .cassette-hover-group:hover .cassette-reel {
          animation: spinReels 1s linear infinite;
          transform-origin: center;
        }

        @keyframes spinReels {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Radio EQ bars animation on hover */
        #vintage-radio:hover .radio-eq-1 {
          animation: eqDance 0.4s ease-in-out infinite alternate;
        }
        #vintage-radio:hover .radio-eq-2 {
          animation: eqDance 0.3s ease-in-out infinite alternate 0.1s;
        }
        #vintage-radio:hover .radio-eq-3 {
          animation: eqDance 0.5s ease-in-out infinite alternate 0.2s;
        }
        #vintage-radio:hover .radio-eq-4 {
          animation: eqDance 0.35s ease-in-out infinite alternate 0.15s;
        }

        @keyframes eqDance {
          0% { height: 6px; y: 44px; }
          100% { height: 22px; y: 28px; }
        }
      `}</style>
    </div>
  );
};
