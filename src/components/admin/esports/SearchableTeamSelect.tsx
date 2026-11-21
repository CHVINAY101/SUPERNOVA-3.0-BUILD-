import { useEffect, useMemo, useRef, useState } from "react";
import { filterTeamsForGameSearch } from "@/lib/esportsFixtureCorrections";
import type { Registration } from "@/types/database";
import { Check, ChevronDown, Search, X } from "lucide-react";

interface SearchableTeamSelectProps {
  id?: string;
  label?: string;
  teams: Registration[];
  gameId: string;
  value: string | null;
  onChange: (teamId: string | null) => void;
  placeholder?: string;
  allowTbd?: boolean;
  tbdLabel?: string;
  excludeTeamIds?: string[];
  excludeDisqualified?: boolean;
  includeStatuses?: Array<Registration["status"]>;
  disabled?: boolean;
}

export function SearchableTeamSelect({
  id,
  label,
  teams,
  gameId,
  value,
  onChange,
  placeholder = "Search team name or SN-ESP ref...",
  allowTbd = false,
  tbdLabel = "TBD / Open Slot",
  excludeTeamIds = [],
  excludeDisqualified = false,
  includeStatuses = ["confirmed", "pending", "correction_requested"],
  disabled = false,
}: SearchableTeamSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTeam = useMemo(
    () => (value ? teams.find((t) => t.id === value) || null : null),
    [teams, value]
  );

  const filtered = useMemo(
    () =>
      filterTeamsForGameSearch(teams, gameId, query, {
        includeStatuses,
        excludeDisqualified,
        excludeTeamIds,
        limit: 80,
      }),
    [teams, gameId, query, includeStatuses, excludeDisqualified, excludeTeamIds]
  );

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setQuery("");
    }
  }, [open]);

  const statusTag = (t: Registration) => {
    if (t.selection_status === "disqualified") return "DQ";
    if (t.selection_status === "selected") return "Selected";
    if (t.status === "confirmed") return "Approved";
    return t.status;
  };

  return (
    <div ref={containerRef} className="relative text-xs">
      {label && (
        <label htmlFor={id} className="block font-semibold text-slate-700 mb-1">
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((v) => !v)}
        className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-2 text-left cursor-pointer"
      >
        <div className="min-w-0 flex-1">
          {selectedTeam ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-900 truncate">{selectedTeam.team_name}</span>
              <span className="font-mono text-[10px] text-slate-500 shrink-0">
                {selectedTeam.registration_ref}
              </span>
              {selectedTeam.selection_status === "disqualified" && (
                <span className="font-mono text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded shrink-0">
                  DQ
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-500">{allowTbd ? tbdLabel : "Select a registered squad..."}</span>
          )}
        </div>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label || "Registered teams"}
          className="absolute left-0 right-0 mt-1.5 z-40 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              aria-label={`Search ${label || "registered teams"}`}
              className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search query"
                onClick={() => setQuery("")}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {allowTbd && (
              <button
                type="button"
                role="option"
                aria-selected={value === null}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                  value === null ? "bg-slate-100 font-semibold" : ""
                }`}
              >
                <span className="text-slate-700 italic">{tbdLabel}</span>
                {value === null && <Check size={13} className="text-slate-900 shrink-0" />}
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-5 text-center text-xs text-slate-500">
                No registered squads match "{query}".
              </div>
            ) : (
              filtered.map((t) => {
                const isSelected = t.id === value;
                const isDq = t.selection_status === "disqualified";
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(t.id);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 hover:bg-slate-50 cursor-pointer ${
                      isSelected ? "bg-sky-50/70" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {t.seed_number != null && (
                          <span className="font-mono text-[10px] font-bold text-slate-500 shrink-0">
                            #{t.seed_number}
                          </span>
                        )}
                        <span className={`font-semibold truncate ${isDq ? "text-rose-800 line-through" : "text-slate-900"}`}>
                          {t.team_name}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        <span className="font-mono">{t.registration_ref}</span>
                        {t.institution ? ` · ${t.institution}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                          isDq
                            ? "bg-rose-50 text-rose-700 border-rose-200 font-bold"
                            : t.selection_status === "selected"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {statusTag(t)}
                      </span>
                      {isSelected && <Check size={13} className="text-sky-700" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
