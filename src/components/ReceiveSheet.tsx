import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { NonSelectableText } from "@/components/NonSelectableText";
import { WalletQrCode } from "@/components/qr/WalletQrCode";
import { buildCcxPaymentUri } from "@/services/conceal/ConcealWalletAdapter";
import { shortAddress } from "@/utils/format";

type Props = {
  address: string;
  paymentId?: string;
};

type QrFace = "address" | "paymentId";

export function ReceiveSheet({ address, paymentId }: Props) {
  const [showFull, setShowFull] = useState(false);
  const [qrFace, setQrFace] = useState<QrFace>("address");

  const paymentUri = paymentId
    ? buildCcxPaymentUri({ address, paymentId })
    : buildCcxPaymentUri({ address });

  const showingPid = qrFace === "paymentId" && Boolean(paymentId);
  const qrValue = showingPid ? (paymentId as string) : paymentUri;
  const qrKind = showingPid ? "paymentId" : "address";

  return (
    <div className="stack stack--gap-4">
      <div className="center stack stack--gap-3">
        <WalletQrCode value={qrValue} kind={qrKind} />
        <div className="eyebrow">
          {showingPid ? "Payment ID" : "Your Conceal address"}
        </div>
        <NonSelectableText
          className="mono"
          style={{
            fontSize: 12,
            wordBreak: "break-all",
            padding: "0 12px",
            color: "var(--text-muted)",
          }}
        >
          {showingPid
            ? showFull
              ? paymentId
              : shortAddress(paymentId ?? "", 12, 12)
            : showFull
              ? address
              : shortAddress(address, 12, 12)}
        </NonSelectableText>
        <div className="row-flex" style={{ gap: 8, justifyContent: "center" }}>
          <CopyButton value={showingPid ? (paymentId ?? "") : address} />
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => setShowFull((s) => !s)}
          >
            {showFull ? <EyeOff size={13} /> : <Eye size={13} />}{" "}
            {showFull ? "Hide" : "Reveal"}
          </button>
        </div>
        {paymentId && (
          <div
            className="row-flex"
            style={{ gap: 8, justifyContent: "center" }}
          >
            <button
              type="button"
              className={`btn btn--sm ${qrFace === "address" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setQrFace("address")}
            >
              Address
            </button>
            <button
              type="button"
              className={`btn btn--sm ${qrFace === "paymentId" ? "btn--primary" : "btn--secondary"}`}
              onClick={() => setQrFace("paymentId")}
            >
              Payment ID
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
