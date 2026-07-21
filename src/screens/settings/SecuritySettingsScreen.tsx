import { useState } from "react";
import { PrivacySettingItem } from "@/components/PrivacySettingItem";
import { SecureInput } from "@/components/SecureInput";
import { BackLink, TopBar } from "@/components/TopBar";
import { localSecurityService } from "@/services";
import { useSettingsStore } from "@/state/settingsStore";

export function SecuritySettingsScreen() {
  const s = useSettingsStore();
  const [oldCode, setOldCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChange() {
    setError(null);
    setMsg(null);
    const ok = await localSecurityService.verifyPasscode(oldCode);
    if (!ok) return setError("Current passcode is incorrect.");
    if (newCode.length < 6)
      return setError("New passcode must be at least 6 digits.");
    if (newCode !== confirm) return setError("New passcodes do not match.");
    await localSecurityService.changePasscode(oldCode, newCode);
    setMsg("Passcode updated.");
    setOldCode("");
    setNewCode("");
    setConfirm("");
  }

  return (
    <div className="screen">
      <TopBar
        title="Security"
        leading={<BackLink to="/settings" />}
        subtitle="Passcode & biometrics"
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
            How long the app can stay idle before requiring the passcode again.
          </p>
        </div>

        <div className="card">
          <div className="card__title">Change passcode</div>
          <div className="stack stack--gap-3">
            <SecureInput
              label="Current passcode"
              value={oldCode}
              onChange={setOldCode}
              inputMode="numeric"
              revealable
            />
            <SecureInput
              label="New passcode"
              value={newCode}
              onChange={setNewCode}
              inputMode="numeric"
              revealable
            />
            <SecureInput
              label="Confirm new passcode"
              value={confirm}
              onChange={setConfirm}
              inputMode="numeric"
              revealable
            />
            {error && <div className="field__error">{error}</div>}
            {msg && (
              <div className="success-text" style={{ fontSize: 13 }}>
                {msg}
              </div>
            )}
            <button
              className="btn btn--block btn--primary"
              onClick={handleChange}
            >
              Update passcode
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card__title">Biometric</div>
          <PrivacySettingItem
            title="Enable biometric unlock"
            description="Placeholder — on supported devices, Face ID or fingerprint can unlock the app."
            on={s.biometricEnabled}
            onToggle={(v) => s.setBiometric(v)}
          />
        </div>
      </div>
    </div>
  );
}
