import { Check, Copy, Eye, EyeOff, Link2 } from "lucide-react";
import { useState } from "react";
import { WalletQrCode } from "@/components/qr/WalletQrCode";
import { useCopy } from "@/hooks/useCopy";
import {
  buildCcxPaymentUri,
  makeIntegratedCcxAddress,
} from "@/services/conceal/ConcealWalletAdapter";
import { generatePaymentId, shortAddress } from "@/utils/format";

type Props = {
  address: string;
  paymentId?: string;
};

type QrFace = "address" | "paymentId";

export function ReceiveSheet({ address, paymentId }: Props) {
  const [copiedAddr, copyAddr] = useCopy();
  const [copiedPid, copyPid] = useCopy();
  const [copiedInt, copyInt] = useCopy();
  const [showFull, setShowFull] = useState(false);
  const [integrated, setIntegrated] = useState<string | null>(null);
  const [intError, setIntError] = useState<string | null>(null);
  const [qrFace, setQrFace] = useState<QrFace>("address");

  function generateIntegrated() {
    setIntError(null);
    try {
      const pid16 = generatePaymentId().slice(0, 16);
      const intAddr = makeIntegratedCcxAddress(address, pid16);
      setIntegrated(intAddr);
      setQrFace("address");
    } catch (e) {
      setIntError((e as Error).message);
    }
  }

  const paymentUri = integrated
    ? buildCcxPaymentUri({ address: integrated })
    : paymentId
      ? buildCcxPaymentUri({ address, paymentId })
      : buildCcxPaymentUri({ address });

  const showingPid =
    qrFace === "paymentId" && Boolean(paymentId) && !integrated;
  const qrValue = showingPid ? (paymentId as string) : paymentUri;
  const qrKind = showingPid ? "paymentId" : "address";

  return (
    <div className="stack stack--gap-4">
      <div className="center stack stack--gap-3">
        <WalletQrCode value={qrValue} kind={qrKind} />
        <div className="eyebrow">
          {integrated
            ? "Integrated address"
            : showingPid
              ? "Payment ID"
              : "Your Conceal address"}
        </div>
        <div
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
              ? (integrated ?? address)
              : shortAddress(integrated ?? address, 12, 12)}
        </div>
        <div className="row-flex" style={{ gap: 8, justifyContent: "center" }}>
          <button
            className="btn btn--sm btn--secondary"
            onClick={() =>
              showingPid
                ? copyPid(paymentId ?? "")
                : copyAddr(integrated ?? address)
            }
          >
            {(showingPid ? copiedPid : copiedAddr) ? (
              <Check size={13} />
            ) : (
              <Copy size={13} />
            )}{" "}
            {(showingPid ? copiedPid : copiedAddr)
              ? "Copied"
              : showingPid
                ? "Copy payment ID"
                : "Copy address"}
          </button>
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => setShowFull((s) => !s)}
          >
            {showFull ? <EyeOff size={13} /> : <Eye size={13} />}{" "}
            {showFull ? "Hide" : "Reveal"}
          </button>
        </div>
        {paymentId && !integrated && (
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

      <button
        className="btn btn--block btn--secondary"
        onClick={generateIntegrated}
      >
        <Link2 size={15} /> Generate integrated address
      </button>
      {intError && <div className="field__error">{intError}</div>}
      {integrated && (
        <div className="card card--pad-md">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Integrated payment ID (embedded)
          </div>
          <div
            className="mono"
            style={{ fontSize: 11.5, wordBreak: "break-all" }}
          >
            {integrated.length > address.length ? "embedded in address" : "—"}
          </div>
          <button
            className="btn btn--sm btn--ghost"
            style={{ marginTop: 10 }}
            onClick={() => copyInt(integrated)}
          >
            {copiedInt ? <Check size={13} /> : <Copy size={13} />}{" "}
            {copiedInt ? "Copied" : "Copy integrated address"}
          </button>
        </div>
      )}

      <p className="field__hint center">
        Gold mark = address. Grey mark = payment ID. Share out of band; an
        integrated address embeds the payment ID for the sender.
      </p>
    </div>
  );
}
