import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

export const Glossy3DObjects: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize from -1 to 1 based on viewport center
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      setMousePos({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div
      className={`relative flex flex-col items-center justify-between max-w-[260px] w-full gap-6 select-none ${className}`}
      style={{
        perspective: "800px",
      }}
    >
      {/* 1. Glossy Blue Sphere (Top) */}
      <motion.div
        animate={{
          y: [0, -8, 0],
          x: mousePos.x * -10,
        }}
        transition={{
          y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
          x: { duration: 0.2, ease: "easeOut" },
        }}
        className="relative flex flex-col items-center"
      >
        <div
          className="w-24 h-24 rounded-full border border-black/10"
          style={{
            background: "radial-gradient(circle at 32% 28%, #FFFFFF 0%, #4D50F5 35%, #1719C9 70%, #0B0C68 100%)",
            boxShadow: "0 16px 28px rgba(23, 25, 201, 0.25), inset -4px -6px 12px rgba(0, 0, 0, 0.4)",
          }}
        />
        {/* Soft ground shadow */}
        <div className="w-16 h-3 rounded-full bg-black/10 blur-[3px] mt-2" />
      </motion.div>

      {/* 2. Glossy Orange Torus & Lime Cube Row */}
      <div className="flex items-center justify-between w-full gap-6">
        {/* Orange Torus */}
        <motion.div
          animate={{
            y: [0, 8, 0],
            rotate: [0, 6, 0],
            x: mousePos.x * -14,
          }}
          transition={{
            y: { duration: 5.2, repeat: Infinity, ease: "easeInOut", delay: 0.4 },
            rotate: { duration: 7, repeat: Infinity, ease: "easeInOut" },
            x: { duration: 0.2, ease: "easeOut" },
          }}
          className="relative flex flex-col items-center"
        >
          <svg viewBox="0 0 100 100" className="w-20 h-20" fill="none">
            <defs>
              <radialGradient id="torusGrad" cx="30%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#FFF2D6" />
                <stop offset="30%" stopColor="#FFA15C" />
                <stop offset="70%" stopColor="#FF7025" />
                <stop offset="100%" stopColor="#A83900" />
              </radialGradient>
            </defs>
            <path
              d="M50 15C30.67 15 15 30.67 15 50C15 69.33 30.67 85 50 85C69.33 85 85 69.33 85 50C85 30.67 69.33 15 50 15ZM50 64C42.27 64 36 57.73 36 50C36 42.27 42.27 36 50 36C57.73 36 64 42.27 64 50C64 57.73 57.73 64 50 64Z"
              fill="url(#torusGrad)"
              stroke="#151535"
              strokeWidth="2"
            />
          </svg>
          <div className="w-14 h-2.5 rounded-full bg-black/10 blur-[2px] mt-1" />
        </motion.div>

        {/* Lime Cube */}
        <motion.div
          animate={{
            y: [0, -6, 0],
            rotateY: [0, 12, 0],
            x: mousePos.x * -8,
          }}
          transition={{
            y: { duration: 5.8, repeat: Infinity, ease: "easeInOut", delay: 0.8 },
            rotateY: { duration: 8, repeat: Infinity, ease: "easeInOut" },
            x: { duration: 0.2, ease: "easeOut" },
          }}
          className="relative flex flex-col items-center"
        >
          <svg viewBox="0 0 100 100" className="w-20 h-20" fill="none">
            <defs>
              <linearGradient id="cubeTop" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#EDFF85" />
                <stop offset="100%" stopColor="#C8F500" />
              </linearGradient>
              <linearGradient id="cubeLeft" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#B2DD00" />
                <stop offset="100%" stopColor="#7E9E00" />
              </linearGradient>
              <linearGradient id="cubeRight" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#9BC200" />
                <stop offset="100%" stopColor="#5E7500" />
              </linearGradient>
            </defs>
            {/* Isometric Cube Faces */}
            <polygon points="50,15 85,35 50,55 15,35" fill="url(#cubeTop)" stroke="#151535" strokeWidth="2" />
            <polygon points="15,35 50,55 50,90 15,70" fill="url(#cubeLeft)" stroke="#151535" strokeWidth="2" />
            <polygon points="50,55 85,35 85,70 50,90" fill="url(#cubeRight)" stroke="#151535" strokeWidth="2" />
          </svg>
          <div className="w-14 h-2.5 rounded-full bg-black/10 blur-[2px] mt-1" />
        </motion.div>
      </div>

      {/* 3. Glossy Magenta Sphere (Bottom) */}
      <motion.div
        animate={{
          y: [0, 7, 0],
          x: mousePos.x * -12,
        }}
        transition={{
          y: { duration: 6.4, repeat: Infinity, ease: "easeInOut", delay: 1.2 },
          x: { duration: 0.2, ease: "easeOut" },
        }}
        className="relative flex flex-col items-center"
      >
        <div
          className="w-20 h-20 rounded-full border border-black/10"
          style={{
            background: "radial-gradient(circle at 35% 25%, #FFFFFF 0%, #FA62E3 30%, #EF28D0 70%, #750063 100%)",
            boxShadow: "0 14px 26px rgba(239, 40, 208, 0.25), inset -3px -5px 10px rgba(0, 0, 0, 0.35)",
          }}
        />
        <div className="w-16 h-3 rounded-full bg-black/10 blur-[3px] mt-2" />
      </motion.div>
    </div>
  );
};
