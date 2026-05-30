import QRCode from "qrcode";
import { useEffect, useState } from "react";
import type { QrCard } from "../types.js";

export function QrPrintCard({
  card,
  publicAppUrl,
}: {
  card: QrCard;
  publicAppUrl: string;
}) {
  const [dataUrl, setDataUrl] = useState("");
  const qrUrl = `${publicAppUrl}/v/${card.publicToken}`;
  const owner = card.vehicleEntry?.owner;

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: "Q",
      margin: 2,
      width: 720,
      color: {
        dark: "#191c21",
        light: "#ffffff",
      },
    }).then((url) => {
      if (mounted) setDataUrl(url);
    });

    return () => {
      mounted = false;
    };
  }, [qrUrl]);

  return (
    <article className={`qr-print-card ${card.status.toLowerCase()}`}>
      <div className="qr-print-heading">
        <div>
          <strong>Father's Day Car Show</strong>
          <span>Celebration Church</span>
        </div>
        <b>{card.visibleCode}</b>
      </div>
      {dataUrl ? (
        <img src={dataUrl} alt={`QR code ${card.visibleCode}`} />
      ) : (
        <div className="qr-placeholder" />
      )}
      <div className="qr-print-footer">
        <span>{card.status.replace("_", " ")}</span>
        <small>{owner ? `${owner.firstName} ${owner.lastName}` : qrUrl}</small>
      </div>
    </article>
  );
}
