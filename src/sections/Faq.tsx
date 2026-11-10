import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SITE_CONTENT } from "../content/site";

export const Faq: React.FC = () => {
  const content = SITE_CONTENT.faq;
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleItem = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section
      id="faq"
      className="relative overflow-clip py-16 sm:py-20 bg-white border-t-2 border-[#191936]"
      aria-label="Frequently Asked Questions"
    >
      <div className="max-w-4xl mx-auto px-6 sm:px-8">
        <div className="text-center mb-10 sm:mb-12">
          <span className="section-label">
            QUESTIONS & ANSWERS
          </span>
          <h2 className="section-heading text-[#191936]">
            {content.heading}
          </h2>
        </div>

        <div className="space-y-4 sm:space-y-5">
          {content.items.map((item, idx) => {
            const isOpen = openIndex === idx;
            const contentId = `faq-content-${idx}`;
            const headerId = `faq-header-${idx}`;

            return (
              <div
                key={item.question}
                className="rounded-[20px] border-2 border-[#191936] bg-[#FAF9F4] overflow-hidden transition-all duration-200"
                style={{
                  boxShadow: isOpen ? "4px 4px 0px #191936" : "2px 2px 0px #191936",
                }}
              >
                <h3>
                  <button
                    id={headerId}
                    type="button"
                    onClick={() => toggleItem(idx)}
                    aria-expanded={isOpen}
                    aria-controls={contentId}
                    className="w-full flex items-center justify-between p-5 sm:p-6 text-left font-display font-bold text-lg sm:text-xl text-[#191936] hover:text-[#4549D8] transition-colors gap-4 cursor-pointer"
                  >
                    <span>{item.question}</span>
                    <span
                      aria-hidden="true"
                      className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center bg-white border-2 border-[#191936] text-[#191936] transition-transform duration-300 font-mono text-lg font-bold"
                      style={{
                        transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                        backgroundColor: isOpen ? "#D5F542" : "#FFFFFF",
                      }}
                    >
                      +
                    </span>
                  </button>
                </h3>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={contentId}
                      role="region"
                      aria-labelledby={headerId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                    >
                      <div className="px-5 pb-5 sm:px-6 sm:pb-6 pt-0 text-[#191936]/80 text-base sm:text-lg leading-relaxed border-t border-[#191936]/10 font-body">
                        {item.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
