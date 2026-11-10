import React from "react";
import { Link } from "react-router-dom";
import { useCountdown } from "@/hooks/useCountdown";

export const HeroLiveCountdown: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { state, daysStr, hoursStr, minsStr, secsStr, liveDay, accessibleText } = useCountdown();

  return (
    <div
      role="timer"
      aria-label="Supernova 3.0 Countdown"
      className={`select-none w-full ${className}`}
    >
      <span className="sr-only">{accessibleText}</span>

      {/* Heading: THE COUNTDOWN BEGINS */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-2.5 h-2.5 rounded-full bg-[#D5F542] border border-[#191936] flex-shrink-0"
          aria-hidden="true"
        />
        <span className="font-heading text-xs sm:text-sm font-bold uppercase tracking-[0.14em] text-[#191936]">
          THE COUNTDOWN BEGINS
        </span>
      </div>

      {state === "BEFORE" && (
        <div className="grid grid-cols-4 gap-2.5 sm:gap-3 max-w-[480px] w-full">
          {/* DAYS */}
          <div className="relative bg-[#FFFFFF] border-2 border-[#191936] rounded-2xl py-3 px-2 sm:py-3.5 sm:px-2.5 text-center shadow-[3px_3px_0px_#191936] flex flex-col items-center justify-center overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#D5F542]" />
            <span
              className="font-display font-extrabold text-[30px] sm:text-[36px] text-[#191936] leading-none tracking-tight pt-1 w-full block tabular-nums text-center"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {daysStr}
            </span>
            <span className="font-heading text-[11px] sm:text-[12px] font-bold tracking-[0.14em] uppercase text-[#4549D8] mt-2 block">
              DAYS
            </span>
          </div>

          {/* HOURS */}
          <div className="relative bg-[#FFFFFF] border-2 border-[#191936] rounded-2xl py-3 px-2 sm:py-3.5 sm:px-2.5 text-center shadow-[3px_3px_0px_#191936] flex flex-col items-center justify-center overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#4549D8]" />
            <span
              className="font-display font-extrabold text-[30px] sm:text-[36px] text-[#191936] leading-none tracking-tight pt-1 w-full block tabular-nums text-center"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {hoursStr}
            </span>
            <span className="font-heading text-[11px] sm:text-[12px] font-bold tracking-[0.14em] uppercase text-[#4549D8] mt-2 block">
              HOURS
            </span>
          </div>

          {/* MINUTES */}
          <div className="relative bg-[#FFFFFF] border-2 border-[#191936] rounded-2xl py-3 px-2 sm:py-3.5 sm:px-2.5 text-center shadow-[3px_3px_0px_#191936] flex flex-col items-center justify-center overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#A9D9F4]" />
            <span
              className="font-display font-extrabold text-[30px] sm:text-[36px] text-[#191936] leading-none tracking-tight pt-1 w-full block tabular-nums text-center"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {minsStr}
            </span>
            <span className="font-heading text-[11px] sm:text-[12px] font-bold tracking-[0.14em] uppercase text-[#4549D8] mt-2 block">
              MINUTES
            </span>
          </div>

          {/* SECONDS */}
          <div className="relative bg-[#FFFFFF] border-2 border-[#191936] rounded-2xl py-3 px-2 sm:py-3.5 sm:px-2.5 text-center shadow-[3px_3px_0px_#191936] flex flex-col items-center justify-center overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#FF873D]" />
            <span
              className="font-display font-extrabold text-[30px] sm:text-[36px] text-[#191936] leading-none tracking-tight pt-1 w-full block tabular-nums text-center"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {secsStr}
            </span>
            <span className="font-heading text-[11px] sm:text-[12px] font-bold tracking-[0.14em] uppercase text-[#FF873D] mt-2 block">
              SECONDS
            </span>
          </div>
        </div>
      )}

      {state === "LIVE" && (
        <div className="space-y-3 max-w-[420px]">
          <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#191936] text-white border-2 border-[#D5F542] shadow-[3px_3px_0px_#D5F542]">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D5F542] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#D5F542]"></span>
            </span>
            <span className="font-display text-sm sm:text-base font-extrabold tracking-wide uppercase text-white">
              SUPERNOVA 3.0 IS LIVE!
            </span>
            <span className="text-xs font-heading font-bold text-[#D5F542] px-2 py-0.5 rounded-full bg-white/10">
              {liveDay}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:gap-2.5 w-full opacity-70">
            {["DAYS", "HOURS", "MINUTES", "SECONDS"].map((label) => (
              <div
                key={label}
                className="bg-[#FFFFFF] border-2 border-[#191936] rounded-xl p-2 text-center"
              >
                <span className="font-display font-bold text-xl text-[#191936]">00</span>
                <span className="block font-heading text-[9px] font-bold text-[#4549D8] mt-0.5">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {state === "AFTER" && (
        <div className="p-4 rounded-xl bg-[#FFFFFF] border-2 border-[#191936] shadow-[3px_3px_0px_#191936] max-w-[420px]">
          <span className="font-display text-base font-extrabold text-[#191936] uppercase block mb-1">
            SUPERNOVA 3.0 HAS CONCLUDED
          </span>
          <p className="text-xs text-[#191936]/80 mb-2 font-medium font-body leading-relaxed">
            Thank you to all participants, visitors, and teams for making it an extraordinary celebration.
          </p>
          <Link
            to="/gallery"
            className="inline-flex items-center gap-1 text-xs font-bold font-heading text-[#4549D8] hover:underline"
          >
            Explore event photo archive →
          </Link>
        </div>
      )}
    </div>
  );
};
