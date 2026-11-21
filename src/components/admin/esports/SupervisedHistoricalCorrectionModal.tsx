import { useEffect, useRef } from "react";
import { type SupervisedCorrectionAnalysis } from "@/lib/esportsFixtureCorrections";
import { AlertTriangle, ArrowRight, CheckCircle2, FileWarning, GitBranch, ShieldAlert, X } from "lucide-react";

interface SupervisedHistoricalCorrectionModalProps {
  open: boolean;
  title: string;
  actionDescription: string;
  analysis: SupervisedCorrectionAnalysis | null;
  previewLoading: boolean;
  previewError: string | null;
  reason: string;
  onReasonChange: (val: string) => void;
  submitting: boolean;
  rejectionError: string | null;
  requiresManualReviewSql: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SupervisedHistoricalCorrectionModal({
  open,
  title,
  actionDescription,
  analysis,
  previewLoading,
  previewError,
  reason,
  onReasonChange,
  submitting,
  rejectionError,
  requiresManualReviewSql,
  onCancel,
  onConfirm,
}: SupervisedHistoricalCorrectionModalProps) {
  const errorBannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (rejectionError && errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  }, [rejectionError]);

  if (!open || !analysis) return null;

  const canConfirm = !submitting && !previewLoading && reason.trim().length >= 3;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Supervised Historical Fixture Correction"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <ShieldAlert size={19} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-800">
                Supervised Historical Fixture Correction
              </div>
              <h3 className="text-base font-display font-bold text-slate-900 m-0 mt-0.5">
                {title}
              </h3>
              <p className="text-xs text-slate-700 m-0 mt-0.5">{actionDescription}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close supervised correction preview"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-amber-100 cursor-pointer shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 pb-6 space-y-4 overflow-y-auto text-xs">
          {/* Why Supervised */}
          {analysis.reasons.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="font-mono text-[10px] font-bold uppercase text-slate-500">
                Why Supervision Is Active
              </div>
              <ul className="m-0 pl-4 space-y-0.5 text-slate-700">
                {analysis.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Server Preview Result */}
          {previewLoading ? (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-medium">
              Querying Supabase <code className="font-mono">preview_esports_fixture_correction</code>...
            </div>
          ) : previewError ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div>
                <strong className="block">Server Preview Notice</strong>
                <span>{previewError}</span>
              </div>
            </div>
          ) : analysis.serverPreviewSummary ? (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2">
              <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-700" />
              <div>
                <strong className="block">Live Backend Impact Preview</strong>
                <span>{analysis.serverPreviewSummary}</span>
              </div>
            </div>
          ) : null}

          {/* Side-by-Side Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="text-[10px] font-mono font-bold uppercase text-slate-500">
                Existing Assignment &amp; Score
              </div>
              <div className="font-semibold text-slate-900">
                Slot A: {analysis.existingAssignment.teamAName}
              </div>
              <div className="font-semibold text-slate-900">
                Slot B: {analysis.existingAssignment.teamBName}
              </div>
              <div className="pt-1 border-t border-slate-200 font-mono text-[11px] text-slate-700 flex items-center justify-between">
                <span>
                  Score: <strong>{analysis.existingAssignment.scoreA}</strong> –{" "}
                  <strong>{analysis.existingAssignment.scoreB}</strong>
                </span>
                <span className="uppercase">{analysis.existingAssignment.status.replace(/_/g, " ")}</span>
              </div>
              {analysis.existingAssignment.winnerName && (
                <div className="text-[11px] text-emerald-800 font-semibold">
                  Confirmed Winner: {analysis.existingAssignment.winnerName}
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl border border-sky-200 bg-sky-50/50 space-y-1.5">
              <div className="text-[10px] font-mono font-bold uppercase text-sky-800 flex items-center gap-1">
                <ArrowRight size={11} /> Proposed Corrected Assignment
              </div>
              <div className="font-semibold text-slate-900">
                Slot A: {analysis.proposedAssignment.teamAName}
              </div>
              <div className="font-semibold text-slate-900">
                Slot B: {analysis.proposedAssignment.teamBName}
              </div>
              <div className="pt-1 border-t border-sky-200 text-[11px] text-sky-900">
                {analysis.silentWinnerTransferBlocked ? (
                  <span className="font-semibold text-amber-900">
                    Confirmed winner/scores will NOT be silently transferred to a replacement squad. Reconfirm actual score after updating teams.
                  </span>
                ) : (
                  <span>Ready to apply supervised RPC correction.</span>
                )}
              </div>
            </div>
          </div>

          {/* Downstream Impact Table */}
          {analysis.downstreamImpacts.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <GitBranch size={13} />
                  Affected Downstream Fixtures ({analysis.downstreamImpacts.length})
                </span>
                {analysis.matchesRequiringReconfirmation.length > 0 && (
                  <span className="font-mono text-[10px] font-bold text-amber-800 uppercase">
                    {analysis.matchesRequiringReconfirmation.length} Require Manual Reconfirmation
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {analysis.downstreamImpacts.map((d) => (
                  <div key={d.matchId} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-slate-900">
                        {d.matchCode} · {d.round}
                      </div>
                      <div className="text-slate-600 truncate">
                        {d.currentTeamAName} vs {d.currentTeamBName} ({d.currentScoreLabel})
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-[10px] uppercase text-slate-500 block">
                        {d.status.replace(/_/g, " ")}
                      </span>
                      {d.requiresManualReconfirmation && (
                        <span className="font-mono text-[10px] font-bold text-amber-700">
                          Reconfirm Result
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mandatory Reason */}
          <div>
            <label htmlFor="supervised-reason-input" className="block font-semibold text-slate-800 mb-1">
              Mandatory Correction Audit Reason (`p_reason`) *
            </label>
            <input
              id="supervised-reason-input"
              type="text"
              required
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Explain why this historical/post-start fixture correction is required..."
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
            />
          </div>

          {/* Honest Non-Bypass Error Banner if Production RPC Rejects */}
          {rejectionError && (
            <div ref={errorBannerRef} className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-950 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <FileWarning size={15} className="text-rose-700 shrink-0" />
                <span>Backend RPC Rejected Correction (No Direct Table Bypass Performed)</span>
              </div>
              <p className="m-0 leading-relaxed">{rejectionError}</p>
              {requiresManualReviewSql && (
                <p className="m-0 text-[11px] text-rose-800 font-mono">
                  Review safe transactional SQL helper in supabase/migrations/20261130000000_historical_fixture_correction_review.sql before modifying locked historical rows.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="min-h-[40px] px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="min-h-[40px] px-4 rounded-lg bg-[#0B1120] hover:bg-slate-800 disabled:opacity-45 text-white text-xs font-semibold cursor-pointer"
          >
            {submitting ? "Executing Production RPC..." : "Confirm Supervised Correction"}
          </button>
        </div>
      </div>
    </div>
  );
}
