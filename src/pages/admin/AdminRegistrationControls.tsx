import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { RegistrationControl } from "@/types/database";
import { CheckCircle2, AlertCircle, Save, Calendar, Clock, RefreshCw, X } from "lucide-react";

interface FormMeta {
  title: string;
  badgeLabel: string;
  description: string;
}

const META_MAP: Record<string, FormMeta> = {
  participation: {
    title: "Project & Exhibit Registration",
    badgeLabel: "Science Expo & Stalls",
    description: "For student innovators, research stalls, school inventors, and animators.",
  },
  visitor: {
    title: "General Visitor Registration",
    badgeLabel: "Visitor Passes",
    description: "Free campus admission passes for students, educators, families, and visitors.",
  },
  esports: {
    title: "Esports Squad Registration",
    badgeLabel: "Tournament Roster",
    description: "Collegiate championship rosters in VALORANT (5p), FREE FIRE (4p), and BGMI (4p).",
  },
};

export default function AdminRegistrationControls() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("system_settings:manage");

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
    if (!canManage) return;
    setControls((prev) =>
      prev.map((c) => (c.form_type === formType ? { ...c, [field]: value } : c))
    );
  };

  const handleSave = async (control: RegistrationControl) => {
    if (!canManage) {
      setStatusMsg({ type: "error", text: "You do not have permission to update registration controls." });
      return;
    }
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
        setStatusMsg({ type: "success", text: `${META_MAP[control.form_type]?.title || control.form_type} settings saved successfully.` });
        setTimeout(() => setStatusMsg(null), 4000);
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
        <span className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          CLOSED
        </span>
      );
    }
    if (ctrl.opens_at && now < new Date(ctrl.opens_at)) {
      return (
        <span className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          SCHEDULED (Opens Soon)
        </span>
      );
    }
    if (ctrl.closes_at && now > new Date(ctrl.closes_at)) {
      return (
        <span className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          EXPIRED
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
        OPEN & ACTIVE
      </span>
    );
  };

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Operations Control
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            Registration Stream Controls
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Open or close submission portals, configure scheduling dates, and customize notices.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchControls}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer self-start md:self-auto"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between border shadow-2xs ${
            statusMsg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMsg(null)} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-500 font-mono">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
          Loading registration controls...
        </div>
      ) : (
        <div className="space-y-5">
          {controls.map((ctrl) => {
            const meta = META_MAP[ctrl.form_type] || {
              title: ctrl.form_type.toUpperCase(),
              badgeLabel: ctrl.form_type,
              description: "",
            };
            const isSaving = savingKey === ctrl.form_type;

            return (
              <div
                key={ctrl.form_type}
                className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-5"
              >
                {/* Title & Master Toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 m-0">
                        {meta.title}
                      </h2>
                      {getStatusBadge(ctrl)}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 m-0">
                      {meta.description}
                    </p>
                  </div>

                  {/* Accessible Pill Toggle */}
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold ${ctrl.is_open ? "text-emerald-700" : "text-rose-700"}`}>
                      {ctrl.is_open ? "Accepting Submissions" : "Submissions Closed"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={ctrl.is_open}
                      disabled={!canManage}
                      onClick={() => handleFieldChange(ctrl.form_type, "is_open", !ctrl.is_open)}
                      className={`w-12 h-6 rounded-full relative transition-colors border disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                        ctrl.is_open ? "bg-emerald-600 border-emerald-600" : "bg-slate-300 border-slate-400"
                      }`}
                    >
                      <span
                        className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                          ctrl.is_open ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Form Schedule & Closed Message */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Closed Notice Message
                    </label>
                    <input
                      type="text"
                      disabled={!canManage}
                      value={ctrl.closed_message || ""}
                      placeholder="e.g. Registrations are currently closed."
                      onChange={(e) => handleFieldChange(ctrl.form_type, "closed_message", e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-blue-500 text-xs disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 flex items-center gap-1 mb-1">
                      <Calendar size={13} /> Scheduled Opening (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      disabled={!canManage}
                      value={formatForInput(ctrl.opens_at)}
                      onChange={(e) => handleFieldChange(ctrl.form_type, "opens_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-blue-500 text-xs font-mono disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 flex items-center gap-1 mb-1">
                      <Clock size={13} /> Scheduled Deadline (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      disabled={!canManage}
                      value={formatForInput(ctrl.closes_at)}
                      onChange={(e) => handleFieldChange(ctrl.form_type, "closes_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-blue-500 text-xs font-mono disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Save Button */}
                {canManage && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => handleSave(ctrl)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Save size={13} />
                      <span>{isSaving ? "Saving..." : "Save Settings"}</span>
                    </button>
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
