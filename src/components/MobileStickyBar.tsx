import { useState, useEffect, type FC } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";

export const MobileStickyBar: FC = () => {
  const location = useLocation();
  const isRegisterPage = location.pathname === "/register";

  const [visible, setVisible] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show only after hero scrolls out (>480px)
      setVisible(window.scrollY > 480);
    };

    const handleFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        setInputFocused(true);
      }
    };

    const handleFocusOut = () => {
      setInputFocused(false);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  if (isRegisterPage || inputFocused) {
    return null;
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#FFFFFF]/95 backdrop-blur-md border-t-2 border-[#191936] p-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_16px_rgba(25,25,54,0.1)] flex items-center justify-between gap-4"
        >
          <div className="flex flex-col">
            <span className="font-display font-extrabold text-xs text-[#191936] uppercase">
              SUPERNOVA 3.0
            </span>
            <span className="text-[11px] font-heading font-bold text-[#191936]/70">
              20–21 NOV · BANGALORE
            </span>
          </div>

          <Link
            to="/register"
            className="h-10 px-5 rounded-full bg-[#D5F542] text-[#191936] border-2 border-[#191936] font-heading font-bold text-xs uppercase tracking-wider shadow-[2px_2px_0px_#191936] flex items-center gap-1.5 flex-shrink-0"
          >
            REGISTER NOW
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
