import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RegistrationControl } from "@/types/database";
import { CheckCircle2, AlertCircle, Save, Calendar, Clock, RefreshCw } from "lucide-react";

interface FormMeta {
  title: string;
  badgeColor: string;
  description: string;
}

const META_MAP: Record<string, FormMeta> = {
  participation: {
    title: "Project & Exhibit Registration",
    badgeColor: "var(--cobalt)",
    description: "For student innovators, research stalls, school inventors, and animators.",
  },
  visitor: {
    title: "General Visitor Registration",
    badgeColor: "#10b981",
    description: "Free campus admission passes for students, educators, families, and visitors.",
  },
  esports: {
    title: "Esports Squad Registration",
    badgeColor: "var(--coral)",
    description: "Collegiate championship rosters in VALORANT (5p), FREE FIRE (4p), and BGMI (4p).",
  },
};

export default function AdminRegistrationControls() {
  const [controls, setControls] = useState<RegistrationControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchControls = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const { data, error } = await supabase
        .from("registration_controls")
        .select("*")
        .order("form_type", { ascending: true });
      if (error) {
        setStatusMsg({ type: "error", text: error.message || "Could not load registration controls." });
      } else {
        setControls((data as RegistrationControl[]) || []);
      }
    } catch (e: any) {
      setStatusMsg({ type: "error", text: e.message || "Failed to load controls." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchControls();
  }, []);

  const handleFieldChange = (formType: string, field: keyof RegistrationControl, value: any) => {
    setControls((prev) =>
      prev.map((c) => (c.form_type === formType ? { ...c, [field]: value } : c))
    );
  };

  const handleSave = async (control: RegistrationControl) => {
    setSavingKey(control.form_type);
    setStatusMsg(null);
    try {
      const { error } = await supabase
        .from("registration_controls")
        .update({
          is_open: control.is_open,
          closed_message: control.closed_message?.trim() || null,
          opens_at: control.opens_at ? new Date(control.opens_at).toISOString() : null,
          closes_at: control.closes_at ? new Date(control.closes_at).toISOString() : null,
          intro_text: control.intro_text?.trim() || null,
          consent_text: control.consent_text?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("form_type", control.form_type);

      if (error) {
        setStatusMsg({ type: "error", text: `Failed to save ${control.form_type}: ${error.message}` });
      } else {
        setStatusMsg({ type: "success", text: `${META_MAP[control.form_type]?.title || control.form_type} settings saved successfully!` });
      }
    } catch (err: any) {
      setStatusMsg({ type: "error", text: err.message || "Failed to update registration settings." });
    } finally {
      setSavingKey(null);
    }
  };

  const getStatusBadge = (ctrl: RegistrationControl) => {
    const now = new Date();
    if (!ctrl.is_open) {
      return (
        <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700, background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
          CLOSED
        </span>
      );
    }
    if (ctrl.opens_at && now < new Date(ctrl.opens_at)) {
      return (
        <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700, background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
          SCHEDULED (Opens Soon)
        </span>
      );
    }
    if (ctrl.closes_at && now > new Date(ctrl.closes_at)) {
      return (
        <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700, background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
          EXPIRED
        </span>
      );
    }
    return (
      <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700, background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
        OPEN & ACTIVE
      </span>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Registration Open/Close Controls
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            Instantly open or close each registration stream with live public site synchronization and database-level enforcement.
          </p>
        </div>
        <button
          onClick={fetchControls}
          disabled={loading}
          className="btn btn-secondary"
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {statusMsg && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 8,
            marginBottom: 24,
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

      {loading ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <div className="loading-spinner" style={{ margin: "0 auto 16px" }} />
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading portal registration controls...</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          {controls.map((ctrl) => {
            const meta = META_MAP[ctrl.form_type] || {
              title: ctrl.form_type.toUpperCase(),
              badgeColor: "var(--cyan-400)",
              description: "",
            };
            const isSaving = savingKey === ctrl.form_type;

            // Format timestamp for datetime-local input
            const formatForInput = (iso: string | null) => {
              if (!iso) return "";
              try {
                const d = new Date(iso);
                return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
              } catch {
                return "";
              }
            };

            return (
              <div
                key={ctrl.form_type}
                className="card"
                style={{
                  padding: 24,
                  border: ctrl.is_open ? "1px solid var(--border-subtle)" : "1px solid rgba(239,68,68,0.3)",
                  background: ctrl.is_open ? "rgba(255,255,255,0.02)" : "rgba(239,68,68,0.02)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>{meta.title}</h2>
                      {getStatusBadge(ctrl)}
                    </div>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 4 }}>{meta.description}</p>
                  </div>

                  {/* Toggle Switch */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: ctrl.is_open ? "#10b981" : "#ef4444" }}>
                      {ctrl.is_open ? "Portal Accepting Submissions" : "Submissions Suspended"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={ctrl.is_open}
                      onClick={() => handleFieldChange(ctrl.form_type, "is_open", !ctrl.is_open)}
                      style={{
                        width: 52,
                        height: 28,
                        borderRadius: 14,
                        background: ctrl.is_open ? "#10b981" : "#475569",
                        position: "relative",
                        border: "none",
                        cursor: "pointer",
                        transition: "background 0.2s ease",
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "#ffffff",
                          position: "absolute",
                          top: 3,
                          left: ctrl.is_open ? 27 : 3,
                          transition: "left 0.2s ease",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                        }}
                      />
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
                  {/* Closed Message */}
                  <div>
                    <label className="label" style={{ fontWeight: 600, marginBottom: 6, display: "block" }}>
                      Closed Notice Message (Displayed when closed or expired)
                    </label>
                    <input
                      className="input"
                      value={ctrl.closed_message || ""}
                      placeholder="e.g. Registrations are now closed for Supernova 3.0."
                      onChange={(e) => handleFieldChange(ctrl.form_type, "closed_message", e.target.value)}
                    />
                  </div>

                  {/* Opens At */}
                  <div>
                    <label className="label" style={{ fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <Calendar size={14} /> Scheduled Opening (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={formatForInput(ctrl.opens_at)}
                      onChange={(e) => handleFieldChange(ctrl.form_type, "opens_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
                    />
                  </div>

                  {/* Closes At */}
                  <div>
                    <label className="label" style={{ fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <Clock size={14} /> Scheduled Deadline (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={formatForInput(ctrl.closes_at)}
                      onChange={(e) => handleFieldChange(ctrl.form_type, "closes_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
                    />
                  </div>
                </div>

                {/* Editable Intro & Consent Text */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
                  <div>
                    <label className="label" style={{ fontWeight: 600, marginBottom: 6, display: "block" }}>
                      Form Introduction Text
                    </label>
                    <textarea
                      className="input"
                      rows={2}
                      value={ctrl.intro_text || ""}
                      placeholder="Describe what applicants will be registering for..."
                      onChange={(e) => handleFieldChange(ctrl.form_type, "intro_text", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" style={{ fontWeight: 600, marginBottom: 6, display: "block" }}>
                      Declaration & Consent Text
                    </label>
                    <textarea
                      className="input"
                      rows={2}
                      value={ctrl.consent_text || ""}
                      placeholder="Applicant agreement statement..."
                      onChange={(e) => handleFieldChange(ctrl.form_type, "consent_text", e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => handleSave(ctrl)}
                    disabled={isSaving}
                    className="btn btn-primary"
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}
                  >
                    <Save size={15} />
                    {isSaving ? "Saving Settings…" : `Save ${meta.title}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
