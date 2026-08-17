import { useEffect, useState } from "react";
import { PrivacySettingItem } from "@/components/PrivacySettingItem";
import { SecureInput } from "@/components/SecureInput";
import { Sheet } from "@/components/Sheet";
import { BackLink, TopBar } from "@/components/TopBar";
import { clearDataUnlockBiometricEnrollment } from "@/lib/auth/biometric-lifecycle";
import { initMobileBiometricStorage } from "@/lib/auth/biometric-storage";
import {
  enrollUnlockCredential,
  isBiometricUnlockAvailable,
  PasskeyError,
} from "@/lib/auth/platform-unlock";
import {
  clearAppAccessBiometric,
  enrollAppAccessBiometric,
  isAppAccessBiometricAvailable,
} from "@/lib/mobile/app-access-biometric";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { getRuntime } from "@/services/conceal/sync";
import { useSettingsStore } from "@/state/settingsStore";
import { useWalletStore } from "@/state/walletStore";

export function SecuritySettingsScreen() {
  const s = useSettingsStore();
  const address = useWalletStore((st) => st.address);
  const [dataUnlockAvailable, setDataUnlockAvailable] = useState(false);
  const [appAccessAvailable, setAppAccessAvailable] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [walletPassword, setWalletPassword] = useState("");
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);

  useEffect(() => {
    if (isMobileHost()) {
      void initMobileBiometricStorage();
    }
    void isBiometricUnlockAvailable().then(setDataUnlockAvailable);
    void isAppAccessBiometricAvailable().then(setAppAccessAvailable);
  }, []);

  async function verifyWalletPassword(password: string): Promise<boolean> {
    const rt = getRuntime();
    if (rt) return rt.password === password;
    return false;
  }

  async function handleAppAccessToggle(on: boolean) {
    setEnrollError(null);
    if (!on) {
      await clearAppAccessBiometric();
      s.setAppAccessBiometric(false);
      return;
    }
    if (!appAccessAvailable) {
      setEnrollError("Biometric app unlock is not available on this device.");
      return;
    }
    setEnrollBusy(true);
    try {
      await enrollAppAccessBiometric();
      s.setAppAccessBiometric(true);
    } catch (e) {
      setEnrollError(
        e instanceof PasskeyError ? e.message : (e as Error).message,
      );
    } finally {
      setEnrollBusy(false);
    }
  }

  async function handleDataUnlockToggle(on: boolean) {
    setEnrollError(null);
    if (!on) {
      await clearDataUnlockBiometricEnrollment();
      s.setDataUnlockBiometric(false);
      return;
    }
    if (!dataUnlockAvailable) {
      setEnrollError("Biometric data unlock is not available on this device.");
      return;
    }
    setWalletPassword("");
    setEnrollOpen(true);
  }

  async function handleEnrollDataUnlock() {
    setEnrollError(null);
    if (!(await verifyWalletPassword(walletPassword))) {
      setEnrollError("Wallet password is incorrect.");
      return;
    }
    setEnrollBusy(true);
    try {
      await enrollUnlockCredential(
        "default",
        walletPassword,
        address || undefined,
      );
      s.setDataUnlockBiometric(true);
      setEnrollOpen(false);
      setWalletPassword("");
    } catch (e) {
      setEnrollError(
        e instanceof PasskeyError ? e.message : (e as Error).message,
      );
    } finally {
      setEnrollBusy(false);
    }
  }

  return (
    <div className="screen">
      <TopBar
        title="Security"
        leading={<BackLink to="/settings" />}
        subtitle="Auto-lock & biometrics"
        bordered
      />
      <div
        className="screen-scroll stack stack--gap-5"
        style={{ padding: "16px 16px 32px" }}
      >
        <div className="card">
          <div className="card__title">Auto-lock</div>
          <div className="row-flex" style={{ gap: 8 }}>
            {[60, 300, 900, 3600].map((sec) => (
              <button
                key={sec}
                className={`btn btn--sm grow ${s.privacy.autoLockTimeoutSec === sec ? "btn--primary" : "btn--secondary"}`}
                onClick={() => s.setPrivacy({ autoLockTimeoutSec: sec })}
              >
                {sec < 60 ? `${sec}s` : sec < 3600 ? `${sec / 60}m` : "1h"}
              </button>
            ))}
          </div>
          <p className="field__hint" style={{ marginTop: 10 }}>
            When app biometrics is on: lock after this long idle in the app, or
            after the same duration in background before returning.
          </p>
        </div>

        <div className="card card--flush">
          <div
            className="card__title"
            style={{ padding: "var(--space-4) var(--space-4) 0" }}
          >
            Biometrics
          </div>
          <PrivacySettingItem
            title="Unlock app with biometrics"
            description={
              isMobileHost()
                ? "Use Face ID or fingerprint for app access after background or idle lock."
                : "Available on mobile only."
            }
            on={appAccessAvailable ? s.appAccessBiometricEnabled : false}
            onToggle={
              appAccessAvailable
                ? (v) => void handleAppAccessToggle(v)
                : undefined
            }
          />
          <PrivacySettingItem
            title="Unlock data with biometrics"
            description={
              dataUnlockAvailable
                ? "Open your wallet with biometrics instead of typing the encryption password."
                : "Requires a mobile device with biometric hardware."
            }
            on={dataUnlockAvailable ? s.dataUnlockBiometricEnabled : false}
            onToggle={
              dataUnlockAvailable
                ? (v) => void handleDataUnlockToggle(v)
                : undefined
            }
          />
          {enrollError && !enrollOpen && (
            <div className="field__error" style={{ padding: "0 16px 12px" }}>
              {enrollError}
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={enrollOpen}
        title="Enable data unlock"
        onClose={() => {
          if (enrollBusy) return;
          setEnrollOpen(false);
          setWalletPassword("");
          setEnrollError(null);
        }}
      >
        <div className="stack stack--gap-3">
          <p className="muted" style={{ fontSize: 13.5 }}>
            Confirm your wallet encryption password to register this device for
            biometric data unlock.
          </p>
          <SecureInput
            label="Wallet password"
            value={walletPassword}
            onChange={setWalletPassword}
            revealable
            autoFocus
          />
          {enrollError && <div className="field__error">{enrollError}</div>}
          <button
            type="button"
            className="btn btn--block btn--primary"
            disabled={enrollBusy || walletPassword.length < 1}
            onClick={() => void handleEnrollDataUnlock()}
          >
            {enrollBusy ? "Enrolling…" : "Enable biometric unlock"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
