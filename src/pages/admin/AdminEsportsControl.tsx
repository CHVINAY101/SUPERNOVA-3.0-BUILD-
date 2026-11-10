import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { 
  Gamepad2, 
  ExternalLink, 
  CheckCircle, 
  Users, 
  Trophy, 
  Send, 
  Play, 
  AlertOctagon, 
  RefreshCw,
  Plus,
  X
} from "lucide-react";
import type { Game, Registration, Player, Match } from "@/types/database";

export default function AdminEsportsControl() {
  const { user } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("2757504c-2466-4515-8a7d-997e5e170139");
  const [teams, setTeams] = useState<Registration[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  // Status & feedback alerts
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Quick Team Announcement state
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  // New Match modal state
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [roundName, setRoundName] = useState("Group Stage");
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [scheduledStart, setScheduledStart] = useState("2026-11-20T11:30");
  const [creatingMatch, setCreatingMatch] = useState(false);

  // Disqualify confirmation target
  const [disqualifyTarget, setDisqualifyTarget] = useState<Registration | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch active games
      const { data: gamesData } = await supabase
        .from("games")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      const gameList = gamesData || [];
      setGames(gameList);
      if (gameList.length > 0 && (!selectedGameId || !gameList.some(g => g.id === selectedGameId))) {
        setSelectedGameId(gameList[0].id);
      }

      // 2. Fetch esports registrations
      const { data: regsData } = await supabase
        .from("registrations")
        .select("*")
        .order("submitted_at", { ascending: false });
      setTeams(regsData || []);

      // 3. Fetch players
      const { data: playersData } = await supabase.from("players").select("*");
      setPlayers(playersData || []);

      // 4. Fetch matches
      const { data: matchesData } = await supabase
        .from("matches")
        .select("*")
        .order("scheduled_start", { ascending: true });
      setMatches(matchesData || []);
    } catch (err) {
      console.warn("Failed to load esports control data:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedGameId]);

  // Live Realtime Subscriptions for Esports operations
  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "matches", onRefresh: fetchData },
      { table: "registrations", onRefresh: fetchData },
      { table: "players", onRefresh: fetchData },
      { table: "games", onRefresh: fetchData },
    ],
    "admin-esports"
  );

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 25000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Filter confirmed teams for selected game
  const currentGameTeams = teams.filter(
    (t) => t.game_id === selectedGameId && t.status === "confirmed"
  );

  // Filter matches for selected game
  const currentGameMatches = matches.filter((m) => m.game_id === selectedGameId);

  // Toggle Team Arrived check-in
  const toggleTeamCheckIn = async (team: Registration) => {
    setStatusMsg(null);
    const isCurrentlyCheckedIn = (team as any).check_in_status === "checked_in";
    const nextStatus = isCurrentlyCheckedIn ? "not_checked_in" : "checked_in";
    const nowIso = new Date().toISOString();

    try {
      await supabase.from("registrations").update({
        check_in_status: nextStatus,
        checked_in_at: nextStatus === "checked_in" ? nowIso : null,
        checked_in_by: user?.email || "esports-staff@supernova.edu",
      }).eq("id", team.id);

      if (nextStatus === "checked_in") {
        await supabase.from("check_ins").insert({
          registration_id: team.id,
          check_in_type: "team",
          checked_in_by: user?.email || "esports-staff@supernova.edu",
          checked_in_at: nowIso,
          notes: `Esports Team "${team.team_name}" marked arrived`,
        });
      }

      setTeams((prev) =>
        prev.map((t) =>
          t.id === team.id
            ? ({
                ...t,
                check_in_status: nextStatus,
                checked_in_at: nextStatus === "checked_in" ? nowIso : null,
              } as any)
            : t
        )
      );

      setStatusMsg({
        type: "success",
        text: `Team "${team.team_name}" marked ${nextStatus === "checked_in" ? "Arrived" : "Not Arrived"}. Live on desk.`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Update failed: ${err?.message || "Error"}`,
      });
    }
  };

  // Toggle individual player present
  const togglePlayerCheckIn = async (player: Player) => {
    const nextStatus = player.check_in_status === "checked_in" ? "not_checked_in" : "checked_in";
    try {
      await supabase.from("players").update({
        check_in_status: nextStatus,
        check_in_at: nextStatus === "checked_in" ? new Date().toISOString() : null,
      }).eq("id", player.id);

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? { ...p, check_in_status: nextStatus }
            : p
        )
      );
    } catch (err) {
      console.warn("Failed to toggle player status:", err);
    }
  };

  // Disqualify / No-Show
  const confirmDisqualify = async () => {
    if (!disqualifyTarget) return;
    setStatusMsg(null);

    try {
      await supabase.from("registrations").update({
        status: "declined",
        admin_notes: `Marked Disqualified / No-Show by ${user?.email || "operator"}`,
      }).eq("id", disqualifyTarget.id);

      setTeams((prev) =>
        prev.map((t) =>
          t.id === disqualifyTarget.id
            ? { ...t, status: "declined" }
            : t
        )
      );

      setStatusMsg({
        type: "success",
        text: `Team "${disqualifyTarget.team_name}" marked disqualified/no-show.`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Failed: ${err?.message || "Error"}`,
      });
    } finally {
      setDisqualifyTarget(null);
    }
  };

  // Create match
  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamAId || !teamBId || teamAId === teamBId) {
      setStatusMsg({ type: "error", text: "Please select two distinct teams." });
      return;
    }

    setCreatingMatch(true);
    setStatusMsg(null);

    try {
      const newMatch = {
        game_id: selectedGameId,
        round: roundName,
        team_a_id: teamAId,
        team_b_id: teamBId,
        scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : new Date().toISOString(),
        score_a: 0,
        score_b: 0,
        status: "upcoming" as const,
        is_published: true,
      };

      const { data, error } = await supabase.from("matches").insert(newMatch).select();
      if (error) throw error;

      const createdItem = Array.isArray(data) ? data[0] : (data as any) || { ...newMatch, id: `mat-${Date.now()}` };
      setMatches((prev) => [...prev, createdItem]);
      setMatchModalOpen(false);

      setStatusMsg({
        type: "success",
        text: `Match created: ${roundName}. This is now live on the website!`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Failed to create match: ${err?.message || "Error"}`,
      });
    } finally {
      setCreatingMatch(false);
    }
  };

  // Update Match Status & Score
  const updateMatchStatus = async (matchId: string, newStatus: Match["status"], scoreA?: number, scoreB?: number, winnerId?: string | null) => {
    setStatusMsg(null);
    try {
      const updatePayload: any = { status: newStatus };
      if (typeof scoreA === "number") updatePayload.score_a = scoreA;
      if (typeof scoreB === "number") updatePayload.score_b = scoreB;
      if (winnerId !== undefined) updatePayload.winner_id = winnerId;

      await supabase.from("matches").update(updatePayload).eq("id", matchId);

      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, ...updatePayload } : m))
      );

      setStatusMsg({
        type: "success",
        text: `Match updated to "${newStatus.toUpperCase()}". Published live to /esports/live!`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Match update failed: ${err?.message || "Error"}`,
      });
    }
  };

  // Post announcement to teams
  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastBody.trim()) return;

    setBroadcasting(true);
    setStatusMsg(null);

    try {
      const payload = {
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        is_pinned: true,
        is_published: true,
        author_id: user?.email || "esports-control@supernova.edu",
        published_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("announcements").insert(payload);
      if (error) throw error;

      setBroadcastTitle("");
      setBroadcastBody("");
      setStatusMsg({
        type: "success",
        text: "Announcement sent! This is now live on the public Announcements page.",
      });
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: `Announcement failed: ${err?.message || "Error"}`,
      });
    } finally {
      setBroadcasting(false);
    }
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(240, 120, 85, 0.15)", color: "var(--coral)", display: "grid", placeItems: "center" }}>
              <Gamepad2 size={22} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Esports Tournament Control
            </h1>
          </div>
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginTop: 6 }}>
            Match staging, team check-in, scorekeeping, and live public board broadcasting for festival esports.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />

          <Link
            to="/esports/live"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.88rem" }}
          >
            <span>View Public Live Board</span> <ExternalLink size={14} />
          </Link>

          <button
            onClick={fetchData}
            title="Refresh"
            className="btn btn-ghost"
            style={{ padding: "8px 10px" }}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Status Alert Banner */}
      {statusMsg && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 10,
            marginBottom: 20,
            fontSize: "0.92rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: statusMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1.5px solid ${statusMsg.type === "success" ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)"}`,
            color: statusMsg.type === "success" ? "#10b981" : "#ef4444",
          }}
        >
          <CheckCircle size={18} />
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Game Selector Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 28, overflowX: "auto", paddingBottom: 4 }}>
        {games.map((g) => {
          const isSelected = selectedGameId === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setSelectedGameId(g.id)}
              style={{
                padding: "12px 24px",
                borderRadius: 12,
                fontSize: "0.95rem",
                fontWeight: 800,
                letterSpacing: "0.04em",
                border: isSelected ? "2px solid var(--coral)" : "1.5px solid var(--border-subtle)",
                background: isSelected ? "rgba(240, 120, 85, 0.15)" : "rgba(255,255,255,0.03)",
                color: isSelected ? "var(--coral)" : "var(--text-muted)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                transition: "all 0.15s ease",
              }}
            >
              <Gamepad2 size={16} />
              {g.title}
            </button>
          );
        })}
      </div>

      {/* Grid: 2 Columns (Matches & Live Board / Teams Roster) */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24 }}>
        {/* Left Column: Matches & Live Scorekeeping */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              Matches & Live Stages
            </h2>
            <button
              onClick={() => setMatchModalOpen(true)}
              className="btn btn-primary"
              style={{ padding: "8px 16px", fontSize: "0.85rem", fontWeight: 700 }}
            >
              <Plus size={15} /> Create Match
            </button>
          </div>

          {currentGameMatches.length === 0 ? (
            <div
              style={{
                padding: "36px 20px",
                textAlign: "center",
                borderRadius: 14,
                border: "1.5px dashed var(--border-subtle)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <Trophy size={32} color="var(--text-muted)" style={{ margin: "0 auto 10px" }} />
              <p style={{ fontWeight: 700, color: "var(--text-primary)" }}>No matches scheduled yet.</p>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
                Click "Create Match" to pair confirmed rosters and schedule arena rounds.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {currentGameMatches.map((m) => {
                const teamA = teams.find((t) => t.id === m.team_a_id);
                const teamB = teams.find((t) => t.id === m.team_b_id);

                return (
                  <div
                    key={m.id}
                    style={{
                      background: "rgba(23, 23, 27, 0.75)",
                      border: `1.5px solid ${m.status === "live" ? "var(--coral)" : "var(--border-subtle)"}`,
                      borderRadius: 14,
                      padding: "18px 20px",
                      boxShadow: m.status === "live" ? "0 0 20px rgba(240, 120, 85, 0.2)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--cyan-400)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {m.round || "Match Round"}
                      </span>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          padding: "3px 10px",
                          borderRadius: 9999,
                          letterSpacing: "0.06em",
                          background:
                            m.status === "live"
                              ? "rgba(240, 120, 85, 0.25)"
                              : m.status === "completed"
                              ? "rgba(16, 185, 129, 0.2)"
                              : "rgba(255,255,255,0.08)",
                          color:
                            m.status === "live"
                              ? "var(--coral)"
                              : m.status === "completed"
                              ? "#10b981"
                              : "var(--text-muted)",
                        }}
                      >
                        {m.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Team A vs Team B Display */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center", textAlign: "center", margin: "14px 0" }}>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: "1.1rem", fontWeight: 800, color: m.winner_id === m.team_a_id ? "#10b981" : "#ffffff", margin: 0 }}>
                          {teamA?.team_name || "Team Alpha"}
                        </p>
                        <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", margin: "2px 0 0" }}>
                          {teamA?.institution || "Collegiate"}
                        </p>
                      </div>

                      {/* Scores */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px", borderRadius: 10, background: "rgba(0,0,0,0.4)" }}>
                        <input
                          type="number"
                          min={0}
                          value={m.score_a}
                          onChange={(e) => updateMatchStatus(m.id, m.status, Number(e.target.value) || 0, m.score_b, m.winner_id)}
                          style={{ width: 44, padding: "4px", fontSize: "1.2rem", fontWeight: 900, textAlign: "center", background: "transparent", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "#ffffff" }}
                        />
                        <span style={{ fontWeight: 800, color: "var(--text-muted)" }}>:</span>
                        <input
                          type="number"
                          min={0}
                          value={m.score_b}
                          onChange={(e) => updateMatchStatus(m.id, m.status, m.score_a, Number(e.target.value) || 0, m.winner_id)}
                          style={{ width: 44, padding: "4px", fontSize: "1.2rem", fontWeight: 900, textAlign: "center", background: "transparent", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "#ffffff" }}
                        />
                      </div>

                      <div style={{ textAlign: "left" }}>
                        <p style={{ fontSize: "1.1rem", fontWeight: 800, color: m.winner_id === m.team_b_id ? "#10b981" : "#ffffff", margin: 0 }}>
                          {teamB?.team_name || "Team Bravo"}
                        </p>
                        <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", margin: "2px 0 0" }}>
                          {teamB?.institution || "Collegiate"}
                        </p>
                      </div>
                    </div>

                    {/* Stage status controls */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => updateMatchStatus(m.id, "upcoming")}
                          className="btn btn-secondary"
                          style={{ fontSize: "0.74rem", padding: "4px 10px", background: m.status === "upcoming" ? "rgba(255,255,255,0.15)" : undefined }}
                        >
                          Scheduled
                        </button>
                        <button
                          onClick={() => updateMatchStatus(m.id, "live")}
                          className="btn btn-secondary"
                          style={{ fontSize: "0.74rem", padding: "4px 10px", color: "var(--coral)", borderColor: m.status === "live" ? "var(--coral)" : undefined }}
                        >
                          <Play size={12} /> Set LIVE
                        </button>
                        <button
                          onClick={() => updateMatchStatus(m.id, "completed")}
                          className="btn btn-secondary"
                          style={{ fontSize: "0.74rem", padding: "4px 10px", color: "#10b981", borderColor: m.status === "completed" ? "#10b981" : undefined }}
                        >
                          <CheckCircle size={12} /> Finished
                        </button>
                      </div>

                      {/* Winner selector */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem" }}>
                        <span style={{ color: "var(--text-muted)" }}>Winner:</span>
                        <select
                          value={m.winner_id || ""}
                          onChange={(e) => updateMatchStatus(m.id, m.status, m.score_a, m.score_b, e.target.value || null)}
                          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "#ffffff", padding: "4px 8px", fontSize: "0.75rem" }}
                        >
                          <option value="">Deciding...</option>
                          <option value={m.team_a_id || ""}>{teamA?.team_name || "Team A"}</option>
                          <option value={m.team_b_id || ""}>{teamB?.team_name || "Team B"}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Message Teams / Rapid Broadcast Box */}
          <div
            style={{
              marginTop: 24,
              background: "rgba(23, 23, 27, 0.6)",
              border: "1.5px solid var(--border-subtle)",
              borderRadius: 14,
              padding: "20px 22px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Send size={18} color="var(--cyan-400)" />
              <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "#ffffff" }}>
                Message Teams (Live Broadcast)
              </h3>
            </div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 14 }}>
              Posts immediately to the public Announcements page and alert ticker for esports players.
            </p>

            <form onSubmit={handleBroadcast} style={{ display: "grid", gap: 12 }}>
              <input
                type="text"
                required
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="Notice title (e.g. BGMI Round 2 starts in 10 minutes at Arena Lab 3)"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff", fontSize: "0.88rem" }}
              />
              <textarea
                required
                rows={2}
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                placeholder="Details or station instructions for team captains..."
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff", fontSize: "0.85rem", resize: "vertical" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={broadcasting}
                  className="btn btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", fontSize: "0.85rem", fontWeight: 700 }}
                >
                  <Send size={14} /> {broadcasting ? "Broadcasting..." : "Broadcast Notice"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Confirmed Teams & Check-in Roster */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              Confirmed Rosters ({currentGameTeams.length})
            </h2>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {currentGameTeams.filter((t: any) => t.check_in_status === "checked_in").length} Arrived
            </span>
          </div>

          {currentGameTeams.length === 0 ? (
            <div
              style={{
                padding: "36px 20px",
                textAlign: "center",
                borderRadius: 14,
                border: "1.5px dashed var(--border-subtle)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <Users size={32} color="var(--text-muted)" style={{ margin: "0 auto 10px" }} />
              <p style={{ fontWeight: 700, color: "var(--text-primary)" }}>No confirmed teams yet.</p>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
                Review and approve squads under Registrations → Esports Teams.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {currentGameTeams.map((team) => {
                const teamPlayers = players.filter((p) => p.registration_id === team.id);
                const isArrived = (team as any).check_in_status === "checked_in";

                return (
                  <div
                    key={team.id}
                    style={{
                      background: "rgba(23, 23, 27, 0.75)",
                      border: "1.5px solid var(--border-subtle)",
                      borderRadius: 14,
                      padding: "16px 18px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                            {team.team_name}
                          </h3>
                          <span style={{ fontSize: "0.72rem", fontFamily: "monospace", color: "var(--text-muted)" }}>
                            {team.registration_ref}
                          </span>
                        </div>
                        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
                          Captain: <strong>{team.captain_name}</strong> · {team.institution || "College"}
                        </p>
                      </div>

                      {/* Team Arrival Toggle */}
                      <button
                        onClick={() => toggleTeamCheckIn(team)}
                        className="btn"
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          padding: "6px 12px",
                          borderRadius: 8,
                          background: isArrived ? "#10b981" : "rgba(255,255,255,0.08)",
                          color: isArrived ? "#ffffff" : "var(--text-muted)",
                          border: isArrived ? "1px solid #10b981" : "1px solid var(--border-subtle)",
                          cursor: "pointer",
                        }}
                      >
                        {isArrived ? "✓ Team Arrived" : "Mark Arrived"}
                      </button>
                    </div>

                    {/* Player presence roster */}
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <p style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", marginBottom: 6 }}>
                        Player Presence
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {teamPlayers.length === 0 ? (
                          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Roster registered</span>
                        ) : (
                          teamPlayers.map((player) => {
                            const isPresent = player.check_in_status === "checked_in";
                            return (
                              <button
                                key={player.id}
                                onClick={() => togglePlayerCheckIn(player)}
                                style={{
                                  fontSize: "0.74rem",
                                  padding: "3px 8px",
                                  borderRadius: 6,
                                  background: isPresent ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.04)",
                                  border: `1px solid ${isPresent ? "#10b981" : "rgba(255,255,255,0.1)"}`,
                                  color: isPresent ? "#10b981" : "var(--text-muted)",
                                  cursor: "pointer",
                                }}
                                title="Click to toggle player presence"
                              >
                                {player.player_name} {player.gamer_tag ? `(${player.gamer_tag})` : ""}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Disqualify action */}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                      <button
                        onClick={() => setDisqualifyTarget(team)}
                        style={{
                          background: "transparent",
                          border: 0,
                          color: "rgba(239, 68, 68, 0.8)",
                          fontSize: "0.74rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          cursor: "pointer",
                          padding: "2px 6px",
                        }}
                      >
                        <AlertOctagon size={12} /> Disqualify / No-Show
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Match Modal */}
      {matchModalOpen && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setMatchModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--navy-900)",
              border: "1.5px solid var(--border-subtle)",
              borderRadius: 18,
              padding: 28,
              maxWidth: 480,
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Trophy size={20} color="var(--coral)" />
                <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                  Schedule Match
                </h3>
              </div>
              <button onClick={() => setMatchModalOpen(false)} style={{ background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateMatch} style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Round / Stage Name *
                </label>
                <input
                  type="text"
                  required
                  value={roundName}
                  onChange={(e) => setRoundName(e.target.value)}
                  placeholder="e.g. Group Stage Match 1, Semifinal A, Grand Finals"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Team Alpha *
                </label>
                <select
                  required
                  value={teamAId}
                  onChange={(e) => setTeamAId(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                >
                  <option value="">Select Team A...</option>
                  {currentGameTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.team_name} ({t.institution})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Team Bravo *
                </label>
                <select
                  required
                  value={teamBId}
                  onChange={(e) => setTeamBId(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                >
                  <option value="">Select Team B...</option>
                  {currentGameTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.team_name} ({t.institution})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Scheduled Start Time
                </label>
                <input
                  type="datetime-local"
                  value={scheduledStart}
                  onChange={(e) => setScheduledStart(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                />
              </div>

              <div style={{ marginTop: 8, display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setMatchModalOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={creatingMatch} className="btn btn-primary" style={{ fontWeight: 800 }}>
                  {creatingMatch ? "Scheduling..." : "Create & Publish Match"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disqualify Confirm Modal */}
      {disqualifyTarget && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setDisqualifyTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--navy-900)",
              border: "1.5px solid var(--border-subtle)",
              borderRadius: 16,
              padding: 28,
              maxWidth: 440,
              width: "100%",
            }}
          >
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#f87171", margin: 0 }}>
              Disqualify Team?
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5, margin: "12px 0 20px" }}>
              Are you sure you want to mark <strong>{disqualifyTarget.team_name}</strong> as disqualified or no-show? Their status will be set to declined.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setDisqualifyTarget(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={confirmDisqualify}
                className="btn btn-ghost"
                style={{ color: "#ef4444", borderColor: "#ef4444", fontWeight: 700 }}
              >
                Yes, Disqualify
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
