import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import type { ScheduleItem } from "@/types/database";
import { SharedPageHeader } from "@/components/SharedPageHeader";
import { Clock, MapPin } from "lucide-react";

const DEFAULT_SCHEDULE: ScheduleItem[] = [
  {
    id: "d1-01",
    event_date: "2026-11-20",
    start_time: "09:00:00",
    end_time: "10:30:00",
    title: "Grand Inaugural Ceremony & Lamp Lighting",
    description: "Welcome address by NES Trustees, lighting of the ceremonial lamp, and keynote addresses by distinguished guest scientists and animators.",
    venue: "Centenary Auditorium, The National College",
    component: "General",
    is_published: true,
    sort_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "d1-02",
    event_date: "2026-11-20",
    start_time: "10:30:00",
    end_time: "17:00:00",
    title: "Science Zone Public Exposition",
    description: "Interactive exhibits from schools and colleges across Karnataka. Robotics arenas, applied physics, renewable energy prototypes.",
    venue: "Main Quadrangle & Ground Floor Labs",
    component: "Science",
    is_published: true,
    sort_order: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "d1-03",
    event_date: "2026-11-20",
    start_time: "11:00:00",
    end_time: "17:30:00",
    title: "Animation Department Interactive Studio & Screenings",
    description: "Live 3D character sculpting in Blender, 2D frame-by-frame animation stations, and digital painting gallery.",
    venue: "Animation Gallery & Media Floor",
    component: "Animation",
    is_published: true,
    sort_order: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "d1-04",
    event_date: "2026-11-20",
    start_time: "11:30:00",
    end_time: "18:00:00",
    title: "E-Sports Tournament Qualifier Brackets (Day 1)",
    description: "Group stage matches and prelim knockouts for collegiate teams.",
    venue: "Esports Digital Arena, Centenary Auditorium",
    component: "E-Sports",
    is_published: true,
    sort_order: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "d1-05",
    event_date: "2026-11-20",
    start_time: "",
    end_time: "",
    title: "Technology Zone Speed Pitches & Code Demos",
    description: "Embedded hardware, microcontroller circuits, and prototype pitches to guest technical judges.",
    venue: "Seminar Hall 1",
    component: "Technology",
    is_published: true,
    sort_order: 5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "d2-01",
    event_date: "2026-11-21",
    start_time: "09:30:00",
    end_time: "16:30:00",
    title: "Science & Technology Grand Finale Jury Rounds",
    description: "Final rounds of model evaluations, jury deliberations, and student presentation sessions.",
    venue: "Main Quadrangle & Centenary Hall",
    component: "Science",
    is_published: true,
    sort_order: 6,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "d2-02",
    event_date: "2026-11-21",
    start_time: "10:00:00",
    end_time: "15:00:00",
    title: "Animation Showcase Screening & Portfolio Reviews",
    description: "Short film premieres, student reels, and one-on-one portfolio evaluations with industry professionals.",
    venue: "Centenary Auditorium Screen 1",
    component: "Animation",
    is_published: true,
    sort_order: 7,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "d2-03",
    event_date: "2026-11-21",
    start_time: "11:00:00",
    end_time: "17:00:00",
    title: "E-Sports Grand Finals & Championship Stage",
    description: "Championship brackets, live casters, and trophy presentation on the main stage.",
    venue: "Centenary Mainstage",
    component: "E-Sports",
    is_published: true,
    sort_order: 8,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "d2-04",
    event_date: "2026-11-21",
    start_time: "17:30:00",
    end_time: "19:00:00",
    title: "Valedictory Ceremony & Awards Presentation",
    description: "Felicitation of prize winners across all four zones, remarks by NES leadership, and festival closing.",
    venue: "Centenary Auditorium, The National College",
    component: "General",
    is_published: true,
    sort_order: 9,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "d2-05",
    event_date: "2026-11-21",
    start_time: "",
    end_time: "",
    title: "Alumni & Industry Networking Reception",
    description: "Informal networking session between collegiate innovators, alumni mentors, and sponsors.",
    venue: "Centenary Quadrangle Lounge",
    component: "General",
    is_published: true,
    sort_order: 10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function Schedule() {
  const [activeDay, setActiveDay] = useState<"2026-11-20" | "2026-11-21">("2026-11-20");
  const [items, setItems] = useState<ScheduleItem[]>(DEFAULT_SCHEDULE);

  const loadSchedule = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("schedule_items")
        .select("*")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });

      if (!error && data && data.length > 0) {
        setItems(data as ScheduleItem[]);
      }
    } catch {
      // Fall back to DEFAULT_SCHEDULE
    }
  }, []);

  // Live Realtime Subscription for schedule_items
  useRealtimeSubscription(
    { table: "schedule_items", onRefresh: loadSchedule },
    "public-schedule"
  );

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => item.event_date === activeDay);
  }, [items, activeDay]);

  return (
    <div style={{ background: "#FFFFFF", color: "#0B0B1E", minHeight: "100vh" }}>
      {/* Shared Page Header */}
      <SharedPageHeader
        title="Festival Schedule"
        tag="PROGRAM ITINERARY"
        subtitle="Two full days of competitions, exhibitions, screenings, and championship matches at The National College."
      />

      <section style={{ padding: "clamp(60px, 10vh, 100px) 0" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 clamp(16px, 4vw, 36px)" }}>
          {/* Day 1 / Day 2 Tab Switcher */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              marginBottom: "clamp(36px, 6vh, 56px)",
            }}
          >
            <button
              onClick={() => setActiveDay("2026-11-20")}
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: "clamp(0.82rem, 1.3vw, 0.95rem)",
                fontWeight: 800,
                padding: "12px 28px",
                borderRadius: "9999px",
                border: activeDay === "2026-11-20" ? "2px solid #2E2A8A" : "1.5px solid rgba(46, 42, 138, 0.2)",
                background: activeDay === "2026-11-20" ? "#2E2A8A" : "#F6F3FF",
                color: activeDay === "2026-11-20" ? "#FFFFFF" : "#38375A",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Day 1 · Friday, 20 Nov 2026
            </button>

            <button
              onClick={() => setActiveDay("2026-11-21")}
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: "clamp(0.82rem, 1.3vw, 0.95rem)",
                fontWeight: 800,
                padding: "12px 28px",
                borderRadius: "9999px",
                border: activeDay === "2026-11-21" ? "2px solid #5648B0" : "1.5px solid rgba(86, 72, 176, 0.2)",
                background: activeDay === "2026-11-21" ? "#5648B0" : "#F6F3FF",
                color: activeDay === "2026-11-21" ? "#FFFFFF" : "#38375A",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Day 2 · Saturday, 21 Nov 2026
            </button>
          </div>

          {/* Clean Program List (Unknown times marked "TBA") */}
          <div style={{ display: "grid", gap: 18 }}>
            {filteredItems.map((item) => {
              const hasTime = Boolean(item.start_time && item.start_time.trim().length > 0);
              const timeDisplay = item.start_time && item.start_time.trim().length > 0
                ? `${item.start_time.slice(0, 5)} – ${item.end_time?.slice(0, 5) || "Close"}`
                : "TBA";

              return (
                <div
                  key={item.id}
                  style={{
                    padding: "clamp(20px, 3.5vw, 28px)",
                    borderRadius: "20px",
                    background: "#F6F3FF",
                    border: "1px solid rgba(46, 42, 138, 0.1)",
                    display: "grid",
                    gridTemplateColumns: "clamp(120px, 20%, 180px) 1fr",
                    gap: "clamp(16px, 3vw, 28px)",
                    alignItems: "flex-start",
                  }}
                  className="schedule-item-card"
                >
                  {/* Time Badge (or TBA) */}
                  <div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: "'Unbounded', sans-serif",
                        fontSize: "0.82rem",
                        fontWeight: 800,
                        color: hasTime ? "#2E2A8A" : "#F47B20",
                        background: hasTime ? "rgba(46, 42, 138, 0.08)" : "rgba(244, 123, 32, 0.1)",
                        padding: "6px 14px",
                        borderRadius: "8px",
                      }}
                    >
                      <Clock size={14} />
                      <span>{timeDisplay}</span>
                    </div>

                    <span
                      style={{
                        display: "block",
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        color: "#5648B0",
                        marginTop: 8,
                        textTransform: "uppercase",
                      }}
                    >
                      {item.component}
                    </span>
                  </div>

                  {/* Details */}
                  <div>
                    <h3
                      style={{
                        fontFamily: "'Unbounded', sans-serif",
                        fontWeight: 800,
                        fontSize: "clamp(1.1rem, 2vw, 1.35rem)",
                        color: "#0B0B1E",
                        margin: "0 0 8px",
                      }}
                    >
                      {item.title}
                    </h3>

                    {item.description && (
                      <p
                        style={{
                          fontFamily: "'Montserrat', sans-serif",
                          color: "#38375A",
                          fontSize: "0.9rem",
                          lineHeight: 1.6,
                          margin: "0 0 12px",
                        }}
                      >
                        {item.description}
                      </p>
                    )}

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: "#6B688A",
                      }}
                    >
                      <MapPin size={14} color="#2E2A8A" />
                      <span>{item.venue}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
