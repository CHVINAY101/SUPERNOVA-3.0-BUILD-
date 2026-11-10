import React from "react";
import { useNavigate } from "react-router-dom";
import { SITE_CONTENT } from "@/content/site";
import { Trophy, Users, ShieldCheck, CheckCircle2, ArrowRight, Swords } from "lucide-react";
import { OfficialGameCards } from "@/components/esports/OfficialGameCards";

export const Esports: React.FC = () => {
  const navigate = useNavigate();
  const esportsData = SITE_CONTENT.esports;

  const cardIcons = [Swords, Trophy, Users, ShieldCheck];

  return (
    <section
      id="esports"
      className="site-section bg-[#191936] text-white relative overflow-clip"
      style={{ scrollMarginTop: "80px" }}
    >
      {/* Subtle clean grid floor (Electric Blue & Lime hairlines only, no magenta) */}
      <div
        className="absolute inset-x-0 bottom-0 h-64 pointer-events-none opacity-15"
        style={{
          perspective: "600px",
          transformOrigin: "bottom center",
        }}
        aria-hidden="true"
      >
        <div
          className="w-full h-full"
          style={{
            transform: "rotateX(60deg)",
            backgroundImage:
              "linear-gradient(to right, #4549D8 1px, transparent 1px), linear-gradient(to bottom, #D5F542 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="site-container relative z-10">
        {/* Section Header */}
        <div className="flex flex-col items-start max-w-[800px] mb-10 sm:mb-12">
          <span className="section-label" style={{ color: "#D5F542" }}>
            ESPORTS ARENA
          </span>
          <h2 className="section-heading text-white" style={{ color: "#ffffff" }}>
            {esportsData.heading}
          </h2>
          <p className="font-body text-base sm:text-lg text-white/80 leading-relaxed mt-4">
            {esportsData.subheading}
          </p>
        </div>

        {/* 1. THREE OFFICIAL GAME CARDS (Requirement C) */}
        <div className="mb-14 sm:mb-16">
          <div className="flex items-center gap-2 mb-6">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#D5F542]">
              OFFICIAL TOURNAMENT TITLES
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <OfficialGameCards />
        </div>

        {/* 2. Four Structured Tournament Guidelines Cards */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#A9D9F4]">
              TOURNAMENT GUIDELINES & CRITERIA
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {esportsData.cards.map((card, idx) => {
            const Icon = cardIcons[idx % cardIcons.length];
            return (
              <div
                key={card.title}
                className="bg-[#24244E] rounded-[22px] p-6 border-2 border-white/10 flex flex-col justify-between shadow-lg hover:border-[#D5F542]/50 hover:shadow-[4px_4px_0px_#D5F542] transition-all group"
              >
                <div>
                  {/* Top Badge & Icon */}
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-[#191936] text-[#D5F542] border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Icon size={20} />
                    </div>
                    {card.badge && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-[#D5F542]/10 text-[#D5F542] border border-[#D5F542]/20">
                        {card.badge}
                      </span>
                    )}
                  </div>

                  <h3
                    className="font-display text-lg sm:text-xl font-bold text-white mb-2 leading-snug"
                    style={
                      idx === 3
                        ? { backgroundColor: "#1e1e48", color: "#ffffff", padding: "2px 8px", borderRadius: "6px", display: "inline-block" }
                        : { color: "#ffffff" }
                    }
                  >
                    {card.title}
                  </h3>
                  <p className="font-body text-xs sm:text-sm text-[#A9D9F4] leading-relaxed mb-4">
                    {card.body}
                  </p>

                  {/* Highlights Bullet List */}
                  {card.highlights && card.highlights.length > 0 && (
                    <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
                      {card.highlights.map((item, hIdx) => (
                        <div key={hIdx} className="flex items-start gap-2 text-xs text-white/80 leading-tight">
                          <CheckCircle2 size={13} className="text-[#D5F542] shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>

        {/* Centerpiece & Register CTA */}
        <div className="flex flex-col items-center text-center max-w-lg mx-auto pt-4">
          {/* Trophy Illustration (Lime & Orange only) */}
          <div className="w-44 h-36 mb-6 relative flex items-center justify-center">
            <svg
              viewBox="0 0 200 160"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full drop-shadow-xl"
            >
              <rect x="20" y="10" width="160" height="105" rx="8" fill="#2E2E60" stroke="#D5F542" strokeWidth="3" />
              <rect x="28" y="18" width="144" height="89" rx="4" fill="#191936" />

              {/* Pixel Trophy */}
              <rect x="86" y="82" width="28" height="6" fill="#D5F542" />
              <rect x="92" y="74" width="16" height="8" fill="#D5F542" />
              <rect x="96" y="66" width="8" height="8" fill="#D5F542" />
              <rect x="84" y="38" width="32" height="28" rx="2" fill="#D5F542" />
              <rect x="88" y="42" width="24" height="20" rx="1" fill="#FF873D" />
              <path d="M84 44H76V56H84" stroke="#D5F542" strokeWidth="3" strokeLinecap="square" />
              <path d="M116 44H124V56H116" stroke="#D5F542" strokeWidth="3" strokeLinecap="square" />
              <polygon points="100,46 102,51 107,51 103,54 105,59 100,56 95,59 97,54 93,51 98,51" fill="#FFFFFF" />

              {/* Stand */}
              <path d="M92 115L88 135H112L108 115H92Z" fill="#3D3D7A" />
              <rect x="74" y="135" width="52" height="6" rx="3" fill="#D5F542" />
            </svg>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
            <button
              type="button"
              onClick={() => navigate("/register?type=esports")}
              className="btn-primary w-full sm:w-auto"
              style={{
                height: "52px",
                padding: "0 36px",
              }}
            >
              <span>{esportsData.ctaText}</span>
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              onClick={() => navigate("/esports")}
              className="btn-secondary w-full sm:w-auto"
              style={{
                height: "52px",
                padding: "0 28px",
                background: "transparent",
                color: "#FFFFFF",
                borderColor: "rgba(255, 255, 255, 0.3)",
                boxShadow: "none",
              }}
            >
              <span>EXPLORE ALL TITLES & RULES</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
