import React from "react";
import { Link } from "react-router-dom";
import { useCountdown } from "@/hooks/useCountdown";
import { RollingNumeral } from "./RollingNumeral";

export const LargeCountdown: React.FC = () => {
  const { state, days, hours, mins, secs, liveDay, accessibleText } = useCountdown();

  return (
    <div
      role="timer"
      aria-live="off"
      className="w-full flex flex-col items-center justify-center text-center my-8 select-none"
    >
      <span className="sr-only">{accessibleText}</span>

      {state === "BEFORE" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 max-w-3xl w-full mx-auto">
          {/* Days */}
          <div className="bg-[#FFFFFF] border-2 sm:border-3 border-[#191936] rounded-2xl p-4 sm:p-6 text-center shadow-[3px_3px_0px_#191936] sm:shadow-[4px_4px_0px_#191936] flex flex-col items-center justify-center min-h-[110px] sm:min-h-[140px]">
            <span className="font-heading text-4xl sm:text-7xl font-extrabold text-[#191936] leading-none mb-1 sm:mb-2 tabular-nums">
              <RollingNumeral value={days} color="#191936" />
            </span>
            <span className="font-heading text-[11px] sm:text-xs font-bold tracking-[0.16em] text-[#4549D8] uppercase">
              DAYS
            </span>
          </div>

          {/* Hours */}
          <div className="bg-[#FFFFFF] border-2 sm:border-3 border-[#191936] rounded-2xl p-4 sm:p-6 text-center shadow-[3px_3px_0px_#191936] sm:shadow-[4px_4px_0px_#191936] flex flex-col items-center justify-center min-h-[110px] sm:min-h-[140px]">
            <span className="font-heading text-4xl sm:text-7xl font-extrabold text-[#191936] leading-none mb-1 sm:mb-2 tabular-nums">
              <RollingNumeral value={hours} color="#191936" />
            </span>
            <span className="font-heading text-[11px] sm:text-xs font-bold tracking-[0.16em] text-[#4549D8] uppercase">
              HOURS
            </span>
          </div>

          {/* Mins */}
          <div className="bg-[#FFFFFF] border-2 sm:border-3 border-[#191936] rounded-2xl p-4 sm:p-6 text-center shadow-[3px_3px_0px_#191936] sm:shadow-[4px_4px_0px_#191936] flex flex-col items-center justify-center min-h-[110px] sm:min-h-[140px]">
            <span className="font-heading text-4xl sm:text-7xl font-extrabold text-[#191936] leading-none mb-1 sm:mb-2 tabular-nums">
              <RollingNumeral value={mins} color="#191936" />
            </span>
            <span className="font-heading text-[11px] sm:text-xs font-bold tracking-[0.16em] text-[#4549D8] uppercase">
              MINUTES
            </span>
          </div>

          {/* Secs */}
          <div className="bg-[#FFFFFF] border-2 sm:border-3 border-[#191936] rounded-2xl p-4 sm:p-6 text-center shadow-[3px_3px_0px_#191936] sm:shadow-[4px_4px_0px_#191936] flex flex-col items-center justify-center min-h-[110px] sm:min-h-[140px]">
            <span className="font-heading text-4xl sm:text-7xl font-extrabold text-[#FF873D] leading-none mb-1 sm:mb-2 tabular-nums">
              <RollingNumeral value={secs} color="#FF873D" />
            </span>
            <span className="font-heading text-[11px] sm:text-xs font-bold tracking-[0.16em] text-[#FF873D] uppercase">
              SECONDS
            </span>
          </div>
        </div>
      )}

      {state === "LIVE" && (
        <div className="bg-[#151535] text-white rounded-2xl p-8 sm:p-12 max-w-2xl w-full mx-auto border-2 border-[#191936] shadow-[4px_4px_0px_#191936] flex flex-col items-center justify-center gap-4">
          <span className="relative flex h-5 w-5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D5F542] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-5 w-5 bg-[#D5F542]"></span>
          </span>
          <h3 className="font-heading text-2xl sm:text-4xl font-bold text-white tracking-wide uppercase">
            HAPPENING NOW · <span className="text-[#D5F542]">{liveDay}</span>
          </h3>
          <p className="font-body text-sm text-[#FAF9F4]/90 max-w-md">
            Supernova 3.0 is currently live at The National College campus.
          </p>
        </div>
      )}

      {state === "AFTER" && (
        <div className="bg-[#FAF9F4] border-2 border-[#191936] rounded-2xl p-8 sm:p-12 max-w-2xl w-full mx-auto text-center flex flex-col items-center justify-center gap-4 shadow-[4px_4px_0px_#191936]">
          <h3 className="font-heading text-2xl sm:text-3xl font-bold text-[#191936] tracking-tight uppercase">
            THANK YOU FOR BEING PART OF SUPERNOVA 3.0
          </h3>
          <p className="font-body text-sm text-[#191936]/70">
            The festival has concluded. Explore memories and highlights from this edition.
          </p>
          <Link
            to="/gallery"
            className="btn-primary"
            style={{ height: 52, padding: "0 32px" }}
          >
            View gallery →
          </Link>
        </div>
      )}
    </div>
  );
};
