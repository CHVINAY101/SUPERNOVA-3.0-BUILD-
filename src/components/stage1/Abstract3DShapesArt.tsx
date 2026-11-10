import { useRef, useEffect } from "react";

/**
 * Floating 3D-looking objects (max 260px wide) built with CSS and SVG:
 * - Glossy blue sphere (radial-gradient plus highlight)
 * - Orange torus (SVG ellipse with a gradient stroke)
 * - Lime cube (CSS 3D transform)
 * - Small magenta sphere
 * Each with a soft ground shadow.
 * Objects float slowly (staggered) and shift at different depths with cursor.
 */
export const Abstract3DShapesArt = ({ className = "" }: { className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Mouse delta from center of art container
      const dx = (e.clientX - centerX) / (window.innerWidth / 2);
      const dy = (e.clientY - centerY) / (window.innerHeight / 2);

      // Pass depth CSS variables
      containerRef.current.style.setProperty("--mouse-dx", dx.toFixed(3));
      containerRef.current.style.setProperty("--mouse-dy", dy.toFixed(3));
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative select-none flex flex-col items-center ${className}`}
      style={{
        maxWidth: 260,
        width: "100%",
        perspective: 800,
        ["--mouse-dx" as string]: "0",
        ["--mouse-dy" as string]: "0",
      }}
    >
      <div className="relative w-full" style={{ height: 420 }}>
        {/* 1. Glossy Blue Sphere (Top) */}
        <div
          className="obj-float-1"
          style={{
            position: "absolute",
            top: 20,
            left: 30,
            width: 130,
            height: 130,
            transform: "translate(calc(var(--mouse-dx) * -16px), calc(var(--mouse-dy) * -16px))",
            transition: "transform 0.15s ease-out",
          }}
        >
          {/* Soft Ground Shadow */}
          <div
            style={{
              position: "absolute",
              bottom: -18,
              left: 15,
              width: 100,
              height: 22,
              borderRadius: "50%",
              background: "radial-gradient(ellipse at center, rgba(21, 21, 53, 0.28) 0%, rgba(21, 21, 53, 0) 70%)",
            }}
          />
          {/* Main Sphere with Radial Gradient & Highlight */}
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 30%, #7B7EF5 0%, #1719C9 40%, #151535 85%, #0B0B1E 100%)",
              boxShadow: "inset -8px -8px 24px rgba(0, 0, 0, 0.5), 0 12px 28px rgba(23, 25, 201, 0.25)",
              position: "relative",
            }}
          >
            {/* Glass Highlight */}
            <div
              style={{
                position: "absolute",
                top: 14,
                left: 20,
                width: 44,
                height: 24,
                borderRadius: "50%",
                background: "radial-gradient(ellipse at center, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0) 70%)",
                transform: "rotate(-35deg)",
              }}
            />
          </div>
        </div>

        {/* 2. Orange Torus (SVG with Gradient Stroke) */}
        <div
          className="obj-float-2"
          style={{
            position: "absolute",
            top: 165,
            left: 10,
            width: 120,
            height: 70,
            transform: "translate(calc(var(--mouse-dx) * -24px), calc(var(--mouse-dy) * -24px)) rotate(-15deg)",
            transition: "transform 0.15s ease-out",
          }}
        >
          {/* Shadow */}
          <div
            style={{
              position: "absolute",
              bottom: -12,
              left: 15,
              width: 90,
              height: 16,
              borderRadius: "50%",
              background: "radial-gradient(ellipse at center, rgba(21, 21, 53, 0.2) 0%, rgba(21, 21, 53, 0) 70%)",
            }}
          />
          <svg width="120" height="70" viewBox="0 0 120 70" fill="none">
            <defs>
              <linearGradient id="torusLinear" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFA64D" />
                <stop offset="50%" stopColor="#FF6B00" />
                <stop offset="100%" stopColor="#E6007A" />
              </linearGradient>
            </defs>
            <ellipse
              cx="60"
              cy="35"
              rx="48"
              ry="24"
              stroke="url(#torusLinear)"
              strokeWidth="18"
              fill="none"
              style={{ filter: "drop-shadow(0 6px 12px rgba(255, 107, 0, 0.3))" }}
            />
            {/* Top specular highlight arc */}
            <path
              d="M 28 26 C 45 16 75 16 92 26"
              stroke="#FFF1D6"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              opacity="0.85"
            />
          </svg>
        </div>

        {/* 3. Lime Cube (CSS 3D Transform) */}
        <div
          className="obj-float-3"
          style={{
            position: "absolute",
            top: 200,
            right: 20,
            width: 80,
            height: 80,
            transformStyle: "preserve-3d",
            transform: "translate(calc(var(--mouse-dx) * -32px), calc(var(--mouse-dy) * -32px)) rotateX(-24deg) rotateY(32deg)",
            transition: "transform 0.15s ease-out",
          }}
        >
          {/* Soft Shadow */}
          <div
            style={{
              position: "absolute",
              bottom: -24,
              left: 5,
              width: 70,
              height: 20,
              borderRadius: "50%",
              background: "radial-gradient(ellipse at center, rgba(21, 21, 53, 0.25) 0%, rgba(21, 21, 53, 0) 70%)",
            }}
          />
          {/* Isometric CSS Cube Faces */}
          <div
            style={{
              width: 70,
              height: 70,
              position: "relative",
              transformStyle: "preserve-3d",
            }}
          >
            {/* Front */}
            <div
              style={{
                position: "absolute",
                width: 70,
                height: 70,
                backgroundColor: "#C8F500",
                border: "2px solid #151535",
                borderRadius: 8,
                transform: "translateZ(35px)",
                boxShadow: "inset 0 0 12px rgba(0, 0, 0, 0.08)",
              }}
            />
            {/* Top */}
            <div
              style={{
                position: "absolute",
                width: 70,
                height: 70,
                backgroundColor: "#E4FF66",
                border: "2px solid #151535",
                borderRadius: 8,
                transform: "rotateX(90deg) translateZ(35px)",
              }}
            />
            {/* Right */}
            <div
              style={{
                position: "absolute",
                width: 70,
                height: 70,
                backgroundColor: "#9BC400",
                border: "2px solid #151535",
                borderRadius: 8,
                transform: "rotateY(90deg) translateZ(35px)",
              }}
            />
          </div>
        </div>

        {/* 4. Small Magenta Sphere (Bottom) */}
        <div
          className="obj-float-4"
          style={{
            position: "absolute",
            bottom: 30,
            left: 55,
            width: 72,
            height: 72,
            transform: "translate(calc(var(--mouse-dx) * -12px), calc(var(--mouse-dy) * -12px))",
            transition: "transform 0.15s ease-out",
          }}
        >
          {/* Shadow */}
          <div
            style={{
              position: "absolute",
              bottom: -12,
              left: 10,
              width: 52,
              height: 14,
              borderRadius: "50%",
              background: "radial-gradient(ellipse at center, rgba(21, 21, 53, 0.25) 0%, rgba(21, 21, 53, 0) 70%)",
            }}
          />
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 30%, #FF75B8 0%, #E6007A 45%, #8438FF 80%, #151535 100%)",
              boxShadow: "inset -4px -4px 14px rgba(0, 0, 0, 0.4), 0 8px 20px rgba(230, 0, 122, 0.25)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 12,
                width: 24,
                height: 14,
                borderRadius: "50%",
                background: "radial-gradient(ellipse at center, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0) 70%)",
                transform: "rotate(-30deg)",
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        /* Staggered Floating Keyframes */
        .obj-float-1 {
          animation: floatStagger1 6s ease-in-out infinite alternate;
        }
        .obj-float-2 {
          animation: floatStagger2 7s ease-in-out infinite alternate 0.4s;
        }
        .obj-float-3 {
          animation: floatStagger3 8s ease-in-out infinite alternate 0.8s;
        }
        .obj-float-4 {
          animation: floatStagger4 5.5s ease-in-out infinite alternate 1.2s;
        }

        @keyframes floatStagger1 {
          0% { margin-top: 0px; }
          100% { margin-top: -12px; }
        }
        @keyframes floatStagger2 {
          0% { margin-top: 0px; }
          100% { margin-top: 14px; }
        }
        @keyframes floatStagger3 {
          0% { margin-top: 0px; }
          100% { margin-top: -16px; }
        }
        @keyframes floatStagger4 {
          0% { margin-top: 0px; }
          100% { margin-top: 10px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .obj-float-1, .obj-float-2, .obj-float-3, .obj-float-4 {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};
