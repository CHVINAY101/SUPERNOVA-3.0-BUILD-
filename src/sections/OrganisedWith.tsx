import React from "react";
import { SITE_CONTENT } from "@/content/site";

export const OrganisedWith: React.FC = () => {
  return (
    <section id="organisers" className="site-section bg-[#FAF9F4] border-t-2 border-[#191936]">
      <div className="site-container">
        {/* Section Header */}
        <div className="flex flex-col items-start max-w-3xl mb-12 sm:mb-14">
          <span className="section-label">{SITE_CONTENT.organisedWith.eyebrow}</span>
          <h2 className="section-heading text-[#191936] mb-4">
            {SITE_CONTENT.organisedWith.heading}
          </h2>
          {SITE_CONTENT.organisedWith.subline ? (
            <p className="font-heading text-lg font-bold text-[#4549D8]">
              {SITE_CONTENT.organisedWith.subline}
            </p>
          ) : null}
        </div>

        {/* 6 Institutions Showcase Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto mb-10">
          {[
            { num: "01", name: "THE NATIONAL COLLEGE, BASAVANAGUDI", campus: "Basavanagudi Campus", founded: "Centenary Flagship & Event Host" },
            { num: "02", name: "NATIONAL PU COLLEGE, JAYANAGAR", campus: "Jayanagar Campus", founded: "Co-Organising Institution" },
            { num: "03", name: "NATIONAL PU COLLEGE, BASAVANAGUDI", campus: "Basavanagudi Campus", founded: "Pre-University" },
            { num: "04", name: "DR.HNCE", campus: "Jayanagar Campus", founded: "Dr. H. Narasimhaiah Campus" },
            { num: "05", name: "NATIONAL DEGREE COLLEGE, JAYANAGAR", campus: "Jayanagar Campus", founded: "Higher Education" },
            { num: "06", name: "NATIONAL HIGH SCHOOL & ENGLISH SCHOOL", campus: "Basavanagudi Campus", founded: "Secondary Excellence" },
          ].map((inst) => (
            <div
              key={inst.num}
              className="bg-white rounded-[20px] p-6 border-2 border-[#191936] shadow-[4px_4px_0px_#191936] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#191936] transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#191936] text-[#D5F542] font-mono font-bold text-xs">
                    {inst.num}
                  </span>
                  <span className="text-xs font-heading font-bold text-[#4549D8] uppercase tracking-wider">
                    {inst.campus}
                  </span>
                </div>
                <h3 className="font-heading text-lg sm:text-xl font-extrabold text-[#191936] leading-tight mb-2">
                  {inst.name}
                </h3>
              </div>
              <div className="pt-3 mt-3 border-t border-[#E8E8EF] flex items-center justify-between text-xs text-[#191936]/70 font-medium">
                <span>Bengaluru, Karnataka</span>
                <span className="font-semibold text-[#191936]">{inst.founded}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
