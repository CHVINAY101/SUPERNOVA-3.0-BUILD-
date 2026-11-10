import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SITE_CONTENT, ExperienceItem } from "@/content/site";
import { X, ArrowRight, Sparkles } from "lucide-react";

export const Experiences: React.FC = () => {
  const navigate = useNavigate();
  const [selectedItem, setSelectedItem] = useState<ExperienceItem | null>(null);

  // Close drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedItem(null);
    };
    if (selectedItem) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedItem]);

  return (
    <section id="experiences" className="site-section bg-[#FAF9F4]" style={{ scrollMarginTop: "80px" }}>
      <div className="site-container">
        {/* Section Header */}
        <div className="flex flex-col items-start max-w-[840px] mb-12">
          <span className="section-label">{SITE_CONTENT.experiences.eyebrow}</span>
          <h2 className="section-heading mb-4 text-[#191936]">
            {SITE_CONTENT.experiences.heading}
          </h2>
          <p className="font-body text-base sm:text-lg text-[#191936]/80 leading-relaxed">
            {SITE_CONTENT.experiences.subline ||
              "Nine flagship immersive zones designed to inspire discovery, cultivate hands-on skills, and showcase outstanding student and collegiate talent."}
          </p>
        </div>

        {/* 9 Cards in Responsive 3x3 Grid: 3 columns desktop, 2 tablet, 1 mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
          {SITE_CONTENT.experiences.items.map((item) => {
            const photoSrc = item.photoSrc || "/assets/images/photos/science-expo.jpg";

            return (
              <motion.div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.18 }}
                className="brand-card group cursor-pointer flex flex-col justify-between select-none bg-[#FFFFFF] overflow-hidden rounded-2xl border-2 border-[#191936] shadow-[4px_4px_0px_#191936] hover:shadow-[6px_6px_0px_#191936] transition-all"
                title={`Click for ${item.title} details`}
              >
                {/* 16:10 Photo Header with brand accent pill */}
                <div className="w-full aspect-[16/10] relative overflow-hidden bg-[#191936]">
                  <img
                    src={photoSrc}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#191936]/80 via-[#191936]/20 to-transparent" />

                  {/* Zone Number Badge */}
                  <span
                    className="absolute top-3 left-3 px-3 py-1 rounded-full font-mono text-xs font-bold tracking-wider uppercase text-[#191936] bg-[#FFFFFF] border-2 border-[#191936] shadow-sm"
                  >
                    ZONE {item.num}
                  </span>

                  {/* Zone Accent Chip */}
                  <span
                    className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md font-mono text-[11px] font-bold tracking-wide uppercase text-[#191936] border border-[#191936]/20 shadow-sm flex items-center gap-1"
                    style={{ backgroundColor: item.color }}
                  >
                    <Sparkles size={11} className="text-[#191936]" />
                    {item.title}
                  </span>
                </div>

                {/* Card Content */}
                <div className="p-6 flex flex-col flex-1 bg-[#FFFFFF] justify-between">
                  <div>
                    {item.heading && (
                      <div className="font-mono text-xs uppercase tracking-wider font-bold text-[#4549D8] mb-1.5">
                        {item.heading}
                      </div>
                    )}
                    <h3 className="font-display text-xl sm:text-2xl font-extrabold text-[#191936] leading-snug mb-3 group-hover:text-[#4549D8] transition-colors">
                      {item.title}
                    </h3>
                    <p className="font-body text-sm text-[#191936]/75 leading-relaxed m-0 line-clamp-3">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-[#E8E8EF] flex items-center justify-between text-xs font-bold text-[#191936] group-hover:text-[#4549D8] transition-colors">
                    <span className="font-mono uppercase tracking-wider">Explore Zone</span>
                    <ArrowRight size={16} className="transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Detail Drawer Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#FFFFFF] w-full max-w-lg h-full shadow-2xl p-6 sm:p-8 flex flex-col justify-between overflow-y-auto border-l-2 border-[#191936]"
              role="dialog"
              aria-modal="true"
              aria-label={selectedItem.title}
            >
              <div>
                {/* Drawer Header */}
                <div className="flex items-center justify-between pb-4 border-b border-[#E8E8EF] mb-6">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-3 py-1 rounded-full font-mono text-xs font-bold text-[#191936] border-2 border-[#191936]"
                      style={{ backgroundColor: selectedItem.color }}
                    >
                      ZONE {selectedItem.num}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#191936]/70 uppercase tracking-wider">
                      SUPERNOVA 3.0
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="w-10 h-10 rounded-full bg-[#FAF9F4] hover:bg-[#E8E8EF] flex items-center justify-center border-2 border-[#191936] cursor-pointer text-[#191936] transition-colors"
                    aria-label="Close drawer"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Drawer Image Banner with Real Photo */}
                <div className="w-full aspect-[16/10] rounded-xl overflow-hidden mb-6 border-2 border-[#191936] shadow-[4px_4px_0px_#191936]">
                  <img
                    src={selectedItem.photoSrc || "/assets/images/photos/science-expo.jpg"}
                    alt={selectedItem.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {selectedItem.heading && (
                  <div className="font-mono text-xs uppercase tracking-wider font-bold text-[#4549D8] mb-2">
                    {selectedItem.heading}
                  </div>
                )}
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-[#191936] mb-3 leading-tight">
                  {selectedItem.title}
                </h3>
                <p className="font-body text-base text-[#191936]/80 leading-relaxed mb-6">
                  {selectedItem.description}
                </p>

                {/* Details Grid */}
                <div className="flex flex-col gap-4 p-5 rounded-xl bg-[#FAF9F4] border-2 border-[#191936] text-sm font-body mb-6">
                  <div>
                    <span className="font-bold text-[#191936] block font-mono text-xs uppercase tracking-wider mb-1">
                      What to expect:
                    </span>
                    <span className="text-[#191936]/80 leading-relaxed">{selectedItem.whatToExpect}</span>
                  </div>
                  <div className="pt-3 border-t border-[#E8E8EF]">
                    <span className="font-bold text-[#191936] block font-mono text-xs uppercase tracking-wider mb-1">
                      Location & Pavilion:
                    </span>
                    <span className="text-[#191936]/80 leading-relaxed">{selectedItem.location}</span>
                  </div>
                  <div className="pt-3 border-t border-[#E8E8EF]">
                    <span className="font-bold text-[#191936] block font-mono text-xs uppercase tracking-wider mb-1">
                      Coordinator & Lead:
                    </span>
                    <span className="text-[#191936]/80 leading-relaxed">{selectedItem.coordinator}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    navigate("/register");
                  }}
                  className="btn-primary w-full !h-[54px] flex items-center justify-center gap-2 text-base font-bold"
                >
                  <span>Register for Supernova 3.0</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
};
