import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import type { Announcement } from "@/types/database";
import { SharedPageHeader } from "@/components/SharedPageHeader";
import { FESTIVAL_IMAGES } from "@/config/images";
import { Search } from "lucide-react";

interface NewsItem {
  id: string;
  title: string;
  body: string;
  date: string;
  tag: string;
  image: string;
}

const DEFAULT_NEWS: NewsItem[] = FESTIVAL_IMAGES.updates.map((u) => ({
  id: u.id,
  title: u.title,
  body: u.snippet,
  date: u.date,
  tag: u.category,
  image: u.image,
}));

export default function Announcements() {
  const [news, setNews] = useState<NewsItem[]>(DEFAULT_NEWS);
  const [search, setSearch] = useState("");

  const fetchAnnouncements = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("announcements")
        .select("*")
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        const mapped = (data as Announcement[]).map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          date: new Date(a.created_at).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
          tag: a.category || (a.is_pinned ? "Pinned Notice" : "Official Update"),
          image: FESTIVAL_IMAGES.home.zones.science.src,
        }));
        setNews(mapped);
      }
    } catch (err) {
      console.warn("Failed to load announcements:", err);
    }
  }, []);

  // Live Realtime Subscription for public announcements
  useRealtimeSubscription(
    { table: "announcements", onRefresh: fetchAnnouncements },
    "public-announcements"
  );

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const filteredNews = useMemo(() => {
    if (!search.trim()) return news;
    const q = search.toLowerCase();
    return news.filter(
      (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tag.toLowerCase().includes(q)
    );
  }, [news, search]);

  return (
    <div style={{ background: "#FFFFFF", color: "#0B0B1E", minHeight: "100vh" }}>
      {/* Shared Page Header */}
      <SharedPageHeader
        title="Official Updates"
        tag="NEWS & DISPATCHES"
        subtitle="Latest announcements, guidelines, and schedule releases for Supernova 3.0 at The National College."
      />

      <section style={{ padding: "clamp(60px, 10vh, 100px) 0" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 clamp(16px, 4vw, 36px)" }}>
          {/* Search Bar */}
          <div style={{ maxWidth: 480, margin: "0 auto clamp(36px, 6vh, 56px)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 18px",
                borderRadius: "9999px",
                background: "#F6F3FF",
                border: "1.5px solid rgba(46, 42, 138, 0.15)",
              }}
            >
              <Search size={18} color="#2E2A8A" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search updates or topics..."
                style={{
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  width: "100%",
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: "0.88rem",
                  color: "#0B0B1E",
                }}
              />
            </div>
          </div>

          {/* News Cards Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "clamp(20px, 3.5vw, 32px)",
            }}
          >
            {filteredNews.map((item) => (
              <article
                key={item.id}
                style={{
                  borderRadius: "20px",
                  overflow: "hidden",
                  background: "#F6F3FF",
                  border: "1px solid rgba(46, 42, 138, 0.1)",
                  boxShadow: "0 8px 24px rgba(46, 42, 138, 0.04)",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 0.3s ease, box-shadow 0.3s ease",
                }}
                className="news-card"
              >
                <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden" }}>
                  <img
                    src={item.image}
                    alt={item.title}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(46, 42, 138, 0.18)",
                      mixBlendMode: "multiply",
                    }}
                  />
                </div>

                <div style={{ padding: "clamp(18px, 3vw, 24px)", display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span
                      style={{
                        fontFamily: "'Unbounded', sans-serif",
                        fontSize: "0.68rem",
                        fontWeight: 800,
                        color: "#2E2A8A",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {item.tag}
                    </span>
                    <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "0.78rem", color: "#6B688A" }}>
                      {item.date}
                    </span>
                  </div>

                  <h3
                    style={{
                      fontFamily: "'Unbounded', sans-serif",
                      fontWeight: 800,
                      fontSize: "clamp(1.05rem, 1.8vw, 1.25rem)",
                      color: "#0B0B1E",
                      margin: "0 0 10px",
                      lineHeight: 1.25,
                    }}
                  >
                    {item.title}
                  </h3>

                  <p
                    style={{
                      fontFamily: "'Montserrat', sans-serif",
                      fontSize: "0.88rem",
                      color: "#38375A",
                      lineHeight: 1.6,
                      margin: "0 0 16px",
                      flex: 1,
                    }}
                  >
                    {item.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        .news-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 36px rgba(46, 42, 138, 0.1) !important;
        }
      `}</style>
    </div>
  );
}
