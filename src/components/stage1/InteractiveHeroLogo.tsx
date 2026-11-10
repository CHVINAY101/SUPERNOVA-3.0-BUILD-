import { useRef, useEffect, useState, useCallback } from "react";
import { CONFIG } from "@/config";

interface BurstParticle {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  color: string;
  size: number;
  scale: number;
  alpha: number;
}

const PALETTE = ["#C8F500", "#E6007A", "#FF6B00", "#1719C9", "#FFD600", "#8438FF"];

/**
 * Interactive Hero Logo with rAF Lerp Tilt, Sheen Mask, Idle Float, and Tap/Click Star Burst
 */
export const InteractiveHeroLogo: React.FC<{ className?: string }> = ({ className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  // Tilt and animation state refs for 60fps lerp loop without triggering React renders
  const targetTiltX = useRef(0);
  const targetTiltY = useRef(0);
  const currentTiltX = useRef(0);
  const currentTiltY = useRef(0);
  const isHovered = useRef(false);

  // Sheen position
  const sheenProgress = useRef(-100);

  // Burst particles state
  const [bursts, setBursts] = useState<{ id: number; ring: boolean; particles: BurstParticle[] }[]>([]);

  // 1. rAF Lerp Loop: perspective tilt toward cursor (max 6 deg) + idle float (±6px, 6s)
  useEffect(() => {
    let animId: number;
    let startTime = performance.now();

    const update = (time: number) => {
      const elapsed = (time - startTime) / 1000;

      // Idle float (±6px, 6s period)
      const idleFloatY = Math.sin((elapsed * 2 * Math.PI) / 6) * 6;

      // Lerp tilt toward target
      const lerpFactor = 0.08;
      currentTiltX.current += (targetTiltX.current - currentTiltX.current) * lerpFactor;
      currentTiltY.current += (targetTiltY.current - currentTiltY.current) * lerpFactor;

      // Apply transform to DOM directly for performance
      if (tiltRef.current) {
        tiltRef.current.style.transform = `perspective(1000px) rotateX(${currentTiltX.current.toFixed(
          2
        )}deg) rotateY(${currentTiltY.current.toFixed(2)}deg) translateY(${idleFloatY.toFixed(2)}px)`;
      }

      // Progress sheen
      if (isHovered.current) {
        sheenProgress.current += 1.8;
        if (sheenProgress.current > 200) {
          sheenProgress.current = -120;
        }
      }

      animId = requestAnimationFrame(update);
    };

    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Mouse move handler for desktop tilt
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const percentX = (x - centerX) / centerX; // -1 to 1
    const percentY = (y - centerY) / centerY; // -1 to 1

    // Max 6 degrees tilt
    targetTiltY.current = percentX * 6;
    targetTiltX.current = -percentY * 6;
    isHovered.current = true;
  }, []);

  const handleMouseEnter = useCallback(() => {
    isHovered.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    targetTiltX.current = 0;
    targetTiltY.current = 0;
    isHovered.current = false;
  }, []);

  // Click/tap burst: one ring + 12-16 tiny stars in palette colors
  const handleTriggerBurst = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    let clientX = rect.left + rect.width / 2;
    let clientY = rect.top + rect.height / 2;

    if ("clientX" in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }

    const originX = clientX - rect.left;
    const originY = clientY - rect.top;

    const count = 14;
    const particles: BurstParticle[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (i * 2 * Math.PI) / count + (Math.random() - 0.5) * 0.4;
      const speed = 40 + Math.random() * 55;
      const color = PALETTE[i % PALETTE.length];
      const size = 6 + Math.random() * 6;

      particles.push({
        id: i,
        x: originX,
        y: originY,
        angle,
        speed,
        color,
        size,
        scale: 1,
        alpha: 1,
      });
    }

    const burstId = Date.now();
    setBursts((prev) => [...prev, { id: burstId, ring: true, particles }]);

    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burstId));
    }, 700);
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleTriggerBurst}
      onTouchStart={handleTriggerBurst}
      className={`relative inline-block cursor-pointer select-none ${className}`}
      style={{
        width: "clamp(260px, 72vw, 880px)",
        maxWidth: 880,
        margin: "0 auto",
      }}
      aria-label={`${CONFIG.EVENT_NAME} Logo`}
    >
      {/* Tilt Container */}
      <div
        ref={tiltRef}
        style={{
          transformStyle: "preserve-3d",
          willChange: "transform",
          transition: "transform 0.05s ease-out",
        }}
        className="relative flex items-center justify-center w-full"
      >
        {/* Main Logo Image */}
        <img
          src={CONFIG.LOGO_PATH}
          alt={CONFIG.EVENT_NAME}
          className="w-full h-auto object-contain block mx-auto"
          style={{
            maxHeight: 180,
            maxWidth: "100%",
            filter: "drop-shadow(0 10px 24px rgba(21, 21, 53, 0.06))",
          }}
          draggable={false}
        />

        {/* Soft Sheen Overlay Mask */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{
            maskImage: `url(${CONFIG.LOGO_PATH})`,
            WebkitMaskImage: `url(${CONFIG.LOGO_PATH})`,
            maskSize: "contain",
            WebkitMaskSize: "contain",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "45%",
              background: "linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.5) 50%, transparent 100%)",
              transform: "skewX(-20deg)",
              left: `${sheenProgress.current}%`,
              transition: isHovered.current ? "none" : "left 0.4s ease",
            }}
          />
        </div>
      </div>

      {/* Burst Animation Ring & Palette Stars */}
      {bursts.map((b) => (
        <div key={b.id} className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
          {/* Expanding Ring */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "3px solid #C8F500",
              animation: "burstRing 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          />

          {/* Stars */}
          {b.particles.map((p) => {
            const destX = Math.cos(p.angle) * p.speed;
            const destY = Math.sin(p.angle) * p.speed;

            return (
              <div
                key={p.id}
                style={{
                  position: "absolute",
                  left: `${p.x}px`,
                  top: `${p.y}px`,
                  animation: `starFly-${p.id} 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                }}
              >
                {/* 4-point Star */}
                <svg width={p.size} height={p.size} viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 0L9.8 6.2L16 8L9.8 9.8L8 16L6.2 9.8L0 8L6.2 6.2L8 0Z"
                    fill={p.color}
                    stroke="#151535"
                    strokeWidth="1.2"
                  />
                </svg>

                <style>{`
                  @keyframes starFly-${p.id} {
                    0% {
                      transform: translate(0, 0) scale(0.6) rotate(0deg);
                      opacity: 1;
                    }
                    80% {
                      opacity: 1;
                    }
                    100% {
                      transform: translate(${destX}px, ${destY}px) scale(1.1) rotate(180deg);
                      opacity: 0;
                    }
                  }
                `}</style>
              </div>
            );
          })}
        </div>
      ))}

      <style>{`
        @keyframes burstRing {
          0% {
            width: 14px;
            height: 14px;
            opacity: 1;
          }
          100% {
            width: 180px;
            height: 180px;
            opacity: 0;
            border-width: 1px;
          }
        }
      `}</style>
    </div>
  );
};
