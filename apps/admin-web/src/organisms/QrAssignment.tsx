import { QrCode, RefreshCw } from "lucide-react";
import { Alert, AuditRow, Button, QrScanner } from "@carshow/carshow-components";
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
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

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

  async function assign(codeToAssign = code) {
    setScanning(false);
    setError("");
    setMessage("");
    try {
      await lookupQrCard(codeToAssign);
      const result = await assignQrCard(registration.id, codeToAssign);
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
      <div className="qr-actions">
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="0001 or scan QR" />
        <Button variant="secondary" onClick={() => setScanning(true)}>
          <QrCode size={20} />
          Scan
        </Button>
        <Button onClick={() => void assign()} disabled={!code}>
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
      {scanning && (
        <QrScanner
          onScan={(token) => { void assign(token); }}
          onClose={() => setScanning(false)}
          mirror={window.matchMedia("(pointer: fine)").matches}
        />
      )}
    </section>
  );
}
