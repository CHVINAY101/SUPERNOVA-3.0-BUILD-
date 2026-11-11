import type { FC } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Layers, Clock, Lock, ChevronRight } from "lucide-react";

export const AnimationPreview: FC = () => {
  return (
    <section
      id="animation-preview"
      className="site-section bg-[#0D0D1F] text-white relative overflow-hidden py-20 sm:py-24 border-b border-white/10"
    >
      {/* Subtle, restrained ambient lighting */}
      <div
        className="absolute -top-32 right-1/4 w-[500px] h-[250px] bg-[#4549D8]/10 blur-[130px] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 left-1/4 w-[450px] h-[250px] bg-[#F59E0B]/[0.06] blur-[130px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="site-container relative z-10">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[#C4B5FD] text-xs font-mono font-medium tracking-wider uppercase mb-3">
              <span>SPECIAL FEATURE · THE NATIONAL COLLEGE</span>
            </div>

            <h2
              style={{ color: "#d0e6be" }}
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#d0e6be] leading-tight"
            >
              DEPARTMENT OF ANIMATION
            </h2>

            <p className="font-heading italic text-lg sm:text-xl text-[#C4B5FD] mt-2">
              Where creativity meets technology.
            </p>

            <p className="font-body text-sm sm:text-base text-white/70 mt-3 leading-relaxed">
              Experience two exclusive pillars presented by the Department of Animation at Supernova 3.0: creator masterclass workshops and a confidential premiere.
            </p>
          </div>

          <Link
            to="/animation"
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-white text-[#000000] font-heading font-extrabold text-xs uppercase tracking-wider hover:bg-white/90 shadow-md transition-all shrink-0 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span style={{ color: "#000000" }} className="text-[#000000]">Explore Department Program</span>
            <ArrowRight size={14} strokeWidth={2.5} />
          </Link>
        </div>

        {/* Exactly Two Main Pillars Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          
          {/* Pillar 01: Workshops Card */}
          <div className="rounded-3xl bg-[#14142B] border border-white/10 p-7 sm:p-9 flex flex-col justify-between hover:border-[#4549D8]/50 transition-all group">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#4549D8]/15 border border-[#4549D8]/30 text-[#C4B5FD] text-xs font-mono font-medium tracking-wider uppercase">
                  <Layers size={12} className="text-[#A78BFA]" />
                  PILLAR 01
                </span>
                <span className="text-xs font-mono text-white/40">3 Confirmed Sessions</span>
              </div>

              <h3
                style={{ color: "#ffffff" }}
                className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug mb-1 group-hover:text-[#C4B5FD] transition-colors"
              >
                WORKSHOPS
              </h3>

              <p className="font-heading italic text-sm sm:text-base text-[#C4B5FD] mb-4">
                Learn. Create. Experiment.
              </p>

              <p className="font-body text-xs sm:text-sm text-white/70 leading-relaxed mb-6">
                Hands-on masterclasses designed for aspiring game creators, digital artists, and students:
              </p>

              {/* Confirmed Topics List */}
              <div className="space-y-3 mb-6">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between text-xs font-mono text-white/80">
                  <span className="font-bold">01 — HOW TO MAKE GAMES WITH ROBLOX</span>
                  <span className="text-white/50 text-[11px] shrink-0">30 mins</span>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs font-mono text-white/80 font-bold">
                  02 — LEVEL DESIGNING IN UNREAL ENGINE
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs font-mono text-white/80 font-bold">
                  03 — HOW DESIGNERS USE AI TOOLS
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-[#A78BFA]">
                <Clock size={13} />
                <span>MORE WORKSHOPS LOADING SOON...</span>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs font-mono text-white/50">20–21 November 2026</span>
              <Link
                to="/animation#workshops"
                className="text-xs font-heading font-bold text-white uppercase tracking-wider inline-flex items-center gap-1.5 hover:text-[#C4B5FD] transition-colors"
              >
                <span>View Workshop Details</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>

          {/* Pillar 02: Original IP Launch (Cinematic & Confidential) */}
          <div className="rounded-3xl bg-gradient-to-br from-[#15152F] to-[#0F0F23] border border-[#F59E0B]/30 p-7 sm:p-9 flex flex-col justify-between hover:border-[#F59E0B]/60 transition-all shadow-[0_12px_40px_rgba(0,0,0,0.4)] group relative overflow-hidden">
            <div
              className="absolute top-0 right-0 w-48 h-48 bg-[#F59E0B]/[0.07] blur-3xl pointer-events-none"
              aria-hidden="true"
            />

            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] text-xs font-mono font-medium tracking-wider uppercase">
                  <Sparkles size={12} className="text-[#F59E0B]" />
                  PILLAR 02 · EXCLUSIVE
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#F59E0B]/80">
                  <Lock size={11} /> Confidential
                </span>
              </div>

              <h3
                style={{ color: "#ffffff" }}
                className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug mb-1 group-hover:text-[#F59E0B] transition-colors"
              >
                ORIGINAL IP LAUNCH
              </h3>

              <p className="font-heading italic text-sm sm:text-base text-[#F59E0B] mb-4">
                &ldquo;Something original. Something unexpected.&rdquo;
              </p>

              <p className="font-body text-xs sm:text-sm text-white/70 leading-relaxed mb-6">
                A first-time creative initiative from the Department of Animation. Discover something new at Supernova 3.0.
              </p>

              {/* Minimal Abstract Monolith Aperture */}
              <div className="rounded-2xl bg-[#090915] border border-white/10 p-5 flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex items-center justify-center shrink-0">
                  <Lock size={20} className="text-[#F59E0B]/80" />
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[#F59E0B] font-bold">
                    Embargoed Until Event Day
                  </div>
                  <div className="font-display text-sm sm:text-base font-bold text-white mt-0.5">
                    Live Premiere at Supernova 3.0
                  </div>
                  <div className="text-[11px] font-mono text-white/50 mt-0.5">
                    Main Auditorium · Reveal on Event Day
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs font-mono text-white/50">Confidential Premiere</span>
              <Link
                to="/animation#original-ip"
                className="text-xs font-heading font-bold text-[#F59E0B] uppercase tracking-wider inline-flex items-center gap-1.5 hover:underline"
              >
                <span>View Launch Program</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
