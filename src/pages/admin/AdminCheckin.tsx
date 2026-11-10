import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  UserCheck, 
  Users, 
  Gamepad2, 
  Sparkles, 
  RotateCcw, 
  UserPlus, 
  QrCode, 
  RefreshCw, 
  AlertTriangle,
  Building2,
  Phone,
  X
} from "lucide-react";

interface UnifiedAttendee {
  id: string;
  ref: string;
  name: string;
  phone: string;
  email: string;
  institution: string;
  type: "visitor" | "participation" | "esports";
  categoryOrGame: string;
  count: number;
  status: "confirmed" | "pending" | "declined" | "correction_requested";
  checkedIn: boolean;
  checkedInAt: string | null;
  checkedInBy: string | null;
  rawTable: "visitor_registrations" | "participation_registrations" | "registrations";
}

export default function AdminCheckin() {
  const { user } = useAuth();
  const [attendees, setAttendees] = useState<UnifiedAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState<UnifiedAttendee | null>(null);

  // Walk-in form state
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInEmail, setWalkInEmail] = useState("");
  const [walkInInstitution, setWalkInInstitution] = useState("");
  const [walkInCount, setWalkInCount] = useState(1);
  const [walkInSubmitting, setWalkInSubmitting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchAttendees = useCallback(async () => {
    try {
      // 1. Fetch visitor passes
      const { data: visitors } = await supabase
        .from("visitor_registrations")
        .select("*")
        .order("submitted_at", { ascending: false });

      // 2. Fetch participation projects
      const { data: participations } = await supabase
        .from("participation_registrations")
        .select("*")
        .order("submitted_at", { ascending: false });

      // 3. Fetch esports registrations
      const { data: esports } = await supabase
        .from("registrations")
        .select("*")
        .order("submitted_at", { ascending: false });

      // 4. Fetch check_ins records
      const { data: checkins } = await supabase.from("check_ins").select("*");

      const checkInMap = new Map<string, any>();
      (checkins || []).forEach((c) => {
        checkInMap.set(c.registration_id, c);
      });

      const list: UnifiedAttendee[] = [];

      (visitors || []).forEach((v) => {
        const ci = checkInMap.get(v.id) || checkInMap.get(v.registration_ref);
        list.push({
          id: v.id,
          ref: v.registration_ref,
          name: v.full_name,
          phone: v.phone || "",
          email: v.email || "",
          institution: v.institution || "Visitor",
          type: "visitor",
          categoryOrGame: v.visitor_category || "General Visitor",
          count: v.visitor_count || 1,
          status: v.status,
          checkedIn: Boolean(ci || v.checked_in || v.check_in_status === "checked_in"),
          checkedInAt: ci?.checked_in_at || v.checked_in_at || null,
          checkedInBy: ci?.checked_in_by || v.checked_in_by || null,
          rawTable: "visitor_registrations",
        });
      });

      (participations || []).forEach((p) => {
        const ci = checkInMap.get(p.id) || checkInMap.get(p.registration_ref);
        list.push({
          id: p.id,
          ref: p.registration_ref,
          name: p.full_name,
          phone: p.phone || "",
          email: p.email || "",
          institution: p.institution || "Participant",
          type: "participation",
          categoryOrGame: `${p.participation_area || "Project"} · ${p.project_title || "Exhibit"}`,
          count: p.team_members_count || 1,
          status: p.status,
          checkedIn: Boolean(ci || p.checked_in || p.check_in_status === "checked_in"),
          checkedInAt: ci?.checked_in_at || p.checked_in_at || null,
          checkedInBy: ci?.checked_in_by || p.checked_in_by || null,
          rawTable: "participation_registrations",
        });
      });

      (esports || []).forEach((e) => {
        const ci = checkInMap.get(e.id) || checkInMap.get(e.registration_ref);
        list.push({
          id: e.id,
          ref: e.registration_ref,
          name: `${e.team_name} (Captain: ${e.captain_name})`,
          phone: e.phone || "",
          email: e.email || "",
          institution: e.institution || "Esports Squad",
          type: "esports",
          categoryOrGame: e.game_id || "Esports",
          count: 5,
          status: e.status,
          checkedIn: Boolean(ci || e.checked_in || e.check_in_status === "checked_in"),
          checkedInAt: ci?.checked_in_at || e.checked_in_at || null,
          checkedInBy: ci?.checked_in_by || e.checked_in_by || null,
          rawTable: "registrations",
        });
      });

      setAttendees(list);
    } catch (err: any) {
      console.warn("Failed to load attendees:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Multi-table Realtime Subscription for Check-in Desk
  const { connectionState, lastEventTime } = useRealtimeSubscription(
    [
      { table: "check_ins", onRefresh: fetchAttendees },
      { table: "visitor_registrations", onRefresh: fetchAttendees },
      { table: "registrations", onRefresh: fetchAttendees },
      { table: "participation_registrations", onRefresh: fetchAttendees },
    ],
    "admin-checkin"
  );

  useEffect(() => {
    fetchAttendees();
    const interval = setInterval(fetchAttendees, 25000);
    return () => clearInterval(interval);
  }, [fetchAttendees]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Compute live counts
  const stats = useMemo(() => {
    let totalCheckedIn = 0;
    let totalExpected = 0;

    let visitorCheckedIn = 0;
    let visitorExpected = 0;

    let projectCheckedIn = 0;
    let projectExpected = 0;

    let esportsCheckedIn = 0;
    let esportsExpected = 0;

    attendees.forEach((a) => {
      const isConfirmed = a.status === "confirmed";
      if (!isConfirmed) return;

      totalExpected += a.count;
      if (a.checkedIn) totalCheckedIn += a.count;

      if (a.type === "visitor") {
        visitorExpected += a.count;
        if (a.checkedIn) visitorCheckedIn += a.count;
      } else if (a.type === "participation") {
        projectExpected += a.count;
        if (a.checkedIn) projectCheckedIn += a.count;
      } else if (a.type === "esports") {
        esportsExpected += 1;
        if (a.checkedIn) esportsCheckedIn += 1;
      }
    });

    return {
      totalCheckedIn,
      totalExpected,
      visitorCheckedIn,
      visitorExpected,
      projectCheckedIn,
      projectExpected,
      esportsCheckedIn,
      esportsExpected,
    };
  }, [attendees]);

  // Filter attendees by search query
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return attendees.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.phone.toLowerCase().includes(q) ||
        a.ref.toLowerCase().includes(q) ||
        a.institution.toLowerCase().includes(q)
    );
  }, [attendees, searchQuery]);

  // Perform Check-in action
  const handleCheckIn = async (attendee: UnifiedAttendee) => {
    setStatusMessage(null);
    const nowIso = new Date().toISOString();
    const actor = user?.email || "gate-staff@supernova.edu";

    try {
      // 1. Insert into check_ins table
      await supabase.from("check_ins").insert({
        registration_id: attendee.id,
        check_in_type: attendee.type === "esports" ? "team" : "individual",
        checked_in_by: actor,
        checked_in_at: nowIso,
        notes: `Checked in at gate entrance desk (${attendee.type})`,
      });

      // 2. Update record status in respective table
      await supabase.from(attendee.rawTable).update({
        check_in_status: "checked_in",
        checked_in_at: nowIso,
        checked_in_by: actor,
      }).eq("id", attendee.id);

      // Local optimistic update
      setAttendees((prev) =>
        prev.map((a) =>
          a.id === attendee.id
            ? { ...a, checkedIn: true, checkedInAt: nowIso, checkedInBy: actor }
            : a
        )
      );

      setStatusMessage({
        type: "success",
        text: `Checked in ${attendee.name} (${attendee.count} person${attendee.count > 1 ? "s" : ""})`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Check-in failed: ${err?.message || "Unknown error"}`,
      });
    }
  };

  // Undo Check-in action
  const confirmUndo = async () => {
    if (!undoTarget) return;
    setStatusMessage(null);

    try {
      await supabase.from("check_ins").delete().eq("registration_id", undoTarget.id);

      await supabase.from(undoTarget.rawTable).update({
        check_in_status: "not_checked_in",
        checked_in_at: null,
        checked_in_by: null,
      }).eq("id", undoTarget.id);

      setAttendees((prev) =>
        prev.map((a) =>
          a.id === undoTarget.id
            ? { ...a, checkedIn: false, checkedInAt: null, checkedInBy: null }
            : a
        )
      );

      setStatusMessage({
        type: "success",
        text: `Check-in reversed for ${undoTarget.name}`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Undo failed: ${err?.message || "Error"}`,
      });
    } finally {
      setUndoTarget(null);
    }
  };

  // Walk-in Registration & Immediate Check-in
  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInName.trim()) return;

    setWalkInSubmitting(true);
    setStatusMessage(null);

    try {
      const ref = `SN3-VIS-WALK-${Math.floor(100000 + Math.random() * 900000)}`;
      const nowIso = new Date().toISOString();
      const actor = user?.email || "gate-staff@supernova.edu";

      const newVisitor = {
        registration_ref: ref,
        full_name: walkInName.trim(),
        phone: walkInPhone.trim() || "+91 00000 00000",
        email: walkInEmail.trim() || "walkin@supernova.org",
        institution: walkInInstitution.trim() || "Walk-in Guest",
        visitor_category: "General visitor",
        visitor_count: walkInCount,
        status: "confirmed",
        admin_notes: `On-the-spot walk-in registration at Gate Desk by ${actor}`,
        check_in_status: "checked_in",
        checked_in_at: nowIso,
        checked_in_by: actor,
        submitted_at: nowIso,
      };

      const { data: inserted, error } = await supabase.from("visitor_registrations").insert(newVisitor).select();
      if (error) throw error;

      const newId = Array.isArray(inserted) ? inserted[0]?.id : (inserted as any)?.id || `vis-walk-${Date.now()}`;

      // Insert check-in log
      await supabase.from("check_ins").insert({
        registration_id: newId,
        check_in_type: "individual",
        checked_in_by: actor,
        checked_in_at: nowIso,
        notes: `On-the-spot walk-in pass (${walkInCount} person${walkInCount > 1 ? "s" : ""})`,
      });

      // Optimistic prepend
      const newAttendee: UnifiedAttendee = {
        id: newId,
        ref,
        name: walkInName.trim(),
        phone: walkInPhone.trim(),
        email: walkInEmail.trim(),
        institution: walkInInstitution.trim() || "Walk-in Guest",
        type: "visitor",
        categoryOrGame: "Walk-in Visitor",
        count: walkInCount,
        status: "confirmed",
        checkedIn: true,
        checkedInAt: nowIso,
        checkedInBy: actor,
        rawTable: "visitor_registrations",
      };

      setAttendees((prev) => [newAttendee, ...prev]);
      setSearchQuery(ref);

      setStatusMessage({
        type: "success",
        text: `Walk-in registered & checked in! Pass Ref: ${ref} (${walkInCount} people)`,
      });

      // Reset form
      setWalkInName("");
      setWalkInPhone("");
      setWalkInEmail("");
      setWalkInInstitution("");
      setWalkInCount(1);
      setWalkInOpen(false);
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: `Walk-in creation failed: ${err?.message || "Error"}`,
      });
    } finally {
      setWalkInSubmitting(false);
    }
  };

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoString;
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", paddingBottom: 60 }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(16, 185, 129, 0.15)", color: "#10b981", display: "grid", placeItems: "center" }}>
              <UserCheck size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Entrance Check-in Desk
            </h1>
          </div>
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginTop: 6 }}>
            Event-day check-in for festival passes, student exhibitors, and competitive esports squads.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} variant="dark" />
          <button
            onClick={() => setWalkInOpen(true)}
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", fontSize: "0.9rem", fontWeight: 700 }}
          >
            <UserPlus size={16} /> Walk-in Pass
          </button>
          <button
            onClick={() => setQrModalOpen(true)}
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", fontSize: "0.9rem" }}
          >
            <QrCode size={16} /> Scan QR
          </button>
          <button
            onClick={fetchAttendees}
            title="Refresh Live Data"
            className="btn btn-ghost"
            style={{ padding: "10px" }}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Live Counter Widget (Refreshes every 15s) */}
      <div
        style={{
          background: "rgba(23, 23, 27, 0.6)",
          border: "1.5px solid var(--border-subtle)",
          borderRadius: 16,
          padding: "18px 24px",
          marginBottom: 24,
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <p style={{ fontSize: "0.74rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cyan-400)" }}>
              TODAY'S ENTRANCE TOTALS (LIVE)
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: "2.4rem", fontWeight: 900, fontFamily: "var(--font-display)", color: "#10b981", lineHeight: 1 }}>
                {stats.totalCheckedIn}
              </span>
              <span style={{ fontSize: "1.1rem", color: "var(--text-muted)", fontWeight: 600 }}>
                / {stats.totalExpected} Expected
              </span>
            </div>
          </div>

          {/* Breakdown badges */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ background: "rgba(255,255,255,0.04)", padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "#38bdf8", fontWeight: 700 }}>
                <Users size={12} /> Visitors
              </div>
              <p style={{ fontSize: "1.1rem", fontWeight: 800, margin: "2px 0 0", color: "#ffffff" }}>
                {stats.visitorCheckedIn} / {stats.visitorExpected}
              </p>
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "#a855f7", fontWeight: 700 }}>
                <Sparkles size={12} /> Projects
              </div>
              <p style={{ fontSize: "1.1rem", fontWeight: 800, margin: "2px 0 0", color: "#ffffff" }}>
                {stats.projectCheckedIn} / {stats.projectExpected}
              </p>
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--coral)", fontWeight: 700 }}>
                <Gamepad2 size={12} /> Esports Teams
              </div>
              <p style={{ fontSize: "1.1rem", fontWeight: 800, margin: "2px 0 0", color: "#ffffff" }}>
                {stats.esportsCheckedIn} / {stats.esportsExpected}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Huge Search Box (Autofocus) */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by attendee name, phone, or pass reference (e.g. SN3-VIS-205118)..."
          style={{
            width: "100%",
            padding: "18px 24px 18px 56px",
            fontSize: "1.15rem",
            fontWeight: 600,
            background: "rgba(15, 23, 42, 0.8)",
            border: "2px solid var(--border-subtle)",
            borderRadius: 14,
            color: "#ffffff",
            outline: "none",
            boxShadow: "0 4px 18px rgba(0,0,0,0.25)",
            transition: "border-color 0.2s ease",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--cyan-400)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border-subtle)")}
        />
        <Search
          size={24}
          color="var(--cyan-400)"
          style={{
            position: "absolute",
            left: 20,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            style={{
              position: "absolute",
              right: 18,
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: 0,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          style={{
            padding: "14px 20px",
            borderRadius: 12,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: "0.95rem",
            fontWeight: 700,
            background: statusMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1.5px solid ${statusMessage.type === "success" ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
            color: statusMessage.type === "success" ? "#10b981" : "#ef4444",
          }}
        >
          {statusMessage.type === "success" ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Results List */}
      <div>
        {searchQuery.trim() === "" ? (
          <div
            style={{
              textAlign: "center",
              padding: "48px 24px",
              background: "rgba(255,255,255,0.02)",
              borderRadius: 16,
              border: "1.5px dashed var(--border-subtle)",
            }}
          >
            <Search size={36} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Ready for Gate Check-in
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", maxWidth: 440, margin: "8px auto 0" }}>
              Type any part of the visitor's name, phone number, or pass reference above to find their entry record.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 24px",
              background: "rgba(239, 68, 68, 0.05)",
              borderRadius: 16,
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <XCircle size={36} color="#ef4444" style={{ margin: "0 auto 12px" }} />
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#f87171" }}>
              No Registrations Found
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: "8px auto 16px" }}>
              No pass matching "{searchQuery}". You can create an on-the-spot walk-in pass below.
            </p>
            <button
              onClick={() => {
                setWalkInName(searchQuery);
                setWalkInOpen(true);
              }}
              className="btn btn-primary"
              style={{ padding: "8px 20px" }}
            >
              <UserPlus size={16} /> Issue Walk-in Pass
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {filtered.map((attendee) => {
              const isConfirmed = attendee.status === "confirmed";

              return (
                <div
                  key={attendee.id}
                  style={{
                    background: "rgba(23, 23, 27, 0.8)",
                    border: `1.5px solid ${attendee.checkedIn ? "#10b981" : "var(--border-subtle)"}`,
                    borderRadius: 14,
                    padding: "20px 24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 16,
                    boxShadow: "0 6px 18px rgba(0,0,0,0.15)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          padding: "3px 10px",
                          borderRadius: 9999,
                          letterSpacing: "0.06em",
                          background:
                            attendee.type === "visitor"
                              ? "rgba(56, 189, 248, 0.15)"
                              : attendee.type === "participation"
                              ? "rgba(168, 85, 247, 0.15)"
                              : "rgba(240, 120, 85, 0.15)",
                          color:
                            attendee.type === "visitor"
                              ? "#38bdf8"
                              : attendee.type === "participation"
                              ? "#a855f7"
                              : "var(--coral)",
                        }}
                      >
                        {attendee.type === "visitor" ? "Visitor Pass" : attendee.type === "participation" ? "Project Exhibitor" : "Esports Team"}
                      </span>

                      <span style={{ fontSize: "0.82rem", fontFamily: "monospace", color: "var(--text-muted)" }}>
                        {attendee.ref}
                      </span>

                      <span
                        style={{
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: isConfirmed ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: isConfirmed ? "#10b981" : "#f87171",
                        }}
                      >
                        {attendee.status.toUpperCase()}
                      </span>
                    </div>

                    <h3 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)", margin: "8px 0 4px" }}>
                      {attendee.name}
                    </h3>

                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 6 }}>
                      {attendee.institution && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <Building2 size={13} /> {attendee.institution}
                        </span>
                      )}
                      {attendee.phone && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <Phone size={13} /> {attendee.phone}
                        </span>
                      )}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700, color: "#ffffff" }}>
                        <Users size={13} /> Party Size: {attendee.count} {attendee.count > 1 ? "people" : "person"}
                      </span>
                    </div>

                    <p style={{ fontSize: "0.78rem", color: "var(--text-faint)", marginTop: 4 }}>
                      {attendee.categoryOrGame}
                    </p>
                  </div>

                  {/* Actions & States */}
                  <div>
                    {!isConfirmed ? (
                      <div
                        style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.25)",
                          borderRadius: 8,
                          padding: "10px 16px",
                          textAlign: "center",
                        }}
                      >
                        <p style={{ fontSize: "0.82rem", fontWeight: 800, color: "#f87171", margin: 0 }}>
                          NOT CONFIRMED
                        </p>
                        <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", margin: "2px 0 0" }}>
                          Ask Event Admin to review
                        </p>
                      </div>
                    ) : attendee.checkedIn ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                        <div
                          style={{
                            background: "rgba(16, 185, 129, 0.15)",
                            border: "1.5px solid #10b981",
                            borderRadius: 10,
                            padding: "8px 16px",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            color: "#10b981",
                            fontWeight: 800,
                            fontSize: "0.92rem",
                          }}
                        >
                          <CheckCircle size={18} />
                          <span>ALREADY CHECKED IN {formatTime(attendee.checkedInAt)}</span>
                        </div>
                        <button
                          onClick={() => setUndoTarget(attendee)}
                          style={{
                            background: "transparent",
                            border: 0,
                            color: "var(--text-muted)",
                            fontSize: "0.78rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            cursor: "pointer",
                            padding: "2px 4px",
                          }}
                        >
                          <RotateCcw size={12} /> Undo check-in
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCheckIn(attendee)}
                        className="btn"
                        style={{
                          background: "#10b981",
                          color: "#ffffff",
                          borderColor: "#10b981",
                          padding: "14px 28px",
                          fontSize: "1.05rem",
                          fontWeight: 800,
                          borderRadius: 10,
                          boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                          cursor: "pointer",
                        }}
                      >
                        <CheckCircle size={20} /> CHECK IN
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Undo Confirm Modal */}
      {undoTarget && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setUndoTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--navy-900)",
              border: "1.5px solid var(--border-subtle)",
              borderRadius: 16,
              padding: 28,
              maxWidth: 440,
              width: "100%",
            }}
          >
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
              Undo Check-in?
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5, margin: "12px 0 20px" }}>
              Are you sure you want to revert check-in for <strong>{undoTarget.name}</strong>? Their status will be set back to not checked in.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setUndoTarget(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={confirmUndo}
                className="btn btn-ghost"
                style={{ color: "#ef4444", borderColor: "#ef4444" }}
              >
                Yes, Undo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Walk-in Modal */}
      {walkInOpen && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setWalkInOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--navy-900)",
              border: "1.5px solid var(--border-subtle)",
              borderRadius: 18,
              padding: 30,
              maxWidth: 480,
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
                  <UserPlus size={20} />
                </div>
                <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                  Issue Walk-in Pass
                </h3>
              </div>
              <button onClick={() => setWalkInOpen(false)} style={{ background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="Visitor full name"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Number of People
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={walkInCount}
                    onChange={(e) => setWalkInCount(Number(e.target.value) || 1)}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                    Institution / School
                  </label>
                  <input
                    type="text"
                    value={walkInInstitution}
                    onChange={(e) => setWalkInInstitution(e.target.value)}
                    placeholder="Optional institution"
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 8, display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setWalkInOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={walkInSubmitting}
                  className="btn btn-primary"
                  style={{ fontWeight: 800 }}
                >
                  {walkInSubmitting ? "Generating Pass..." : "Confirm & Check In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Scanner / Manual Code Dialog */}
      {qrModalOpen && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setQrModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--navy-900)",
              border: "1.5px solid var(--border-subtle)",
              borderRadius: 18,
              padding: 28,
              maxWidth: 440,
              width: "100%",
              textAlign: "center",
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
              <QrCode size={30} />
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#ffffff" }}>
              Scan Registration Pass QR
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6, lineHeight: 1.5 }}>
              Use your device camera scanner or type the pass code below:
            </p>

            <div style={{ margin: "20px 0" }}>
              <input
                type="text"
                placeholder="Paste or type pass reference (e.g. SN3-VIS-205118)"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.3)",
                  border: "1.5px solid var(--border-subtle)",
                  color: "#ffffff",
                  fontSize: "1rem",
                  fontFamily: "monospace",
                  textAlign: "center",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) {
                      setSearchQuery(val);
                      setQrModalOpen(false);
                    }
                  }
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setQrModalOpen(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
