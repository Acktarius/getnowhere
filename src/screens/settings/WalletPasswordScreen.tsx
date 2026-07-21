import { useState } from "react";
import { SecureInput } from "@/components/SecureInput";
import { BackLink, TopBar } from "@/components/TopBar";
import { changeWalletPassword } from "@/services/conceal/ConcealWalletService";
import {
  describePasswordFailure,
  WALLET_PASSWORD_HINTS,
  walletPasswordStrength,
} from "@/utils/walletPassword";

export function WalletPasswordScreen() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = walletPasswordStrength(next);

  async function handleChange() {
    setError(null);
    setMsg(null);
    if (!current) return setError("Enter your current wallet password.");
    const fail = describePasswordFailure(next);
    if (fail) return setError(fail);
    if (next !== confirm) return setError("New passwords do not match.");
    setBusy(true);
    try {
      await changeWalletPassword(current, next);
      setMsg("Wallet password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <TopBar
        title="Wallet password"
        leading={<BackLink to="/settings" />}
        subtitle="Encrypts the local wallet file"
        bordered
      />
      <div
        className="screen-scroll stack stack--gap-4"
        style={{ padding: "16px 16px 40px" }}
      >
        <p className="muted" style={{ fontSize: 14 }}>
          This is the password that encrypts your Conceal wallet backup on this
          device — not your app unlock passcode.
        </p>
        <SecureInput
          label="Current password"
          value={current}
          onChange={setCurrent}
          revealable
        />
        <SecureInput
          label="New password"
          value={next}
          onChange={setNext}
          revealable
        />
        {next.length > 0 && (
          <div className="stack stack--gap-2">
            <div className="row-flex" style={{ gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background:
                      n <= strength
                        ? strength >= 4
                          ? "var(--success)"
                          : strength >= 3
                            ? "var(--primary)"
                            : "var(--danger)"
                        : "var(--border)",
                  }}
                />
              ))}
            </div>
            {WALLET_PASSWORD_HINTS.map((hint) => {
              const met = hint.test(next);
              return (
                <div
                  key={hint.id}
                  className="row-flex"
                  style={{ gap: 6, fontSize: 12.5 }}
                >
                  <span
                    style={{
                      color: met ? "var(--success)" : "var(--text-muted)",
                    }}
                  >
                    {met ? "✓" : "○"}
                  </span>
                  <span
                    style={{ color: met ? "var(--text)" : "var(--text-muted)" }}
                  >
                    {hint.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <SecureInput
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          revealable
        />
        {error && <div className="field__error">{error}</div>}
        {msg && (
          <div style={{ fontSize: 13.5, color: "var(--success)" }}>{msg}</div>
        )}
        <button
          className="btn btn--block btn--primary"
          disabled={busy}
          onClick={handleChange}
        >
          {busy ? "Updating…" : "Change password"}
        </button>
      </div>
    </div>
  );
}
