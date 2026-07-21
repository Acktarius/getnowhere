import { Check, Copy, Eye, EyeOff, Link2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
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

export function ReceiveSheet({ address, paymentId }: Props) {
  const [copiedAddr, copyAddr] = useCopy();
  const [copiedPid, copyPid] = useCopy();
  const [copiedInt, copyInt] = useCopy();
  const [showFull, setShowFull] = useState(false);
  const [integrated, setIntegrated] = useState<string | null>(null);
  const [intError, setIntError] = useState<string | null>(null);

  // REAL SDK: makeIntegratedAddress embeds a 16-hex (8-byte) payment ID
  // directly into the address, so the sender doesn't need a separate field.
  function generateIntegrated() {
    setIntError(null);
    try {
      const pid16 = generatePaymentId().slice(0, 16);
      const intAddr = makeIntegratedCcxAddress(address, pid16);
      setIntegrated(intAddr);
    } catch (e) {
      setIntError((e as Error).message);
    }
  }

  // REAL SDK: buildPaymentUri produces the CoinUri payment link (bare address
  // + query params) that Conceal wallets scan from QR codes.
  const paymentUri = integrated
    ? buildCcxPaymentUri({ address: integrated })
    : paymentId
      ? buildCcxPaymentUri({ address, paymentId })
      : buildCcxPaymentUri({ address });

  return (
    <div className="stack stack--gap-4">
      <div className="center stack stack--gap-3">
        <div
          style={{
            padding: 16,
            background: "#fff",
            borderRadius: 16,
            display: "inline-flex",
          }}
        >
          <QRCodeSVG
            value={paymentUri}
            size={180}
            bgColor="#ffffff"
            fgColor="#0a0b0f"
            level="M"
          />
        </div>
        <div className="eyebrow">
          {integrated ? "Integrated address" : "Your Conceal address"}
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
          {showFull
            ? (integrated ?? address)
            : shortAddress(integrated ?? address, 12, 12)}
        </div>
        <div className="row-flex" style={{ gap: 8, justifyContent: "center" }}>
          <button
            className="btn btn--sm btn--secondary"
            onClick={() => copyAddr(integrated ?? address)}
          >
            {copiedAddr ? <Check size={13} /> : <Copy size={13} />}{" "}
            {copiedAddr ? "Copied" : "Copy address"}
          </button>
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => setShowFull((s) => !s)}
          >
            {showFull ? <EyeOff size={13} /> : <Eye size={13} />}{" "}
            {showFull ? "Hide" : "Reveal"}
          </button>
        </div>
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

      {paymentId && !integrated && (
        <div className="card card--pad-md">
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Payment ID for this receive
          </div>
          <div
            className="mono"
            style={{ fontSize: 11.5, wordBreak: "break-all" }}
          >
            {paymentId}
          </div>
          <button
            className="btn btn--sm btn--ghost"
            style={{ marginTop: 10 }}
            onClick={() => copyPid(paymentId)}
          >
            {copiedPid ? <Check size={13} /> : <Copy size={13} />}{" "}
            {copiedPid ? "Copied" : "Copy payment ID"}
          </button>
        </div>
      )}
      <p className="field__hint center">
        Share this address out of band. An integrated address embeds the payment
        ID so the sender doesn't need a separate field.
      </p>
    </div>
  );
}
