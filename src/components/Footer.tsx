import { Link } from "react-router-dom";
import { FESTIVAL_CONFIG } from "@/config/festival";
import { Mail, MapPin } from "lucide-react";
import { InstagramIcon } from "@/components/icons/InstagramIcon";

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid rgba(46, 42, 138, 0.1)",
        background: "#F6F3FF",
        color: "#0B0B1E",
        padding: "clamp(64px, 8vh, 88px) 0 36px",
      }}
      role="contentinfo"
      aria-label="Supernova 3.0 Footer"
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "clamp(36px, 5vw, 64px)",
            marginBottom: "clamp(48px, 6vh, 64px)",
          }}
        >
          {/* Column 1: Official Logo & Organiser as TEXT ONLY (No NES Logo!) */}
          <div>
            <div style={{ marginBottom: 20 }}>
              <img
                src="/assets/brand/supernova-logo.png"
                alt="Supernova 3.0"
                style={{ height: 38, width: "auto", objectFit: "contain" }}
              />
            </div>

            <p
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                fontSize: "0.88rem",
                color: "#2E2A8A",
                margin: "0 0 8px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {FESTIVAL_CONFIG.ORGANISER_LEAD}
            </p>
            <p
              style={{
                fontFamily: "'Montserrat', sans-serif",
                color: "#38375A",
                fontSize: "0.85rem",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {FESTIVAL_CONFIG.SUBTEXT}
            </p>
          </div>

          {/* Column 2: Navigation Links */}
          <div>
            <p
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: "0.76rem",
                fontWeight: 800,
                color: "#5648B0",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                margin: "0 0 16px",
              }}
            >
              FESTIVAL PAGES
            </p>
            <ul
              style={{
                display: "grid",
                gap: 10,
                fontSize: "0.88rem",
                padding: 0,
                margin: 0,
                listStyle: "none",
                fontFamily: "'Montserrat', sans-serif",
              }}
            >
              <li>
                <Link to="/" style={{ color: "#38375A", textDecoration: "none" }}>
                  Home
                </Link>
              </li>
              <li>
                <Link to="/about" style={{ color: "#38375A", textDecoration: "none" }}>
                  About
                </Link>
              </li>
              <li>
                <Link to="/events" style={{ color: "#38375A", textDecoration: "none" }}>
                  Events (Flagship Zones)
                </Link>
              </li>
              <li>
                <Link to="/schedule" style={{ color: "#38375A", textDecoration: "none" }}>
                  Schedule (Day 1 & 2)
                </Link>
              </li>
              <li>
                <Link to="/gallery" style={{ color: "#38375A", textDecoration: "none" }}>
                  Gallery
                </Link>
              </li>
              <li>
                <Link to="/updates" style={{ color: "#38375A", textDecoration: "none" }}>
                  Updates
                </Link>
              </li>
              <li>
                <Link to="/contact" style={{ color: "#38375A", textDecoration: "none" }}>
                  Contact & Venue
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Venue Address */}
          <div>
            <p
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: "0.76rem",
                fontWeight: 800,
                color: "#5648B0",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                margin: "0 0 16px",
              }}
            >
              VENUE ADDRESS
            </p>
            <p
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 700,
                fontSize: "0.92rem",
                color: "#0B0B1E",
                margin: "0 0 6px",
              }}
            >
              {FESTIVAL_CONFIG.VENUE}
            </p>
            <p
              style={{
                fontFamily: "'Montserrat', sans-serif",
                color: "#38375A",
                fontSize: "0.85rem",
                lineHeight: 1.6,
                margin: "0 0 14px",
              }}
            >
              {FESTIVAL_CONFIG.VENUE_FULL_ADDRESS}
            </p>
            <a
              href={FESTIVAL_CONFIG.VENUE_MAPS_URL}
              target="_blank"
              rel="noreferrer noopener"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "'Montserrat', sans-serif",
                fontSize: "0.84rem",
                fontWeight: 700,
                color: "#2E2A8A",
                textDecoration: "underline",
              }}
            >
              <MapPin size={15} />
              <span>Get directions on Google Maps →</span>
            </a>
          </div>

          {/* Column 4: 2 Social Links & Helpdesk Email */}
          <div>
            <p
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: "0.76rem",
                fontWeight: 800,
                color: "#5648B0",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                margin: "0 0 16px",
              }}
            >
              CONNECT & HELPDESK
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {FESTIVAL_CONFIG.SOCIAL_LINKS.map((social) => {
                const hasValidUrl = Boolean(social.url && social.url.startsWith("http"));
                const content = (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: "0.84rem",
                      color: hasValidUrl ? "#2E2A8A" : "#5648B0",
                      fontFamily: "'Montserrat', sans-serif",
                    }}
                  >
                    <InstagramIcon size={16} />
                    <span style={{ color: hasValidUrl ? "#2E2A8A" : "#38375A", fontWeight: 700 }}>
                      {social.label}
                    </span>
                    {(social as any).handle && (
                      <span style={{ fontSize: "0.75rem", color: "#6B688A", fontWeight: 500 }}>
                        {(social as any).handle}
                      </span>
                    )}
                    {!hasValidUrl && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          color: "#7E79A8",
                          background: "rgba(46, 42, 138, 0.08)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: 600,
                        }}
                      >
                        (Official)
                      </span>
                    )}
                  </div>
                );

                if (hasValidUrl) {
                  return (
                    <a
                      key={social.id}
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "none" }}
                      aria-label={`${social.label} on Instagram`}
                    >
                      {content}
                    </a>
                  );
                }

                return <div key={social.id}>{content}</div>;
              })}
            </div>

            <div style={{ borderTop: "1px solid rgba(46, 42, 138, 0.1)", paddingTop: 14 }}>
              <span
                style={{
                  display: "block",
                  fontSize: "0.74rem",
                  color: "#6B688A",
                  fontWeight: 600,
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Helpdesk Email
              </span>
              <a
                href={`mailto:${FESTIVAL_CONFIG.HELPDESK_EMAIL}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: "0.84rem",
                  fontWeight: 700,
                  color: "#2E2A8A",
                  textDecoration: "none",
                  wordBreak: "break-all",
                }}
              >
                <Mail size={15} />
                <span>{FESTIVAL_CONFIG.HELPDESK_EMAIL}</span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Admin Portal Link */}
        <div
          style={{
            borderTop: "1px solid rgba(46, 42, 138, 0.1)",
            paddingTop: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            fontSize: "0.78rem",
            color: "#6B688A",
            fontFamily: "'Montserrat', sans-serif",
          }}
        >
          <span>
            © 2026 {FESTIVAL_CONFIG.ORGANISER_LEAD}. All rights reserved.
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link to="/privacy" style={{ color: "#6B688A", textDecoration: "none" }}>
              Privacy Notice
            </Link>
            <Link to="/admin/login" style={{ color: "#6B688A", textDecoration: "none" }}>
              Admin Desk
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
