import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SecureInput } from "@/components/SecureInput";
import { BackLink, TopBar } from "@/components/TopBar";
import { validateConcealMnemonic } from "@/services/conceal/ConcealWalletAdapter";
import { useAuthStore } from "@/state/authStore";
import { useWalletStore } from "@/state/walletStore";

export function RestoreWalletScreen() {
  const navigate = useNavigate();
  const restoreWallet = useWalletStore((s) => s.restoreWallet);
  const initializing = useWalletStore((s) => s.initializing);
  const setAppPasscode = useAuthStore((s) => s.setPasscode);

  const [seed, setSeed] = useState("");
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"seed" | "passcode">("seed");

  const wordCount = seed.trim().split(/\s+/).filter(Boolean).length;

  async function handleRestore() {
    setError(null);
    if (wordCount < 12)
      return setError("Enter your full seed phrase (25 words).");
    if (!validateConcealMnemonic(seed.trim())) {
      return setError(
        "This seed phrase is not valid. Check the words and order.",
      );
    }
    try {
      await restoreWallet(seed.trim());
      setPhase("passcode");
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

  return (
    <div className="screen">
      <TopBar
        title="Restore wallet"
        leading={<BackLink to="/welcome" />}
        subtitle={
          phase === "seed" ? "From seed phrase" : "Set a new unlock passcode"
        }
      />
      <div
        className="screen-scroll stack stack--gap-5"
        style={{ padding: "20px 16px 40px" }}
      >
        {phase === "seed" && (
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
                  Only enter your seed on a device you control. Get NowHere
                  never sends it anywhere.
                </span>
              </div>
            </div>
            <div className="field">
              <span className="field__label">
                Seed phrase <span className="faint">{wordCount} words</span>
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
            {error && <div className="field__error">{error}</div>}
            <button
              className="btn btn--block btn--primary"
              disabled={initializing}
              onClick={handleRestore}
            >
              {initializing ? (
                <>
                  <Loader2 size={16} className="spin" /> Restoring…
                </>
              ) : (
                "Restore wallet"
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
