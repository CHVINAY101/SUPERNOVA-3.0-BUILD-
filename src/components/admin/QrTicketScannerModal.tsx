import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { parseSecureQrPayload } from "@/lib/ticketing";
import {
  QrScanDeduplicator,
  checkCameraEnvironmentSupport,
  classifyCameraError,
  selectPreferredCamera,
  stopAllMediaTracks,
  type CameraDeviceInfo,
} from "@/lib/qrScannerEngine";
import { Camera, CameraOff, QrCode, X, Keyboard } from "lucide-react";

interface QrTicketScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (rawPayloadOrRef: string) => void;
  title?: string;
}

export function QrTicketScannerModal({
  isOpen,
  onClose,
  onScanSuccess,
  title = "Scan Event Pass QR",
}: QrTicketScannerModalProps) {
  const location = useLocation();
  const initialPathRef = useRef(location.pathname);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const regionIdRef = useRef(`sn3-qr-reader-${Math.random().toString(36).slice(2, 8)}`);
  const dedupRef = useRef(new QrScanDeduplicator(2500));

  const [cameraState, setCameraState] = useState<"starting" | "active" | "error">("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const handledRef = useRef(false);

  const stopCamera = useCallback(async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
      } catch {
        // ignore cleanup errors if camera already stopped
      }
      try {
        instance.clear();
      } catch {
        // ignore
      }
    }
    stopAllMediaTracks(containerRef.current);
  }, []);

  useEffect(() => {
    if (location.pathname !== initialPathRef.current) {
      initialPathRef.current = location.pathname;
      if (isOpen) {
        void stopCamera().then(onClose);
      }
    }
  }, [location.pathname, isOpen, onClose, stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      void stopCamera();
      return;
    }

    handledRef.current = false;
    dedupRef.current.reset();
    setCameraState("starting");
    setCameraError(null);
    setManualCode("");

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      const support = checkCameraEnvironmentSupport();
      if (!support.supported) {
        if (!cancelled) {
          setCameraState("error");
          setCameraError(support.message || "Camera access unsupported in this browser.");
        }
        return;
      }

      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cancelled) return;

        const camList: CameraDeviceInfo[] = (cameras || []).map((c) => ({
          id: c.id,
          label: c.label,
        }));
        const selection = selectPreferredCamera(camList);
        if (!selection.ok) {
          setCameraState("error");
          setCameraError(selection.error);
          return;
        }

        const qr = new Html5Qrcode(regionIdRef.current, { verbose: false });
        scannerRef.current = qr;

        const onDecoded = (decodedText: string) => {
          if (handledRef.current || cancelled) return;
          const decision = dedupRef.current.evaluateScan(decodedText);
          if (!decision.accept) {
            if (decision.reason === "invalid_qr") {
              setCameraError(
                decision.errorMessage ||
                  "QR code does not contain a valid Supernova ticket reference or token."
              );
            }
            return;
          }
          handledRef.current = true;
          dedupRef.current.beginVerification(decodedText);
          void stopCamera().then(() => {
            onScanSuccess(decodedText.trim());
            onClose();
          });
        };

        try {
          await qr.start(selection.config, { fps: 10, qrbox: { width: 220, height: 220 } }, onDecoded, () => {});
        } catch (startErr) {
          if (typeof selection.config !== "string" && camList.length > 0) {
            await qr.start(camList[0].id, { fps: 10, qrbox: { width: 220, height: 220 } }, onDecoded, () => {});
          } else {
            throw startErr;
          }
        }

        if (cancelled) {
          await stopCamera();
          return;
        }

        setCameraState("active");
      } catch (err) {
        if (!cancelled) {
          const info = classifyCameraError(err);
          setCameraState("error");
          setCameraError(info.message);
          void stopCamera();
        }
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void stopCamera();
    };
  }, [isOpen, onClose, onScanSuccess, stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void stopCamera().then(onClose);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, stopCamera]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseSecureQrPayload(manualCode);
    if (!parsed.ok) {
      setCameraError("Enter a valid ticket code or pass reference (e.g. SN3-VIS-205118 or SN3-26-102345).");
      return;
    }
    void stopCamera().then(() => {
      onScanSuccess(manualCode.trim());
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      onClick={() => {
        void stopCamera().then(onClose);
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden text-slate-900"
      >
        <div className="p-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center border border-cyan-500/40">
              <QrCode size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold m-0 text-white">{title}</h3>
              <p className="text-[11px] font-mono text-cyan-300 m-0">
                Server-verified reference lookup
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void stopCamera().then(onClose);
            }}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            aria-label="Close scanner"
          >
            <X size={18} />
          </button>
        </div>

        <div ref={containerRef} className="p-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-950 overflow-hidden relative min-h-[240px] flex items-center justify-center">
            <div id={regionIdRef.current} className="w-full" />
            {cameraState === "active" && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div className="relative w-48 h-48">
                  <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-[#D5F542] rounded-tl-lg" />
                  <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-[#D5F542] rounded-tr-lg" />
                  <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-[#38BDF8] rounded-bl-lg" />
                  <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-[#38BDF8] rounded-br-lg" />
                </div>
              </div>
            )}
            {cameraState === "starting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-slate-300 text-xs font-mono p-4 text-center">
                <Camera size={24} className="text-cyan-400" />
                <span>Initializing camera stream...</span>
              </div>
            )}
            {cameraState === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 text-slate-300 text-xs p-5 text-center">
                <CameraOff size={26} className="text-amber-400" />
                <p className="font-semibold text-white m-0">Camera Scanner Unavailable</p>
                <p className="text-slate-400 m-0 leading-relaxed">{cameraError}</p>
              </div>
            )}
          </div>

          {cameraError && cameraState !== "error" && (
            <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5 m-0">
              {cameraError}
            </p>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-2.5 pt-2 border-t border-slate-200">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Keyboard size={14} className="text-slate-500" />
              <span>Manual Ticket ID / QR Payload</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. SN3-VIS-205118 or SN3-ESP-102345-P1"
                className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-300 text-xs sm:text-sm text-slate-900 font-mono focus:outline-hidden focus:border-blue-600"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Lookup
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
