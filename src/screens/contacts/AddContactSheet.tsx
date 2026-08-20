import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  Camera,
  QrCode,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddressQrScanButton } from "@/components/qr/AddressQrScanButton";
import { PaymentIdQrScanButton } from "@/components/qr/PaymentIdQrScanButton";
import { QrCameraScanner } from "@/components/qr/QrCameraScanner";
import { WalletQrCode } from "@/components/qr/WalletQrCode";
import { SecureInput } from "@/components/SecureInput";
import { Sheet } from "@/components/Sheet";
import { encodePairQrPayload, parsePairQrPayload } from "@/lib/pair-qr";
import { walletService } from "@/services";
import { useContactsStore } from "@/state/contactsStore";
import { useWalletStore } from "@/state/walletStore";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
};

type PairStep =
  | "form"
  | "pairShowQr"
  | "pairScanTheirs"
  | "scanCamera"
  | "scanConfirm"
  | "scanShowQr";

const scanBtnInline: React.CSSProperties = {
  width: 34,
  height: 34,
};

export function AddContactSheet({ open, onClose, onCreated }: Props) {
  const walletAddress = useWalletStore((s) => s.address);
  const walletReady = useWalletStore(
    (s) => s.initialized && Boolean(s.address),
  );
  const addContact = useContactsStore((s) => s.addContact);
  const updateContact = useContactsStore((s) => s.updateContact);
  const savePaymentIdTo = useContactsStore((s) => s.savePaymentIdTo);

  const [step, setStep] = useState<PairStep>("form");
  const [alias, setAlias] = useState("");
  const [ccxAddress, setCcxAddress] = useState("");
  const [paymentIdFrom, setPaymentIdFrom] = useState("");
  const [paymentIdTo, setPaymentIdTo] = useState("");
  const [notes, setNotes] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [theirAddress, setTheirAddress] = useState("");
  const [theirPidTo, setTheirPidTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [addressWarning, setAddressWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setAlias("");
    setCcxAddress("");
    setPaymentIdFrom(walletService.generatePaymentId());
    setPaymentIdTo("");
    setNotes("");
    setContactId(null);
    setTheirAddress("");
    setTheirPidTo("");
    setError(null);
    setScanError(null);
    setAddressWarning(null);
    setBusy(false);
  }, [open]);

  const showPairActions = alias.trim().length > 0;

  /** Single source for manual field and every Pair QR encode. */
  const pairQrValue = useMemo(() => {
    if (!walletAddress || !paymentIdFrom) return "";
    try {
      return encodePairQrPayload({ address: walletAddress, paymentIdFrom });
    } catch {
      return "";
    }
  }, [walletAddress, paymentIdFrom]);

  function reset() {
    setStep("form");
    setAlias("");
    setCcxAddress("");
    setPaymentIdFrom("");
    setPaymentIdTo("");
    setNotes("");
    setContactId(null);
    setTheirAddress("");
    setTheirPidTo("");
    setError(null);
    setScanError(null);
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

  function handlePairScan(raw: string) {
    const parsed = parsePairQrPayload(raw);
    if (!parsed) {
      setScanError("Not a Get NowHere pair QR. Try again.");
      return;
    }
    setScanError(null);
    if (step === "pairScanTheirs" && contactId) {
      void finishPathA(parsed.a, parsed.p);
      return;
    }
    setTheirAddress(parsed.a);
    setTheirPidTo(parsed.p);
    setStep("scanConfirm");
  }

  async function finishPathA(address: string, pidTo: string) {
    if (!contactId) return;
    const ok = await walletService.validateAddress(address);
    if (!ok) {
      setScanError("That Conceal address is not valid.");
      return;
    }
    setBusy(true);
    setScanError(null);
    try {
      updateContact(contactId, { ccxAddress: address.trim() });
      await savePaymentIdTo(contactId, pidTo);
      onCreated(contactId);
      reset();
      onClose();
    } catch (e) {
      setScanError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startPathA() {
    if (!alias.trim()) {
      setError("Give this contact an alias first.");
      return;
    }
    if (!paymentIdFrom.trim()) {
      setError("paymentIdFrom is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const c = await addContact({
        alias: alias.trim(),
        ccxAddress: "",
        paymentIdFrom,
        notes,
      });
      setContactId(c.id);
      setStep("pairShowQr");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePathB() {
    if (!alias.trim()) {
      setError("Give this contact an alias.");
      return;
    }
    if (!paymentIdFrom.trim()) {
      setError("paymentIdFrom is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const c = await addContact({
        alias: alias.trim(),
        ccxAddress: theirAddress,
        paymentIdFrom,
        paymentIdTo: theirPidTo,
        notes,
      });
      setContactId(c.id);
      setStep("scanShowQr");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleManualAdd() {
    setError(null);
    if (!alias.trim()) return setError("Give this contact an alias.");
    if (!ccxAddress.trim()) return setError("A CCX address is required.");
    if (!paymentIdFrom.trim()) {
      return setError("Generate or paste your paymentIdFrom.");
    }
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

  function goBack() {
    setScanError(null);
    setError(null);
    if (step === "pairShowQr" || step === "scanCamera") setStep("form");
    else if (step === "pairScanTheirs") setStep("pairShowQr");
    else if (step === "scanConfirm") setStep("scanCamera");
    else if (step === "scanShowQr") setStep("scanConfirm");
  }

  const sheetTitle =
    step === "form"
      ? "Add contact"
      : step === "pairShowQr" || step === "scanShowQr"
        ? "Your pair QR"
        : step === "pairScanTheirs" || step === "scanCamera"
          ? "Scan pair QR"
          : "Confirm contact";

  const incomplete = !paymentIdTo || paymentIdTo.length < 16;

  return (
    <Sheet
      open={open}
      title={sheetTitle}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <div className="stack stack--gap-4">
        {step !== "form" && (
          <button
            type="button"
            className="btn btn--sm btn--ghost row-flex"
            style={{ alignSelf: "flex-start", gap: 6 }}
            onClick={goBack}
          >
            <ArrowLeft size={14} /> Back
          </button>
        )}

        {step === "form" && (
          <>
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

            {showPairActions && (
              <div className="stack stack--gap-2">
                <button
                  type="button"
                  className="card card--pad-md row-flex row-flex--between"
                  style={{
                    textAlign: "left",
                    width: "100%",
                    cursor: "pointer",
                  }}
                  disabled={!walletReady || busy}
                  onClick={() => void startPathA()}
                >
                  <div>
                    <div
                      className="row-flex"
                      style={{ gap: 8, marginBottom: 4 }}
                    >
                      <QrCode size={18} />
                      <strong>Pair QR</strong>
                    </div>
                    <span className="muted" style={{ fontSize: 13 }}>
                      QR to announce yourself
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  className="card card--pad-md row-flex row-flex--between"
                  style={{
                    textAlign: "left",
                    width: "100%",
                    cursor: "pointer",
                  }}
                  disabled={!walletReady || busy}
                  onClick={() => {
                    setScanError(null);
                    setStep("scanCamera");
                  }}
                >
                  <div>
                    <div
                      className="row-flex"
                      style={{ gap: 8, marginBottom: 4 }}
                    >
                      <Camera size={18} />
                      <strong>Scan pair QR</strong>
                    </div>
                    <span className="muted" style={{ fontSize: 13 }}>
                      Scan a peer QR to add it to your contact
                    </span>
                  </div>
                </button>
                {!walletReady && (
                  <span className="field__hint">
                    Unlock your wallet to use in-person pairing.
                  </span>
                )}
              </div>
            )}

            <div className="field">
              <span className="field__label">Conceal address</span>
              <div style={{ position: "relative" }}>
                <input
                  className="input input--mono"
                  style={{ paddingRight: 44 }}
                  value={ccxAddress}
                  onChange={(e) => validateAddress(e.target.value)}
                  placeholder="ccx7…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <AddressQrScanButton
                  style={{
                    position: "absolute",
                    right: 6,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 34,
                    height: 34,
                  }}
                  disabled={busy}
                  onScan={(draft) => {
                    void validateAddress(draft.address);
                    if (draft.paymentId) setPaymentIdTo(draft.paymentId);
                  }}
                />
              </div>
              {addressWarning && (
                <div className="field__error row-flex" style={{ gap: 6 }}>
                  <AlertCircle size={12} /> {addressWarning}
                </div>
              )}
            </div>

            <div className="field">
              <span className="field__label">paymentIdFrom</span>
              <div
                className="row-flex"
                style={{ gap: 8, alignItems: "flex-start" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SecureInput
                    value={paymentIdFrom}
                    onChange={setPaymentIdFrom}
                    mono
                    placeholder="64-char hex"
                    revealable
                    endAdornment={
                      <PaymentIdQrScanButton
                        style={scanBtnInline}
                        disabled={busy}
                        onScan={setPaymentIdFrom}
                      />
                    }
                  />
                </div>
                <button
                  type="button"
                  className="btn btn--sm btn--secondary no-shrink"
                  style={{ marginTop: 0 }}
                  onClick={() =>
                    setPaymentIdFrom(walletService.generatePaymentId())
                  }
                >
                  <ArrowLeftRight size={13} /> Gen
                </button>
              </div>
              <span className="field__hint">
                Share this ID in your pair QR; your contact stores it as
                paymentIdTo.
              </span>
            </div>

            <div className="field">
              <span className="field__label">paymentIdTo</span>
              <SecureInput
                value={paymentIdTo}
                onChange={setPaymentIdTo}
                mono
                placeholder="Paste when received"
                revealable
                endAdornment={
                  <PaymentIdQrScanButton
                    style={scanBtnInline}
                    disabled={busy}
                    onScan={setPaymentIdTo}
                  />
                }
              />
              <span className="field__hint">
                Provided by your contact so they can identify you when you send.
              </span>
            </div>

            {incomplete && paymentIdTo && (
              <div
                className="card card--pad-md"
                style={{
                  borderColor: "var(--warning)",
                  background:
                    "color-mix(in srgb, var(--warning) 10%, transparent)",
                }}
              >
                <span style={{ fontSize: 12.5, color: "var(--warning)" }}>
                  Incomplete relationship — both payment IDs must be present to
                  mark this eligible.
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
              type="button"
              className="btn btn--block btn--primary"
              disabled={busy}
              onClick={() => void handleManualAdd()}
            >
              {busy ? "Saving…" : "Save contact"}
            </button>
          </>
        )}

        {step === "pairShowQr" && (
          <>
            <p className="muted" style={{ fontSize: 13.5 }}>
              Ask <strong>{alias || "them"}</strong> to scan this QR, then tap
              when they have.
            </p>
            <p className="muted" style={{ fontSize: 12.5 }}>
              QR to announce yourself
            </p>
            {pairQrValue ? (
              <WalletQrCode value={pairQrValue} kind="address" />
            ) : (
              <div className="field__error">
                Unlock your wallet to display a pair QR.
              </div>
            )}
            <button
              type="button"
              className="btn btn--block btn--primary"
              disabled={!pairQrValue}
              onClick={() => {
                setScanError(null);
                setStep("pairScanTheirs");
              }}
            >
              Has been scanned
            </button>
          </>
        )}

        {step === "pairScanTheirs" && (
          <>
            <p className="muted" style={{ fontSize: 13.5 }}>
              Scan {alias ? `${alias}'s` : "their"} pair QR to save their
              address and payment ID.
            </p>
            {scanError && <div className="field__error">{scanError}</div>}
            <QrCameraScanner
              onDecode={handlePairScan}
              onCancel={() => setStep("pairShowQr")}
            />
          </>
        )}

        {step === "scanCamera" && (
          <>
            <p className="muted" style={{ fontSize: 13.5 }}>
              Scan their pair QR — your phone will fill their address and
              payment ID.
            </p>
            {scanError && <div className="field__error">{scanError}</div>}
            <QrCameraScanner
              onDecode={handlePairScan}
              onCancel={() => setStep("form")}
            />
          </>
        )}

        {step === "scanConfirm" && (
          <>
            <p className="muted" style={{ fontSize: 13.5 }}>
              Confirm their details before saving.
            </p>
            <div className="field">
              <span className="field__label">Alias</span>
              <input
                className="input"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. Alice"
                autoFocus
              />
            </div>
            <div className="field">
              <span className="field__label">Their address</span>
              <input
                className="input input--mono"
                value={theirAddress}
                readOnly
              />
            </div>
            <div className="field">
              <span className="field__label">paymentIdTo (from their QR)</span>
              <input
                className="input input--mono"
                value={theirPidTo}
                readOnly
              />
            </div>
            <div className="field">
              <span className="field__label">Your paymentIdFrom</span>
              <SecureInput
                value={paymentIdFrom}
                onChange={setPaymentIdFrom}
                mono
                revealable
              />
            </div>
            {error && <div className="field__error">{error}</div>}
            <button
              type="button"
              className="btn btn--block btn--primary"
              disabled={busy}
              onClick={() => void savePathB()}
            >
              {busy ? "Saving…" : "Continue"}
            </button>
          </>
        )}

        {step === "scanShowQr" && (
          <>
            <p className="muted" style={{ fontSize: 13.5 }}>
              Show this QR so <strong>{alias || "they"}</strong> can complete
              the pair on their phone.
            </p>
            <p className="muted" style={{ fontSize: 12.5 }}>
              QR to announce yourself
            </p>
            {pairQrValue ? (
              <WalletQrCode value={pairQrValue} kind="address" />
            ) : null}
            <button
              type="button"
              className="btn btn--block btn--primary"
              onClick={() => {
                if (contactId) {
                  onCreated(contactId);
                  reset();
                  onClose();
                }
              }}
            >
              Has been scanned
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
