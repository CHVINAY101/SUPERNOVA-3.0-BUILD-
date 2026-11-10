import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { 
  Play, 
  Clock, 
  Trophy, 
  ArrowLeft, 
  RefreshCw,
  Sparkles
} from "lucide-react";
import type { Game, Match, Registration } from "@/types/database";

export default function EsportsLive() {
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("all");
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchLiveBoard = useCallback(async () => {
    try {
      // 1. Fetch active games
      const { data: gamesData } = await supabase
        .from("games")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setGames(gamesData || []);

      // 2. Fetch matches
      const { data: matchesData } = await supabase
        .from("matches")
        .select("*")
        .eq("is_published", true)
        .order("scheduled_start", { ascending: true });
      setMatches(matchesData || []);

      // 3. Fetch teams
      const { data: teamsData } = await supabase.from("registrations").select("*");
      setTeams(teamsData || []);

      setLastRefreshed(new Date());
    } catch (err) {
      console.warn("Failed to fetch live board:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Connect to live Postgres changes on matches & games
  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "matches", onRefresh: fetchLiveBoard },
      { table: "games", onRefresh: fetchLiveBoard },
    ],
    "esports-live"
  );

  useEffect(() => {
    fetchLiveBoard();
    const interval = setInterval(fetchLiveBoard, 20000); // 20-second fallback poll
    return () => clearInterval(interval);
  }, [fetchLiveBoard]);

  const teamMap = new Map<string, Registration>();
  teams.forEach((t) => teamMap.set(t.id, t));

  const filteredMatches = selectedGameId === "all"
    ? matches
    : matches.filter((m) => m.game_id === selectedGameId);

  const liveMatches = filteredMatches.filter((m) => m.status === "live");
  const upcomingMatches = filteredMatches.filter((m) => m.status === "upcoming");
  const completedMatches = filteredMatches.filter((m) => m.status === "completed");

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return "";
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString;
    }
  };

  return (
    <div style={{ background: "#0e131f", color: "#ffffff", minHeight: "100vh", padding: "40px 20px 80px" }}>
      <div className="container" style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* Navigation & Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
          <Link
            to="/esports"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "rgba(255,255,255,0.7)",
              fontSize: "0.9rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={16} /> Back to Esports Portal
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} variant="dark" />
            <button
              onClick={fetchLiveBoard}
              style={{ background: "transparent", border: 0, color: "#38bdf8", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}
              title="Refresh now"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline text-xs text-white/60">Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            </button>
          </div>
        </div>

        {/* Board Title */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 16px",
              borderRadius: 9999,
              background: "rgba(240, 120, 85, 0.15)",
              border: "1.5px solid rgba(240, 120, 85, 0.35)",
              color: "var(--coral, #f07855)",
              fontSize: "0.82rem",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            <Sparkles size={14} /> LIVE ARENA SCOREBOARD
          </div>
          <h1
            style={{
              fontFamily: 'Syne, "Space Grotesk", sans-serif',
              fontSize: "clamp(2.4rem, 5vw, 4rem)",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              margin: 0,
              color: "#ffffff",
            }}
          >
            Tournament Match Center
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "1.05rem", marginTop: 8 }}>
            Real-time brackets, stage scores, and upcoming matchups across VALORANT, BGMI, and FREE FIRE.
          </p>
        </div>

        {/* Filter Tabs by Game */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 40, flexWrap: "wrap" }}>
          <button
            onClick={() => setSelectedGameId("all")}
            style={{
              padding: "10px 20px",
              borderRadius: 9999,
              fontSize: "0.88rem",
              fontWeight: 800,
              border: "1.5px solid",
              borderColor: selectedGameId === "all" ? "var(--coral, #f07855)" : "rgba(255,255,255,0.15)",
              background: selectedGameId === "all" ? "var(--coral, #f07855)" : "rgba(255,255,255,0.05)",
              color: "#ffffff",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            All Games
          </button>
          {games.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGameId(g.id)}
              style={{
                padding: "10px 20px",
                borderRadius: 9999,
                fontSize: "0.88rem",
                fontWeight: 800,
                border: "1.5px solid",
                borderColor: selectedGameId === g.id ? "var(--coral, #f07855)" : "rgba(255,255,255,0.15)",
                background: selectedGameId === g.id ? "var(--coral, #f07855)" : "rgba(255,255,255,0.05)",
                color: "#ffffff",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {g.title}
            </button>
          ))}
        </div>

        {/* 1. NOW PLAYING (LIVE NOW) */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#ef4444",
                boxShadow: "0 0 12px #ef4444",
                display: "inline-block",
                animation: "pulse 1.5s infinite",
              }}
            />
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, letterSpacing: "0.02em" }}>
              LIVE NOW IN THE ARENA
            </h2>
          </div>

          {liveMatches.length === 0 ? (
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px dashed rgba(255,255,255,0.15)",
                borderRadius: 16,
                padding: "36px 24px",
                textAlign: "center",
              }}
            >
              <Clock size={32} color="rgba(255,255,255,0.4)" style={{ margin: "0 auto 10px" }} />
              <p style={{ fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>No matches currently in progress.</p>
              <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                Next matchups are listed below. Live matches will appear with real-time score updates.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              {liveMatches.map((m) => {
                const teamA = teamMap.get(m.team_a_id || "");
                const teamB = teamMap.get(m.team_b_id || "");

                return (
                  <div
                    key={m.id}
                    style={{
                      background: "linear-gradient(135deg, rgba(240, 120, 85, 0.12) 0%, rgba(49, 91, 219, 0.1) 100%)",
                      border: "2px solid var(--coral, #f07855)",
                      borderRadius: 18,
                      padding: "24px 28px",
                      boxShadow: "0 10px 30px rgba(240, 120, 85, 0.18)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--coral, #f07855)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {m.round || "Arena Stage"}
                      </span>
                      <span
                        style={{
                          background: "#ef4444",
                          color: "#ffffff",
                          fontSize: "0.75rem",
                          fontWeight: 900,
                          padding: "4px 12px",
                          borderRadius: 9999,
                          letterSpacing: "0.08em",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Play size={10} fill="#ffffff" /> LIVE MATCH
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center", textAlign: "center" }}>
                      <div style={{ textAlign: "right" }}>
                        <h3 style={{ fontSize: "clamp(1.2rem, 3vw, 1.8rem)", fontWeight: 900, margin: 0 }}>
                          {teamA?.team_name || "Team Alpha"}
                        </h3>
                        <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                          {teamA?.institution || "Collegiate"}
                        </p>
                      </div>

                      <div
                        style={{
                          fontFamily: 'Syne, "Space Grotesk", sans-serif',
                          fontSize: "clamp(2rem, 5vw, 3.4rem)",
                          fontWeight: 900,
                          color: "#ffffff",
                          background: "rgba(0,0,0,0.5)",
                          padding: "8px 24px",
                          borderRadius: 14,
                          border: "1.5px solid rgba(255,255,255,0.15)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {m.score_a} : {m.score_b}
                      </div>

                      <div style={{ textAlign: "left" }}>
                        <h3 style={{ fontSize: "clamp(1.2rem, 3vw, 1.8rem)", fontWeight: 900, margin: 0 }}>
                          {teamB?.team_name || "Team Bravo"}
                        </h3>
                        <p style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                          {teamB?.institution || "Collegiate"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 2. UP NEXT (SCHEDULED MATCHES) */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 20, color: "#38bdf8" }}>
            UP NEXT ON STAGE
          </h2>

          {upcomingMatches.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.9rem" }}>No upcoming matches scheduled for this game.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
              {upcomingMatches.map((m) => {
                const teamA = teamMap.get(m.team_a_id || "");
                const teamB = teamMap.get(m.team_b_id || "");

                return (
                  <div
                    key={m.id}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 14,
                      padding: "20px 22px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#38bdf8", fontWeight: 700, marginBottom: 12 }}>
                      <span>{m.round || "Upcoming Match"}</span>
                      {m.scheduled_start && <span>Starts {formatTime(m.scheduled_start)}</span>}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>{teamA?.team_name || "TBD"}</p>
                        <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{teamA?.institution}</p>
                      </div>
                      <span style={{ fontWeight: 800, color: "rgba(255,255,255,0.3)" }}>VS</span>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>{teamB?.team_name || "TBD"}</p>
                        <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{teamB?.institution}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 3. RECENT RESULTS */}
        {completedMatches.length > 0 && (
          <section>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 20, color: "#10b981" }}>
              RECENT RESULTS
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
              {completedMatches.map((m) => {
                const teamA = teamMap.get(m.team_a_id || "");
                const teamB = teamMap.get(m.team_b_id || "");
                const winner = teamMap.get(m.winner_id || "");

                return (
                  <div
                    key={m.id}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 14,
                      padding: "18px 20px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#10b981", fontWeight: 700, marginBottom: 10 }}>
                      <span>{m.round}</span>
                      <span>FINAL: {m.score_a} - {m.score_b}</span>
                    </div>

                    <p style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
                      {teamA?.team_name} vs {teamB?.team_name}
                    </p>

                    {winner && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "#10b981", fontWeight: 700, marginTop: 8 }}>
                        <Trophy size={14} /> Winner: {winner.team_name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
