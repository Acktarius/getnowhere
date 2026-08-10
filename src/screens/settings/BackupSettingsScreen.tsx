import { Download, Eye, Lock } from "lucide-react";
import { useState } from "react";
import { SecureInput } from "@/components/SecureInput";
import { SeedRevealModal } from "@/components/SeedRevealModal";
import { BackLink, TopBar } from "@/components/TopBar";
import { seedBackupService } from "@/services";
import { useWalletStore } from "@/state/walletStore";
import { downloadJson } from "@/lib/downloadJson";
import type { WalletSecretsExport } from "@/types/services";

export function BackupSettingsScreen() {
  const wallet = useWalletStore();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [secrets, setSecrets] = useState<WalletSecretsExport | null>(null);
  const [busy, setBusy] = useState(false);

  function requirePassword(): boolean {
    setError(null);
    setMsg(null);
    if (!password.trim()) {
      setError("Enter your wallet password.");
      return false;
    }
    return true;
  }

  async function reveal() {
    if (!requirePassword()) return;
    setBusy(true);
    try {
      // TO BE RE_ASSESS: do not call confirmBackup on Got it yet.
      const data = await seedBackupService.revealSecrets(password);
      setSecrets(data);
      setRevealOpen(true);
    } catch (e) {
      setError((e as Error).message || "Could not reveal secrets.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadBackup() {
    if (!requirePassword()) return;
    setBusy(true);
    try {
      const { filename, payload } =
        await seedBackupService.downloadWalletBackup(password);
      const result = await downloadJson(filename, payload);
      setMsg(
        result === "saved"
          ? `Saved ${filename} to Files`
          : `Downloaded ${filename}`,
      );
    } catch (e) {
      setError((e as Error).message || "Could not download wallet backup.");
    } finally {
      setBusy(false);
    }
  }

  function closeReveal() {
    setRevealOpen(false);
    setSecrets(null);
    setPassword("");
  }

  if (!wallet.initialized) {
    return (
      <div className="screen">
        <TopBar title="Backup" leading={<BackLink to="/settings" />} bordered />
        <div className="screen-scroll">
          <div className="empty">
            <Lock size={24} style={{ color: "var(--text-faint)" }} />
            <div className="empty__title">No wallet to back up</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar
        title="Backup"
        leading={<BackLink to="/settings" />}
        subtitle="Seed, keys, and encrypted wallet file"
        bordered
      />
      <div
        className="screen-scroll stack stack--gap-4"
        style={{ padding: "16px 16px 32px" }}
      >
        <div className="stack stack--gap-3 fade-in-up">
          <div
            className="card card--pad-md"
            style={{ background: "var(--bg-elev-2)" }}
          >
            <div className="row-flex" style={{ gap: 10 }}>
              <Lock size={16} style={{ color: "var(--text-faint)" }} />
              <span className="muted" style={{ fontSize: 13.5 }}>
                Wallet password is required to reveal seed and keys, or to
                download the encrypted wallet .json. Secrets never leave the
                device except when you download.
              </span>
            </div>
          </div>
          <SecureInput
            label="Wallet password"
            value={password}
            onChange={setPassword}
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
            onClick={reveal}
            disabled={busy}
          >
            <Eye size={15} /> Reveal seed &amp; keys
          </button>
          <button
            className="btn btn--block btn--secondary"
            onClick={downloadBackup}
            disabled={busy}
          >
            <Download size={15} /> Download wallet .json
          </button>
        </div>
      </div>

      <SeedRevealModal
        open={revealOpen && Boolean(secrets)}
        seedPhrase={secrets?.mnemonic ?? ""}
        spendKey={secrets?.spendKey ?? ""}
        viewKey={secrets?.viewKey ?? ""}
        viewOnly={secrets?.viewOnly}
        onClose={closeReveal}
      />
    </div>
  );
}
