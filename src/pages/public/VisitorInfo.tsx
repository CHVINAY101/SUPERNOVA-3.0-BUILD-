import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  MapPin, 
  Train, 
  Bus, 
  Clock, 
  Ticket, 
  Car, 
  Utensils, 
  ShieldCheck, 
  ChevronDown, 
  ArrowRight, 
  PhoneCall,
  Calendar,
  Sparkles
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { FaqItem } from "@/types/database";

const DEFAULT_FAQS: FaqItem[] = [
  {
    id: "vfaq-1",
    question: "Is entry to Supernova 3.0 free for visitors and students?",
    answer: "Yes! General admission to explore all four flagship zones—Science Expo, School Kids' Exhibition, Animation Showcase, and viewing the Esports Tournament—is 100% free. We strongly recommend booking your free digital pass online in advance to skip registration queues at the gate.",
    category: "General",
    sort_order: 1,
    is_published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "vfaq-2",
    question: "How do I reach the venue via Namma Metro?",
    answer: "Take the Namma Metro Green Line and alight at 'National College Metro Station'. The college entrance is directly accessible within a 2-minute walk (150 meters) from Exit A.",
    category: "Transit",
    sort_order: 2,
    is_published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "vfaq-3",
    question: "Are parents and school groups welcome?",
    answer: "Absolutely. Supernova is a community-wide educational festival. Teachers bringing school buses are requested to notify the helpdesk in advance for dedicated bus parking space.",
    category: "General",
    sort_order: 3,
    is_published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "vfaq-4",
    question: "Can I participate in esports or submit a project as an individual?",
    answer: "Science Expo and Animation projects accept both solo entries and team submissions (up to 4 members). For Esports, VALORANT requires 5 players, and FREE FIRE and BGMI require 4 players. You can submit your team through the Esports Registration portal.",
    category: "Competitions",
    sort_order: 4,
    is_published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "vfaq-5",
    question: "Are food and refreshments available on campus?",
    answer: "Yes. An open-air food pavilion featuring hygienic vegetarian and snack stalls, fresh juices, and South Indian delicacies will be active on the campus grounds throughout both days.",
    category: "Amenities",
    sort_order: 5,
    is_published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function VisitorInfo() {
  const [faqs, setFaqs] = useState<FaqItem[]>(DEFAULT_FAQS);
  const [openFaq, setOpenFaq] = useState<string | null>("vfaq-1");

  useEffect(() => {
    supabase
      .from("faq_items")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setFaqs(data as FaqItem[]);
        }
      });
  }, []);

  const toggleFaq = (id: string) => {
    setOpenFaq(openFaq === id ? null : id);
  };

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
          <div style={{ maxWidth: 800 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 16px",
                borderRadius: "999px",
                background: "var(--mint)",
                color: "#0d5c3a",
                fontSize: "0.76rem",
                fontWeight: 800,
                letterSpacing: "0.1em",
                marginBottom: 20,
              }}
            >
              <Ticket size={14} />
              VISITOR & ATTENDEE GUIDE
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
              Your Guide to Supernova 3.0
            </h1>
            <p style={{ fontSize: "1.1rem", lineHeight: 1.6, color: "var(--ink-soft)", marginBottom: 28 }}>
              Everything you need to know about reaching The National College Basavanagudi, metro access, campus amenities, timings, and free digital passes.
            </p>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Link to="/register/visitor" className="btn btn-primary" style={{ background: "var(--mint)", color: "#0d5c3a", borderColor: "var(--mint)" }}>
                Get Free Visitor Pass <ArrowRight size={16} />
              </Link>
              <Link to="/schedule" className="btn btn-secondary" style={{ background: "#ffffff" }}>
                View Two-Day Schedule
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Details Strip */}
      <section style={{ background: "#ffffff", borderBottom: "1.5px solid var(--line)", padding: "36px 0" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 28 }}>
            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "12px", background: "var(--pale-blue)", color: "var(--cobalt)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Calendar size={22} />
              </div>
              <div>
                <p style={{ fontSize: "0.76rem", fontWeight: 800, color: "var(--ink-muted)", textTransform: "uppercase" }}>Festival Dates</p>
                <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>20–21 November 2026</p>
                <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>Friday & Saturday</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "12px", background: "var(--pale-blue)", color: "var(--cobalt)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Clock size={22} />
              </div>
              <div>
                <p style={{ fontSize: "0.76rem", fontWeight: 800, color: "var(--ink-muted)", textTransform: "uppercase" }}>Timings</p>
                <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>09:00 AM – 06:00 PM</p>
                <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>Entry gates close 5:15 PM</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "12px", background: "var(--pale-blue)", color: "var(--cobalt)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <MapPin size={22} />
              </div>
              <div>
                <p style={{ fontSize: "0.76rem", fontWeight: 800, color: "var(--ink-muted)", textTransform: "uppercase" }}>Campus Location</p>
                <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>The National College</p>
                <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>Basavanagudi, Bengaluru</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "12px", background: "var(--pale-blue)", color: "var(--cobalt)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Ticket size={22} />
              </div>
              <div>
                <p style={{ fontSize: "0.76rem", fontWeight: 800, color: "var(--ink-muted)", textTransform: "uppercase" }}>Admission</p>
                <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>Free Admission</p>
                <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>Digital QR Pass required</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Transit & How to Reach */}
      <section className="section">
        <div className="container">
          <div style={{ maxWidth: 640, marginBottom: 40 }}>
            <p className="hm-kicker">GETTING HERE</p>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", marginTop: 12 }}>
              Seamless transit right to the campus gates.
            </h2>
            <p style={{ color: "var(--ink-soft)", fontSize: "1.05rem", marginTop: 8 }}>
              Located centrally in the historic cultural heart of South Bengaluru, the campus is surrounded by prime transit links.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, marginBottom: 54 }}>
            <div className="card" style={{ background: "#ffffff", padding: "32px 28px", border: "1.5px solid var(--line)" }}>
              <div style={{ width: 48, height: 48, borderRadius: "14px", background: "rgba(49, 91, 219, 0.1)", color: "var(--cobalt)", display: "grid", placeItems: "center", marginBottom: 20 }}>
                <Train size={24} />
              </div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 8 }}>Via Namma Metro</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem", lineHeight: 1.6 }}>
                Alight at <strong>National College Metro Station</strong> (Green Line). Use Exit A or B. The college main gate is just 150 meters away along Pampa Mahakavi Road.
              </p>
            </div>

            <div className="card" style={{ background: "#ffffff", padding: "32px 28px", border: "1.5px solid var(--line)" }}>
              <div style={{ width: 48, height: 48, borderRadius: "14px", background: "rgba(240, 120, 85, 0.1)", color: "var(--coral)", display: "grid", placeItems: "center", marginBottom: 20 }}>
                <Bus size={24} />
              </div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 8 }}>Via BMTC Bus</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem", lineHeight: 1.6 }}>
                Multiple BMTC buses connect directly via <strong>Gandhi Bazaar Circle</strong>, <strong>Tagore Circle</strong>, and <strong>KR Market</strong>. The nearest bus stop is 'National College'.
              </p>
            </div>

            <div className="card" style={{ background: "#ffffff", padding: "32px 28px", border: "1.5px solid var(--line)" }}>
              <div style={{ width: 48, height: 48, borderRadius: "14px", background: "rgba(119, 85, 216, 0.1)", color: "var(--violet)", display: "grid", placeItems: "center", marginBottom: 20 }}>
                <Car size={24} />
              </div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 8 }}>Parking Facilities</h3>
              <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem", lineHeight: 1.6 }}>
                Designated parking for two-wheelers is available inside the North Gate. Four-wheeler parking is available along designated campus perimeter bays.
              </p>
            </div>
          </div>

          {/* Amenities Strip */}
          <div style={{ background: "var(--paper-soft)", borderRadius: "24px", padding: "32px", border: "1.5px solid var(--line)" }}>
            <h3 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 20 }}>Campus Amenities & Safety</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Utensils size={20} color="var(--cobalt)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Food Court</h4>
                  <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>Clean water dispensers & snack stalls</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <ShieldCheck size={20} color="var(--cobalt)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>First Aid & Helpdesk</h4>
                  <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>Medical personnel on duty all day</p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <Sparkles size={20} color="var(--cobalt)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Accessibility</h4>
                  <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>Ground floor access & ramps for wheelchair users</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section style={{ background: "#ffffff", padding: "80px 0", borderTop: "1.5px solid var(--line)" }}>
        <div className="container" style={{ maxWidth: 840 }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p className="hm-kicker">QUESTIONS & ANSWERS</p>
            <h2 style={{ fontSize: "clamp(2rem, 3.8vw, 3rem)", marginTop: 12 }}>
              Frequently Asked Questions
            </h2>
            <p style={{ color: "var(--ink-soft)", fontSize: "1.05rem", marginTop: 8 }}>
              Everything visitors, parents, and participants need to know before arriving.
            </p>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {faqs.map((faq) => {
              const isOpen = openFaq === faq.id;
              return (
                <div
                  key={faq.id}
                  className="card"
                  style={{
                    background: "var(--paper)",
                    border: "1.5px solid var(--line)",
                    padding: 0,
                    borderRadius: "16px",
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => toggleFaq(faq.id)}
                    style={{
                      width: "100%",
                      padding: "20px 24px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)", paddingRight: 16 }}>
                      {faq.question}
                    </span>
                    <ChevronDown
                      size={20}
                      color="var(--ink)"
                      style={{
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                        flexShrink: 0,
                      }}
                    />
                  </button>

                  {isOpen && (
                    <div style={{ padding: "0 24px 24px 24px", borderTop: "1px solid var(--line-soft)" }}>
                      <p style={{ color: "var(--ink-soft)", fontSize: "0.98rem", lineHeight: 1.65, paddingTop: 16 }}>
                        {faq.answer}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Need help? */}
          <div style={{ marginTop: 48, textAlign: "center" }}>
            <p style={{ color: "var(--ink-soft)", fontSize: "0.95rem" }}>
              Need assistance or special access accommodation?
            </p>
            <Link to="/contact" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--cobalt)", fontWeight: 700, marginTop: 8 }}>
              <PhoneCall size={16} /> Contact Visitor Helpdesk
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
