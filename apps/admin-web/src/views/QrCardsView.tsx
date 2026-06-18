import { Car, CheckCircle2, Plus, Printer, QrCode } from "lucide-react";
import { Alert, Button, Metric, PageHeader, Pagination, QrPrintCard, chunk } from "@carshow/carshow-components";
import type { QrCard } from "@carshow/carshow-components";
import { useCallback, useEffect, useState } from "react";
import { generateQrCards, listQrCards } from "../api";
import { PUBLIC_APP_URL } from "../config";

export function QrCardsView() {
  const PAGE_SIZE = 50;
  const [qrCards, setQrCards] = useState<QrCard[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [quantity, setQuantity] = useState(4);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadQrCards = useCallback(() => {
    setLoading(true);
    setError("");
    setPage(0);
    listQrCards(status)
      .then(({ qrCards }) => setQrCards(qrCards))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Could not load QR cards"),
      )
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    loadQrCards();
  }, [loadQrCards]);

  async function generate() {
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const result = await generateQrCards(quantity);
      setStatus("PRINTED");
      setMessage(`Generated ${result.created} QR cards: ${result.firstCode} through ${result.lastCode}.`);
      if (status === "PRINTED") loadQrCards();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Could not generate QR cards");
    } finally {
      setGenerating(false);
    }
  }

  const availableCount = qrCards.filter((card) => card.status === "PRINTED").length;
  const assignedCount = qrCards.filter((card) => card.status === "ASSIGNED").length;
  const pageCount = Math.ceil(qrCards.length / PAGE_SIZE);
  const pagedQrCards = qrCards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className="qr-cards-view">
      <div className="no-print">
        <PageHeader
          eyebrow="Seeded QR Inventory"
          title="QR Cards"
          actions={
            <>
              <label className="qr-quantity-field">
                <span>Quantity</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={quantity}
                  disabled={generating}
                  onChange={(event) => setQuantity(Math.min(500, Math.max(1, Number(event.target.value) || 1)))}
                />
              </label>
              <Button variant="secondary" disabled={generating} onClick={() => void generate()}>
                <Plus size={20} />
                {generating ? "Generating" : "Generate"}
              </Button>
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
        {message ? <Alert variant="success">{message}</Alert> : null}
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="qr-summary">
          <Metric label="Loaded Cards" value={qrCards.length} icon={<QrCode />} />
          <Metric label="Available" value={availableCount} icon={<CheckCircle2 />} />
          <Metric label="Assigned" value={assignedCount} icon={<Car />} />
        </div>
        {loading ? <div className="empty-state">Loading QR cards...</div> : null}
        {!loading && !qrCards.length ? <div className="empty-state">No QR cards found.</div> : null}
        <Pagination
          page={page}
          pageCount={pageCount}
          total={qrCards.length}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
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
