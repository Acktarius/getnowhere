import { AlertCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { SecureInput } from "@/components/SecureInput";
import { Sheet } from "@/components/Sheet";
import { walletService } from "@/services";
import { useContactsStore } from "@/state/contactsStore";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
};

export function AddContactSheet({ open, onClose, onCreated }: Props) {
  const addContact = useContactsStore((s) => s.addContact);
  const [alias, setAlias] = useState("");
  const [ccxAddress, setCcxAddress] = useState("");
  const [paymentIdFrom, setPaymentIdFrom] = useState("");
  const [paymentIdTo, setPaymentIdTo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addressWarning, setAddressWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setAlias("");
    setCcxAddress("");
    setPaymentIdFrom("");
    setPaymentIdTo("");
    setNotes("");
    setError(null);
    setAddressWarning(null);
  }

  async function validateAddress(addr: string) {
    setCcxAddress(addr);
    setAddressWarning(null);
    if (addr.length > 12) {
      const ok = await walletService.validateAddress(addr);
      setAddressWarning(
        ok ? null : "This does not look like a valid CCX address.",
      );
    }
  }

  async function handleAdd() {
    setError(null);
    if (!alias.trim()) return setError("Give this contact an alias.");
    if (!ccxAddress.trim()) return setError("A CCX address is required.");
    const ok = await walletService.validateAddress(ccxAddress);
    if (!ok) return setError("CCX address format is invalid.");
    setBusy(true);
    try {
      const c = await addContact({
        alias,
        ccxAddress,
        paymentIdFrom,
        paymentIdTo,
        notes,
      });
      reset();
      onCreated(c.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const incomplete = !paymentIdTo || paymentIdTo.length < 16;

  return (
    <Sheet
      open={open}
      title="Add contact"
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <div className="stack stack--gap-4">
        <div className="field">
          <span className="field__label">Alias</span>
          <input
            className="input"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="e.g. Cipher"
            autoFocus
          />
        </div>

        <div className="field">
          <span className="field__label">Conceal address</span>
          <input
            className="input input--mono"
            value={ccxAddress}
            onChange={(e) => validateAddress(e.target.value)}
            placeholder="ccx7…"
            autoComplete="off"
            spellCheck={false}
          />
          {addressWarning && (
            <div className="field__error row-flex" style={{ gap: 6 }}>
              <AlertCircle size={12} /> {addressWarning}
            </div>
          )}
        </div>

        <div className="field">
          <span className="field__label">
            paymentIdFrom <span className="faint">your local identifier</span>
          </span>
          <div className="row-flex" style={{ gap: 8 }}>
            <SecureInput
              value={paymentIdFrom}
              onChange={setPaymentIdFrom}
              mono
              placeholder="Auto-generated"
              revealable
            />
            <button
              className="btn btn--sm btn--secondary no-shrink"
              onClick={() =>
                setPaymentIdFrom(walletService.generatePaymentId())
              }
            >
              <RefreshCw size={13} /> Gen
            </button>
          </div>
          <span className="field__hint">
            You give this to the counterpart so they can recognize you. Leave
            blank to auto-generate.
          </span>
        </div>

        <div className="field">
          <span className="field__label">
            paymentIdTo <span className="faint">from counterpart</span>
          </span>
          <SecureInput
            value={paymentIdTo}
            onChange={setPaymentIdTo}
            mono
            placeholder="Paste when received"
            revealable
          />
          <span className="field__hint">
            The identifier your counterpart gives back. The relationship stays
            pending until this is saved.
          </span>
        </div>

        {incomplete && paymentIdTo && (
          <div
            className="card card--pad-md"
            style={{
              borderColor: "var(--warning)",
              background: "color-mix(in srgb, var(--warning) 10%, transparent)",
            }}
          >
            <span style={{ fontSize: 12.5, color: "var(--warning)" }}>
              Incomplete relationship — both payment IDs must be present to mark
              this established.
            </span>
          </div>
        )}

        <div className="field">
          <span className="field__label">
            Notes <span className="faint">optional</span>
          </span>
          <textarea
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Where you met, shared secret, etc."
          />
        </div>

        {error && <div className="field__error">{error}</div>}

        <button
          className="btn btn--block btn--primary"
          disabled={busy}
          onClick={handleAdd}
        >
          {busy ? "Saving…" : "Save contact"}
        </button>
      </div>
    </Sheet>
  );
}
