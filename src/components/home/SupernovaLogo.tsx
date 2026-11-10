import { useEffect, useRef, useState, useCallback } from "react";

interface ParticleStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  rotation: number;
  rotSpeed: number;
  decay: number;
}

interface ExpandingRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

interface SupernovaLogoProps {
  onEntranceComplete?: () => void;
  className?: string;
}

export function SupernovaLogo({ onEntranceComplete, className = "" }: SupernovaLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoWrapperRef = useRef<HTMLDivElement>(null);
  const burstCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [entranceDone, setEntranceDone] = useState<boolean>(false);
  const [lightSweepPos, setLightSweepPos] = useState<number>(-120);

  // Mouse & lerp tracking
  const mousePosRef = useRef({ x: 0, y: 0, active: false });
  const currentLerpRef = useRef({ tiltX: 0, tiltY: 0, sheenX: 50, sheenY: 50 });

  // Burst particles & shockwaves
  const particlesRef = useRef<ParticleStar[]>([]);
  const ringsRef = useRef<ExpandingRing[]>([]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Entrance Sequence (1.5s): Fade + scale from 0.96 to 1 with a light sweep
  useEffect(() => {
    let start: number | null = null;
    const duration = 1500;

    const runEntrance = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min(1, (timestamp - start) / duration);

      // Sweep from -120% to 220%
      const sweep = -120 + progress * 340;
      setLightSweepPos(sweep);

      if (progress < 1) {
        requestAnimationFrame(runEntrance);
      } else {
        setEntranceDone(true);
        if (onEntranceComplete) {
          onEntranceComplete();
        }
      }
    };

    const animId = requestAnimationFrame(runEntrance);
    return () => cancelAnimationFrame(animId);
  }, [onEntranceComplete]);

  // Pointer movement tracking for desktop tilt & sheen
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    const el = logoWrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mousePosRef.current = { x, y, active: true };
  };

  const handlePointerLeave = () => {
    mousePosRef.current.active = false;
  };

  // Click/tap particle burst: 1 expanding ring + 12-16 tiny 4-point stars (10-12 on mobile)
  const triggerBurst = useCallback(
    (clientX: number, clientY: number) => {
      const el = logoWrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const originX = clientX - rect.left;
      const originY = clientY - rect.top;

      // 1 expanding ring
      ringsRef.current.push({
        x: originX,
        y: originY,
        radius: 8,
        maxRadius: isMobile ? 120 : 180,
        alpha: 0.9,
      });

      // 12-16 tiny 4-point stars (10-12 on mobile)
      const starCount = isMobile ? 11 : 14;
      for (let i = 0; i < starCount; i++) {
        const angle = (i / starCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const speed = isMobile ? 2.5 + Math.random() * 4.5 : 3.5 + Math.random() * 6.5;
        particlesRef.current.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: isMobile ? 6 + Math.random() * 5 : 8 + Math.random() * 7,
          alpha: 1,
          rotation: Math.random() * Math.PI,
          rotSpeed: (Math.random() - 0.5) * 0.2,
          decay: 0.016 + Math.random() * 0.014,
        });
      }
    },
    [isMobile]
  );

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    triggerBurst(e.clientX, e.clientY);
  };

  // Master rAF Loop for tilt, float, sheen, and particle bursts
  useEffect(() => {
    let animId: number;
    let startTime = performance.now();

    const canvas = burstCanvasRef.current;
    const ctx = canvas?.getContext("2d");

    const render = (now: number) => {
      const elapsed = now - startTime;
      const el = logoWrapperRef.current;

      // Keep burst canvas sized accurately
      if (canvas && el) {
        if (canvas.width !== el.offsetWidth || canvas.height !== el.offsetHeight) {
          canvas.width = el.offsetWidth;
          canvas.height = el.offsetHeight;
        }
      }

      // Idle float: ±6px, 6s on desktop; ±4px on mobile
      const floatAmp = isMobile ? 4 : 6;
      const idleFloatY = Math.sin((elapsed / 6000) * Math.PI * 2) * floatAmp;

      // Perspective tilt: max 6 degrees on desktop; 0 on mobile
      if (!isMobile && el) {
        const halfW = el.offsetWidth / 2;
        const halfH = el.offsetHeight / 2;

        let targetTiltX = 0;
        let targetTiltY = 0;

        if (mousePosRef.current.active && halfW > 0 && halfH > 0) {
          // Tilt towards cursor (max 6 deg)
          targetTiltX = -((mousePosRef.current.y - halfH) / halfH) * 6;
          targetTiltY = ((mousePosRef.current.x - halfW) / halfW) * 6;
        }

        const lerp = currentLerpRef.current;
        lerp.tiltX += (targetTiltX - lerp.tiltX) * 0.08;
        lerp.tiltY += (targetTiltY - lerp.tiltY) * 0.08;

        el.style.transform = `perspective(1000px) translateY(${idleFloatY.toFixed(2)}px) rotateX(${lerp.tiltX.toFixed(2)}deg) rotateY(${lerp.tiltY.toFixed(2)}deg)`;

        // Sheen follow cursor
        if (mousePosRef.current.active) {
          const targetSheenX = (mousePosRef.current.x / el.offsetWidth) * 100;
          const targetSheenY = (mousePosRef.current.y / el.offsetHeight) * 100;
          lerp.sheenX += (targetSheenX - lerp.sheenX) * 0.1;
          lerp.sheenY += (targetSheenY - lerp.sheenY) * 0.1;
        }
      } else if (el) {
        // Mobile idle float only (no tilt, no touch drag)
        el.style.transform = `translateY(${idleFloatY.toFixed(2)}px)`;
      }

      // Render Burst Canvas (Expanding rings + four-point stars)
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw Expanding Rings
        for (let rIdx = ringsRef.current.length - 1; rIdx >= 0; rIdx--) {
          const ring = ringsRef.current[rIdx];
          ring.radius += (ring.maxRadius - ring.radius) * 0.14;
          ring.alpha *= 0.91;

          ctx.save();
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(124, 108, 245, ${ring.alpha.toFixed(3)})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();

          if (ring.alpha < 0.02) {
            ringsRef.current.splice(rIdx, 1);
          }
        }

        // Draw Tiny 4-Point Stars
        for (let pIdx = particlesRef.current.length - 1; pIdx >= 0; pIdx--) {
          const p = particlesRef.current[pIdx];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.alpha -= p.decay;
          p.rotation += p.rotSpeed;

          if (p.alpha <= 0) {
            particlesRef.current.splice(pIdx, 1);
            continue;
          }

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = `rgba(244, 123, 32, ${p.alpha.toFixed(3)})`;

          // Draw 4-point star path
          const s = p.size;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.quadraticCurveTo(0, 0, s, 0);
          ctx.quadraticCurveTo(0, 0, 0, s);
          ctx.quadraticCurveTo(0, 0, -s, 0);
          ctx.quadraticCurveTo(0, 0, 0, -s);
          ctx.fill();

          // Star core dot in white/violet
          ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isMobile]);

  const sheen = currentLerpRef.current;

  return (
    <div
      ref={containerRef}
      className={`supernova-official-logo-root ${className}`}
      style={{
        position: "relative",
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        touchAction: "pan-y",
      }}
    >
      <div
        ref={logoWrapperRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        style={{
          position: "relative",
          width: isMobile ? "92vw" : "min(80vw, 960px)",
          maxWidth: isMobile ? 420 : 960,
          aspectRatio: "2137 / 736",
          cursor: "pointer",
          userSelect: "none",
          WebkitUserSelect: "none",
          transition: entranceDone
            ? "none"
            : "opacity 1.5s ease, transform 1.5s cubic-bezier(0.16, 1, 0.3, 1)",
          transformOrigin: "center center",
        }}
      >
        {/* Official Supernova 3.0 Logo Image — Used exactly as supplied */}
        <img
          src="/assets/brand/supernova-logo.png"
          alt="Supernova 3.0"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
            filter: "drop-shadow(0 8px 32px rgba(46, 42, 138, 0.08))",
          }}
          draggable={false}
        />

        {/* Sheen Layer: Indigo-to-violet sheen following cursor, masked to logo shape */}
        {!isMobile && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              WebkitMaskImage: "url(/assets/brand/supernova-logo.png)",
              maskImage: "url(/assets/brand/supernova-logo.png)",
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
              background: mousePosRef.current.active
                ? `radial-gradient(circle 240px at ${sheen.sheenX}% ${sheen.sheenY}%, rgba(124, 108, 245, 0.45) 0%, rgba(46, 42, 138, 0.15) 50%, transparent 100%)`
                : "none",
              mixBlendMode: "color-dodge",
              opacity: mousePosRef.current.active ? 0.85 : 0,
              transition: "opacity 0.25s ease",
            }}
          />
        )}

        {/* Entrance Light Sweep Layer */}
        {!entranceDone && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              WebkitMaskImage: "url(/assets/brand/supernova-logo.png)",
              maskImage: "url(/assets/brand/supernova-logo.png)",
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
              background: `linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.8) 50%, rgba(124, 108, 245, 0.5) 75%, transparent 100%)`,
              transform: `translateX(${lightSweepPos}%)`,
              mixBlendMode: "screen",
            }}
          />
        )}

        {/* Canvas for Particle Burst (Expanding ring + 4-point stars) */}
        <canvas
          ref={burstCanvasRef}
          style={{
            position: "absolute",
            inset: -40,
            width: "calc(100% + 80px)",
            height: "calc(100% + 80px)",
            pointerEvents: "none",
            zIndex: 40,
          }}
        />
      </div>
    </div>
  );
}
