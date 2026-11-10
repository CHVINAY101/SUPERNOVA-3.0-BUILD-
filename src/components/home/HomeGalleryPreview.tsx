import { Link } from "react-router-dom";
import imagesData from "@/config/images.json";

export const HomeGalleryPreview = () => {
  // Photos from images.json gallery
  const photos = imagesData.gallery.slice(0, 6);

  return (
    <section className="section-padding bg-[#F8F7FC] border-y border-[#EAEAF2]">
      <div className="site-container">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-16">
          <span className="section-label">From previous editions</span>
          <h2 className="section-heading">A GLIMPSE OF WHAT'S POSSIBLE.</h2>
        </div>

        {/* Photos grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-12">
          {photos.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-2xl overflow-hidden aspect-[4/3] bg-white border border-[#EAEAF2] shadow-sm flex flex-col justify-end p-4 transition-transform hover:-translate-y-1 hover:shadow-md"
            >
              <img
                src={item.src}
                alt={item.title}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#151535]/80 via-[#151535]/20 to-transparent pointer-events-none" />

              <div className="relative z-10">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5 bg-[#C8F500] text-[#151535]">
                  {item.category}
                </span>
                <h4 className="font-heading text-base font-bold text-white leading-snug">
                  {item.title}
                </h4>
              </div>
            </div>
          ))}
        </div>

        {/* View full gallery button */}
        <div className="flex justify-center">
          <Link
            to="/gallery"
            className="btn-primary"
            style={{ height: 52, padding: "0 36px" }}
          >
            View full gallery →
          </Link>
        </div>
      </div>
    </section>
  );
};
