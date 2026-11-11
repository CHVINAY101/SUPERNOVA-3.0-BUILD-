import React from "react";
import { useNavigate } from "react-router-dom";
import { SITE_CONTENT } from "@/content/site";
import { Trophy, Users, ShieldCheck, CheckCircle2, ArrowRight, Swords, Calendar } from "lucide-react";
import { OfficialGameCards } from "@/components/esports/OfficialGameCards";

export const Esports: React.FC = () => {
  const navigate = useNavigate();
  const esportsData = SITE_CONTENT.esports;

  const cardIcons = [Swords, Trophy, Users, ShieldCheck];

  return (
    <section
      id="esports"
      className="site-section bg-[#0B1120] text-slate-100 relative overflow-hidden"
      style={{ scrollMarginTop: "80px" }}
    >
      {/* Subtle blueprint grid backdrop */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(to right, #38BDF8 1px, transparent 1px), linear-gradient(to bottom, #38BDF8 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
        aria-hidden="true"
      />

      <div className="site-container relative z-10">
        {/* Section Header: Minimal, Premium & Distinctive */}
        <div className="flex flex-col items-start max-w-3xl mb-12 sm:mb-14">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold tracking-widest text-sky-400 uppercase mb-3">
            <span className="w-2 h-2 rounded-full bg-sky-400/80" />
            <span>COLLEGIATE ESPORTS · SECOND EDITION</span>
          </div>

          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight mb-3">
            ESPORTS ARENA
          </h2>

          <p className="font-display text-lg sm:text-xl font-semibold text-sky-300 tracking-wide mb-3">
            &ldquo;Compete. Connect. Conquer.&rdquo;
          </p>

          <p className="font-body text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            {esportsData.subheading}
          </p>
        </div>

        {/* 1. THREE OFFICIAL GAME CARDS WITH EXPANDABLE RULES */}
        <div className="mb-14 sm:mb-16">
          <div className="flex items-center justify-between gap-4 mb-6">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
              OFFICIAL TOURNAMENT GAMES
            </span>
            <div className="h-px flex-1 bg-slate-800/80" />
            <span className="font-mono text-xs text-sky-400/80">3 Confirmed Titles</span>
          </div>

          <OfficialGameCards />
        </div>

        {/* 2. Structured Tournament Guidelines & Criteria */}
        <div className="mb-14">
          <div className="flex items-center justify-between gap-4 mb-6">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
              TOURNAMENT GUIDELINES & PROTOCOLS
            </span>
            <div className="h-px flex-1 bg-slate-800/80" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {esportsData.cards.map((card, idx) => {
              const Icon = cardIcons[idx % cardIcons.length];
              return (
                <div
                  key={card.title}
                  className="bg-[#0F172A] rounded-xl p-5 border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-sky-400 shrink-0">
                        <Icon size={16} />
                      </div>
                      {card.badge && (
                        <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
                          {card.badge}
                        </span>
                      )}
                    </div>

                    <h3 className="font-display text-base font-bold text-white mb-2 leading-snug">
                      {card.title}
                    </h3>
                    <p className="font-body text-xs text-slate-300 leading-relaxed mb-4">
                      {card.body}
                    </p>

                    {card.highlights && card.highlights.length > 0 && (
                      <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-1.5">
                        {card.highlights.map((item, hIdx) => (
                          <div key={hIdx} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                            <CheckCircle2 size={12} className="text-sky-400 shrink-0 mt-0.5" />
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

        {/* 3. Action Center: Clean, Confident CTAs */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#0F172A] border border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-xl text-center md:text-left">
            <h3 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight mb-1.5">
              Ready to represent your institution?
            </h3>
            <p className="font-body text-xs sm:text-sm text-slate-300 leading-relaxed">
              Registrations are open for full-time students in Karnataka. Squad captains must provide institutional ID credentials for roster verification.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={() => navigate("/register?type=esports")}
              className="btn-primary w-full sm:w-auto text-xs"
            >
              <span>REGISTER SQUAD NOW</span>
              <ArrowRight size={14} />
            </button>

            <button
              type="button"
              onClick={() => navigate("/schedule")}
              className="btn-secondary w-full sm:w-auto text-xs flex items-center justify-center gap-1.5"
            >
              <Calendar size={13} className="text-sky-400" />
              <span>EVENT SCHEDULE</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
