import React, { useEffect, useState } from "react";
import { SITE_CONTENT } from "@/content/site";

export const Marquee: React.FC = () => {
  const [speedMultiplier, setSpeedMultiplier] = useState(1);

  useEffect(() => {
    let lastScroll = window.scrollY;
    let timer: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      const currentScroll = window.scrollY;
      const speed = Math.min(3, Math.max(1, Math.abs(currentScroll - lastScroll) * 0.05 + 1));
      setSpeedMultiplier(speed);
      lastScroll = currentScroll;

      clearTimeout(timer);
      timer = setTimeout(() => {
        setSpeedMultiplier(1);
      }, 150);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timer);
    };
  }, []);

  const row1Items = [...SITE_CONTENT.marquee.row1, ...SITE_CONTENT.marquee.row1];
  const row2Items = [...SITE_CONTENT.marquee.row2, ...SITE_CONTENT.marquee.row2];

  return (
    <div
      className="relative overflow-clip w-full bg-[#151535] text-white py-6 select-none"
      aria-hidden="true"
    >
      <div className="flex flex-col gap-4">
        {/* Row 1: Forward Direction */}
        <div className="flex overflow-hidden w-full whitespace-nowrap">
          <div
            className="flex items-center gap-6 marquee-track-forward"
            style={{
              animationDuration: `${28 / speedMultiplier}s`,
            }}
          >
            {row1Items.map((word, idx) => (
              <span
                key={idx}
                className={`font-heading text-3xl sm:text-5xl font-bold uppercase tracking-wider ${
                  idx % 4 === 0
                    ? "text-[#D5F542]"
                    : idx % 4 === 2
                    ? "text-transparent [-webkit-text-stroke:1.5px_#FFFFFF]"
                    : "text-white"
                }`}
              >
                {word}
              </span>
            ))}
          </div>
        </div>

        {/* Row 2: Reverse Direction */}
        <div className="flex overflow-hidden w-full whitespace-nowrap">
          <div
            className="flex items-center gap-6 marquee-track-reverse"
            style={{
              animationDuration: `${32 / speedMultiplier}s`,
            }}
          >
            {row2Items.map((word, idx) => (
              <span
                key={idx}
                className={`font-heading text-3xl sm:text-5xl font-bold uppercase tracking-wider ${
                  idx % 4 === 1
                    ? "text-[#FF873D]"
                    : idx % 4 === 3
                    ? "text-transparent [-webkit-text-stroke:1.5px_#D5F542]"
                    : "text-white"
                }`}
              >
                {word}
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .marquee-track-forward {
          display: flex;
          width: max-content;
          animation: marqueeLeft linear infinite;
        }

        .marquee-track-reverse {
          display: flex;
          width: max-content;
          animation: marqueeRight linear infinite;
        }

        @keyframes marqueeLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        @keyframes marqueeRight {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .marquee-track-forward, .marquee-track-reverse {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};
