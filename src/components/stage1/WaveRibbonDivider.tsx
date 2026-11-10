import { useEffect, useState } from "react";

/**
 * Flowing Ribbon Wave Divider
 * Sits ONLY in the bottom 120px band of the hero, never behind text.
 * Thick SVG path (50px stroke, round caps) with magenta, orange, lime and blue gradients
 * and a lighter highlight stroke. Draws in once on mount, not looped.
 */
export const WaveRibbonDivider: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDrawn(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`w-full overflow-hidden pointer-events-none select-none ${className}`}
      style={{ height: 120, position: "relative" }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="ribbonGrad" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#E6007A" />
            <stop offset="30%" stopColor="#FF6B00" />
            <stop offset="65%" stopColor="#C8F500" />
            <stop offset="100%" stopColor="#1719C9" />
          </linearGradient>

          <linearGradient id="ribbonHighlight" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#FFB3D9" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#FFE0B3" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#F2FFB3" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#B3B5FF" stopOpacity="0.9" />
          </linearGradient>

          <filter id="ribbonShadow" x="-10%" y="-20%" width="120%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#151535" floodOpacity={0.12} />
          </filter>
        </defs>

        {/* Shadow Underlay */}
        <path
          d="M -40,75 C 280,115 520,35 840,75 C 1120,110 1340,40 1480,65"
          fill="none"
          stroke="#151535"
          strokeOpacity="0.08"
          strokeWidth="56"
          strokeLinecap="round"
        />

        {/* Main Multicolor Ribbon */}
        <path
          d="M -40,70 C 280,110 520,30 840,70 C 1120,105 1340,35 1480,60"
          fill="none"
          stroke="url(#ribbonGrad)"
          strokeWidth="48"
          strokeLinecap="round"
          strokeDasharray="1600"
          strokeDashoffset={drawn ? 0 : 1600}
          style={{
            transition: "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />

        {/* Lighter Highlight Stroke */}
        <path
          d="M -40,64 C 280,104 520,24 840,64 C 1120,99 1340,29 1480,54"
          fill="none"
          stroke="url(#ribbonHighlight)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="1600"
          strokeDashoffset={drawn ? 0 : 1600}
          style={{
            transition: "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s",
          }}
        />
      </svg>
    </div>
  );
};
