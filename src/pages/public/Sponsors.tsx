import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import type { Sponsor } from "@/types/database";
import { Award, ArrowRight, Handshake, Sparkles, ExternalLink } from "lucide-react";
import { Reveal } from "@/components/Reveal";

const CURATED_SPONSORS: Sponsor[] = [
  {
    id: "sp-1",
    name: "The National Education Society of Karnataka",
    tier: "Presenting Patron & Trust",
    logo_url: "/logo.svg",
    link_url: "",
    description: "Centenary educational society nurturing rational inquiry, scientific thought, and academic innovation across Karnataka since 1917.",
    is_published: true,
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sp-2",
    name: "Department of Animation",
    tier: "Organising Creative Department",
    logo_url: "/favicon.svg",
    link_url: "",
    description: "Host department at The National College leading the animation showcase, digital arts exhibitions, and media broadcasting.",
    is_published: true,
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sp-3",
    name: "Industry & Technical Partners",
    tier: "Official Partnerships (TBA)",
    logo_url: "",
    link_url: "",
    description: "Corporate sponsors, innovation partners, and esports facilitators will be formally announced prior to the festival. Enquiries welcome via helpdesk.",
    is_published: true,
    sort_order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function Sponsors() {
  const [sponsors, setSponsors] = useState<Sponsor[]>(CURATED_SPONSORS);

  const fetchSponsors = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("sponsors")
        .select("*")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });

      if (data && data.length > 0) {
        setSponsors(data as Sponsor[]);
      }
    } catch (err) {
      console.warn("Failed to load sponsors:", err);
    }
  }, []);

  // Live Realtime Subscription for sponsors
  useRealtimeSubscription(
    { table: "sponsors", onRefresh: fetchSponsors },
    "public-sponsors"
  );

  useEffect(() => {
    fetchSponsors();
  }, [fetchSponsors]);

  const tiers = Array.from(new Set(sponsors.map((s) => s.tier || "Official Partners")));

  return (
    <div style={{ background: "var(--paper)", minHeight: "100vh" }}>
      {/* Hero */}
      <section
        style={{
          background: "linear-gradient(180deg, var(--paper-soft) 0%, var(--paper) 100%)",
          padding: "clamp(88px, 12vw, 130px) 0 54px",
          borderBottom: "1.5px solid var(--line)",
        }}
      >
        <div className="container">
          <div style={{ maxWidth: 760 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 16px",
                borderRadius: "999px",
                background: "var(--cobalt)",
                color: "#ffffff",
                fontSize: "0.76rem",
                fontWeight: 800,
                letterSpacing: "0.1em",
                marginBottom: 20,
              }}
            >
              <Handshake size={14} />
              PARTNERS & PATRONS
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.5rem, 5.5vw, 4.5rem)",
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
                color: "var(--ink)",
                marginBottom: 20,
              }}
            >
              Sponsors & Community Partners
            </h1>
            <p style={{ fontSize: "1.1rem", lineHeight: 1.6, color: "var(--ink-soft)", marginBottom: 28 }}>
              We extend our gratitude to the educational trusts, technology providers, and community patrons who champion youth innovation and empower Supernova 3.0.
            </p>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Link to="/contact" className="btn btn-primary" style={{ background: "var(--ink)", borderColor: "var(--ink)" }}>
                Partner With Us <ArrowRight size={16} />
              </Link>
              <Link to="/about" className="btn btn-secondary" style={{ background: "#ffffff" }}>
                About the Festival
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Sponsors Content */}
      <section className="section">
        <div className="container" style={{ maxWidth: 960 }}>
          <div style={{ display: "grid", gap: 54 }}>
            {tiers.map((tier, tIdx) => {
              const tierSponsors = sponsors.filter((s) => (s.tier || "Official Partners") === tier);
              return (
                <div key={tier || tIdx}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, borderBottom: "1.5px solid var(--line-soft)", paddingBottom: 12 }}>
                    <Award size={20} color="var(--cobalt)" />
                    <h2 style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--ink)" }}>
                      {tier}
                    </h2>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
                    {tierSponsors.map((sponsor) => (
                      <Reveal key={sponsor.id}>
                        <div
                          className="card card-hover"
                          style={{
                            background: "#ffffff",
                            padding: "32px 28px",
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            border: "1.5px solid var(--line)",
                          }}
                        >
                          <div style={{ height: 64, display: "flex", alignItems: "center", marginBottom: 20 }}>
                            {sponsor.logo_url ? (
                              <img
                                src={sponsor.logo_url}
                                alt={sponsor.name}
                                style={{ maxHeight: 52, maxWidth: "100%", objectFit: "contain" }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 52,
                                  height: 52,
                                  borderRadius: "14px",
                                  background: "var(--paper-soft)",
                                  display: "grid",
                                  placeItems: "center",
                                  fontWeight: 800,
                                  fontSize: "1.3rem",
                                  color: "var(--cobalt)",
                                  border: "1px solid var(--line)",
                                }}
                              >
                                {sponsor.name.charAt(0)}
                              </div>
                            )}
                          </div>

                          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
                            {sponsor.name}
                          </h3>

                          {sponsor.description && (
                            <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", lineHeight: 1.6, flexGrow: 1 }}>
                              {sponsor.description}
                            </p>
                          )}

                          {sponsor.link_url && (
                            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
                              <a
                                href={sponsor.link_url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontSize: "0.82rem",
                                  fontWeight: 700,
                                  color: "var(--cobalt)",
                                  textDecoration: "none",
                                }}
                              >
                                Visit Partner Website <ExternalLink size={13} />
                              </a>
                            </div>
                          )}
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Partner Prospectus CTA */}
          <div
            style={{
              marginTop: 64,
              background: "linear-gradient(135deg, var(--paper-soft) 0%, #FFFFFF 100%)",
              border: "1.5px solid var(--line)",
              borderRadius: "28px",
              padding: "clamp(36px, 5vw, 54px)",
              textAlign: "center",
            }}
          >
            <div style={{ maxWidth: 580, marginInline: "auto" }}>
              <Sparkles size={28} color="var(--violet)" style={{ margin: "0 auto 14px" }} />
              <h3 style={{ fontSize: "clamp(1.6rem, 3.2vw, 2.2rem)", fontWeight: 800, color: "var(--ink)", marginBottom: 12 }}>
                Interested in supporting student creators?
              </h3>
              <p style={{ color: "var(--ink-soft)", fontSize: "1rem", lineHeight: 1.6, marginBottom: 24 }}>
                Sponsor competitive prize pools, exhibit space, or laboratory materials for Supernova 3.0. Connect with over 3,000+ talented students and tech leaders.
              </p>
              <Link to="/contact" className="btn btn-primary" style={{ background: "var(--cobalt)", borderColor: "var(--cobalt)" }}>
                Request Sponsorship Prospectus <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
