import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { ScheduleItem } from "@/types/database";
import { Calendar, ExternalLink, CheckCircle, AlertCircle, Plus } from "lucide-react";

const emptyItem: ScheduleItem = {
  id: "",
  event_date: "2026-11-20",
  start_time: "09:30",
  end_time: "11:00",
  title: "",
  description: null,
  venue: "Main Auditorium",
  component: "general",
  is_published: true,
  sort_order: 1,
  created_at: "",
  updated_at: "",
};

const components = [
  { key: "general", label: "General Festival" },
  { key: "science_expo", label: "Science Expo" },
  { key: "school_exhibition", label: "School Exhibition" },
  { key: "animation", label: "Animation" },
  { key: "esports", label: "Esports" },
];

export default function AdminSchedule() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("event_info:create");
  const canEdit = hasPermission("event_info:edit");
  const canPublish = hasPermission("event_info:publish");

  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    supabase
      .from("schedule_items")
      .select("*")
      .order("event_date", { ascending: true })
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setItems(data as ScheduleItem[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSave = async () => {
    if (!editing || !editing.title.trim()) return;
    if (editing.id ? !canEdit : !canCreate) {
      setStatusMsg({ type: "error", text: "You do not have permission to save schedule slots." });
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    const payload = {
      event_date: editing.event_date,
      start_time: editing.start_time || null,
      end_time: editing.end_time || null,
      title: editing.title.trim(),
      description: editing.description || null,
      venue: editing.venue || null,
      component: editing.component || "general",
      is_published: canPublish ? editing.is_published : false,
      sort_order: editing.sort_order,
    };
    let result;
    if (editing.id) {
      result = await supabase.from("schedule_items").update(payload).eq("id", editing.id);
    } else {
      result = await supabase.from("schedule_items").insert(payload);
    }
    if (result.error) {
      setStatusMsg({ type: "error", text: result.error.message });
    } else {
      setStatusMsg({ type: "success", text: "Saved. This is now live on the website." });
      setEditing(null);
      fetchItems();
    }
    setSaving(false);
  };

  const togglePublish = async (item: ScheduleItem) => {
    if (!canPublish) return;
    const nextPublished = !item.is_published;
    await supabase.from("schedule_items").update({ is_published: nextPublished }).eq("id", item.id);
    setStatusMsg({
      type: "success",
      text: nextPublished ? "Saved. This is now live on the website." : "Event slot moved to draft.",
    });
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!canEdit) return;
    if (!confirm("Are you sure you want to delete this schedule item?")) return;
    await supabase.from("schedule_items").delete().eq("id", id);
    setStatusMsg({ type: "success", text: "Schedule item deleted." });
    fetchItems();
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
              <Calendar size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Event Schedule
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            Manage the two-day festival programme, stages, and venues for 20 & 21 November 2026.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            to="/schedule"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
          >
            <span>View on website</span> <ExternalLink size={13} />
          </Link>

          {!editing && canCreate && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditing({ ...emptyItem, sort_order: items.length + 1, is_published: canPublish });
                setStatusMsg(null);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.88rem", fontWeight: 700 }}
            >
              <Plus size={16} /> Add Schedule Slot
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

      {/* Editor Form */}
      {editing && (
        <div className="card" style={{ marginBottom: 28, border: "1.5px solid var(--cyan-400)", padding: 24 }}>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 16 }}>
            {editing.id ? "Edit Schedule Item" : "Create Schedule Item"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <label className="label">Event Date</label>
              <select
                className="select"
                value={editing.event_date}
                onChange={(e) => setEditing({ ...editing, event_date: e.target.value })}
              >
                <option value="2026-11-20">Day 1: Friday, 20 Nov 2026</option>
                <option value="2026-11-21">Day 2: Saturday, 21 Nov 2026</option>
              </select>
            </div>
            <div>
              <label className="label">Zone / Component</label>
              <select
                className="select"
                value={editing.component ?? "general"}
                onChange={(e) => setEditing({ ...editing, component: e.target.value })}
              >
                {components.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Start Time</label>
              <input
                className="input"
                type="time"
                value={editing.start_time ?? ""}
                onChange={(e) => setEditing({ ...editing, start_time: e.target.value || null })}
              />
            </div>
            <div>
              <label className="label">End Time</label>
              <input
                className="input"
                type="time"
                value={editing.end_time ?? ""}
                onChange={(e) => setEditing({ ...editing, end_time: e.target.value || null })}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Title / Event Name *</label>
            <input
              className="input"
              placeholder="e.g. Grand Inauguration & Keynote Address"
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Venue / Room</label>
            <input
              className="input"
              placeholder="e.g. Centenary Auditorium, Ground Floor"
              value={editing.venue ?? ""}
              onChange={(e) => setEditing({ ...editing, venue: e.target.value || null })}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Description (Optional)</label>
            <textarea
              className="textarea"
              rows={3}
              placeholder="Brief details about who is presenting or rules for audience..."
              value={editing.description ?? ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value || null })}
            />
          </div>
          <div style={{ display: "flex", gap: 24, marginBottom: 20, alignItems: "center" }}>
            <div>
              <label className="label">Display Order</label>
              <input
                className="input"
                type="number"
                value={editing.sort_order}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                style={{ width: 90 }}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: canPublish ? "pointer" : "not-allowed", opacity: canPublish ? 1 : 0.6, marginTop: 18 }}>
              <input
                type="checkbox"
                checked={canPublish ? editing.is_published : false}
                disabled={!canPublish}
                onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })}
              />
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Publish live immediately</span>
            </label>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontWeight: 700 }}>
              {saving ? "Saving..." : "Save Schedule Slot"}
            </button>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <div className="loading-spinner" />
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", margin: "0 0 12px" }}>
            No schedule slots added yet. Click 'Add Schedule Slot' to begin creating the timetable.
          </p>
          {canCreate && (
            <button
              className="btn btn-primary"
              onClick={() => setEditing({ ...emptyItem, is_published: canPublish })}
            >
              Create First Schedule Slot
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {items.map((item) => (
            <div
              key={item.id}
              className="card"
              style={{
                display: "flex",
                gap: 16,
                alignItems: "center",
                padding: "16px 20px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 90, textAlign: "center", paddingRight: 14, borderRight: "1px solid var(--border-subtle)" }}>
                <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", margin: "0 0 2px" }}>
                  {item.event_date === "2026-11-20" ? "20 Nov (Day 1)" : "21 Nov (Day 2)"}
                </p>
                <p style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--cyan-400)", margin: 0 }}>
                  {item.start_time ? item.start_time.slice(0, 5) : "--:--"}
                  {item.end_time ? ` - ${item.end_time.slice(0, 5)}` : ""}
                </p>
              </div>

              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    {item.title}
                  </h4>
                  {item.component && (
                    <span style={{ fontSize: "0.72rem", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4, color: "var(--text-muted)" }}>
                      {item.component.replace("_", " ")}
                    </span>
                  )}
                </div>
                {item.venue && (
                  <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                    📍 {item.venue}
                  </p>
                )}
              </div>

              <span className={`badge ${item.is_published ? "badge-success" : "badge-neutral"}`}>
                {item.is_published ? "Published" : "Draft"}
              </span>

              {(canEdit || canPublish) && (
                <div style={{ display: "flex", gap: 8 }}>
                  {canEdit && (
                    <button className="btn btn-ghost" style={{ fontSize: "0.82rem" }} onClick={() => setEditing(item)}>
                      Edit
                    </button>
                  )}
                  {canPublish && (
                    <button className="btn btn-ghost" style={{ fontSize: "0.82rem", color: "var(--cyan-400)" }} onClick={() => togglePublish(item)}>
                      {item.is_published ? "Unpublish" : "Publish"}
                    </button>
                  )}
                  {canEdit && (
                    <button className="btn btn-ghost" style={{ fontSize: "0.82rem", color: "#ef4444" }} onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
