import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import type { ParticipationRegistration, RegistrationStatus } from "@/types/database";
import { 
  Search, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Download, 
  ChevronRight, 
  X, 
  Edit3, 
  Save 
} from "lucide-react";

export default function AdminParticipationRegistrations() {
  const [registrations, setRegistrations] = useState<ParticipationRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [selectedReg, setSelectedReg] = useState<ParticipationRegistration | null>(null);
  const [editNote, setEditNote] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("participation_registrations")
      .select("*")
      .order("submitted_at", { ascending: false });
    if (data) {
      setRegistrations(data as ParticipationRegistration[]);
    }
    setLoading(false);
  }, []);

  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [{ table: "participation_registrations", onRefresh: fetchRegistrations }],
    "admin-participation"
  );

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  const filteredRegistrations = useMemo(() => {
    return registrations.filter((reg) => {
      const matchesStatus = statusFilter === "all" || reg.status === statusFilter;
      const matchesArea = areaFilter === "all" || reg.participation_area.toLowerCase() === areaFilter.toLowerCase();
      const q = searchQuery.toLowerCase();
      const name = reg.full_name?.toLowerCase() || "";
      const proj = reg.project_title?.toLowerCase() || "";
      const inst = reg.institution?.toLowerCase() || "";
      const ref = reg.registration_ref?.toLowerCase() || "";
      const mail = reg.email?.toLowerCase() || "";

      const matchesSearch = 
        !q ||
        ref.includes(q) ||
        name.includes(q) ||
        proj.includes(q) ||
        inst.includes(q) ||
        mail.includes(q);

      return matchesStatus && matchesArea && matchesSearch;
    });
  }, [registrations, statusFilter, areaFilter, searchQuery]);

  const updateStatus = async (id: string, newStatus: RegistrationStatus) => {
    setIsUpdating(true);
    const { error } = await supabase
      .from("participation_registrations")
      .update({ status: newStatus, admin_notes: editNote })
      .eq("id", id);

    if (!error) {
      setRegistrations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newStatus, admin_notes: editNote } : r))
      );
      if (selectedReg && selectedReg.id === id) {
        setSelectedReg({ ...selectedReg, status: newStatus, admin_notes: editNote });
      }
    }
    setIsUpdating(false);
  };

  const handleExportCSV = () => {
    const headers = ["Ref ID", "Name", "Email", "Phone", "Institution", "Zone", "Project Title", "Team Size", "Status", "Date"];
    const rows = filteredRegistrations.map((r) => [
      r.registration_ref,
      `"${r.full_name}"`,
      r.email,
      r.phone,
      `"${r.institution || ""}"`,
      `"${r.participation_area}"`,
      `"${(r.project_title || "").replace(/"/g, '""')}"`,
      r.team_members_count,
      r.status,
      r.submitted_at,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `supernova_participation_registrations_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: RegistrationStatus) => {
    switch (status) {
      case "confirmed":
        return <span style={{ padding: "4px 10px", borderRadius: "999px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontSize: "0.75rem", fontWeight: 700 }}>Confirmed</span>;
      case "declined":
        return <span style={{ padding: "4px 10px", borderRadius: "999px", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontSize: "0.75rem", fontWeight: 700 }}>Declined</span>;
      case "correction_requested":
        return <span style={{ padding: "4px 10px", borderRadius: "999px", background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", fontSize: "0.75rem", fontWeight: 700 }}>Correction</span>;
      default:
        return <span style={{ padding: "4px 10px", borderRadius: "999px", background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", fontSize: "0.75rem", fontWeight: 700 }}>Pending</span>;
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>Participation Registrations</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            Review, allocate stalls, and manage Science Expo, School Exhibition, and Animation project entries.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />
          <button
            onClick={handleExportCSV}
            className="btn btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}
          >
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: 18, marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", flexGrow: 1 }}>
          <div style={{ position: "relative", minWidth: 260 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              className="input"
              style={{ paddingLeft: 36, height: 38, fontSize: "0.85rem" }}
              placeholder="Search reference, participant, or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="select"
            style={{ height: 38, fontSize: "0.85rem", width: "auto" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="declined">Declined</option>
            <option value="correction_requested">Correction Requested</option>
          </select>

          <select
            className="select"
            style={{ height: 38, fontSize: "0.85rem", width: "auto" }}
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
          >
            <option value="all">All Event Zones</option>
            <option value="Science Expo">Science Expo</option>
            <option value="School Kids' Exhibition">School Kids' Exhibition</option>
            <option value="Department of Animation Showcase">Animation Showcase</option>
          </select>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          Showing <strong>{filteredRegistrations.length}</strong> entries
        </p>
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600 }}>Ref ID</th>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600 }}>Lead Participant</th>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600 }}>Project / Exhibit</th>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600 }}>Zone</th>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "14px 18px", color: "var(--text-muted)", fontWeight: 600, textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
                    Loading participation records...
                  </td>
                </tr>
              ) : filteredRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
                    No participation registrations found.
                  </td>
                </tr>
              ) : (
                filteredRegistrations.map((reg) => (
                  <tr
                    key={reg.id}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onClick={() => {
                      setSelectedReg(reg);
                      setEditNote(reg.admin_notes || "");
                    }}
                  >
                    <td style={{ padding: "14px 18px", fontFamily: "monospace", color: "var(--cyan-400)", fontWeight: 700 }}>
                      {reg.registration_ref}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <p style={{ fontWeight: 600, color: "var(--text-primary)" }}>{reg.full_name}</p>
                      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{reg.institution || "Independent"}</p>
                    </td>
                    <td style={{ padding: "14px 18px", maxWidth: 220 }}>
                      <p style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {reg.project_title || "Untitled Project"}
                      </p>
                      <p style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>{reg.team_members_count} team members</p>
                    </td>
                    <td style={{ padding: "14px 18px", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                      {reg.participation_area}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      {getStatusBadge(reg.status)}
                    </td>
                    <td style={{ padding: "14px 18px", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      {new Date(reg.submitted_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                    </td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "4px 8px", fontSize: "0.8rem", color: "var(--cyan-400)" }}
                      >
                        Inspect <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Slide-Over Modal */}
      {selectedReg && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            justifyContent: "flex-end",
          }}
          onClick={() => setSelectedReg(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              background: "var(--navy-900)",
              height: "100%",
              overflowY: "auto",
              padding: 32,
              borderLeft: "1px solid var(--border-subtle)",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--cyan-400)", fontWeight: 700 }}>
                  {selectedReg.registration_ref}
                </span>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4 }}>Registration Details</h2>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setSelectedReg(null)}
                style={{ padding: 6, borderRadius: "50%" }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "grid", gap: 20, flexGrow: 1 }}>
              <div className="card" style={{ padding: 18 }}>
                <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Status</p>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => updateStatus(selectedReg.id, "confirmed")}
                    disabled={isUpdating}
                    className="btn"
                    style={{
                      background: selectedReg.status === "confirmed" ? "#10b981" : "rgba(16, 185, 129, 0.15)",
                      color: selectedReg.status === "confirmed" ? "#ffffff" : "#10b981",
                      fontSize: "0.8rem",
                      padding: "6px 14px",
                    }}
                  >
                    <CheckCircle2 size={14} /> Confirm Entry
                  </button>
                  <button
                    onClick={() => updateStatus(selectedReg.id, "correction_requested")}
                    disabled={isUpdating}
                    className="btn"
                    style={{
                      background: selectedReg.status === "correction_requested" ? "#f59e0b" : "rgba(245, 158, 11, 0.15)",
                      color: selectedReg.status === "correction_requested" ? "#ffffff" : "#f59e0b",
                      fontSize: "0.8rem",
                      padding: "6px 14px",
                    }}
                  >
                    <AlertCircle size={14} /> Request Correction
                  </button>
                  <button
                    onClick={() => updateStatus(selectedReg.id, "declined")}
                    disabled={isUpdating}
                    className="btn"
                    style={{
                      background: selectedReg.status === "declined" ? "#ef4444" : "rgba(239, 68, 68, 0.15)",
                      color: selectedReg.status === "declined" ? "#ffffff" : "#ef4444",
                      fontSize: "0.8rem",
                      padding: "6px 14px",
                    }}
                  >
                    <XCircle size={14} /> Decline
                  </button>
                </div>
              </div>

              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 12 }}>Participant Information</h3>
                <div style={{ display: "grid", gap: 10, fontSize: "0.88rem" }}>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Lead Name: </span>
                    <strong>{selectedReg.full_name}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Email: </span>
                    <a href={`mailto:${selectedReg.email}`} style={{ color: "var(--cyan-400)" }}>{selectedReg.email}</a>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Phone: </span>
                    <a href={`tel:${selectedReg.phone}`} style={{ color: "var(--cyan-400)" }}>{selectedReg.phone}</a>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Institution: </span>
                    <span>{selectedReg.institution || "Independent"}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Category: </span>
                    <span>{selectedReg.participant_category}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Team Size: </span>
                    <span>{selectedReg.team_members_count} members</span>
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 12 }}>Exhibit Details</h3>
                <div style={{ display: "grid", gap: 10, fontSize: "0.88rem" }}>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Zone: </span>
                    <strong style={{ color: "var(--cyan-400)" }}>{selectedReg.participation_area}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Project Title: </span>
                    <strong style={{ color: "var(--text-primary)" }}>{selectedReg.project_title || "Untitled"}</strong>
                  </div>
                  {selectedReg.project_description && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Description & Requirements:</span>
                      <p style={{ background: "rgba(0,0,0,0.25)", padding: 12, borderRadius: 8, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        {selectedReg.project_description}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="card" style={{ padding: 18 }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Edit3 size={15} /> Admin Notes & Stall Allocation
                </h3>
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder="e.g. Stall B-14 allocated, 230V AC socket verified..."
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  style={{ fontSize: "0.88rem" }}
                />
                <button
                  onClick={() => updateStatus(selectedReg.id, selectedReg.status)}
                  disabled={isUpdating}
                  className="btn btn-secondary"
                  style={{ marginTop: 10, fontSize: "0.8rem", width: "100%", justifyContent: "center" }}
                >
                  <Save size={14} /> Save Notes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
