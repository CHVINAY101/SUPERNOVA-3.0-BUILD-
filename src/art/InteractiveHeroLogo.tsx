import React, { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface StarParticle {
  id: number;
  x: number;
  y: number;
  color: string;
  angle: number;
  distance: number;
}

const STAR_COLORS = ["#C8F500", "#EF28D0", "#FF7025", "#1719C9", "#FFD52E"];

export const InteractiveHeroLogo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [burstActive, setBurstActive] = useState(false);
  const [burstKey, setBurstKey] = useState(0);

  // Tilt toward cursor (max 6 degrees, disabled on mobile/touch)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || window.innerWidth < 768) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = (e.clientX - centerX) / (window.innerWidth / 2);
      const deltaY = (e.clientY - centerY) / (window.innerHeight / 2);

      // Max 6 degrees lerped/clamped
      const rotY = Math.max(-6, Math.min(6, deltaX * 6));
      const rotX = Math.max(-6, Math.min(6, -deltaY * 6));

      setTilt({ x: rotX, y: rotY });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Click or tap burst: one ring plus 14 tiny four-point stars in palette colors
  const handleLogoClick = () => {
    setBurstActive(true);
    setBurstKey((prev) => prev + 1);
    setTimeout(() => setBurstActive(false), 900);
  };

  const stars: StarParticle[] = Array.from({ length: 14 }).map((_, i) => ({
    id: i,
    x: 0,
    y: 0,
    color: STAR_COLORS[i % STAR_COLORS.length],
    angle: (i * 360) / 14,
    distance: 60 + (i % 3) * 25,
  }));

  return (
    <div
      ref={containerRef}
      onClick={handleLogoClick}
      className="relative cursor-pointer select-none inline-block mx-auto"
      style={{
        perspective: "1000px",
      }}
      title="Tap to trigger burst"
    >
      {/* Idle Float (±6px, 6s) & Perspective Tilt */}
      <motion.div
        animate={{
          y: [-6, 6, -6],
          rotateX: tilt.x,
          rotateY: tilt.y,
        }}
        transition={{
          y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
          rotateX: { duration: 0.15, ease: "easeOut" },
          rotateY: { duration: 0.15, ease: "easeOut" },
        }}
        className="relative z-10 block mx-auto"
      >
        <img
          src="/assets/aistudio/Futuristic_Supernova_3.0_Logo_png_c0ddbd5c.png"
          alt="SUPERNOVA 3.0"
          className="block mx-auto object-contain"
          style={{
            width: "min(56vw, 700px)",
            maxHeight: "180px",
            filter: "drop-shadow(0 12px 28px rgba(21, 21, 53, 0.08))",
          }}
        />

        {/* Soft Sheen Layer */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden rounded-2xl"
          style={{
            background: "linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.7) 45%, transparent 60%)",
            animation: "sheenSlide 6s infinite",
          }}
        />
      </motion.div>

      {/* Burst Animation: 1 Expanding Ring + 14 Four-point stars */}
      <AnimatePresence>
        {burstActive && (
          <div key={burstKey} className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
            {/* Expanding Ring */}
            <motion.div
              initial={{ scale: 0.2, opacity: 1, borderWidth: "4px" }}
              animate={{ scale: 2.2, opacity: 0, borderWidth: "1px" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.75, ease: "easeOut" }}
              className="absolute w-40 h-40 rounded-full border border-[#C8F500]"
            />

            {/* 14 Four-point Stars in palette colors */}
            {stars.map((star) => {
              const rad = (star.angle * Math.PI) / 180;
              const targetX = Math.cos(rad) * star.distance;
              const targetY = Math.sin(rad) * star.distance;

              return (
                <motion.div
                  key={star.id}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                  animate={{ x: targetX, y: targetY, scale: 1.2, opacity: 0 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="absolute"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={star.color}>
                    <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" />
                  </svg>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes sheenSlide {
          0% { transform: translateX(-150%); }
          30%, 100% { transform: translateX(150%); }
        }
      `}</style>
    </div>
  );
};
