import React, { useState } from "react";
import { SITE_CONTENT } from "@/content/site";

export const About: React.FC = () => {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <section id="about" className="site-section bg-[#FAF9F4]" style={{ scrollMarginTop: "80px" }}>
      <div className="site-container">
        {/* Section Header */}
        <div className="flex flex-col items-start max-w-[800px] mb-12">
          <span className="section-label">{SITE_CONTENT.about.eyebrow}</span>
          <h2 className="section-heading mb-4 text-[#191936]">
            {SITE_CONTENT.about.heading}
          </h2>
          <div className="text-base sm:text-lg text-[#191936]/80 font-body leading-relaxed max-w-2xl">
            {SITE_CONTENT.about.paragraphs.map((p, i) => (
              <p key={i} className="m-0">{p}</p>
            ))}
          </div>
        </div>

        {/* Three Cards in a Row (Stacked on mobile, 24px gaps) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SITE_CONTENT.about.pillars.map((pillar) => {
            const isHovered = hoveredCard === pillar.name;

            return (
              <div
                key={pillar.name}
                onMouseEnter={() => setHoveredCard(pillar.name)}
                onMouseLeave={() => setHoveredCard(null)}
                className="brand-card transition-all duration-200 bg-[#FFFFFF]"
                style={{
                  transform: isHovered ? "translateY(-4px)" : "translateY(0px)",
                }}
              >
                {/* 16:10 Panel with Graphic Icon */}
                <div
                  className="w-full aspect-[16/10] max-h-[190px] flex items-center justify-center relative overflow-hidden"
                  style={{ backgroundColor: pillar.color }}
                >
                  {/* CREATE: Graphic Pencil & Spark */}
                  {pillar.illustration === "create" && (
                    <svg
                      viewBox="0 0 160 100"
                      fill="none"
                      className="w-3/5 h-3/5"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M25 75L55 45L70 60L40 90L20 95L25 75Z"
                        fill="#191936"
                        stroke="#191936"
                        strokeWidth="2"
                      />
                      <polygon points="20,95 25,75 40,90" fill="#FF873D" />
                      {/* Bulb */}
                      <circle
                        cx="105"
                        cy="45"
                        r="26"
                        fill="#FFFFFF"
                        stroke="#191936"
                        strokeWidth="3"
                        className={isHovered ? "animate-pulse" : ""}
                      />
                      <path d="M96 70H114V77H96V70Z" fill="#191936" />
                      <line x1="105" y1="12" x2="105" y2="4" stroke="#191936" strokeWidth="3" strokeLinecap="round" />
                      <line x1="132" y1="22" x2="138" y2="16" stroke="#191936" strokeWidth="3" strokeLinecap="round" />
                      <line x1="142" y1="45" x2="150" y2="45" stroke="#191936" strokeWidth="3" strokeLinecap="round" />
                      <line x1="78" y1="22" x2="72" y2="16" stroke="#191936" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  )}

                  {/* CONNECT: Interconnected Nodes in Electric Blue */}
                  {pillar.illustration === "connect" && (
                    <svg
                      viewBox="0 0 160 100"
                      fill="none"
                      className="w-3/5 h-3/5"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <line x1="35" y1="50" x2="80" y2="30" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="4 4" />
                      <line x1="80" y1="30" x2="125" y2="65" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="4 4" />
                      <line x1="35" y1="50" x2="125" y2="65" stroke="#FFFFFF" strokeWidth="3" strokeDasharray="4 4" />

                      <circle cx="35" cy="50" r="16" fill="#191936" stroke="#FFFFFF" strokeWidth="3" />
                      <circle cx="35" cy="50" r="6" fill="#D5F542" />

                      <circle cx="80" cy="30" r="18" fill="#191936" stroke="#FFFFFF" strokeWidth="3" />
                      <circle cx="80" cy="30" r="8" fill="#A9D9F4" />

                      <circle cx="125" cy="65" r="16" fill="#191936" stroke="#FFFFFF" strokeWidth="3" />
                      <circle cx="125" cy="65" r="6" fill="#FF873D" />
                    </svg>
                  )}

                  {/* CELEBRATE: Starburst in Warm Orange */}
                  {pillar.illustration === "celebrate" && (
                    <svg
                      viewBox="0 0 160 100"
                      fill="none"
                      className="w-3/5 h-3/5"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <g className={isHovered ? "origin-center animate-spin" : ""}>
                        <polygon
                          points="80,16 88,36 108,38 92,52 97,72 80,60 63,72 68,52 52,38 72,36"
                          fill="#D5F542"
                          stroke="#191936"
                          strokeWidth="2.5"
                        />
                      </g>
                      <rect x="32" y="25" width="8" height="8" rx="2" fill="#FFFFFF" transform="rotate(25 32 25)" />
                      <circle cx="40" cy="72" r="5" fill="#A9D9F4" />
                      <polygon points="128,26 134,36 122,36" fill="#191936" />
                      <rect x="122" y="68" width="7" height="7" rx="2" fill="#FFFFFF" transform="rotate(45 122 68)" />
                    </svg>
                  )}
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col flex-1 bg-[#FFFFFF]">
                  <h3 className="font-display text-2xl font-extrabold text-[#191936] leading-tight mb-2">
                    {pillar.name}
                  </h3>
                  <p className="font-body text-sm sm:text-base text-[#191936]/80 leading-relaxed m-0">
                    {pillar.line}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
