import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SITE_CONTENT, type ExperienceItem } from "@/content/site";
import { X, ArrowRight, MapPin, Compass, CheckCircle2 } from "lucide-react";

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
    <section
      id="experiences"
      className="site-section bg-[#FAF9F4] text-[#191936] border-b border-[#191936]/10"
      style={{ scrollMarginTop: "80px" }}
    >
      <div className="site-container">
        {/* Section Header: Editorial & Exhibition Authority */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 sm:mb-14">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 font-mono text-xs font-bold tracking-widest text-[#4549D8] uppercase mb-3">
              <span className="w-2 h-2 rounded-full bg-[#4549D8]" />
              <span>{SITE_CONTENT.experiences.eyebrow}</span>
            </div>

            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-black text-[#191936] tracking-tight leading-[1.05] mb-4">
              {SITE_CONTENT.experiences.heading}
            </h2>

            <p className="font-body text-base sm:text-lg text-[#191936]/80 leading-relaxed max-w-2xl">
              {SITE_CONTENT.experiences.subline ||
                "Nine flagship immersive zones designed to inspire discovery, cultivate hands-on skills, and showcase outstanding student and collegiate talent."}
            </p>
          </div>

          <div className="hidden md:flex flex-col items-end shrink-0">
            <span className="font-mono text-xs uppercase tracking-wider text-[#191936]/50">
              EXHIBITION MAP
            </span>
            <span className="font-display text-2xl font-black text-[#191936]">
              9 Flagship Pavilions
            </span>
          </div>
        </div>

        {/* 9 Cards in Responsive 3x3 Grid: 3 columns desktop, 2 tablet, 1 mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
          {SITE_CONTENT.experiences.items.map((item) => {
            const photoSrc = item.photoSrc || "/assets/images/photos/science-expo.jpg";

            return (
              <motion.article
                key={item.id}
                onClick={() => setSelectedItem(item)}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                className="group cursor-pointer flex flex-col justify-between bg-white rounded-2xl border-2 border-[#191936]/10 hover:border-[#191936]/40 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden"
                aria-label={`Explore ${item.title}`}
              >
                {/* Real Event Photo with Clean Architectural Framing */}
                <div className="relative w-full aspect-[16/10] bg-[#191936]/5 overflow-hidden border-b border-[#191936]/10">
                  <img
                    src={photoSrc}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />

                  {/* Clean, Non-gradient Badge Header */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                    <span
                      className="px-2.5 py-1 rounded-md font-mono text-[11px] font-bold tracking-wider text-[#191936] bg-white/95 border border-[#191936]/20 shadow-sm backdrop-blur-sm"
                      style={{ borderLeftColor: item.color, borderLeftWidth: "4px" }}
                    >
                      ZONE {item.num}
                    </span>

                    <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold text-white bg-[#191936]/80 backdrop-blur-sm">
                      {item.location.split("·")[0].trim()}
                    </span>
                  </div>
                </div>

                {/* Card Editorial Body */}
                <div className="p-6 flex flex-col flex-1 justify-between bg-white">
                  <div>
                    {item.heading && (
                      <div
                        className="font-mono text-xs uppercase tracking-wider font-bold mb-2 line-clamp-1"
                        style={{ color: item.color === "#D5F542" ? "#5A7000" : item.color === "#F6E9B9" ? "#8A6D00" : item.color }}
                      >
                        {item.heading}
                      </div>
                    )}

                    <h3 className="font-display text-xl sm:text-2xl font-black text-[#191936] leading-snug mb-3 group-hover:text-[#4549D8] transition-colors">
                      {item.title}
                    </h3>

                    <p className="font-body text-sm text-[#191936]/75 leading-relaxed line-clamp-3 mb-4">
                      {item.description}
                    </p>
                  </div>

                  {/* Bottom Strip: Location & Interactive Trigger */}
                  <div className="pt-4 border-t border-[#191936]/10 flex items-center justify-between text-xs font-semibold">
                    <span className="font-mono text-[#191936]/60 text-[11px] flex items-center gap-1 truncate max-w-[65%]">
                      <MapPin size={12} className="shrink-0 text-[#191936]/40" />
                      <span className="truncate">{item.location}</span>
                    </span>

                    <span className="font-mono uppercase tracking-wider text-[#191936] group-hover:text-[#4549D8] transition-colors flex items-center gap-1 shrink-0">
                      <span>Dossier</span>
                      <ArrowRight size={13} className="transform group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>

      {/* Detail Drawer Modal (Exhibition Pavilion Dossier) */}
      <AnimatePresence>
        {selectedItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#FFFFFF] w-full max-w-xl h-full sm:h-[95vh] sm:rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col justify-between overflow-y-auto border-l-2 sm:border-2 border-[#191936]"
              role="dialog"
              aria-modal="true"
              aria-label={selectedItem.title}
            >
              <div>
                {/* Dossier Top Bar */}
                <div className="flex items-center justify-between pb-4 border-b-2 border-[#191936]/10 mb-6">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="px-3 py-1 rounded-md font-mono text-xs font-extrabold text-[#191936] border-2 border-[#191936]"
                      style={{ backgroundColor: selectedItem.color }}
                    >
                      PAVILION {selectedItem.num}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#191936]/60 uppercase tracking-widest">
                      SUPERNOVA 3.0 EXPO
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="w-10 h-10 rounded-full bg-[#FAF9F4] hover:bg-[#E8E8EF] flex items-center justify-center border-2 border-[#191936] cursor-pointer text-[#191936] transition-colors"
                    aria-label="Close pavilion dossier"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Real Event Photo */}
                <div className="w-full aspect-[16/10] rounded-xl overflow-hidden mb-6 border-2 border-[#191936] shadow-[4px_4px_0px_#191936]">
                  <img
                    src={selectedItem.photoSrc || "/assets/images/photos/science-expo.jpg"}
                    alt={selectedItem.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {selectedItem.heading && (
                  <div
                    className="font-mono text-xs uppercase tracking-wider font-extrabold mb-1.5"
                    style={{ color: selectedItem.color === "#D5F542" ? "#5A7000" : selectedItem.color === "#F6E9B9" ? "#8A6D00" : selectedItem.color }}
                  >
                    {selectedItem.heading}
                  </div>
                )}

                <h3 className="font-display text-2xl sm:text-3xl font-black text-[#191936] mb-3 leading-tight">
                  {selectedItem.title}
                </h3>

                <p className="font-body text-base text-[#191936]/80 leading-relaxed mb-6">
                  {selectedItem.description}
                </p>

                {/* Structured Pavilion Dossier Specification */}
                <div className="flex flex-col gap-4 p-5 rounded-xl bg-[#FAF9F4] border-2 border-[#191936] text-sm font-body mb-6">
                  <div>
                    <span className="font-bold text-[#191936] flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider mb-1.5">
                      <Compass size={14} className="text-[#4549D8]" />
                      What to expect & highlights:
                    </span>
                    <p className="text-[#191936]/85 leading-relaxed pl-5">
                      {selectedItem.whatToExpect}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#191936]/10">
                    <span className="font-bold text-[#191936] flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider mb-1">
                      <MapPin size={14} className="text-[#4549D8]" />
                      Campus Location & Pavilion:
                    </span>
                    <span className="text-[#191936]/85 leading-relaxed pl-5 block">
                      {selectedItem.location}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-[#191936]/10">
                    <span className="font-bold text-[#191936] flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider mb-1">
                      <CheckCircle2 size={14} className="text-[#4549D8]" />
                      Coordinating Department & Faculty:
                    </span>
                    <span className="text-[#191936]/85 leading-relaxed pl-5 block">
                      {selectedItem.coordinator}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-4 border-t border-[#191936]/10 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    navigate("/register?type=visitor");
                  }}
                  className="btn-primary w-full !h-[52px] flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider"
                >
                  <span>REGISTER TO VISIT THIS PAVILION</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
};
