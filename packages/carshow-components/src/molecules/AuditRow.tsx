import type { AuditLog } from "../types.js";
import { formatDateTime } from "../utils.js";

export function AuditRow({ log }: { log: AuditLog }) {
  return (
    <div className="audit-row">
      <div>
        <strong>{log.action.replace("_", " ")}</strong>
        <span>
          {log.qrCard.visibleCode} by {log.staffUser.displayName}
        </span>
      </div>
      <time>{formatDateTime(log.createdAt)}</time>
    </div>
  );
}
