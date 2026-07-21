import { Camera } from "lucide-react";
import { useState } from "react";
import { QrCameraScanner } from "@/components/qr/QrCameraScanner";
import { Sheet } from "@/components/Sheet";
import {
  parseScannedSendPayload,
  type ScannedSendDraft,
} from "@/lib/parse-scanned-payload";

/** Always-visible camera trigger for CCX address fields (smartphone-first). */
export function AddressQrScanButton({
  onScan,
  disabled,
  className,
  style,
}: {
  onScan: (draft: ScannedSendDraft) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  function handleDecode(payload: string) {
    const draft = parseScannedSendPayload(payload);
    if (!draft?.address.trim()) {
      setScanError("Couldn't read a Conceal address from that QR.");
      return;
    }
    onScan(draft);
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
        aria-label="Scan address QR code"
      >
        <Camera size={16} aria-hidden="true" />
      </button>
      <Sheet open={open} title="Scan address" onClose={() => setOpen(false)}>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
          Point the camera at a Conceal payment or address QR code.
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
