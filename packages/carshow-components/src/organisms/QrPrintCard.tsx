import QRCode from "qrcode";
import { useEffect, useState } from "react";
import showLogo from "../assets/fathers-day-car-show-logo.png";
import type { QrCard } from "../types.js";

function printedCardNumber(visibleCode: string) {
  const numericCode = visibleCode.replace(/\D/g, "");
  return numericCode ? numericCode.padStart(4, "0") : visibleCode;
}

export function QrPrintCard({
  card,
  publicAppUrl,
}: {
  card: QrCard;
  publicAppUrl: string;
}) {
  const [dataUrl, setDataUrl] = useState("");
  const qrUrl = `${publicAppUrl}/v/${card.publicToken}`;

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
    <article className="qr-print-card">
      <div className="qr-print-heading">
        <img className="qr-print-logo" src={showLogo} alt="Father's Day Car Show" />
        <b>{printedCardNumber(card.visibleCode)}</b>
      </div>
      <strong className="qr-print-instruction">Scan code to Vote for Entry</strong>
      {dataUrl ? (
        <img src={dataUrl} alt={`QR code ${card.visibleCode}`} />
      ) : (
        <div className="qr-placeholder" />
      )}
    </article>
  );
}
