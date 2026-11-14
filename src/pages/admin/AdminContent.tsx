import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { SiteContent } from "@/types/database";
import { FileText, ExternalLink, CheckCircle, AlertCircle, Plus } from "lucide-react";

const sections = [
  { key: "home", label: "Home", path: "/" },
  { key: "about", label: "About", path: "/about" },
  { key: "science_expo", label: "Science Expo", path: "/science-expo" },
  { key: "school_exhibition", label: "School Exhibition", path: "/school-exhibition" },
  { key: "animation", label: "Animation", path: "/animation" },
  { key: "esports_info", label: "Esports Info", path: "/esports" },
  { key: "visitor_info", label: "Visitor Info", path: "/visitor-info" },
  { key: "contact", label: "Contact", path: "/contact" },
];

export default function AdminContent() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("event_info:create");
  const canEdit = hasPermission("event_info:edit");
  const canPublish = hasPermission("event_info:publish");

  const [activeSection, setActiveSection] = useState("home");
  const [items, setItems] = useState<SiteContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SiteContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const currentSection = sections.find((s) => s.key === activeSection) || sections[0];

  const fetchItems = useCallback(() => {
    setLoading(true);
    supabase
      .from("site_content")
      .select("*")
      .eq("section", activeSection)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setItems(data as SiteContent[]);
        setLoading(false);
      });
  }, [activeSection]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSave = async () => {
    if (!editing) return;
    if (editing.id ? !canEdit : !canCreate) {
      setStatusMsg({ type: "error", text: "You do not have permission to save content." });
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    const payload = {
      section: editing.section,
      title: editing.title,
      body: editing.body,
      is_published: canPublish ? editing.is_published : false,
      sort_order: editing.sort_order,
    };
    let result;
    if (editing.id) {
      result = await supabase.from("site_content").update(payload).eq("id", editing.id);
    } else {
      result = await supabase.from("site_content").insert(payload);
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

  const togglePublish = async (item: SiteContent) => {
    if (!canPublish) return;
    const nextVal = !item.is_published;
    await supabase.from("site_content").update({ is_published: nextVal }).eq("id", item.id);
    setStatusMsg({
      type: "success",
      text: nextVal ? "Saved. This is now live on the website." : "Content unpublished from live view.",
    });
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!canEdit) return;
    if (!confirm("Delete this content block? This cannot be undone.")) return;
    await supabase.from("site_content").delete().eq("id", id);
    setStatusMsg({ type: "success", text: "Content block removed." });
    fetchItems();
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
              <FileText size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Page Text & Content
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            Edit headlines, event overviews, and instructions shown on public festival pages.
          </p>
        </div>

        <Link
          to={currentSection.path}
          target="_blank"
          rel="noreferrer"
          className="btn btn-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
        >
          <span>View on website</span> <ExternalLink size={13} />
        </Link>
      </div>

      {/* Status Alert */}
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

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              setActiveSection(s.key);
              setEditing(null);
              setStatusMsg(null);
            }}
            className="btn"
            style={{
              background: activeSection === s.key ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.03)",
              border: `1.5px solid ${activeSection === s.key ? "var(--cyan-400)" : "var(--border-default)"}`,
              color: activeSection === s.key ? "var(--cyan-400)" : "var(--text-muted)",
              fontSize: "0.85rem",
              fontWeight: activeSection === s.key ? 700 : 500,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Editor Modal or Inline Box */}
      {editing ? (
        <div className="card" style={{ marginBottom: 24, border: "1.5px solid var(--cyan-400)" }}>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 16 }}>
            {editing.id ? `Edit "${editing.title || "Section"}"` : `New Content for ${currentSection.label}`}
          </h3>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Heading / Title</label>
            <input
              className="input"
              value={editing.title}
              placeholder="e.g. Overview & Highlights"
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Body Paragraph (Markdown or plain text)</label>
            <textarea
              className="textarea"
              rows={7}
              placeholder="Write the public description here..."
              value={editing.body ?? ""}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            />
          </div>
          <div style={{ display: "flex", gap: 24, marginBottom: 20, alignItems: "center" }}>
            <div>
              <label className="label">Order / Position</label>
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
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Publish immediately to website</span>
            </label>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontWeight: 700 }}>
              {saving ? "Saving..." : "Save Content Block"}
            </button>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : canCreate ? (
        <button
          className="btn btn-primary"
          onClick={() =>
            setEditing({
              id: "",
              section: activeSection,
              title: "",
              body: "",
              is_published: canPublish,
              sort_order: items.length + 1,
              updated_by: null,
              updated_at: "",
              created_at: "",
            })
          }
          style={{ marginBottom: 24, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
        >
          <Plus size={16} /> Add Content Block
        </button>
      ) : null}

      {/* List */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <div className="loading-spinner" />
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", margin: "0 0 12px" }}>
            No content blocks found for the <strong>{currentSection.label}</strong> page yet.
          </p>
          {canCreate && (
            <button
              className="btn btn-secondary"
              onClick={() =>
                setEditing({
                  id: "",
                  section: activeSection,
                  title: "",
                  body: "",
                  is_published: canPublish,
                  sort_order: 1,
                  updated_by: null,
                  updated_at: "",
                  created_at: "",
                })
              }
            >
              Create First Block
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {items.map((item) => (
            <div key={item.id} className="card" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <h4 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                  {item.title || "Untitled Block"}
                </h4>
                <span className={`badge ${item.is_published ? "badge-success" : "badge-neutral"}`}>
                  {item.is_published ? "Published" : "Draft"}
                </span>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.5, margin: "0 0 16px" }}>
                {item.body ? (item.body.length > 200 ? item.body.slice(0, 200) + "..." : item.body) : "No body text entered."}
              </p>
              {(canEdit || canPublish) && (
                <div style={{ display: "flex", gap: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                  {canEdit && (
                    <button className="btn btn-ghost" style={{ fontSize: "0.82rem" }} onClick={() => setEditing(item)}>
                      Edit
                    </button>
                  )}
                  {canPublish && (
                    <button className="btn btn-ghost" style={{ fontSize: "0.82rem", color: "var(--cyan-400)" }} onClick={() => togglePublish(item)}>
                      {item.is_published ? "Unpublish" : "Publish Live"}
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
