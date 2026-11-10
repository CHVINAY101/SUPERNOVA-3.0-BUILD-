/**
 * SUPERNOVA 3.0 Master Event Configuration
 * All confirmed facts, institutions, endpoints, and event details.
 * Never hardcode these values elsewhere in the codebase.
 */

export interface InstitutionGroup {
  campus: string;
  schools: string[];
}

export interface ConfigType {
  EVENT_NAME: string;
  EVENT_SUBTITLE: string;
  DATES: string;
  THEME: string;
  TAGLINE: string;
  DESCRIPTION: string;
  PRESENTER_LEAD: string;
  PRESENTER_ACTION: string;
  PRESENTER_COLLAB: string;
  ORGANISERS?: string;
  VENUE: string;
  REGISTRATION_OPEN: boolean;
  EVENT_START: string;
  EVENT_END: string;
  DEBUG: boolean;
  FORM_ENDPOINTS: {
    participation: string;
    visitor: string;
    esports: string;
  };
  ESPORTS_GAMES: string[];
  ESPORTS_TEAM_SIZE: number | null;
  INSTITUTIONS: InstitutionGroup[];
  HELPDESK_EMAIL: string;
  INSTAGRAM: {
    nationalCollegeBasavanagudi: string;
    nationalNcba: string;
  };
  SOCIAL: {
    instagramBasavanagudi: string;
    instagramNcba: string;
  };
  PHOTO_FOLDER: string;
  LOGO_PATH: string;
}

export const CONFIG: ConfigType = {
  EVENT_NAME: "SUPERNOVA 3.0",
  EVENT_SUBTITLE: "Educational Innovation Expo",
  DATES: "20–21 November 2026",
  THEME: "CREATE. CONNECT. CELEBRATE.",
  TAGLINE: "From the technology that shaped us to the creativity shaping tomorrow.",
  DESCRIPTION: "A celebration of science, creativity, innovation and competition across four flagship zones.",
  PRESENTER_LEAD: "THE NATIONAL EDUCATION SOCIETY OF KARNATAKA",
  PRESENTER_ACTION: "PRESENTS",
  PRESENTER_COLLAB: "with the Department of Animation",
  ORGANISERS: "The National College, Basavanagudi & National PU College, Jayanagar",
  VENUE: "The National College · Basavanagudi, Bengaluru – 04",
  REGISTRATION_OPEN: true,
  EVENT_START: "2026-11-20T00:00:00+05:30",
  EVENT_END: "2026-11-21T23:59:59+05:30",
  DEBUG: true,
  FORM_ENDPOINTS: {
    participation: "",
    visitor: "",
    esports: "",
  },
  ESPORTS_GAMES: ["VALORANT", "BGMI", "FREE FIRE"],
  ESPORTS_TEAM_SIZE: null,
  INSTITUTIONS: [
    {
      campus: "Basavanagudi campus",
      schools: [
        "The National College, Basavanagudi",
        "National PU College, Basavanagudi",
        "National High School",
        "National English School",
      ],
    },
    {
      campus: "Jayanagar campus",
      schools: [
        "National PU College, Jayanagar",
        "DR.HNCE",
        "National Degree College, Jayanagar",
      ],
    },
  ],
  HELPDESK_EMAIL: "animationthenationalcollege@gmail.com",
  INSTAGRAM: {
    nationalCollegeBasavanagudi: "", // An empty URL renders as disabled text
    nationalNcba: "",                // An empty URL renders as disabled text
  },
  SOCIAL: {
    instagramBasavanagudi: "",
    instagramNcba: "",
  },
  PHOTO_FOLDER: "/assets/images/previous/",
  LOGO_PATH: "/assets/aistudio/Futuristic_Supernova_3.0_Logo_png_c0ddbd5c.png",
};

/**
 * Returns formatted Instagram status: valid URL or disabled placeholder
 */
export function getInstagramDisplay(account: "nationalCollegeBasavanagudi" | "nationalNcba"): {
  name: string;
  url: string | null;
  label: string;
} {
  const isBasavanagudi = account === "nationalCollegeBasavanagudi";
  const name = isBasavanagudi
    ? "The National College, Basavanagudi"
    : "National NCBA";
  const url = CONFIG.INSTAGRAM[account]?.trim() || null;

  return {
    name,
    url,
    label: url ? `@${isBasavanagudi ? "thenationalcollegencba" : "national_ncba"}` : "Details coming soon",
  };
}
