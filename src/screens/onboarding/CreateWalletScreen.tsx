import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "@/components/Brand";
import { SecureInput } from "@/components/SecureInput";
import { SeedBackupPanel } from "@/components/SeedBackupPanel";
import { BackLink, TopBar } from "@/components/TopBar";
import { useAuthStore } from "@/state/authStore";
import { useWalletStore } from "@/state/walletStore";

type Step = "creating" | "seed" | "passcode" | "biometric" | "done";

export function CreateWalletScreen() {
  const navigate = useNavigate();
  const createWallet = useWalletStore((s) => s.createWallet);
  const seedPhrase = useWalletStore((s) => s.seedPhrase);
  const initializing = useWalletStore((s) => s.initializing);
  const setAppPasscode = useAuthStore((s) => s.setPasscode);

  const [step, setStep] = useState<Step>("creating");
  const [passcode, setPasscode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    try {
      await createWallet();
      setStep("seed");
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
      setStep("biometric");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function finish() {
    navigate("/contacts");
  }

  return (
    <div className="screen">
      <TopBar
        title="Create wallet"
        leading={<BackLink to="/welcome" />}
        subtitle={
          step === "creating"
            ? "Generating fresh Conceal identity"
            : step === "seed"
              ? "Back up your seed"
              : step === "passcode"
                ? "Set unlock passcode"
                : "Almost done"
        }
      />
      <div
        className="screen-scroll stack stack--gap-5"
        style={{ padding: "20px 16px 40px" }}
      >
        {step === "creating" && (
          <div
            className="center stack stack--gap-5 fade-in-up"
            style={{ paddingTop: 40 }}
          >
            <BrandMark size={64} />
            <div className="stack stack--gap-2 center">
              <h2 style={{ fontSize: 20 }}>Generating a private wallet</h2>
              <p className="muted" style={{ maxWidth: 280, fontSize: 14 }}>
                We are creating a fresh Conceal identity. This address becomes
                the anchor for every trusted contact you add.
              </p>
            </div>
            <button
              className="btn btn--primary btn--block"
              disabled={initializing}
              onClick={handleCreate}
              style={{ maxWidth: 280 }}
            >
              {initializing ? (
                <>
                  <Loader2 size={16} className="spin" /> Generating…
                </>
              ) : (
                "Create my wallet"
              )}
            </button>
            {error && <div className="field__error">{error}</div>}
          </div>
        )}

        {step === "seed" && seedPhrase && (
          <div className="stack stack--gap-4 fade-in-up">
            <p className="muted" style={{ fontSize: 14 }}>
              Your seed phrase restores your wallet and every relationship tied
              to it. Save it offline before continuing.
            </p>
            <SeedBackupPanel
              seedPhrase={seedPhrase}
              onConfirm={() => setStep("passcode")}
            />
          </div>
        )}

        {step === "passcode" && (
          <div className="stack stack--gap-4 fade-in-up">
            <p className="muted" style={{ fontSize: 14 }}>
              This passcode unlocks the app locally. It is never sent anywhere.
            </p>
            <SecureInput
              label="New passcode"
              value={passcode}
              onChange={setPasscode}
              placeholder="At least 6 digits"
              inputMode="numeric"
              revealable
              maxLength={16}
            />
            <SecureInput
              label="Confirm passcode"
              value={confirm}
              onChange={setConfirm}
              placeholder="Repeat passcode"
              inputMode="numeric"
              revealable
              maxLength={16}
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

        {step === "biometric" && (
          <div className="stack stack--gap-4 fade-in-up">
            <div className="card card--pad-md">
              <div className="card__title">Biometric unlock (optional)</div>
              <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                When available on device, Get NowHere can use Face ID or
                fingerprint to unlock. This is a placeholder for now — you can
                enable it later in Settings.
              </p>
            </div>
            <button className="btn btn--block btn--primary" onClick={finish}>
              Enter Get NowHere
            </button>
            <button className="btn btn--block btn--ghost" onClick={finish}>
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
