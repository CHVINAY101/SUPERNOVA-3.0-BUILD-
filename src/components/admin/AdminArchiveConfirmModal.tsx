import React from "react";
import { AlertTriangle, X, Archive, RefreshCw } from "lucide-react";

export interface AdminArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isProcessing?: boolean;
  registrationRef: string;
  name: string;
  category: string;
  isPermanent?: boolean;
}

export const AdminArchiveConfirmModal: React.FC<AdminArchiveModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isProcessing = false,
  registrationRef,
  name,
  category,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-dialog-title"
      className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={() => {
        if (!isProcessing) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 id="archive-dialog-title" className="text-base font-bold text-slate-900 leading-snug">
                Archive Registration?
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Remove from active operational lists
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            You are about to remove this registration from the active submissions list. This will filter it out of gate check-ins and operational dashboards.
          </p>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Reference:</span>
              <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                {registrationRef}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Name / Team:</span>
              <span className="font-semibold text-slate-900 truncate max-w-[220px]">
                {name}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Category:</span>
              <span className="font-medium text-slate-700">
                {category}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-normal flex items-start gap-1.5 bg-blue-50/60 p-2.5 rounded-lg border border-blue-100 text-blue-900">
            <Archive size={14} className="shrink-0 mt-0.5 text-blue-600" />
            <span>
              <strong>Safe Recovery Guaranteed:</strong> Associated player rosters, timestamps, and contact data are safely retained. Administrators can restore this record at any time from the Archived view.
            </span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Archiving...</span>
              </>
            ) : (
              <>
                <Archive size={13} />
                <span>Confirm Archive</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
