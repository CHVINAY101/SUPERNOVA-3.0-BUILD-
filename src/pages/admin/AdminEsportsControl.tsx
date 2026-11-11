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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-200">
              <Gamepad2 size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight m-0">
                Esports Tournament Control
              </h1>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Match staging, live scorekeeping, arena check-in, and instant stage broadcasting.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />

          <Link
            to="/esports/live"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
          >
            <span>View Public Live Board</span>
            <ExternalLink size={13} />
          </Link>

          <button
            onClick={fetchData}
            title="Refresh"
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Status Alert Banner */}
      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 border shadow-2xs ${
            statusMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle size={16} />
            <span>{statusMsg.text}</span>
          </div>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Game Selector Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {games.map((g) => {
          const isSelected = selectedGameId === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setSelectedGameId(g.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                isSelected
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-2xs"
              }`}
            >
              <Gamepad2 size={16} className={isSelected ? "text-orange-400" : "text-slate-400"} />
              <span>{g.title}</span>
            </button>
          );
        })}
      </div>

      {/* Grid: 2 Columns (Matches & Live Stages / Confirmed Rosters) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Matches & Live Scorekeeping */}
        <div className="lg:col-span-7 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0">
                Matches & Arena Stages
              </h2>
              <p className="text-xs text-slate-500 m-0">
                Pair confirmed teams, publish live match scores, and declare stage winners.
              </p>
            </div>
            <button
              onClick={() => setMatchModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              <span>Create Match</span>
            </button>
          </div>

          {currentGameMatches.length === 0 ? (
            <div className="text-center py-12 px-6 bg-white border border-slate-200/90 rounded-2xl shadow-2xs">
              <Trophy size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="font-bold text-slate-900 text-sm m-0">No matches scheduled yet.</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto m-0">
                Click "Create Match" to pair confirmed squads and schedule arena tournament rounds.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {currentGameMatches.map((m) => {
                const teamA = teams.find((t) => t.id === m.team_a_id);
                const teamB = teams.find((t) => t.id === m.team_b_id);

                return (
                  <div
                    key={m.id}
                    className={`bg-white border rounded-2xl p-4 sm:p-5 shadow-2xs transition-all ${
                      m.status === "live"
                        ? "border-orange-400 ring-2 ring-orange-500/10"
                        : "border-slate-200/90"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-mono font-bold text-blue-700 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {m.round || "Match Round"}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          m.status === "live"
                            ? "bg-orange-50 text-orange-700 border border-orange-200 animate-pulse"
                            : m.status === "completed"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {m.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Team A vs Team B Display */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-center py-3 border-y border-slate-100 my-2">
                      <div className="sm:col-span-2 text-left sm:text-right">
                        <p
                          className={`text-sm sm:text-base font-bold m-0 leading-tight ${
                            m.winner_id === m.team_a_id ? "text-emerald-600" : "text-slate-900"
                          }`}
                        >
                          {teamA?.team_name || "Team Alpha"}
                        </p>
                        <p className="text-[11px] text-slate-500 m-0 truncate">
                          {teamA?.institution || "Collegiate"}
                        </p>
                      </div>

                      {/* Scores */}
                      <div className="sm:col-span-1 flex items-center justify-center gap-2 p-1.5 rounded-xl bg-slate-50 border border-slate-200">
                        <input
                          type="number"
                          min={0}
                          value={m.score_a}
                          onChange={(e) =>
                            updateMatchStatus(
                              m.id,
                              m.status,
                              Number(e.target.value) || 0,
                              m.score_b,
                              m.winner_id
                            )
                          }
                          className="w-10 p-1 text-base font-black text-center bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:border-blue-500 font-mono"
                        />
                        <span className="font-bold text-slate-400">:</span>
                        <input
                          type="number"
                          min={0}
                          value={m.score_b}
                          onChange={(e) =>
                            updateMatchStatus(
                              m.id,
                              m.status,
                              m.score_a,
                              Number(e.target.value) || 0,
                              m.winner_id
                            )
                          }
                          className="w-10 p-1 text-base font-black text-center bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:border-blue-500 font-mono"
                        />
                      </div>

                      <div className="sm:col-span-2 text-left">
                        <p
                          className={`text-sm sm:text-base font-bold m-0 leading-tight ${
                            m.winner_id === m.team_b_id ? "text-emerald-600" : "text-slate-900"
                          }`}
                        >
                          {teamB?.team_name || "Team Bravo"}
                        </p>
                        <p className="text-[11px] text-slate-500 m-0 truncate">
                          {teamB?.institution || "Collegiate"}
                        </p>
                      </div>
                    </div>

                    {/* Stage status controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => updateMatchStatus(m.id, "upcoming")}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                            m.status === "upcoming"
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          Scheduled
                        </button>
                        <button
                          type="button"
                          onClick={() => updateMatchStatus(m.id, "live")}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                            m.status === "live"
                              ? "bg-orange-600 text-white"
                              : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                          }`}
                        >
                          <Play size={11} /> Set Live
                        </button>
                        <button
                          type="button"
                          onClick={() => updateMatchStatus(m.id, "completed")}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                            m.status === "completed"
                              ? "bg-emerald-600 text-white"
                              : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          }`}
                        >
                          <CheckCircle size={11} /> Finished
                        </button>
                      </div>

                      {/* Winner selector */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span className="font-medium text-slate-500">Winner:</span>
                        <select
                          value={m.winner_id || ""}
                          onChange={(e) =>
                            updateMatchStatus(
                              m.id,
                              m.status,
                              m.score_a,
                              m.score_b,
                              e.target.value || null
                            )
                          }
                          className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-hidden"
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

          {/* Rapid Broadcast Box */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
            <div className="flex items-center gap-2 mb-1">
              <Send size={16} className="text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 m-0">
                Broadcast Stage Announcement
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-3.5 m-0">
              Posts immediately to the public ticker and festival announcements page.
            </p>

            <form onSubmit={handleBroadcast} className="space-y-3">
              <input
                type="text"
                required
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="Notice title (e.g. BGMI Round 2 starts in 10 minutes at Arena Lab 3)"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <textarea
                required
                rows={2}
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                placeholder="Details or station instructions for team captains..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={broadcasting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold shadow-xs cursor-pointer"
                >
                  <Send size={13} />
                  <span>{broadcasting ? "Broadcasting..." : "Broadcast Notice"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Confirmed Teams & Check-in Roster */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 m-0">
              Confirmed Rosters ({currentGameTeams.length})
            </h2>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              {currentGameTeams.filter((t: any) => t.check_in_status === "checked_in").length} Arrived
            </span>
          </div>

          {currentGameTeams.length === 0 ? (
            <div className="text-center py-10 px-5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs">
              <Users size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="font-bold text-slate-900 text-sm m-0">No confirmed teams yet.</p>
              <p className="text-xs text-slate-500 mt-1 m-0">
                Review and approve squads under Registrations → Esports Teams.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentGameTeams.map((team) => {
                const teamPlayers = players.filter((p) => p.registration_id === team.id);
                const isArrived = (team as any).check_in_status === "checked_in";

                return (
                  <div
                    key={team.id}
                    className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 m-0 truncate">
                            {team.team_name}
                          </h3>
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {team.registration_ref}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 m-0 mt-0.5 truncate">
                          Captain: <strong className="text-slate-700">{team.captain_name}</strong> · {team.institution || "College"}
                        </p>
                      </div>

                      {/* Team Arrival Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleTeamCheckIn(team)}
                        className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                          isArrived
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {isArrived ? "✓ Arrived" : "Mark Arrived"}
                      </button>
                    </div>

                    {/* Player presence roster */}
                    <div className="pt-2 border-t border-slate-100">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Individual Player Presence
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {teamPlayers.length === 0 ? (
                          <span className="text-xs text-slate-400">Roster registered</span>
                        ) : (
                          teamPlayers.map((player) => {
                            const isPresent = player.check_in_status === "checked_in";
                            return (
                              <button
                                key={player.id}
                                type="button"
                                onClick={() => togglePlayerCheckIn(player)}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                                  isPresent
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                }`}
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
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setDisqualifyTarget(team)}
                        className="text-[11px] text-rose-500 hover:text-rose-700 inline-flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        <AlertOctagon size={12} />
                        <span>Disqualify / No-Show</span>
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
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setMatchModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-200">
                  <Trophy size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 m-0">
                    Schedule Tournament Match
                  </h3>
                  <p className="text-xs text-slate-500 m-0">Pair confirmed teams for the live tournament board</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMatchModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateMatch} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Round / Stage Name *
                </label>
                <input
                  type="text"
                  required
                  value={roundName}
                  onChange={(e) => setRoundName(e.target.value)}
                  placeholder="e.g. Group Stage Match 1, Semifinal A, Grand Finals"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Team Alpha *
                </label>
                <select
                  required
                  value={teamAId}
                  onChange={(e) => setTeamAId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Team Bravo *
                </label>
                <select
                  required
                  value={teamBId}
                  onChange={(e) => setTeamBId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Scheduled Start Time
                </label>
                <input
                  type="datetime-local"
                  value={scheduledStart}
                  onChange={(e) => setScheduledStart(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMatchModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMatch}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trophy size={14} />
                  <span>{creatingMatch ? "Scheduling..." : "Create & Publish Match"}</span>
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
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setDisqualifyTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                <AlertOctagon size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-rose-900 m-0">
                  Disqualify Esports Team?
                </h3>
                <p className="text-xs text-slate-500 m-0">Mark team as no-show or rule violation</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed my-4">
              Are you sure you want to mark <strong className="text-slate-900 font-semibold">{disqualifyTarget.team_name}</strong> as disqualified or no-show? Their status will be updated to declined.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDisqualifyTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDisqualify}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
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
