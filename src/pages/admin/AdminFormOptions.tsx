import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FormOption } from "@/types/database";
import { Plus, ArrowUp, ArrowDown, Trash2, Edit2, CheckCircle2, AlertCircle, Save, X, RefreshCw } from "lucide-react";

export default function AdminFormOptions() {
  const [options, setOptions] = useState<FormOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedForm, setSelectedForm] = useState<"all" | "participation" | "visitor">("all");
  
  // New option modal / inline state
  const [editingOption, setEditingOption] = useState<Partial<FormOption> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchOptions = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const { data, error } = await supabase
        .from("form_options")
        .select("*")
        .order("form_type", { ascending: true })
        .order("field_key", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) {
        setStatusMsg({ type: "error", text: error.message || "Failed to load form options." });
      } else {
        setOptions((data as FormOption[]) || []);
      }
    } catch (e: any) {
      setStatusMsg({ type: "error", text: e.message || "Failed to fetch form options." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  const handleToggleActive = async (opt: FormOption) => {
    const nextState = !opt.is_active;
    try {
      const { error } = await supabase
        .from("form_options")
        .update({ is_active: nextState, updated_at: new Date().toISOString() })
        .eq("id", opt.id);
      if (error) {
        setStatusMsg({ type: "error", text: error.message });
      } else {
        setOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, is_active: nextState } : o)));
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message });
    }
  };

  const handleMove = async (opt: FormOption, direction: "up" | "down") => {
    const subset = options.filter((o) => o.form_type === opt.form_type && o.field_key === opt.field_key);
    const index = subset.findIndex((o) => o.id === opt.id);
    if ((direction === "up" && index === 0) || (direction === "down" && index === subset.length - 1)) {
      return;
    }
    const target = direction === "up" ? subset[index - 1] : subset[index + 1];

    try {
      await Promise.all([
        supabase.from("form_options").update({ sort_order: target.sort_order }).eq("id", opt.id),
        supabase.from("form_options").update({ sort_order: opt.sort_order }).eq("id", target.id),
      ]);
      await fetchOptions();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message });
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Are you sure you want to delete the option "${label}"?`)) return;
    try {
      const { error } = await supabase.from("form_options").delete().eq("id", id);
      if (error) {
        setStatusMsg({ type: "error", text: error.message });
      } else {
        setStatusMsg({ type: "success", text: `Option "${label}" deleted.` });
        setOptions((prev) => prev.filter((o) => o.id !== id));
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message });
    }
  };

  const handleSaveOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOption || !editingOption.label || !editingOption.value) {
      setStatusMsg({ type: "error", text: "Please provide both Label and Value." });
      return;
    }
    setSaving(true);
    setStatusMsg(null);

    try {
      if (editingOption.id) {
        // Update
        const { error } = await supabase
          .from("form_options")
          .update({
            label: editingOption.label.trim(),
            value: editingOption.value.trim(),
            field_key: editingOption.field_key,
            form_type: editingOption.form_type,
            is_active: editingOption.is_active ?? true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingOption.id);
        if (error) throw error;
        setStatusMsg({ type: "success", text: `Option "${editingOption.label}" updated.` });
      } else {
        // Insert
        const nextOrder = (options.filter((o) => o.form_type === editingOption.form_type && o.field_key === editingOption.field_key).length || 0) + 1;
        const { error } = await supabase
          .from("form_options")
          .insert({
            label: editingOption.label.trim(),
            value: editingOption.value.trim(),
            field_key: editingOption.field_key,
            form_type: editingOption.form_type,
            sort_order: nextOrder,
            is_active: editingOption.is_active ?? true,
          });
        if (error) throw error;
        setStatusMsg({ type: "success", text: `New option "${editingOption.label}" created.` });
      }
      setEditingOption(null);
      await fetchOptions();
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Failed to save option." });
    } finally {
      setSaving(false);
    }
  };

  const filteredOptions = selectedForm === "all" ? options : options.filter((o) => o.form_type === selectedForm);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Editable Form Options & Categories
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            Manage the choices shown in registration dropdowns. Public forms load and validate against these options dynamically.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() =>
              setEditingOption({
                form_type: "participation",
                field_key: "participant_category",
                label: "",
                value: "",
                is_active: true,
              })
            }
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
          >
            <Plus size={16} /> Add New Choice
          </button>
          <button
            onClick={fetchOptions}
            disabled={loading}
            className="btn btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: "0.88rem",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: statusMsg.type === "success" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${statusMsg.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: statusMsg.type === "success" ? "#10b981" : "#ef4444",
          }}
        >
          {statusMsg.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { id: "all", label: `All Options (${options.length})` },
          { id: "participation", label: "Project & Participation Options" },
          { id: "visitor", label: "Visitor Categories" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedForm(tab.id as any)}
            className="btn"
            style={{
              fontSize: "0.82rem",
              padding: "6px 14px",
              background: selectedForm === tab.id ? "var(--cyan-400)" : "rgba(255,255,255,0.04)",
              color: selectedForm === tab.id ? "var(--navy-900)" : "var(--text-secondary)",
              fontWeight: 600,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Options Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600 }}>Form & Field</th>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600 }}>Display Label</th>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600 }}>Stored Value</th>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
                    <div className="loading-spinner" style={{ margin: "0 auto 12px" }} />
                    Loading options...
                  </td>
                </tr>
              ) : filteredOptions.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
                    No options configured. Click "Add New Choice" to create one.
                  </td>
                </tr>
              ) : (
                filteredOptions.map((opt) => (
                  <tr key={opt.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "14px 18px" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "2px 8px",
                          borderRadius: 4,
                          background: opt.form_type === "visitor" ? "rgba(16,185,129,0.15)" : "rgba(34,211,238,0.15)",
                          color: opt.form_type === "visitor" ? "#10b981" : "var(--cyan-400)",
                        }}
                      >
                        {opt.form_type}
                      </span>
                      <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", fontFamily: "monospace", marginTop: 4 }}>
                        {opt.field_key}
                      </div>
                    </td>
                    <td style={{ padding: "14px 18px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {opt.label}
                    </td>
                    <td style={{ padding: "14px 18px", color: "var(--text-secondary)", fontSize: "0.82rem", fontFamily: "monospace" }}>
                      {opt.value}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(opt)}
                        style={{
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          padding: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: opt.is_active ? "#10b981" : "#64748b",
                          }}
                        />
                        <span style={{ fontSize: "0.8rem", color: opt.is_active ? "#10b981" : "#64748b", fontWeight: 600 }}>
                          {opt.is_active ? "Active" : "Disabled"}
                        </span>
                      </button>
                    </td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <button
                          onClick={() => handleMove(opt, "up")}
                          className="btn btn-ghost"
                          style={{ padding: "4px 8px", fontSize: "0.76rem" }}
                          title="Move up"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          onClick={() => handleMove(opt, "down")}
                          className="btn btn-ghost"
                          style={{ padding: "4px 8px", fontSize: "0.76rem" }}
                          title="Move down"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          onClick={() => setEditingOption(opt)}
                          className="btn btn-ghost"
                          style={{ padding: "4px 8px", fontSize: "0.76rem" }}
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(opt.id, opt.label)}
                          className="btn btn-ghost"
                          style={{ padding: "4px 8px", fontSize: "0.76rem", color: "#ef4444" }}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Add Modal */}
      {editingOption && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <form
            onSubmit={handleSaveOption}
            className="card"
            style={{ maxWidth: 500, width: "100%", padding: 28, background: "#1e293b", border: "1px solid var(--border-subtle)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {editingOption.id ? "Edit Dropdown Choice" : "Add Dropdown Choice"}
              </h3>
              <button
                type="button"
                onClick={() => setEditingOption(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
              <div>
                <label className="label" style={{ fontWeight: 600, marginBottom: 6, display: "block" }}>
                  Registration Form
                </label>
                <select
                  className="select"
                  value={editingOption.form_type}
                  onChange={(e) => {
                    const form = e.target.value as any;
                    const defaultKey = form === "visitor" ? "visitor_category" : "participant_category";
                    setEditingOption({ ...editingOption, form_type: form, field_key: defaultKey });
                  }}
                >
                  <option value="participation">Project Participation</option>
                  <option value="visitor">Visitor Passes</option>
                </select>
              </div>

              <div>
                <label className="label" style={{ fontWeight: 600, marginBottom: 6, display: "block" }}>
                  Field Key
                </label>
                <select
                  className="select"
                  value={editingOption.field_key}
                  onChange={(e) => setEditingOption({ ...editingOption, field_key: e.target.value })}
                >
                  {editingOption.form_type === "visitor" ? (
                    <option value="visitor_category">visitor_category</option>
                  ) : (
                    <>
                      <option value="participant_category">participant_category</option>
                      <option value="participation_area">participation_area</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="label" style={{ fontWeight: 600, marginBottom: 6, display: "block" }}>
                  Display Label (Shown to user in dropdown)
                </label>
                <input
                  className="input"
                  required
                  value={editingOption.label || ""}
                  placeholder="e.g. Science Expo (Working Models)"
                  onChange={(e) => setEditingOption({ ...editingOption, label: e.target.value, value: e.target.value })}
                />
              </div>

              <div>
                <label className="label" style={{ fontWeight: 600, marginBottom: 6, display: "block" }}>
                  Database Value
                </label>
                <input
                  className="input"
                  required
                  value={editingOption.value || ""}
                  placeholder="e.g. Science Expo (Working Models)"
                  onChange={(e) => setEditingOption({ ...editingOption, value: e.target.value })}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="opt-active"
                  checked={editingOption.is_active !== false}
                  onChange={(e) => setEditingOption({ ...editingOption, is_active: e.target.checked })}
                />
                <label htmlFor="opt-active" style={{ fontSize: "0.88rem", color: "var(--text-secondary)", cursor: "pointer" }}>
                  Active (show in registration form)
                </label>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingOption(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Save size={15} />
                {saving ? "Saving…" : "Save Choice"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
