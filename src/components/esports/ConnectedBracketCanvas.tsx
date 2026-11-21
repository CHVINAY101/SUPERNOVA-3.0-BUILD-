import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildBracketRoundListGroups,
  buildConnectedBracketLayout,
  type BracketCardNode,
  type BracketTrack,
} from "@/lib/tournamentEngine";
import { formatIstDateTime, isMatchScheduled } from "@/lib/scheduling";
import type { Match, TournamentFormat } from "@/types/database";
import { Crown, Edit3, GitBranch, List, Maximize2, Minimize2, RotateCcw, Scan, ZoomIn, ZoomOut } from "lucide-react";

interface ConnectedBracketCanvasProps {
  matches: Match[];
  teamNameById: Map<string, string>;
  championTeamId?: string | null;
  format?: TournamentFormat | string | null;
  interactive?: boolean;
  canEditMatch?: boolean;
  selectedMatchId?: string | null;
  onSelectMatch?: (match: Match) => void;
  onEditMatch?: (match: Match) => void;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}

function getStatusText(status: Match["status"], isBye: boolean): { label: string; cls: string } {
  if (isBye) return { label: "BYE", cls: "text-slate-400" };
  switch (status) {
    case "live":
      return { label: "LIVE", cls: "text-orange-400" };
    case "result_submitted":
      return { label: "AWAITING CONFIRM", cls: "text-amber-300" };
    case "completed":
      return { label: "COMPLETED", cls: "text-emerald-400" };
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
  canEditMatch = true,
  selectedMatchId = null,
  onSelectMatch,
  onEditMatch,
  title = "Tournament Bracket",
  subtitle,
  emptyMessage,
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

  const roundListGroups = useMemo(
    () =>
      buildBracketRoundListGroups({
        matches,
        teamNameById,
        format,
      }),
    [matches, teamNameById, format]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const savedScrollRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"bracket" | "list">("bracket");
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
    const availableW = Math.max(280, vp.clientWidth - 40);
    const ratio = Math.min(1.1, Math.max(0.35, Number((availableW / maxTrackWidth).toFixed(2))));
    setZoom(ratio);
    savedScrollRef.current = { left: 0, top: 0 };
    vp.scrollTo({ left: 0, top: 0, behavior: "smooth" });
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

  // Preserve scroll position smoothly across live score / realtime bracket updates
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const { left, top } = savedScrollRef.current;
    if (vp.scrollLeft !== left || vp.scrollTop !== top) {
      vp.scrollLeft = left;
      vp.scrollTop = top;
    }
  }, [layout, viewMode, zoom, isFullscreen, fallbackOverlayFullscreen]);

  const handleViewportScroll = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    savedScrollRef.current = { left: vp.scrollLeft, top: vp.scrollTop };
  }, []);

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
        {emptyMessage || "No elimination bracket fixtures available for this format yet."}
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
      ? formatIstDateTime(m.scheduled_start).replace(/\s+20\d{2},?/g, "").replace(/\s+IST$/i, "")
      : "Unscheduled";

    const baseCardClasses = `absolute text-left rounded-lg border transition-colors flex flex-col justify-between p-2 select-none ${
      isSelected
        ? "bg-[#152238] border-sky-400 ring-2 ring-sky-400/30"
        : isLive
        ? "bg-[#161D30] border-orange-500/70"
        : node.isBye
        ? "bg-[#0F172A]/70 border-slate-800/80 opacity-80"
        : "bg-[#0F172A] border-slate-700/80"
    } ${interactive ? "cursor-pointer hover:border-sky-400/70 focus-visible:outline-2 focus-visible:outline-sky-400" : ""}`;

    const showEditButton = Boolean(interactive && canEditMatch && (onEditMatch || onSelectMatch));

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
              title={node.teamALabel}
              className={
                node.teamAIsPlaceholder
                  ? "italic text-amber-200/90 font-normal text-[10px] leading-tight line-clamp-2"
                  : isTeamAWinner
                  ? "truncate text-emerald-200 font-semibold"
                  : "truncate text-slate-100 font-medium"
              }
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
              title={node.teamBLabel}
              className={
                node.teamBIsPlaceholder
                  ? "italic text-amber-200/90 font-normal text-[10px] leading-tight line-clamp-2"
                  : isTeamBWinner
                  ? "truncate text-emerald-200 font-semibold"
                  : "truncate text-slate-100 font-medium"
              }
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
        <div
          key={m.id}
          style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
          className={baseCardClasses}
        >
          <button
            type="button"
            onClick={() => onSelectMatch(m)}
            className="w-full flex-1 text-left flex flex-col justify-between bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
            aria-label={`Open match ${m.match_code || m.round}: ${node.teamALabel} vs ${node.teamBLabel}`}
          >
            {content}
          </button>
          {showEditButton && (
            <button
              type="button"
              onClick={() => (onEditMatch || onSelectMatch)(m)}
              aria-label={`Edit Match ${m.match_code || m.round}`}
              className="mt-1 self-end inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/90 hover:bg-sky-600 text-[10px] font-mono font-semibold text-sky-300 hover:text-white border border-slate-700 cursor-pointer transition-colors"
            >
              <Edit3 size={10} />
              <span>Edit Match</span>
            </button>
          )}
        </div>
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
    const hasLoserEdges = track.edges.some((e) => e.edgeType === "loser");

    return (
      <div key={track.id} className="space-y-2 pr-4 pb-2 min-w-max">
        <div className="flex items-center justify-between px-1 gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-300">
              {track.title}
            </span>
            {hasLoserEdges && (
              <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-4 h-0.5 bg-slate-500" />
                  <span>Winner advances</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-orange-300">
                  <span className="inline-block w-4 border-t-2 border-dashed border-orange-500" />
                  <span>Loser drops to match</span>
                </span>
              </div>
            )}
          </div>
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
                style={{ left: col.x, top: 8, width: 264 }}
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

            {/* SVG Orthogonal Bracket Connectors (Winner & Loser Progression) */}
            <svg
              width={track.width}
              height={track.height}
              className="absolute inset-0 pointer-events-none"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="bracket-arrow-loser"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#F97316" />
                </marker>
                <marker
                  id="bracket-arrow-winner-active"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5.5"
                  markerHeight="5.5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#10B981" />
                </marker>
              </defs>
              {track.edges.map((edge) => {
                const isLoser = edge.edgeType === "loser";
                const strokeColor =
                  edge.edgeType === "champion" && edge.highlighted
                    ? "#F59E0B"
                    : isLoser
                    ? "#F97316"
                    : edge.highlighted
                    ? "#10B981"
                    : "#475569";

                return (
                  <g key={edge.id} data-edge-type={edge.edgeType}>
                    <path
                      d={edge.pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isLoser ? 2 : edge.highlighted ? 2.25 : 1.5}
                      strokeDasharray={isLoser ? "5 3" : undefined}
                      strokeLinejoin="round"
                      markerEnd={
                        isLoser
                          ? "url(#bracket-arrow-loser)"
                          : edge.edgeType === "winner" && edge.highlighted
                          ? "url(#bracket-arrow-winner-active)"
                          : undefined
                      }
                    />
                    {isLoser && edge.label && edge.labelX != null && edge.labelY != null && (
                      <g>
                        <rect
                          x={edge.labelX - 18}
                          y={edge.labelY - 10}
                          width={36}
                          height={14}
                          rx={3}
                          fill="#0B1120"
                          stroke="#F97316"
                          strokeOpacity={0.55}
                          strokeWidth={0.8}
                        />
                        <text
                          x={edge.labelX}
                          y={edge.labelY}
                          textAnchor="middle"
                          fill="#FB923C"
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="700"
                        >
                          {edge.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
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
      data-testid="connected-bracket-container"
      className={
        isFullscreen
          ? "w-full h-full bg-[#0B1120] p-4 sm:p-6 flex flex-col gap-4 min-h-0 min-w-0 overflow-hidden"
          : fallbackOverlayFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen bg-[#0B1120] p-4 sm:p-6 flex flex-col gap-4 min-h-0 min-w-0 overflow-hidden"
          : "rounded-xl bg-[#0B1120] border border-slate-800 p-4 sm:p-5 flex flex-col gap-4 min-w-0"
      }
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-display font-bold text-white m-0">{title}</h3>
          <p className="text-[11px] text-slate-400 m-0 mt-0.5">
            {subtitle ||
              (interactive
                ? "Click any match node to check in squads, enter scores, confirm winners, or correct results."
                : "Live progression from Opening Round through Grand Final.")}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="inline-flex rounded-lg p-0.5 bg-slate-900 border border-slate-700 mr-1" role="group" aria-label="Bracket display mode">
            <button
              type="button"
              onClick={() => setViewMode("bracket")}
              aria-pressed={viewMode === "bracket"}
              className={`min-h-[34px] px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewMode === "bracket"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <GitBranch size={13} />
              <span>Bracket View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              className={`min-h-[34px] px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewMode === "list"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <List size={13} />
              <span>List View</span>
            </button>
          </div>

          {viewMode === "bracket" && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.35, Number((z - 0.1).toFixed(2))))}
                aria-label="Zoom out bracket"
                className="min-h-[34px] w-9 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Reset bracket zoom to 100%"
                className="min-h-[34px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 font-mono text-[11px] tabular-nums cursor-pointer"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
                aria-label="Zoom in bracket"
                className="min-h-[34px] w-9 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                onClick={handleFitToScreen}
                className="min-h-[34px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Scan size={13} />
                <span>Fit Screen</span>
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Reset zoom"
                className="min-h-[34px] w-9 inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                <RotateCcw size={13} />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreenActive ? "Exit fullscreen bracket" : "Fullscreen bracket"}
            className="min-h-[34px] px-2.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {fullscreenActive ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{fullscreenActive ? "Exit Fullscreen" : "Fullscreen"}</span>
          </button>
        </div>
      </div>

      {/* Scrollable Viewport: supports full vertical & horizontal scrolling, wheel, trackpad & touch */}
      <div
        ref={viewportRef}
        onScroll={handleViewportScroll}
        data-testid="bracket-scroll-viewport"
        className={`overflow-auto overscroll-auto touch-pan-x touch-pan-y min-h-0 min-w-0 pr-2 pb-4 ${
          fullscreenActive ? "flex-1" : "h-[min(70vh,680px)] min-h-[320px]"
        }`}
      >
        {viewMode === "bracket" ? (
          <div className="space-y-6 w-max min-w-full">
            {layout.tracks.map(renderTrack)}
          </div>
        ) : (
          <div className="space-y-5" data-testid="bracket-round-list-view">
            {roundListGroups.map((group) => (
              <section key={group.key} className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 px-1 border-b border-slate-800 pb-1.5">
                  <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-sky-300 m-0">
                    {group.roundLabel}
                  </h4>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {group.items.length} fixture(s)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {group.items.map((item) => {
                    const m = item.match;
                    const statusInfo = getStatusText(m.status, item.isBye);
                    const isTeamAWinner = Boolean(m.winner_id && m.winner_id === m.team_a_id);
                    const isTeamBWinner = Boolean(m.winner_id && m.winner_id === m.team_b_id);
                    const isSelected = selectedMatchId === m.id;
                    const timeLabel = isMatchScheduled(m)
                      ? formatIstDateTime(m.scheduled_start).replace(/\s+20\d{2},?/g, "").replace(/\s+IST$/i, "")
                      : "Unscheduled";

                    const inner = (
                      <>
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <span className="font-bold text-slate-300 truncate">
                            {m.match_code || `M${m.match_number ?? 1}`}
                          </span>
                          <span className="text-slate-400 truncate">{timeLabel}</span>
                          <span className={`font-bold shrink-0 ${statusInfo.cls}`}>{statusInfo.label}</span>
                        </div>

                        <div className="space-y-1.5 mt-2">
                          <div
                            className={`flex items-center justify-between gap-2 px-2 py-1 rounded text-xs ${
                              isTeamAWinner ? "bg-emerald-500/15 text-emerald-200 font-semibold" : "text-slate-100"
                            }`}
                          >
                            <span
                              title={item.teamALabel}
                              className={
                                item.teamAIsPlaceholder
                                  ? "italic text-amber-200/90 text-[11px] leading-snug"
                                  : "truncate"
                              }
                            >
                              {item.teamALabel}
                            </span>
                            <span className="font-mono font-bold tabular-nums shrink-0">
                              {item.isBye ? "—" : m.score_a}
                            </span>
                          </div>
                          <div
                            className={`flex items-center justify-between gap-2 px-2 py-1 rounded text-xs ${
                              isTeamBWinner ? "bg-emerald-500/15 text-emerald-200 font-semibold" : "text-slate-100"
                            }`}
                          >
                            <span
                              title={item.teamBLabel}
                              className={
                                item.teamBIsPlaceholder
                                  ? "italic text-amber-200/90 text-[11px] leading-snug"
                                  : "truncate"
                              }
                            >
                              {item.teamBLabel}
                            </span>
                            <span className="font-mono font-bold tabular-nums shrink-0">
                              {item.isBye ? "—" : m.score_b}
                            </span>
                          </div>
                        </div>
                      </>
                    );

                    const cardCls = `w-full min-h-[88px] text-left rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? "bg-[#152238] border-sky-400 ring-2 ring-sky-400/30"
                        : m.status === "live"
                        ? "bg-[#161D30] border-orange-500/70"
                        : item.isBye
                        ? "bg-[#0F172A]/70 border-slate-800/80 opacity-80"
                        : "bg-[#0F172A] border-slate-700/80"
                    } ${interactive ? "cursor-pointer hover:border-sky-400/70" : ""}`;

                    return interactive && onSelectMatch ? (
                      <div key={m.id} className={cardCls}>
                        <button
                          type="button"
                          onClick={() => onSelectMatch(m)}
                          className="w-full text-left bg-transparent border-0 p-0 cursor-pointer"
                          aria-label={`Open match ${m.match_code || m.round}: ${item.teamALabel} vs ${item.teamBLabel}`}
                        >
                          {inner}
                        </button>
                        {canEditMatch && (
                          <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex justify-end">
                            <button
                              type="button"
                              onClick={() => (onEditMatch || onSelectMatch)(m)}
                              aria-label={`Edit Match ${m.match_code || m.round}`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-sky-600 text-[11px] font-mono font-semibold text-sky-300 hover:text-white border border-slate-700 cursor-pointer transition-colors"
                            >
                              <Edit3 size={11} />
                              <span>Edit Match</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div key={m.id} className={cardCls}>
                        {inner}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
