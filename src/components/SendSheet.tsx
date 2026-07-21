import { Send } from "lucide-react";
import { useState } from "react";
import { walletService } from "@/services";
import type { WalletState } from "@/types/models";
import { formatCCX, generatePaymentId } from "@/utils/format";

type Props = {
  wallet: Pick<WalletState, "balanceAvailable" | "address">;
  onSent: () => Promise<void>;
  onClose: () => void;
  prefillAddress?: string;
};

export function SendSheet({ wallet, onSent, onClose, prefillAddress }: Props) {
  const [toAddress, setToAddress] = useState(prefillAddress ?? "");
  const [amount, setAmount] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const amt = Number(amount);
  const valid =
    toAddress.length > 12 && amt > 0 && amt <= wallet.balanceAvailable;

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      await walletService.sendTransaction({
        toAddress: toAddress.trim(),
        amount: amt,
        paymentId: paymentId.trim() || undefined,
      });
      await onSent();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="stack stack--gap-4">
      <div className="field">
        <span className="field__label">Recipient CCX address</span>
        <input
          className="input input--mono"
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          placeholder="ccx7…"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="field">
        <span className="field__label">
          Amount{" "}
          <span className="faint">
            available {formatCCX(wallet.balanceAvailable)} CCX
          </span>
        </span>
        <div style={{ position: "relative" }}>
          <input
            className="input"
            style={{ paddingRight: 48 }}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
          />
          <span
            className="mono faint"
            style={{ position: "absolute", right: 14, top: 14, fontSize: 13 }}
          >
            CCX
          </span>
        </div>
      </div>
      <div className="field">
        <span className="field__label">
          Payment ID <span className="faint">optional</span>
        </span>
        <div className="row-flex" style={{ gap: 8 }}>
          <input
            className="input input--mono grow"
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            placeholder="auto-generate or paste"
          />
          <button
            className="btn btn--sm btn--secondary no-shrink"
            onClick={() => setPaymentId(generatePaymentId())}
          >
            Generate
          </button>
        </div>
        <span className="field__hint">
          A payment ID lets the recipient map this transfer back to a contact.
        </span>
      </div>

      {error && <div className="field__error">{error}</div>}

      <div className="stack stack--gap-2">
        {confirming ? (
          <>
            <div
              className="card card--pad-md"
              style={{ background: "var(--bg-elev-2)" }}
            >
              <div className="row-flex row-flex--between">
                <span className="faint">Sending</span>
                <span className="mono">{formatCCX(amt)} CCX</span>
              </div>
              <div
                className="row-flex row-flex--between"
                style={{ marginTop: 6 }}
              >
                <span className="faint">To</span>
                <span className="mono" style={{ fontSize: 11 }}>
                  {toAddress.slice(0, 10)}…{toAddress.slice(-6)}
                </span>
              </div>
              <div className="field__hint" style={{ marginTop: 8 }}>
                This transfer will be broadcast privately via Conceal. Confirm
                to proceed.
              </div>
            </div>
            <button
              className="btn btn--block btn--primary"
              disabled={busy}
              onClick={handleSend}
            >
              {busy ? "Broadcasting…" : "Confirm & send"}
            </button>
            <button
              className="btn btn--block btn--ghost"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Back
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn--block btn--primary"
              disabled={!valid}
              onClick={() => setConfirming(true)}
            >
              <Send size={16} /> Review transfer
            </button>
            <button className="btn btn--block btn--ghost" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
