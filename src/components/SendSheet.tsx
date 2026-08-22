import { ChevronDown, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AddressQrScanButton } from "@/components/qr/AddressQrScanButton";
import { PaymentIdQrScanButton } from "@/components/qr/PaymentIdQrScanButton";
import { bindPointerToggle } from "@/lib/pointer-toggle";
import {
  autofillFromContact,
  contactLetterMark,
  eligibleSendContacts,
} from "@/lib/send-contact-recipient";
import { walletService } from "@/services";
import { useContactsStore } from "@/state/contactsStore";
import { toastError } from "@/state/toastStore";
import type { Contact, WalletState } from "@/types/models";
import { formatCCX, generatePaymentId } from "@/utils/format";

type Props = {
  wallet: Pick<WalletState, "balanceAvailable" | "address">;
  onSent: () => Promise<void>;
  onClose: () => void;
  prefillAddress?: string;
};

const scanBtnStyle: React.CSSProperties = {
  position: "absolute",
  right: 6,
  top: "50%",
  transform: "translateY(-50%)",
  width: 34,
  height: 34,
};

const markStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  fontSize: 11,
};

export function SendSheet({ wallet, onSent, onClose, prefillAddress }: Props) {
  const contacts = useContactsStore((s) => s.contacts);
  const options = eligibleSendContacts(contacts);

  const [toAddress, setToAddress] = useState(prefillAddress ?? "");
  const [amount, setAmount] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const contactPickerRef = useRef<HTMLDivElement>(null);
  const contactExpand = bindPointerToggle(useRef(false), () =>
    setContactOpen((o) => !o),
  );

  const selectedContact =
    options.find((c) => c.id === selectedContactId) ?? null;

  useEffect(() => {
    if (!contactOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!contactPickerRef.current?.contains(e.target as Node)) {
        setContactOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContactOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [contactOpen]);

  function pickContact(contact: Contact) {
    const { address, paymentId: pid } = autofillFromContact(contact);
    setToAddress(address);
    setPaymentId(pid);
    setSelectedContactId(contact.id);
    setContactOpen(false);
  }

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
      const msg = (e as Error).message;
      setError(msg);
      toastError(msg);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="stack stack--gap-4">
      {options.length > 0 && (
        <div className="field" ref={contactPickerRef}>
          <span className="field__label">Contact</span>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="select expander-btn"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                textAlign: "left",
                cursor: "pointer",
              }}
              aria-haspopup="listbox"
              aria-expanded={contactOpen}
              disabled={busy}
              onPointerDown={contactExpand.onPointerDown}
              onClick={contactExpand.onClick}
            >
              {selectedContact ? (
                <>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selectedContact.alias}
                  </span>
                  <span className="row__avatar" style={markStyle}>
                    {contactLetterMark(selectedContact.alias)}
                  </span>
                </>
              ) : (
                <span className="faint" style={{ flex: 1 }}>
                  Select a contact…
                </span>
              )}
              <ChevronDown
                size={16}
                className="faint"
                style={{ flexShrink: 0 }}
              />
            </button>
            {contactOpen && (
              <div
                role="listbox"
                style={{
                  position: "absolute",
                  zIndex: 20,
                  left: 0,
                  right: 0,
                  top: "calc(100% + 4px)",
                  margin: 0,
                  padding: 4,
                  maxHeight: 220,
                  overflowY: "auto",
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
                }}
              >
                {options.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    role="option"
                    aria-selected={contact.id === selectedContactId}
                    className="btn btn--ghost"
                    style={{
                      width: "100%",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm)",
                      fontWeight: 500,
                    }}
                    onClick={() => pickContact(contact)}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textAlign: "left",
                      }}
                    >
                      {contact.alias}
                    </span>
                    <span className="row__avatar" style={markStyle}>
                      {contactLetterMark(contact.alias)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="field">
        <span className="field__label">Recipient CCX address</span>
        <div style={{ position: "relative" }}>
          <input
            className="input input--mono"
            style={{ paddingRight: 44 }}
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            placeholder="ccx7…"
            autoComplete="off"
            spellCheck={false}
          />
          <AddressQrScanButton
            style={scanBtnStyle}
            disabled={busy}
            onScan={(draft) => {
              setToAddress(draft.address);
              if (draft.amount !== undefined && Number.isFinite(draft.amount)) {
                setAmount(String(draft.amount));
              }
              if (draft.paymentId) setPaymentId(draft.paymentId);
            }}
          />
        </div>
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
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <input
              className="input input--mono"
              style={{ paddingRight: 44, width: "100%" }}
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
              placeholder="auto-generate or paste"
            />
            <PaymentIdQrScanButton
              style={scanBtnStyle}
              disabled={busy}
              onScan={setPaymentId}
            />
          </div>
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
