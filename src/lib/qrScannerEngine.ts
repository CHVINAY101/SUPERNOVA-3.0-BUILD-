import { parseSecureQrPayload, type ParsedSecureQrInput } from "./ticketing";

export interface CameraDeviceInfo {
  id: string;
  label?: string;
}

export type CameraSelectionResult =
  | {
      ok: true;
      strategy: "deviceId" | "facingMode";
      config: string | { facingMode: "environment" };
      label: string;
      preferredCameraId?: string;
    }
  | {
      ok: false;
      error: string;
    };

export type CameraErrorKind =
  | "insecure_context"
  | "unsupported_browser"
  | "permission_denied"
  | "no_camera"
  | "camera_in_use"
  | "overconstrained"
  | "unknown";

export interface CameraSupportCheck {
  supported: boolean;
  errorKind?: CameraErrorKind;
  message?: string;
}

export interface CameraErrorInfo {
  kind: CameraErrorKind;
  title: string;
  message: string;
}

export interface ScanGateDecision {
  accept: boolean;
  reason: "accepted" | "processing" | "locked" | "cooldown" | "invalid_qr";
  parsed?: ParsedSecureQrInput;
  errorMessage?: string;
}

const REAR_CAMERA_PATTERN = /\b(back|rear|environment|world|main|wide|trás|trasera|arrière)\b/i;
const FRONT_CAMERA_PATTERN = /\b(front|user|selfie|facetime|integrated front)\b/i;
const AUX_LENS_PATTERN = /\b(ultra[\s-]?wide|macro|telephoto|depth|tof)\b/i;

/**
 * Verifies the browser environment supports HTTPS (or localhost) and MediaDevices getUserMedia.
 */
export function checkCameraEnvironmentSupport(env?: {
  isSecureContext?: boolean;
  protocol?: string;
  hostname?: string;
  hasMediaDevices?: boolean;
}): CameraSupportCheck {
  const isLocalhost = (host: string) =>
    host === "localhost" || host === "127.0.0.1" || host === "[::1]";

  const runtimeProtocol =
    env?.protocol ?? (typeof window !== "undefined" ? window.location.protocol : "https:");
  const runtimeHost =
    env?.hostname ?? (typeof window !== "undefined" ? window.location.hostname : "localhost");
  const runtimeSecure =
    env?.isSecureContext ??
    (typeof window !== "undefined"
      ? window.isSecureContext || runtimeProtocol === "https:" || isLocalhost(runtimeHost)
      : true);

  if (!runtimeSecure && runtimeProtocol !== "https:" && !isLocalhost(runtimeHost)) {
    return {
      supported: false,
      errorKind: "insecure_context",
      message:
        "Camera scanning requires a secure HTTPS connection. Open this CRM portal over HTTPS or use Manual Ticket Search below.",
    };
  }

  const runtimeHasMediaDevices =
    env?.hasMediaDevices ??
    (typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices) &&
      typeof navigator.mediaDevices.getUserMedia === "function");

  if (!runtimeHasMediaDevices) {
    return {
      supported: false,
      errorKind: "unsupported_browser",
      message:
        "This browser does not support camera video capture (MediaDevices API unavailable). Use Manual Ticket Search below.",
    };
  }

  return { supported: true };
}

/**
 * Selects the optimal camera configuration:
 * - Prefers rear/environment-facing camera on mobile devices.
 * - Uses `{ facingMode: "environment" }` when labels are blank (e.g. iOS Safari / Android Chrome before permission)
 *   or multiple cameras have ambiguous labels, as required by html5-qrcode.
 * - Uses direct deviceId for single desktop webcams or explicitly labeled rear main lenses.
 */
export function selectPreferredCamera(cameras: CameraDeviceInfo[]): CameraSelectionResult {
  if (!Array.isArray(cameras) || cameras.length === 0) {
    return {
      ok: false,
      error:
        "No camera device detected on this device. Connect a webcam or use Manual Ticket Search below.",
    };
  }

  const rearCandidates = cameras.filter((cam) => {
    const label = cam.label || "";
    return REAR_CAMERA_PATTERN.test(label) && !FRONT_CAMERA_PATTERN.test(label);
  });

  if (rearCandidates.length > 0) {
    const primaryRear =
      rearCandidates.find((cam) => !AUX_LENS_PATTERN.test(cam.label || "")) || rearCandidates[0];
    return {
      ok: true,
      strategy: "deviceId",
      config: primaryRear.id,
      preferredCameraId: primaryRear.id,
      label: primaryRear.label || "Rear Camera",
    };
  }

  // On mobile devices before permission is granted, labels are often empty strings ("").
  // Using `{ facingMode: "environment" }` ensures mobile browsers open the rear camera.
  const hasBlankLabels = cameras.some((cam) => !cam.label || cam.label.trim() === "");
  if (hasBlankLabels || cameras.length > 1) {
    return {
      ok: true,
      strategy: "facingMode",
      config: { facingMode: "environment" },
      label: "Rear / Environment Camera",
    };
  }

  // Single labeled webcam (typical desktop/laptop)
  const single = cameras[0];
  return {
    ok: true,
    strategy: "deviceId",
    config: single.id,
    preferredCameraId: single.id,
    label: single.label || "Default Camera",
  };
}

/**
 * Normalizes browser camera errors into actionable messages for gate staff.
 */
export function classifyCameraError(error: unknown): CameraErrorInfo {
  const errName = String((error as any)?.name || "");
  const errMsg = String((error as any)?.message || error || "");
  const combined = `${errName} ${errMsg}`.toLowerCase();

  if (
    combined.includes("notallowederror") ||
    combined.includes("permissiondeniederror") ||
    combined.includes("permission")
  ) {
    return {
      kind: "permission_denied",
      title: "Camera Permission Denied",
      message:
        "Browser camera permission was denied. Enable camera access in your browser site settings and tap Retry Camera, or use Manual Ticket Search below.",
    };
  }

  if (
    combined.includes("notfounderror") ||
    combined.includes("devicesnotfounderror") ||
    combined.includes("no camera")
  ) {
    return {
      kind: "no_camera",
      title: "No Camera Available",
      message:
        "No active camera was found on this device. Connect a camera or use Manual Ticket Search below.",
    };
  }

  if (
    combined.includes("notreadableerror") ||
    combined.includes("trackstarterror") ||
    combined.includes("in use")
  ) {
    return {
      kind: "camera_in_use",
      title: "Camera In Use",
      message:
        "Your camera appears to be in use by another app or tab. Close the other app and tap Retry Camera.",
    };
  }

  if (
    combined.includes("overconstrainederror") ||
    combined.includes("constraintnotsatisfiederror")
  ) {
    return {
      kind: "overconstrained",
      title: "Camera Constraint Unsupported",
      message:
        "Unable to open the preferred rear camera constraint on this device. Tap Retry Camera or switch cameras.",
    };
  }

  if (combined.includes("securityerror") || combined.includes("https") || combined.includes("secure")) {
    return {
      kind: "insecure_context",
      title: "HTTPS Required for Camera",
      message:
        "Camera access requires HTTPS. Access this portal over HTTPS or use Manual Ticket Search below.",
    };
  }

  return {
    kind: "unknown",
    title: "Camera Scanner Unavailable",
    message:
      errMsg ||
      "Unable to start the camera scanner in this browser. Use Manual Ticket Search below.",
  };
}

/**
 * Deduplicates and locks QR scan callbacks so:
 * 1. Concurrent verification requests cannot overlap for the same or rapid frames.
 * 2. The same QR code cannot re-trigger while locked/within cooldown.
 * 3. Invalid / unrecognized QR codes fail gracefully with INVALID status without spamming.
 */
export class QrScanDeduplicator {
  private isProcessing = false;
  private lastPayload = "";
  private lastAcceptedAt = 0;
  private activeLockedPayload: string | null = null;
  private readonly cooldownMs: number;

  constructor(cooldownMs = 3000) {
    this.cooldownMs = cooldownMs;
  }

  get processing(): boolean {
    return this.isProcessing;
  }

  get lockedPayload(): string | null {
    return this.activeLockedPayload;
  }

  evaluateScan(rawDecodedText: string, nowMs = Date.now()): ScanGateDecision {
    if (this.isProcessing) {
      return { accept: false, reason: "processing" };
    }

    const normalized = String(rawDecodedText || "").trim();
    if (!normalized) {
      return {
        accept: false,
        reason: "invalid_qr",
        errorMessage: "Empty QR scan payload.",
      };
    }

    if (this.activeLockedPayload && normalized === this.activeLockedPayload) {
      return { accept: false, reason: "locked" };
    }

    if (this.lastPayload === normalized && nowMs - this.lastAcceptedAt < this.cooldownMs) {
      return { accept: false, reason: "cooldown" };
    }

    const parsed = parseSecureQrPayload(normalized);
    if (!parsed.ok || (!parsed.qrToken && !parsed.ticketRef)) {
      this.lastPayload = normalized;
      this.lastAcceptedAt = nowMs;
      return {
        accept: false,
        reason: "invalid_qr",
        parsed,
        errorMessage:
          "INVALID — Scanned QR code is not an official Supernova 3.0 ticket pass.",
      };
    }

    return { accept: true, reason: "accepted", parsed };
  }

  beginVerification(rawDecodedText: string, nowMs = Date.now()): void {
    const normalized = String(rawDecodedText || "").trim();
    this.isProcessing = true;
    this.lastPayload = normalized;
    this.lastAcceptedAt = nowMs;
    this.activeLockedPayload = normalized;
  }

  finishVerification(options?: { lockPayload?: boolean }): void {
    this.isProcessing = false;
    if (options?.lockPayload === false) {
      this.activeLockedPayload = null;
    }
  }

  unlock(): void {
    this.activeLockedPayload = null;
    this.lastPayload = "";
    this.lastAcceptedAt = 0;
  }

  reset(): void {
    this.isProcessing = false;
    this.unlock();
  }
}

/**
 * Forcefully stops every MediaStreamTrack attached to any <video> element inside `container`
 * so hardware camera LEDs and streams shut down immediately on close/navigation/unmount.
 */
export function stopAllMediaTracks(container?: HTMLElement | null): number {
  if (!container) return 0;
  let stoppedCount = 0;
  const videos = container.querySelectorAll("video");
  videos.forEach((video) => {
    const stream = video.srcObject as MediaStream | null;
    if (stream && typeof stream.getTracks === "function") {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
          stoppedCount += 1;
        } catch {
          // ignore track stop failure
        }
      });
    }
    try {
      video.srcObject = null;
    } catch {
      // ignore
    }
  });
  return stoppedCount;
}
