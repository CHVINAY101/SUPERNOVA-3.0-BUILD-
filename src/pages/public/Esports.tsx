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
      desc: "Three official tournament titles headline Supernova Esports 2.0: VALORANT (PC), BGMI (Mobile), and FREE FIRE (Mobile). Team registrations are open for collegiate squads across Karnataka.",
      points: [
        "VALORANT — PC Tournament (5 Players/Team)",
        "BGMI — Mobile Tournament (4 Players/Team)",
        "FREE FIRE — Mobile Tournament (4 Players/Team)",
        "Substitutes: Not allowed across all titles",
      ],
      color: "#4549D8",
    },
    {
      title: "Tournament Format",
      badge: "STAGE CHAMPIONSHIP",
      icon: Trophy,
      desc: "Structured preliminary qualifiers leading to the live stage championship finals at The National College campus with student spectator broadcast.",
      points: [
        "Tournament format: To be announced",
        "Official maps: Not announced",
        "Match schedule: To be announced",
        "Live student caster commentary",
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
      title: "Rules & Regulations",
      badge: "RULES COMING SOON",
      icon: ShieldCheck,
      desc: "The official tournament rules and regulations are currently under discussion. The complete rulebook and additional tournament information will be announced soon.",
      points: [
        "Official tournament rulebook under discussion",
        "Complete rulebook to be announced soon",
        "Zero tolerance for emulators or hacks",
        "Rules status: Coming soon",
      ],
      color: "#A9D9F4",
    },
  ];

  return (
    <div className="bg-[#FAF9F4] text-[#0F172A] min-h-screen">
      {/* Hero Banner */}
      <section className="bg-[#0B1120] text-slate-100 py-16 sm:py-20 lg:py-24 relative overflow-clip border-b border-slate-800/80">
        {/* Subtle background grid */}
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
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-sky-950/60 text-sky-400 font-mono text-xs font-semibold tracking-wider border border-sky-800/60 mb-5">
              <Swords size={13} />
              <span>COLLEGIATE ESPORTS · SECOND EDITION</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-white mb-2">
              ESPORTS ARENA
            </h1>

            <p className="font-display text-xl sm:text-2xl font-semibold text-sky-300 tracking-wide mb-4">
              &ldquo;Compete. Connect. Conquer.&rdquo;
            </p>

            <p className="font-body text-base sm:text-lg text-slate-300 leading-relaxed mb-8 max-w-2xl">
              Building on the energetic success of the inaugural edition, Supernova Esports 2.0 brings collegiate competitive gaming to The National College. An inter-institutional showdown celebrating teamwork, digital skill, and sportsmanship.
            </p>

            <div className="flex flex-wrap gap-4 items-center">
              <Link
                to="/register?type=esports"
                className="btn-primary"
              >
                <span>REGISTER YOUR SQUAD</span>
                <ArrowRight size={15} />
              </Link>
              <Link
                to="/schedule"
                className="btn-secondary"
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
      <section className="py-14 sm:py-20 bg-[#0B1120] text-slate-100 border-b border-slate-800/80 relative overflow-hidden">
        <div className="site-container relative z-10">
          <div className="max-w-3xl mb-10 sm:mb-12">
            <span className="section-label">
              COMPETITIVE ROSTER
            </span>
            <h2 className="section-heading text-white mb-3">
              Three Official Tournament Games
            </h2>
            <p className="font-body text-base text-slate-300 leading-relaxed">
              Supernova Esports 2.0 features three championship titles across PC and mobile divisions. Assemble your squad and register your institutional roster.
            </p>
          </div>

          <OfficialGameCards />
        </div>
      </section>

      {/* 4 Tournament Cards Section */}
      <section className="site-section bg-[#F8FAFC]">
        <div className="site-container">
          <div className="max-w-2xl mb-12">
            <span className="section-label text-sky-600">ARENA BRIEFING</span>
            <h2 className="section-heading mb-3 text-slate-900">
              Tournament Guidelines & Structure
            </h2>
            <p className="font-body text-base text-slate-600 leading-relaxed">
              Every detail is planned for an exciting, fair, and high-energy competition. Register your team to stay informed as bracket fixtures and game title rosters are announced.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {tournamentCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-blue-200 hover:shadow-md transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-5">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-sky-400 flex items-center justify-center">
                        <Icon size={20} />
                      </div>
                      <span className="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 uppercase tracking-wide">
                        {card.badge}
                      </span>
                    </div>

                    <h3 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mb-2">
                      {card.title}
                    </h3>
                    <p className="font-body text-sm text-slate-600 leading-relaxed mb-6">
                      {card.desc}
                    </p>

                    <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
                      {card.points.map((pt, pIdx) => (
                        <div key={pIdx} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700">
                          <CheckCircle2 size={15} className="text-sky-600 shrink-0 mt-0.5" />
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
          <div className="bg-[#0B1120] text-white rounded-2xl p-8 sm:p-12 border border-slate-800 text-center flex flex-col items-center shadow-lg">
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-sky-400 mb-2">
              EARLY ROSTER REGISTRATION
            </span>
            <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-white mb-3 max-w-xl">
              Ready to represent your institution?
            </h2>
            <p className="font-body text-sm text-slate-300 max-w-lg mb-8 leading-relaxed">
              Register your team captain and squad members now. Tournament fixtures and schedule will be communicated directly to verified team representatives.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/register?type=esports"
                className="btn-primary"
              >
                <span>REGISTER YOUR SQUAD NOW</span>
                <ArrowRight size={15} />
              </Link>
              <Link
                to="/contact"
                className="btn-secondary"
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
