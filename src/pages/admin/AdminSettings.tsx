import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase, getSupabaseConnectionInfo } from "@/lib/supabase";
import type { EventSetting } from "@/types/database";
import { Settings, ExternalLink, CheckCircle, AlertCircle, Database, RefreshCw, Key, Copy, Check } from "lucide-react";

export default function AdminSettings() {
  const [settings, setSettings] = useState<EventSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchSettings = useCallback(() => {
    supabase
      .from("event_settings")
      .select("*")
      .order("category", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setSettings(data as EventSetting[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = async (id: string, field: keyof EventSetting, value: string | boolean) => {
    setSaving(id);
    setStatusMsg(null);
    const update: Record<string, string | boolean | null> = {};
    update[field] = value;
    const { error } = await supabase.from("event_settings").update(update).eq("id", id);
    setSaving(null);
    if (error) {
      setStatusMsg({ type: "error", text: error.message });
    } else {
      setStatusMsg({ type: "success", text: "Saved. This is now live on the website." });
      fetchSettings();
    }
  };

  const connInfo = getSupabaseConnectionInfo();
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);

  const testSupabaseConnection = async () => {
    setTestingConn(true);
    setConnResult(null);
    try {
      const { data, error } = await supabase.from("event_settings").select("id").limit(1);
      if (error) {
        setConnResult({
          success: false,
          message: `Query error: ${error.message}. Make sure tables are migrated by running supabase/00_FULL_SETUP.sql in Supabase SQL editor.`,
        });
      } else {
        setConnResult({
          success: true,
          message: connInfo.isConfigured
            ? `Connected to remote Supabase instance! Checked query successfully (${data ? data.length : 0} record found).`
            : "In-memory database stub is active and operational (Demo Mode). Add credentials in .env to connect live.",
        });
      }
    } catch (err: any) {
      setConnResult({
        success: false,
        message: `Connection test error: ${err.message || String(err)}`,
      });
    } finally {
      setTestingConn(false);
    }
  };

  const categories = [...new Set(settings.map((s) => s.category))];

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
              <Settings size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Event Details & Settings
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            Manage official festival dates, campus venue address, contact emails, and helpline numbers.
          </p>
        </div>

        <Link
          to="/"
          target="_blank"
          rel="noreferrer"
          className="btn btn-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
        >
          <span>View on website</span> <ExternalLink size={13} />
        </Link>
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

      {/* Supabase Connection Status & Configuration Card */}
      <div
        className="card"
        style={{
          padding: 24,
          marginBottom: 32,
          border: connInfo.isConfigured ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(245, 158, 11, 0.3)",
          background: connInfo.isConfigured ? "rgba(16, 185, 129, 0.03)" : "rgba(245, 158, 11, 0.03)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: connInfo.isConfigured ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                color: connInfo.isConfigured ? "#10b981" : "#d97706",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Database size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  Supabase Database Connection
                </h2>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "3px 8px",
                    borderRadius: 9999,
                    background: connInfo.isConfigured ? "rgba(16, 185, 129, 0.18)" : "rgba(245, 158, 11, 0.18)",
                    color: connInfo.isConfigured ? "#059669" : "#b45309",
                    border: connInfo.isConfigured ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(245, 158, 11, 0.3)",
                  }}
                >
                  {connInfo.isConfigured ? "Live Cloud Connected" : "In-Memory Demo Stub"}
                </span>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", margin: "4px 0 0" }}>
                {connInfo.isConfigured
                  ? `Active connection target: ${connInfo.url}`
                  : "Currently running with local deterministic in-memory store so all features work out-of-the-box."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={testSupabaseConnection}
            disabled={testingConn}
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}
          >
            <RefreshCw size={14} className={testingConn ? "animate-spin" : ""} />
            <span>{testingConn ? "Testing..." : "Test Connection"}</span>
          </button>
        </div>

        {/* Test Result Message */}
        {connResult && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: "0.85rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: connResult.success ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
              color: connResult.success ? "#059669" : "#dc2626",
            }}
          >
            {connResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{connResult.message}</span>
          </div>
        )}

        {/* Step-by-Step Connection Instructions */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.03)",
            border: "1px solid rgba(0, 0, 0, 0.06)",
            borderRadius: 10,
            padding: "16px 18px",
            fontSize: "0.85rem",
            color: "var(--text-primary)",
          }}
        >
          <p style={{ fontWeight: 700, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
            <Key size={14} color="#4549D8" /> How to connect your remote Supabase project:
          </p>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, lineHeight: 1.5 }}>
            <li>
              Create a free project at{" "}
              <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ color: "#4549D8", textDecoration: "underline", fontWeight: 600 }}>
                supabase.com
              </a>.
            </li>
            <li>
              In your Supabase project, go to <strong>Project Settings → API</strong> and copy your <strong>Project URL</strong> and <strong>anon / public key</strong>.
            </li>
            <li>
              Open the <code>.env</code> file in this app root and paste your values:
              <div
                style={{
                  background: "#151535",
                  color: "#D5F542",
                  padding: "10px 14px",
                  borderRadius: 6,
                  fontFamily: "monospace",
                  fontSize: "0.78rem",
                  marginTop: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  VITE_SUPABASE_URL=https://&lt;your-project&gt;.supabase.co<br />
                  VITE_SUPABASE_ANON_KEY=eyJ...<br />
                  VITE_USE_MOCK=false
                </span>
              </div>
            </li>
            <li>
              In the Supabase Dashboard, open the <strong>SQL Editor</strong> and execute the consolidated migration script:
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 6,
                }}
              >
                <code style={{ background: "#EAEAF2", padding: "4px 8px", borderRadius: 4, fontWeight: 700, color: "#151535" }}>
                  supabase/00_FULL_SETUP.sql
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText("supabase/00_FULL_SETUP.sql");
                    setCopiedPath(true);
                    setTimeout(() => setCopiedPath(false), 2000);
                  }}
                  className="btn btn-secondary"
                  style={{ padding: "3px 8px", fontSize: "0.72rem", height: "auto" }}
                >
                  {copiedPath ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  <span>{copiedPath ? "Copied path" : "Copy path"}</span>
                </button>
              </div>
              <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", display: "block", marginTop: 4 }}>
                This script safely provisions all 14 database tables, RLS security policies, audit triggers, check-in functions, and initial festival categories.
              </span>
            </li>
          </ol>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <div className="loading-spinner" />
        </div>
      ) : categories.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            No event settings found.
          </p>
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: 12, color: "var(--cyan-400)", textTransform: "capitalize" }}>
              {cat.replace("_", " ")}
            </h2>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {settings
                .filter((s) => s.category === cat)
                .map((setting, idx, arr) => (
                  <div
                    key={setting.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(180px, 1fr) 2fr auto",
                      gap: 16,
                      alignItems: "center",
                      padding: "16px 20px",
                      borderBottom: idx < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}
                  >
                    <div>
                      <p style={{ fontSize: "0.92rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>{setting.label}</p>
                      <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", margin: "2px 0 0" }}>{setting.key}</p>
                    </div>
                    <input
                      className="input"
                      value={setting.value ?? ""}
                      placeholder="To be announced"
                      onChange={(e) => {
                        const updated = settings.map((s) => (s.id === setting.id ? { ...s, value: e.target.value } : s));
                        setSettings(updated);
                      }}
                      onBlur={(e) => updateSetting(setting.id, "value", e.target.value)}
                      style={{ padding: "8px 12px", fontSize: "0.9rem" }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={setting.is_published}
                        onChange={(e) => updateSetting(setting.id, "is_published", e.target.checked)}
                      />
                      <span style={{ fontSize: "0.82rem", color: setting.is_published ? "#10b981" : "var(--text-muted)", fontWeight: 600 }}>
                        {saving === setting.id ? "Saving..." : setting.is_published ? "Live" : "Draft"}
                      </span>
                    </label>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
