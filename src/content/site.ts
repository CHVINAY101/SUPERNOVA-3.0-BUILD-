/**
 * SUPERNOVA 3.0 — Master Content & Configuration File
 * All copy and confirmed facts live here.
 * Zero hardcoded text in components. Zero banned words.
 */

export interface SocialLink {
  platform: string;
  label: string;
  url: string;
}

export interface InstitutionGroup {
  campus: string;
  dotColor: string;
  institutions: string[];
}

export interface ExperienceItem {
  id: string;
  num: string;
  title: string;
  heading?: string;
  description: string;
  color: string;
  photoSrc?: string;
  illustrationType:
    | "beaker"
    | "robot"
    | "planet"
    | "smartCity"
    | "animation"
    | "windTurbine"
    | "lightbulb"
    | "pixelTrophy"
    | "ai";
  whatToExpect: string;
  location: string;
  coordinator: string;
}

export interface EsportsOfficialGame {
  id: "valorant" | "bgmi" | "freefire";
  title: string;
  genre: string;
  platform: "PC" | "Mobile";
  badge: string;
  badgeColor: string;
  accentColor: string;
  description: string;
  artworkType: "valorant" | "bgmi" | "freefire";
  rulesNotice: string;
  registerQuery: string;
}

export interface SiteContent {
  meta: {
    title: string;
    description: string;
    dates: string;
    venue: string;
    organiser: string;
    helpdeskEmail: string;
    eventStart: string;
    eventEnd: string;
    debug: boolean;
  };
  social: SocialLink[];
  formEndpoints: {
    participation: string;
    visitor: string;
    esports: string;
  };
  esportsGames: string[];
  esportsTeamSize: number | null;
  registrationOpen: boolean;
  hero: {
    presenterOrg: string;
    presentsText: string;
    themeWords: { text: string; colorClass: string }[];
    tagline: string;
    description: string;
    dates: string;
    venueLine: string;
    exploreButtonText: string;
    registerButtonText: string;
    subLinkText: string;
    countdownMicroLabel: string;
  };
  marquee: {
    row1: string[];
    row2: string[];
  };
  about: {
    eyebrow: string;
    heading: string;
    paragraphs: string[];
    pillars: {
      name: string;
      color: string;
      line: string;
      illustration: "create" | "connect" | "celebrate";
    }[];
  };
  organisedWith: {
    eyebrow: string;
    heading: string;
    subline: string;
    groups: InstitutionGroup[];
  };
  experiences: {
    eyebrow: string;
    heading: string;
    subline?: string;
    items: ExperienceItem[];
  };
  timeline: {
    eyebrow: string;
    heading: string;
    steps: {
      era: string;
      line: string;
      type: "past" | "present" | "future";
    }[];
  };
  esports: {
    heading: string;
    subheading?: string;
    officialGames: EsportsOfficialGame[];
    cards: { title: string; body: string; badge?: string; highlights?: string[] }[];
    ctaText: string;
  };
  saveTheDates: {
    eyebrow: string;
    heading: string;
    giantDays: string;
    giantMonthYear: string;
    venueLabel: string;
    venueValue: string;
    timingsLabel: string;
    timingsValue: string;
    openingLabel: string;
    openingValue: string;
    scheduleTba: string;
    announcementsLabel: string;
    announcementsValue: string;
  };
  galleryPreview: {
    heading: string;
    label: string;
    viewAllButton: string;
  };
  faq: {
    heading: string;
    items: { question: string; answer: string }[];
  };
  finalCta: {
    heading: string;
    subline: string;
    exploreButton: string;
    registerButton: string;
  };
  footer: {
    theme: string;
    tagline: string;
    dates: string;
    organiserLine: string;
    copyright: string;
  };
  registerPage: {
    eyebrow: string;
    heading: string;
    datesVenueLine: string;
    chooseLabel: string;
    cards: {
      id: "participation" | "visitor" | "esports";
      badge: string;
      badgeBg: string;
      title: string;
      line: string;
    }[];
    rulesCheckboxLabel: string;
    privacyCheckboxLabel: string;
    notConnectedBannerTitle: string;
    notConnectedBannerText: string;
    mailtoFallbackButton: string;
    successTitle: string;
    successSubtitle: string;
    retryButtonText: string;
  };
}

export const SITE_CONTENT: SiteContent = {
  meta: {
    title: "SUPERNOVA 3.0 | Educational Innovation Expo | 20–21 November 2026",
    description:
      "Supernova 3.0 brings together students, educators, creators and innovators for an exciting celebration of science, technology, creativity and discovery.",
    dates: "20–21 November 2026",
    venue: "The National College, Basavanagudi, Bengaluru – 04",
    organiser: "The National Education Society of Karnataka institutions (The National College, Basavanagudi & National PU College, Jayanagar) with the Department of Animation",
    helpdeskEmail: "animationthenationalcollege@gmail.com",
    eventStart: "2026-11-20T00:00:00+05:30",
    eventEnd: "2026-11-21T23:59:59+05:30",
    debug: true,
  },
  social: [
    {
      platform: "Instagram",
      label: "National College NCBA",
      url: "", // Configurable: URLs not yet provided by organisers
    },
    {
      platform: "Instagram",
      label: "The National College",
      url: "", // Configurable: URLs not yet provided by organisers
    },
  ],
  formEndpoints: {
    participation: "",
    visitor: "",
    esports: "",
  },
  esportsGames: ["VALORANT", "BGMI", "FREE FIRE"],
  esportsTeamSize: null,
  registrationOpen: true,

  hero: {
    presenterOrg: "THE NATIONAL EDUCATION SOCIETY OF KARNATAKA",
    presentsText: "PRESENTS",
    themeWords: [
      { text: "CREATE.", colorClass: "text-[#4549D8]" },
      { text: "CONNECT.", colorClass: "text-[#FF873D]" },
      { text: "CELEBRATE.", colorClass: "text-[#D5F542]" },
    ],
    tagline: "From the technology that shaped us to the creativity shaping tomorrow.",
    description:
      "Explore innovation, experience creativity, discover new possibilities and celebrate the ideas shaping tomorrow.",
    dates: "20–21 NOVEMBER 2026",
    venueLine: "THE NATIONAL COLLEGE · BASAVANAGUDI, BENGALURU – 04",
    exploreButtonText: "EXPLORE THE EVENT",
    registerButtonText: "REGISTER NOW",
    subLinkText: "Visitor and participant registration is open too →",
    countdownMicroLabel: "EVENT STARTS IN",
  },

  marquee: {
    row1: ["CREATE", "•", "CONNECT", "•", "CELEBRATE", "•", "20–21 NOVEMBER 2026", "•", "SUPERNOVA 3.0"],
    row2: [
      "SCIENCE",
      "•",
      "AI & ROBOTICS",
      "•",
      "SPACE",
      "•",
      "ANIMATION",
      "•",
      "SUSTAINABILITY",
      "•",
      "INNOVATION",
      "•",
      "ESPORTS",
    ],
  },

  about: {
    eyebrow: "ABOUT SUPERNOVA 3.0",
    heading: "A PLACE FOR IDEAS TO COME ALIVE.",
    paragraphs: [
      "Supernova 3.0 brings together science, education, animation, technology and creativity for an exciting celebration of discovery, innovation and community.",
      "Organised by The National Education Society of Karnataka through its distinguished institutions — The National College, Basavanagudi and National PU College, Jayanagar — in collaboration with the Department of Animation.",
    ],
    pillars: [
      {
        name: "Create",
        color: "#D5F542",
        line: "Hands-on student experiments, engineering prototypes and imaginative breakthroughs.",
        illustration: "create",
      },
      {
        name: "Connect",
        color: "#4549D8",
        line: "Inter-institutional collaboration, inspiring mentorship and creative community dialogues.",
        illustration: "connect",
      },
      {
        name: "Celebrate",
        color: "#FF873D",
        line: "Showcasing student talent, digital artistry and championship esports tournament play.",
        illustration: "celebrate",
      },
    ],
  },

  organisedWith: {
    eyebrow: "ORGANISED BY",
    heading: "THE NATIONAL EDUCATION SOCIETY OF KARNATAKA",
    subline: "Bringing together our distinguished centenary institutions across Bengaluru",
    groups: [
      {
        campus: "Basavanagudi",
        dotColor: "#4549D8",
        institutions: [
          "The National College, Basavanagudi",
          "National PU College, Basavanagudi",
          "National High School",
          "National English School",
        ],
      },
      {
        campus: "Jayanagar",
        dotColor: "#FF873D",
        institutions: [
          "National PU College, Jayanagar",
          "DR.HNCE",
          "National Degree College, Jayanagar",
        ],
      },
    ],
  },

  experiences: {
    eyebrow: "EXPERIENCES",
    heading: "BEYOND THE EXHIBITION.",
    subline: "Nine immersive zones designed to inspire discovery, cultivate hands-on skills, and showcase outstanding talent.",
    items: [
      {
        id: "zone-01",
        num: "01",
        title: "AI Experience Centre",
        heading: "Step Into the World of Artificial Intelligence",
        description:
          "Discover the possibilities of artificial intelligence through interactive applications and real-world demonstrations. Experience how AI is transforming the way we learn, work and interact with technology.",
        color: "#4549D8",
        photoSrc: "/assets/aistudio/0O7A0228_d5c67fef.JPG",
        illustrationType: "ai",
        whatToExpect: "Interactive AI applications, voice/vision models, neural demos and live intelligent system showcases.",
        location: "Centenary Block · Lab 1 & 2",
        coordinator: "Faculty of Computer Science & AI Crew",
      },
      {
        id: "zone-02",
        num: "02",
        title: "Robotics Arena",
        heading: "Where Machines Come to Life",
        description:
          "Witness the power of robotics through exciting competitions, live demonstrations and innovative robotic creations. Explore the world of automation, engineering and intelligent machines.",
        color: "#D5F542",
        photoSrc: "/assets/aistudio/0O7A0032_f0ad2b3e.JPG",
        illustrationType: "robot",
        whatToExpect: "Hexapod arachnidbots, bipedal humanoid walking robots, Bluetooth rovers and student robotics challenges.",
        location: "Main Expo Hangar · Robotics Pit",
        coordinator: "Robotics Club & Electronics Faculty",
      },
      {
        id: "zone-03",
        num: "03",
        title: "Space Experience",
        heading: "Explore Beyond the Boundaries",
        description:
          "Journey into the fascinating world of space exploration. Discover satellites, space missions, astronomy and the technologies that are taking humanity beyond Earth.",
        color: "#191936",
        photoSrc: "/assets/aistudio/0O7A9945_c2f9bbf4.JPG",
        illustrationType: "planet",
        whatToExpect: "Scale launch vehicle models, satellite telemetry displays, celestial astronomy showcases and planetary science demos.",
        location: "Science Pavilion · Space Wing",
        coordinator: "Physics Department & Astronomy Forum",
      },
      {
        id: "zone-04",
        num: "04",
        title: "Future Bengaluru",
        heading: "Imagine the City of Tomorrow",
        description:
          "Discover an imaginative 3D smart-city model showcasing the possibilities of tomorrow's urban world. Explore how technology, sustainability, intelligent infrastructure and innovation can transform Bengaluru.",
        color: "#FF873D",
        photoSrc: "/assets/aistudio/0O7A0333_e722a945.JPG",
        illustrationType: "smartCity",
        whatToExpect: "Interactive 3D smart-city architectural models, sustainable transit grid, solar microgrids and automated municipal infrastructure.",
        location: "Design Hall · Urban Innovation Zone",
        coordinator: "Planning & Architecture Cell",
      },
      {
        id: "zone-05",
        num: "05",
        title: "Animation Theatre",
        heading: "Stories Beyond Imagination",
        description:
          "Experience creativity on the big screen through student-created animated films. Discover the art of storytelling, character creation, visual effects and digital animation.",
        color: "#A9D9F4",
        photoSrc: "/assets/aistudio/0O7A0163_3bd04606.JPG",
        illustrationType: "animation",
        whatToExpect: "Short film screenings, character rigging breakdowns, live digital drawing stations with XP-Pen tablets and VFX reels.",
        location: "Auditorium & Department of Animation Studios",
        coordinator: "Department of Animation Faculty",
      },
      {
        id: "zone-06",
        num: "06",
        title: "Innovation Challenge",
        heading: "Think. Solve. Innovate.",
        description:
          "Watch young minds present creative solutions to real-world problems. Discover innovative concepts, working prototypes and ideas that have the potential to make a difference.",
        color: "#F6E9B9",
        photoSrc: "/assets/aistudio/0O7A0206_6bebfdf8.JPG",
        illustrationType: "lightbulb",
        whatToExpect: "Inter-collegiate prototype competition, hands-on maker stalls, problem-solving pitches and jury evaluations.",
        location: "Central Quadrangle Stalls",
        coordinator: "Innovation & Incubation Committee",
      },
      {
        id: "zone-07",
        num: "07",
        title: "Science Magic Arena",
        heading: "Discover the Magic Behind Science",
        description:
          "Experience science in action through fascinating live experiments and demonstrations. Witness surprising scientific phenomena and discover the principles behind them.",
        color: "#C8B9F5",
        photoSrc: "/assets/aistudio/0O7A0086_2b8bd031.JPG",
        illustrationType: "beaker",
        whatToExpect: "High-voltage sparks, chemical color shifts, vortex cannons, optical illusions and hands-on physics wonders.",
        location: "Centenary Quadrangle Open Arena",
        coordinator: "Natural Sciences Faculty",
      },
      {
        id: "zone-08",
        num: "08",
        title: "Green Planet",
        heading: "Innovating for a Sustainable Tomorrow",
        description:
          "Discover how science and innovation can help build a greener, cleaner and more sustainable planet. Explore renewable energy, eco-friendly ideas and environmental solutions.",
        color: "#D5F542",
        photoSrc: "/assets/aistudio/0O7A0062_d0f9c5e4.JPG",
        illustrationType: "windTurbine",
        whatToExpect: "Automated waste segregation models, bio-energy systems, solar innovations and conservation projects.",
        location: "Eco Pavilion · South Lawn",
        coordinator: "Environmental Science Forum",
      },
      {
        id: "zone-09",
        num: "09",
        title: "Esports & Gaming Arena",
        heading: "Battle for Collegiate Championship",
        description:
          "Experience the thrill of collegiate gaming with pro tournament stages, live caster commentary, and free interactive battle stations featuring Valorant, BGMI, and Free Fire.",
        color: "#4549D8",
        photoSrc: "/assets/aistudio/0O7A0466_4f9dfec4.JPG",
        illustrationType: "pixelTrophy",
        whatToExpect: "Collegiate championship finals on LED walls, PS5 racing simulators at Rey Games Castle, and open casual gaming kiosks.",
        location: "Indoor Sports Complex & Esports Stage",
        coordinator: "Esports Operations & Student Gaming League",
      },
    ],
  },

  timeline: {
    eyebrow: "PAST · PRESENT · FUTURE",
    heading: "TECHNOLOGY EVOLVES. CREATIVITY CONTINUES.",
    steps: [
      {
        era: "PAST",
        line: "Vintage technology and early inventions.",
        type: "past",
      },
      {
        era: "PRESENT",
        line: "Digital creativity, computers, animation and connected experiences.",
        type: "present",
      },
      {
        era: "FUTURE",
        line: "Artificial intelligence, smart cities, sustainability and new possibilities.",
        type: "future",
      },
    ],
  },

  esports: {
    heading: "READY TO PLAY? JOIN THE ARENA.",
    subheading: "The second edition of the Supernova Esports Tournament brings collegiate competitive gaming to The National College. Inter-institutional brackets celebrating teamwork, digital skill, and sportsmanship across three premier titles.",
    officialGames: [
      {
        id: "valorant",
        title: "VALORANT",
        genre: "Tactical 5v5 FPS",
        platform: "PC",
        badge: "5v5 TACTICAL SHOOTER",
        badgeColor: "#FF4655",
        accentColor: "#FF4655",
        description: "High-stakes tactical 5v5 shooter showdown. Precise gunplay and strategic ability coordination across official competitive map pools.",
        artworkType: "valorant",
        rulesNotice: "Tournament brackets, fixtures, and match rules to be published by the organising committee.",
        registerQuery: "/register?type=esports&game=valorant",
      },
      {
        id: "bgmi",
        title: "BATTLEGROUNDS MOBILE INDIA (BGMI)",
        genre: "Battle Royale Squads",
        platform: "Mobile",
        badge: "BATTLE ROYALE SQUADS",
        badgeColor: "#F5A623",
        accentColor: "#F5A623",
        description: "Collegiate squad battle royale championship. Tactical rotations, zone positioning, and high-adrenaline firefights on mobile.",
        artworkType: "bgmi",
        rulesNotice: "Qualifying lobby brackets, room codes, and match schedule to be published by the organising committee.",
        registerQuery: "/register?type=esports&game=bgmi",
      },
      {
        id: "freefire",
        title: "FREE FIRE MAX",
        genre: "Survival Battle Royale",
        platform: "Mobile",
        badge: "SURVIVAL BATTLE ROYALE",
        badgeColor: "#FF6A00",
        accentColor: "#FF873D",
        description: "Fast-paced battle royale combat showdown. Quick reflexes, squad synergy, and survival tactics in intense tournament lobbies.",
        artworkType: "freefire",
        rulesNotice: "Tournament lobby rules, points matrix, and qualifier schedules to be published by the organising committee.",
        registerQuery: "/register?type=esports&game=freefire",
      },
    ],
    cards: [
      {
        title: "Approved Games",
        badge: "THREE OFFICIAL TITLES",
        body: "Three official titles headline Supernova Esports 2.0: VALORANT (PC), BGMI (Mobile), and FREE FIRE MAX (Mobile). Early squad registrations are open for collegiate teams across Karnataka.",
        highlights: [
          "VALORANT (5v5 Tactical PC Division)",
          "BGMI (Battle Royale Mobile Division)",
          "FREE FIRE MAX (Survival Mobile Division)",
          "Official tournament match fixtures TBA"
        ]
      },
      {
        title: "Tournament Format",
        badge: "STAGE CHAMPIONSHIP",
        body: "Structured preliminary qualifiers leading to live on-stage finals at The National College campus with student spectator broadcast.",
        highlights: [
          "Preliminary knockout rounds",
          "Championship stage finals",
          "Live caster commentary",
          "Full bracket schedule TBA"
        ]
      },
      {
        title: "Eligibility",
        badge: "STUDENT ACCREDITED",
        body: "Open to full-time enrolled students from recognized schools, pre-university colleges, and degree institutions across Karnataka.",
        highlights: [
          "Enrolled students in Karnataka",
          "Valid student ID required",
          "Verified squad roster details",
          "Official captain contact required"
        ]
      },
      {
        title: "Rules & Fair Play",
        badge: "COMPETITIVE INTEGRITY",
        body: "Strict fair play standards and tournament conduct codes. Match protocols and title-specific rulebooks will be published prior to match play.",
        highlights: [
          "Strict anti-cheat enforcement",
          "Zero tolerance for toxicity",
          "Mandatory check-in punctuality",
          "Official rulebook coming soon"
        ]
      },
    ],
    ctaText: "REGISTER YOUR TEAM",
  },

  saveTheDates: {
    eyebrow: "EVENT DETAILS",
    heading: "SAVE THE DATES.",
    giantDays: "20–21",
    giantMonthYear: "NOVEMBER 2026",
    venueLabel: "Venue",
    venueValue: "The National College, Basavanagudi, Bengaluru – 04",
    timingsLabel: "Timings",
    timingsValue: "TBA",
    openingLabel: "Opening ceremony",
    openingValue: "TBA",
    scheduleTba: "Schedule to be announced",
    announcementsLabel: "Announcements",
    announcementsValue: "No announcements yet",
  },

  galleryPreview: {
    heading: "A GLIMPSE OF WHAT'S POSSIBLE.",
    label: "From previous editions",
    viewAllButton: "View full gallery",
  },

  faq: {
    heading: "FREQUENTLY ASKED QUESTIONS",
    items: [
      {
        question: "General event information",
        answer:
          "SUPERNOVA 3.0 is an Educational Innovation Expo on 20–21 November 2026, organised by The National Education Society of Karnataka.",
      },
      {
        question: "Event participation",
        answer: "Registration is open for participants, visitors and esports teams. Use the Register page.",
      },
      {
        question: "Esports registration",
        answer: "Details coming soon.",
      },
      {
        question: "Venue and timings",
        answer: "The National College, Basavanagudi, Bengaluru – 04. Timings: TBA.",
      },
      {
        question: "Contact information",
        answer: "Helpdesk: animationthenationalcollege@gmail.com",
      },
    ],
  },

  finalCta: {
    heading: "THE FUTURE STARTS WITH AN IDEA.",
    subline: "Come create, connect and celebrate with us at Supernova 3.0.",
    exploreButton: "EXPLORE THE EXPO",
    registerButton: "REGISTER NOW",
  },

  footer: {
    theme: "CREATE. CONNECT. CELEBRATE.",
    tagline: "From the technology that shaped us to the creativity shaping tomorrow.",
    dates: "20–21 November 2026",
    organiserLine: "The National Education Society of Karnataka institutions: The National College, Basavanagudi & National PU College, Jayanagar, with the Department of Animation",
    copyright: "© 2026 The National Education Society of Karnataka. All rights reserved.",
  },

  registerPage: {
    eyebrow: "REGISTRATION",
    heading: "REGISTER FOR SUPERNOVA 3.0",
    datesVenueLine: "20–21 NOVEMBER 2026 · THE NATIONAL COLLEGE, BASAVANAGUDI, BENGALURU – 04",
    chooseLabel: "Choose how you'd like to take part.",
    cards: [
      {
        id: "participation",
        badge: "PARTICIPATE",
        badgeBg: "#D5F542",
        title: "PARTICIPATE",
        line: "Showcase your project, exhibit or idea.",
      },
      {
        id: "visitor",
        badge: "VISIT",
        badgeBg: "#A9D9F4",
        title: "VISIT",
        line: "Attend the expo on one or both days.",
      },
      {
        id: "esports",
        badge: "ESPORTS",
        badgeBg: "#FF873D",
        title: "ESPORTS",
        line: "Register your team.",
      },
    ],
    rulesCheckboxLabel: "Tournament rules [to be approved]",
    privacyCheckboxLabel: "I agree to the privacy policy [text to be approved]",
    notConnectedBannerTitle: "Form not connected yet",
    notConnectedBannerText:
      "Form endpoint not configured yet. Please submit your registration details via the email fallback below:",
    mailtoFallbackButton: "Submit details via email",
    successTitle: "You're registered",
    successSubtitle: "Thank you for registering for SUPERNOVA 3.0.",
    retryButtonText: "Retry submission",
  },
};
