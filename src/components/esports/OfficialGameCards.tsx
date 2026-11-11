import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Monitor,
  Smartphone,
  Shield,
  Clock,
} from "lucide-react";
import { GameRulesModal } from "./GameRulesModal";
import { SITE_CONTENT } from "@/content/site";

export interface TournamentGameSpec {
  id: "valorant" | "bgmi" | "freefire";
  title: string;
  divisionLabel: string;
  platform: "PC" | "Mobile";
  logoSrc: string;
  logoAlt: string;
  description: string;
  playersPerTeam: number;
  substitutes: string;
  tournamentFormat: string;
  maps: string;
  schedule: string;
  rulesStatus: string;
  registerQuery: string;
}

/**
 * Editable tournament game specifications.
 * Strictly adheres to official event details.
 */
export const TOURNAMENT_GAMES: TournamentGameSpec[] = [
  {
    id: "valorant",
    title: "VALORANT — PC Tournament",
    divisionLabel: "PC Division",
    platform: "PC",
    logoSrc: "/assets/esports/valorant-logo.jpg",
    logoAlt: "VALORANT Official Game Artwork",
    description:
      "A tactical 5v5 character-based FPS where precision gunplay, tactical agent utility, and team strategy decide every round.",
    playersPerTeam: 5,
    substitutes: "Not allowed",
    tournamentFormat: "To be announced",
    maps: "Not announced",
    schedule: "To be announced",
    rulesStatus: "Coming soon",
    registerQuery: "/register?type=esports&game=valorant",
  },
  {
    id: "bgmi",
    title: "BGMI — Mobile Tournament",
    divisionLabel: "Mobile Division",
    platform: "Mobile",
    logoSrc: "/assets/esports/bgmi-logo.svg",
    logoAlt: "Battlegrounds Mobile India Official Logo",
    description:
      "The premier mobile battle royale championship. Squads coordinate high-tempo tactical rotations, zone positioning, and survival combat.",
    playersPerTeam: 4,
    substitutes: "Not allowed",
    tournamentFormat: "To be announced",
    maps: "Not announced",
    schedule: "To be announced",
    rulesStatus: "Coming soon",
    registerQuery: "/register?type=esports&game=bgmi",
  },
  {
    id: "freefire",
    title: "FREE FIRE — Mobile Tournament",
    divisionLabel: "Mobile Division",
    platform: "Mobile",
    logoSrc: "/assets/esports/freefire-logo.svg",
    logoAlt: "Free Fire Official Logo",
    description:
      "Fast-paced tactical survival battle royale. Squad coordination, rapid situational reflexes, and aggressive zone mastery are essential.",
    playersPerTeam: 4,
    substitutes: "Not allowed",
    tournamentFormat: "To be announced",
    maps: "Not announced",
    schedule: "To be announced",
    rulesStatus: "Coming soon",
    registerQuery: "/register?type=esports&game=freefire",
  },
];

export const OfficialGameCards: React.FC = () => {
  const [selectedGameForRules, setSelectedGameForRules] = useState<TournamentGameSpec | null>(null);
  const isRegistrationOpen = SITE_CONTENT.registrationOpen !== false;

  return (
    <div className="w-full">
      {/* 3 Balanced, Professional Game Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-stretch">
        {TOURNAMENT_GAMES.map((game) => {
          return (
            <article
              key={game.id}
              className="bg-[#0F172A] rounded-2xl border border-slate-800 hover:border-slate-700 shadow-md flex flex-col justify-between overflow-hidden transition-all duration-300"
            >
              {/* 1. Consistent, Distortion-Free Logo Container */}
              <div className="w-full h-44 sm:h-48 bg-[#090D1A] border-b border-slate-800 flex items-center justify-center p-6 relative overflow-hidden">
                {/* Platform Badge */}
                <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 text-sky-400 font-mono text-[11px] font-semibold backdrop-blur-sm">
                  {game.platform === "PC" ? <Monitor size={12} /> : <Smartphone size={12} />}
                  <span>{game.divisionLabel}</span>
                </div>

                {/* Game Title Kicker */}
                <div className="absolute top-3.5 left-3.5 z-10 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  OFFICIAL TITLE 0{game.id === "valorant" ? "1" : game.id === "bgmi" ? "2" : "3"}
                </div>

                {/* Strict object-fit: contain logo container */}
                <div className="w-full h-full flex items-center justify-center p-2">
                  <img
                    src={game.logoSrc}
                    alt={game.logoAlt}
                    className="max-h-24 sm:max-h-28 max-w-[85%] w-auto h-auto object-contain select-none"
                    style={{ objectFit: "contain" }}
                  />
                </div>
              </div>

              {/* 2. Card Content & Official Tournament Information Table */}
              <div className="p-6 flex flex-col justify-between flex-1">
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
                    {game.title}
                  </h3>

                  <p className="font-body text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
                    {game.description}
                  </p>

                  {/* Confirmed Tournament Information Table */}
                  <div className="rounded-xl bg-slate-900/80 border border-slate-800/90 overflow-hidden mb-6 text-xs">
                    <div className="px-3.5 py-2 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Tournament Information
                      </span>
                      <span className="font-mono text-[10px] text-sky-400 font-semibold">
                        Official Spec
                      </span>
                    </div>

                    <div className="divide-y divide-slate-800/80 text-[11px] sm:text-xs">
                      {/* Platform */}
                      <div className="px-3.5 py-2.5 flex items-center justify-between">
                        <span className="text-slate-400 font-medium">Platform</span>
                        <span className="font-semibold text-white font-mono">{game.platform}</span>
                      </div>

                      {/* Players per team */}
                      <div className="px-3.5 py-2.5 flex items-center justify-between">
                        <span className="text-slate-400 font-medium">Players per team</span>
                        <span className="font-semibold text-white font-mono">{game.playersPerTeam}</span>
                      </div>

                      {/* Substitutes */}
                      <div className="px-3.5 py-2.5 flex items-center justify-between">
                        <span className="text-slate-400 font-medium">Substitutes</span>
                        <span className="text-amber-300 font-mono font-medium">{game.substitutes}</span>
                      </div>

                      {/* Tournament format */}
                      <div className="px-3.5 py-2.5 flex items-center justify-between">
                        <span className="text-slate-400 font-medium">Tournament format</span>
                        <span className="text-slate-300 font-mono">{game.tournamentFormat}</span>
                      </div>

                      {/* Maps */}
                      <div className="px-3.5 py-2.5 flex items-center justify-between">
                        <span className="text-slate-400 font-medium">Maps</span>
                        <span className="text-slate-300 font-mono">{game.maps}</span>
                      </div>

                      {/* Schedule */}
                      <div className="px-3.5 py-2.5 flex items-center justify-between">
                        <span className="text-slate-400 font-medium">Schedule</span>
                        <span className="text-slate-300 font-mono">{game.schedule}</span>
                      </div>

                      {/* Rules */}
                      <div className="px-3.5 py-2.5 flex items-center justify-between bg-slate-950/30">
                        <span className="text-slate-400 font-medium">Rules</span>
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-sky-400 bg-sky-950/60 border border-sky-800/60 px-2 py-0.5 rounded">
                          <Clock size={10} />
                          {game.rulesStatus}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rules Notice Box */}
                  <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80 mb-6 flex items-start gap-2.5">
                    <Shield size={16} className="text-sky-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-mono text-[11px] font-bold text-white uppercase tracking-wider mb-1">
                        OFFICIAL TOURNAMENT RULEBOOK
                      </h4>
                      <p className="font-body text-xs text-slate-300 leading-relaxed">
                        The official tournament rules and regulations are currently under discussion. The complete rulebook and additional tournament information will be announced soon.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Card Action Center */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  {isRegistrationOpen ? (
                    <Link
                      to={game.registerQuery}
                      className="w-full sm:flex-1 h-11 rounded-xl bg-[#2563EB] hover:bg-blue-600 text-white font-body font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors shadow-sm active:scale-[0.98]"
                    >
                      <span>REGISTER SQUAD</span>
                      <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="w-full sm:flex-1 h-11 rounded-xl bg-slate-800 text-slate-400 font-body font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-not-allowed"
                    >
                      <Clock size={14} />
                      <span>REGISTRATION OPENING SOON</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedGameForRules(game)}
                    className="w-full sm:w-auto h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 font-body font-medium text-xs tracking-wide transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    aria-label={`View official rulebook notice for ${game.title}`}
                  >
                    <BookOpen size={13} className="text-sky-400" />
                    <span>RULEBOOK STATUS</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Official Rulebook Status Modal */}
      {selectedGameForRules && (
        <GameRulesModal
          game={selectedGameForRules}
          isOpen={true}
          onClose={() => setSelectedGameForRules(null)}
        />
      )}
    </div>
  );
};
