import { Link } from "react-router-dom";

export const HomeEsports = () => {
  const cards = [
    { title: "Approved games", body: "Details coming soon" },
    { title: "Tournament format", body: "Details coming soon" },
    { title: "Eligibility", body: "Details coming soon" },
    { title: "Rules & FAQs", body: "Details coming soon" },
  ];

  return (
    <section id="esports" className="section-padding bg-[#151535] text-white" style={{ scrollMarginTop: "80px" }}>
      <div className="site-container">
        {/* Header */}
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto mb-16">
          <span className="section-label" style={{ color: "#C8F500" }}>
            ESPORTS
          </span>
          <h2 className="section-heading" style={{ color: "#FFFFFF" }}>
            READY TO PLAY? JOIN THE ARENA.
          </h2>
        </div>

        {/* Top Grid: 4 Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {cards.map((card) => (
            <div
              key={card.title}
              className="bg-[#1F1F47] rounded-2xl p-6 border border-white/10 flex flex-col justify-between"
            >
              <h3 className="font-heading text-xl font-bold text-white mb-3">
                {card.title}
              </h3>
              <p className="font-body text-sm text-[#A5A0D6]">
                {card.body}
              </p>
            </div>
          ))}
        </div>

        {/* Centerpiece: Monitor with Pixel Trophy Illustration (No controllers) & Register CTA */}
        <div className="flex flex-col items-center justify-center text-center max-w-xl mx-auto">
          {/* Monitor with Pixel Trophy SVG */}
          <div className="w-48 h-40 sm:w-56 sm:h-48 mb-8 relative flex items-center justify-center">
            <svg
              viewBox="0 0 200 160"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full drop-shadow-lg"
            >
              {/* Monitor bezel */}
              <rect x="20" y="10" width="160" height="105" rx="8" fill="#242456" stroke="#C8F500" strokeWidth="3" />
              {/* Monitor screen */}
              <rect x="28" y="18" width="144" height="89" rx="4" fill="#0E0E28" />

              {/* Pixel Trophy inside screen */}
              {/* Base */}
              <rect x="86" y="82" width="28" height="6" fill="#FFD600" />
              <rect x="92" y="74" width="16" height="8" fill="#FFD600" />
              {/* Stem */}
              <rect x="96" y="66" width="8" height="8" fill="#FFD600" />
              {/* Cup */}
              <rect x="84" y="38" width="32" height="28" rx="2" fill="#FFD600" />
              <rect x="88" y="42" width="24" height="20" rx="1" fill="#FFB703" />
              {/* Handles */}
              <path d="M84 44H76V56H84" stroke="#FFD600" strokeWidth="3" strokeLinecap="square" />
              <path d="M116 44H124V56H116" stroke="#FFD600" strokeWidth="3" strokeLinecap="square" />
              {/* Star on Cup */}
              <polygon points="100,46 102,51 107,51 103,54 105,59 100,56 95,59 97,54 93,51 98,51" fill="#FFFFFF" />

              {/* Monitor Stand */}
              <path d="M92 115L88 135H112L108 115H92Z" fill="#383870" />
              <rect x="74" y="135" width="52" height="6" rx="3" fill="#C8F500" />
            </svg>
          </div>

          {/* Lime button "Register your team" */}
          <Link
            to="/register?type=esports"
            className="btn-primary"
            style={{
              height: 52,
              padding: "0 36px",
              backgroundColor: "#C8F500",
              color: "#151535",
            }}
          >
            Register your team →
          </Link>
        </div>
      </div>
    </section>
  );
};
