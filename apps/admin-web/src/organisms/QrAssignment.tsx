import { QrCode, RefreshCw } from "lucide-react";
import { Alert, AuditRow, Button } from "@carshow/carshow-components";
import type { AuditLog, Registration } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { assignQrCard, listAudit, lookupQrCard } from "../api";

export function QrAssignment({
  registration,
  onAssigned,
}: {
  registration: Registration;
  onAssigned: (registration: Registration) => void;
}) {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const cameraAvailable =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  async function refreshAudit() {
    setAuditLoading(true);
    try {
      const result = await listAudit(registration.id);
      setAuditLogs(result.auditLogs);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "Could not load QR audit trail");
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    setCode("");
    setMessage("");
    setError("");
    void refreshAudit();
  }, [registration.id]);

  async function startScan() {
    setError("");
    setMessage("");
    if (!cameraAvailable) {
      setError(
        window.isSecureContext
          ? "Camera scanning is not available in this browser. Enter the QR code manually."
          : "Camera scanning requires HTTPS on iPad/Safari. Enter the QR code manually for now.",
      );
      return;
    }
    if (!videoElement) {
      setError("Camera view is still loading. Try Scan again.");
      return;
    }
    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeOnceFromVideoDevice(undefined, videoElement);
      const scannedCode = result.getText();
      setCode(scannedCode);
      setMessage(`Scanned ${scannedCode}`);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Camera scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function assign() {
    setError("");
    setMessage("");
    try {
      await lookupQrCard(code);
      const result = await assignQrCard(registration.id, code);
      onAssigned(result.registration);
      await refreshAudit();
      setCode("");
      setMessage("QR assigned and audit log written.");
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "QR assignment failed");
    }
  }

  return (
    <section className="qr-panel">
      <div>
        <strong>{registration.qrCard ? `QR ${registration.qrCard.visibleCode}` : "Assign QR Card"}</strong>
        <span>{registration.qrCard ? "Scan a new QR to replace this card" : "Camera scan plus manual fallback"}</span>
      </div>
      <video ref={setVideoElement} className="qr-video" muted playsInline />
      <div className="qr-actions">
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="0001 or scan QR" />
        <Button variant="secondary" onClick={startScan} disabled={scanning}>
          <QrCode size={20} />
          {scanning ? "Scanning..." : "Scan"}
        </Button>
        <Button onClick={assign} disabled={!code}>
          {registration.qrCard ? "Replace QR" : "Assign"}
        </Button>
      </div>
      {message ? <Alert variant="success">{message}</Alert> : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <div className="qr-audit">
        <div className="qr-audit-header">
          <strong>Audit Trail</strong>
          <Button variant="icon" light onClick={refreshAudit} aria-label="Refresh QR audit">
            <RefreshCw size={18} />
          </Button>
        </div>
        {auditLoading ? <span>Loading audit...</span> : null}
        {!auditLoading && !auditLogs.length ? <span>No QR assignment history yet.</span> : null}
        {auditLogs.slice(0, 5).map((log) => (
          <AuditRow key={log.id} log={log} />
        ))}
      </div>
    </section>
  );
}
