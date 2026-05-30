import { Car, CheckCircle2, Printer, QrCode } from "lucide-react";
import { Alert, Button, Metric, PageHeader, QrPrintCard, chunk } from "@carshow/carshow-components";
import type { QrCard } from "@carshow/carshow-components";
import { useEffect, useState } from "react";
import { listQrCards } from "../api";
import { PUBLIC_APP_URL } from "../config";

export function QrCardsView() {
  const [qrCards, setQrCards] = useState<QrCard[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    listQrCards(status)
      .then(({ qrCards }) => setQrCards(qrCards))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Could not load QR cards"),
      )
      .finally(() => setLoading(false));
  }, [status]);

  const availableCount = qrCards.filter((card) => card.status === "PRINTED").length;
  const assignedCount = qrCards.filter((card) => card.status === "ASSIGNED").length;

  return (
    <section className="qr-cards-view">
      <div className="no-print">
        <PageHeader
          eyebrow="Seeded QR Inventory"
          title="QR Cards"
          actions={
            <>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Filter QR cards"
              >
                <option value="">All Cards</option>
                <option value="PRINTED">Available</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="REASSIGNED">Reassigned</option>
                <option value="RETIRED">Retired</option>
              </select>
              <Button onClick={() => window.print()}>
                <Printer size={20} />
                Print
              </Button>
            </>
          }
        />
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="qr-summary">
          <Metric label="Loaded Cards" value={qrCards.length} icon={<QrCode />} />
          <Metric label="Available" value={availableCount} icon={<CheckCircle2 />} />
          <Metric label="Assigned" value={assignedCount} icon={<Car />} />
        </div>
        {loading ? <div className="empty-state">Loading QR cards...</div> : null}
        {!loading && !qrCards.length ? <div className="empty-state">No QR cards found.</div> : null}
      </div>

      <div className="print-sheet" aria-label="Printable QR card sheet">
        {chunk(qrCards, 4).map((pageCards, pageIndex) => (
          <div className="print-page" key={`qr-page-${pageIndex}`}>
            {pageCards.map((card) => (
              <QrPrintCard key={card.id} card={card} publicAppUrl={PUBLIC_APP_URL} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
