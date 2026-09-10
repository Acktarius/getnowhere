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
import { setSessionWalletPassword } from "@/services/conceal/ConcealWalletService";
import { markOnboarded } from "@/state/authStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useWalletStore } from "@/state/walletStore";
import {
  describePasswordFailure,
  walletPasswordStrength,
} from "@/utils/walletPassword";

type Step = "creating" | "seed" | "biometric" | "done";

export function CreateWalletScreen() {
  const navigate = useNavigate();
  const createWallet = useWalletStore((s) => s.createWallet);
  const seedPhrase = useWalletStore((s) => s.seedPhrase);
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
    try {
      await createWallet();
      setStep("seed");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function persistWalletPassword(): Promise<boolean> {
    const fail = describePasswordFailure(walletPassword);
    if (fail) {
      setError(fail);
      return false;
    }
    if (walletPassword !== walletPasswordConfirm) {
      setError("Wallet passwords do not match.");
      return false;
    }
    try {
      await setSessionWalletPassword(walletPassword);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }

  async function finish(enrollBiometric = false) {
    setError(null);
    if (!(await persistWalletPassword())) return;
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
        leading={<BackLink to="/welcome" />}
        subtitle={
          step === "creating"
            ? "Generating fresh Conceal identity"
            : step === "seed"
              ? "Back up your seed"
              : "Wallet password & biometrics"
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
              <h2 style={{ fontSize: 20 }}>Generating a private wallet</h2>
              <p className="muted" style={{ maxWidth: 280, fontSize: 14 }}>
                We are creating a fresh Conceal identity. This address becomes
                the anchor for every trusted contact you add.
              </p>
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
              onConfirm={() => setStep("biometric")}
            />
          </div>
        )}

        {step === "biometric" && (
          <div className="stack stack--gap-4 fade-in-up">
            <p className="muted" style={{ fontSize: 14 }}>
              Choose a wallet encryption password. You will need it to open this
              wallet after the app exits — or use biometrics if you enable them
              below.
            </p>
            <SecureInput
              label="Wallet password"
              value={walletPassword}
              onChange={setWalletPassword}
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
              revealable
            />
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
