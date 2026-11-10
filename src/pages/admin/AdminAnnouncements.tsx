import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Announcement } from "@/types/database";
import { Bell, ExternalLink, CheckCircle, AlertCircle, Plus, Pin } from "lucide-react";

const emptyAnnouncement: Announcement = {
  id: "",
  title: "",
  body: "",
  is_pinned: false,
  is_published: true,
  author_id: null,
  published_at: null,
  created_at: "",
  updated_at: "",
};

export default function AdminAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setItems(data as Announcement[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSave = async () => {
    if (!editing || !editing.title.trim()) return;
    setSaving(true);
    setStatusMsg(null);
    const payload = {
      title: editing.title.trim(),
      body: editing.body,
      is_pinned: editing.is_pinned,
      is_published: editing.is_published,
      published_at: editing.is_published && !editing.published_at ? new Date().toISOString() : editing.published_at,
    };
    let result;
    if (editing.id) {
      result = await supabase.from("announcements").update(payload).eq("id", editing.id);
    } else {
      result = await supabase.from("announcements").insert(payload);
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

  const togglePublish = async (item: Announcement) => {
    const nextPublished = !item.is_published;
    const update = {
      is_published: nextPublished,
      published_at: nextPublished ? new Date().toISOString() : item.published_at,
    };
    await supabase.from("announcements").update(update).eq("id", item.id);
    setStatusMsg({
      type: "success",
      text: nextPublished ? "Saved. This is now live on the website." : "Announcement moved to draft.",
    });
    fetchItems();
  };

  const togglePin = async (item: Announcement) => {
    await supabase.from("announcements").update({ is_pinned: !item.is_pinned }).eq("id", item.id);
    setStatusMsg({
      type: "success",
      text: !item.is_pinned ? "Announcement pinned to the top of the updates page." : "Announcement unpinned.",
    });
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to delete this announcement?")) return;
    await supabase.from("announcements").delete().eq("id", id);
    setStatusMsg({ type: "success", text: "Announcement deleted successfully." });
    fetchItems();
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
              <Bell size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Announcements
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            Post updates, schedule changes, and urgent festival notices for visitors and participants.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            to="/announcements"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
          >
            <span>View on website</span> <ExternalLink size={13} />
          </Link>

          {!editing && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditing({ ...emptyAnnouncement });
                setStatusMsg(null);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.88rem", fontWeight: 700 }}
            >
              <Plus size={16} /> New Announcement
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
            {editing.id ? "Edit Announcement" : "Create New Announcement"}
          </h3>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Announcement Title *</label>
            <input
              className="input"
              placeholder="e.g. Science Expo Reporting Time Confirmed: 9:00 AM"
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Message / Details</label>
            <textarea
              className="textarea"
              rows={5}
              placeholder="Provide full instructions, booth numbers, or contact details..."
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            />
          </div>
          <div style={{ display: "flex", gap: 24, marginBottom: 20, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editing.is_pinned}
                onChange={(e) => setEditing({ ...editing, is_pinned: e.target.checked })}
              />
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Pin to top of page</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editing.is_published}
                onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })}
              />
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Publish live immediately</span>
            </label>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontWeight: 700 }}>
              {saving ? "Saving..." : "Save Announcement"}
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
            No announcements posted yet. Click 'New Announcement' to publish your first festival update.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setEditing({ ...emptyAnnouncement })}
          >
            Create First Announcement
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {items.map((item) => (
            <div key={item.id} className="card" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {item.is_pinned && (
                    <span className="badge badge-cyan" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Pin size={11} /> Pinned
                    </span>
                  )}
                  <h4 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    {item.title}
                  </h4>
                </div>
                <span className={`badge ${item.is_published ? "badge-success" : "badge-neutral"}`}>
                  {item.is_published ? "Published" : "Draft"}
                </span>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.5, margin: "0 0 16px" }}>
                {item.body}
              </p>
              <div style={{ display: "flex", gap: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                <button className="btn btn-ghost" style={{ fontSize: "0.82rem" }} onClick={() => setEditing(item)}>
                  Edit
                </button>
                <button className="btn btn-ghost" style={{ fontSize: "0.82rem", color: "var(--cyan-400)" }} onClick={() => togglePublish(item)}>
                  {item.is_published ? "Unpublish" : "Publish"}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: "0.82rem" }} onClick={() => togglePin(item)}>
                  {item.is_pinned ? "Unpin" : "Pin to Top"}
                </button>
                <button className="btn btn-ghost" style={{ fontSize: "0.82rem", color: "#ef4444" }} onClick={() => deleteItem(item.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
