import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  QrScanDeduplicator,
  checkCameraEnvironmentSupport,
  classifyCameraError,
  selectPreferredCamera,
  stopAllMediaTracks,
} from "./qrScannerEngine.ts";
import {
  InMemoryTicketStore,
  buildSecureQrPayload,
  evaluateTicketStatus,
} from "./ticketing.ts";

describe("Gate Camera QR Scanner Engine", () => {
  it("requires HTTPS or localhost and MediaDevices API support", () => {
    const httpsOk = checkCameraEnvironmentSupport({
      isSecureContext: true,
      protocol: "https:",
      hostname: "supernova.nationalcollege.edu",
      hasMediaDevices: true,
    });
    assert.equal(httpsOk.supported, true);

    const localhostOk = checkCameraEnvironmentSupport({
      isSecureContext: true,
      protocol: "http:",
      hostname: "localhost",
      hasMediaDevices: true,
    });
    assert.equal(localhostOk.supported, true);

    const insecureHttp = checkCameraEnvironmentSupport({
      isSecureContext: false,
      protocol: "http:",
      hostname: "192.168.1.45",
      hasMediaDevices: true,
    });
    assert.equal(insecureHttp.supported, false);
    assert.equal(insecureHttp.errorKind, "insecure_context");

    const noMediaDevices = checkCameraEnvironmentSupport({
      isSecureContext: true,
      protocol: "https:",
      hostname: "supernova.nationalcollege.edu",
      hasMediaDevices: false,
    });
    assert.equal(noMediaDevices.supported, false);
    assert.equal(noMediaDevices.errorKind, "unsupported_browser");
  });

  it("prefers rear/environment camera on mobile devices and falls back cleanly on desktop", () => {
    const labeledMobile = selectPreferredCamera([
      { id: "cam-front", label: "Front Camera" },
      { id: "cam-back-uw", label: "Back Ultra Wide Camera" },
      { id: "cam-back-main", label: "camera2 0, facing back" },
    ]);
    assert.equal(labeledMobile.ok, true);
    if (labeledMobile.ok) {
      assert.equal(labeledMobile.strategy, "deviceId");
      assert.equal(labeledMobile.config, "cam-back-main");
    }

    const unlabeledMobile = selectPreferredCamera([
      { id: "cam-0", label: "" },
      { id: "cam-1", label: "" },
    ]);
    assert.equal(unlabeledMobile.ok, true);
    if (unlabeledMobile.ok) {
      assert.equal(unlabeledMobile.strategy, "facingMode");
      assert.deepEqual(unlabeledMobile.config, { facingMode: "environment" });
    }

    const desktopWebcam = selectPreferredCamera([
      { id: "usb-webcam-1", label: "Logitech HD Pro Webcam C920" },
    ]);
    assert.equal(desktopWebcam.ok, true);
    if (desktopWebcam.ok) {
      assert.equal(desktopWebcam.strategy, "deviceId");
      assert.equal(desktopWebcam.config, "usb-webcam-1");
    }

    const none = selectPreferredCamera([]);
    assert.equal(none.ok, false);
  });

  it("classifies browser permission denial, unavailable camera, and busy camera errors", () => {
    const denied = classifyCameraError(
      Object.assign(new Error("Permission denied"), { name: "NotAllowedError" })
    );
    assert.equal(denied.kind, "permission_denied");

    const notFound = classifyCameraError(
      Object.assign(new Error("Requested device not found"), { name: "NotFoundError" })
    );
    assert.equal(notFound.kind, "no_camera");

    const busy = classifyCameraError(
      Object.assign(new Error("Could not start video source"), { name: "NotReadableError" })
    );
    assert.equal(busy.kind, "camera_in_use");

    const overconstrained = classifyCameraError(
      Object.assign(new Error("Constraint unsupported"), { name: "OverconstrainedError" })
    );
    assert.equal(overconstrained.kind, "overconstrained");
  });

  it("prevents repeated scans while verification is in flight and while the same ticket is locked", () => {
    const dedup = new QrScanDeduplicator(3000);
    const payloadA = buildSecureQrPayload("SN3-26-100101", "a".repeat(64));
    const payloadB = buildSecureQrPayload("SN3-26-100102", "b".repeat(64));

    const first = dedup.evaluateScan(payloadA, 1000);
    assert.equal(first.accept, true);
    assert.equal(first.parsed?.ticketRef, "SN3-26-100101");
    assert.equal(first.parsed?.qrToken, "a".repeat(64));

    dedup.beginVerification(payloadA, 1000);
    assert.equal(dedup.processing, true);

    assert.equal(dedup.evaluateScan(payloadA, 1100).accept, false);
    assert.equal(dedup.evaluateScan(payloadA, 1100).reason, "processing");
    assert.equal(dedup.evaluateScan(payloadB, 1150).accept, false);
    assert.equal(dedup.evaluateScan(payloadB, 1150).reason, "processing");

    dedup.finishVerification({ lockPayload: true });
    assert.equal(dedup.processing, false);
    assert.equal(dedup.evaluateScan(payloadA, 2000).accept, false);
    assert.equal(dedup.evaluateScan(payloadA, 2000).reason, "locked");

    const nextTicket = dedup.evaluateScan(payloadB, 2100);
    assert.equal(nextTicket.accept, true);

    dedup.unlock();
    assert.equal(dedup.evaluateScan(payloadA, 2200).accept, true);
  });

  it("rejects invalid QR codes, verifies VALID -> atomic check-in -> ALREADY USED, and ignores forged claims", async () => {
    const dedup = new QrScanDeduplicator(3000);
    const store = new InMemoryTicketStore();
    const token = "d".repeat(64);
    const issued = store.issueTicket({
      registrationId: "reg-cam-1",
      category: "visitor",
      registrationRef: "SN3-26-555111",
      ticketRef: "SN3-26-555111",
      qrToken: token,
      displayName: "Meera Nair",
      registration: { status: "confirmed" },
    });
    assert.equal(issued.ok, true);

    // 1. Invalid non-Supernova QR
    const badScan = dedup.evaluateScan("https://evil.example/claim?valid=true", 1000);
    assert.equal(badScan.accept, false);
    assert.equal(badScan.reason, "invalid_qr");

    // 2. Forged status claims inside QR JSON cannot override DB pending/tampered token
    const tamperedScan = dedup.evaluateScan(
      JSON.stringify({ v: 1, ref: "SN3-26-555111", token: "e".repeat(64), status: "confirmed", valid: true }),
      5000
    );
    assert.equal(tamperedScan.accept, true);
    assert.equal(tamperedScan.parsed?.ignoredUntrustedClaims, true);
    const tamperedEval = evaluateTicketStatus({
      ticket: issued.ticket!,
      registration: { status: "confirmed" },
      suppliedTicketRef: tamperedScan.parsed?.ticketRef,
      suppliedQrToken: tamperedScan.parsed?.qrToken,
    });
    assert.equal(tamperedEval.verdict, "INVALID");

    // 3. Valid QR scan -> VALID -> atomic check-in -> repeated check-in returns ALREADY USED
    const validQr = buildSecureQrPayload("SN3-26-555111", token);
    const validScan = dedup.evaluateScan(validQr, 9000);
    assert.equal(validScan.accept, true);

    const firstEval = evaluateTicketStatus({
      ticket: issued.ticket!,
      registration: { status: "confirmed" },
      suppliedTicketRef: validScan.parsed?.ticketRef,
      suppliedQrToken: validScan.parsed?.qrToken,
    });
    assert.equal(firstEval.verdict, "VALID");
    assert.equal(firstEval.canCheckIn, true);

    const firstCheckin = await store.atomicCheckIn({
      ticketRef: "SN3-26-555111",
      qrToken: token,
      staffEmail: "gate.staff@nationalcollege.edu",
      registration: { status: "confirmed" },
    });
    assert.equal(firstCheckin.ok, true);
    assert.equal(firstCheckin.verdict, "VALID");

    // Repeated check-in must be blocked as ALREADY USED
    const repeatCheckin = await store.atomicCheckIn({
      ticketRef: "SN3-26-555111",
      qrToken: token,
      staffEmail: "gate.staff@nationalcollege.edu",
      registration: { status: "confirmed" },
    });
    assert.equal(repeatCheckin.ok, false);
    assert.equal(repeatCheckin.verdict, "ALREADY USED");
  });

  it("stops every active MediaStreamTrack and clears video.srcObject on scanner shutdown", () => {
    let stopCount = 0;
    const fakeVideoA = {
      srcObject: {
        getTracks: () => [
          { stop: () => { stopCount += 1; } },
          { stop: () => { stopCount += 1; } },
        ],
      },
    };
    const fakeVideoB = {
      srcObject: {
        getTracks: () => [{ stop: () => { stopCount += 1; } }],
      },
    };

    const fakeContainer = {
      querySelectorAll: (selector: string) => {
        assert.equal(selector, "video");
        return [fakeVideoA, fakeVideoB];
      },
    } as unknown as HTMLElement;

    const stopped = stopAllMediaTracks(fakeContainer);
    assert.equal(stopped, 3);
    assert.equal(stopCount, 3);
    assert.equal(fakeVideoA.srcObject, null);
    assert.equal(fakeVideoB.srcObject, null);
  });
});
