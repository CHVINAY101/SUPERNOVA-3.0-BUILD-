/**
 * Central Image Assets Configuration
 * All festival photography and visual assets are driven by images.json.
 * To swap any photo, update the filename in images.json or in this file.
 */
import imagesData from "./images.json";

export interface ImageAsset {
  src: string;
  alt: string;
  aspectRatio: string;
  duotoneOverlay?: string;
  caption?: string;
  tag?: string;
}

export interface PartnerAsset {
  id: string;
  name: string;
  logo: string;
  tier: "title" | "poweredBy" | "associate";
  url?: string;
}

export const FESTIVAL_IMAGES = {
  home: {
    heroNebula: imagesData.home.heroNebula,
    zones: {
      science: imagesData.home.zones.science,
      animation: imagesData.home.zones.animation,
      technology: imagesData.home.zones.technology,
      esports: imagesData.home.zones.esports,
      // Compatibility aliases
      scienceExpo: imagesData.home.zones.science,
      animationShowcase: imagesData.home.zones.animation,
      ideasInMotion: imagesData.home.zones.technology,
      esportsTournament: imagesData.home.zones.esports,
    },
    venuePortrait: imagesData.home.venuePortrait,
    moments: imagesData.home.moments,
  },
  partners: (imagesData.partners || []) as PartnerAsset[],
  about: imagesData.about,
  gallery: imagesData.gallery,
  updates: imagesData.updates,
};
