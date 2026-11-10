import React, { useState } from "react";
import { motion } from "framer-motion";
import { SITE_CONTENT } from "@/content/site";
import { LargeCountdown } from "@/components/common/LargeCountdown";

export const SaveTheDates: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"day1" | "day2">("day1");

  return (
    <section id="schedule" className="site-section bg-white" style={{ scrollMarginTop: "80px" }}>
      <div className="site-container">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center max-w-[800px] mx-auto mb-10">
          <span className="section-label">{SITE_CONTENT.saveTheDates.eyebrow}</span>
          <h2 className="section-heading mb-4">{SITE_CONTENT.saveTheDates.heading}</h2>

          {/* Giant "20–21" with "NOVEMBER 2026" */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 my-4">
            <span
              className="font-heading text-6xl sm:text-8xl font-extrabold text-[#191936] leading-none tracking-tighter"
            >
              {SITE_CONTENT.saveTheDates.giantDays}
            </span>
            <span
              className="font-heading text-2xl sm:text-4xl font-bold text-[#4549D8] tracking-wider uppercase"
            >
              {SITE_CONTENT.saveTheDates.giantMonthYear}
            </span>
          </div>

          {/* Info row: Venue, Timings, Opening ceremony */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 w-full mt-6 pt-6 border-t-2 border-[#191936]/10 text-center">
            <div className="p-5 sm:p-6 bg-[#FFFFFF] rounded-[20px] border-2 border-[#191936] shadow-[3px_3px_0px_#191936] flex flex-col justify-center">
              <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#4549D8] block mb-1.5 font-heading">
                {SITE_CONTENT.saveTheDates.venueLabel}
              </span>
              <span className="text-sm sm:text-base font-bold text-[#191936] font-body">
                {SITE_CONTENT.saveTheDates.venueValue}
              </span>
            </div>

            <div className="p-5 sm:p-6 bg-[#FFFFFF] rounded-[20px] border-2 border-[#191936] shadow-[3px_3px_0px_#191936] flex flex-col justify-center">
              <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#4549D8] block mb-1.5 font-heading">
                {SITE_CONTENT.saveTheDates.timingsLabel}
              </span>
              <span className="text-sm sm:text-base font-bold text-[#191936] font-body">
                {SITE_CONTENT.saveTheDates.timingsValue}
              </span>
            </div>

            <div className="p-5 sm:p-6 bg-[#FFFFFF] rounded-[20px] border-2 border-[#191936] shadow-[3px_3px_0px_#191936] flex flex-col justify-center">
              <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#4549D8] block mb-1.5 font-heading">
                {SITE_CONTENT.saveTheDates.openingLabel}
              </span>
              <span className="text-sm sm:text-base font-bold text-[#191936] font-body">
                {SITE_CONTENT.saveTheDates.openingValue}
              </span>
            </div>
          </div>
        </div>

        {/* Large Countdown (72px desktop, 40px mobile) */}
        <LargeCountdown />

        {/* Schedule Tabs with sliding indicator */}
        <div className="max-w-[760px] mx-auto bg-[#FAF9F4] rounded-[24px] border-2 border-[#191936] p-6 sm:p-8 shadow-[4px_4px_0px_#191936]">
          <div className="flex items-center justify-between border-b border-[#E8E8EF] pb-4 mb-6">
            <h3 className="font-heading text-lg sm:text-xl font-bold text-[#191936]">
              Daily Schedule
            </h3>

            {/* Sliding Indicator Tabs */}
            <div className="relative flex p-1 bg-white rounded-full border border-[#E8E8EF]">
              <button
                type="button"
                onClick={() => setActiveTab("day1")}
                className={`relative px-4 py-1.5 rounded-full font-body text-xs font-bold transition-colors z-10 ${
                  activeTab === "day1" ? "text-white" : "text-[#191936]/70 hover:text-[#191936]"
                }`}
              >
                {activeTab === "day1" && (
                  <motion.div
                    layoutId="schedule-tab-active"
                    className="absolute inset-0 bg-[#4549D8] rounded-full -z-10 shadow-sm"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}
                Day 1
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("day2")}
                className={`relative px-4 py-1.5 rounded-full font-body text-xs font-bold transition-colors z-10 ${
                  activeTab === "day2" ? "text-white" : "text-[#191936]/70 hover:text-[#191936]"
                }`}
              >
                {activeTab === "day2" && (
                  <motion.div
                    layoutId="schedule-tab-active"
                    className="absolute inset-0 bg-[#4549D8] rounded-full -z-10 shadow-sm"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}
                Day 2
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="text-center py-6">
            <p className="font-heading text-lg font-bold text-[#191936] m-0">
              {SITE_CONTENT.saveTheDates.scheduleTba}
            </p>
          </div>

          {/* Announcements Block */}
          <div className="mt-6 pt-6 border-t border-[#E8E8EF] text-center text-xs text-[#191936]/70">
            <span className="font-bold text-[#191936] mr-1">
              {SITE_CONTENT.saveTheDates.announcementsLabel}:
            </span>
            {SITE_CONTENT.saveTheDates.announcementsValue}
          </div>
        </div>
      </div>
    </section>
  );
};
