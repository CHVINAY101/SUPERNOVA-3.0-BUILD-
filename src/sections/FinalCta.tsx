import React from "react";
import { Link } from "react-router-dom";
import { SITE_CONTENT } from "../content/site";

export const FinalCta: React.FC = () => {
  const content = SITE_CONTENT.finalCta;
  const meta = SITE_CONTENT.meta;

  const handleExploreClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = document.getElementById("experiences");
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section
      id="contact"
      className="relative overflow-clip py-16 sm:py-20 lg:py-24 bg-[#4549D8] text-white"
      aria-label="Call to action"
    >
      {/* 4-color top ribbon (No pink/magenta) */}
      <div className="absolute top-0 left-0 right-0 h-1.5 flex" aria-hidden="true">
        <span className="flex-1 bg-[#191936]" />
        <span className="flex-1 bg-[#FF873D]" />
        <span className="flex-1 bg-[#D5F542]" />
        <span className="flex-1 bg-[#A9D9F4]" />
      </div>

      <div className="max-w-5xl mx-auto px-6 sm:px-8 text-center relative z-10">
        <h2 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-extrabold uppercase tracking-tight leading-[1.0] mb-6">
          <span className="block text-white">
            THE FUTURE STARTS
          </span>
          <span className="block text-[#D5F542]">
            WITH AN IDEA.
          </span>
        </h2>

        <p className="text-base sm:text-xl md:text-2xl text-white/90 max-w-2xl mx-auto font-body font-medium mb-8 sm:mb-10">
          {content.subline}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mb-10 sm:mb-12">
          <Link
            to="/register"
            className="w-full sm:w-auto h-[52px] px-8 rounded-full flex items-center justify-center text-sm sm:text-base font-heading font-extrabold uppercase tracking-wider text-[#191936] bg-[#D5F542] border-2 border-[#191936] shadow-[3.5px_3.5px_0px_#191936] hover:shadow-[2px_2px_0px_#191936] hover:translate-x-[1.5px] hover:translate-y-[1.5px] transition-all"
          >
            {content.registerButton}
          </Link>

          <a
            href="#experiences"
            onClick={handleExploreClick}
            className="w-full sm:w-auto h-[52px] px-8 rounded-full flex items-center justify-center text-sm sm:text-base font-heading font-extrabold uppercase tracking-wider text-white border-2 border-white hover:bg-white/10 transition-colors"
          >
            {content.exploreButton}
          </a>
        </div>

        {/* Contact info bar */}
        <div className="pt-8 border-t border-white/20 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-sm sm:text-base text-white/80 font-body">
          <span>
            Helpdesk:{" "}
            <a
              href={`mailto:${meta.helpdeskEmail}`}
              className="text-[#D5F542] font-semibold underline underline-offset-4 hover:text-white transition-colors"
            >
              {meta.helpdeskEmail}
            </a>
          </span>
          <span className="hidden sm:inline text-white/40">•</span>
          <span className="whitespace-nowrap">{meta.dates}</span>
          <span className="hidden sm:inline text-white/40">•</span>
          <span className="whitespace-nowrap">{meta.venue}</span>
        </div>
      </div>

      {/* 4-color bottom ribbon */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 flex" aria-hidden="true">
        <span className="flex-1 bg-[#D5F542]" />
        <span className="flex-1 bg-[#FF873D]" />
        <span className="flex-1 bg-[#A9D9F4]" />
        <span className="flex-1 bg-[#191936]" />
      </div>
    </section>
  );
};
