import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { PaymentIdQrScanButton } from "@/components/qr/PaymentIdQrScanButton";
import { WalletQrCode } from "@/components/qr/WalletQrCode";
import { useCopy } from "@/hooks/useCopy";
import { shortAddress } from "@/utils/format";

type Props = {
  label: string;
  value: string;
  direction: "from" | "to";
  hint?: string;
  editable?: boolean;
  onEdit?: (v: string) => void;
  missing?: boolean;
  /** Show a chevron to expand/collapse a branded QR for this value. */
  showQr?: boolean;
  qrKind?: "address" | "paymentId";
};

export function PaymentIdField({
  label,
  value,
  direction,
  hint,
  editable,
  onEdit,
  missing,
  showQr,
  qrKind = "paymentId",
}: Props) {
  const [copied, copy] = useCopy();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [qrOpen, setQrOpen] = useState(false);

  const accent = direction === "from" ? "var(--primary)" : "var(--secondary)";

  return (
    <div
      className="card card--pad-md"
      style={{ borderColor: missing ? "var(--danger)" : "var(--border)" }}
    >
      <div className="row-flex row-flex--between" style={{ marginBottom: 8 }}>
        <span className="eyebrow" style={{ color: accent }}>
          {label}
        </span>
        <div className="row-flex" style={{ gap: 4, alignItems: "center" }}>
          {missing && (
            <span className="pill pill--pending">
              <AlertCircle size={11} /> missing
            </span>
          )}
          {showQr && value && !editing && (
            <button
              type="button"
              className="icon-btn"
              style={{ width: 28, height: 28 }}
              aria-expanded={qrOpen}
              aria-label={qrOpen ? "Hide QR code" : "Show QR code"}
              onClick={() => setQrOpen((o) => !o)}
            >
              {qrOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="stack stack--gap-2">
          <div style={{ position: "relative" }}>
            <input
              className="input input--mono"
              style={{ paddingRight: 44 }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <PaymentIdQrScanButton
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                width: 34,
                height: 34,
              }}
              onScan={setDraft}
            />
          </div>
          <div className="row-flex" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => {
                onEdit?.(draft);
                setEditing(false);
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="mono"
          style={{
            fontSize: 12.5,
            wordBreak: "break-all",
            color: value ? "var(--text)" : "var(--text-faint)",
          }}
        >
          {value ? shortAddress(value, 10, 10) : "— not set —"}
        </div>
      )}
      {showQr && value && !editing && qrOpen && (
        <div className="center" style={{ marginTop: 12 }}>
          <WalletQrCode value={value} kind={qrKind} />
        </div>
      )}
      {hint && (
        <div className="field__hint" style={{ marginTop: 8 }}>
          {hint}
        </div>
      )}
      {!editing && value && (
        <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => copy(value)}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
            {copied ? "Copied" : "Copy"}
          </button>
          {editable && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setEditing(true)}
            >
              <RefreshCw size={13} /> Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
