import type { FC } from "react";
import { Hero } from "../sections/Hero";
import { Marquee } from "../sections/Marquee";
import { About } from "../sections/About";
import { Experiences } from "../sections/Experiences";
import { Esports } from "../sections/Esports";
import { SaveTheDates } from "../sections/SaveTheDates";
import { GalleryPreview } from "../sections/GalleryPreview";
import { OrganisedWith } from "../sections/OrganisedWith";
import { Faq } from "../sections/Faq";
import { FinalCta } from "../sections/FinalCta";

export const HomePage: FC = () => {
  return (
    <div className="w-full bg-[#FAF9F4] text-[#191936]">
      {/* 1. Hero Section */}
      <Hero />

      {/* 2. Infinite Two-Row Marquee */}
      <Marquee />

      {/* 3. About Supernova: A PLACE FOR IDEAS TO COME ALIVE */}
      <About />

      {/* 4. Four Event Experiences: Science Expo, School Exhibition, Animation Showcase, Esports Tournament */}
      <Experiences />

      {/* 5. Esports Highlight & Live Arena */}
      <Esports />

      {/* 6. Save The Dates, Live Countdown & Itinerary */}
      <SaveTheDates />

      {/* 7. Gallery Moments Preview Strip with Real Event Photos */}
      <GalleryPreview />

      {/* 8. Organising Institutions */}
      <OrganisedWith />

      {/* 9. Frequently Asked Questions Accordion */}
      <Faq />

      {/* 10. Registration Call to Action */}
      <FinalCta />
      {/* 11. Footer is rendered by PublicLayout */}
    </div>
  );
};
