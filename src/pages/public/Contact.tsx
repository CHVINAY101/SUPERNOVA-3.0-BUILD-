import { useState } from "react";
import { SharedPageHeader } from "@/components/SharedPageHeader";
import { FESTIVAL_CONFIG } from "@/config/festival";
import { Mail, MapPin, Send } from "lucide-react";
import { InstagramIcon } from "@/components/icons/InstagramIcon";

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const handleSendMail = (e: React.FormEvent) => {
    e.preventDefault();
    const mailSubject = encodeURIComponent(subject || `Query from ${name || "Visitor"}`);
    const bodyText = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
    );
    window.location.href = `mailto:${FESTIVAL_CONFIG.HELPDESK_EMAIL}?subject=${mailSubject}&body=${bodyText}`;
  };

  return (
    <div style={{ background: "#FFFFFF", color: "#0B0B1E", minHeight: "100vh" }}>
      {/* Shared Page Header Band */}
      <SharedPageHeader
        title="Contact & Helpdesk"
        tag="GET IN TOUCH"
        subtitle="Reach the Supernova 3.0 Helpdesk and event organizing team at The National College, Basavanagudi."
      />

      <section style={{ padding: "clamp(60px, 8vh, 96px) 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "clamp(36px, 6vw, 64px)",
              alignItems: "flex-start",
              marginBottom: 64,
            }}
          >
            {/* Left: Contact Form pre-filling mailto */}
            <div
              style={{
                background: "#F6F3FF",
                border: "1.5px solid rgba(46, 42, 138, 0.12)",
                borderRadius: 24,
                padding: "clamp(24px, 4vw, 36px)",
                boxShadow: "0 8px 32px rgba(46, 42, 138, 0.05)",
              }}
            >
              <h2
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontWeight: 900,
                  fontSize: "1.6rem",
                  color: "#0B0B1E",
                  margin: "0 0 10px",
                }}
              >
                Send a Message
              </h2>
              <p
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  color: "#38375A",
                  fontSize: "0.92rem",
                  lineHeight: 1.6,
                  margin: "0 0 24px",
                }}
              >
                Submit your query below. Submitting will prefill your email client directly to the Supernova 3.0 Helpdesk.
              </p>

              <form onSubmit={handleSendMail} style={{ display: "grid", gap: 16 }}>
                <div>
                  <label
                    htmlFor="contact-name"
                    style={{
                      display: "block",
                      fontFamily: "'Montserrat', sans-serif",
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      color: "#0B0B1E",
                      marginBottom: 6,
                    }}
                  >
                    Your Name *
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 10,
                      background: "#FFFFFF",
                      border: "1.5px solid rgba(46, 42, 138, 0.2)",
                      padding: "0 14px",
                      fontSize: "0.95rem",
                      color: "#0B0B1E",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="contact-email"
                    style={{
                      display: "block",
                      fontFamily: "'Montserrat', sans-serif",
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      color: "#0B0B1E",
                      marginBottom: 6,
                    }}
                  >
                    Your Email Address *
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rahul@example.com"
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 10,
                      background: "#FFFFFF",
                      border: "1.5px solid rgba(46, 42, 138, 0.2)",
                      padding: "0 14px",
                      fontSize: "0.95rem",
                      color: "#0B0B1E",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="contact-subject"
                    style={{
                      display: "block",
                      fontFamily: "'Montserrat', sans-serif",
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      color: "#0B0B1E",
                      marginBottom: 6,
                    }}
                  >
                    Subject
                  </label>
                  <input
                    id="contact-subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Science Expo Stall Query"
                    style={{
                      width: "100%",
                      height: 48,
                      borderRadius: 10,
                      background: "#FFFFFF",
                      border: "1.5px solid rgba(46, 42, 138, 0.2)",
                      padding: "0 14px",
                      fontSize: "0.95rem",
                      color: "#0B0B1E",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="contact-message"
                    style={{
                      display: "block",
                      fontFamily: "'Montserrat', sans-serif",
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      color: "#0B0B1E",
                      marginBottom: 6,
                    }}
                  >
                    Message *
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type your message or question here..."
                    style={{
                      width: "100%",
                      borderRadius: 10,
                      background: "#FFFFFF",
                      border: "1.5px solid rgba(46, 42, 138, 0.2)",
                      padding: "12px 14px",
                      fontSize: "0.95rem",
                      color: "#0B0B1E",
                      boxSizing: "border-box",
                      outline: "none",
                      resize: "vertical",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    height: 52,
                    borderRadius: "9999px",
                    background: "#F47B20",
                    color: "#FFFFFF",
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: "0.95rem",
                    fontWeight: 800,
                    letterSpacing: "0.03em",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 4px 16px rgba(244, 123, 32, 0.35)",
                    transition: "background 0.2s ease",
                  }}
                >
                  <span>Send via Email Client</span>
                  <Send size={16} />
                </button>
              </form>
            </div>

            {/* Right: Helpdesk & Social Details */}
            <div>
              <span
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#2E2A8A",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: 10,
                }}
              >
                DIRECT CHANNELS
              </span>

              <h2
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontWeight: 900,
                  fontSize: "2rem",
                  color: "#0B0B1E",
                  margin: "0 0 24px",
                }}
              >
                Helpdesk & Social
              </h2>

              {/* Helpdesk Email Box */}
              <div
                style={{
                  background: "#F6F3FF",
                  border: "1.5px solid rgba(46, 42, 138, 0.12)",
                  borderRadius: 18,
                  padding: "24px",
                  marginBottom: 24,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: "rgba(46, 42, 138, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#2E2A8A",
                    }}
                  >
                    <Mail size={22} />
                  </div>
                  <div>
                    <span
                      style={{
                        fontFamily: "'Unbounded', sans-serif",
                        fontSize: "0.78rem",
                        fontWeight: 800,
                        color: "#5648B0",
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        display: "block",
                      }}
                    >
                      Official Helpdesk
                    </span>
                    <strong style={{ fontSize: "1.05rem", color: "#0B0B1E" }}>
                      Helpdesk Email
                    </strong>
                  </div>
                </div>

                <p
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: "0.88rem",
                    color: "#38375A",
                    lineHeight: 1.6,
                    margin: "0 0 16px",
                  }}
                >
                  For student registration queries, zone event rules, project approvals, and scheduling questions.
                </p>

                <a
                  href={`mailto:${FESTIVAL_CONFIG.HELPDESK_EMAIL}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    borderRadius: "9999px",
                    background: "#2E2A8A",
                    color: "#FFFFFF",
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  <Mail size={16} />
                  <span>{FESTIVAL_CONFIG.HELPDESK_EMAIL}</span>
                </a>
              </div>

              {/* Instagram Pages */}
              <div
                style={{
                  background: "#F6F3FF",
                  border: "1.5px solid rgba(46, 42, 138, 0.12)",
                  borderRadius: 18,
                  padding: "24px",
                  marginBottom: 24,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Unbounded', sans-serif",
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    color: "#5648B0",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    display: "block",
                    marginBottom: 14,
                  }}
                >
                  Instagram Channels
                </span>

                <div style={{ display: "grid", gap: 12 }}>
                  {FESTIVAL_CONFIG.SOCIAL_LINKS.map((social) => {
                    const hasValidUrl = Boolean(social.url && social.url.startsWith("http"));
                    const rowContent = (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "14px 16px",
                          borderRadius: 12,
                          background: "#FFFFFF",
                          border: "1px solid rgba(46, 42, 138, 0.12)",
                          transition: "border-color 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <InstagramIcon size={18} color="#5648B0" />
                          <div>
                            <span
                              style={{
                                fontFamily: "'Montserrat', sans-serif",
                                fontSize: "0.9rem",
                                fontWeight: 700,
                                color: "#0B0B1E",
                                display: "block",
                              }}
                            >
                              {social.label}
                            </span>
                            {(social as any).handle && (
                              <span
                                style={{
                                  fontSize: "0.78rem",
                                  fontFamily: "'Montserrat', sans-serif",
                                  color: "#5648B0",
                                  fontWeight: 600,
                                }}
                              >
                                {(social as any).handle}
                              </span>
                            )}
                          </div>
                        </div>

                        {hasValidUrl ? (
                          <span
                            style={{
                              fontSize: "0.76rem",
                              fontFamily: "'Montserrat', sans-serif",
                              color: "#2E2A8A",
                              background: "rgba(46, 42, 138, 0.08)",
                              padding: "4px 10px",
                              borderRadius: 999,
                              fontWeight: 700,
                            }}
                          >
                            Visit Profile →
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.74rem",
                              fontFamily: "'Montserrat', sans-serif",
                              color: "#7E79A8",
                              background: "rgba(46, 42, 138, 0.05)",
                              padding: "4px 10px",
                              borderRadius: 999,
                              fontWeight: 600,
                            }}
                          >
                            Official Handle
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
                          aria-label={`Open ${social.label} Instagram profile`}
                        >
                          {rowContent}
                        </a>
                      );
                    }

                    return <div key={social.id}>{rowContent}</div>;
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Campus Map Embed */}
          <div
            style={{
              borderRadius: 24,
              overflow: "hidden",
              border: "1.5px solid rgba(46, 42, 138, 0.14)",
              boxShadow: "0 12px 36px rgba(46, 42, 138, 0.08)",
            }}
          >
            <div
              style={{
                padding: "20px 24px",
                background: "#F6F3FF",
                borderBottom: "1px solid rgba(46, 42, 138, 0.12)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <h3
                  style={{
                    fontFamily: "'Unbounded', sans-serif",
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    color: "#0B0B1E",
                    margin: "0 0 4px",
                  }}
                >
                  The National College, Basavanagudi
                </h3>
                <p
                  style={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontSize: "0.85rem",
                    color: "#38375A",
                    margin: 0,
                  }}
                >
                  {FESTIVAL_CONFIG.VENUE_FULL_ADDRESS}
                </p>
              </div>

              <a
                href={FESTIVAL_CONFIG.VENUE_MAPS_URL}
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: "9999px",
                  background: "#2E2A8A",
                  color: "#FFFFFF",
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                <MapPin size={15} />
                <span>Open in Google Maps</span>
              </a>
            </div>

            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.3582496155554!2d77.56948517598816!3d12.948924987364667!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bae158b09337b51%3A0x6b403d1573c73499!2sThe%20National%20College%20Basavanagudi!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin"
              title="The National College Basavanagudi Map"
              width="100%"
              height="400"
              style={{ border: "none", display: "block" }}
              loading="lazy"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
