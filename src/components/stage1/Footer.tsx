import { Link } from "react-router-dom";
import { CONFIG, getInstagramDisplay } from "@/config";

export const Footer: React.FC = () => {
  const instaBasavanagudi = getInstagramDisplay("nationalCollegeBasavanagudi");
  const instaNcba = getInstagramDisplay("nationalNcba");

  const FOOTER_LINKS = [
    { label: "Home", href: "/#home" },
    { label: "About", href: "/#about" },
    { label: "Experiences", href: "/#experiences" },
    { label: "Esports", href: "/#esports" },
    { label: "Schedule", href: "/#schedule" },
    { label: "Contact", href: "/#contact" },
    { label: "Register", href: "/register" },
  ];

  return (
    <footer
      id="contact"
      style={{
        backgroundColor: "#151535",
        color: "#FFFFFF",
        paddingTop: "clamp(64px, 8vw, 96px)",
        paddingBottom: "clamp(48px, 6vw, 64px)",
      }}
      className="relative w-full select-none"
      aria-label="Site Footer"
    >
      <div className="site-container">
        {/* Top Grid: Brand & Presentation, Institutions, Links & Socials */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8 pb-12"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.12)" }}
        >
          {/* Col 1-4: Brand Lockup, Theme, Dates & Organisers */}
          <div className="lg:col-span-4 flex flex-col items-start gap-4">
            <Link to="/" className="inline-block" aria-label={CONFIG.EVENT_NAME}>
              <img
                src={CONFIG.LOGO_PATH}
                alt={CONFIG.EVENT_NAME}
                style={{ height: 42, width: "auto", filter: "brightness(0) invert(1)" }}
                className="object-contain"
              />
            </Link>

            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 18,
                fontWeight: 700,
                color: "#C8F500",
                letterSpacing: "-0.01em",
              }}
            >
              {CONFIG.THEME}
            </div>

            <p style={{ fontSize: 14, color: "#CFC8F5", lineHeight: 1.5, margin: 0 }}>
              "{CONFIG.TAGLINE}"
            </p>

            <p style={{ fontSize: 14, color: "#FFFFFF", fontWeight: 700, margin: 0 }}>
              {CONFIG.DATES}
            </p>

            <div className="text-sm text-[#A5A0D6] flex flex-col gap-1 mt-1">
              <span className="font-semibold text-white">
                The National Education Society of Karnataka · Department of Animation
              </span>
            </div>
          </div>

          {/* Col 5-8: The 7 Participating Institutions by Campus */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <h4
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 14,
                fontWeight: 700,
                color: "#FFFFFF",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Organised With
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm text-[#CFC8F5]">
              {CONFIG.INSTITUTIONS.map((group) => (
                <div key={group.campus} className="flex flex-col gap-2">
                  <span className="font-bold text-white text-xs tracking-wider uppercase text-[#C8F500]">
                    {group.campus}
                  </span>
                  <ul className="flex flex-col gap-1.5 list-none p-0 m-0 text-sm">
                    {group.schools.map((school) => (
                      <li key={school} className="leading-snug">
                        {school}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Col 9-12: Navigation Links, Instagram & Helpdesk */}
          <div className="lg:col-span-3 flex flex-col gap-5">
            <h4
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 14,
                fontWeight: 700,
                color: "#FFFFFF",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Navigation & Helpdesk
            </h4>

            {/* 2-Column Link Grid on Mobile / Tablet */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {FOOTER_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-[#CFC8F5] hover:text-[#C8F500] transition-colors py-0.5"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Instagram links (disabled if URL empty) */}
            <div className="flex flex-col gap-2 pt-2 border-t border-white/10 text-xs">
              <div className="flex flex-wrap items-start gap-2 min-w-0">
                <span className="text-[#A5A0D6] flex-shrink-0">Instagram 1:</span>
                {instaBasavanagudi.url ? (
                  <a
                    href={instaBasavanagudi.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-[#C8F500] underline break-words"
                  >
                    {instaBasavanagudi.name}
                  </a>
                ) : (
                  <span className="text-[#7A74B8] italic break-words">{instaBasavanagudi.name} (TBA)</span>
                )}
              </div>

              <div className="flex flex-wrap items-start gap-2 min-w-0">
                <span className="text-[#A5A0D6] flex-shrink-0">Instagram 2:</span>
                {instaNcba.url ? (
                  <a
                    href={instaNcba.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-[#C8F500] underline break-words"
                  >
                    {instaNcba.name}
                  </a>
                ) : (
                  <span className="text-[#7A74B8] italic break-words">{instaNcba.name} (TBA)</span>
                )}
              </div>
            </div>

            {/* Helpdesk Email */}
            <div className="pt-2 text-xs text-[#A5A0D6]">
              <span className="block mb-1 text-white font-semibold">Helpdesk Email:</span>
              <a
                href={`mailto:${CONFIG.HELPDESK_EMAIL}`}
                className="text-[#C8F500] hover:underline font-mono text-xs break-all"
              >
                {CONFIG.HELPDESK_EMAIL}
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Note */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#8E88C7]">
          <div>
            © 2026 {CONFIG.PRESENTER_LEAD}. All rights reserved.
          </div>
          <div>
            Supernova 3.0 · Basavanagudi, Bengaluru
          </div>
        </div>
      </div>
    </footer>
  );
};
