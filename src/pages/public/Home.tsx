import { Hero } from "@/components/stage1/Hero";
import { HeroMarquee } from "@/components/home/HeroMarquee";
import { HomeAbout } from "@/components/home/HomeAbout";
import { HomeInstitutions } from "@/components/home/HomeInstitutions";
import { HomeExperiences } from "@/components/home/HomeExperiences";
import { HomeTimeline } from "@/components/home/HomeTimeline";
import { HomeEsports } from "@/components/home/HomeEsports";
import { HomeCountdownSchedule } from "@/components/home/HomeCountdownSchedule";
import { HomeGalleryPreview } from "@/components/home/HomeGalleryPreview";
import { HomeFaq } from "@/components/home/HomeFaq";
import { HomeFinalCta } from "@/components/home/HomeFinalCta";

export default function Home() {
  return (
    <div className="w-full bg-white text-[#151535]">
      {/* 1. Hero Section */}
      <Hero />

      {/* 2. Step 5: Two-Row Marquee Strip */}
      <HeroMarquee />

      {/* 3. Section 1: About */}
      <HomeAbout />

      {/* 4. Section 2: Organised With */}
      <HomeInstitutions />

      {/* 5. Section 3: Experiences (8 Flagship Arenas) */}
      <HomeExperiences />

      {/* 6. Section 4: Timeline (Past, Present, Future) */}
      <HomeTimeline />

      {/* 7. Section 5: Collegiate Esports Arena */}
      <HomeEsports />

      {/* 8. Section 6: Save the Dates, Countdown & Itinerary */}
      <HomeCountdownSchedule />

      {/* 9. Section 7: Photo Archive Gallery Preview */}
      <HomeGalleryPreview />

      {/* 10. Section 8: FAQ Accordion */}
      <HomeFaq />

      {/* 11. Section 9: Final Call to Action */}
      <HomeFinalCta />
    </div>
  );
}
