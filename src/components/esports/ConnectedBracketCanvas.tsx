import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildConnectedBracketLayout, type BracketCardNode, type BracketTrack } from "@/lib/tournamentEngine";
import { formatIstDateTime, isMatchScheduled } from "@/lib/scheduling";
import type { Match, TournamentFormat } from "@/types/database";
import { Crown, Maximize2, Minimize2, RotateCcw, Scan, ZoomIn, ZoomOut } from "lucide-react";

interface ConnectedBracketCanvasProps {
  matches: Match[];
  teamNameById: Map<string, string>;
  championTeamId?: string | null;
  format?: TournamentFormat | string | null;
  interactive?: boolean;
  selectedMatchId?: string | null;
  onSelectMatch?: (match: Match) => void;
  title?: string;
  subtitle?: string;
}

function getStatusText(status: Match["status"], isBye: boolean): { label: string; cls: string } {
  if (isBye) return { label: "BYE", cls: "text-slate-400" };
  switch (status) {
    case "live":
      return { label: "LIVE", cls: "text-orange-400" };
    case "result_submitted":
      return { label: "REVIEW", cls: "text-amber-300" };
    case "completed":
      return { label: "FINAL", cls: "text-emerald-400" };
    case "disputed":
      return { label: "DISPUTED", cls: "text-rose-400" };
    case "ready":
      return { label: "READY", cls: "text-sky-300" };
    case "check_in":
      return { label: "CHECK-IN", cls: "text-sky-300" };
    case "postponed":
      return { label: "DELAYED", cls: "text-slate-400" };
    case "cancelled":
      return { label: "VOID", cls: "text-slate-500" };
    default:
      return { label: "UPCOMING", cls: "text-slate-400" };
  }
}

export function ConnectedBracketCanvas({
  matches,
  teamNameById,
  championTeamId,
  format,
  interactive = false,
  selectedMatchId = null,
  onSelectMatch,
  title = "Tournament Bracket",
  subtitle,
}: ConnectedBracketCanvasProps) {
  const layout = useMemo(
    () =>
      buildConnectedBracketLayout({
        matches,
        teamNameById,
        championTeamId,
        format,
      }),
    [matches, teamNameById, championTeamId, format]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fallbackOverlayFullscreen, setFallbackOverlayFullscreen] = useState<boolean>(false);

  const maxTrackWidth = useMemo(() => {
    return layout.tracks.reduce((max, tr) => Math.max(max, tr.width), 720);
  }, [layout.tracks]);

  const handleFitToScreen = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) {
      setZoom(1);
      return;
    }
    const available = Math.max(320, vp.clientWidth - 32);
    const ratio = Math.min(1.1, Math.max(0.45, Number((available / maxTrackWidth).toFixed(2))));
    setZoom(ratio);
  }, [maxTrackWidth]);

  useEffect(() => {
    const onFsChange = () => {
      const active = document.fullscreenElement === containerRef.current;
      setIsFullscreen(active);
      if (!active) setFallbackOverlayFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!fallbackOverlayFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFallbackOverlayFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fallbackOverlayFullscreen]);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (isFullscreen || fallbackOverlayFullscreen) {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
      setFallbackOverlayFullscreen(false);
      return;
    }
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else {
        setFallbackOverlayFullscreen(true);
      }
    } catch {
      setFallbackOverlayFullscreen(true);
    }
  };

  if (!layout.hasConnectedBracket) {
    return (
      <div className="rounded-xl bg-[#0B1120] border border-slate-800 p-8 text-center text-xs text-slate-400">
        No elimination bracket fixtures available for this format yet.
      </div>
    );
  }

  const fullscreenActive = isFullscreen || fallbackOverlayFullscreen;

  const renderCard = (node: BracketCardNode) => {
    const m = node.match;
    const statusInfo = getStatusText(m.status, node.isBye);
    const isTeamAWinner = Boolean(m.winner_id && m.winner_id === m.team_a_id);
    const isTeamBWinner = Boolean(m.winner_id && m.winner_id === m.team_b_id);
    const isSelected = selectedMatchId === m.id;
    const isLive = m.status === "live";

    const timeLabel = isMatchScheduled(m)
      ? formatIstDateTime(m.scheduled_start).replace(/, 2026/g, "").replace(/ IST$/i, "")
      : "Unscheduled";

    const baseCardClasses = `absolute text-left rounded-lg border transition-colors flex flex-col justify-between p-2.5 select-none ${
      isSelected
        ? "bg-[#152238] border-sky-400 ring-2 ring-sky-400/30"
        : isLive
        ? "bg-[#161D30] border-orange-500/70"
        : node.isBye
        ? "bg-[#0F172A]/70 border-slate-800/80 opacity-80"
        : "bg-[#0F172A] border-slate-700/80"
    } ${interactive ? "cursor-pointer hover:border-sky-400/70 focus-visible:outline-2 focus-visible:outline-sky-400" : ""}`;

    const content = (
      <>
        <div className="flex items-center justify-between gap-1.5 text-[10px] font-mono leading-none">
          <span className="font-bold text-slate-300 shrink-0">
            {m.match_code || `M${m.match_number ?? 1}`}
          </span>
          <span className="text-slate-500 truncate min-w-0">{timeLabel}</span>
          <span className={`font-bold shrink-0 ${statusInfo.cls}`}>{statusInfo.label}</span>
        </div>

        <div className="space-y-1 mt-1.5">
          <div
            className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-[11px] ${
              isTeamAWinner ? "bg-emerald-500/15 text-emerald-200 font-semibold" : "text-slate-100"
            }`}
          >
            <span
              className={`truncate ${
                node.teamAIsPlaceholder
                  ? "italic text-slate-400 font-normal"
                  : isTeamAWinner
                  ? "text-emerald-200 font-semibold"
                  : "text-slate-100 font-medium"
              }`}
            >
              {node.teamALabel}
            </span>
            <span className="font-mono font-bold tabular-nums text-[11px] shrink-0 text-slate-200">
              {node.isBye ? "—" : m.score_a}
            </span>
          </div>

          <div
            className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-[11px] ${
              isTeamBWinner ? "bg-emerald-500/15 text-emerald-200 font-semibold" : "text-slate-100"
            }`}
          >
            <span
              className={`truncate ${
                node.teamBIsPlaceholder
                  ? "italic text-slate-400 font-normal"
                  : isTeamBWinner
                  ? "text-emerald-200 font-semibold"
                  : "text-slate-100 font-medium"
              }`}
            >
              {node.teamBLabel}
            </span>
            <span className="font-mono font-bold tabular-nums text-[11px] shrink-0 text-slate-200">
              {node.isBye ? "—" : m.score_b}
            </span>
          </div>
        </div>
      </>
    );

    if (interactive && onSelectMatch) {
      return (
        <button
          key={m.id}
          type="button"
          onClick={() => onSelectMatch(m)}
          style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
          className={baseCardClasses}
          aria-label={`Open match ${m.match_code || m.round}: ${node.teamALabel} vs ${node.teamBLabel}`}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        key={m.id}
        style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
        className={baseCardClasses}
      >
        {content}
      </div>
    );
  };

  const renderTrack = (track: BracketTrack) => {
    const scaledWidth = Math.ceil(track.width * zoom);
    const scaledHeight = Math.ceil(track.height * zoom);

    return (
      <div key={track.id} className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-300">
            {track.title}
          </span>
          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
            {track.columns.length} stage(s)
          </span>
        </div>

        <div
          style={{ width: scaledWidth, height: scaledHeight }}
          className="relative shrink-0"
        >
          <div
            style={{
              width: track.width,
              height: track.height,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
            className="relative"
          >
            {/* Column Headers */}
            {track.columns.map((col) => (
              <div
                key={col.key}
                style={{ left: col.x, top: 8, width: 236 }}
                className="absolute text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-1.5"
              >
                {col.label}
              </div>
            ))}

            {track.championCard && (
              <div
                style={{ left: track.championCard.x, top: 8, width: track.championCard.width }}
                className="absolute text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400 border-b border-slate-800 pb-1.5"
              >
                Champion
              </div>
            )}

            {/* SVG Orthogonal Bracket Connectors */}
            <svg
              width={track.width}
              height={track.height}
              className="absolute inset-0 pointer-events-none"
              aria-hidden="true"
            >
              {track.edges.map((edge) => (
                <path
                  key={edge.id}
                  d={edge.pathD}
                  fill="none"
                  stroke={
                    edge.edgeType === "champion" && edge.highlighted
                      ? "#F59E0B"
                      : edge.highlighted
                      ? "#10B981"
                      : "#334155"
                  }
                  strokeWidth={edge.highlighted ? 2.25 : 1.5}
                  strokeLinejoin="round"
                />
              ))}
            </svg>

            {/* Match Nodes */}
            {track.columns.flatMap((col) => col.cards.map(renderCard))}

            {/* Champion Destination Card */}
            {track.championCard && (
              <div
                style={{
                  left: track.championCard.x,
                  top: track.championCard.y,
                  width: track.championCard.width,
                  height: track.championCard.height,
                }}
                className={`absolute rounded-lg border p-3 flex flex-col justify-center gap-1 ${
                  track.championCard.completed
                    ? "bg-amber-500/15 border-amber-400/60"
                    : "bg-[#0F172A] border-slate-700/80 border-dashed"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold text-amber-400">
                  <Crown size={13} />
                  <span>Tournament Winner</span>
                </div>
                <div className="text-sm font-display font-bold text-white truncate">
                  {track.championCard.championName || "Awaiting Final"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={
        fallbackOverlayFullscreen
          ? "fixed inset-0 z-50 bg-[#0B1120] p-4 sm:p-6 flex flex-col gap-4 overflow-hidden"
          : "rounded-xl bg-[#0B1120] border border-slate-800 p-4 sm:p-5 space-y-4 overflow-hidden"
      }
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-sm font-display font-bold text-white m-0">{title}</h3>
          <p className="text-[11px] text-slate-400 m-0 mt-0.5">
            {subtitle ||
              (interactive
                ? "Click any match node to check in squads, enter scores, confirm winners, or correct results."
                : "Live progression from Opening Round through Grand Final.")}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.45, Number((z - 0.1).toFixed(2))))}
            aria-label="Zoom out bracket"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="Reset bracket zoom to 100%"
            className="h-8 px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 font-mono text-[11px] tabular-nums cursor-pointer"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
            aria-label="Zoom in bracket"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={handleFitToScreen}
            className="h-8 px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Scan size={13} />
            <span>Fit Screen</span>
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="Reset zoom"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreenActive ? "Exit fullscreen bracket" : "Fullscreen bracket"}
            className="h-8 px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {fullscreenActive ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{fullscreenActive ? "Exit Fullscreen" : "Fullscreen"}</span>
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Canvas */}
      <div
        ref={viewportRef}
        className={`overflow-x-auto overflow-y-auto pb-2 space-y-6 ${
          fullscreenActive ? "flex-1" : "max-h-[680px]"
        }`}
      >
        {layout.tracks.map(renderTrack)}
      </div>
    </div>
  );
}
