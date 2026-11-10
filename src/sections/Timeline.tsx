import React from "react";
import { SITE_CONTENT } from "@/content/site";

export const Timeline: React.FC = () => {
  return (
    <section className="site-section bg-[#F8F7FC] border-y border-[#EAEAF2]">
      <div className="site-container">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center max-w-[760px] mx-auto mb-16">
          <span className="section-label">{SITE_CONTENT.timeline.eyebrow}</span>
          <h2 className="section-heading mb-4">{SITE_CONTENT.timeline.heading}</h2>
        </div>

        {/* Three Columns Joined by One Ribbon (Vertical on Mobile) */}
        <div className="relative max-w-[1100px] mx-auto">
          {/* Ribbon line (hidden on mobile, connects centers on desktop) */}
          <div
            className="hidden md:block absolute top-[110px] left-[10%] right-[10%] h-2 rounded-full pointer-events-none z-0"
            style={{
              background: "linear-gradient(90deg, #1719C9 0%, #EF28D0 50%, #C8F500 100%)",
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
            {SITE_CONTENT.timeline.steps.map((step) => (
              <div
                key={step.era}
                className="bg-white rounded-[20px] p-6 sm:p-8 border border-[#EAEAF2] shadow-sm flex flex-col items-center text-center justify-between"
              >
                {/* 40px Display Label (Space Grotesk 700) */}
                <div
                  className="font-heading text-[40px] font-bold text-[#151535] leading-none mb-6 tracking-tight uppercase"
                >
                  {step.era}
                </div>

                {/* SVG Illustration (max 240px wide) */}
                <div className="w-full max-w-[240px] h-[160px] flex items-center justify-center mb-6">
                  {step.type === "past" && (
                    <svg viewBox="0 0 200 140" fill="none" className="w-full h-full">
                      {/* Retro CRT */}
                      <rect x="25" y="15" width="95" height="75" rx="8" fill="#F0EFEA" stroke="#151535" strokeWidth="2.5" />
                      <rect x="35" y="24" width="75" height="56" rx="4" fill="#151535" />
                      <rect x="42" y="32" width="60" height="40" rx="3" fill="#0A0A1F" />
                      <path d="M50 45L60 45" stroke="#C8F500" strokeWidth="2" strokeLinecap="round" />
                      <path d="M50 55L75 55" stroke="#C8F500" strokeWidth="2" strokeLinecap="round" />
                      {/* Retro Radio beside */}
                      <rect x="105" y="45" width="70" height="50" rx="6" fill="#FF7025" stroke="#151535" strokeWidth="2.5" />
                      <circle cx="125" cy="70" r="12" fill="#151535" />
                      <circle cx="155" cy="62" r="6" fill="#FFFFFF" stroke="#151535" strokeWidth="1.5" />
                      <line x1="105" y1="35" x2="105" y2="45" stroke="#151535" strokeWidth="2" />
                    </svg>
                  )}

                  {step.type === "present" && (
                    <svg viewBox="0 0 200 140" fill="none" className="w-full h-full">
                      {/* Modern Laptop with Animation Timeline */}
                      <rect x="30" y="20" width="140" height="85" rx="6" fill="#151535" stroke="#151535" strokeWidth="2.5" />
                      <rect x="36" y="26" width="128" height="72" rx="3" fill="#1F1F47" />
                      {/* Screen Animation Canvas */}
                      <circle cx="70" cy="50" r="12" fill="#EF28D0" />
                      <path d="M70 50L120 40" stroke="#C8F500" strokeWidth="2" strokeDasharray="3 3" />
                      <circle cx="120" cy="40" r="8" fill="#FFD52E" />
                      {/* Timeline Tracks at bottom of screen */}
                      <rect x="40" y="74" width="120" height="18" fill="#151535" rx="2" />
                      <line x1="45" y1="80" x2="155" y2="80" stroke="#52527A" strokeWidth="2" />
                      <line x1="45" y1="86" x2="155" y2="86" stroke="#52527A" strokeWidth="2" />
                      <rect x="65" y="77" width="20" height="6" fill="#1719C9" rx="1" />
                      <rect x="95" y="83" width="28" height="6" fill="#EF28D0" rx="1" />
                      {/* Laptop Base */}
                      <path d="M15 105L25 115H175L185 105H15Z" fill="#EAEAF2" stroke="#151535" strokeWidth="2" />
                    </svg>
                  )}

                  {step.type === "future" && (
                    <svg viewBox="0 0 200 140" fill="none" className="w-full h-full">
                      {/* Abstract 3D shape, wind turbine, smart city skyline */}
                      {/* Skyline silhouettes */}
                      <rect x="35" y="60" width="24" height="50" fill="#EAEAF2" stroke="#151535" strokeWidth="1.5" />
                      <rect x="65" y="45" width="26" height="65" fill="#1719C9" stroke="#151535" strokeWidth="1.5" />
                      <rect x="95" y="55" width="20" height="55" fill="#FF7025" stroke="#151535" strokeWidth="1.5" />
                      {/* Wind turbine */}
                      <line x1="145" y1="40" x2="145" y2="110" stroke="#151535" strokeWidth="2.5" />
                      <line x1="145" y1="40" x2="145" y2="15" stroke="#C8F500" strokeWidth="2.5" />
                      <line x1="145" y1="40" x2="168" y2="55" stroke="#C8F500" strokeWidth="2.5" />
                      <line x1="145" y1="40" x2="122" y2="55" stroke="#C8F500" strokeWidth="2.5" />
                      {/* Floating glowing abstract poly */}
                      <polygon points="50,20 68,32 58,50 38,44 32,28" fill="#EF28D0" stroke="#151535" strokeWidth="2" />
                    </svg>
                  )}
                </div>

                {/* Body Line */}
                <p className="font-body text-[16px] text-[#52527A] leading-relaxed m-0">
                  {step.line}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
