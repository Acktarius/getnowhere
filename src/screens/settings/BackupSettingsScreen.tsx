import { Download, Eye, Lock } from "lucide-react";
import { useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SecureInput } from "@/components/SecureInput";
import { SeedBackupPanel } from "@/components/SeedBackupPanel";
import { BackLink, TopBar } from "@/components/TopBar";
import { seedBackupService } from "@/services";
import { contactsExportPayload } from "@/services/contacts/contactsPersistence";
import { useAuthStore } from "@/state/authStore";
import { useContactsStore } from "@/state/contactsStore";
import { useWalletStore } from "@/state/walletStore";

function downloadJson(filename: string, data: string): void {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function BackupSettingsScreen() {
  const wallet = useWalletStore();
  const contacts = useContactsStore((s) => s.contacts);
  const verify = useAuthStore((s) => s.verify);
  const [step, setStep] = useState<"locked" | "revealed">("locked");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState("");

  async function reveal() {
    setError(null);
    const ok = await verify(passcode);
    if (!ok) {
      setError("Incorrect passcode.");
      return;
    }
    setStep("revealed");
  }

  function buildExport() {
    const data = {
      app: "getnowhere",
      version: "0.1.0",
      exportedAt: new Date().toISOString(),
      wallet: {
        address: wallet.address,
        seedRef: wallet.seedRef,
        network: wallet.network,
      },
      contacts: contactsExportPayload(contacts),
      note: "Seed phrase intentionally excluded from metadata export. Contacts are also stored in the encrypted wallet addressBook on device.",
    };
    const json = JSON.stringify(data, null, 2);
    setExportData(json);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`getnowhere-metadata-${stamp}.json`, json);
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
        title="Backup seed phrase"
        leading={<BackLink to="/settings" />}
        subtitle="Verify, then write down offline"
        bordered
      />
      <div
        className="screen-scroll stack stack--gap-4"
        style={{ padding: "16px 16px 32px" }}
      >
        {step === "locked" && (
          <div className="stack stack--gap-3 fade-in-up">
            <div
              className="card card--pad-md"
              style={{ background: "var(--bg-elev-2)" }}
            >
              <div className="row-flex" style={{ gap: 10 }}>
                <Lock size={16} style={{ color: "var(--text-faint)" }} />
                <span className="muted" style={{ fontSize: 13.5 }}>
                  Enter your passcode to reveal your seed phrase. The seed is
                  shown once and never leaves the device.
                </span>
              </div>
            </div>
            <SecureInput
              label="Passcode"
              value={passcode}
              onChange={setPasscode}
              inputMode="numeric"
              revealable
            />
            {error && <div className="field__error">{error}</div>}
            <button className="btn btn--block btn--primary" onClick={reveal}>
              <Eye size={15} /> Reveal seed
            </button>
          </div>
        )}

        {step === "revealed" && wallet.seedPhrase && (
          <div className="fade-in-up">
            <SeedBackupPanel
              seedPhrase={wallet.seedPhrase}
              onConfirm={async () => {
                await seedBackupService.confirmBackup(passcode);
                setStep("locked");
                setPasscode("");
              }}
            />
          </div>
        )}

        <hr className="divider" />
        <div className="card">
          <div className="card__title">Export wallet metadata</div>
          <p
            className="muted"
            style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}
          >
            Downloads a .json with address, network, and saved contacts. The
            seed phrase is never included. Contacts also live in the encrypted
            wallet blob (addressBook) used by wallet backup import.
          </p>
          <button
            className="btn btn--block btn--secondary"
            onClick={() => {
              buildExport();
              setShowExport(true);
            }}
          >
            <Download size={15} /> Download metadata .json
          </button>
        </div>
      </div>

      <ConfirmModal
        open={showExport}
        title="Metadata export downloaded"
        body={
          <pre
            className="mono"
            style={{
              fontSize: 11,
              whiteSpace: "pre-wrap",
              maxHeight: 200,
              overflow: "auto",
            }}
          >
            {exportData}
          </pre>
        }
        confirmLabel="Done"
        onConfirm={() => setShowExport(false)}
        onClose={() => setShowExport(false)}
      />
    </div>
  );
}
