/**
 * Supernova 3.0 Festival Configuration
 * Single source of truth for festival settings, contact details, registration state and copy.
 */

export const FESTIVAL_CONFIG = {
  // Config flag: REGISTRATIONS_OPEN = true
  // Every primary button (nav, hero, closing band, zone cards, Events page) reads "Register Now" and goes to /register.
  REGISTRATIONS_OPEN: true,

  // External Form Embed URL (leave empty string to show built-in form with "Form not connected yet" banner)
  REGISTRATION_FORM_URL: "",

  // Identity & Copy
  ORGANISER_LEAD: "THE NATIONAL EDUCATION SOCIETY OF KARNATAKA",
  PRESENTS: "PRESENTS",
  TITLE: "SUPERNOVA",
  EDITION: "3.0",
  MOTTO: "DREAM • CREATE • COMPETE",
  
  // Date & Venue
  DATES: "20 – 21 NOVEMBER 2026",
  VENUE: "THE NATIONAL COLLEGE",
  CITY: "BASAVANAGUDI, BENGALURU – 04",
  VENUE_FULL_ADDRESS: "The National College, Pampa Mahakavi Road, Basavanagudi, Bengaluru, Karnataka 560004",
  VENUE_MAPS_URL: "https://maps.google.com/?q=The+National+College+Basavanagudi+Bengaluru",

  // Statement / Subtext
  SUBTEXT: "A celebration of science, creativity, innovation and competition across four flagship zones.",

  // Contact and Social (Section 4)
  HELPDESK_EMAIL: "animationthenationalcollege@gmail.com",
  SOCIAL_LINKS: [
    {
      id: "instagram-ncba",
      label: "National College NCBA",
      handle: "@thenationalcollegencba",
      url: "https://www.instagram.com/thenationalcollegencba",
      isPlaceholder: false,
      platform: "instagram",
    },
    {
      id: "instagram-college",
      label: "The National College",
      handle: "@thenationalcollege",
      url: "", // Safe empty placeholder - handled cleanly without dead click
      isPlaceholder: true,
      platform: "instagram",
    },
  ],

  // Flagship Zones (exact naming)
  ZONES: [
    {
      id: "science",
      name: "Science",
      tagline: "Exploration, quantum physics, and experimental apparatus.",
      icon: "atom",
      color: "#2E2A8A",
    },
    {
      id: "animation",
      name: "Animation",
      tagline: "Character design, 3D CGI reels, and motion arts.",
      icon: "clapperboard",
      color: "#5648B0",
    },
    {
      id: "technology",
      name: "Technology",
      tagline: "Autonomous robotics, embedded systems, and neural code.",
      icon: "gear-circuit",
      color: "#2E2A8A",
    },
    {
      id: "esports",
      name: "E-Sports",
      tagline: "Collegiate brackets, tactical showdowns, and live casters.",
      icon: "controller",
      color: "#5648B0",
    },
  ],

  // Countdown Target: 20 Nov 2026 00:00 IST (+05:30)
  COUNTDOWN_TARGET_ISO: "2026-11-20T00:00:00+05:30",
};

export function getPrimaryButtonLabel(): string {
  return FESTIVAL_CONFIG.REGISTRATIONS_OPEN ? "Register Now" : "Register Now";
}

export function getPrimaryButtonSubtext(): string | null {
  return null;
}

export function getPrimaryButtonHref(): string {
  return "/register";
}

export function isExternalPrimaryButton(): boolean {
  return false;
}

export interface CountdownValues {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isComplete: boolean;
}

export function calculateCountdown(targetIso: string, nowMs: number = Date.now()): CountdownValues {
  const targetMs = new Date(targetIso).getTime();
  const diff = Math.max(0, targetMs - nowMs);
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return {
    days,
    hours,
    minutes,
    seconds,
    isComplete: diff === 0,
  };
}

export function splitWords(text: string): string[] {
  return text.trim().split(/\s+/);
}
