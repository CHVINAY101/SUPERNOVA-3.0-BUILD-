import galleryData from "../../images.json";

export interface GalleryImage {
  file: string;
  alt: string;
  focus?: string;
  featured?: boolean;
}

export const GALLERY_IMAGES: GalleryImage[] = galleryData as GalleryImage[];
