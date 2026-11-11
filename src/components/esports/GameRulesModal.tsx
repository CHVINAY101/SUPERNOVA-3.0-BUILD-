import React from "react";
import { X, Clock, Monitor, Smartphone, Mail } from "lucide-react";
import type { TournamentGameSpec } from "./OfficialGameCards";

interface GameRulesModalProps {
  game: TournamentGameSpec;
  isOpen: boolean;
  onClose: () => void;
}

export const GameRulesModal: React.FC<GameRulesModalProps> = ({ game, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
      className="fixed inset-0 z-[999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#0F172A] text-white border border-slate-700 rounded-2xl max-w-xl w-full flex flex-col overflow-hidden shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 bg-[#090D1A] flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-sky-400 bg-sky-950/70 border border-sky-800/60 px-2.5 py-0.5 rounded-full">
                {game.platform === "PC" ? <Monitor size={12} /> : <Smartphone size={12} />}
                <span>{game.divisionLabel}</span>
              </span>
              <span className="font-mono text-[11px] font-semibold text-amber-300 bg-amber-950/60 border border-amber-800/60 px-2.5 py-0.5 rounded-full">
                RULES COMING SOON
              </span>
            </div>

            <h2 id="rules-modal-title" className="font-display text-xl sm:text-2xl font-black text-white">
              OFFICIAL TOURNAMENT RULEBOOK
            </h2>
            <p className="font-mono text-xs text-slate-400 mt-1">
              Supernova 3.0 Esports · {game.title}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-7 space-y-6 text-sm leading-relaxed">
          {/* Official Status Statement */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-3">
            <Clock size={20} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-amber-300 mb-1">
                STATUS: RULES UNDER DISCUSSION
              </h3>
              <p className="font-body text-slate-200 text-sm leading-relaxed">
                The official tournament rules and regulations are currently under discussion. The complete rulebook and additional tournament information will be announced soon.
              </p>
            </div>
          </div>

          {/* Currently Confirmed Event Specifications */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-3">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
              Confirmed Event Parameters ({game.title})
            </h4>

            <div className="grid grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-slate-400 block font-mono text-[10px] uppercase">Platform</span>
                <strong className="text-white text-xs">{game.platform}</strong>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-slate-400 block font-mono text-[10px] uppercase">Players Per Team</span>
                <strong className="text-white text-xs">{game.playersPerTeam} Players</strong>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-slate-400 block font-mono text-[10px] uppercase">Substitutes</span>
                <strong className="text-amber-300 text-xs font-mono">{game.substitutes}</strong>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-slate-400 block font-mono text-[10px] uppercase">Maps & Fixtures</span>
                <span className="text-slate-300 text-xs font-mono">{game.maps}</span>
              </div>
            </div>
          </div>

          {/* Official Inquiries */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-sky-400" />
              <span>Questions for the Esports Organizing Committee?</span>
            </div>
            <a
              href="mailto:animationthenationalcollege@gmail.com"
              className="text-sky-400 hover:underline font-mono text-[11px] truncate max-w-[200px]"
            >
              animationthenationalcollege@gmail.com
            </a>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-[#090D1A] flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400 font-mono">
            Supernova 3.0 · The National College, Basavanagudi
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Close Notice
          </button>
        </div>
      </div>
    </div>
  );
};
