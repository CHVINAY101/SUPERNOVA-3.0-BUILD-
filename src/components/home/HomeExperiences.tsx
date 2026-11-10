import type { ReactNode } from "react";

interface ExperienceItem {
  id: string;
  title: string;
  category: string;
  panelClass: string;
  icon: ReactNode;
  description: string;
}

export const HomeExperiences = () => {
  const experiences: ExperienceItem[] = [
    {
      id: "science-expo",
      title: "Science Expo",
      category: "ZONE 01",
      panelClass: "panel-lime",
      icon: (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#151535" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
      ),
      description: "Cutting-edge science exhibits, working physical prototypes, energy demonstrations, and interactive experiments.",
    },
    {
      id: "animation-showcase",
      title: "Animation & VFX",
      category: "ZONE 02",
      panelClass: "panel-magenta",
      icon: (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      ),
      description: "Screenings of original animated shorts, 3D character rigs, concept art galleries, and VFX breakdowns.",
    },
    {
      id: "esports-arena",
      title: "Esports Arena",
      category: "ZONE 03",
      panelClass: "panel-orange",
      icon: (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 12h4m-2-2v4" />
        </svg>
      ),
      description: "High-intensity collegiate tournaments in competitive games with live commentary and grand auditorium finals.",
    },
    {
      id: "ideas-in-motion",
      title: "Ideas in Motion",
      category: "ZONE 04",
      panelClass: "panel-blue",
      icon: (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      ),
      description: "Innovation pitch decks, real-world social impact projects, and interdisciplinary student startup proposals.",
    },
    {
      id: "school-innovators",
      title: "School Innovators",
      category: "PAVILION",
      panelClass: "panel-lime",
      icon: (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#151535" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      ),
      description: "Young creators and junior scientists from our high schools and PU colleges presenting ingenious models and crafts.",
    },
    {
      id: "retro-tech",
      title: "Retro Tech History",
      category: "INTERACTIVE",
      panelClass: "panel-purple",
      icon: (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="12" rx="2" />
          <line x1="8" y1="20" x2="16" y2="20" />
          <line x1="12" y1="16" x2="12" y2="20" />
        </svg>
      ),
      description: "A hands-on walk through computing milestones: CRT displays, floppy disks, classic cassettes, and vintage arcade hardware.",
    },
    {
      id: "creative-workshops",
      title: "Masterclass Hub",
      category: "WORKSHOPS",
      panelClass: "panel-orange",
      icon: (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      description: "Interactive masterclasses led by industry mentors covering character modeling, digital illustration, and game design.",
    },
    {
      id: "industry-mentorship",
      title: "Industry Connect",
      category: "KEYNOTES",
      panelClass: "panel-magenta",
      icon: (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      description: "Networking roundtables connecting aspiring animators, coders, and creators with experienced creative leads.",
    },
  ];

  return (
    <section id="experiences" className="section-padding bg-white" style={{ scrollMarginTop: "80px" }}>
      <div className="site-container">
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-16">
          <span className="section-label">EXPERIENCES & HIGHLIGHTS</span>
          <h2 className="section-heading">Eight Flagship Arenas</h2>
          <p className="section-subtitle">
            Explore diverse venues designed to ignite imagination, foster interdisciplinary collaboration, and spotlight talent across all age groups.
          </p>
        </div>

        {/* 8 Cards: 4 cols on desktop, 2 on tablet, stacked on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {experiences.map((exp) => (
            <div key={exp.id} className="brand-card">
              <div className={`card-illustration-panel ${exp.panelClass}`}>
                {exp.icon}
                <span className="absolute top-3 left-3 bg-[#151535]/80 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-sm">
                  {exp.category}
                </span>
              </div>
              <div className="card-body">
                <h3 className="card-title text-lg">{exp.title}</h3>
                <p className="card-desc text-sm">{exp.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
