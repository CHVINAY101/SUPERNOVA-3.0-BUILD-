import { CONFIG } from "@/config";

export const HomeAbout = () => {
  return (
    <section id="about" className="section-padding bg-white" style={{ scrollMarginTop: "80px" }}>
      <div className="site-container">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-16">
          <span className="section-label">ABOUT SUPERNOVA 3.0</span>
          <h2 className="section-heading">Where Ideas Come Alive</h2>
          <p className="section-subtitle">
            From the technology that shaped us to the creativity shaping tomorrow. {CONFIG.EVENT_NAME} is an educational innovation festival uniting students, animators, engineers, and young creators across Karnataka to celebrate hands-on science, competitive gaming, and digital storytelling.
          </p>
        </div>

        {/* 3 Pillar Cards with Colored Illustration Panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1: Science & Discovery (Lime) */}
          <div className="brand-card">
            <div className="card-illustration-panel panel-lime">
              <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#151535" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <div className="card-body">
              <h3 className="card-title">Science & Discovery</h3>
              <p className="card-desc">
                High-voltage scientific demos, robotic prototypes, and working mechanical models built by college innovators and young school inventors.
              </p>
            </div>
          </div>

          {/* Card 2: Animation & Creative Arts (Magenta) */}
          <div className="brand-card">
            <div className="card-illustration-panel panel-magenta">
              <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
                <rect x="2" y="2" width="20" height="20" rx="4" />
              </svg>
            </div>
            <div className="card-body">
              <h3 className="card-title">Animation & Creative Arts</h3>
              <p className="card-desc">
                Curated by the Department of Animation: 2D & 3D character design, visual effects screenings, digital illustration galleries, and game art.
              </p>
            </div>
          </div>

          {/* Card 3: Collegiate Competition (Orange) */}
          <div className="brand-card">
            <div className="card-illustration-panel panel-orange">
              <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 12h4m-2-2v4" />
                <line x1="15" y1="11" x2="15.01" y2="11" />
                <line x1="18" y1="13" x2="18.01" y2="13" />
              </svg>
            </div>
            <div className="card-body">
              <h3 className="card-title">Collegiate Esports</h3>
              <p className="card-desc">
                High-stakes tournaments featuring top campus squads in structured brackets with live audience spectator halls and casting desks.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
