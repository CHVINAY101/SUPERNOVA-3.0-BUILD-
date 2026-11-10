import { useState, useMemo, useCallback, useEffect } from "react";
import imagesData from "@/config/images.json";
import { WaveRibbonDivider } from "@/components/stage1/WaveRibbonDivider";
import { X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";

interface GalleryPhoto {
  id: string;
  src: string;
  title: string;
  category: string;
  caption?: string;
}

const CATEGORIES = [
  { id: "all", label: "All Photos" },
  { id: "science", label: "Science" },
  { id: "animation", label: "Animation" },
  { id: "technology", label: "Technology" },
  { id: "esports", label: "E-Sports" },
];

export default function Gallery() {
  const items: GalleryPhoto[] = imagesData.gallery;
  const [activeCategory, setActiveCategory] = useState("all");
  const [activePhotoIdx, setActivePhotoIdx] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const filteredItems = useMemo(() => {
    if (activeCategory === "all") return items;
    return items.filter(
      (item) => item.category?.toLowerCase() === activeCategory.toLowerCase()
    );
  }, [items, activeCategory]);

  const activePhoto = activePhotoIdx !== null ? filteredItems[activePhotoIdx] : null;

  const nextPhoto = useCallback(() => {
    if (activePhotoIdx !== null) {
      setActivePhotoIdx((prev) =>
        prev !== null && prev < filteredItems.length - 1 ? prev + 1 : 0
      );
    }
  }, [activePhotoIdx, filteredItems.length]);

  const prevPhoto = useCallback(() => {
    if (activePhotoIdx !== null) {
      setActivePhotoIdx((prev) =>
        prev !== null && prev > 0 ? prev - 1 : filteredItems.length - 1
      );
    }
  }, [activePhotoIdx, filteredItems.length]);

  const closeLightbox = useCallback(() => {
    setActivePhotoIdx(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activePhotoIdx === null) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") nextPhoto();
      if (e.key === "ArrowLeft") prevPhoto();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePhotoIdx, closeLightbox, nextPhoto, prevPhoto]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > 50) {
      if (diff > 0) nextPhoto();
      else prevPhoto();
    }
    setTouchStartX(null);
  };

  return (
    <div className="w-full bg-white text-[#151535] min-h-screen">
      {/* Header Band (Clears 120px from top) */}
      <div className="pt-32 pb-16 bg-[#F8F7FC] relative border-b border-[#EAEAF2] overflow-hidden">
        <div className="site-container relative z-10 text-center max-w-3xl mx-auto">
          <span className="section-label">PHOTO ARCHIVE</span>
          <h1 className="font-heading text-4xl sm:text-6xl font-extrabold text-[#151535] mb-4 tracking-tight">
            FESTIVAL GALLERY
          </h1>
          <p className="font-body text-base sm:text-lg text-[#52527A] max-w-xl mx-auto">
            From previous editions · Moments of discovery, creativity and competition
          </p>
        </div>

        {/* Bottom Ribbon Wave */}
        <div className="w-full absolute bottom-0 left-0 h-10 overflow-hidden pointer-events-none opacity-40">
          <WaveRibbonDivider />
        </div>
      </div>

      <section className="section-padding">
        <div className="site-container">
          {/* Category Filter Chips */}
          <div className="flex justify-center gap-2 flex-wrap mb-12">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setActivePhotoIdx(null);
                  }}
                  className={`px-5 py-2 rounded-full font-body text-xs font-bold transition-all ${
                    isActive
                      ? "bg-[#151535] text-white shadow-sm"
                      : "bg-[#F8F7FC] text-[#52527A] border border-[#EAEAF2] hover:text-[#151535]"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Photo Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => setActivePhotoIdx(idx)}
                className="group relative rounded-2xl overflow-hidden bg-[#F8F7FC] border border-[#EAEAF2] shadow-sm cursor-pointer transition-transform hover:-translate-y-1 hover:shadow-md flex flex-col"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[#151535]">
                  <img
                    src={item.src}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-11 h-11 rounded-full bg-white text-[#151535] flex items-center justify-center shadow-md">
                      <Maximize2 size={20} />
                    </div>
                  </div>
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <span className="font-mono text-[10px] font-bold text-[#1719C9] tracking-wider uppercase mb-1">
                    {item.category}
                  </span>
                  <h3 className="font-heading text-lg font-bold text-[#151535] mb-1">
                    {item.title}
                  </h3>
                  {item.caption && (
                    <p className="font-body text-xs text-[#52527A] leading-relaxed">
                      {item.caption}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Lightbox Modal */}
      {activePhoto && (
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="fixed inset-0 z-[9999] bg-[#151535]/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
          onClick={closeLightbox}
        >
          {/* Close Button */}
          <button
            onClick={closeLightbox}
            aria-label="Close photo preview"
            className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X size={24} />
          </button>

          {/* Previous Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              prevPhoto();
            }}
            aria-label="Previous photo"
            className="absolute left-4 sm:left-8 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronLeft size={28} />
          </button>

          {/* Lightbox Image Content */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl max-h-[85vh] flex flex-col items-center text-center"
          >
            <img
              src={activePhoto.src}
              alt={activePhoto.title}
              className="max-w-full max-h-[70vh] rounded-xl object-contain shadow-2xl"
            />
            <div className="mt-4 text-white">
              <h3 className="font-heading text-xl sm:text-2xl font-bold mb-1">
                {activePhoto.title}
              </h3>
              {activePhoto.caption && (
                <p className="font-body text-sm text-[#CFC8F5]">
                  {activePhoto.caption}
                </p>
              )}
            </div>
          </div>

          {/* Next Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              nextPhoto();
            }}
            aria-label="Next photo"
            className="absolute right-4 sm:right-8 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronRight size={28} />
          </button>
        </div>
      )}
    </div>
  );
}
