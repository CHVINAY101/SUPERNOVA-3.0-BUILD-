import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import {
  Camera,
  CameraOff,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  SwitchCamera,
  X,
} from "lucide-react";
import {
  QrScanDeduplicator,
  checkCameraEnvironmentSupport,
  classifyCameraError,
  selectPreferredCamera,
  stopAllMediaTracks,
  type CameraDeviceInfo,
  type CameraErrorInfo,
} from "@/lib/qrScannerEngine";

export interface LiveGateQrScannerProps {
  active: boolean;
  isAuthorized: boolean;
  onStop: () => void;
  onVerifyDecodedQr: (decodedText: string) => Promise<void>;
  onInvalidQrScan: (reason: string) => void;
  title?: string;
}

export function LiveGateQrScanner({
  active,
  isAuthorized,
  onStop,
  onVerifyDecodedQr,
  onInvalidQrScan,
  title = "Live Gate Camera QR Scanner",
}: LiveGateQrScannerProps) {
  const location = useLocation();
  const initialPathRef = useRef(location.pathname);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const regionIdRef = useRef(`sn3-gate-qr-${Math.random().toString(36).slice(2, 8)}`);
  const dedupRef = useRef(new QrScanDeduplicator(3000));
  const mountedRef = useRef(true);

  const onVerifyRef = useRef(onVerifyDecodedQr);
  const onInvalidRef = useRef(onInvalidQrScan);
  const onStopRef = useRef(onStop);

  useEffect(() => {
    onVerifyRef.current = onVerifyDecodedQr;
  }, [onVerifyDecodedQr]);

  useEffect(() => {
    onInvalidRef.current = onInvalidQrScan;
  }, [onInvalidQrScan]);

  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  const [cameraState, setCameraState] = useState<
    "idle" | "starting" | "active" | "verifying" | "error"
  >("idle");
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
  const [scanNotice, setScanNotice] = useState<{
    type: "info" | "invalid";
    text: string;
  } | null>(null);
  const [cameras, setCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [activeCameraLabel, setActiveCameraLabel] = useState<string>("Rear Camera Preferred");
  const [scanLocked, setScanLocked] = useState(false);
  const [restartToken, setRestartToken] = useState(0);

  const stopCameraTracks = useCallback(async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
      } catch {
        // ignore stop failure when stream already stopped
      }
      try {
        instance.clear();
      } catch {
        // ignore clear failure
      }
    }
    stopAllMediaTracks(containerRef.current);
  }, []);

  // Automatically shut down camera when navigating away to another route
  useEffect(() => {
    if (location.pathname !== initialPathRef.current) {
      initialPathRef.current = location.pathname;
      if (active) {
        void stopCameraTracks();
        onStopRef.current();
      }
    }
  }, [location.pathname, active, stopCameraTracks]);

  // Ensure tracks stop on tab close / pagehide / component unmount
  useEffect(() => {
    mountedRef.current = true;
    const handlePageHide = () => {
      void stopCameraTracks();
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      void stopCameraTracks();
    };
  }, [stopCameraTracks]);

  // Start / stop camera lifecycle strictly controlled by `active` + `isAuthorized`
  useEffect(() => {
    if (!active || !isAuthorized) {
      dedupRef.current.reset();
      setScanLocked(false);
      setScanNotice(null);
      setCameraError(null);
      setCameraState("idle");
      void stopCameraTracks();
      return;
    }

    let cancelled = false;
    dedupRef.current.reset();
    setScanLocked(false);
    setScanNotice(null);
    setCameraError(null);
    setCameraState("starting");

    const startTimer = window.setTimeout(async () => {
      if (cancelled) return;

      const support = checkCameraEnvironmentSupport();
      if (!support.supported) {
        if (!cancelled && mountedRef.current) {
          setCameraState("error");
          setCameraError({
            kind: support.errorKind || "unsupported_browser",
            title:
              support.errorKind === "insecure_context"
                ? "HTTPS Required for Camera"
                : "Browser Camera Unsupported",
            message:
              support.message ||
              "Camera access is unavailable in this browser context. Use Manual Ticket Search below.",
          });
        }
        return;
      }

      try {
        await stopCameraTracks();
        if (cancelled) return;

        const detected = await Html5Qrcode.getCameras();
        if (cancelled) return;

        const cameraList: CameraDeviceInfo[] = (detected || []).map((c) => ({
          id: c.id,
          label: c.label,
        }));

        if (mountedRef.current) {
          setCameras(cameraList);
        }

        let startConfig: string | { facingMode: "environment" };
        let labelToShow = "Rear / Environment Camera";

        if (
          selectedCameraId &&
          cameraList.some((cam) => cam.id === selectedCameraId)
        ) {
          startConfig = selectedCameraId;
          labelToShow =
            cameraList.find((cam) => cam.id === selectedCameraId)?.label ||
            "Selected Camera";
        } else {
          const selection = selectPreferredCamera(cameraList);
          if (!selection.ok) {
            if (!cancelled && mountedRef.current) {
              setCameraState("error");
              setCameraError({
                kind: "no_camera",
                title: "No Camera Available",
                message: selection.error,
              });
            }
            return;
          }
          startConfig = selection.config;
          labelToShow = selection.label;
        }

        const qr = new Html5Qrcode(regionIdRef.current, { verbose: false });
        scannerRef.current = qr;

        const scanConfig = {
          fps: 10,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.max(180, Math.min(280, Math.floor(minEdge * 0.7)));
            return { width: size, height: size };
          },
          aspectRatio: 1.333334,
        };

        const handleDecodedFrame = (decodedText: string) => {
          if (cancelled || !mountedRef.current) return;
          const decision = dedupRef.current.evaluateScan(decodedText);
          if (!decision.accept) {
            if (decision.reason === "invalid_qr") {
              const reason =
                decision.errorMessage ||
                "INVALID — Scanned QR code is not a valid Supernova 3.0 pass.";
              setScanNotice({ type: "invalid", text: reason });
              onInvalidRef.current(reason);
            }
            return;
          }

          dedupRef.current.beginVerification(decodedText);
          setCameraState("verifying");
          setScanLocked(true);
          setScanNotice({
            type: "info",
            text: "QR token detected. Verifying authenticity with Supabase...",
          });

          void onVerifyRef
            .current(decodedText.trim())
            .finally(() => {
              dedupRef.current.finishVerification({ lockPayload: true });
              if (!cancelled && mountedRef.current) {
                setCameraState("active");
                setScanNotice(null);
              }
            });
        };

        try {
          await qr.start(startConfig, scanConfig, handleDecodedFrame, () => {
            // frame misses are normal during continuous scanning
          });
        } catch (startErr) {
          // If facingMode: "environment" constraint fails on desktop/edge device, fall back to first camera ID
          if (typeof startConfig !== "string" && cameraList.length > 0) {
            await qr.start(cameraList[0].id, scanConfig, handleDecodedFrame, () => {});
            labelToShow = cameraList[0].label || "Default Camera";
          } else {
            throw startErr;
          }
        }

        // Handle cancellation race if user closed/navigated away while qr.start() was awaiting
        if (cancelled || !mountedRef.current) {
          try {
            if (qr.isScanning) await qr.stop();
            qr.clear();
          } catch {
            // ignore
          }
          stopAllMediaTracks(containerRef.current);
          return;
        }

        // Re-enumerate cameras now that permission was granted so mobile camera labels appear
        try {
          const postPermCameras = await Html5Qrcode.getCameras();
          if (!cancelled && mountedRef.current && postPermCameras.length > 0) {
            const labeled = postPermCameras.map((c) => ({ id: c.id, label: c.label }));
            setCameras(labeled);
            if (!selectedCameraId) {
              const postSel = selectPreferredCamera(labeled);
              if (postSel.ok) {
                labelToShow = postSel.label;
              }
            }
          }
        } catch {
          // ignore secondary label refresh failure
        }

        if (!cancelled && mountedRef.current) {
          setActiveCameraLabel(labelToShow);
          setCameraState("active");
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setCameraState("error");
          setCameraError(classifyCameraError(err));
          void stopCameraTracks();
        }
      }
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      void stopCameraTracks();
    };
  }, [active, isAuthorized, selectedCameraId, restartToken, stopCameraTracks]);

  if (!active) return null;

  const handleScanNext = () => {
    dedupRef.current.unlock();
    setScanLocked(false);
    setScanNotice(null);
  };

  return (
    <section
      aria-label="Live QR Camera Scanner"
      className="bg-[#0B1120] text-white border-2 border-slate-800 rounded-2xl overflow-hidden shadow-lg"
    >
      {/* Scanner Header Bar */}
      <div className="px-4 sm:px-5 py-3.5 bg-[#0F172A] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              cameraState === "active"
                ? "bg-[#D5F542] animate-pulse"
                : cameraState === "verifying"
                ? "bg-cyan-400 animate-ping"
                : cameraState === "error"
                ? "bg-rose-500"
                : "bg-amber-400 animate-pulse"
            }`}
          />
          <div>
            <h2 className="text-sm sm:text-base font-display font-black uppercase tracking-tight text-white m-0">
              {title}
            </h2>
            <p className="text-[11px] font-mono text-cyan-300 m-0">
              {cameraState === "verifying"
                ? "Verifying QR token with server — repeated scans paused"
                : cameraState === "active"
                ? `Camera active (${activeCameraLabel}) · Never trusts QR without DB verification`
                : cameraState === "starting"
                ? "Requesting camera permission..."
                : "Camera standby — manual search remains active below"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {cameras.length > 1 && cameraState !== "error" && (
            <label className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-xl px-2.5 h-10 text-xs text-slate-200">
              <SwitchCamera size={14} className="text-cyan-300 shrink-0" />
              <select
                aria-label="Select camera device"
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
                className="bg-transparent text-xs font-mono text-white focus:outline-hidden cursor-pointer max-w-[170px]"
              >
                <option value="" className="bg-slate-900 text-white">
                  Auto (Rear Preferred)
                </option>
                {cameras.map((cam, idx) => (
                  <option key={cam.id} value={cam.id} className="bg-slate-900 text-white">
                    {cam.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          {scanLocked && (
            <button
              type="button"
              onClick={handleScanNext}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-[#D5F542] hover:bg-[#c6e830] text-[#0B1120] font-mono text-xs font-black uppercase cursor-pointer"
            >
              <ScanLine size={14} />
              <span>Scan Next Ticket</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              void stopCameraTracks().then(() => onStop());
            }}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
          >
            <X size={15} />
            <span>Stop Camera</span>
          </button>
        </div>
      </div>

      {/* Live Video Preview + QR Scanning Frame */}
      <div ref={containerRef} className="p-4 sm:p-5 space-y-3">
        <div className="relative mx-auto max-w-xl rounded-2xl overflow-hidden bg-slate-950 border border-slate-700/80 min-h-[260px] sm:min-h-[320px] flex items-center justify-center">
          <div id={regionIdRef.current} className="w-full" />

          {/* Corner QR Scanning Reticle Overlay when camera stream is running */}
          {(cameraState === "active" || cameraState === "verifying") && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="relative w-52 h-52 sm:w-60 sm:h-60">
                <span className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-[#D5F542] rounded-tl-xl" />
                <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-[#D5F542] rounded-tr-xl" />
                <span className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-[#38BDF8] rounded-bl-xl" />
                <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-[#38BDF8] rounded-br-xl" />
                <div className="absolute inset-x-3 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-[#D5F542] to-transparent opacity-80 animate-pulse" />
              </div>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-slate-950/85 border border-slate-700 text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-300 whitespace-nowrap">
                {cameraState === "verifying"
                  ? "Verifying Token..."
                  : scanLocked
                  ? "Ticket Captured · Tap Scan Next or Show New Pass"
                  : "Align Supernova 3.0 Pass QR Inside Frame"}
              </span>
            </div>
          )}

          {cameraState === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-slate-950/90 text-slate-200 text-xs font-mono p-5 text-center">
              <Camera size={28} className="text-[#D5F542] animate-pulse" />
              <span className="font-bold text-white">Requesting Browser Camera Access...</span>
              <span className="text-slate-400 max-w-xs">
                Approve camera permission in your browser prompt to start scanning gate passes.
              </span>
            </div>
          )}

          {cameraState === "error" && cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-200 text-xs p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-amber-300">
                <CameraOff size={24} />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-sm font-bold text-white m-0">{cameraError.title}</h3>
                <p className="text-slate-300 m-0 leading-relaxed">{cameraError.message}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setRestartToken((v) => v + 1)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <RefreshCw size={14} />
                  <span>Retry Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void stopCameraTracks().then(() => onStop());
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  <span>Use Manual Ticket Search</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {scanNotice && (
          <div
            className={`max-w-xl mx-auto px-4 py-2.5 rounded-xl border text-xs font-mono flex items-center gap-2 ${
              scanNotice.type === "invalid"
                ? "bg-rose-950/80 border-rose-500/60 text-rose-200"
                : "bg-cyan-950/80 border-cyan-500/60 text-cyan-200"
            }`}
          >
            <ShieldAlert size={15} className="shrink-0" />
            <span>{scanNotice.text}</span>
          </div>
        )}
      </div>
    </section>
  );
}
