import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Sponsor } from "@/types/database";
import { ImagePicker } from "@/components/admin/ImagePicker";
import { Award, ExternalLink, CheckCircle, AlertCircle, Plus } from "lucide-react";

const emptySponsor: Sponsor = {
  id: "",
  name: "",
  tier: "Gold Sponsor",
  description: null,
  logo_url: null,
  link_url: null,
  is_published: true,
  sort_order: 1,
  created_at: "",
  updated_at: "",
};

export default function AdminSponsors() {
  const [items, setItems] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    supabase
      .from("sponsors")
      .select("*")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setItems(data as Sponsor[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSave = async () => {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    setStatusMsg(null);
    const payload = {
      name: editing.name.trim(),
      tier: editing.tier || null,
      description: editing.description || null,
      logo_url: editing.logo_url || null,
      link_url: editing.link_url || null,
      is_published: editing.is_published,
      sort_order: editing.sort_order,
    };
    let result;
    if (editing.id) {
      result = await supabase.from("sponsors").update(payload).eq("id", editing.id);
    } else {
      result = await supabase.from("sponsors").insert(payload);
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

  const togglePublish = async (item: Sponsor) => {
    const nextPublished = !item.is_published;
    await supabase.from("sponsors").update({ is_published: nextPublished }).eq("id", item.id);
    setStatusMsg({
      type: "success",
      text: nextPublished ? "Saved. This is now live on the website." : "Sponsor hidden from live view.",
    });
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to remove this sponsor?")) return;
    await supabase.from("sponsors").delete().eq("id", id);
    setStatusMsg({ type: "success", text: "Sponsor removed." });
    fetchItems();
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
              <Award size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Sponsors & Partners
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            Manage brand partners, tiers, and logos displayed on the public festival sponsors page.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            to="/sponsors"
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
                setEditing({ ...emptySponsor, sort_order: items.length + 1 });
                setStatusMsg(null);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.88rem", fontWeight: 700 }}
            >
              <Plus size={16} /> Add Sponsor
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
            {editing.id ? "Edit Sponsor" : "Add Sponsor"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <label className="label">Company / Partner Name *</label>
              <input
                className="input"
                placeholder="e.g. Karnataka State Electronics Development Corp"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Sponsorship Tier</label>
              <input
                className="input"
                placeholder="e.g. Title Sponsor, Platinum, Gold, Tech Partner"
                value={editing.tier ?? ""}
                onChange={(e) => setEditing({ ...editing, tier: e.target.value || null })}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <ImagePicker
              value={editing.logo_url ?? ""}
              onChange={(url) => setEditing({ ...editing, logo_url: url })}
              label="Sponsor Logo (Resized and stored automatically)"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <label className="label">Website Link</label>
              <input
                className="input"
                placeholder="https://example.com"
                value={editing.link_url ?? ""}
                onChange={(e) => setEditing({ ...editing, link_url: e.target.value || null })}
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

          <div style={{ marginBottom: 16 }}>
            <label className="label">Description / Recognition (Optional)</label>
            <textarea
              className="textarea"
              rows={2}
              placeholder="e.g. Official computing infrastructure and tournament prize pool partner"
              value={editing.description ?? ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value || null })}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editing.is_published}
                onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })}
              />
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Show on website</span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontWeight: 700 }}>
              {saving ? "Saving..." : "Save Sponsor"}
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
            No sponsors added yet. Click 'Add Sponsor' to display partners on the website.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setEditing({ ...emptySponsor })}
          >
            Add First Sponsor
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
          {items.map((item) => (
            <div
              key={item.id}
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "20px 22px",
              }}
            >
              <div>
                {item.logo_url ? (
                  <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 8 }}>
                    <img src={item.logo_url} alt={item.name} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
                  </div>
                ) : (
                  <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14, background: "rgba(255,255,255,0.02)", borderRadius: 8, color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    No logo uploaded
                  </div>
                )}
                <h4 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 4px", color: "var(--text-primary)" }}>{item.name}</h4>
                {item.tier && (
                  <span className="badge badge-cyan" style={{ fontSize: "0.74rem", margin: "0 0 8px", display: "inline-block" }}>
                    {item.tier}
                  </span>
                )}
                {item.description && (
                  <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "4px 0 0", lineHeight: 1.4 }}>
                    {item.description}
                  </p>
                )}
              </div>

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className={`badge ${item.is_published ? "badge-success" : "badge-neutral"}`}>
                    {item.is_published ? "Published" : "Draft"}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "4px 8px" }} onClick={() => setEditing(item)}>
                      Edit
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "4px 8px", color: "var(--cyan-400)" }} onClick={() => togglePublish(item)}>
                      {item.is_published ? "Hide" : "Show"}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: "0.8rem", padding: "4px 8px", color: "#ef4444" }} onClick={() => deleteItem(item.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
