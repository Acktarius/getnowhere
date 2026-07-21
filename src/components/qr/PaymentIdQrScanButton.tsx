import { Camera } from "lucide-react";
import { useState } from "react";
import { QrCameraScanner } from "@/components/qr/QrCameraScanner";
import { Sheet } from "@/components/Sheet";
import { parseScannedPaymentId } from "@/lib/parse-scanned-payload";

/** Always-visible camera trigger for payment-ID fields (smartphone-first). */
export function PaymentIdQrScanButton({
  onScan,
  disabled,
  className,
  style,
}: {
  onScan: (paymentId: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  function handleDecode(payload: string) {
    const pid = parseScannedPaymentId(payload);
    if (!pid) {
      setScanError(
        "Couldn't read a payment ID from that QR (need 16- or 64-char hex).",
      );
      return;
    }
    onScan(pid);
    setScanError(null);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={`icon-btn ${className ?? ""}`}
        style={style}
        onClick={() => {
          setScanError(null);
          setOpen(true);
        }}
        disabled={disabled}
        aria-label="Scan payment ID QR code"
      >
        <Camera size={16} aria-hidden="true" />
      </button>
      <Sheet open={open} title="Scan payment ID" onClose={() => setOpen(false)}>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
          Point the camera at a payment-ID QR, or a payment URI that includes
          one.
        </p>
        {scanError && <div className="field__error">{scanError}</div>}
        <QrCameraScanner
          onDecode={handleDecode}
          onCancel={() => setOpen(false)}
        />
      </Sheet>
    </>
  );
}
