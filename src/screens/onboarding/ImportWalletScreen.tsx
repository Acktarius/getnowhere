import {
  AlertCircle,
  FileUp,
  KeyRound,
  Loader2,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SecureInput } from "@/components/SecureInput";
import { BackLink, TopBar } from "@/components/TopBar";
import { validateConcealMnemonic } from "@/services/conceal/ConcealWalletAdapter";
import { walletService } from "@/services";
import { useAuthStore } from "@/state/authStore";
import { useWalletStore } from "@/state/walletStore";
import type { ImportWalletInput } from "@/types/services";

type Method = "mnemonic" | "keys" | "file";

export function ImportWalletScreen() {
  const navigate = useNavigate();
  const importWallet = useWalletStore((s) => s.importWallet);
  const initializing = useWalletStore((s) => s.initializing);
  const setAppPasscode = useAuthStore((s) => s.setPasscode);
  const passcodeSet = useAuthStore((s) => s.passcodeSet);

  const [method, setMethod] = useState<Method>("mnemonic");
  const [phase, setPhase] = useState<"details" | "passcode">("details");
  const [error, setError] = useState<string | null>(null);

  // shared
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [walletPassword, setWalletPassword] = useState("");

  // mnemonic
  const [seed, setSeed] = useState("");
  const [seedScanHeight, setSeedScanHeight] = useState("");

  // keys
  const [viewOnly, setViewOnly] = useState(false);
  const [spendKey, setSpendKey] = useState("");
  const [viewKey, setViewKey] = useState("");
  const [address, setAddress] = useState("");
  const [keysScanHeight, setKeysScanHeight] = useState("");
  const [previewedAddress, setPreviewedAddress] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // file
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const wordCount = seed.trim().split(/\s+/).filter(Boolean).length;

  function resetCrossFields(next: Method) {
    setMethod(next);
    setError(null);
    setPreviewedAddress(null);
    if (next !== "mnemonic") setSeed("");
    if (next !== "keys") {
      setSpendKey("");
      setViewKey("");
      setAddress("");
      setViewOnly(false);
    }
    if (next !== "file") {
      setFileName(null);
      setFileText("");
    }
  }

  async function handlePreviewKeys() {
    setError(null);
    if (spendKey.trim().length < 64) {
      return setError("Enter a valid 64-char hex spend key.");
    }
    setPreviewing(true);
    try {
      const res = await walletService.previewKeys({
        spendKey: spendKey.trim(),
        viewKey: viewKey.trim() || undefined,
      });
      setPreviewedAddress(res.address);
      if (!viewKey.trim()) setViewKey(res.viewKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  function handleFilePicked(file: File) {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileText(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function buildInput(): ImportWalletInput | null {
    if (method === "mnemonic") {
      if (wordCount < 12) {
        setError("Enter your full seed phrase (25 words).");
        return null;
      }
      if (!validateConcealMnemonic(seed.trim())) {
        setError("This seed phrase is not valid. Check the words and order.");
        return null;
      }
      return {
        method: "mnemonic",
        mnemonic: seed.trim(),
        password: walletPassword || passcode,
        scanHeight: seedScanHeight ? Number(seedScanHeight) : undefined,
      };
    }
    if (method === "keys") {
      if (viewOnly) {
        if (!address.trim()) {
          setError("Enter your CCX address.");
          return null;
        }
        if (!viewKey.trim()) {
          setError("Enter your private view key.");
          return null;
        }
        return {
          method: "keys",
          viewOnly: true,
          address: address.trim(),
          privateViewKey: viewKey.trim(),
          privateSpendKey: "",
          password: walletPassword || passcode,
          scanHeight: keysScanHeight ? Number(keysScanHeight) : undefined,
        };
      }
      if (spendKey.trim().length < 64) {
        setError("Enter a valid 64-char hex spend key.");
        return null;
      }
      return {
        method: "keys",
        viewOnly: false,
        address: previewedAddress ?? "",
        privateSpendKey: spendKey.trim(),
        privateViewKey: viewKey.trim(),
        password: walletPassword || passcode,
        scanHeight: keysScanHeight ? Number(keysScanHeight) : undefined,
      };
    }
    // file
    if (!fileText) {
      setError("Choose a wallet backup file.");
      return null;
    }
    return {
      method: "file",
      file: fileText,
      password: walletPassword,
    };
  }

  async function handleImport() {
    setError(null);
    if (method === "file" && !walletPassword) {
      return setError("Enter the password for this backup file.");
    }
    const input = buildInput();
    if (!input) return;
    try {
      await importWallet(input);
      if (passcodeSet) navigate("/contacts");
      else setPhase("passcode");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handlePasscode() {
    setError(null);
    if (passcode.length < 6) return setError("Use at least 6 digits.");
    if (passcode !== confirm) return setError("Passcodes do not match.");
    try {
      await setAppPasscode(passcode);
      navigate("/contacts");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const subtitle =
    phase === "details"
      ? "Seed, keys, or backup file"
      : "Set a new unlock passcode";

  return (
    <div className="screen">
      <TopBar
        title="Import wallet"
        leading={<BackLink to="/welcome" />}
        subtitle={subtitle}
      />
      <div
        className="screen-scroll stack stack--gap-5"
        style={{ padding: "20px 16px 40px" }}
      >
        {phase === "details" && (
          <div className="stack stack--gap-4 fade-in-up">
            <div
              className="card card--pad-md"
              style={{
                borderColor: "var(--danger)",
                background: "var(--danger-soft)",
              }}
            >
              <div className="row-flex" style={{ gap: 8 }}>
                <AlertCircle size={16} style={{ color: "var(--danger)" }} />
                <span style={{ fontSize: 13, color: "var(--danger)" }}>
                  Only enter wallet secrets on a device you control. Get Now
                  Here never sends them anywhere.
                </span>
              </div>
            </div>

            <MethodTabs method={method} onChange={resetCrossFields} />

            {method === "mnemonic" && (
              <div className="stack stack--gap-4">
                <div className="field">
                  <span className="field__label">
                    Seed phrase{" "}
                    <span className="faint">{wordCount} words</span>
                  </span>
                  <textarea
                    className="textarea input--mono"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder="orbit lantern cipher violet harbor…"
                    style={{ minHeight: 120 }}
                    autoFocus
                  />
                </div>
                <ScanHeightField
                  value={seedScanHeight}
                  onChange={setSeedScanHeight}
                  hint="Start syncing from this block instead of scanning from genesis. Use the block height where this wallet was created."
                />
              </div>
            )}

            {method === "keys" && (
              <div className="stack stack--gap-4">
                <div
                  className="row-flex"
                  style={{
                    gap: 8,
                    padding: "4px",
                    background: "var(--bg-elev)",
                    border: 1,
                    borderStyle: "solid",
                    borderColor: "var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <KeyModeToggle
                    active={!viewOnly}
                    onClick={() => setViewOnly(false)}
                    label="Full keys"
                  />
                  <KeyModeToggle
                    active={viewOnly}
                    onClick={() => setViewOnly(true)}
                    label="View-only"
                  />
                </div>

                {viewOnly ? (
                  <>
                    <SecureInput
                      label="CCX address"
                      value={address}
                      onChange={setAddress}
                      placeholder="ccx7…"
                      mono
                    />
                    <SecureInput
                      label="Private view key"
                      value={viewKey}
                      onChange={setViewKey}
                      placeholder="64-char hex"
                      mono
                      revealable
                    />
                  </>
                ) : (
                  <>
                    <SecureInput
                      label="Private spend key"
                      value={spendKey}
                      onChange={setSpendKey}
                      placeholder="64-char hex"
                      mono
                      revealable
                    />
                    <SecureInput
                      label="Private view key (optional — derived if blank)"
                      value={viewKey}
                      onChange={setViewKey}
                      placeholder="64-char hex"
                      mono
                      revealable
                    />
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm btn--block"
                      disabled={previewing || spendKey.trim().length < 64}
                      onClick={handlePreviewKeys}
                    >
                      {previewing ? (
                        <>
                          <Loader2 size={14} className="spin" /> Deriving…
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} /> Preview address
                        </>
                      )}
                    </button>
                    {previewedAddress && (
                      <div className="card card--pad-md">
                        <div className="field__label">Derived address</div>
                        <div
                          className="mono"
                          style={{
                            fontSize: 13,
                            wordBreak: "break-all",
                            color: "var(--primary)",
                          }}
                        >
                          {previewedAddress}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <ScanHeightField
                  value={keysScanHeight}
                  onChange={setKeysScanHeight}
                  hint="Start syncing from this block instead of scanning from genesis."
                />
              </div>
            )}

            {method === "file" && (
              <div className="stack stack--gap-4">
                <button
                  type="button"
                  className="btn btn--secondary btn--block"
                  style={{ height: 88, flexDirection: "column", gap: 6 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp size={22} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    {fileName ?? "Choose backup file"}
                  </span>
                  {fileName && (
                    <span className="faint" style={{ fontSize: 12 }}>
                      Tap to choose a different file
                    </span>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFilePicked(f);
                  }}
                />
                <SecureInput
                  label="Backup password"
                  value={walletPassword}
                  onChange={setWalletPassword}
                  placeholder="Password used when exporting"
                  revealable
                />
                <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  The file's embedded creation height is used as the scan start,
                  so import resumes from where the backup left off.
                </p>
              </div>
            )}

            {method !== "file" && (
              <SecureInput
                label="Wallet password (optional)"
                value={walletPassword}
                onChange={setWalletPassword}
                placeholder="Defaults to your app passcode"
                revealable
              />
            )}

            {error && <div className="field__error">{error}</div>}

            <button
              className="btn btn--block btn--primary"
              disabled={initializing}
              onClick={handleImport}
            >
              {initializing ? (
                <>
                  <Loader2 size={16} className="spin" /> Importing…
                </>
              ) : (
                "Import wallet"
              )}
            </button>
          </div>
        )}

        {phase === "passcode" && (
          <div className="stack stack--gap-4 fade-in-up">
            <p className="muted" style={{ fontSize: 14 }}>
              Set a new local unlock passcode for this device.
            </p>
            <SecureInput
              label="New passcode"
              value={passcode}
              onChange={setPasscode}
              inputMode="numeric"
              revealable
              placeholder="At least 6 digits"
            />
            <SecureInput
              label="Confirm passcode"
              value={confirm}
              onChange={setConfirm}
              inputMode="numeric"
              revealable
              placeholder="Repeat"
            />
            {error && <div className="field__error">{error}</div>}
            <button
              className="btn btn--block btn--primary"
              onClick={handlePasscode}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MethodTabs({
  method,
  onChange,
}: {
  method: Method;
  onChange: (m: Method) => void;
}) {
  const tabs: { id: Method; label: string; icon: typeof KeyRound }[] = [
    { id: "mnemonic", label: "Seed", icon: ScrollText },
    { id: "keys", label: "Keys", icon: KeyRound },
    { id: "file", label: "File", icon: FileUp },
  ];
  return (
    <div
      className="row-flex"
      style={{
        gap: 6,
        padding: 4,
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      {tabs.map((t) => {
        const active = method === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className="grow"
            style={{
              height: 40,
              borderRadius: "var(--radius-xs)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: active ? "var(--primary-fg)" : "var(--text-muted)",
              background: active ? "var(--primary)" : "transparent",
              transition:
                "background var(--dur) var(--ease), color var(--dur) var(--ease)",
            }}
          >
            <Icon size={15} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function KeyModeToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grow"
      style={{
        height: 36,
        borderRadius: "var(--radius-xs)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 600,
        color: active ? "var(--primary-fg)" : "var(--text-muted)",
        background: active ? "var(--primary)" : "transparent",
        transition:
          "background var(--dur) var(--ease), color var(--dur) var(--ease)",
      }}
    >
      {label}
    </button>
  );
}

function ScanHeightField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <div className="field">
      <span className="field__label">
        Scan from block{" "}
        <span className="faint">optional</span>
      </span>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder="0 (scan from genesis)"
        min={0}
      />
      <span className="field__hint">{hint}</span>
    </div>
  );
}
