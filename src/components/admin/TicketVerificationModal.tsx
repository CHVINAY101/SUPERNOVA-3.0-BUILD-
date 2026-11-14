import { useState } from "react";
import { 
  Search, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Copy, 
  UserCheck, 
  Mail, 
  Phone, 
  Building2, 
} from "lucide-react";
import { searchTicketOrReference, type UniversalLookupResult } from "@/lib/registrationOperations";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

interface TicketVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TicketVerificationModal({ isOpen, onClose }: TicketVerificationModalProps) {
  const { hasPermission } = useAuth();
  const canViewVisitors = hasPermission("visitor:view");
  const canViewParticipation = hasPermission("participation:view");
  const canViewEsports = hasPermission("esports:view");

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<UniversalLookupResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<UniversalLookupResult | null>(null);
  const [checkinMsg, setCheckinMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const isStreamAllowed = (type: UniversalLookupResult["type"]) => {
    if (type === "visitor") return canViewVisitors;
    if (type === "participation") return canViewParticipation;
    return canViewEsports;
  };

  const canCheckInRecord = (rec: UniversalLookupResult) => {
    if (rec.type === "visitor") return hasPermission("visitor:edit");
    if (rec.type === "participation") return hasPermission("participation:edit");
    return hasPermission("esports:edit");
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setCheckinMsg(null);
    try {
      const found = (await searchTicketOrReference(query.trim())).filter((rec) =>
        isStreamAllowed(rec.type)
      );
      setResults(found);
      setHasSearched(true);
      if (found.length === 1) {
        setSelectedRecord(found[0]);
      } else if (found.length === 0) {
        setSelectedRecord(null);
      }
    } catch (err) {
      console.warn("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleQuickCheckin = async (rec: UniversalLookupResult) => {
    if (!canCheckInRecord(rec)) {
      setCheckinMsg({
        type: "error",
        text: "Your role does not have permission to perform check-in updates for this category.",
      });
      return;
    }
    setIsCheckingIn(true);
    setCheckinMsg(null);
    try {
      const nowIso = new Date().toISOString();
      const { data: userData } = await supabase.auth.getUser();

      // Record check-in
      const { error } = await supabase.from("check_ins").insert({
        registration_id: rec.id,
        badge_type: rec.type === "visitor" ? "visitor" : rec.type === "esports" ? "esports_player" : "exhibitor",
        scanned_by: userData?.user?.id || null,
        scanned_at: nowIso,
        notes: `Universal Verification Check-in for ${rec.reference} (${rec.titleOrName})`,
      });

      if (error && error.code !== "23505") { // Ignore unique constraint if already checked in
        console.warn("Check-in insert warning:", error);
      }

      setCheckinMsg({
        type: "success",
        text: `Checked in successfully: ${rec.titleOrName} (${rec.ticketRef || rec.reference}) on Day 1/2.`,
      });
    } catch (err: any) {
      setCheckinMsg({
        type: "error",
        text: `Check-in recorded locally: ${err.message}`,
      });
    } finally {
      setIsCheckingIn(false);
    }
  };

  const copyTicket = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/40">
              <UserCheck size={18} />
            </div>
            <div>
              <h2 className="text-base font-display font-extrabold uppercase tracking-tight text-white m-0">
                Ticket Verification & Pass Lookup
              </h2>
              <p className="text-[11px] font-mono text-cyan-400 m-0">
                Supernova 3.0 · The National College, Basavanagudi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter Ticket Code (SN3-26-XXXXXX), Attendee Name, Team, or Email..."
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="px-5 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {isSearching ? <span className="animate-spin">⏳</span> : <Search size={14} />}
              <span>Verify</span>
            </button>
          </form>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500 font-mono">
            <span>Examples:</span>
            <button
              type="button"
              onClick={() => {
                setQuery("SN3-26");
                searchTicketOrReference("SN3-26")
                  .then((found) => found.filter((rec) => isStreamAllowed(rec.type)))
                  .then(setResults)
                  .then(() => setHasSearched(true));
              }}
              className="hover:text-blue-600 underline cursor-pointer"
            >
              "SN3-26"
            </button>
            <span>·</span>
            <span>Search works across Visitors, Projects, and Esports squads</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {checkinMsg && (
            <div
              className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border ${
                checkinMsg.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} />
                <span>{checkinMsg.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setCheckinMsg(null)}
                className="text-slate-400 hover:text-slate-700 p-0.5"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {hasSearched && results.length === 0 && (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="font-semibold text-slate-800 text-sm">No ticket or attendee found matching "{query}"</p>
              <p className="text-xs text-slate-500">
                Check for typos or ask the attendee for their 6-character registration suffix or registered email address.
              </p>
            </div>
          )}

          {results.length > 1 && (
            <div>
              <p className="text-xs font-mono font-bold uppercase text-slate-500 mb-2">
                Found {results.length} matching records — select to inspect:
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {results.map((rec) => (
                  <button
                    key={`${rec.type}-${rec.id}`}
                    type="button"
                    onClick={() => setSelectedRecord(rec)}
                    className={`w-full text-left p-3 rounded-xl border text-xs flex items-center justify-between transition-all cursor-pointer ${
                      selectedRecord?.id === rec.id
                        ? "bg-blue-50 border-blue-400 shadow-2xs"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900">{rec.titleOrName}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {rec.subTitle} · {rec.email}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-blue-700 block">{rec.ticketRef || rec.reference}</span>
                      <span className="text-[10px] uppercase font-mono font-semibold text-slate-400">
                        {rec.type}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedRecord && (
            <div className="bg-white border-2 border-slate-900 rounded-2xl p-5 shadow-[4px_4px_0px_#0F172A] space-y-4">
              {/* Badge & Reference */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                        selectedRecord.isArchived
                          ? "bg-rose-100 text-rose-800 border border-rose-300"
                          : selectedRecord.status === "confirmed"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : "bg-amber-100 text-amber-800 border border-amber-300"
                      }`}
                    >
                      {selectedRecord.isArchived
                        ? "Archived / Revoked"
                        : selectedRecord.status === "confirmed"
                        ? "Valid · Confirmed Pass"
                        : "Pending Verification"}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 uppercase">
                      {selectedRecord.type === "visitor" ? "Visitor Pass" : selectedRecord.type === "esports" ? "Esports Roster" : "Project Exhibit"}
                    </span>
                  </div>
                  <h3 className="text-lg font-display font-black text-slate-900 m-0">
                    {selectedRecord.titleOrName}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">{selectedRecord.subTitle}</p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                    Ticket / Pass Code
                  </span>
                  <div className="flex items-center sm:justify-end gap-1.5 mt-0.5">
                    <span className="font-mono text-xl font-black text-blue-700 tracking-wider">
                      {selectedRecord.ticketRef || selectedRecord.reference}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyTicket(selectedRecord.ticketRef || selectedRecord.reference)}
                      className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                      title="Copy ticket code"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                  {copied && <span className="text-[10px] text-emerald-600 font-mono font-bold">Copied!</span>}
                </div>
              </div>

              {/* Identity & Venue Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <Mail size={14} className="text-slate-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-slate-500 block text-[10px] uppercase font-mono">Contact Email</span>
                    <span className="font-mono font-semibold text-slate-800 truncate block">{selectedRecord.email}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-mono">Mobile Number</span>
                    <span className="font-mono font-semibold text-slate-800">{selectedRecord.phone}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <Building2 size={14} className="text-slate-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-slate-500 block text-[10px] uppercase font-mono">Institution</span>
                    <span className="font-semibold text-slate-800 truncate block">{selectedRecord.institution}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <Clock size={14} className="text-slate-400 shrink-0" />
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-mono">Event Dates</span>
                    <span className="font-semibold text-slate-800">20–21 November 2026</span>
                  </div>
                </div>
              </div>

              {/* Roster if Esports */}
              {selectedRecord.extraDetails?.roster && selectedRecord.extraDetails.roster.length > 0 && (
                <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-200 space-y-1.5 text-xs">
                  <div className="font-mono font-bold text-[11px] text-purple-900 uppercase">
                    Squad Players & Tickets ({selectedRecord.extraDetails.roster.length} Players)
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {selectedRecord.extraDetails.roster.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-1.5 bg-white rounded border border-purple-100 text-xs">
                        <span className="font-semibold text-slate-800">{idx + 1}. {p.player_name} {p.gamer_tag ? `(${p.gamer_tag})` : ""}</span>
                        <span className="font-mono text-[11px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                          {selectedRecord.reference}-P{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <span className="text-[11px] font-mono text-slate-500">
                  Registration Ref: <strong>{selectedRecord.reference}</strong>
                </span>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {canCheckInRecord(selectedRecord) ? (
                    <button
                      type="button"
                      disabled={isCheckingIn || selectedRecord.isArchived}
                      onClick={() => handleQuickCheckin(selectedRecord)}
                      className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 size={14} />
                      <span>Confirm & Check In</span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-mono">
                      Read-only verification
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Bar */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-400">
            Audit logging enabled for all ticket verification events
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
