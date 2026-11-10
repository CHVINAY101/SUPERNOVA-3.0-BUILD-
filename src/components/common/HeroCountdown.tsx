import React from "react";
import { Link } from "react-router-dom";
import { useCountdown } from "@/hooks/useCountdown";
import { RollingNumeral } from "./RollingNumeral";

export const HeroCountdown: React.FC = () => {
  const { state, days, hours, mins, secs, liveDay, accessibleText } = useCountdown();

  return (
    <div
      role="timer"
      aria-live="off"
      className="flex flex-col items-center justify-center text-center mt-3 select-none"
    >
      {/* Visually hidden screen reader text */}
      <span className="sr-only">{accessibleText}</span>

      {state === "BEFORE" && (
        <>
          <span
            className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#52527A] mb-1 block font-body"
          >
            EVENT STARTS IN
          </span>

          <div className="inline-flex items-center justify-center gap-2 sm:gap-3">
            {/* Days */}
            <div className="flex flex-col items-center min-w-[48px] sm:min-w-[54px]">
              <span className="font-heading font-bold text-[30px] sm:text-[36px] text-[#151535] leading-tight">
                <RollingNumeral value={days} color="#151535" />
              </span>
              <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.12em] uppercase text-[#52527A] font-body mt-0.5">
                DAYS
              </span>
            </div>

            <div className="w-[1px] h-6 bg-[#EAEAF2]" />

            {/* Hours */}
            <div className="flex flex-col items-center min-w-[48px] sm:min-w-[54px]">
              <span className="font-heading font-bold text-[30px] sm:text-[36px] text-[#151535] leading-tight">
                <RollingNumeral value={hours} color="#151535" />
              </span>
              <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.12em] uppercase text-[#52527A] font-body mt-0.5">
                HOURS
              </span>
            </div>

            <div className="w-[1px] h-6 bg-[#EAEAF2]" />

            {/* Mins */}
            <div className="flex flex-col items-center min-w-[48px] sm:min-w-[54px]">
              <span className="font-heading font-bold text-[30px] sm:text-[36px] text-[#151535] leading-tight">
                <RollingNumeral value={mins} color="#151535" />
              </span>
              <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.12em] uppercase text-[#52527A] font-body mt-0.5">
                MINS
              </span>
            </div>

            <div className="w-[1px] h-6 bg-[#EAEAF2]" />

            {/* Secs (Magenta) */}
            <div className="flex flex-col items-center min-w-[48px] sm:min-w-[54px]">
              <span className="font-heading font-bold text-[30px] sm:text-[36px] text-[#E6007A] leading-tight">
                <RollingNumeral value={secs} color="#E6007A" />
              </span>
              <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.12em] uppercase text-[#E6007A] font-body mt-0.5">
                SECS
              </span>
            </div>
          </div>
        </>
      )}

      {state === "LIVE" && (
        <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-[#151535] text-white shadow-sm mt-1">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C8F500] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#C8F500]"></span>
          </span>
          <span className="font-heading text-sm sm:text-base font-bold tracking-wider uppercase text-white">
            HAPPENING NOW · <span className="text-[#C8F500]">{liveDay}</span>
          </span>
        </div>
      )}

      {state === "AFTER" && (
        <div className="flex flex-col items-center gap-1.5 mt-1">
          <span className="font-heading text-sm sm:text-base font-bold text-[#151535] uppercase tracking-wide">
            THANK YOU FOR BEING PART OF SUPERNOVA 3.0
          </span>
          <Link
            to="/gallery"
            className="text-xs sm:text-sm font-semibold text-[#1719C9] underline hover:text-[#E6007A] transition-colors"
          >
            View gallery →
          </Link>
        </div>
      )}
    </div>
  );
};
