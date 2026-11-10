import { useEffect, useRef, useState } from "react";

interface Shape {
  id: number;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  rotation: number;
  rotSpeed: number;
}

interface InteractiveBackgroundProps {
  // Elements whose bounding boxes should be excluded from shape placement
  exclusionSelectors?: string[];
  maxShapesDesktop?: number;
  maxShapesMobile?: number;
}

export function InteractiveBackground({
  exclusionSelectors = [
    "nav",
    ".hero-title-group",
    ".hero-dates-group",
    ".hero-buttons-group",
    ".hero-countdown-group",
    ".hero-organiser-group",
  ],
  maxShapesDesktop = 10,
  maxShapesMobile = 5,
}: InteractiveBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapesRef = useRef<Shape[]>([]);
  const animFrameRef = useRef<number>(0);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const shapeTypes = [
      "atom",
      "dna",
      "flask",
      "rocket",
      "clapperboard",
      "controller",
      "gear",
      "lightbulb",
      "planet",
      "sparkle",
    ];

    const getExclusionRects = () => {
      const padding = isMobile ? 24 : 48;
      const rects: { left: number; top: number; right: number; bottom: number }[] = [];
      const parentRect = canvas.parentElement?.getBoundingClientRect() || {
        left: 0,
        top: 0,
      };

      exclusionSelectors.forEach((sel) => {
        const els = document.querySelectorAll(sel);
        els.forEach((el) => {
          const r = el.getBoundingClientRect();
          rects.push({
            left: r.left - parentRect.left - padding,
            top: r.top - parentRect.top - padding,
            right: r.right - parentRect.left + padding,
            bottom: r.bottom - parentRect.top + padding,
          });
        });
      });
      return rects;
    };

    const isInsideExclusion = (x: number, y: number, size: number, rects: { left: number; top: number; right: number; bottom: number }[]) => {
      const half = size / 2;
      for (const r of rects) {
        if (
          x + half >= r.left &&
          x - half <= r.right &&
          y + half >= r.top &&
          y - half <= r.bottom
        ) {
          return true;
        }
      }
      return false;
    };

    // Initialize shapes using seeded random rejection sampling
    const initShapes = () => {
      const parent = canvas.parentElement;
      width = parent?.clientWidth || window.innerWidth;
      height = parent?.clientHeight || window.innerHeight;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      const count = isMobile ? maxShapesMobile : maxShapesDesktop;
      const minDistance = isMobile ? 120 : 160;
      const rects = getExclusionRects();

      // Grid cells tracking: 3 cols x 2 rows (max 2 per cell)
      const gridCounts: number[][] = [
        [0, 0, 0],
        [0, 0, 0],
      ];

      const newShapes: Shape[] = [];
      let attempts = 0;
      const maxAttempts = 500;

      for (let i = 0; i < count && attempts < maxAttempts; attempts++) {
        const type = shapeTypes[i % shapeTypes.length];
        const size = isMobile
          ? 56 + (i * 11) % 45
          : 64 + (i * 17) % 76; // 48-140px range

        const x = 30 + Math.random() * (width - 60);
        const y = 30 + Math.random() * (height - 60);

        // Check grid constraint
        const col = Math.min(2, Math.floor((x / width) * 3));
        const row = Math.min(1, Math.floor((y / height) * 2));
        if (gridCounts[row][col] >= 2) continue;

        // Check exclusions
        if (isInsideExclusion(x, y, size, rects)) continue;

        // Check distance to existing shapes
        let tooClose = false;
        for (const existing of newShapes) {
          const dist = Math.hypot(x - existing.x, y - existing.y);
          if (dist < minDistance) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;

        // Valid position found!
        gridCounts[row][col]++;
        newShapes.push({
          id: i,
          type,
          x,
          y,
          vx: (Math.random() - 0.5) * (isMobile ? 0.08 : 0.14),
          vy: (Math.random() - 0.5) * (isMobile ? 0.08 : 0.14),
          size,
          opacity: 0.22 + (i % 3) * 0.04, // 22-30% opacity
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.002,
        });
        i++;
      }

      shapesRef.current = newShapes;
    };

    initShapes();

    // Draw individual shape paths (1.25px outline, stroke #7C6CF5, no fill)
    const drawShape = (type: string, size: number) => {
      const s = size / 100;
      ctx.lineWidth = 1.25;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      switch (type) {
        case "atom":
          // Three elliptical orbits with central nucleus
          ctx.ellipse(0, 0, 42 * s, 16 * s, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 0, 42 * s, 16 * s, Math.PI / 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 0, 42 * s, 16 * s, (2 * Math.PI) / 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, 5 * s, 0, Math.PI * 2);
          break;

        case "dna":
          // Dual sinusoid helix rungs
          for (let py = -38; py <= 38; py += 12) {
            const px = Math.sin(py * 0.08) * 22 * s;
            ctx.moveTo(-px, py * s);
            ctx.lineTo(px, py * s);
          }
          ctx.stroke();
          ctx.beginPath();
          for (let py = -42; py <= 42; py += 4) {
            const px = Math.sin(py * 0.08) * 22 * s;
            if (py === -42) ctx.moveTo(-px, py * s);
            else ctx.lineTo(-px, py * s);
          }
          ctx.stroke();
          ctx.beginPath();
          for (let py = -42; py <= 42; py += 4) {
            const px = Math.sin(py * 0.08) * 22 * s;
            if (py === -42) ctx.moveTo(px, py * s);
            else ctx.lineTo(px, py * s);
          }
          break;

        case "flask":
          // Erlenmeyer flask outline
          ctx.moveTo(-8 * s, -38 * s);
          ctx.lineTo(8 * s, -38 * s);
          ctx.moveTo(-6 * s, -38 * s);
          ctx.lineTo(-6 * s, -14 * s);
          ctx.lineTo(-32 * s, 34 * s);
          ctx.quadraticCurveTo(-34 * s, 38 * s, -28 * s, 38 * s);
          ctx.lineTo(28 * s, 38 * s);
          ctx.quadraticCurveTo(34 * s, 38 * s, 32 * s, 34 * s);
          ctx.lineTo(6 * s, -14 * s);
          ctx.lineTo(6 * s, -38 * s);
          // Fluid level line
          ctx.moveTo(-20 * s, 18 * s);
          ctx.lineTo(20 * s, 18 * s);
          break;

        case "rocket":
          // Rocket silhouette
          ctx.moveTo(0, -40 * s);
          ctx.quadraticCurveTo(24 * s, -10 * s, 20 * s, 26 * s);
          ctx.lineTo(34 * s, 38 * s);
          ctx.lineTo(16 * s, 34 * s);
          ctx.lineTo(0, 36 * s);
          ctx.lineTo(-16 * s, 34 * s);
          ctx.lineTo(-34 * s, 38 * s);
          ctx.lineTo(-20 * s, 26 * s);
          ctx.quadraticCurveTo(-24 * s, -10 * s, 0, -40 * s);
          // Porthole
          ctx.moveTo(8 * s, -10 * s);
          ctx.arc(0, -10 * s, 8 * s, 0, Math.PI * 2);
          break;

        case "clapperboard":
          // Film clapperboard
          ctx.rect(-34 * s, -8 * s, 68 * s, 46 * s);
          ctx.stroke();
          ctx.beginPath();
          ctx.rect(-34 * s, -32 * s, 68 * s, 20 * s);
          // Slanted stripes
          ctx.moveTo(-20 * s, -32 * s);
          ctx.lineTo(-12 * s, -12 * s);
          ctx.moveTo(0, -32 * s);
          ctx.lineTo(8 * s, -12 * s);
          ctx.moveTo(20 * s, -32 * s);
          ctx.lineTo(28 * s, -12 * s);
          break;

        case "controller":
          // Gamepad
          ctx.roundRect(-36 * s, -22 * s, 72 * s, 44 * s, 14 * s);
          // D-Pad cross
          ctx.moveTo(-24 * s, 0);
          ctx.lineTo(-12 * s, 0);
          ctx.moveTo(-18 * s, -6 * s);
          ctx.lineTo(-18 * s, 6 * s);
          // ABXY dots
          ctx.moveTo(18 * s, -6 * s);
          ctx.arc(18 * s, -6 * s, 2.5 * s, 0, Math.PI * 2);
          ctx.moveTo(26 * s, 0);
          ctx.arc(26 * s, 0, 2.5 * s, 0, Math.PI * 2);
          ctx.moveTo(18 * s, 6 * s);
          ctx.arc(18 * s, 6 * s, 2.5 * s, 0, Math.PI * 2);
          ctx.moveTo(10 * s, 0);
          ctx.arc(10 * s, 0, 2.5 * s, 0, Math.PI * 2);
          break;

        case "gear":
          // Gear cog with center hole
          ctx.arc(0, 0, 24 * s, 0, Math.PI * 2);
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            const gx = Math.cos(a) * 24 * s;
            const gy = Math.sin(a) * 24 * s;
            const ox = Math.cos(a) * 34 * s;
            const oy = Math.sin(a) * 34 * s;
            ctx.moveTo(gx, gy);
            ctx.lineTo(ox, oy);
          }
          ctx.moveTo(10 * s, 0);
          ctx.arc(0, 0, 10 * s, 0, Math.PI * 2);
          break;

        case "lightbulb":
          // Lightbulb outline with filament
          ctx.arc(0, -12 * s, 22 * s, 0.7 * Math.PI, 0.3 * Math.PI, true);
          ctx.lineTo(12 * s, 18 * s);
          ctx.lineTo(-12 * s, 18 * s);
          ctx.closePath();
          // Screw base
          ctx.moveTo(-10 * s, 24 * s);
          ctx.lineTo(10 * s, 24 * s);
          ctx.moveTo(-8 * s, 30 * s);
          ctx.lineTo(8 * s, 30 * s);
          // Filament
          ctx.moveTo(-6 * s, -4 * s);
          ctx.lineTo(0, -16 * s);
          ctx.lineTo(6 * s, -4 * s);
          break;

        case "planet":
          // Ringed planet
          ctx.arc(0, 0, 22 * s, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 0, 44 * s, 14 * s, -0.35, 0, Math.PI * 2);
          break;

        case "sparkle":
        default:
          // Four-point celestial sparkle
          ctx.moveTo(0, -36 * s);
          ctx.quadraticCurveTo(0, 0, 36 * s, 0);
          ctx.quadraticCurveTo(0, 0, 0, 36 * s);
          ctx.quadraticCurveTo(0, 0, -36 * s, 0);
          ctx.quadraticCurveTo(0, 0, 0, -36 * s);
          break;
      }
      ctx.stroke();
    };

    // Slow drift & boundary clamping animation loop
    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      const rects = getExclusionRects();

      shapesRef.current.forEach((shape) => {
        // Slow drift
        let nextX = shape.x + shape.vx;
        let nextY = shape.y + shape.vy;
        shape.rotation += shape.rotSpeed;

        // Bounce off canvas edges
        const half = shape.size / 2;
        if (nextX - half < 10 || nextX + half > width - 10) {
          shape.vx *= -1;
          nextX = shape.x + shape.vx;
        }
        if (nextY - half < 10 || nextY + half > height - 10) {
          shape.vy *= -1;
          nextY = shape.y + shape.vy;
        }

        // Soft rebound from exclusion zones
        if (isInsideExclusion(nextX, nextY, shape.size, rects)) {
          shape.vx *= -1;
          shape.vy *= -1;
          nextX = shape.x + shape.vx;
          nextY = shape.y + shape.vy;
        }

        shape.x = nextX;
        shape.y = nextY;

        // Draw shape with thin outline (#7C6CF5, opacity 0.22 - 0.30)
        ctx.save();
        ctx.translate(shape.x, shape.y);
        ctx.rotate(shape.rotation);
        ctx.strokeStyle = `rgba(124, 108, 245, ${shape.opacity.toFixed(3)})`;
        drawShape(shape.type, shape.size);
        ctx.restore();
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    const handleWindowResize = () => {
      initShapes();
    };

    window.addEventListener("resize", handleWindowResize, { passive: true });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [isMobile, exclusionSelectors, maxShapesDesktop, maxShapesMobile]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 0,
      }}
      aria-hidden="true"
    >
      {/* Light gradient: #F6F3FF to #FFFFFF with faint bottom lavender glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, #F6F3FF 0%, #FFFFFF 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "5%",
          right: "5%",
          height: "35%",
          background: "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(124, 108, 245, 0.08) 0%, rgba(255, 255, 255, 0) 100%)",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
        }}
      />
    </div>
  );
}
