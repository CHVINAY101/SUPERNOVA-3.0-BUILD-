import { useEffect, useRef } from "react";

const PALETTE = ["#1719C9", "#E6007A", "#FF6B00", "#C8F500", "#8438FF"];

/**
 * 24px Dot Grid Canvas
 * Dots near the cursor (160px radius) light up in vibrant brand colors.
 */
export const InteractiveDotGrid: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const mouse = { x: -1000, y: -1000, active: false };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.active = false;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleMouseLeave);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };

    window.addEventListener("resize", handleResize);

    const spacing = 24;
    const radius = 160;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const cols = Math.ceil(width / spacing);
      const rows = Math.ceil(height / spacing);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * spacing + 12;
          const y = r * spacing + 12;

          let dist = 9999;
          if (mouse.active) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            dist = Math.sqrt(dx * dx + dy * dy);
          }

          if (dist < radius) {
            // Illuminated dot near cursor
            const factor = 1 - dist / radius; // 1 at center, 0 at boundary
            const colorIdx = (c + r) % PALETTE.length;
            ctx.fillStyle = PALETTE[colorIdx];
            ctx.beginPath();
            ctx.arc(x, y, 1.8 + factor * 2.2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Resting subdued dot
            ctx.fillStyle = "rgba(21, 21, 53, 0.08)";
            ctx.beginPath();
            ctx.arc(x, y, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="dot-grid-canvas w-full h-full" aria-hidden="true" />;
};
