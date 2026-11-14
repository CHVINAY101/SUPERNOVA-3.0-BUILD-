import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type {
  Game,
  TournamentFormat,
  TournamentScoringMode,
} from "@/types/database";
import {
  Gamepad2,
  ExternalLink,
  Plus,
  CheckCircle,
  AlertCircle,
  X,
  Edit3,
  Clock,
  Users,
  Trophy,
} from "lucide-react";

interface StaffMemberOption {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
}

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
  group_knockout: "Group + Knockout",
  custom: "Custom Format",
};

const SCORING_LABELS: Record<TournamentScoringMode, string> = {
  round_based: "Round-Based (Score / Maps)",
  battle_royale: "Battle Royale (Placement + Kills)",
  group_points: "Group Points (W/D/L)",
  custom: "Custom Winner",
};

export default function AdminGames() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(["event_info:create", "esports:create", "tournament:manage_games"]);
  const canEdit = hasPermission(["event_info:edit", "esports:edit", "tournament:manage_games"]);
  const canPublish = hasPermission(["event_info:publish", "esports:edit", "tournament:manage_games"]);

  const [games, setGames] = useState<Game[]>([]);
  const [conductors, setConductors] = useState<StaffMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Add / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [title, setTitle] = useState("");
  const [teamSize, setTeamSize] = useState("5");
  const [substitutesCount, setSubstitutesCount] = useState("0");
  const [maxTeams, setMaxTeams] = useState("");
  const [matchFormat, setMatchFormat] = useState<TournamentFormat>("single_elimination");
  const [scoringMode, setScoringMode] = useState<TournamentScoringMode>("round_based");
  const [matchDuration, setMatchDuration] = useState("30");
  const [tournamentStatus, setTournamentStatus] = useState<"draft" | "open" | "in_progress" | "completed">("open");
  const [assignedConductorIds, setAssignedConductorIds] = useState<string[]>([]);
  const [rules, setRules] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [gamesRes, rolesRes, profRes] = await Promise.all([
        supabase.from("games").select("*").order("sort_order", { ascending: true }),
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["match_conductor", "esports_manager", "crm_admin", "super_admin"]),
        supabase.from("profiles").select("id, email, full_name, account_status"),
      ]);

      if (gamesRes.error) {
        setStatusMsg({ type: "error", text: "Games could not be loaded. Please refresh." });
      } else {
        setGames((gamesRes.data as Game[]) || []);
      }

      const profMap = new Map<string, any>();
      (profRes.data || []).forEach((p: any) => profMap.set(p.id, p));
      const staffList: StaffMemberOption[] = (rolesRes.data || [])
        .map((r: any) => {
          const p = profMap.get(r.user_id) || {};
          if (p.account_status && p.account_status !== "active") return null;
          return {
            user_id: r.user_id,
            email: p.email || `staff-${String(r.user_id).slice(0, 6)}`,
            full_name: p.full_name || null,
            role: r.role,
          };
        })
        .filter(Boolean) as StaffMemberOption[];
      setConductors(staffList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreateModal = () => {
    setEditingGame(null);
    setTitle("");
    setTeamSize("5");
    setSubstitutesCount("0");
    setMaxTeams("");
    setMatchFormat("single_elimination");
    setScoringMode("round_based");
    setMatchDuration("30");
    setTournamentStatus("open");
    setAssignedConductorIds([]);
    setRules("");
    setModalOpen(true);
    setStatusMsg(null);
  };

  const openEditModal = (game: Game) => {
    setEditingGame(game);
    setTitle(game.title);
    setTeamSize(String(game.team_size ?? 5));
    setSubstitutesCount(String(game.substitutes_count ?? 0));
    setMaxTeams(game.max_teams ? String(game.max_teams) : "");
    setMatchFormat((game.match_format as TournamentFormat) || "single_elimination");
    setScoringMode((game.scoring_mode as TournamentScoringMode) || "round_based");
    setMatchDuration(String(game.match_duration_minutes ?? 30));
    setTournamentStatus((game.tournament_status as any) || "open");
    setAssignedConductorIds(Array.isArray(game.assigned_conductor_ids) ? game.assigned_conductor_ids : []);
    setRules(game.rules || "");
    setModalOpen(true);
    setStatusMsg(null);
  };

  const toggleConductor = (userId: string) => {
    setAssignedConductorIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSaveGame = async (event: FormEvent) => {
    event.preventDefault();
    if (editingGame && !canEdit) return;
    if (!editingGame && !canCreate) return;

    const size = Number(teamSize);
    const subs = Number(substitutesCount);
    const duration = Number(matchDuration);
    const maxCap = maxTeams.trim() ? Number(maxTeams) : null;

    if (title.trim().length < 2 || !Number.isInteger(size) || size < 1 || size > 20) {
      setStatusMsg({ type: "error", text: "Enter a valid game title and team size (1–20)." });
      return;
    }

    setSaving(true);
    setStatusMsg(null);

    const basePayload = {
      title: title.trim(),
      team_size: size,
      rules: rules.trim() || null,
    };

    const extendedPayload = {
      ...basePayload,
      substitutes_count: Number.isInteger(subs) && subs >= 0 ? subs : 0,
      max_teams: maxCap && maxCap > 0 ? maxCap : null,
      match_format: matchFormat,
      scoring_mode: scoringMode,
      match_duration_minutes: Number.isInteger(duration) && duration > 0 ? duration : 30,
      tournament_status: tournamentStatus,
      assigned_conductor_ids: assignedConductorIds,
    };

    try {
      if (editingGame) {
        const { error } = await supabase.from("games").update(extendedPayload).eq("id", editingGame.id);
        if (error) {
          if (error.code === "42703" || error.message?.includes("column")) {
            const { error: baseErr } = await supabase.from("games").update(basePayload).eq("id", editingGame.id);
            if (baseErr) throw baseErr;
          } else {
            throw error;
          }
        }
        setStatusMsg({ type: "success", text: `Updated configuration for ${title.trim()}.` });
      } else {
        const nextOrder = (games.reduce((max, g) => Math.max(max, g.sort_order), 0) ?? 0) + 1;
        const { error } = await supabase.from("games").insert({
          ...extendedPayload,
          is_active: true,
          is_published: canPublish,
          sort_order: nextOrder,
        });
        if (error) {
          if (error.code === "42703" || error.message?.includes("column")) {
            const { error: baseErr } = await supabase.from("games").insert({
              ...basePayload,
              is_active: true,
              is_published: canPublish,
              sort_order: nextOrder,
            });
            if (baseErr) throw baseErr;
          } else {
            throw error;
          }
        }
        setStatusMsg({ type: "success", text: `Registered ${title.trim()} for tournament operations.` });
      }

      setModalOpen(false);
      await load();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: `Save failed: ${err?.message || "Unknown error"}` });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (game: Game, field: "is_active" | "is_published") => {
    if (field === "is_active" && !canEdit) return;
    if (field === "is_published" && !canPublish) return;
    const { error } = await supabase.from("games").update({ [field]: !game[field] }).eq("id", game.id);
    if (error) {
      setStatusMsg({ type: "error", text: "The change could not be saved." });
      return;
    }
    setStatusMsg({ type: "success", text: "Game status updated." });
    await load();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200 inline-block">
            Esports Tournament Configuration
          </span>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            Tournament Games & Rulesets
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 m-0">
            Configure squad size, substitutes, team caps, bracket formats, scoring systems, match duration, and assigned conductors.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            to="/esports"
            target="_blank"
            rel="noreferrer"
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 no-underline"
          >
            <span>Public Esports Portal</span>
            <ExternalLink size={13} />
          </Link>

          {canCreate && (
            <button
              type="button"
              onClick={openCreateModal}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus size={15} />
              <span>Add Game</span>
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between border ${
            statusMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMsg(null)} className="p-1 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Games Grid */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-xs font-mono text-slate-500">
          Loading tournament games...
        </div>
      ) : games.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Gamepad2 size={32} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm font-bold text-slate-900 m-0">No tournament games registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map((game) => {
            const fmt = (game.match_format as TournamentFormat) || "single_elimination";
            const scMode = (game.scoring_mode as TournamentScoringMode) || "round_based";
            return (
              <div
                key={game.id}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-display font-black text-slate-900 m-0">{game.title}</h2>
                      <span className="text-[11px] font-mono text-slate-500 uppercase">
                        {game.tournament_status || "open"}
                      </span>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEditModal(game)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
                      >
                        <Edit3 size={12} />
                        <span>Configure</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Squad Size</span>
                      <strong className="text-slate-900 inline-flex items-center gap-1 mt-0.5">
                        <Users size={12} className="text-blue-600" />
                        {game.team_size ?? 5} + {game.substitutes_count ?? 0} sub
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[10px] font-mono uppercase text-slate-500 block">Duration / Cap</span>
                      <strong className="text-slate-900 inline-flex items-center gap-1 mt-0.5 font-mono">
                        <Clock size={12} className="text-amber-600" />
                        {game.match_duration_minutes ?? 30}m · {game.max_teams ? `${game.max_teams}T` : "Open"}
                      </strong>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Bracket Format:</span>
                      <strong className="text-slate-900 font-mono text-[11px] inline-flex items-center gap-1">
                        <Trophy size={11} className="text-purple-600" />
                        {FORMAT_LABELS[fmt] || fmt}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Scoring Mode:</span>
                      <strong className="text-slate-900 font-mono text-[11px]">
                        {SCORING_LABELS[scMode] || scMode}
                      </strong>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2 m-0">
                    {game.rules || "Standard collegiate ruleset."}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggle(game, "is_active")}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase cursor-pointer disabled:opacity-50 ${
                      game.is_active
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {game.is_active ? "Accepting Teams" : "Closed"}
                  </button>

                  <button
                    type="button"
                    disabled={!canPublish}
                    onClick={() => toggle(game, "is_published")}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold uppercase cursor-pointer disabled:opacity-50 ${
                      game.is_published
                        ? "bg-blue-50 text-blue-800 border border-blue-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {game.is_published ? "Published" : "Draft"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Game Configuration Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5"
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-display font-black text-slate-900 m-0">
                  {editingGame ? `Configure ${editingGame.title}` : "Add Tournament Game"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 m-0">
                  All roster, bracket, scoring, and conductor defaults apply across Esports Operations.
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveGame} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Game Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. VALORANT, BGMI, FREE FIRE"
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Tournament Status</label>
                  <select
                    value={tournamentStatus}
                    onChange={(e) => setTournamentStatus(e.target.value as any)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold"
                  >
                    <option value="draft">Draft</option>
                    <option value="open">Open for Registration</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Team Size</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Substitutes</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={substitutesCount}
                    onChange={(e) => setSubstitutesCount(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Max Teams</label>
                  <input
                    type="number"
                    min={2}
                    placeholder="Unlimited"
                    value={maxTeams}
                    onChange={(e) => setMaxTeams(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={matchDuration}
                    onChange={(e) => setMatchDuration(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Default Bracket Format</label>
                  <select
                    value={matchFormat}
                    onChange={(e) => setMatchFormat(e.target.value as TournamentFormat)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold"
                  >
                    <option value="single_elimination">Single Elimination</option>
                    <option value="double_elimination">Double Elimination</option>
                    <option value="round_robin">Round Robin</option>
                    <option value="group_knockout">Group Stage + Knockout</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Scoring Mode</label>
                  <select
                    value={scoringMode}
                    onChange={(e) => setScoringMode(e.target.value as TournamentScoringMode)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold"
                  >
                    <option value="round_based">Round-Based (Maps / Points)</option>
                    <option value="battle_royale">Battle Royale (Placement + Kills)</option>
                    <option value="group_points">Group Points (Win / Draw / Loss)</option>
                    <option value="custom">Custom Winner</option>
                  </select>
                </div>
              </div>

              {conductors.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                    Assigned Match Conductors ({assignedConductorIds.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {conductors.map((c) => {
                      const checked = assignedConductorIds.includes(c.user_id);
                      return (
                        <label
                          key={c.user_id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer ${
                            checked
                              ? "bg-blue-50 border-blue-300 text-blue-900 font-semibold"
                              : "bg-slate-50 border-slate-200 text-slate-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleConductor(c.user_id)}
                            className="accent-blue-600"
                          />
                          <span>{c.full_name || c.email}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Scoring & Match Rules</label>
                <textarea
                  rows={4}
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder="Describe map pool, tie-breakers, placement points, and conduct rules..."
                  className="w-full p-3 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[40px] px-5 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
