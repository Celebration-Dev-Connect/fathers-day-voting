import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

function extractToken(decoded: string): string | null {
  try {
    const url = new URL(decoded);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("v");
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  } catch {
    // not a URL
  }
  return null;
}

export function QrScanner({
  onScan,
  onClose,
}: {
  onScan: (token: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let done = false;

    async function startScanner() {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (done) return;

      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result, _err, controls) => {
          if (done) return;
          if (result) {
            const token = extractToken(result.getText());
            if (token) {
              done = true;
              controls.stop();
              onScanRef.current(token);
            }
          }
        },
      );
      if (done) controls.stop();
      else controlsRef.current = controls;
    }

    void startScanner().catch((err: Error) => {
      setError(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Allow access in your browser settings."
          : "Unable to start camera. Try using your phone's camera app instead.",
      );
    });

    return () => {
      done = true;
      controlsRef.current?.stop();
    };
  }, []);

  return (
    <div className="qr-scanner-overlay" onClick={onClose}>
      <div className="qr-scanner-modal" onClick={(e) => e.stopPropagation()}>
        <button className="qr-scanner-close" onClick={onClose} aria-label="Close scanner">
          ✕
        </button>
        <p className="qr-scanner-label">Point your camera at a QR code</p>
        <div className="qr-scanner-viewport">
          <video ref={videoRef} className="qr-scanner-video" autoPlay muted playsInline />
          <div className="qr-scanner-reticle" />
        </div>
        {error && <p className="qr-scanner-error">{error}</p>}
      </div>
    </div>
  );
}
