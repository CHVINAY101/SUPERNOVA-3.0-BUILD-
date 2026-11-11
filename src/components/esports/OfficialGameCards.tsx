import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  CheckCircle,
  AlertOctagon,
  Monitor,
  Smartphone,
  Trophy,
  Users,
  Shield,
  Layers,
} from "lucide-react";
import { GameRulesModal } from "./GameRulesModal";

export interface OfficialGameCardSpec {
  id: "valorant" | "bgmi" | "freefire";
  title: string;
  shortTitle: string;
  publisher: string;
  category: string;
  platform: "PC" | "Mobile";
  logoSrc: string;
  logoAlt: string;
  accentColor: string;
  description: string;
  teamSize: string;
  format: string;
  mapPool: string;
  scoring: string;
  registerQuery: string;
  allowedRules: string[];
  prohibitedRules: string[];
}

export const OFFICIAL_GAMES_LIST: OfficialGameCardSpec[] = [
  {
    id: "valorant",
    title: "VALORANT",
    shortTitle: "VALORANT",
    publisher: "Riot Games",
    category: "5v5 Tactical FPS (PC)",
    platform: "PC",
    logoSrc: "/assets/esports/valorant-logo.jpg",
    logoAlt: "VALORANT Official Riot Games Logo",
    accentColor: "#38BDF8",
    description:
      "A 5v5 character-based tactical shooter where precision gunplay, tactical agent utility, and team strategy decide every round.",
    teamSize: "5 Main Players + 1 Substitute",
    format: "Knockout Qualifiers → Double-Elimination Finals",
    mapPool: "Ascent, Bind, Haven, Sunset, Lotus",
    scoring: "Standard MR12 (First to 13 rounds, 2-round overtime)",
    registerQuery: "/register?type=esports&game=valorant",
    allowedRules: [
      "Official Riot Games client with active Riot Vanguard anti-cheat.",
      "Player-owned wired mouse, standard mechanical keyboard, and 3.5mm/USB wired headset.",
      "Custom in-game sensitivity, crosshairs, audio mix, and keybinds configured via native settings.",
    ],
    prohibitedRules: [
      "Zero tolerance for aimbots, triggerbots, wallhacks, radar hacks, and recoil scripts.",
      "No mouse onboard macros, automated keystroke scripts, or memory-tampering utilities.",
      "No exploit abuse (intentional geometry glitching, one-way collision bugs, animation cancels).",
      "No ringer accounts or unauthorized substitutions during an active match series.",
    ],
  },
  {
    id: "bgmi",
    title: "BATTLEGROUNDS MOBILE INDIA",
    shortTitle: "BGMI",
    publisher: "KRAFTON",
    category: "Squad Battle Royale (Mobile)",
    platform: "Mobile",
    logoSrc: "/assets/esports/bgmi-logo.svg",
    logoAlt: "BATTLEGROUNDS MOBILE INDIA - KRAFTON Official Logo",
    accentColor: "#38BDF8",
    description:
      "The premier mobile battle royale championship. Squads coordinate high-tempo tactical rotations, zone positioning, and survival combat.",
    teamSize: "4 Squad Members + 1 Substitute",
    format: "Multi-Lobby Qualifiers → Championship Grand Finale",
    mapPool: "Erangel (Day), Miramar, Sanhok",
    scoring: "Official 10-Point Scoring Matrix (1 pt/finish + 10 pts for WWCD)",
    registerQuery: "/register?type=esports&game=bgmi",
    allowedRules: [
      "Official BGMI client downloaded directly from Google Play Store or Apple App Store.",
      "Competition exclusively on native smartphone or tablet touchscreen (fabric finger sleeves allowed).",
      "Native in-game HUD layout, gyroscope settings, sensitivity, and graphic customizations.",
    ],
    prohibitedRules: [
      "Strict ban on PC emulators (BlueStacks, Gameloop, LDPlayer, Nox strictly prohibited).",
      "No hardware trigger clips, gamepad attachments, cooler buttons, or OTG controllers.",
      "No modified APKs, rooted Android devices (Magisk/Xposed), or jailbroken iOS environments.",
      "No lobby collusion, cross-team communication, or intentional match-fixing.",
    ],
  },
  {
    id: "freefire",
    title: "FREE FIRE MAX",
    shortTitle: "FREE FIRE",
    publisher: "Garena",
    category: "Fast-Paced Battle Royale (Mobile)",
    platform: "Mobile",
    logoSrc: "/assets/esports/freefire-logo.svg",
    logoAlt: "FREE FIRE Official Garena Logo",
    accentColor: "#38BDF8",
    description:
      "Fast-paced tactical survival battle royale. Squad coordination, rapid situational reflexes, and aggressive zone mastery are essential.",
    teamSize: "4 Squad Members + 1 Substitute",
    format: "High-Cadence Elimination Lobbies → Stage Finals",
    mapPool: "Bermuda, Purgatory, Kalahari",
    scoring: "Official 12-Point System (1 pt/kill + placement ladder points)",
    registerQuery: "/register?type=esports&game=freefire",
    allowedRules: [
      "Official Free Fire Max application installed via Google Play Store or Apple App Store.",
      "Physical mobile touchscreen control only on personal smartphones or tablets.",
      "In-game HUD customization, custom sensitivity, and native display preferences.",
    ],
    prohibitedRules: [
      "Strict prohibition of PC emulator gameplay (zero emulator lobbies permitted).",
      "No third-party headshot aim-assist, speed modifiers, or config (.ini) file modifications.",
      "No mechanical clip-on buttons, controller peripherals, or external key-mappers.",
      "No toxicity, unsportsmanlike behavior, or teaming in tournament lobbies.",
    ],
  },
];

export const OfficialGameCards: React.FC = () => {
  const [selectedRulesGame, setSelectedRulesGame] = useState<"valorant" | "bgmi" | "freefire" | null>(null);
  const [expandedRules, setExpandedRules] = useState<Record<string, boolean>>({
    valorant: false,
    bgmi: false,
    freefire: false,
  });

  const toggleRules = (id: string) => {
    setExpandedRules((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="w-full">
      {/* 3 Balanced, Modern Game Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start">
        {OFFICIAL_GAMES_LIST.map((game) => {
          const isExpanded = expandedRules[game.id];

          return (
            <div
              key={game.id}
              className="group relative rounded-2xl bg-[#0F172A] border border-slate-800/80 hover:border-slate-700 flex flex-col justify-between overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/40"
            >
              {/* Top Banner with Official Brand Logo */}
              <div className="relative h-44 sm:h-48 w-full bg-[#0B1120] border-b border-slate-800/80 flex flex-col items-center justify-center p-6 select-none overflow-hidden">
                {/* Subtle Ambient Blueprint Grid */}
                <div
                  className="absolute inset-0 opacity-[0.07] pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, #38BDF8 1px, transparent 1px), linear-gradient(to bottom, #38BDF8 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                  }}
                  aria-hidden="true"
                />

                {/* Platform Tag */}
                <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-800 text-slate-300 font-mono text-[11px] font-medium backdrop-blur-sm">
                  {game.platform === "PC" ? <Monitor size={12} className="text-sky-400" /> : <Smartphone size={12} className="text-sky-400" />}
                  <span>{game.platform} LAN</span>
                </div>

                {/* Publisher Division Kicker */}
                <div className="absolute top-3.5 left-3.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  {game.publisher}
                </div>

                {/* Official Game Logo Asset */}
                <div className="relative z-10 flex items-center justify-center w-full h-full max-h-32 px-4">
                  <img
                    src={game.logoSrc}
                    alt={game.logoAlt}
                    className="max-h-24 sm:max-h-28 w-auto max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 flex flex-col justify-between flex-1">
                <div>
                  {/* Category & Title */}
                  <div className="flex items-center gap-2 mb-2 text-xs font-mono text-slate-400">
                    <span className="text-sky-400 font-semibold">{game.category}</span>
                  </div>

                  <h3 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">
                    {game.title}
                  </h3>

                  <p className="font-body text-sm text-slate-300 leading-relaxed mb-5">
                    {game.description}
                  </p>

                  {/* Key Match Parameters Strip */}
                  <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3.5 space-y-2 mb-5 text-xs font-body">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                        <Users size={13} className="text-sky-400" /> Roster
                      </span>
                      <span className="font-semibold text-white">{game.teamSize}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                        <Trophy size={13} className="text-sky-400" /> Format
                      </span>
                      <span className="text-slate-200 text-right text-[11px]">{game.format}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                        <Layers size={13} className="text-sky-400" /> Maps
                      </span>
                      <span className="text-slate-300 font-mono text-[11px] truncate max-w-[170px]" title={game.mapPool}>
                        {game.mapPool}
                      </span>
                    </div>
                  </div>

                  {/* Expandable Rules & Regulations Section */}
                  <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleRules(game.id)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/40 transition-colors"
                      aria-expanded={isExpanded}
                    >
                      <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-sky-400 uppercase tracking-wide">
                        <Shield size={13} />
                        Rules & Regulations
                      </span>
                      <ChevronDown
                        size={14}
                        className={`text-slate-400 transition-transform duration-200 ${
                          isExpanded ? "rotate-180 text-sky-400" : ""
                        }`}
                      />
                    </button>

                    {/* Smooth Expandable Drawer */}
                    {isExpanded && (
                      <div className="px-3.5 pb-4 pt-1 space-y-3.5 border-t border-slate-800/80 text-xs text-slate-300">
                        {/* Permitted Practice */}
                        <div>
                          <span className="font-mono text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1 mb-1.5">
                            <CheckCircle size={11} /> Permitted Gameplay
                          </span>
                          <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-300">
                            {game.allowedRules.map((rule, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="text-emerald-400/80 font-bold">•</span>
                                <span>{rule}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Prohibited Practice */}
                        <div>
                          <span className="font-mono text-[10px] uppercase font-bold text-rose-400 tracking-wider flex items-center gap-1 mb-1.5">
                            <AlertOctagon size={11} /> Prohibited Practices
                          </span>
                          <ul className="space-y-1.5 text-[11px] leading-relaxed text-slate-300">
                            {game.prohibitedRules.map((rule, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="text-rose-400/80 font-bold">•</span>
                                <span>{rule}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Scoring Matrix Notice */}
                        <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
                          <strong className="text-slate-200 block mb-0.5 font-mono text-[10px] uppercase">
                            Scoring Matrix:
                          </strong>
                          {game.scoring}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions: REGISTER SQUAD + FULL RULEBOOK */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                  <Link
                    to={game.registerQuery}
                    className="w-full sm:flex-1 h-11 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-body font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-blue-900/30 active:scale-[0.98]"
                  >
                    <span>REGISTER SQUAD</span>
                    <ArrowRight size={14} />
                  </Link>

                  <button
                    type="button"
                    onClick={() => setSelectedRulesGame(game.id)}
                    className="w-full sm:w-auto h-11 px-4 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-200 font-body font-medium text-xs tracking-wide transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    aria-label={`View complete rulebook for ${game.title}`}
                  >
                    <BookOpen size={13} className="text-sky-400" />
                    <span>FULL RULEBOOK</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rules Modal for Active Game */}
      {selectedRulesGame && (
        <GameRulesModal
          gameId={selectedRulesGame}
          isOpen={true}
          onClose={() => setSelectedRulesGame(null)}
        />
      )}
    </div>
  );
};
