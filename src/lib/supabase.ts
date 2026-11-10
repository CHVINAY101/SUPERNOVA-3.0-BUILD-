import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawSupabaseUrl = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.SUPABASE_URL as string | undefined)
)?.trim();

const rawSupabaseAnonKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.SUPABASE_PUBLISHABLE_KEY as string | undefined)
)?.trim();

function normalizeSupabaseUrl(url?: string): string | undefined {
  if (!url) return undefined;
  let clean = url.trim().replace(/\/+$/, "");
  // Strip /rest/v1 if inadvertently included in environment URL
  clean = clean.replace(/\/rest\/v1\/?$/i, "");
  return clean;
}

const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
const supabaseAnonKey = rawSupabaseAnonKey;

export const isConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith("http") &&
  !supabaseUrl.includes("your-project")
);

export const isMockAllowed = import.meta.env.VITE_USE_MOCK !== "false";
export const isMockMode = !isConfigured && isMockAllowed;
export const isMisconfigured = !isConfigured && !isMockAllowed;

export function getSupabaseConnectionInfo() {
  return {
    isConfigured,
    isMockMode,
    url: supabaseUrl || null,
    hasAnonKey: Boolean(supabaseAnonKey),
  };
}

interface TableStore {
  [table: string]: Record<string, any>[];
}

const initialStore: TableStore = {
  event_settings: [
    { id: "s1", key: "event_title", label: "Event Title", value: "SUPERNOVA 3.0", is_published: true, category: "general" },
    { id: "s2", key: "event_tagline", label: "Event Tagline", value: "WHERE IDEAS COME ALIVE.", is_published: true, category: "general" },
    { id: "s3", key: "event_supporting", label: "Supporting Line", value: "A celebration of science, creativity, innovation and competition.", is_published: true, category: "general" },
    { id: "s4", key: "event_dates", label: "Event Dates", value: "20–21 November 2026", is_published: true, category: "general" },
    { id: "s5", key: "venue", label: "Venue", value: "The National College, Basavanagudi, Bengaluru", is_published: true, category: "general" },
    { id: "s6", key: "daily_start_time", label: "Daily Start Time", value: "09:00 AM", is_published: true, category: "general" },
    { id: "s7", key: "daily_end_time", label: "Daily End Time", value: "06:00 PM", is_published: true, category: "general" },
    { id: "s8", key: "registration_open", label: "Registration Opening Date", value: "1 October 2026", is_published: true, category: "registration" },
    { id: "s9", key: "registration_close", label: "Registration Closing Date", value: "15 November 2026", is_published: true, category: "registration" },
    { id: "s10", key: "registration_fee", label: "Registration Fee", value: "Free entry for visitors; Esports entry to be announced", is_published: true, category: "registration" },
    { id: "s11", key: "eligibility", label: "Eligibility", value: "Open to school students, college teams, educators, families and professionals", is_published: true, category: "registration" },
    { id: "s12", key: "contact_phone", label: "Contact Phone", value: "+91 80 2667 4441", is_published: true, category: "contact" },
    { id: "s13", key: "contact_whatsapp", label: "WhatsApp", value: "+91 98450 12345", is_published: true, category: "contact" },
    { id: "s14", key: "contact_email", label: "Contact Email", value: "supernova@nationalcollege.edu", is_published: true, category: "contact" },
    { id: "s15", key: "organiser_line", label: "Organiser Line", value: "National Education Society of Karnataka", is_published: true, category: "general" },
    { id: "s16", key: "privacy_notice", label: "Privacy Notice", value: "Contact information is used solely for registration confirmation, pass distribution, and official festival announcements.", is_published: true, category: "general" },
  ],
  games: [
    {
      id: "game-valorant",
      title: "VALORANT",
      team_size: 5,
      rules: "5v5 tactical shooter. Official tournament rules. Best of 1 for preliminary brackets, Best of 3 for Semifinals and Grand Finals. Competitive map pool.",
      is_active: true,
      is_published: true,
      sort_order: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "game-freefire",
      title: "FREE FIRE",
      team_size: 4,
      rules: "Battle Royale squad tournament. 4 matches played across Bermuda and Kalahari. Placement points + elimination points determine stage ranking.",
      is_active: true,
      is_published: true,
      sort_order: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "game-bgmi",
      title: "BGMI",
      team_size: 4,
      rules: "Battlegrounds Mobile India championship tournament. Squad format, Erangel and Miramar maps. Standard competitive tier scoring system.",
      is_active: true,
      is_published: true,
      sort_order: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  schedule_items: [
    {
      id: "sch-1",
      event_date: "2026-11-20",
      start_time: "09:30:00",
      end_time: "10:45:00",
      title: "Grand Festival Inauguration & Keynote",
      venue: "Main Auditorium",
      component: "general",
      is_published: true,
      sort_order: 1,
    },
    {
      id: "sch-2",
      event_date: "2026-11-20",
      start_time: "10:45:00",
      end_time: "17:00:00",
      title: "Science Expo & Working Model Pavilion",
      venue: "Science Block Quadrangle",
      component: "science_expo",
      is_published: true,
      sort_order: 2,
    },
    {
      id: "sch-3",
      event_date: "2026-11-20",
      start_time: "11:00:00",
      end_time: "17:30:00",
      title: "School Kids' Creative Exhibition",
      venue: "Central Courtyard & Activity Hall",
      component: "school_exhibition",
      is_published: true,
      sort_order: 3,
    },
    {
      id: "sch-4",
      event_date: "2026-11-20",
      start_time: "11:30:00",
      end_time: "18:00:00",
      title: "Esports Tournament: Group Stages (VALORANT, BGMI, Free Fire)",
      venue: "Esports Arena (Indoor Sports Hall)",
      component: "esports",
      is_published: true,
      sort_order: 4,
    },
    {
      id: "sch-5",
      event_date: "2026-11-21",
      start_time: "09:30:00",
      end_time: "14:30:00",
      title: "Department of Animation Showcase & VFX Screening",
      venue: "Design Studio & Digital Theatre",
      component: "animation",
      is_published: true,
      sort_order: 5,
    },
    {
      id: "sch-6",
      event_date: "2026-11-21",
      start_time: "14:30:00",
      end_time: "17:30:00",
      title: "Esports Championship Grand Finals & Trophy Ceremony",
      venue: "Main Auditorium",
      component: "esports",
      is_published: true,
      sort_order: 6,
    },
  ],
  announcements: [
    {
      id: "ann-1",
      title: "Supernova 3.0 Official Dates Announced: 20–21 November 2026",
      body: "National Education Society of Karnataka is proud to announce the return of Supernova 3.0 at The National College campus. Two full days of science exhibitions, creative showcases, animation features, and collegiate esports tournaments.",
      is_pinned: true,
      is_published: true,
      published_at: "2026-10-10T10:00:00Z",
    },
    {
      id: "ann-2",
      title: "Three Registration Portals Now Open (Participation, Visitor & Esports)",
      body: "Visitors, student project exhibitors, and competitive esports rosters can now officially submit registrations online. All four experience zones will be active across both event days.",
      is_pinned: false,
      is_published: true,
      published_at: "2026-10-15T12:00:00Z",
    },
    {
      id: "ann-3",
      title: "Animation Department Premieres Student 3D Short Film Showcase",
      body: "The Department of Animation will exhibit original student VFX projects, character animation reels, interactive 3D demos, and concept art portfolios in the newly upgraded media lab.",
      is_pinned: false,
      is_published: true,
      published_at: "2026-10-22T08:30:00Z",
    },
  ],
  faq_items: [
    {
      id: "faq-1",
      question: "What is SUPERNOVA 3.0?",
      answer: "SUPERNOVA 3.0 is a flagship multi-disciplinary festival bringing together science, young student innovation, animation arts, and esports competition under the aegis of National Education Society of Karnataka institutions.",
      category: "general",
      is_published: true,
      sort_order: 1,
    },
    {
      id: "faq-2",
      question: "Is visitor entry free of charge?",
      answer: "Yes, visitor entry to the science expo, school exhibitions, animation showcases, and spectator seating is free. Pre-registration online is encouraged for campus pass issuance.",
      category: "general",
      is_published: true,
      sort_order: 2,
    },
    {
      id: "faq-3",
      question: "Where is The National College located?",
      answer: "The festival takes place at The National College campus, Pampa Mahakavi Road, Basavanagudi, Bengaluru. The campus is directly situated across from the National College Metro Station (Namma Metro Green Line).",
      category: "venue",
      is_published: true,
      sort_order: 3,
    },
    {
      id: "faq-4",
      question: "How do team registrations work for Esports?",
      answer: "Team representatives must register their exact team rosters: 5 players for VALORANT, 4 players for FREE FIRE, and 4 players for BGMI. Roster confirmation and schedule brackets will be communicated via official email.",
      category: "esports",
      is_published: true,
      sort_order: 4,
    },
    {
      id: "faq-5",
      question: "Who can submit exhibits in the Science Expo and School Exhibition?",
      answer: "Students from schools and colleges can register projects under the Participation registration form. Selected exhibits will be allocated dedicated display stalls.",
      category: "participation",
      is_published: true,
      sort_order: 5,
    },
  ],
  gallery_items: [
    {
      id: "gal-1",
      title: "Science & Robotics Innovations",
      description: "Interactive working science models and robotics exhibits by student innovators.",
      image_url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80",
      category: "science_expo",
      is_published: true,
      sort_order: 1,
    },
    {
      id: "gal-2",
      title: "School Kids' Creative Project Gallery",
      description: "Vibrant creative models, environmental ideas, and artistic creations from school students.",
      image_url: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80",
      category: "school_exhibition",
      is_published: true,
      sort_order: 2,
    },
    {
      id: "gal-3",
      title: "Digital Animation & Concept Art Reel",
      description: "Visual storytelling, 3D character design, and VFX breakdowns from the Animation Department.",
      image_url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80",
      category: "animation",
      is_published: true,
      sort_order: 3,
    },
    {
      id: "gal-4",
      title: "Esports Tournament Battle Arena",
      description: "Collegiate squads competing live on the tournament stage with spirited spectator cheering.",
      image_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
      category: "esports",
      is_published: true,
      sort_order: 4,
    },
    {
      id: "gal-5",
      title: "Interactive Laboratory Demonstration",
      description: "Hands-on physics and chemistry demonstrations exploring natural phenomena.",
      image_url: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80",
      category: "science_expo",
      is_published: true,
      sort_order: 5,
    },
    {
      id: "gal-6",
      title: "Auditorium Stage Ceremony",
      description: "Keynote presentation and felicitation of young talent.",
      image_url: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80",
      category: "general",
      is_published: true,
      sort_order: 6,
    },
  ],
  institutions: [
    {
      id: "inst-1",
      name: "The National College",
      role: "Host Campus & Premier Higher Education Institution",
      description: "Founded in 1945, a historic landmark in Basavanagudi fostering science, humanities, arts, and competitive excellence.",
      is_published: true,
      sort_order: 1,
    },
    {
      id: "inst-2",
      name: "National PU College",
      role: "Pre-University Academic Partner",
      description: "Nurturing top-ranking pre-university minds with rigorous academic foundations and experiential science clubs.",
      is_published: true,
      sort_order: 2,
    },
    {
      id: "inst-3",
      name: "National English School",
      role: "Primary & Middle School Education Partner",
      description: "Fostering early curiosity, foundational scientific thinking, and creative expression in school-age learners.",
      is_published: true,
      sort_order: 3,
    },
    {
      id: "inst-4",
      name: "National High School",
      role: "Secondary School Academic Partner",
      description: "One of Karnataka's oldest and most prestigious secondary institutions, inspiring generations of scientists and thinkers.",
      is_published: true,
      sort_order: 4,
    },
  ],
  sponsors: [
    {
      id: "sp-1",
      name: "National Education Society of Karnataka",
      tier: "Apex Organiser",
      description: "Guiding 18+ premier educational institutions across Karnataka since 1917.",
      logo_url: "/logo.svg",
      link_url: "https://nationalcollege.edu",
      is_published: true,
      sort_order: 1,
    },
    {
      id: "sp-2",
      name: "Department of Animation",
      tier: "Co-Host Department",
      description: "Center of excellence for digital arts, motion graphics, and VFX curriculum.",
      logo_url: "/logo.svg",
      link_url: null,
      is_published: true,
      sort_order: 2,
    },
  ],
  site_content: [
    {
      id: "cnt-1",
      section: "home",
      title: "WHERE IDEAS COME ALIVE.",
      body: "Supernova 3.0 brings together science, creativity, imagination and technology through a celebration of ideas and talent across four vibrant experiences.",
      is_published: true,
      sort_order: 1,
    },
    {
      id: "cnt-2",
      section: "about",
      title: "The Supernova Vision",
      body: "Supernova 3.0 is an inter-institutional celebration of discovery, creativity, and competition organised by National Education Society of Karnataka.",
      is_published: true,
      sort_order: 2,
    },
    {
      id: "cnt-3",
      section: "science_expo",
      title: "Science & Innovation Expo",
      body: "Discover the fascinating world of science through experiments, innovative models, interactive demonstrations and ideas that bring learning to life.",
      is_published: true,
      sort_order: 3,
    },
    {
      id: "cnt-4",
      section: "school_exhibition",
      title: "School Kids' Exhibition",
      body: "Celebrate the creativity and imagination of young minds as school students present their ideas, projects, artwork and talents.",
      is_published: true,
      sort_order: 4,
    },
    {
      id: "cnt-5",
      section: "animation",
      title: "Department of Animation Showcase",
      body: "Step into the world of digital creativity and visual storytelling. Explore animation, graphic design, visual effects and the art of bringing imagination to life.",
      is_published: true,
      sort_order: 5,
    },
    {
      id: "cnt-6",
      section: "esports",
      title: "Supernova Esports Tournament — Second Edition",
      body: "Experience the excitement of competitive gaming, teamwork, strategy and digital sports across VALORANT, FREE FIRE, and BGMI.",
      is_published: true,
      sort_order: 6,
    },
  ],
  registrations: [
    {
      id: "reg-1",
      registration_ref: "SN3-ESP-104921",
      team_name: "Apex Phoenix",
      game_id: "game-valorant",
      captain_name: "Rohan Sharma",
      email: "rohan.sharma@example.com",
      phone: "9876543210",
      institution: "The National College",
      status: "confirmed",
      admin_notes: "Roster verified with institutional ID cards.",
      submitted_at: "2026-10-25T11:20:00Z",
    },
    {
      id: "reg-2",
      registration_ref: "SN3-ESP-104922",
      team_name: "Shadow Blitz",
      game_id: "game-bgmi",
      captain_name: "Vikram Gowda",
      email: "vikram.g@example.com",
      phone: "9812345678",
      institution: "National PU College",
      status: "pending",
      admin_notes: "Awaiting phone verification.",
      submitted_at: "2026-10-26T14:10:00Z",
    },
  ],
  visitor_registrations: [
    {
      id: "vis-1",
      registration_ref: "SN3-VIS-205118",
      full_name: "Ananya Rao",
      email: "ananya.rao@example.com",
      phone: "9844011223",
      institution: "Bangalore University",
      visitor_category: "college_student",
      visitor_count: 1,
      status: "confirmed",
      admin_notes: "General pass sent via email.",
      submitted_at: "2026-10-27T09:30:00Z",
    },
    {
      id: "vis-2",
      registration_ref: "SN3-VIS-205119",
      full_name: "Dr. Suresh Murthy",
      email: "suresh.m@example.com",
      phone: "9845099887",
      institution: "National English School",
      visitor_category: "educator",
      visitor_count: 4,
      status: "confirmed",
      admin_notes: "Faculty group visit passes allocated.",
      submitted_at: "2026-10-28T16:45:00Z",
    },
  ],
  participation_registrations: [
    {
      id: "part-1",
      registration_ref: "SN3-PRT-309101",
      full_name: "Divya Prakash",
      email: "divya.p@example.com",
      phone: "9880012345",
      institution: "The National College",
      participant_category: "college_student",
      participation_area: "Science Expo",
      project_title: "Solar IoT Smart Irrigation System",
      project_description: "Automated low-cost moisture sensing and drip controller powered by small-panel PV cell.",
      team_members_count: 3,
      status: "confirmed",
      admin_notes: "Stall #B12 assigned in Science Quadrangle.",
      submitted_at: "2026-10-26T10:00:00Z",
    },
    {
      id: "part-2",
      registration_ref: "SN3-PRT-309102",
      full_name: "Tanmay Hegde",
      email: "tanmay.h@example.com",
      phone: "9741098765",
      institution: "National High School",
      participant_category: "school_student",
      participation_area: "School Kids' Exhibition",
      project_title: "Eco-Friendly Biodegradable Polymers",
      project_description: "Extraction of starch-based bioplastic prototypes using potato and corn peelings.",
      team_members_count: 2,
      status: "pending",
      admin_notes: "Reviewing safety requirements for lab stall.",
      submitted_at: "2026-10-27T15:20:00Z",
    },
  ],
  media_items: [
    {
      id: "med-1",
      title: "Supernova Official Vector Logo",
      url: "/logo.svg",
      alt_text: "Official Supernova 3.0 festival emblem",
      caption: "Vector asset from NES Karnataka",
      file_size: "78 KB",
      created_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "med-2",
      title: "Science Expo Quadrangle Exhibit",
      url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80",
      alt_text: "Student laboratory exhibit demonstration",
      caption: "Exhibition display showcase",
      file_size: "340 KB",
      created_at: "2026-10-15T00:00:00Z",
    },
  ],
  players: [
    { id: "pl-1", registration_id: "reg-1", player_name: "Rohan Sharma", gamer_tag: "Phoenix#001", check_in_status: "not_checked_in" },
    { id: "pl-2", registration_id: "reg-1", player_name: "Aditya Verma", gamer_tag: "Viper#002", check_in_status: "not_checked_in" },
    { id: "pl-3", registration_id: "reg-1", player_name: "Karan Patel", gamer_tag: "Sova#003", check_in_status: "not_checked_in" },
    { id: "pl-4", registration_id: "reg-1", player_name: "Nikhil Joshi", gamer_tag: "Jett#004", check_in_status: "not_checked_in" },
    { id: "pl-5", registration_id: "reg-1", player_name: "Sameer Khan", gamer_tag: "Omen#005", check_in_status: "not_checked_in" },
  ],
  matches: [
    { id: "mat-1", game_id: "game-valorant", round: "Quarterfinals", status: "upcoming", score_a: 0, score_b: 0, is_published: true },
    { id: "mat-2", game_id: "game-bgmi", round: "Group Stage Match 1", status: "upcoming", score_a: 0, score_b: 0, is_published: true },
  ],
  audit_logs: [],
  registration_controls: [
    {
      form_type: "esports",
      is_open: true,
      closed_message: "Esports squad registrations are currently closed.",
      opens_at: null,
      closes_at: null,
      intro_text: "Register team rosters for collegiate championships in VALORANT (5 players), FREE FIRE (4 players), or BGMI (4 players).",
      consent_text: "I confirm all team members are enrolled students and understand the tournament rules and schedule.",
      updated_at: new Date().toISOString(),
      updated_by: null,
    },
    {
      form_type: "participation",
      is_open: true,
      closed_message: "Student project & exhibit registrations are currently closed.",
      opens_at: null,
      closes_at: null,
      intro_text: "For student innovators, research teams, school inventors, and animators showcasing projects in dedicated stalls.",
      consent_text: "I confirm the exhibit contents are student work and agree to festival safety and attendance guidelines.",
      updated_at: new Date().toISOString(),
      updated_by: null,
    },
    {
      form_type: "visitor",
      is_open: true,
      closed_message: "Visitor registrations are currently closed.",
      opens_at: null,
      closes_at: null,
      intro_text: "Free festival admission for school & college students, parents, teachers, and general visitors across both days.",
      consent_text: "I understand that visitor entry is subject to campus capacity and event security policies.",
      updated_at: new Date().toISOString(),
      updated_by: null,
    },
  ],
  form_options: [
    { id: "fo-1", form_type: "participation", field_key: "participant_category", label: "School Student (Classes 6–10)", value: "School Student (Classes 6–10)", sort_order: 1, is_active: true },
    { id: "fo-2", form_type: "participation", field_key: "participant_category", label: "PUC / High School (+2)", value: "PUC / High School (+2)", sort_order: 2, is_active: true },
    { id: "fo-3", form_type: "participation", field_key: "participant_category", label: "Undergraduate / College Team", value: "Undergraduate / College Team", sort_order: 3, is_active: true },
    { id: "fo-4", form_type: "participation", field_key: "participant_category", label: "Independent Innovator", value: "Independent Innovator", sort_order: 4, is_active: true },
    { id: "fo-5", form_type: "participation", field_key: "participation_area", label: "Science Expo (Working Models & Experiments)", value: "Science Expo (Working Models & Experiments)", sort_order: 1, is_active: true },
    { id: "fo-6", form_type: "participation", field_key: "participation_area", label: "School Exhibition (Creative Innovations)", value: "School Exhibition (Creative Innovations)", sort_order: 2, is_active: true },
    { id: "fo-7", form_type: "participation", field_key: "participation_area", label: "Animation Showcase (VFX, 3D & Digital Reel)", value: "Animation Showcase (VFX, 3D & Digital Reel)", sort_order: 3, is_active: true },
    { id: "fo-8", form_type: "visitor", field_key: "visitor_category", label: "School student", value: "School student", sort_order: 1, is_active: true },
    { id: "fo-9", form_type: "visitor", field_key: "visitor_category", label: "College student", value: "College student", sort_order: 2, is_active: true },
    { id: "fo-10", form_type: "visitor", field_key: "visitor_category", label: "Teacher or educator", value: "Teacher or educator", sort_order: 3, is_active: true },
    { id: "fo-11", form_type: "visitor", field_key: "visitor_category", label: "Parent or guardian", value: "Parent or guardian", sort_order: 4, is_active: true },
    { id: "fo-12", form_type: "visitor", field_key: "visitor_category", label: "Working professional", value: "Working professional", sort_order: 5, is_active: true },
    { id: "fo-13", form_type: "visitor", field_key: "visitor_category", label: "General visitor", value: "General visitor", sort_order: 6, is_active: true },
    { id: "fo-14", form_type: "visitor", field_key: "visitor_category", label: "Other", value: "Other", sort_order: 7, is_active: true },
  ],
  user_roles: [
    { id: "ur-1", user_id: "mock-super-admin-id", role: "super_admin", created_at: new Date().toISOString() },
  ],
};

function createMockClient(): any {
  console.info(
    "[AI Studio] Running with in-memory database stub (DEMO MODE)."
  );

  const store: TableStore = JSON.parse(JSON.stringify(initialStore));
  let currentSession: any = null; // Security-first: start unauthenticated
  const authListeners = new Set<(event: string, session: any) => void>();

  function createQueryBuilder(tableName: string) {
    let filters: Array<(row: Record<string, any>) => boolean> = [];
    let sorters: Array<(a: any, b: any) => number> = [];
    let limitCount: number | null = null;
    let selectFields: string[] | null = null;
    let isCountOnly = false;

    if (!store[tableName]) {
      store[tableName] = [];
    }

    const builder: any = {
      select(fields = "*", options?: { count?: string; head?: boolean }) {
        if (options?.head) {
          isCountOnly = true;
        }
        if (fields && fields !== "*") {
          selectFields = fields.split(",").map((s) => s.trim());
        }
        return builder;
      },
      eq(field: string, value: any) {
        filters.push((row) => row[field] === value);
        return builder;
      },
      neq(field: string, value: any) {
        filters.push((row) => row[field] !== value);
        return builder;
      },
      order(field: string, options?: { ascending?: boolean }) {
        const asc = options?.ascending !== false;
        sorters.push((a, b) => {
          const valA = a[field];
          const valB = b[field];
          if (valA === valB) return 0;
          if (valA == null) return asc ? 1 : -1;
          if (valB == null) return asc ? -1 : 1;
          return asc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
        });
        return builder;
      },
      limit(n: number) {
        limitCount = n;
        return builder;
      },
      async insert(payload: any) {
        const items = Array.isArray(payload) ? payload : [payload];
        const inserted = items.map((item) => ({
          id: item.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || new Date().toISOString(),
          ...item,
        }));
        store[tableName].push(...inserted);

        // Record audit log for tracked tables
        if (tableName !== "audit_logs") {
          store.audit_logs?.unshift({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            actor_id: currentSession?.user?.email || "mock-super-admin@supernova.edu",
            action: "INSERT",
            entity_type: tableName,
            entity_id: inserted[0]?.id || "multiple",
            metadata: { count: inserted.length, summary: "Record added via Admin CMS" },
            created_at: new Date().toISOString(),
          });
        }

        return { data: Array.isArray(payload) ? inserted : inserted[0], error: null };
      },
      async update(payload: any) {
        let updatedCount = 0;
        store[tableName] = store[tableName].map((row) => {
          const match = filters.every((fn) => fn(row));
          if (match) {
            updatedCount++;
            return { ...row, ...payload, updated_at: new Date().toISOString() };
          }
          return row;
        });

        // Record audit log for tracked tables
        if (tableName !== "audit_logs") {
          store.audit_logs?.unshift({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            actor_id: currentSession?.user?.email || "mock-super-admin@supernova.edu",
            action: "UPDATE",
            entity_type: tableName,
            entity_id: "filtered",
            metadata: { updatedCount, fields: Object.keys(payload) },
            created_at: new Date().toISOString(),
          });
        }

        return { data: payload, error: null, count: updatedCount };
      },
      async delete() {
        const before = store[tableName].length;
        store[tableName] = store[tableName].filter((row) => !filters.every((fn) => fn(row)));
        const deletedCount = before - store[tableName].length;

        // Record audit log for tracked tables
        if (tableName !== "audit_logs") {
          store.audit_logs?.unshift({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            actor_id: currentSession?.user?.email || "mock-super-admin@supernova.edu",
            action: "DELETE",
            entity_type: tableName,
            entity_id: "filtered",
            metadata: { deletedCount },
            created_at: new Date().toISOString(),
          });
        }

        return { data: null, error: null };
      },
      then(onfulfilled: (res: any) => any, onrejected?: (err: any) => any) {
        let rows = [...store[tableName]];
        for (const fn of filters) {
          rows = rows.filter(fn);
        }
        for (const sorter of sorters) {
          rows.sort(sorter);
        }
        const totalCount = rows.length;
        if (limitCount !== null) {
          rows = rows.slice(0, limitCount);
        }
        if (selectFields && selectFields.length > 0) {
          rows = rows.map((row) => {
            const projected: Record<string, any> = {};
            for (const f of selectFields!) {
              if (f in row) {
                projected[f] = row[f];
              }
            }
            return projected;
          });
        }
        const result = {
          data: isCountOnly ? null : rows,
          count: totalCount,
          error: null,
        };
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  return {
    from(tableName: string) {
      return createQueryBuilder(tableName);
    },
    rpc(fnName: string, args?: Record<string, any>) {
      if (fnName === "is_admin" || fnName === "is_content_admin" || fnName === "is_checkin_staff" || fnName === "is_score_operator") {
        return Promise.resolve({ data: Boolean(currentSession?.user), error: null });
      }
      if (fnName === "submit_visitor_registration") {
        const control = store.registration_controls?.find((r) => r.form_type === "visitor");
        if (control && !control.is_open) {
          return Promise.resolve({ data: null, error: { message: `Registrations are closed: ${control.closed_message || "Registrations are currently closed."}` } });
        }
        const ref = `SN3-VIS-${Math.floor(100000 + Math.random() * 900000)}`;
        store.visitor_registrations.unshift({
          id: `vis-${Date.now()}`,
          registration_ref: ref,
          full_name: args?.p_full_name ?? "",
          email: args?.p_email ?? "",
          phone: args?.p_phone ?? "",
          institution: args?.p_institution ?? "",
          visitor_category: args?.p_visitor_category ?? "student",
          visitor_count: args?.p_visitor_count ?? 1,
          status: "pending",
          submitted_at: new Date().toISOString(),
        });
        return Promise.resolve({ data: ref, error: null });
      }
      if (fnName === "submit_participation_registration") {
        const control = store.registration_controls?.find((r) => r.form_type === "participation");
        if (control && !control.is_open) {
          return Promise.resolve({ data: null, error: { message: `Registrations are closed: ${control.closed_message || "Registrations are currently closed."}` } });
        }
        const ref = `SN3-PRT-${Math.floor(100000 + Math.random() * 900000)}`;
        store.participation_registrations.unshift({
          id: `prt-${Date.now()}`,
          registration_ref: ref,
          full_name: args?.p_full_name ?? "",
          email: args?.p_email ?? "",
          phone: args?.p_phone ?? "",
          institution: args?.p_institution ?? "",
          participant_category: args?.p_category ?? "college_student",
          participation_area: args?.p_area ?? "Science Expo",
          project_title: args?.p_project_title ?? "",
          project_description: args?.p_project_description ?? "",
          team_members_count: args?.p_team_size ?? 1,
          status: "pending",
          submitted_at: new Date().toISOString(),
        });
        return Promise.resolve({ data: ref, error: null });
      }
      if (fnName === "submit_esports_registration") {
        const control = store.registration_controls?.find((r) => r.form_type === "esports");
        if (control && !control.is_open) {
          return Promise.resolve({ data: null, error: { message: `Registrations are closed: ${control.closed_message || "Registrations are currently closed."}` } });
        }
        const ref = `SN3-ESP-${Math.floor(100000 + Math.random() * 900000)}`;
        const regId = `reg-${Date.now()}`;
        store.registrations.unshift({
          id: regId,
          registration_ref: ref,
          team_name: args?.p_team_name ?? "",
          game_id: args?.p_game_id ?? "",
          captain_name: args?.p_captain_name ?? "",
          email: args?.p_email ?? "",
          phone: args?.p_phone ?? "",
          institution: args?.p_institution ?? "",
          status: "pending",
          submitted_at: new Date().toISOString(),
        });
        if (Array.isArray(args?.p_players)) {
          args?.p_players.forEach((p: any, idx: number) => {
            store.players.push({
              id: `pl-${Date.now()}-${idx}`,
              registration_id: regId,
              player_name: p?.player_name ?? "",
              gamer_tag: p?.gamer_tag ?? "",
              check_in_status: "not_checked_in",
            });
          });
        }
        return Promise.resolve({ data: ref, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    storage: {
      from(bucketName: string) {
        return {
          async upload(filePath: string, file: any) {
            let publicUrl = `/assets/${filePath}`;
            if (typeof window !== "undefined") {
              try {
                if (file instanceof Blob || file instanceof File) {
                  publicUrl = URL.createObjectURL(file);
                }
              } catch {
                // fallback
              }
            }
            return {
              data: {
                path: filePath,
                id: `storage-${Date.now()}`,
                fullPath: `${bucketName}/${filePath}`,
                publicUrl,
              },
              error: null,
            };
          },
          getPublicUrl(filePath: string) {
            return {
              data: {
                publicUrl:
                  filePath.startsWith("http") || filePath.startsWith("blob:") || filePath.startsWith("data:")
                    ? filePath
                    : `/assets/${filePath}`,
              },
            };
          },
          async remove(paths: string[]) {
            return { data: paths.map((p) => ({ name: p })), error: null };
          },
        };
      },
    },
    auth: {
      async getSession() {
        return { data: { session: currentSession }, error: null };
      },
      onAuthStateChange(callback: (event: string, session: any) => void) {
        authListeners.add(callback);
        setTimeout(() => callback("INITIAL_SESSION", currentSession), 0);
        return {
          data: {
            subscription: {
              unsubscribe() {
                authListeners.delete(callback);
              },
            },
          },
        };
      },
      async signInWithPassword({ email }: { email: string; password?: string }) {
        currentSession = {
          user: { id: "mock-super-admin-id", email: email || "admin@supernova.org" },
          access_token: "mock-supernova-token",
          token_type: "bearer",
        };
        authListeners.forEach((cb) => cb("SIGNED_IN", currentSession));
        return { data: { user: currentSession.user, session: currentSession }, error: null };
      },
      async signOut() {
        currentSession = null;
        authListeners.forEach((cb) => cb("SIGNED_OUT", null));
        return { error: null };
      },
    },
    channel(name: string) {
      const channelObj = {
        name,
        on(_type: string, _filter: any, _callback: (payload: any) => void) {
          return channelObj;
        },
        subscribe(statusCallback?: (status: string) => void) {
          if (statusCallback) {
            setTimeout(() => statusCallback("SUBSCRIBED"), 0);
          }
          return channelObj;
        },
        unsubscribe() {
          return Promise.resolve("ok");
        },
      };
      return channelObj;
    },
    removeChannel(_channel: any) {
      return Promise.resolve("ok");
    },
  };
}

const mockClient = createMockClient();



function createProductionClient(): SupabaseClient {
  // If explicitly requested mock mode and not configured, use local stub
  if (!isConfigured) {
    if (isMockAllowed) {
      console.info("[AI Studio] Supabase credentials not found. Using local test store.");
      return mockClient as SupabaseClient;
    }
    console.warn("[AI Studio] Supabase is not configured and mock mode is disallowed.");
    return mockClient as SupabaseClient;
  }

  // Real production Supabase Client — direct connection to live Postgres database
  // Silent in-memory fallbacks removed for data integrity and real persistence.
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase: SupabaseClient = createProductionClient();

