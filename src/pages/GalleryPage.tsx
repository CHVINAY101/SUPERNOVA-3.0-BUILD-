import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GALLERY_IMAGES } from "../content/galleryImages";
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";

export const GalleryPage: React.FC = () => {
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);

  const displayedImages = GALLERY_IMAGES.slice(0, visibleCount);

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeImageIndex === null) return;

      if (e.key === "Escape") {
        setActiveImageIndex(null);
      } else if (e.key === "ArrowLeft") {
        setActiveImageIndex((prev) =>
          prev !== null ? (prev > 0 ? prev - 1 : GALLERY_IMAGES.length - 1) : null
        );
      } else if (e.key === "ArrowRight") {
        setActiveImageIndex((prev) =>
          prev !== null ? (prev < GALLERY_IMAGES.length - 1 ? prev + 1 : 0) : null
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeImageIndex]);

  // Lock scroll when lightbox is open
  useEffect(() => {
    if (activeImageIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeImageIndex]);

  return (
    <div className="w-full bg-[#F8F7FC] min-h-screen pb-24">
      {/* Header Band */}
      <div className="pt-36 pb-16 bg-white border-b border-[#EAEAF2] relative">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 text-center">
          <span className="inline-block text-xs uppercase tracking-[0.2em] font-mono text-[#4549D8] font-bold mb-3">
            GALLERY
          </span>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-[#191936] mb-4">
            MOMENTS & EXHIBITS
          </h1>
          <p className="font-mono text-xs sm:text-sm font-semibold text-[#191936]/70 max-w-xl mx-auto">
            Glimpses from Supernova editions at The National College, Basavanagudi.
          </p>
        </div>

        {/* 4-color bottom ribbon */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 flex" aria-hidden="true">
          <span className="flex-1 bg-[#4549D8]" />
          <span className="flex-1 bg-[#FF873D]" />
          <span className="flex-1 bg-[#D5F542]" />
          <span className="flex-1 bg-[#A9D9F4]" />
        </div>
      </div>

      {/* Grid Container */}
      <div className="max-w-7xl mx-auto px-6 sm:px-8 pt-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {displayedImages.map((img, idx) => {
            return (
              <motion.div
                key={img.file + idx}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                onClick={() => setActiveImageIndex(idx)}
                className="group relative cursor-pointer bg-white rounded-[20px] overflow-hidden border-2 border-[#191936] shadow-[4px_4px_0px_#191936] aspect-[4/3] flex flex-col justify-between"
              >
                <img
                  src={img.file}
                  alt={img.alt}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />

                {/* Hover overlay with zoom icon & caption */}
                <div className="absolute inset-0 bg-[#191936]/80 opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-between text-white">
                  <div className="self-end p-2 rounded-full bg-white/20">
                    <ZoomIn className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-xs font-medium leading-snug line-clamp-2">
                    {img.alt}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Load More Button if count > visible */}
        {GALLERY_IMAGES.length > visibleCount && (
          <div className="text-center mt-12">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 24)}
              className="btn-secondary"
            >
              Load more photos
            </button>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {activeImageIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#191936]/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
            onClick={() => setActiveImageIndex(null)}
          >
            {/* Top Bar with counter & close */}
            <div className="absolute top-6 left-6 right-6 flex items-center justify-between text-white z-10 pointer-events-auto">
              <span className="font-mono text-sm tracking-wider font-bold bg-white/10 px-3 py-1.5 rounded-full">
                {activeImageIndex + 1} of {GALLERY_IMAGES.length}
              </span>

              <button
                type="button"
                onClick={() => setActiveImageIndex(null)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                title="Close (Esc)"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Prev Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveImageIndex((prev) =>
                  prev !== null ? (prev > 0 ? prev - 1 : GALLERY_IMAGES.length - 1) : null
                );
              }}
              className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
              title="Previous (Arrow Left)"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>

            {/* Next Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveImageIndex((prev) =>
                  prev !== null ? (prev < GALLERY_IMAGES.length - 1 ? prev + 1 : 0) : null
                );
              }}
              className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
              title="Next (Arrow Right)"
            >
              <ChevronRight className="w-7 h-7" />
            </button>

            {/* Center Image Container */}
            <div
              className="relative max-w-4xl max-h-[80vh] w-full flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={GALLERY_IMAGES[activeImageIndex].file}
                alt={GALLERY_IMAGES[activeImageIndex].alt}
                className="max-h-[70vh] w-auto max-w-full rounded-[20px] object-contain border-2 border-white/20 shadow-2xl"
              />
              <p className="text-white/80 text-sm mt-4 text-center max-w-lg font-medium">
                {GALLERY_IMAGES[activeImageIndex].alt}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
