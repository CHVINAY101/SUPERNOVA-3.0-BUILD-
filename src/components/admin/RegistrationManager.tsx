import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LoadingBlock, EmptyState } from "@/components/PageLayout";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";

export const REGISTRATION_STATUSES = ["pending", "confirmed", "declined", "correction_requested"] as const;

export interface RegistrationRow {
  id: string;
  registration_ref: string;
  status: string;
  submitted_at: string;
  email: string;
  phone: string;
  institution: string | null;
  headline: string;
  details: string;
}

interface RegistrationManagerProps {
  title: string;
  table: "registrations" | "visitor_registrations";
  select: string;
  toRow: (raw: Record<string, unknown>) => RegistrationRow;
}

export function RegistrationManager({ title, table, select, toRow }: RegistrationManagerProps) {
  const [rows, setRows] = useState<RegistrationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: loadError } = await supabase
      .from(table)
      .select(select)
      .order("submitted_at", { ascending: false });
    if (loadError) {
      console.error(`${table} load failed`, loadError);
      setError("Registrations could not be loaded. Please refresh the page.");
      return;
    }
    setRows((data ?? []).map((item) => toRow(item as unknown as Record<string, unknown>)));
  }, [table, select, toRow]);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [{ table, onRefresh: load }],
    `admin-${table}`
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!needle) return true;
      return [row.registration_ref, row.headline, row.email, row.phone, row.institution ?? ""]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [rows, query, statusFilter]);

  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const changeStatus = async (row: RegistrationRow, status: string) => {
    setSavingId(row.id);
    setStatusMsg(null);
    const { error: updateError } = await supabase.from(table).update({ status }).eq("id", row.id);
    setSavingId(null);
    if (updateError) {
      console.error(`${table} status update failed`, updateError);
      setError("The status could not be saved. Please try again.");
      return;
    }
    setStatusMsg({ type: "success", text: `Saved. Reference ${row.registration_ref} updated to ${status.replace("_", " ")}.` });
    setRows((current) => current?.map((item) => (item.id === row.id ? { ...item, status } : item)) ?? null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />
      </div>
      <p style={{ color: "var(--ink-soft)", marginBottom: 20 }}>
        Review submissions, change approval statuses, and search by reference code, name, phone or institution.
      </p>

      {statusMsg && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: "0.88rem",
            fontWeight: 700,
            background: "rgba(16, 185, 129, 0.15)",
            border: "1.5px solid rgba(16, 185, 129, 0.35)",
            color: "#10b981",
          }}
        >
          {statusMsg.text}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <input className="input" type="search" placeholder="Search registrations" aria-label="Search registrations" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 360 }} />
        <select className="input" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="all">All statuses</option>
          {REGISTRATION_STATUSES.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
        </select>
      </div>

      {error && <p role="alert" style={{ color: "#b42318", marginBottom: 16 }}>{error}</p>}
      {rows === null && !error && <LoadingBlock />}
      {rows !== null && filtered.length === 0 && <EmptyState title="No registrations found" message="Submissions matching your search will appear here." />}

      {filtered.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: 12 }}>Reference</th>
                <th style={{ padding: 12 }}>Submitted</th>
                <th style={{ padding: 12 }}>Name</th>
                <th style={{ padding: 12 }}>Contact</th>
                <th style={{ padding: 12 }}>Details</th>
                <th style={{ padding: 12 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" }}>
                  <td style={{ padding: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{row.registration_ref}</td>
                  <td style={{ padding: 12, whiteSpace: "nowrap" }}>{new Date(row.submitted_at).toLocaleString()}</td>
                  <td style={{ padding: 12 }}>{row.headline}</td>
                  <td style={{ padding: 12, overflowWrap: "anywhere" }}>{row.email}<br />{row.phone}</td>
                  <td style={{ padding: 12 }}>{row.details}</td>
                  <td style={{ padding: 12 }}>
                    <select className="input" aria-label={`Status for ${row.registration_ref}`} value={row.status} disabled={savingId === row.id} onChange={(e) => changeStatus(row, e.target.value)} style={{ minWidth: 170 }}>
                      {REGISTRATION_STATUSES.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
