import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { FaqItem } from "@/types/database";
import { HelpCircle, ExternalLink, CheckCircle, AlertCircle, Plus } from "lucide-react";

const emptyFaq: FaqItem = {
  id: "",
  question: "",
  answer: "",
  category: "General",
  is_published: true,
  sort_order: 1,
  created_at: "",
  updated_at: "",
};

export default function AdminFaqs() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("event_info:create");
  const canEdit = hasPermission("event_info:edit");
  const canPublish = hasPermission("event_info:publish");

  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    supabase
      .from("faq_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setItems(data as FaqItem[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSave = async () => {
    if (!editing || !editing.question.trim()) return;
    if (editing.id ? !canEdit : !canCreate) {
      setStatusMsg({ type: "error", text: "You do not have permission to save FAQs." });
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    const payload = {
      question: editing.question.trim(),
      answer: editing.answer,
      category: editing.category || "General",
      is_published: canPublish ? editing.is_published : false,
      sort_order: editing.sort_order,
    };
    let result;
    if (editing.id) {
      result = await supabase.from("faq_items").update(payload).eq("id", editing.id);
    } else {
      result = await supabase.from("faq_items").insert(payload);
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

  const togglePublish = async (item: FaqItem) => {
    if (!canPublish) return;
    const nextPublished = !item.is_published;
    await supabase.from("faq_items").update({ is_published: nextPublished }).eq("id", item.id);
    setStatusMsg({
      type: "success",
      text: nextPublished ? "Saved. This is now live on the website." : "FAQ moved to draft.",
    });
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!canEdit) return;
    if (!confirm("Are you sure you want to remove this FAQ?")) return;
    await supabase.from("faq_items").delete().eq("id", id);
    setStatusMsg({ type: "success", text: "FAQ removed." });
    fetchItems();
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
              <HelpCircle size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Visitor FAQs
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            Manage questions and answers shown on the public Visitor Information page.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            to="/visitor-info"
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
                setEditing({ ...emptyFaq, sort_order: items.length + 1, is_published: canPublish });
                setStatusMsg(null);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.88rem", fontWeight: 700 }}
            >
              <Plus size={16} /> Add FAQ
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
            {editing.id ? "Edit Question" : "Create FAQ Item"}
          </h3>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Question *</label>
            <input
              className="input"
              placeholder="e.g. Is entry free for school students and families?"
              value={editing.question}
              onChange={(e) => setEditing({ ...editing, question: e.target.value })}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Answer *</label>
            <textarea
              className="textarea"
              rows={4}
              placeholder="Detailed answer explaining gates, parking, ID cards, or timings..."
              value={editing.answer}
              onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
            <div>
              <label className="label">Category</label>
              <input
                className="input"
                placeholder="e.g. Entry, Parking, Schedule, Registration"
                value={editing.category ?? ""}
                onChange={(e) => setEditing({ ...editing, category: e.target.value || null })}
              />
            </div>
            <div>
              <label className="label">Display Order</label>
              <input
                className="input"
                type="number"
                value={editing.sort_order}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
              />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: canPublish ? "pointer" : "not-allowed", opacity: canPublish ? 1 : 0.6 }}>
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
              {saving ? "Saving..." : "Save FAQ"}
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
            No FAQs added yet. Click 'Add FAQ' to provide answers for festival attendees.
          </p>
          {canCreate && (
            <button
              className="btn btn-primary"
              onClick={() => setEditing({ ...emptyFaq, is_published: canPublish })}
            >
              Create First FAQ
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {items.map((item) => (
            <div key={item.id} className="card" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12 }}>
                <div>
                  <h4 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 4px", color: "var(--text-primary)" }}>
                    {item.question}
                  </h4>
                  {item.category && (
                    <span style={{ fontSize: "0.72rem", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 4, color: "var(--text-muted)" }}>
                      {item.category}
                    </span>
                  )}
                </div>
                <span className={`badge ${item.is_published ? "badge-success" : "badge-neutral"}`}>
                  {item.is_published ? "Published" : "Draft"}
                </span>
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", lineHeight: 1.5, margin: "10px 0 14px" }}>
                {item.answer}
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
