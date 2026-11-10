import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { usePublicRows } from "@/hooks/usePublicRows";
import { Reveal } from "@/components/Reveal";
import { Calendar, Clock, MapPin, ArrowRight, X, ChevronLeft, ChevronRight, Bell, HelpCircle } from "lucide-react";
import type { Announcement, FaqItem, GalleryItem, ScheduleItem } from "@/types/database";

const loadSchedule = () =>
  supabase
    .from("schedule_items")
    .select("*")
    .eq("is_published", true)
    .order("event_date", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(10);

const loadGallery = () =>
  supabase
    .from("gallery_items")
    .select("*")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .limit(6);

const loadFaqs = () =>
  supabase
    .from("faq_items")
    .select("*")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .limit(6);

const loadAnnouncements = () =>
  supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(3);

function formatDate(isoDate: string) {
  try {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function formatTime(time: string | null) {
  if (!time) return null;
  return time.slice(0, 5);
}

export function HomeLiveContent() {
  const schedule = usePublicRows<ScheduleItem>(loadSchedule);
  const gallery = usePublicRows<GalleryItem>(loadGallery);
  const faqs = usePublicRows<FaqItem>(loadFaqs);
  const announcements = usePublicRows<Announcement>(loadAnnouncements);

  const [activeDay, setActiveDay] = useState<string>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const scheduleRows = schedule.rows ?? [];
  const galleryRows = gallery.rows ?? [];
  const announcementsRows = announcements.rows ?? [];
  const faqRows = faqs.rows ?? [];

  // Filter schedule by selected date
  const filteredSchedule = activeDay === "all"
    ? scheduleRows
    : scheduleRows.filter((s) => s.event_date === activeDay);

  const openLightbox = (idx: number) => setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);
  const prevLightbox = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex - 1 + galleryRows.length) % galleryRows.length);
  };
  const nextLightbox = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex + 1) % galleryRows.length);
  };

  return (
    <>
      {/* SECTION 05 — EVENT DATES & SCHEDULE INTERFACE */}
      <section className="section" style={{ background: "var(--paper-deep)", borderTop: "1.5px solid var(--line)" }}>
        <div className="container">
          <Reveal>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 40 }}>
              <div>
                <p className="hm-kicker">2-DAY FESTIVAL SCHEDULE</p>
                <h2 className="section-title" style={{ marginTop: 8 }}>
                  What happens when
                </h2>
                <p style={{ color: "var(--ink-soft)", fontSize: "1rem" }}>
                  Venue: The National College, Basavanagudi · 20–21 November 2026
                </p>
              </div>
              <Link to="/schedule" className="btn btn-secondary" style={{ background: "#ffffff" }}>
                Full programme <ArrowRight size={16} />
              </Link>
            </div>
          </Reveal>

          {/* Date Filter Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 32, flexWrap: "wrap" }}>
            <button
              onClick={() => setActiveDay("all")}
              style={{
                padding: "10px 22px",
                borderRadius: "999px",
                border: "1.5px solid var(--ink)",
                fontSize: "0.86rem",
                fontWeight: 700,
                background: activeDay === "all" ? "var(--ink)" : "#ffffff",
                color: activeDay === "all" ? "#ffffff" : "var(--ink)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              All Events
            </button>
            <button
              onClick={() => setActiveDay("2026-11-20")}
              style={{
                padding: "10px 22px",
                borderRadius: "999px",
                border: "1.5px solid var(--ink)",
                fontSize: "0.86rem",
                fontWeight: 700,
                background: activeDay === "2026-11-20" ? "var(--cobalt)" : "#ffffff",
                color: activeDay === "2026-11-20" ? "#ffffff" : "var(--ink)",
                borderColor: activeDay === "2026-11-20" ? "var(--cobalt)" : "var(--ink)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Day 1 · 20 Nov 2026
            </button>
            <button
              onClick={() => setActiveDay("2026-11-21")}
              style={{
                padding: "10px 22px",
                borderRadius: "999px",
                border: "1.5px solid var(--ink)",
                fontSize: "0.86rem",
                fontWeight: 700,
                background: activeDay === "2026-11-21" ? "var(--coral)" : "#ffffff",
                color: activeDay === "2026-11-21" ? "#ffffff" : "var(--ink)",
                borderColor: activeDay === "2026-11-21" ? "var(--coral)" : "var(--ink)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Day 2 · 21 Nov 2026
            </button>
          </div>

          {/* Schedule Cards List */}
          {filteredSchedule.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 48 }}>
              <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>OFFICIAL SCHEDULE COMING SOON</p>
              <p style={{ color: "var(--ink-soft)", marginTop: 8 }}>Schedule timelines are currently being finalized by the organizing committee.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {filteredSchedule.map((item) => (
                <div
                  key={item.id}
                  className="card card-hover"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "180px 1fr auto",
                    gap: 24,
                    alignItems: "center",
                    padding: "24px 28px",
                    background: "#ffffff",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", fontWeight: 700, color: "var(--cobalt)" }}>
                      <Calendar size={14} />
                      {formatDate(item.event_date)}
                    </div>
                    {item.start_time && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--ink-soft)", marginTop: 4 }}>
                        <Clock size={14} />
                        {formatTime(item.start_time)}
                        {item.end_time ? ` – ${formatTime(item.end_time)}` : ""}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{item.title}</h3>
                    {item.venue && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.86rem", color: "var(--ink-soft)", marginTop: 4 }}>
                        <MapPin size={14} color="var(--coral)" />
                        {item.venue}
                      </div>
                    )}
                  </div>
                  {item.component && (
                    <span
                      style={{
                        padding: "6px 14px",
                        borderRadius: "999px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        background: item.component === "esports" ? "rgba(240, 120, 85, 0.15)" : "rgba(49, 91, 219, 0.12)",
                        color: item.component === "esports" ? "var(--coral)" : "var(--cobalt)",
                      }}
                    >
                      {item.component.replace("_", " ")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 07 — GALLERY WITH LIGHTBOX */}
      <section className="section" style={{ background: "var(--paper)" }}>
        <div className="container">
          <Reveal>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 40 }}>
              <div>
                <p className="hm-kicker">MOMENTS & EXHIBITS</p>
                <h2 className="section-title" style={{ marginTop: 8 }}>
                  Festival visual gallery
                </h2>
                <p style={{ color: "var(--ink-soft)", fontSize: "1rem" }}>
                  A preview of installations, student models, creative art, and competitive stages.
                </p>
              </div>
              <Link to="/gallery" className="btn btn-secondary" style={{ background: "#ffffff" }}>
                Explore full gallery <ArrowRight size={16} />
              </Link>
            </div>
          </Reveal>

          {galleryRows.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 48 }}>
              <p style={{ color: "var(--ink-soft)" }}>Official festival media will appear here once published.</p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 24,
              }}
            >
              {galleryRows.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => openLightbox(idx)}
                  className="card-hover"
                  style={{
                    position: "relative",
                    borderRadius: "24px",
                    overflow: "hidden",
                    aspectRatio: "4 / 3",
                    cursor: "pointer",
                    boxShadow: "0 14px 28px -10px rgba(0,0,0,0.1)",
                    border: "1.5px solid var(--line)",
                  }}
                >
                  <img
                    src={item.image_url}
                    alt={item.title ?? "Supernova gallery photo"}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transition: "transform 0.5s ease",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(to top, rgba(23,23,27,0.85) 0%, rgba(23,23,27,0) 60%)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      padding: "20px",
                      color: "#ffffff",
                    }}
                  >
                    <h3 style={{ fontSize: "1.1rem", color: "#ffffff", fontWeight: 700 }}>{item.title}</h3>
                    {item.description && (
                      <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.8)", marginTop: 4 }}>
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* LIGHTBOX MODAL */}
      {lightboxIndex !== null && galleryRows[lightboxIndex] && (
        <div
          role="dialog"
          aria-label="Image Lightbox"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "rgba(10, 10, 12, 0.95)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            aria-label="Close image viewer"
            style={{
              position: "absolute",
              top: 24,
              right: 24,
              color: "#ffffff",
              background: "rgba(255,255,255,0.15)",
              border: 0,
              width: 44,
              height: 44,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <X size={24} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              prevLightbox();
            }}
            aria-label="Previous image"
            style={{
              position: "absolute",
              left: 24,
              color: "#ffffff",
              background: "rgba(255,255,255,0.15)",
              border: 0,
              width: 48,
              height: 48,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <ChevronLeft size={28} />
          </button>

          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 960,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <img
              src={galleryRows[lightboxIndex].image_url}
              alt={galleryRows[lightboxIndex].title ?? "Full preview"}
              style={{
                maxWidth: "100%",
                maxHeight: "72vh",
                borderRadius: "16px",
                objectFit: "contain",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
              }}
            />
            <div style={{ marginTop: 16, textAlign: "center", color: "#ffffff" }}>
              <h3 style={{ fontSize: "1.3rem", color: "#ffffff" }}>{galleryRows[lightboxIndex].title}</h3>
              {galleryRows[lightboxIndex].description && (
                <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.75)", marginTop: 4 }}>
                  {galleryRows[lightboxIndex].description}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              nextLightbox();
            }}
            aria-label="Next image"
            style={{
              position: "absolute",
              right: 24,
              color: "#ffffff",
              background: "rgba(255,255,255,0.15)",
              border: 0,
              width: 48,
              height: 48,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <ChevronRight size={28} />
          </button>
        </div>
      )}

      {/* SECTION 08 — ANNOUNCEMENTS */}
      <section className="section" style={{ background: "var(--paper-deep)", borderTop: "1.5px solid var(--line)" }}>
        <div className="container">
          <Reveal>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 40 }}>
              <div>
                <p className="hm-kicker">LATEST UPDATES</p>
                <h2 className="section-title" style={{ marginTop: 8 }}>
                  Festival announcements
                </h2>
                <p style={{ color: "var(--ink-soft)", fontSize: "1rem" }}>
                  Important notices, entry schedules, and roster releases from the organising desk.
                </p>
              </div>
              <Link to="/announcements" className="btn btn-secondary" style={{ background: "#ffffff" }}>
                All notices <ArrowRight size={16} />
              </Link>
            </div>
          </Reveal>

          {announcementsRows.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: 48 }}>
              <p style={{ color: "var(--ink-soft)" }}>Official announcements will appear here once published.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
              {announcementsRows.map((ann) => (
                <article
                  key={ann.id}
                  className="card card-hover"
                  style={{
                    background: "#ffffff",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <Bell size={16} color="var(--cobalt)" />
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--cobalt)" }}>
                        {ann.published_at ? formatDate(ann.published_at.slice(0, 10)) : "OFFICIAL UPDATE"}
                      </span>
                      {ann.is_pinned && (
                        <span
                          style={{
                            marginLeft: "auto",
                            padding: "3px 10px",
                            borderRadius: "999px",
                            background: "var(--yellow)",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            letterSpacing: "0.06em",
                          }}
                        >
                          PINNED
                        </span>
                      )}
                    </div>
                    <h3 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 12 }}>{ann.title}</h3>
                    <p style={{ fontSize: "0.92rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>{ann.body}</p>
                  </div>
                  <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line-soft)" }}>
                    <Link to="/announcements" style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--cobalt)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Read details <ArrowRight size={14} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 09 — VISITOR INFORMATION & FAQS */}
      <section className="section" style={{ background: "var(--paper)" }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 56 }}>
              <div style={{ display: "inline-flex", padding: 12, borderRadius: "50%", background: "var(--pale-blue)", color: "var(--cobalt)", marginBottom: 16 }}>
                <HelpCircle size={28} />
              </div>
              <p className="hm-kicker">QUESTIONS, ANSWERED</p>
              <h2 className="section-title" style={{ marginTop: 8 }}>
                Visitor guide & FAQs
              </h2>
              <p style={{ color: "var(--ink-soft)", fontSize: "1.05rem", maxWidth: 620, margin: "0 auto" }}>
                Everything you need to know about attendance, safety, registration passes, and campus facilities.
              </p>
            </div>
          </Reveal>

          <div style={{ display: "grid", gap: 16 }}>
            {faqRows.map((faq) => (
              <details
                key={faq.id}
                className="card"
                style={{
                  background: "#ffffff",
                  padding: "24px 28px",
                  cursor: "pointer",
                }}
              >
                <summary
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "1.15rem",
                    fontWeight: 700,
                    listStyle: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <span>{faq.question}</span>
                  <span style={{ fontSize: "1.5rem", color: "var(--cobalt)" }}>+</span>
                </summary>
                <p style={{ marginTop: 16, color: "var(--ink-soft)", lineHeight: 1.65, fontSize: "0.98rem", paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 40 }}>
            <Link to="/visitor-info" className="btn btn-secondary" style={{ background: "#ffffff" }}>
              Explore comprehensive visitor guide <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
