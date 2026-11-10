import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Monitor, Smartphone, Trophy, Users, CheckCircle2 } from "lucide-react";
import { GameRulesModal } from "./GameRulesModal";

export interface OfficialGameCardSpec {
  id: "valorant" | "bgmi" | "freefire";
  title: string;
  publisher: string;
  genre: string;
  category: string;
  platform: "PC" | "Mobile";
  badge: string;
  accentColor: string;
  description: string;
  teamSize: string;
  format: string;
  mapPool: string;
  scoring: string;
  statusBadge: string;
  registerQuery: string;
}

export const OFFICIAL_GAMES_LIST: OfficialGameCardSpec[] = [
  {
    id: "valorant",
    title: "VALORANT",
    publisher: "Riot Games",
    genre: "Character-Based Tactical Shooter",
    category: "5v5 Tactical FPS (PC)",
    platform: "PC",
    badge: "5V5 TACTICAL SHOOTER",
    accentColor: "#FF4655",
    description:
      "A tactical 5v5 character-based FPS where precision, teamwork, strategy and agent abilities determine victory.",
    teamSize: "5 Players + 1 Substitute",
    format: "Knockout Qualifiers → Double-Elim Finals",
    mapPool: "Ascent, Bind, Haven, Sunset",
    scoring: "Standard MR12 (Overtime rules apply)",
    statusBadge: "Brackets: Awaiting Organiser Confirmation",
    registerQuery: "/register?type=esports&game=valorant",
  },
  {
    id: "bgmi",
    title: "BATTLEGROUNDS MOBILE INDIA",
    publisher: "KRAFTON",
    genre: "Squad Battle Royale",
    category: "Squad Battle Royale (Mobile)",
    platform: "Mobile",
    badge: "SQUAD BATTLE ROYALE",
    accentColor: "#F5A623",
    description:
      "An intense mobile battle royale competition where players and squads battle through strategy, survival and teamwork.",
    teamSize: "4 Squad Members + 1 Substitute",
    format: "Multi-Lobby Qualifiers → Grand Finale",
    mapPool: "Erangel, Miramar, Sanhok",
    scoring: "Official 10-Point Scoring Matrix (1 pt/kill)",
    statusBadge: "Room IDs: Awaiting Organiser Confirmation",
    registerQuery: "/register?type=esports&game=bgmi",
  },
  {
    id: "freefire",
    title: "FREE FIRE MAX",
    publisher: "Garena",
    genre: "Survival Battle Royale",
    category: "Fast-Paced Battle Royale (Mobile)",
    platform: "Mobile",
    badge: "FAST-PACED BATTLE ROYALE",
    accentColor: "#FF6A00",
    description:
      "A fast-paced mobile battle royale experience where survival, squad coordination and tactical combat are essential.",
    teamSize: "4 Squad Members + 1 Substitute",
    format: "Fast-Tempo Elimination Lobbies",
    mapPool: "Bermuda, Purgatory, Kalahari",
    scoring: "Placement + Aggressive Finish Points",
    statusBadge: "Lobby Matrix: Awaiting Organiser Confirmation",
    registerQuery: "/register?type=esports&game=freefire",
  },
];

export const OfficialGameCards: React.FC = () => {
  const [selectedRulesGame, setSelectedRulesGame] = useState<"valorant" | "bgmi" | "freefire" | null>(null);

  return (
    <div className="w-full">
      {/* Three Visually Distinct, Complete Game Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
        {OFFICIAL_GAMES_LIST.map((game) => {
          const isValorant = game.id === "valorant";
          const isBgmi = game.id === "bgmi";
          const isFreefire = game.id === "freefire";

          return (
            <div
              key={game.id}
              className={`group relative rounded-[24px] border-2 transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                isValorant
                  ? "bg-[#1E1724] border-[#FF4655]/40 hover:border-[#FF4655] hover:shadow-[0_16px_40px_rgba(255,70,85,0.24)] hover:-translate-y-1.5"
                  : isBgmi
                  ? "bg-[#21201A] border-[#F5A623]/40 hover:border-[#F5A623] hover:shadow-[0_16px_40px_rgba(245,166,35,0.24)] hover:-translate-y-1.5"
                  : "bg-[#251A18] border-[#FF6A00]/40 hover:border-[#FF6A00] hover:shadow-[0_16px_40px_rgba(255,106,0,0.24)] hover:-translate-y-1.5"
              }`}
            >
              {/* Card Banner with Custom Official Branding Artwork */}
              <div className="relative h-52 sm:h-56 w-full overflow-hidden flex flex-col items-center justify-center p-6 border-b border-white/10 select-none">
                {/* Background Pattern */}
                <div
                  className="absolute inset-0 opacity-20 pointer-events-none group-hover:scale-105 transition-transform duration-500"
                  style={{
                    backgroundImage: isValorant
                      ? "radial-gradient(circle at 50% 50%, #FF4655 1.5px, transparent 1.5px)"
                      : isBgmi
                      ? "radial-gradient(circle at 50% 50%, #F5A623 1.5px, transparent 1.5px)"
                      : "radial-gradient(circle at 50% 50%, #FF873D 1.5px, transparent 1.5px)",
                    backgroundSize: "22px 22px",
                  }}
                  aria-hidden="true"
                />

                {/* Ambient Center Glow */}
                <div
                  className="absolute w-44 h-44 rounded-full blur-2xl opacity-25 group-hover:opacity-40 transition-opacity"
                  style={{ backgroundColor: game.accentColor }}
                  aria-hidden="true"
                />

                {/* GAME 1: VALORANT ARTWORK & OFFICIAL LOGO */}
                {isValorant && (
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <svg
                      viewBox="0 0 120 120"
                      className="w-24 h-24 drop-shadow-[0_8px_24px_rgba(255,70,85,0.6)] transform group-hover:scale-110 transition-transform duration-300"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Riot Games VALORANT Geometric V Glyph */}
                      <path d="M60 14L102 88H80L60 52L40 88H18L60 14Z" fill="#FF4655" />
                      <polygon points="60,30 74,56 46,56" fill="#FFFFFF" />
                      <circle cx="60" cy="60" r="52" stroke="#FF4655" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.35" />
                      <line x1="12" y1="60" x2="26" y2="60" stroke="#FF4655" strokeWidth="2" />
                      <line x1="94" y1="60" x2="108" y2="60" stroke="#FF4655" strokeWidth="2" />
                      <line x1="60" y1="12" x2="60" y2="26" stroke="#FF4655" strokeWidth="2" />
                      <line x1="60" y1="94" x2="60" y2="108" stroke="#FF4655" strokeWidth="2" />
                    </svg>
                    <div className="mt-2 font-display text-sm font-extrabold tracking-[0.3em] text-[#FF4655] uppercase">
                      VALORANT
                    </div>
                    <div className="font-mono text-[10px] tracking-widest text-white/60 uppercase">
                      RIOT GAMES · PC DIVISION
                    </div>
                  </div>
                )}

                {/* GAME 2: BGMI ARTWORK & OFFICIAL BRANDING */}
                {isBgmi && (
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <svg
                      viewBox="0 0 120 120"
                      className="w-24 h-24 drop-shadow-[0_8px_24px_rgba(245,166,35,0.6)] transform group-hover:scale-110 transition-transform duration-300"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Level-3 Spetsnaz Helmet Silhouette */}
                      <path
                        d="M32 54C32 38.536 44.536 26 60 26C75.464 26 88 38.536 88 54V74C88 80.6274 82.6274 86 76 86H44C37.3726 86 32 80.6274 32 74V54Z"
                        fill="#1F1D16"
                        stroke="#F5A623"
                        strokeWidth="2.5"
                      />
                      {/* Heavy Visor slit with amber reflection */}
                      <rect x="38" y="50" width="44" height="14" rx="2" fill="#F5A623" />
                      <rect x="40" y="52" width="40" height="10" rx="1" fill="#141410" />
                      <line x1="42" y1="57" x2="78" y2="57" stroke="#F5A623" strokeWidth="1.5" />
                      {/* Crosshair & Stencil Accent */}
                      <circle cx="60" cy="60" r="52" stroke="#F5A623" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.35" />
                      <polygon points="60,16 64,22 56,22" fill="#F5A623" />
                      <path d="M52 80H68V92H52V80Z" fill="#F5A623" />
                    </svg>
                    <div className="mt-2 font-display text-sm font-extrabold tracking-[0.2em] text-[#F5A623] uppercase">
                      BGMI
                    </div>
                    <div className="font-mono text-[10px] tracking-widest text-white/60 uppercase">
                      KRAFTON · MOBILE DIVISION
                    </div>
                  </div>
                )}

                {/* GAME 3: FREE FIRE ARTWORK & OFFICIAL BRANDING */}
                {isFreefire && (
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <svg
                      viewBox="0 0 120 120"
                      className="w-24 h-24 drop-shadow-[0_8px_24px_rgba(255,106,0,0.6)] transform group-hover:scale-110 transition-transform duration-300"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Iconic Free Fire Dagger / Flame Crest */}
                      <path
                        d="M60 16C60 16 76 38 76 56C76 74 60 92 60 92C60 92 44 74 44 56C44 38 60 16 60 16Z"
                        fill="#FF6A00"
                      />
                      <path
                        d="M60 34C60 34 70 48 70 60C70 72 60 82 60 82C60 82 50 72 50 60C50 48 60 34 60 34Z"
                        fill="#FFAE00"
                      />
                      <path
                        d="M60 52C60 52 64 62 64 68C64 74 60 78 60 78C60 78 56 74 56 68C56 62 60 52 60 52Z"
                        fill="#FFFFFF"
                      />
                      {/* Dynamic Speed Wings */}
                      <path d="M26 50L42 56L28 66L18 56L26 50Z" fill="#FF873D" opacity="0.85" />
                      <path d="M94 50L78 56L92 66L102 56L94 50Z" fill="#FF873D" opacity="0.85" />
                      <circle cx="60" cy="60" r="52" stroke="#FF6A00" strokeWidth="1.5" strokeDasharray="4 6" opacity="0.35" />
                    </svg>
                    <div className="mt-2 font-display text-sm font-extrabold tracking-[0.22em] text-[#FF873D] uppercase">
                      FREE FIRE MAX
                    </div>
                    <div className="font-mono text-[10px] tracking-widest text-white/60 uppercase">
                      GARENA · MOBILE DIVISION
                    </div>
                  </div>
                )}

                {/* Top Corner Platform Tag */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white font-mono text-[11px] font-semibold">
                  {game.platform === "PC" ? <Monitor size={12} /> : <Smartphone size={12} />}
                  <span>{game.platform} LAN</span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 sm:p-7 flex flex-col justify-between flex-1">
                <div>
                  {/* Category Pill */}
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border"
                      style={{
                        backgroundColor: `${game.accentColor}18`,
                        color: game.accentColor,
                        borderColor: `${game.accentColor}40`,
                      }}
                    >
                      {game.badge}
                    </span>
                    <span className="text-white/40 text-xs">•</span>
                    <span className="font-mono text-[11px] font-semibold text-white/70">
                      {game.category}
                    </span>
                  </div>

                  {/* Title & Publisher */}
                  <h3
                    className="font-display text-2xl font-black tracking-tight mb-2"
                    style={{ color: "#ffffff" }}
                  >
                    {game.title}
                  </h3>

                  {/* Exact Requested Description */}
                  <p
                    className="font-body text-sm leading-relaxed mb-5"
                    style={{ color: "rgba(255, 255, 255, 0.9)" }}
                  >
                    {game.description}
                  </p>

                  {/* Structured Tournament Information Matrix */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2.5 mb-5 text-xs font-body">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-white/60 font-mono uppercase text-[10px] flex items-center gap-1">
                        <Users size={12} /> Roster Size
                      </span>
                      <strong className="text-white text-right">{game.teamSize}</strong>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <span className="text-white/60 font-mono uppercase text-[10px] flex items-center gap-1">
                        <Trophy size={12} /> Structure
                      </span>
                      <span className="text-white/90 text-right">{game.format}</span>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <span className="text-white/60 font-mono uppercase text-[10px]">Active Maps</span>
                      <span className="text-white/90 text-right font-mono">{game.mapPool}</span>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                      <span className="text-[#D5F542] font-mono flex items-center gap-1">
                        <CheckCircle2 size={12} /> Verified Student Rosters
                      </span>
                      <span className="text-amber-300 font-mono text-[10px]">
                        Awaiting Organiser Confirmation
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions: REGISTER SQUAD + VIEW RULES */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <Link
                    to={game.registerQuery}
                    className="w-full sm:flex-1 h-11 rounded-full font-heading font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all text-[#191936] shadow-md hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      backgroundColor: game.accentColor === "#FF4655" ? "#FF4655" : game.accentColor === "#F5A623" ? "#F5A623" : "#FF873D",
                      color: game.accentColor === "#FF4655" ? "#FFFFFF" : "#191936",
                    }}
                  >
                    <span>REGISTER SQUAD</span>
                    <ArrowRight size={14} />
                  </Link>

                  <button
                    type="button"
                    onClick={() => setSelectedRulesGame(game.id)}
                    className="w-full sm:w-auto h-11 px-5 rounded-full bg-white/10 border border-white/20 text-white font-heading font-bold text-xs uppercase tracking-wider hover:bg-white/20 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    aria-label={`View rules for ${game.title}`}
                  >
                    <BookOpen size={14} className="text-[#D5F542]" />
                    <span>VIEW RULES</span>
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
