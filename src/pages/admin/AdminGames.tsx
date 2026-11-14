import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { Game } from "@/types/database";
import { Gamepad2, ExternalLink, Plus, CheckCircle, AlertCircle, X } from "lucide-react";

type GameRecord = Pick<Game, "id" | "title" | "team_size" | "rules" | "is_active" | "is_published" | "sort_order">;

const COLUMNS = "id, title, team_size, rules, is_active, is_published, sort_order";

export default function AdminGames() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(["event_info:create", "esports:create"]);
  const canEdit = hasPermission(["event_info:edit", "esports:edit"]);
  const canPublish = hasPermission(["event_info:publish", "esports:edit"]);

  const [games, setGames] = useState<GameRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [teamSize, setTeamSize] = useState("5");
  const [rules, setRules] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("games")
      .select(COLUMNS)
      .order("sort_order", { ascending: true });

    if (loadError) {
      console.error("games load failed", loadError);
      setStatusMsg({ type: "error", text: "Games could not be loaded. Please refresh." });
    } else {
      setGames((data ?? []) as GameRecord[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const addGame = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      setStatusMsg({ type: "error", text: "You do not have permission to add tournament games." });
      return;
    }
    const size = Number(teamSize);
    if (title.trim().length < 2 || !Number.isInteger(size) || size < 1 || size > 20) {
      setStatusMsg({ type: "error", text: "Enter a game title and a team size from 1 to 20." });
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    const nextOrder = (games?.reduce((max, game) => Math.max(max, game.sort_order), 0) ?? 0) + 1;
    const { error: insertError } = await supabase.from("games").insert({
      title: title.trim(),
      team_size: size,
      rules: rules.trim() || null,
      is_active: true,
      is_published: canPublish,
      sort_order: nextOrder,
    });
    setSaving(false);
    if (insertError) {
      console.error("game insert failed", insertError);
      setStatusMsg({ type: "error", text: "The game could not be saved. Please try again." });
      return;
    }
    setStatusMsg({ type: "success", text: "Saved. This is now live on the website." });
    setTitle("");
    setTeamSize("5");
    setRules("");
    setIsAdding(false);
    await load();
  };

  const toggle = async (game: GameRecord, field: "is_active" | "is_published") => {
    if (field === "is_active" && !canEdit) return;
    if (field === "is_published" && !canPublish) return;
    const nextVal = !game[field];
    const { error: updateError } = await supabase.from("games").update({ [field]: nextVal }).eq("id", game.id);
    if (updateError) {
      console.error("game update failed", updateError);
      setStatusMsg({ type: "error", text: "The change could not be saved." });
      return;
    }
    setStatusMsg({
      type: "success",
      text: "Saved. This is now live on the website.",
    });
    await load();
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
              <Gamepad2 size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Tournament Games
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            Manage esports titles, mandatory roster player counts, and rulebooks for competitive gaming.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            to="/esports"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
          >
            <span>View on website</span> <ExternalLink size={13} />
          </Link>

          {!isAdding && canCreate && (
            <button
              onClick={() => { setIsAdding(true); setStatusMsg(null); }}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.88rem", fontWeight: 700 }}
            >
              <Plus size={16} /> Add Game
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
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
          {statusMsg.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Add Game Form */}
      {isAdding && (
        <form onSubmit={addGame} className="card" style={{ padding: 24, display: "grid", gap: 16, marginBottom: 28, border: "1.5px solid var(--cyan-400)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>Register Tournament Title</h3>
            <button type="button" onClick={() => setIsAdding(false)} style={{ background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <div>
              <label className="label">Game Title *</label>
              <input
                className="input"
                placeholder="e.g. Valorant, BGMI, FIFA 24"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Required Players per Team (1-20)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Rules and Match Format</label>
            <textarea
              className="textarea"
              placeholder="e.g. 5v5 Standard Competitive, Double elimination bracket, Tournament PC specifications..."
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={4}
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontWeight: 700 }}>
              {saving ? "Saving…" : "Save Game"}
            </button>
            <button type="button" onClick={() => setIsAdding(false)} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <div className="loading-spinner" />
        </div>
      ) : (!games || games.length === 0) ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", margin: "0 0 12px" }}>
            No tournament games registered yet.
          </p>
          {canCreate && (
            <button
              className="btn btn-primary"
              onClick={() => setIsAdding(true)}
            >
              Add First Tournament Game
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)", background: "rgba(255,255,255,0.02)" }}>
                  <th style={{ padding: "14px 18px", color: "var(--text-muted)" }}>Game</th>
                  <th style={{ padding: "14px 18px", color: "var(--text-muted)" }}>Team Size</th>
                  <th style={{ padding: "14px 18px", color: "var(--text-muted)" }}>Rules Summary</th>
                  <th style={{ padding: "14px 18px", color: "var(--text-muted)" }}>Accepting Teams</th>
                  <th style={{ padding: "14px 18px", color: "var(--text-muted)" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr key={game.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", verticalAlign: "top" }}>
                    <td style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-primary)" }}>{game.title}</td>
                    <td style={{ padding: "14px 18px" }}>
                      <span style={{ padding: "3px 8px", borderRadius: 4, background: "rgba(255,255,255,0.06)", fontWeight: 600 }}>
                        {game.team_size ? `${game.team_size} players` : "TBA"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px", maxWidth: 360, color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      {game.rules ? (game.rules.length > 80 ? game.rules.slice(0, 80) + "..." : game.rules) : "TBA"}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggle(game, "is_active")}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          border: "none",
                          cursor: canEdit ? "pointer" : "not-allowed",
                          opacity: canEdit ? 1 : 0.65,
                          background: game.is_active ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.08)",
                          color: game.is_active ? "#10b981" : "var(--text-muted)",
                        }}
                      >
                        {game.is_active ? "Active" : "Closed"}
                      </button>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <button
                        type="button"
                        disabled={!canPublish}
                        onClick={() => toggle(game, "is_published")}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          border: "none",
                          cursor: canPublish ? "pointer" : "not-allowed",
                          opacity: canPublish ? 1 : 0.65,
                          background: game.is_published ? "rgba(34, 211, 238, 0.15)" : "rgba(255,255,255,0.08)",
                          color: game.is_published ? "var(--cyan-400)" : "var(--text-muted)",
                        }}
                      >
                        {game.is_published ? "Published" : "Draft"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
