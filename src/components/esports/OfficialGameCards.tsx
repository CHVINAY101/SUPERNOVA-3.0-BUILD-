import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Info, Check, Smartphone, Monitor, X } from "lucide-react";
import { SITE_CONTENT, EsportsOfficialGame } from "@/content/site";

export const OfficialGameCards: React.FC = () => {
  const navigate = useNavigate();
  const [selectedGameInfo, setSelectedGameInfo] = useState<EsportsOfficialGame | null>(null);

  const games = SITE_CONTENT.esports.officialGames || [];

  return (
    <div className="w-full">
      {/* Three Visually Distinct Game Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
        {games.map((game) => {
          const isValorant = game.id === "valorant";
          const isBgmi = game.id === "bgmi";
          const isFreefire = game.id === "freefire";

          return (
            <div
              key={game.id}
              className={`group relative rounded-[24px] border-2 transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                isValorant
                  ? "bg-[#1E1724] border-[#FF4655]/40 hover:border-[#FF4655] hover:shadow-[0_14px_36px_rgba(255,70,85,0.22)] hover:-translate-y-1.5"
                  : isBgmi
                  ? "bg-[#21201A] border-[#F5A623]/40 hover:border-[#F5A623] hover:shadow-[0_14px_36px_rgba(245,166,35,0.22)] hover:-translate-y-1.5"
                  : "bg-[#251A18] border-[#FF6A00]/40 hover:border-[#FF6A00] hover:shadow-[0_14px_36px_rgba(255,106,0,0.22)] hover:-translate-y-1.5"
              }`}
            >
              {/* Card Banner with Custom Game Artwork */}
              <div className="relative h-48 sm:h-52 w-full overflow-hidden flex items-center justify-center p-6 border-b border-white/10 select-none">
                {/* Background Pattern */}
                <div
                  className="absolute inset-0 opacity-20 pointer-events-none group-hover:scale-105 transition-transform duration-500"
                  style={{
                    backgroundImage: isValorant
                      ? "radial-gradient(circle at 50% 50%, #FF4655 1px, transparent 1px)"
                      : isBgmi
                      ? "radial-gradient(circle at 50% 50%, #F5A623 1px, transparent 1px)"
                      : "radial-gradient(circle at 50% 50%, #FF873D 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                  }}
                  aria-hidden="true"
                />

                {/* Ambient Center Glow */}
                <div
                  className="absolute w-40 h-40 rounded-full blur-2xl opacity-25 group-hover:opacity-40 transition-opacity"
                  style={{
                    backgroundColor: game.accentColor,
                  }}
                  aria-hidden="true"
                />

                {/* GAME 1: VALORANT ARTWORK */}
                {isValorant && (
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <svg
                      viewBox="0 0 100 100"
                      className="w-24 h-24 drop-shadow-[0_6px_20px_rgba(255,70,85,0.5)] transform group-hover:scale-110 transition-transform duration-300"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Angular V Logo Motif */}
                      <path
                        d="M50 14L86 78H68L50 46L32 78H14L50 14Z"
                        fill="#FF4655"
                      />
                      <polygon points="50,28 62,50 38,50" fill="#FFFFFF" />
                      <circle cx="50" cy="50" r="44" stroke="#FF4655" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.4" />
                      <line x1="10" y1="50" x2="22" y2="50" stroke="#FF4655" strokeWidth="2" />
                      <line x1="78" y1="50" x2="90" y2="50" stroke="#FF4655" strokeWidth="2" />
                      <line x1="50" y1="10" x2="50" y2="22" stroke="#FF4655" strokeWidth="2" />
                      <line x1="50" y1="78" x2="50" y2="90" stroke="#FF4655" strokeWidth="2" />
                    </svg>
                    <div className="mt-2 font-mono text-[11px] font-bold tracking-[0.25em] text-[#FF4655] uppercase">
                      5V5 TACTICAL // RIOT
                    </div>
                  </div>
                )}

                {/* GAME 2: BGMI ARTWORK */}
                {isBgmi && (
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <svg
                      viewBox="0 0 100 100"
                      className="w-24 h-24 drop-shadow-[0_6px_20px_rgba(245,166,35,0.5)] transform group-hover:scale-110 transition-transform duration-300"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Level-3 Helmet Silhouette */}
                      <path
                        d="M26 48C26 34.7452 36.7452 24 50 24C63.2548 24 74 34.7452 74 48V64C74 69.5228 69.5228 74 64 74H36C30.4772 74 26 69.5228 26 64V48Z"
                        fill="#1F1D16"
                        stroke="#F5A623"
                        strokeWidth="2.5"
                      />
                      {/* Visor slit with amber reflection */}
                      <rect x="32" y="44" width="36" height="12" rx="2" fill="#F5A623" />
                      <rect x="34" y="46" width="32" height="8" rx="1" fill="#141410" />
                      <line x1="36" y1="50" x2="64" y2="50" stroke="#F5A623" strokeWidth="1.5" />
                      {/* Airdrop Box Motif */}
                      <path d="M44 68H56V78H44V68Z" fill="#F5A623" />
                      {/* Compass Crosshair */}
                      <circle cx="50" cy="50" r="44" stroke="#F5A623" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.35" />
                      <polygon points="50,14 54,20 46,20" fill="#F5A623" />
                    </svg>
                    <div className="mt-2 font-mono text-[11px] font-bold tracking-[0.22em] text-[#F5A623] uppercase">
                      BATTLE ROYALE // KRAFTON
                    </div>
                  </div>
                )}

                {/* GAME 3: FREE FIRE ARTWORK */}
                {isFreefire && (
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <svg
                      viewBox="0 0 100 100"
                      className="w-24 h-24 drop-shadow-[0_6px_20px_rgba(255,106,0,0.5)] transform group-hover:scale-110 transition-transform duration-300"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {/* Flame Crest & Speed Wings */}
                      <path
                        d="M50 16C50 16 64 34 64 48C64 62 50 78 50 78C50 78 36 62 36 48C36 34 50 16 50 16Z"
                        fill="#FF6A00"
                      />
                      <path
                        d="M50 32C50 32 58 44 58 54C58 64 50 72 50 72C50 72 42 64 42 54C42 44 50 32 50 32Z"
                        fill="#FFAE00"
                      />
                      <path
                        d="M50 48C50 48 54 56 54 62C54 68 50 72 50 72C50 72 46 68 46 62C46 56 50 48 50 48Z"
                        fill="#FFFFFF"
                      />
                      {/* Speed Wings */}
                      <path d="M22 42L36 48L24 56L16 48L22 42Z" fill="#FF873D" opacity="0.8" />
                      <path d="M78 42L64 48L76 56L84 48L78 42Z" fill="#FF873D" opacity="0.8" />
                      {/* Outer Ring */}
                      <circle cx="50" cy="50" r="44" stroke="#FF6A00" strokeWidth="1.5" strokeDasharray="4 6" opacity="0.4" />
                    </svg>
                    <div className="mt-2 font-mono text-[11px] font-bold tracking-[0.25em] text-[#FF873D] uppercase">
                      MAX SURVIVAL // GARENA
                    </div>
                  </div>
                )}

                {/* Platform Tag in Corner */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white font-mono text-[11px] font-semibold">
                  {game.platform === "PC" ? <Monitor size={12} /> : <Smartphone size={12} />}
                  <span>{game.platform}</span>
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
                    <span className="font-heading text-xs font-semibold uppercase tracking-wider text-white/70">
                      {game.genre}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-display text-2xl font-extrabold text-white tracking-tight mb-3">
                    {game.title}
                  </h3>

                  {/* Description */}
                  <p className="font-body text-sm text-white/80 leading-relaxed mb-4">
                    {game.description}
                  </p>

                  {/* Notice Badge */}
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70 mb-6 font-body flex items-start gap-2">
                    <Info size={14} className="shrink-0 mt-0.5 text-white/50" />
                    <span>{game.rulesNotice}</span>
                  </div>
                </div>

                {/* Card Actions */}
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
                    onClick={() => setSelectedGameInfo(game)}
                    className="w-full sm:w-auto h-11 px-4 rounded-full bg-white/10 border border-white/20 text-white font-heading font-bold text-xs uppercase tracking-wider hover:bg-white/20 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    aria-label={`Tournament info for ${game.title}`}
                  >
                    <Info size={13} />
                    <span>INFO</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tournament Information Modal */}
      {selectedGameInfo && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn"
        >
          <div className="bg-[#191936] border-2 border-white/20 rounded-[24px] max-w-lg w-full p-6 sm:p-8 text-white relative shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <button
              type="button"
              onClick={() => setSelectedGameInfo(null)}
              className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <span
                className="px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider border"
                style={{
                  backgroundColor: `${selectedGameInfo.accentColor}20`,
                  color: selectedGameInfo.accentColor,
                  borderColor: `${selectedGameInfo.accentColor}50`,
                }}
              >
                {selectedGameInfo.badge}
              </span>
              <span className="font-mono text-xs text-white/60">
                {selectedGameInfo.platform} Division
              </span>
            </div>

            <h3 className="font-display text-2xl sm:text-3xl font-extrabold mb-3">
              {selectedGameInfo.title}
            </h3>

            <p className="font-body text-sm sm:text-base text-white/80 leading-relaxed mb-5">
              {selectedGameInfo.description}
            </p>

            <div className="space-y-3 p-4 rounded-xl bg-white/5 border border-white/10 text-xs sm:text-sm text-white/85 mb-6 font-body">
              <div className="flex items-start gap-2">
                <Check size={16} className="text-[#D5F542] shrink-0 mt-0.5" />
                <span>Open to verified student rosters from institutions across Karnataka.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check size={16} className="text-[#D5F542] shrink-0 mt-0.5" />
                <span>Valid student ID card required for each registered squad member.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check size={16} className="text-[#D5F542] shrink-0 mt-0.5" />
                <span>{selectedGameInfo.rulesNotice}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const target = selectedGameInfo.registerQuery;
                  setSelectedGameInfo(null);
                  navigate(target);
                }}
                className="btn-primary flex-1 text-center"
                style={{ height: "48px" }}
              >
                <span>PROCEED TO SQUAD REGISTRATION</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
