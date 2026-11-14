import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRealtimeSubscription } from "@/lib/realtime/useRealtimeSubscription";
import { RealtimeConnectionBadge } from "@/lib/realtime/RealtimeConnectionBadge";
import { 
  Search, 
  CheckCircle, 
  XCircle, 
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
  const { user, hasPermission } = useAuth();
  const canViewVisitor = hasPermission("visitor:view");
  const canViewParticipation = hasPermission("participation:view");
  const canViewEsports = hasPermission("esports:view");
  const canEditVisitor = hasPermission("visitor:edit");
  const canEditParticipation = hasPermission("participation:edit");
  const canEditEsports = hasPermission("esports:edit");
  const canCreateWalkIn = hasPermission("visitor:create");

  const canModifyAttendee = (type: UnifiedAttendee["type"]) => {
    if (type === "visitor") return canEditVisitor;
    if (type === "participation") return canEditParticipation;
    return canEditEsports;
  };

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
      const [visRes, partRes, espRes, ciRes] = await Promise.all([
        canViewVisitor
          ? supabase.from("visitor_registrations").select("*").order("submitted_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        canViewParticipation
          ? supabase.from("participation_registrations").select("*").order("submitted_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        canViewEsports
          ? supabase.from("registrations").select("*").order("submitted_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("check_ins").select("*"),
      ]);

      const visitors = visRes.data || [];
      const participations = partRes.data || [];
      const esports = espRes.data || [];
      const checkins = ciRes.data || [];

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
  }, [canViewVisitor, canViewParticipation, canViewEsports]);

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
    if (!canModifyAttendee(attendee.type)) {
      setStatusMessage({ type: "error", text: "Access denied: Read-only permission for this track." });
      return;
    }
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
    if (!undoTarget || !canModifyAttendee(undoTarget.type)) return;
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
    if (!canCreateWalkIn) return;
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
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Entrance Operations
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight mt-1 mb-1">
            Entrance Check-in Desk
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Event-day check-in for festival passes, student exhibitors, and competitive esports squads.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <RealtimeConnectionBadge state={connectionState} lastEventTime={lastEventTime} />
          {canCreateWalkIn && (
            <button
              type="button"
              onClick={() => setWalkInOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Walk-in Pass</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setQrModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
          >
            <QrCode size={14} />
            <span>Scan QR</span>
          </button>
          <button
            type="button"
            onClick={fetchAttendees}
            title="Refresh Live Data"
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Live Counter Widget (SaaS Card) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
              TODAY'S ENTRANCE TOTALS (LIVE)
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl sm:text-4xl font-display font-black text-emerald-700 leading-none">
                {stats.totalCheckedIn}
              </span>
              <span className="text-sm font-semibold text-slate-500 font-mono">
                / {stats.totalExpected} Expected
              </span>
            </div>
          </div>

          {/* Breakdown Badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="bg-slate-50 border border-slate-200/80 px-3.5 py-2 rounded-xl">
              <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-blue-700">
                <Users size={12} /> Visitors
              </div>
              <p className="text-base font-extrabold text-slate-900 mt-0.5 m-0 font-display">
                {stats.visitorCheckedIn} / {stats.visitorExpected}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 px-3.5 py-2 rounded-xl">
              <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-purple-700">
                <Sparkles size={12} /> Projects
              </div>
              <p className="text-base font-extrabold text-slate-900 mt-0.5 m-0 font-display">
                {stats.projectCheckedIn} / {stats.projectExpected}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 px-3.5 py-2 rounded-xl">
              <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase text-amber-700">
                <Gamepad2 size={12} /> Esports Teams
              </div>
              <p className="text-base font-extrabold text-slate-900 mt-0.5 m-0 font-display">
                {stats.esportsCheckedIn} / {stats.esportsExpected}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Large Search Box */}
      <div className="relative">
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by attendee name, phone, or pass reference (e.g. SN3-VIS-205118)..."
          className="w-full h-14 pl-12 pr-10 text-base font-medium bg-white border-2 border-slate-200 focus:border-blue-600 rounded-2xl shadow-2xs text-slate-900 placeholder-slate-400 focus:outline-hidden transition-all"
        />
        <Search
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between border shadow-2xs ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMessage.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage(null)} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Results List */}
      <div>
        {searchQuery.trim() === "" ? (
          <div className="text-center py-12 px-6 bg-white border-2 border-dashed border-slate-200 rounded-2xl">
            <Search size={32} className="mx-auto mb-2 text-slate-400" />
            <h3 className="text-base font-bold text-slate-900">
              Ready for Gate Check-in
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Type any part of the visitor's name, phone number, or pass reference above to find their entry record.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 px-6 bg-rose-50/50 border border-rose-200 rounded-2xl">
            <XCircle size={32} className="mx-auto mb-2 text-rose-500" />
            <h3 className="text-base font-bold text-rose-900">
              No Registrations Found
            </h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto mt-1 mb-4">
              No pass matching "{searchQuery}". You can create an on-the-spot walk-in pass below.
            </p>
            {canCreateWalkIn && (
              <button
                type="button"
                onClick={() => {
                  setWalkInName(searchQuery);
                  setWalkInOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
              >
                <UserPlus size={14} />
                <span>Issue Walk-in Pass</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {filtered.map((attendee) => {
              const isConfirmed = attendee.status === "confirmed";

              return (
                <div
                  key={attendee.id}
                  className={`bg-white border rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                    attendee.checkedIn ? "border-emerald-400 bg-emerald-50/20" : "border-slate-200/90"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          attendee.type === "visitor"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : attendee.type === "participation"
                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {attendee.type === "visitor" ? "Visitor Pass" : attendee.type === "participation" ? "Project Exhibitor" : "Esports Team"}
                      </span>

                      <span className="text-xs font-mono font-bold text-slate-500">
                        {attendee.ref}
                      </span>

                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          isConfirmed ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
                        }`}
                      >
                        {attendee.status.toUpperCase()}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-slate-900 m-0 leading-snug">
                      {attendee.name}
                    </h3>

                    <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500 mt-1">
                      {attendee.institution && (
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <Building2 size={12} /> {attendee.institution}
                        </span>
                      )}
                      {attendee.phone && (
                        <span className="inline-flex items-center gap-1 font-mono text-slate-600">
                          <Phone size={12} /> {attendee.phone}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                        <Users size={12} /> Party Size: {attendee.count} {attendee.count > 1 ? "people" : "person"}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-1 m-0 font-mono">
                      {attendee.categoryOrGame}
                    </p>
                  </div>

                  {/* Actions & States */}
                  <div className="shrink-0">
                    {!isConfirmed ? (
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-center">
                        <p className="text-xs font-bold text-rose-800 m-0">NOT CONFIRMED</p>
                        <p className="text-[10px] text-slate-500 m-0">Event Admin review required</p>
                      </div>
                    ) : attendee.checkedIn ? (
                      <div className="flex flex-col sm:items-end gap-1.5">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs">
                          <CheckCircle size={15} className="text-emerald-600" />
                          <span>CHECKED IN {formatTime(attendee.checkedInAt)}</span>
                        </div>
                        {canModifyAttendee(attendee.type) && (
                          <button
                            type="button"
                            onClick={() => setUndoTarget(attendee)}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                          >
                            <RotateCcw size={11} /> Undo check-in
                          </button>
                        )}
                      </div>
                    ) : canModifyAttendee(attendee.type) ? (
                      <button
                        type="button"
                        onClick={() => handleCheckIn(attendee)}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
                      >
                        <CheckCircle size={16} />
                        <span>CHECK IN</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-mono">
                        Read-only
                      </span>
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
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setUndoTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">
                  Undo Gate Check-in?
                </h3>
                <p className="text-xs text-slate-500 m-0">Revert checked-in status</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed my-4">
              Are you sure you want to revert check-in for <strong className="text-slate-900 font-semibold">{undoTarget.name}</strong> ({undoTarget.ref})? Their status will be reverted to not checked in.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUndoTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmUndo}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
              >
                Yes, Undo Check-in
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Walk-in Modal */}
      {walkInOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setWalkInOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-slate-900 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 m-0">
                    Issue Walk-in Pass
                  </h3>
                  <p className="text-xs text-slate-500 m-0">Instant entrance generation for unannounced visitors</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWalkInOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleWalkInSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Party Size
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={walkInCount}
                    onChange={(e) => setWalkInCount(Number(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    School / Institution
                  </label>
                  <input
                    type="text"
                    value={walkInInstitution}
                    onChange={(e) => setWalkInInstitution(e.target.value)}
                    placeholder="Optional institution"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setWalkInOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={walkInSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <UserPlus size={14} />
                  <span>{walkInSubmitting ? "Generating Pass..." : "Confirm & Check In"}</span>
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
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 text-slate-900 text-center animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 border border-blue-100">
              <QrCode size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-900 m-0">
              Scan Pass or Enter Reference
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              Use a barcode/QR reader or paste the registration pass code below:
            </p>

            <div className="mb-4">
              <input
                type="text"
                autoFocus
                placeholder="e.g. SN3-VIS-205118"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono text-center tracking-wider"
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

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
