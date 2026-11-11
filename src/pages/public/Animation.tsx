import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  MapPin,
  Clock,
  Sparkles,
  Layers,
  ChevronRight,
  Info,
  CheckCircle2,
  Lock,
} from "lucide-react";

/**
 * EDITABLE WORKSHOP SESSIONS LIST
 * Organisers can easily add, update, or reorder workshops here.
 */
export interface WorkshopSession {
  id: string;
  num: string;
  title: string;
  duration?: string;
  focus: string;
  description: string;
  isConfirmed: boolean;
}

const CONFIRMED_WORKSHOPS: WorkshopSession[] = [
  {
    id: "roblox-games",
    num: "01",
    title: "HOW TO MAKE GAMES WITH ROBLOX",
    duration: "30 minutes",
    focus: "Game Creation & Interactive Worldbuilding",
    description:
      "A fast-paced, hands-on session exploring game creation fundamentals, player mechanics, world layout, and publishing interactive experiences using Roblox Studio.",
    isConfirmed: true,
  },
  {
    id: "unreal-level-design",
    num: "02",
    title: "LEVEL DESIGNING IN UNREAL ENGINE",
    focus: "Spatial Composition & Environmental Pacing",
    description:
      "Understand core level design principles, environmental storytelling, player guidance, lighting composition, and spatial flow inside Unreal Engine.",
    isConfirmed: true,
  },
  {
    id: "ai-for-designers",
    num: "03",
    title: "HOW DESIGNERS USE AI TOOLS",
    focus: "Creative Ideation & Digital Workflows",
    description:
      "Explore how digital artists and designers ethically leverage modern generative tools for mood boards, rapid visual prototyping, style exploration, and creative workflows.",
    isConfirmed: true,
  },
];

export default function Animation() {
  const [activeSection, setActiveSection] = useState<"workshops" | "original-ip">("workshops");

  const scrollToSection = (id: "workshops" | "original-ip") => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B18] text-[#E8E8F2] selection:bg-[#4549D8] selection:text-white">
      {/* 1. DEPARTMENT EDITORIAL HERO */}
      <section className="relative pt-10 sm:pt-14 pb-16 bg-gradient-to-b from-[#0B0B18] via-[#111126] to-[#0D0D1F] border-b border-white/10 overflow-hidden">
        {/* Subtle, restrained ambient lighting — No rainbow gradients or neon pills */}
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[650px] h-[300px] bg-[#4549D8]/15 blur-[120px] pointer-events-none"
          aria-hidden="true"
        />

        <div className="site-container relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[#C4B5FD] text-xs font-mono font-medium tracking-wider uppercase mb-5">
              <span>THE NATIONAL COLLEGE · BASAVANAGUDI</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.08] mb-4">
              DEPARTMENT OF ANIMATION
            </h1>

            <p className="font-heading italic text-xl sm:text-2xl text-[#C4B5FD] font-normal tracking-wide mb-6">
              Where creativity meets technology.
            </p>

            <p className="font-body text-base sm:text-lg text-white/70 leading-relaxed max-w-2xl mb-8">
              A pioneering center of digital storytelling, game design, and visual arts education. For Supernova 3.0, the Department of Animation presents two exclusive creative pillars: creator masterclasses and a confidential premiere.
            </p>

            {/* Event Key Facts */}
            <div className="flex flex-wrap items-center gap-6 pt-5 border-t border-white/10 text-xs sm:text-sm font-mono text-white/60">
              <span className="flex items-center gap-2">
                <Calendar size={14} className="text-[#A78BFA]" /> 20–21 November 2026
              </span>
              <span className="flex items-center gap-2">
                <MapPin size={14} className="text-[#A78BFA]" /> The National College, Basavanagudi
              </span>
            </div>
          </div>
        </div>

        {/* Minimal Two-Pillar Tab Navigation Bar */}
        <div className="mt-12 border-t border-white/10 bg-[#0E0E20]/90 backdrop-blur-md sticky top-16 z-30">
          <div className="site-container py-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-white/40 uppercase tracking-widest mr-2 hidden sm:inline">
                PILLARS:
              </span>

              <button
                type="button"
                onClick={() => scrollToSection("workshops")}
                className={`px-4 py-2 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                  activeSection === "workshops"
                    ? "bg-[#1E1E38] text-white border border-[#4549D8]/50 shadow-sm"
                    : "bg-white/[0.04] text-white/70 hover:text-white hover:bg-white/[0.08]"
                }`}
              >
                <Layers size={14} className="text-[#A78BFA]" />
                <span>01. WORKSHOPS</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection("original-ip")}
                className={`px-4 py-2 rounded-xl text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                  activeSection === "original-ip"
                    ? "bg-[#1E1E38] text-[#F59E0B] border border-[#F59E0B]/40 shadow-sm"
                    : "bg-white/[0.04] text-white/70 hover:text-[#F59E0B] hover:bg-white/[0.08]"
                }`}
              >
                <Sparkles size={14} className="text-[#F59E0B]" />
                <span>02. ORIGINAL IP LAUNCH</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PILLAR 1: WORKSHOPS */}
      <section
        id="workshops"
        className="site-section bg-[#0D0D1F] border-b border-white/10 relative overflow-hidden py-20 sm:py-24"
      >
        <div className="site-container relative z-10">
          {/* Section Header */}
          <div className="max-w-2xl mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4549D8]/15 border border-[#4549D8]/30 text-[#C4B5FD] text-xs font-mono font-medium tracking-wider uppercase mb-3">
              PILLAR 01 · CREATOR SESSIONS
            </div>

            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight uppercase leading-tight mb-2">
              WORKSHOPS
            </h2>

            <p className="font-heading italic text-lg sm:text-xl text-[#C4B5FD] mb-4">
              Learn. Create. Experiment.
            </p>

            <p className="font-body text-sm sm:text-base text-white/70 leading-relaxed">
              Practical, knowledge-driven sessions led by mentors and digital creators. Designed for aspiring game developers, visual artists, and curious students wanting hands-on exposure to modern creative technology.
            </p>
          </div>

          {/* Confirmed Sessions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {CONFIRMED_WORKSHOPS.map((workshop) => (
              <div
                key={workshop.id}
                className="rounded-2xl bg-[#14142B] border border-white/10 p-6 sm:p-7 flex flex-col justify-between hover:border-[#4549D8]/50 transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <span className="font-mono text-xs font-bold text-[#A78BFA] tracking-wider uppercase">
                      SESSION {workshop.num}
                    </span>

                    {workshop.duration && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] text-white/80 font-mono text-[11px] font-medium">
                        <Clock size={12} className="text-[#A78BFA]" />
                        {workshop.duration}
                      </span>
                    )}
                  </div>

                  <h3 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug mb-2 group-hover:text-[#C4B5FD] transition-colors">
                    {workshop.title}
                  </h3>

                  <div className="text-xs font-mono text-white/50 mb-3">
                    {workshop.focus}
                  </div>

                  <p className="font-body text-xs sm:text-sm text-white/70 leading-relaxed mb-6">
                    {workshop.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono text-white/60">
                  <span className="flex items-center gap-1.5 text-[#C4B5FD]">
                    <CheckCircle2 size={13} /> Confirmed Session
                  </span>
                  <span>Supernova 3.0</span>
                </div>
              </div>
            ))}
          </div>

          {/* Editable Future Sessions Announcement Card */}
          <div className="rounded-2xl bg-gradient-to-r from-[#14142B] to-[#181834] border border-dashed border-white/20 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 text-xs font-mono text-[#F59E0B] uppercase tracking-wider mb-1.5">
                <Clock size={13} />
                <span>EXPANDING SCHEDULE</span>
              </div>
              <h4 className="font-display text-xl sm:text-2xl font-bold text-white mb-2 tracking-tight">
                MORE WORKSHOPS LOADING SOON...
              </h4>
              <p className="font-body text-xs sm:text-sm text-white/65 leading-relaxed m-0">
                Additional creator masterclass titles, schedules, and instructor spotlights are currently being confirmed by the Department of Animation. Check back for timing updates or register for general event entry.
              </p>
            </div>

            <Link
              to="/register?type=visitor"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-heading font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap shrink-0"
            >
              <span>Register for Entry</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* 3. PILLAR 2: ORIGINAL IP LAUNCH (CONFIDENTIAL & CINEMATIC) */}
      <section
        id="original-ip"
        className="site-section bg-gradient-to-b from-[#0A0A16] via-[#0E0E22] to-[#080812] text-white relative overflow-hidden py-24 sm:py-32"
      >
        {/* Subtle, restrained warm amber illumination — strictly controlled */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[550px] h-[350px] bg-[#F59E0B]/[0.08] blur-[140px] pointer-events-none"
          aria-hidden="true"
        />

        <div className="site-container relative z-10">
          
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#F59E0B]/10 border border-[#F59E0B]/25 text-[#F59E0B] text-xs font-mono font-medium tracking-widest uppercase mb-4">
              <Sparkles size={13} className="text-[#F59E0B]" />
              PILLAR 02 · EXCLUSIVE FEATURE
            </div>

            <h2 className="font-display text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight uppercase leading-none mb-4">
              ORIGINAL IP LAUNCH
            </h2>

            <p className="font-heading italic text-xl sm:text-2xl text-[#F59E0B] font-medium tracking-wide mb-4">
              &ldquo;Something original. Something unexpected.&rdquo;
            </p>

            <p className="font-body text-sm sm:text-base text-white/70 leading-relaxed max-w-xl mx-auto">
              A first-time creative initiative from the Department of Animation. Discover something new at Supernova 3.0.
            </p>
          </div>

          {/* Central Cinematic Screen / Abstract Monolith */}
          <div className="max-w-4xl mx-auto rounded-3xl bg-[#101024] border border-[#F59E0B]/25 shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden">
            
            {/* The Illuminated Screen Frame */}
            <div className="aspect-[16/9] sm:aspect-[21/9] bg-gradient-to-b from-[#0D0D1E] to-[#070711] relative flex flex-col items-center justify-center p-8 sm:p-12 text-center overflow-hidden">
              
              {/* Subtle architectural grid lines */}
              <div
                className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:3rem_3rem]"
                aria-hidden="true"
              />

              {/* Minimal Illuminated Center Mark */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-b from-[#F59E0B]/15 to-transparent border border-[#F59E0B]/30 flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(245,158,11,0.15)]">
                  <Lock size={26} className="text-[#F59E0B]/80" />
                </div>

                <div className="text-[11px] font-mono tracking-[0.25em] text-[#F59E0B] uppercase font-bold mb-2">
                  CONFIDENTIAL UNTIL EVENT DAY
                </div>

                <div className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight max-w-md">
                  REVEAL ON EVENT DAY
                </div>

                <div className="font-mono text-xs text-white/50 mt-3 tracking-wider">
                  20–21 NOVEMBER 2026 · LIVE AUDITORIUM PREMIERE
                </div>
              </div>

              {/* Subtle bottom gradient glow */}
              <div
                className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[#101024] to-transparent pointer-events-none"
                aria-hidden="true"
              />
            </div>

            {/* Launch Notice & Event Information */}
            <div className="p-6 sm:p-8 bg-[#101024] border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-start gap-3">
                <Info size={16} className="text-[#F59E0B] shrink-0 mt-0.5" />
                <p className="font-body text-xs sm:text-sm text-white/60 leading-relaxed m-0 max-w-xl">
                  In accordance with department confidentiality guidelines, all project details, titles, and media materials remain strictly embargoed. Full premieres and launch announcements take place exclusively during the festival.
                </p>
              </div>

              <Link
                to="/register?type=visitor"
                className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-[#0B0B18] font-heading font-extrabold text-xs uppercase tracking-wider transition-all whitespace-nowrap shrink-0 shadow-[0_4px_20px_rgba(245,158,11,0.25)] hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Attend Event Day</span>
                <ChevronRight size={15} strokeWidth={2.5} />
              </Link>
            </div>

          </div>

        </div>
      </section>

      {/* 4. FOOTER REGISTRATION CTA */}
      <section className="py-16 bg-[#0B0B18] border-t border-white/10">
        <div className="site-container text-center max-w-2xl mx-auto">
          <h3 className="font-display text-2xl sm:text-3xl font-bold text-white mb-3">
            Join the Department of Animation at Supernova 3.0
          </h3>
          <p className="font-body text-sm text-white/65 mb-6 leading-relaxed">
            Attend confirmed creator workshops and witness the confidential Original IP Launch on 20–21 November 2026 at The National College, Basavanagudi.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/register?type=visitor"
              className="inline-flex items-center justify-center gap-2 h-11 px-7 rounded-xl bg-white text-[#0B0B18] font-heading font-bold text-xs uppercase tracking-wider hover:bg-white/90 transition-all shadow-md"
            >
              <span>Register as Visitor</span>
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/15 text-white font-heading font-medium text-xs uppercase tracking-wider transition-all"
            >
              <span>Return to Homepage</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
