import type { FC, MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { SITE_CONTENT } from "../content/site";
import { InstagramIcon } from "@/components/icons/InstagramIcon";
import { Mail, MapPin } from "lucide-react";

export const Footer: FC = () => {
  const content = SITE_CONTENT.footer;
  const meta = SITE_CONTENT.meta;
  const groups = SITE_CONTENT.organisedWith.groups;
  const location = useLocation();

  const handleScrollTo = (id: string) => (e: MouseEvent) => {
    if (location.pathname === "/") {
      e.preventDefault();
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  const socialAccounts = [
    {
      id: "ncba",
      label: "National College NCBA",
      handle: "@thenationalcollegencba",
      url: "", // Configurable URL placeholder
    },
    {
      id: "college",
      label: "National College",
      handle: "@thenationalcollege",
      url: "", // Configurable URL placeholder
    },
  ];

  return (
    <footer className="relative overflow-clip bg-[#191936] text-white pt-16 pb-12 border-t-2 border-[#191936]">
      {/* 4-Color Ribbon Accent Line (No pink/magenta) */}
      <div className="absolute top-0 left-0 right-0 h-1 flex" aria-hidden="true">
        <span className="flex-1 bg-[#4549D8]" />
        <span className="flex-1 bg-[#FF873D]" />
        <span className="flex-1 bg-[#D5F542]" />
        <span className="flex-1 bg-[#A9D9F4]" />
      </div>

      <div className="site-container">
        {/* Main 12-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8 pb-12 border-b border-white/10">
          
          {/* Column 1: Brand & Details (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <Link to="/" className="inline-block group">
              <span className="font-display font-extrabold text-3xl tracking-tight text-white group-hover:text-[#D5F542] transition-colors">
                SUPERNOVA <span className="text-[#D5F542]">3.0</span>
              </span>
            </Link>

            <p className="text-xs uppercase font-heading font-bold tracking-[0.2em] text-[#D5F542]">
              {content.theme}
            </p>

            <p className="text-white/80 text-sm sm:text-base leading-relaxed max-w-md font-body">
              {content.tagline}
            </p>

            <div className="pt-2 text-sm text-white/70 space-y-1.5 font-body">
              <p className="font-bold text-white tracking-wide">20–21 November 2026</p>
              <p className="flex items-start gap-1.5 text-white/80">
                <MapPin size={15} className="shrink-0 mt-0.5 text-[#D5F542]" />
                <span>The National College, Basavanagudi, Bengaluru – 04</span>
              </p>
              <p className="flex items-center gap-1.5 text-white/80">
                <Mail size={15} className="shrink-0 text-[#D5F542]" />
                <span>Helpdesk:</span>
                <a
                  href={`mailto:${meta.helpdeskEmail}`}
                  className="text-[#D5F542] hover:underline"
                >
                  {meta.helpdeskEmail}
                </a>
              </p>
            </div>
          </div>

          {/* Column 2: Navigation Links (3 cols) */}
          <div className="lg:col-span-3 space-y-3">
            <h3 className="text-xs font-heading font-bold uppercase tracking-[0.2em] text-[#D5F542]">
              EXPLORE
            </h3>
            <ul className="space-y-2.5 text-sm font-medium text-white/80 font-body list-none p-0 m-0">
              <li>
                <a
                  href="/#about"
                  onClick={handleScrollTo("about")}
                  className="hover:text-white transition-colors"
                >
                  About Supernova 3.0
                </a>
              </li>
              <li>
                <a
                  href="/#experiences"
                  onClick={handleScrollTo("experiences")}
                  className="hover:text-white transition-colors"
                >
                  Four Experiences
                </a>
              </li>
              <li>
                <a
                  href="/#esports"
                  onClick={handleScrollTo("esports")}
                  className="hover:text-white transition-colors"
                >
                  Esports Arena
                </a>
              </li>
              <li>
                <Link to="/schedule" className="hover:text-white transition-colors">
                  Festival Schedule
                </Link>
              </li>
              <li>
                <Link to="/gallery" className="hover:text-white transition-colors">
                  Photo Gallery
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white transition-colors">
                  Contact & Helpdesk
                </Link>
              </li>
              <li>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1.5 text-[#D5F542] font-heading font-bold hover:underline"
                >
                  Register Now →
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Institutions & Social Channels (4 cols) */}
          <div className="lg:col-span-4 space-y-5">
            <div>
              <h3 className="text-xs font-heading font-bold uppercase tracking-[0.2em] text-[#D5F542] mb-3">
                INSTITUTIONS
              </h3>
              <div className="space-y-3 text-xs sm:text-sm text-white/80 font-body">
                {groups.map((group) => (
                  <div key={group.campus} className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-white uppercase tracking-wider text-xs font-heading">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: group.dotColor }}
                      />
                      <span>{group.campus} campus</span>
                    </div>
                    <ul className="pl-4 space-y-1 text-white/70 list-none m-0">
                      {group.institutions.map((inst) => (
                        <li key={inst}>{inst}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Official Instagram Accounts Section (Requirement 10) */}
            <div className="pt-4 border-t border-white/10">
              <h3 className="text-xs font-heading font-bold uppercase tracking-[0.2em] text-[#D5F542] mb-2.5">
                OFFICIAL SOCIAL MEDIA
              </h3>
              <div className="space-y-2 text-xs font-body">
                {socialAccounts.map((soc) => {
                  const hasUrl = Boolean(soc.url && soc.url.startsWith("http"));
                  const content = (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10 hover:border-[#D5F542]/40 transition-colors">
                      <div className="flex items-center gap-2">
                        <InstagramIcon size={15} color="#D5F542" />
                        <span className="font-semibold text-white/95">{soc.label}</span>
                      </div>
                      <span className="text-[11px] font-mono text-[#D5F542] bg-[#D5F542]/10 px-2 py-0.5 rounded">
                        {soc.handle}
                      </span>
                    </div>
                  );

                  if (hasUrl) {
                    return (
                      <a
                        key={soc.id}
                        href={soc.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block no-underline"
                      >
                        {content}
                      </a>
                    );
                  }

                  return <div key={soc.id}>{content}</div>;
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Organisers, Copyright & Admin Portal Link */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/60 font-body">
          <p className="text-center sm:text-left">
            Organised by The National Education Society of Karnataka institutions: The National College, Basavanagudi & National PU College, Jayanagar, with the Department of Animation.
          </p>
          <div className="flex items-center gap-4 text-center sm:text-right">
            <span>© 2026 NES. All rights reserved.</span>
            <Link to="/privacy" className="text-white/60 hover:text-white transition-colors">
              Privacy
            </Link>
            <Link to="/admin/login" className="text-[#D5F542] font-semibold hover:underline">
              Admin Portal
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
