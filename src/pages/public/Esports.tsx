import { Link } from "react-router-dom";
import { 
  Gamepad2, 
  Trophy, 
  ShieldCheck, 
  Users, 
  ArrowRight, 
  Calendar, 
  MapPin, 
  Swords, 
  CheckCircle2, 
  Radio
} from "lucide-react";

import { OfficialGameCards } from "@/components/esports/OfficialGameCards";

export default function Esports() {
  const tournamentCards = [
    {
      title: "Championship Titles",
      badge: "THREE OFFICIAL TITLES",
      icon: Gamepad2,
      desc: "Three official tournament titles headline Supernova Esports 2.0: VALORANT (PC), BGMI (Mobile), and FREE FIRE MAX (Mobile). Team registrations are now open for collegiate squads across Karnataka.",
      points: [
        "VALORANT (5v5 Tactical PC Division)",
        "BGMI (Battle Royale Mobile Division)",
        "FREE FIRE MAX (Survival Mobile Division)",
        "Official match fixtures to be published by the committee",
      ],
      color: "#4549D8",
    },
    {
      title: "Tournament Format",
      badge: "STAGE CHAMPIONSHIP",
      icon: Trophy,
      desc: "Structured preliminary qualifiers leading to the live stage championship finals at The National College campus with student spectator broadcast.",
      points: [
        "Preliminary qualification rounds",
        "Championship stage finals",
        "Live student caster commentary",
        "Detailed match schedule to be announced",
      ],
      color: "#FF873D",
    },
    {
      title: "Eligibility Criteria",
      badge: "STUDENT ACCREDITED",
      icon: Users,
      desc: "Open to full-time enrolled students from recognized schools, pre-university colleges, and degree institutions across Karnataka.",
      points: [
        "Enrolled students in Karnataka institutions",
        "Valid institutional student ID card required",
        "Verified squad roster details",
        "Official captain contact required",
      ],
      color: "#D5F542",
    },
    {
      title: "Rules & Fair Play",
      badge: "COMPETITIVE CODE",
      icon: ShieldCheck,
      desc: "Strict fair play standards and tournament conduct codes. Match protocols and title-specific rulebooks will be published prior to match play.",
      points: [
        "Strict anti-cheat enforcement policy",
        "Zero tolerance for toxicity or unsportsmanlike behavior",
        "Mandatory check-in punctuality",
        "Official rulebook coming soon",
      ],
      color: "#A9D9F4",
    },
  ];

  return (
    <div className="bg-[#FAF9F4] text-[#191936] min-h-screen">
      {/* Hero Banner */}
      <section className="bg-[#191936] text-white py-16 sm:py-20 lg:py-24 relative overflow-clip border-b-2 border-[#191936]">
        {/* Subtle background grid floor */}
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
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D5F542] text-[#191936] font-mono text-xs font-bold uppercase tracking-wider mb-6">
              <Swords size={14} />
              EVENT ZONE 04 · ESPORTS TOURNAMENT (SECOND EDITION)
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-white mb-6">
              The battle arena returns. Assemble your squad.
            </h1>

            <p className="font-body text-base sm:text-lg text-white/80 leading-relaxed mb-8 max-w-2xl">
              Building on the energetic success of the inaugural edition, Supernova Esports 2.0 brings collegiate competitive gaming to The National College. An inter-institutional showdown celebrating teamwork, digital skill, and sportsmanship.
            </p>

            <div className="flex flex-wrap gap-4 items-center">
              <Link
                to="/register?type=esports"
                className="btn-primary"
                style={{ height: "52px", padding: "0 32px" }}
              >
                <span>REGISTER YOUR SQUAD</span>
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/schedule"
                className="btn-secondary"
                style={{
                  height: "52px",
                  padding: "0 28px",
                  background: "transparent",
                  color: "#FFFFFF",
                  borderColor: "rgba(255,255,255,0.3)",
                  boxShadow: "none",
                }}
              >
                Festival Schedule
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stat Strip */}
      <section className="bg-white border-b-2 border-[#191936]/10 py-6">
        <div className="site-container">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#4549D8]/10 text-[#4549D8] flex items-center justify-center shrink-0">
                <Calendar size={20} />
              </div>
              <div>
                <span className="block text-[11px] font-heading font-bold uppercase tracking-wider text-[#191936]/60">
                  DATES
                </span>
                <span className="font-heading font-extrabold text-sm sm:text-base text-[#191936]">
                  20–21 November 2026
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#4549D8]/10 text-[#4549D8] flex items-center justify-center shrink-0">
                <MapPin size={20} />
              </div>
              <div>
                <span className="block text-[11px] font-heading font-bold uppercase tracking-wider text-[#191936]/60">
                  VENUE
                </span>
                <span className="font-heading font-extrabold text-sm sm:text-base text-[#191936]">
                  The National College Campus
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#4549D8]/10 text-[#4549D8] flex items-center justify-center shrink-0">
                <Trophy size={20} />
              </div>
              <div>
                <span className="block text-[11px] font-heading font-bold uppercase tracking-wider text-[#191936]/60">
                  RECOGNITION
                </span>
                <span className="font-heading font-extrabold text-sm sm:text-base text-[#191936]">
                  Trophies & Certificates
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#4549D8]/10 text-[#4549D8] flex items-center justify-center shrink-0">
                <Radio size={20} />
              </div>
              <div>
                <span className="block text-[11px] font-heading font-bold uppercase tracking-wider text-[#191936]/60">
                  BROADCAST
                </span>
                <span className="font-heading font-extrabold text-sm sm:text-base text-[#191936]">
                  Live Student Commentary
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three Official Games Showcase */}
      <section className="py-14 sm:py-20 bg-[#191936] text-white border-b-2 border-[#191936] relative overflow-hidden">
        <div className="site-container relative z-10">
          <div className="max-w-3xl mb-10 sm:mb-12">
            <span className="section-label" style={{ color: "#D5F542" }}>
              COMPETITIVE ROSTER
            </span>
            <h2 className="section-heading text-white mb-3" style={{ color: "#ffffff" }}>
              Three Official Tournament Games
            </h2>
            <p className="font-body text-base sm:text-lg text-white/80 leading-relaxed">
              Supernova Esports 2.0 features three championship titles across PC and mobile divisions. Assemble your squad and register your institutional roster.
            </p>
          </div>

          <OfficialGameCards />
        </div>
      </section>

      {/* 4 Tournament Cards Section */}
      <section className="site-section bg-[#FAF9F4]">
        <div className="site-container">
          <div className="max-w-2xl mb-12">
            <span className="section-label">ARENA BRIEFING</span>
            <h2 className="section-heading mb-4 text-[#191936]">
              Tournament Guidelines & Structure
            </h2>
            <p className="font-body text-base text-[#191936]/80 leading-relaxed">
              Every detail is planned for an exciting, fair, and high-energy competition. Register your team to stay informed as bracket fixtures and game title rosters are announced.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {tournamentCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="bg-white rounded-[24px] p-6 sm:p-8 border-2 border-[#191936] shadow-[4px_4px_0px_#191936] flex flex-col justify-between hover:-translate-y-1 transition-transform"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <div className="w-12 h-12 rounded-2xl bg-[#191936] text-[#D5F542] border-2 border-[#191936] flex items-center justify-center shadow-[2px_2px_0px_#4549D8]">
                        <Icon size={24} />
                      </div>
                      <span className="px-3 py-1 rounded-full font-mono text-[11px] font-bold tracking-wider uppercase text-[#191936] bg-[#FAF9F4] border-2 border-[#191936]">
                        {card.badge}
                      </span>
                    </div>

                    <h3 className="font-display text-2xl font-extrabold text-[#191936] mb-3">
                      {card.title}
                    </h3>
                    <p className="font-body text-sm sm:text-base text-[#191936]/80 leading-relaxed mb-6">
                      {card.desc}
                    </p>

                    <div className="pt-4 border-t-2 border-[#191936]/10 flex flex-col gap-2.5">
                      {card.points.map((pt, pIdx) => (
                        <div key={pIdx} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#191936]/85">
                          <CheckCircle2 size={16} className="text-[#4549D8] shrink-0 mt-0.5" />
                          <span>{pt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Call to Action Band */}
      <section className="pb-20">
        <div className="site-container">
          <div className="bg-[#191936] text-white rounded-[28px] sm:rounded-[36px] p-8 sm:p-12 lg:p-14 border-3 sm:border-4 border-[#191936] shadow-[6px_6px_0px_#191936] text-center flex flex-col items-center">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#D5F542] mb-3">
              EARLY ROSTER REGISTRATION
            </span>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-4 max-w-xl">
              Ready to represent your institution?
            </h2>
            <p className="font-body text-sm sm:text-base text-white/80 max-w-lg mb-8 leading-relaxed">
              Register your team captain and squad members now. Tournament fixtures and schedule will be communicated directly to verified team representatives.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/register?type=esports"
                className="btn-primary"
                style={{ height: "52px", padding: "0 36px" }}
              >
                <span>REGISTER YOUR SQUAD NOW</span>
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/contact"
                className="btn-secondary"
                style={{
                  height: "52px",
                  padding: "0 28px",
                  background: "transparent",
                  color: "#FFFFFF",
                  borderColor: "rgba(255,255,255,0.3)",
                  boxShadow: "none",
                }}
              >
                Contact Helpdesk
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
