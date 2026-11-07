import { Fingerprint, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "@/components/Brand";
import { SecureInput } from "@/components/SecureInput";
import { SeedBackupPanel } from "@/components/SeedBackupPanel";
import { BackLink, TopBar } from "@/components/TopBar";
import { initMobileBiometricStorage } from "@/lib/auth/biometric-storage";
import {
  enrollUnlockCredential,
  isBiometricUnlockAvailable,
  PasskeyError,
} from "@/lib/auth/platform-unlock";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { markOnboarded } from "@/state/authStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useWalletStore } from "@/state/walletStore";
import {
  describePasswordFailure,
  walletPasswordStrength,
} from "@/utils/walletPassword";

type Step = "creating" | "seed" | "biometric";

export function CreateWalletScreen() {
  const navigate = useNavigate();
  const createWallet = useWalletStore((s) => s.createWallet);
  const seedPhrase = useWalletStore((s) => s.seedPhrase);
  const clearSeed = useWalletStore((s) => s.clearSeed);
  const address = useWalletStore((s) => s.address);
  const initializing = useWalletStore((s) => s.initializing);
  const setDataUnlockBiometric = useSettingsStore(
    (s) => s.setDataUnlockBiometric,
  );

  const [step, setStep] = useState<Step>("creating");
  const [walletPassword, setWalletPassword] = useState("");
  const [walletPasswordConfirm, setWalletPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [enrollBusy, setEnrollBusy] = useState(false);

  useEffect(() => {
    if (isMobileHost()) {
      void initMobileBiometricStorage();
    }
    void isBiometricUnlockAvailable().then(setBiometricAvailable);
  }, []);

  async function handleCreate() {
    setError(null);
    const fail = describePasswordFailure(walletPassword);
    if (fail) {
      setError(fail);
      return;
    }
    if (walletPassword !== walletPasswordConfirm) {
      setError("Wallet passwords do not match.");
      return;
    }
    try {
      await createWallet(walletPassword);
      setStep("seed");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function finish(enrollBiometric = false) {
    setError(null);
    if (enrollBiometric && biometricAvailable) {
      setEnrollBusy(true);
      try {
        await enrollUnlockCredential(
          "default",
          walletPassword,
          address || undefined,
        );
        setDataUnlockBiometric(true);
      } catch (e) {
        setError(e instanceof PasskeyError ? e.message : (e as Error).message);
        setEnrollBusy(false);
        return;
      }
      setEnrollBusy(false);
    }
    markOnboarded();
    navigate("/contacts");
  }

  const passwordStrength = walletPasswordStrength(walletPassword);

  return (
    <div className="screen">
      <TopBar
        title="Create wallet"
        leading={<BackLink to="/welcome" onClick={clearSeed} />}
        subtitle={
          step === "creating"
            ? "Choose wallet encryption password"
            : step === "seed"
              ? "Back up your seed"
              : "Biometric unlock"
        }
      />
      <div
        className="screen-scroll stack stack--gap-5"
        style={{ padding: "20px 16px 40px" }}
      >
        {step === "creating" && (
          <div
            className="center stack stack--gap-5 fade-in-up"
            style={{ paddingTop: 40, alignItems: "center" }}
          >
            <BrandMark size={64} />
            <div className="stack stack--gap-2 center">
              <h2 style={{ fontSize: 20 }}>Create a private wallet</h2>
              <p className="muted" style={{ maxWidth: 280, fontSize: 14 }}>
                Choose the password that encrypts this wallet before it is saved
                on this device.
              </p>
            </div>
            <div
              className="stack stack--gap-3"
              style={{ width: "100%", maxWidth: 280, textAlign: "left" }}
            >
              <SecureInput
                label="Wallet password"
                value={walletPassword}
                onChange={setWalletPassword}
                placeholder="Encrypts your local wallet file"
                revealable
              />
              {walletPassword.length > 0 && (
                <div className="row-flex" style={{ gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        background:
                          n <= passwordStrength
                            ? passwordStrength >= 4
                              ? "var(--success)"
                              : "var(--primary)"
                            : "var(--border)",
                      }}
                    />
                  ))}
                </div>
              )}
              <SecureInput
                label="Confirm wallet password"
                value={walletPasswordConfirm}
                onChange={setWalletPasswordConfirm}
                placeholder="Repeat password"
                revealable
              />
            </div>
            <button
              className="btn btn--primary btn--block"
              disabled={initializing}
              onClick={() => void handleCreate()}
              style={{ width: "100%", maxWidth: 280 }}
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
              onConfirm={() => {
                clearSeed();
                setStep("biometric");
              }}
            />
          </div>
        )}

        {step === "biometric" && (
          <div className="stack stack--gap-4 fade-in-up">
            <p className="muted" style={{ fontSize: 14 }}>
              Your wallet is encrypted. Enable biometrics as a shortcut to the
              password you just chose.
            </p>
            {error && <div className="field__error">{error}</div>}
            {biometricAvailable ? (
              <button
                className="btn btn--block btn--primary"
                disabled={enrollBusy}
                onClick={() => void finish(true)}
              >
                {enrollBusy ? (
                  <>
                    <Loader2 size={16} className="spin" /> Enabling…
                  </>
                ) : (
                  <>
                    <Fingerprint size={16} /> Enable biometrics & continue
                  </>
                )}
              </button>
            ) : (
              <button
                className="btn btn--block btn--primary"
                disabled={enrollBusy}
                onClick={() => void finish(false)}
              >
                Enter Get NowHere
              </button>
            )}
            <button
              className="btn btn--block btn--ghost"
              disabled={enrollBusy}
              onClick={() => void finish(false)}
            >
              {biometricAvailable ? "Skip biometrics" : "Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
