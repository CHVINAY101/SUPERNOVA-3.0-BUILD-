import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { InstitutionItem } from "@/types/database";
import { GraduationCap, ExternalLink, Plus, Edit2, Check, X, Trash2, CheckCircle, AlertCircle } from "lucide-react";

const INITIAL_INSTITUTIONS: InstitutionItem[] = [
  {
    id: "inst-1",
    name: "The National College, Basavanagudi",
    role: "Host & Autonomous Lead College",
    description: "Centenary campus hosting Science Expo, Animation Showcase and Esports Tournament arenas.",
    is_published: true,
    sort_order: 1,
  },
  {
    id: "inst-2",
    name: "National Pre-University College",
    role: "Higher Secondary Science & Commerce",
    description: "Basavanagudi higher secondary students leading physics models, Olympiad prototypes, and volunteer desks.",
    is_published: true,
    sort_order: 2,
  },
  {
    id: "inst-3",
    name: "National English School",
    role: "Foundational & Middle School",
    description: "Primary and middle school teams presenting environmental inventions and arts models in the Kids' Pavilion.",
    is_published: true,
    sort_order: 3,
  },
  {
    id: "inst-4",
    name: "National High School",
    role: "Secondary Heritage School",
    description: "Historic secondary academy alumni and students presenting science exhibitions and competitive robotics.",
    is_published: true,
    sort_order: 4,
  },
];

export default function AdminInstitutions() {
  const [institutions, setInstitutions] = useState<InstitutionItem[]>(INITIAL_INSTITUTIONS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<InstitutionItem>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchInstitutions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("institutions")
        .select("*")
        .order("sort_order", { ascending: true });

      if (!error && data && data.length > 0) {
        setInstitutions(data as InstitutionItem[]);
      }
    } catch (err) {
      console.warn("Could not load institutions:", err);
    }
  }, []);

  useEffect(() => {
    fetchInstitutions();
  }, [fetchInstitutions]);

  const handleEdit = (inst: InstitutionItem) => {
    setEditingId(inst.id);
    setDraft({ ...inst });
    setStatusMsg(null);
  };

  const handleSave = async (id: string) => {
    const updated = institutions.map((item) => (item.id === id ? { ...item, ...draft } : item));
    setInstitutions(updated as InstitutionItem[]);
    setEditingId(null);
    await supabase.from("institutions").update(draft).eq("id", id);
    setStatusMsg({ type: "success", text: "Saved. This is now live on the website." });
  };

  const handleTogglePublish = async (id: string, current: boolean) => {
    const updated = institutions.map((item) => (item.id === id ? { ...item, is_published: !current } : item));
    setInstitutions(updated);
    await supabase.from("institutions").update({ is_published: !current }).eq("id", id);
    setStatusMsg({
      type: "success",
      text: !current ? "Saved. This is now live on the website." : "School hidden from live view.",
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this institution?")) return;
    setInstitutions(institutions.filter((item) => item.id !== id));
    await supabase.from("institutions").delete().eq("id", id);
    setStatusMsg({ type: "success", text: "Institution removed." });
  };

  const handleAddNew = async () => {
    if (!draft.name?.trim()) return;
    const newItem: InstitutionItem = {
      id: `inst-${Date.now()}`,
      name: draft.name.trim(),
      role: draft.role?.trim() || "Participating Institution",
      description: draft.description?.trim() || "",
      is_published: true,
      sort_order: institutions.length + 1,
    };
    const updated = [...institutions, newItem];
    setInstitutions(updated);
    setShowAddForm(false);
    setDraft({});
    await supabase.from("institutions").insert(newItem);
    setStatusMsg({ type: "success", text: "Saved. This is now live on the website." });
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
              <GraduationCap size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Schools & Institutions
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            Manage campus branches, academies, and schools exhibiting at Supernova 3.0.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            to="/school-exhibition"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
          >
            <span>View on website</span> <ExternalLink size={13} />
          </Link>

          {!showAddForm && (
            <button
              onClick={() => { setShowAddForm(true); setDraft({}); setStatusMsg(null); }}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.88rem", fontWeight: 700 }}
            >
              <Plus size={16} /> Add School
            </button>
          )}
        </div>
      </div>

      {/* Feedback Alert */}
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

      {showAddForm && (
        <div className="card" style={{ padding: 24, marginBottom: 28, border: "1.5px solid var(--cyan-400)" }}>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: 16 }}>Add New School / Academy</h3>
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <label className="label">Institution Name *</label>
              <input
                className="input"
                placeholder="e.g. National College of Applied Sciences"
                value={draft.name || ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Role / Category</label>
              <input
                className="input"
                placeholder="e.g. Higher Secondary Campus, Science Wing"
                value={draft.role || ""}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Brief summary of campus exhibits, departments, or project entries..."
                value={draft.description || ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={handleAddNew} className="btn btn-primary" style={{ fontWeight: 700 }}>
                Save School
              </button>
              <button onClick={() => setShowAddForm(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {institutions.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", margin: "0 0 12px" }}>
            No schools or institutions registered yet.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => { setShowAddForm(true); setDraft({}); }}
          >
            Add First School
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {institutions.map((inst) => {
            const isEditing = editingId === inst.id;
            return (
              <div key={inst.id} className="card" style={{ padding: "20px 24px" }}>
                {isEditing ? (
                  <div style={{ display: "grid", gap: 14 }}>
                    <input
                      className="input"
                      value={draft.name || ""}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                    <input
                      className="input"
                      value={draft.role || ""}
                      onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                    />
                    <textarea
                      className="textarea"
                      rows={2}
                      value={draft.description || ""}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    />
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => handleSave(inst.id)} className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
                        <Check size={14} /> Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="btn btn-secondary" style={{ padding: "6px 14px", fontSize: "0.85rem" }}>
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                      <div style={{ width: 44, height: 44, borderRadius: "12px", background: "rgba(34, 211, 238, 0.1)", color: "var(--cyan-400)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                        <GraduationCap size={22} />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>{inst.name}</h3>
                          <span style={{ fontSize: "0.75rem", padding: "3px 8px", borderRadius: "999px", background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>
                            {inst.role}
                          </span>
                        </div>
                        {inst.description && (
                          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6, lineHeight: 1.5 }}>
                            {inst.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button
                        onClick={() => handleTogglePublish(inst.id, inst.is_published)}
                        style={{
                          padding: "5px 12px",
                          borderRadius: "999px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          border: "none",
                          cursor: "pointer",
                          background: inst.is_published ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.08)",
                          color: inst.is_published ? "#10b981" : "var(--text-muted)",
                        }}
                      >
                        {inst.is_published ? "Published" : "Draft"}
                      </button>

                      <button
                        onClick={() => handleEdit(inst)}
                        className="btn btn-ghost"
                        style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                      >
                        <Edit2 size={14} /> Edit
                      </button>

                      <button
                        onClick={() => handleDelete(inst.id)}
                        className="btn btn-ghost"
                        style={{ padding: "6px 10px", fontSize: "0.8rem", color: "#ef4444" }}
                        title="Delete institution"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
