import { useEffect, useState } from "react";

interface FloatingShapeItem {
  id: number;
  type: "pixel-square" | "dot" | "starburst" | "thin-arc";
  x: number;
  y: number;
  color: string;
  size: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
}

const PALETTE = ["#C8F500", "#E6007A", "#FF6B00", "#1719C9", "#FFD600", "#8438FF"];

/**
 * Minimal Floating Shapes with Seeded Placement & Exclusion Zone Protection
 * Maximum 8 on desktop, 4 on mobile, spaced >= 140px apart.
 * Drifts slowly (20-40px over 20-40s).
 */
export const FloatingShapes: React.FC<{ containerRef?: React.RefObject<HTMLElement | null> }> = ({ containerRef }) => {
  const [shapes, setShapes] = useState<FloatingShapeItem[]>([]);

  useEffect(() => {
    const computePositions = () => {
      const isMobile = window.innerWidth < 768;
      const count = isMobile ? 4 : 8;
      const width = window.innerWidth;
      const height = containerRef?.current?.offsetHeight || 800;

      // Exclusion zones: Center column where text, logo and buttons live
      // Plus 40px padding
      const centerWidth = Math.min(width * 0.75, 680);
      const centerLeft = (width - centerWidth) / 2 - 40;
      const centerRight = centerLeft + centerWidth + 80;
      const centerTop = 40;
      const centerBottom = height - 120; // Keep clear of ribbon too

      const isInsideExclusion = (x: number, y: number) => {
        return x >= centerLeft && x <= centerRight && y >= centerTop && y <= centerBottom;
      };

      const newShapes: FloatingShapeItem[] = [];
      const types: FloatingShapeItem["type"][] = ["pixel-square", "dot", "starburst", "thin-arc"];

      // Seeded deterministic generation with rejection sampling
      let seed = 42;
      const pseudoRandom = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      let attempts = 0;
      while (newShapes.length < count && attempts < 150) {
        attempts++;
        const x = pseudoRandom() * (width - 80) + 40;
        const y = pseudoRandom() * (height - 180) + 60;

        if (isInsideExclusion(x, y)) continue;

        // Ensure >= 140px apart from each other
        const tooClose = newShapes.some((s) => {
          const dx = s.x - x;
          const dy = s.y - y;
          return Math.sqrt(dx * dx + dy * dy) < 140;
        });

        if (tooClose) continue;

        const type = types[newShapes.length % types.length];
        const color = PALETTE[newShapes.length % PALETTE.length];
        const size = type === "dot" ? 8 : type === "pixel-square" ? 10 : 16;
        const duration = 24 + pseudoRandom() * 16; // 24s to 40s
        const driftX = (pseudoRandom() - 0.5) * 40;
        const driftY = (pseudoRandom() - 0.5) * 40;

        newShapes.push({
          id: newShapes.length,
          type,
          x,
          y,
          color,
          size,
          duration,
          delay: pseudoRandom() * 5,
          driftX,
          driftY,
        });
      }

      setShapes(newShapes);
    };

    computePositions();
    window.addEventListener("resize", computePositions);
    return () => window.removeEventListener("resize", computePositions);
  }, [containerRef]);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden select-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      {shapes.map((s) => (
        <div
          key={s.id}
          style={{
            position: "absolute",
            left: `${s.x}px`,
            top: `${s.y}px`,
            animation: `drift-${s.id} ${s.duration}s ease-in-out infinite alternate`,
            animationDelay: `${s.delay}s`,
          }}
        >
          {s.type === "pixel-square" && (
            <div
              style={{
                width: s.size,
                height: s.size,
                backgroundColor: s.color,
                border: "2px solid #151535",
                boxShadow: "2px 2px 0px #151535",
              }}
            />
          )}

          {s.type === "dot" && (
            <div
              style={{
                width: s.size,
                height: s.size,
                borderRadius: "50%",
                backgroundColor: s.color,
                border: "1.5px solid #151535",
              }}
            />
          )}

          {s.type === "starburst" && (
            <svg width={s.size} height={s.size} viewBox="0 0 20 20" fill="none">
              <path
                d="M10 0L12.5 7.5L20 10L12.5 12.5L10 20L7.5 12.5L0 10L7.5 7.5L10 0Z"
                fill={s.color}
                stroke="#151535"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {s.type === "thin-arc" && (
            <svg width={s.size * 1.4} height={s.size} viewBox="0 0 28 20" fill="none">
              <path
                d="M2 18C4 8 14 2 26 6"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          )}

          <style>{`
            @keyframes drift-${s.id} {
              0% { transform: translate(0px, 0px) rotate(0deg); }
              100% { transform: translate(${s.driftX}px, ${s.driftY}px) rotate(15deg); }
            }
          `}</style>
        </div>
      ))}
    </div>
  );
};
