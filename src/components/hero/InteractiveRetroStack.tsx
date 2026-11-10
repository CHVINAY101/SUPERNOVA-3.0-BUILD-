import { useState, useEffect } from "react";

export const InteractiveRetroStack: React.FC<{ className?: string }> = ({ className = "" }) => {
  // CRT state: booted, typing progress
  const [crtBooted, setCrtBooted] = useState(false);
  const [typedText, setTypedText] = useState("");
  const fullText = "SUPERNOVA 3.0 / CREATE. CONNECT. CELEBRATE.";

  // Radio hover state: dial spin, EQ bars
  const [radioHovered, setRadioHovered] = useState(false);

  // Cassette hover state: spinning reels
  const [cassetteHovered, setCassetteHovered] = useState(false);

  // Floppy hover state: lift & tilt
  const [floppyHovered, setFloppyHovered] = useState(false);

  // Typewriter effect when CRT is clicked
  useEffect(() => {
    if (!crtBooted) {
      setTypedText("");
      return;
    }

    let currentIdx = 0;
    const interval = setInterval(() => {
      currentIdx++;
      setTypedText(fullText.slice(0, currentIdx));
      if (currentIdx >= fullText.length) {
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
      className={`relative flex flex-col items-center select-none ${className}`}
      style={{ maxWidth: 360, width: "100%" }}
    >
      <svg
        viewBox="0 0 340 460"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-md overflow-visible"
        aria-label="Interactive Retro Technology Stack"
      >
        {/* 1. CRT Computer (Top) */}
        <g
          id="interactive-crt"
          onClick={handleCrtClick}
          className="cursor-pointer"
          style={{
            animation: "crtFloat 7s ease-in-out infinite alternate",
            transformOrigin: "center",
          }}
        >
          {/* Shadow */}
          <rect x="24" y="24" width="230" height="175" rx="18" fill="#151535" />
          {/* Body */}
          <rect x="20" y="20" width="230" height="175" rx="18" fill="#F8F7FC" stroke="#151535" strokeWidth="3" />
          {/* Screen Bezel */}
          <rect x="40" y="38" width="155" height="115" rx="12" fill="#151535" stroke="#151535" strokeWidth="2.5" />

          {/* Screen Surface */}
          <rect
            x="46"
            y="44"
            width="143"
            height="103"
            rx="8"
            fill={crtBooted ? "#0B0B24" : "#1719C9"}
            style={{
              transition: "fill 0.3s ease",
            }}
          />

          {/* CRT Boot Content */}
          {crtBooted ? (
            <g>
              {/* Scanlines effect */}
              <line x1="48" y1="58" x2="187" y2="58" stroke="#252554" strokeWidth="1" />
              <line x1="48" y1="72" x2="187" y2="72" stroke="#252554" strokeWidth="1" />
              <line x1="48" y1="86" x2="187" y2="86" stroke="#252554" strokeWidth="1" />
              <line x1="48" y1="100" x2="187" y2="100" stroke="#252554" strokeWidth="1" />
              <line x1="48" y1="114" x2="187" y2="114" stroke="#252554" strokeWidth="1" />
              <line x1="48" y1="128" x2="187" y2="128" stroke="#252554" strokeWidth="1" />

              {/* Typed Terminal Text */}
              <text
                x="52"
                y="64"
                fill="#C8F500"
                fontFamily="'Space Grotesk', monospace"
                fontSize="8.5"
                fontWeight="700"
              >
                &gt; BOOT SEQ: OK
              </text>

              <foreignObject x="52" y="70" width="132" height="70">
                <div
                  style={{
                    color: "#FFFFFF",
                    fontFamily: "'Space Grotesk', monospace",
                    fontSize: "8px",
                    fontWeight: 700,
                    lineHeight: "1.25",
                    wordBreak: "break-word",
                  }}
                >
                  {typedText}
                  <span
                    style={{
                      display: "inline-block",
                      width: 5,
                      height: 8,
                      backgroundColor: "#C8F500",
                      marginLeft: 2,
                      animation: "blink 0.8s infinite",
                    }}
                  />
                </div>
              </foreignObject>
            </g>
          ) : (
            /* Idle Screen Before Boot */
            <g>
              <line x1="56" y1="62" x2="110" y2="62" stroke="#C8F500" strokeWidth="3" strokeLinecap="round" />
              <line x1="56" y1="76" x2="165" y2="76" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="56" y1="90" x2="140" y2="90" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="56" y1="104" x2="115" y2="104" stroke="#FF6B00" strokeWidth="2.5" strokeLinecap="round" />
              <text
                x="56"
                y="134"
                fill="#C8F500"
                fontFamily="'Manrope', sans-serif"
                fontSize="9"
                fontWeight="700"
              >
                [CLICK TO BOOT]
              </text>
            </g>
          )}

          {/* Power Button & Indicators */}
          <circle cx="215" cy="55" r="8" fill={crtBooted ? "#C8F500" : "#E6007A"} stroke="#151535" strokeWidth="2.5" />
          <circle cx="215" cy="80" r="5" fill="#FFD600" stroke="#151535" strokeWidth="2" />
          {/* Side air vents */}
          <line x1="206" y1="110" x2="225" y2="110" stroke="#151535" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="206" y1="120" x2="225" y2="120" stroke="#151535" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="206" y1="130" x2="225" y2="130" stroke="#151535" strokeWidth="2.5" strokeLinecap="round" />

          {/* Stand */}
          <polygon points="90,195 180,195 195,215 75,215" fill="#EAEAF2" stroke="#151535" strokeWidth="3" />
        </g>

        {/* 2. Vintage Radio (Middle Right) */}
        <g
          id="interactive-radio"
          onMouseEnter={() => setRadioHovered(true)}
          onMouseLeave={() => setRadioHovered(false)}
          className="cursor-pointer"
          style={{
            animation: "radioFloat 6.5s ease-in-out infinite alternate 0.5s",
            transformOrigin: "center",
          }}
        >
          {/* Shadow */}
          <rect x="114" y="194" width="195" height="125" rx="16" fill="#151535" />
          {/* Body - Orange */}
          <rect x="110" y="190" width="195" height="125" rx="16" fill="#FF6B00" stroke="#151535" strokeWidth="3" />

          {/* Antenna */}
          <line x1="130" y1="190" x2="115" y2="135" stroke="#151535" strokeWidth="3" strokeLinecap="round" />
          <circle cx="115" cy="135" r="5" fill="#FFD600" stroke="#151535" strokeWidth="2" />

          {/* Speaker Grill */}
          <circle cx="170" cy="252" r="40" fill="#F8F7FC" stroke="#151535" strokeWidth="3" />
          <circle cx="170" cy="252" r="26" fill="#151535" />
          <circle cx="170" cy="252" r="11" fill="#FFD600" />

          {/* Animated EQ Bars on Speaker when Hovered */}
          {radioHovered && (
            <g transform="translate(145, 238)">
              <rect x="0" y="0" width="6" height="28" rx="2" fill="#C8F500" className="eq-bar-1" />
              <rect x="12" y="4" width="6" height="24" rx="2" fill="#E6007A" className="eq-bar-2" />
              <rect x="24" y="0" width="6" height="28" rx="2" fill="#1719C9" className="eq-bar-3" />
              <rect x="36" y="8" width="6" height="20" rx="2" fill="#FFD600" className="eq-bar-4" />
              <rect x="48" y="2" width="6" height="26" rx="2" fill="#C8F500" className="eq-bar-5" />
            </g>
          )}

          {/* Tuning Dial */}
          <rect x="225" y="215" width="65" height="36" rx="6" fill="#151535" stroke="#151535" strokeWidth="2" />
          <line x1="232" y1="233" x2="282" y2="233" stroke="#E6007A" strokeWidth="2" />

          {/* Indicator Needle (spins on hover) */}
          <line
            x1="257"
            y1="220"
            x2="257"
            y2="246"
            stroke="#C8F500"
            strokeWidth="3"
            style={{
              transformOrigin: "257px 233px",
              transform: radioHovered ? "rotate(35deg)" : "rotate(0deg)",
              transition: "transform 0.4s ease",
            }}
          />

          {/* Knobs */}
          <circle cx="242" cy="282" r="12" fill="#FFFFFF" stroke="#151535" strokeWidth="2.5" />
          <circle cx="274" cy="282" r="12" fill="#FFFFFF" stroke="#151535" strokeWidth="2.5" />
        </g>

        {/* 3. 3.5" Floppy Disk (Middle Left) */}
        <g
          id="interactive-floppy"
          onMouseEnter={() => setFloppyHovered(true)}
          onMouseLeave={() => setFloppyHovered(false)}
          className="cursor-pointer"
          style={{
            animation: "floppyFloat 6s ease-in-out infinite alternate 1s",
            transformOrigin: "70px 280px",
            transform: floppyHovered ? "translate(-8px, -12px) rotate(-10deg) scale(1.05)" : "rotate(-6deg)",
            transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Shadow */}
          <rect x="18" y="244" width="130" height="130" rx="8" fill="#151535" />
          {/* Floppy Body - Magenta */}
          <rect x="14" y="240" width="130" height="130" rx="8" fill="#E6007A" stroke="#151535" strokeWidth="3" />
          {/* Top Notch Cutout */}
          <polygon points="125,240 144,259 144,240" fill="#FFFFFF" />
          {/* Metal Shutter */}
          <rect x="36" y="240" width="75" height="48" fill="#EAEAF2" stroke="#151535" strokeWidth="2.5" />
          <rect x="58" y="250" width="22" height="28" rx="3" fill="#151535" />
          {/* Paper Label - Lime with Supernova label */}
          <rect x="28" y="300" width="102" height="60" rx="4" fill="#C8F500" stroke="#151535" strokeWidth="2" />
          <text x="36" y="318" fill="#151535" fontFamily="'Space Grotesk', sans-serif" fontSize="10" fontWeight="700">
            SUPERNOVA 3.0
          </text>
          <line x1="36" y1="330" x2="120" y2="330" stroke="#151535" strokeWidth="2" strokeLinecap="round" />
          <line x1="36" y1="344" x2="108" y2="344" stroke="#151535" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* 4. Audio Cassette Tape (Bottom) */}
        <g
          id="interactive-cassette"
          onMouseEnter={() => setCassetteHovered(true)}
          onMouseLeave={() => setCassetteHovered(false)}
          className="cursor-pointer"
          style={{
            animation: "cassetteFloat 7.5s ease-in-out infinite alternate 1.5s",
            transformOrigin: "160px 375px",
          }}
        >
          {/* Shadow */}
          <rect x="64" y="334" width="210" height="120" rx="12" fill="#151535" />
          {/* Cassette Body - Purple */}
          <rect x="60" y="330" width="210" height="120" rx="12" fill="#8438FF" stroke="#151535" strokeWidth="3" />
          {/* Yellow Label */}
          <rect x="80" y="346" width="170" height="88" rx="8" fill="#FFD600" stroke="#151535" strokeWidth="2.5" />
          {/* Tape Window */}
          <rect x="108" y="366" width="114" height="46" rx="8" fill="#151535" />

          {/* Left Reel (Spins on hover) */}
          <g
            style={{
              transformOrigin: "132px 389px",
              animation: cassetteHovered ? "spinReel 0.6s linear infinite" : "none",
            }}
          >
            <circle cx="132" cy="389" r="14" fill="#FFFFFF" stroke="#151535" strokeWidth="2" />
            <circle cx="132" cy="389" r="6" fill="#151535" />
            <line x1="122" y1="389" x2="142" y2="389" stroke="#151535" strokeWidth="2" />
            <line x1="132" y1="379" x2="132" y2="399" stroke="#151535" strokeWidth="2" />
          </g>

          {/* Right Reel (Spins on hover) */}
          <g
            style={{
              transformOrigin: "198px 389px",
              animation: cassetteHovered ? "spinReel 0.6s linear infinite" : "none",
            }}
          >
            <circle cx="198" cy="389" r="14" fill="#FFFFFF" stroke="#151535" strokeWidth="2" />
            <circle cx="198" cy="389" r="6" fill="#151535" />
            <line x1="188" y1="389" x2="208" y2="389" stroke="#151535" strokeWidth="2" />
            <line x1="198" y1="379" x2="198" y2="399" stroke="#151535" strokeWidth="2" />
          </g>

          {/* Label lines */}
          <text x="92" y="358" fill="#151535" fontFamily="'Space Grotesk', sans-serif" fontSize="9" fontWeight="700">
            SIDE A · VINTAGE SYNTHS
          </text>
        </g>
      </svg>

      <style>{`
        @keyframes crtFloat {
          0% { transform: translateY(0px) rotate(0deg); }
          100% { transform: translateY(-8px) rotate(1deg); }
        }
        @keyframes radioFloat {
          0% { transform: translateY(0px) rotate(0deg); }
          100% { transform: translateY(-10px) rotate(-1.5deg); }
        }
        @keyframes floppyFloat {
          0% { transform: rotate(-6deg) translateY(0px); }
          100% { transform: rotate(-4deg) translateY(-8px); }
        }
        @keyframes cassetteFloat {
          0% { transform: rotate(3deg) translateY(0px); }
          100% { transform: rotate(5deg) translateY(-9px); }
        }
        @keyframes spinReel {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .eq-bar-1 { animation: eqBounce 0.4s infinite alternate ease-in-out; }
        .eq-bar-2 { animation: eqBounce 0.6s infinite alternate-reverse ease-in-out 0.1s; }
        .eq-bar-3 { animation: eqBounce 0.5s infinite alternate ease-in-out 0.2s; }
        .eq-bar-4 { animation: eqBounce 0.7s infinite alternate-reverse ease-in-out 0.15s; }
        .eq-bar-5 { animation: eqBounce 0.45s infinite alternate ease-in-out 0.05s; }
        @keyframes eqBounce {
          0% { transform: scaleY(0.3); transform-origin: bottom; }
          100% { transform: scaleY(1); transform-origin: bottom; }
        }
      `}</style>
    </div>
  );
};
