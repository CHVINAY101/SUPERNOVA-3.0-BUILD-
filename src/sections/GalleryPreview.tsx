import React, { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { SITE_CONTENT } from "../content/site";
import { GALLERY_IMAGES } from "../content/galleryImages";

export const GalleryPreview: React.FC = () => {
  const content = SITE_CONTENT.galleryPreview;
  const sectionRef = useRef<HTMLElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const subtleX = useTransform(scrollYProgress, [0, 1], ["0%", "-8%"]);

  // Sample 6 images for the preview row
  const previewImages = GALLERY_IMAGES.slice(0, 6);
  const rotations = [-2.5, 1.8, -1.2, 2.2, -1.8, 1.5];

  return (
    <section
      id="gallery"
      ref={sectionRef}
      className="relative overflow-clip py-16 sm:py-20 bg-[#FAF9F4] border-t-2 border-[#191936]"
      aria-label="Gallery preview"
    >
      <div className="site-container mb-10 sm:mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <span className="section-label">
            {content.label}
          </span>
          <h2 className="section-heading text-[#191936]">
            {content.heading}
          </h2>
        </div>

        <Link
          to="/gallery"
          className="self-start md:self-auto btn-secondary !h-[50px] !px-6 !text-sm"
        >
          <span>{content.viewAllButton}</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* Draggable / Scrollable Strip */}
      <div className="relative w-full overflow-hidden py-4">
        <motion.div
          ref={scrollContainerRef}
          style={{ x: subtleX }}
          className="flex gap-6 px-6 sm:px-8 w-max cursor-grab active:cursor-grabbing select-none"
        >
          {previewImages.map((img, idx) => {
            const rot = rotations[idx % rotations.length];
            return (
              <motion.div
                key={img.file + idx}
                whileHover={{ scale: 1.04, rotate: 0, zIndex: 10 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                style={{ rotate: `${rot}deg` }}
                className="relative flex-shrink-0 w-72 sm:w-80 md:w-96 aspect-[4/3] rounded-[20px] overflow-hidden bg-white border-2 border-[#191936] shadow-[4px_4px_0px_#191936]"
              >
                <img
                  src={img.file}
                  alt={img.alt}
                  loading="lazy"
                  className="w-full h-full object-cover pointer-events-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#191936]/80 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity p-4 flex items-end">
                  <p className="text-xs text-white font-medium leading-snug line-clamp-2">
                    {img.alt}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};
