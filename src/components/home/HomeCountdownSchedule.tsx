import { useState } from "react";
import { LargeCountdown } from "@/components/common/LargeCountdown";

export const HomeCountdownSchedule = () => {
  const [activeTab, setActiveTab] = useState<"day1" | "day2">("day1");

  return (
    <section id="schedule" className="section-padding bg-white" style={{ scrollMarginTop: "80px" }}>
      <div className="site-container">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-10">
          <span className="section-label">EVENT DETAILS</span>
          <h2 className="section-heading">SAVE THE DATES.</h2>

          {/* Giant "20–21" with "NOVEMBER 2026" */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 my-4">
            <span className="font-heading text-6xl sm:text-8xl font-extrabold text-[#151535] leading-none tracking-tighter">
              20–21
            </span>
            <span className="font-heading text-2xl sm:text-4xl font-bold text-[#1719C9] tracking-wider uppercase">
              NOVEMBER 2026
            </span>
          </div>

          {/* Info row: Venue, Timings, Opening ceremony */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-6 pt-6 border-t border-[#EAEAF2] text-center">
            <div className="p-3 bg-[#F8F7FC] rounded-xl border border-[#EAEAF2]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#52527A] block mb-1">
                Venue
              </span>
              <span className="text-sm font-bold text-[#151535]">
                The National College, Basavanagudi, Bengaluru – 04
              </span>
            </div>

            <div className="p-3 bg-[#F8F7FC] rounded-xl border border-[#EAEAF2]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#52527A] block mb-1">
                Timings
              </span>
              <span className="text-sm font-bold text-[#151535]">
                TBA
              </span>
            </div>

            <div className="p-3 bg-[#F8F7FC] rounded-xl border border-[#EAEAF2]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#52527A] block mb-1">
                Opening ceremony
              </span>
              <span className="text-sm font-bold text-[#151535]">
                TBA
              </span>
            </div>
          </div>
        </div>

        {/* The countdown */}
        <LargeCountdown />

        {/* Schedule Tabs */}
        <div className="max-w-3xl mx-auto bg-[#F8F7FC] rounded-2xl border border-[#EAEAF2] p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#EAEAF2] pb-4 mb-6">
            <h3 className="font-heading text-lg sm:text-xl font-bold text-[#151535]">
              Daily Schedule
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("day1")}
                className={`px-4 py-2 rounded-full font-body text-xs font-bold transition-all ${
                  activeTab === "day1"
                    ? "bg-[#1719C9] text-white shadow-sm"
                    : "bg-white text-[#52527A] hover:text-[#151535]"
                }`}
              >
                Day 1
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("day2")}
                className={`px-4 py-2 rounded-full font-body text-xs font-bold transition-all ${
                  activeTab === "day2"
                    ? "bg-[#1719C9] text-white shadow-sm"
                    : "bg-white text-[#52527A] hover:text-[#151535]"
                }`}
              >
                Day 2
              </button>
            </div>
          </div>

          {activeTab === "day1" ? (
            <div className="text-center py-6">
              <p className="font-heading text-lg font-bold text-[#151535]">
                Schedule to be announced
              </p>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="font-heading text-lg font-bold text-[#151535]">
                Schedule to be announced
              </p>
            </div>
          )}

          {/* Announcements block: "No announcements yet" */}
          <div className="mt-6 pt-6 border-t border-[#EAEAF2] text-center text-xs text-[#52527A]">
            <span className="font-bold text-[#151535] mr-1">Announcements:</span>
            No announcements yet
          </div>
        </div>
      </div>
    </section>
  );
};
