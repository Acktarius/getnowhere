import {
  Bug,
  ChevronRight,
  Database,
  Fingerprint,
  Gauge,
  Info,
  KeyRound,
  Network,
  Shield,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { NodeSelector } from "@/components/NodeSelector";
import { PrivacySettingItem } from "@/components/PrivacySettingItem";
import { ThemeSelector } from "@/components/ThemeSelector";
import { TopBar } from "@/components/TopBar";
import { refreshAutoNode } from "@/lib/network/auto-node";
import { setPreferredNode } from "@/lib/network/node-preference";
import {
  DEFAULT_SYNC_SPEED,
  readSpeedFromSyncSpeed,
  SYNC_SPEED_LABELS,
  SYNC_SPEED_OPTIONS,
  type SyncSpeed,
  syncSpeedFromReadSpeed,
} from "@/lib/sync-speed";
import { getNodeUrlFormatHints } from "@/lib/validation/node-url";
import {
  getInternalWalletNodeUrl,
  updateWalletSyncSettings,
} from "@/services/conceal/ConcealWalletService";
import { getRuntime } from "@/services/conceal/sync";
import {
  deleteWalletData,
  resetAppData,
} from "@/services/storage/appDataLifecycle";
import { useSettingsStore } from "@/state/settingsStore";
import { useWalletStore } from "@/state/walletStore";

export function SettingsScreen() {
  const s = useSettingsStore();
  const setNode = useWalletStore((w) => w.setNode);
  const resync = useWalletStore((w) => w.resync);
  const [showNodeSheet, setShowNodeSheet] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [currentNode, setCurrentNode] = useState(getInternalWalletNodeUrl());
  const [syncSpeed, setSyncSpeed] = useState<SyncSpeed>(DEFAULT_SYNC_SPEED);
  const [readMinerTx, setReadMinerTx] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);

  useEffect(() => {
    void refreshAutoNode();
    const rt = getRuntime();
    if (rt?.raw.options) {
      setSyncSpeed(
        syncSpeedFromReadSpeed(Number(rt.raw.options.readSpeed ?? 0)),
      );
      setReadMinerTx(Boolean(rt.raw.options.checkMinerTx));
      setCurrentNode(getInternalWalletNodeUrl());
    }
  }, []);

  async function applyNode(url: string) {
    setPreferredNode(url);
    setNode(url);
    setCurrentNode(url);
    setShowNodeSheet(false);
    await resync();
  }

  async function applySyncSpeed(speed: SyncSpeed) {
    setSyncSpeed(speed);
    setSettingsBusy(true);
    try {
      await updateWalletSyncSettings({
        readSpeed: readSpeedFromSyncSpeed(speed),
      });
    } finally {
      setSettingsBusy(false);
    }
  }

  async function applyMinerTx(on: boolean) {
    setReadMinerTx(on);
    setSettingsBusy(true);
    try {
      await updateWalletSyncSettings({ checkMinerTx: on });
    } finally {
      setSettingsBusy(false);
    }
  }

  async function onDeleteWallet() {
    const ok = window.confirm(
      "Delete wallet? This removes your wallet, contacts, and rooms. Theme and other preferences are kept. The app will reload.",
    );
    if (!ok) return;
    setWipeBusy(true);
    try {
      await deleteWalletData();
    } catch (err) {
      setWipeBusy(false);
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Could not delete wallet: ${message}`);
    }
  }

  async function onResetAppData() {
    const ok = window.confirm(
      "Reset all app data? This removes your wallet, contacts, rooms, theme, and preferences. The app will reload.",
    );
    if (!ok) return;
    setWipeBusy(true);
    try {
      await resetAppData();
    } catch (err) {
      setWipeBusy(false);
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`Could not reset app data: ${message}`);
    }
  }

  const customHints = getNodeUrlFormatHints(customUrl);

  return (
    <div className="screen">
      <TopBar title="Settings" bordered />
      <div
        className="screen-scroll stack stack--gap-4"
        style={{ padding: "16px 0 32px" }}
      >
        <div className="section">
          <ThemeSelector />
        </div>

        <div className="section">
          <div className="section__head">
            <span className="section__title">Privacy</span>
          </div>
          <div className="card card--flush">
            <PrivacySettingItem
              title="Hide balances by default"
              description="Blur CCX amounts until you tap to reveal."
              on={s.privacy.hideBalancesByDefault}
              onToggle={(v) => s.setPrivacy({ hideBalancesByDefault: v })}
            />
            <hr className="divider divider--flush" />
            <PrivacySettingItem
              title="Blur in app switcher"
              description="Obscure the screen when the app moves to the background."
              on={s.privacy.blurInAppSwitcher}
              onToggle={(v) => s.setPrivacy({ blurInAppSwitcher: v })}
            />
            <hr className="divider divider--flush" />
            <PrivacySettingItem
              title="Clear clipboard warnings"
              description="Warn before sensitive values are copied to the clipboard."
              on={s.privacy.clearClipboardWarnings}
              onToggle={(v) => s.setPrivacy({ clearClipboardWarnings: v })}
            />
            <hr className="divider divider--flush" />
            <PrivacySettingItem
              title="Local message retention"
              description="Keep a local-only cache of recent P2P messages."
              on={s.privacy.localMessageRetention}
              onToggle={(v) => s.setPrivacy({ localMessageRetention: v })}
            />
            <hr className="divider divider--flush" />
            <PrivacySettingItem
              title="Advanced debug logging"
              description="Off by default. Enables diagnostics capture for troubleshooting."
              on={s.privacy.advancedDebugLogging}
              onToggle={(v) => s.setPrivacy({ advancedDebugLogging: v })}
            />
          </div>
        </div>

        <div className="section">
          <div className="section__head">
            <span className="section__title">Security</span>
          </div>
          <div className="card card--flush">
            <LinkRow
              to="/settings/security"
              icon={Shield}
              title="Passcode & biometrics"
              sub="Change unlock PIN, biometric placeholder"
            />
            <LinkRow
              to="/settings/wallet-password"
              icon={KeyRound}
              title="Wallet password"
              sub="Change local wallet encryption password"
            />
            <LinkRow
              to="/settings/backup"
              icon={KeyRound}
              title="Backup seed phrase"
              sub="Reveal and confirm your seed backup"
            />
          </div>
        </div>

        <div className="section">
          <div className="section__head">
            <span className="section__title">Sync</span>
          </div>
          <div className="card card--flush">
            <div
              className="row"
              style={{
                flexDirection: "column",
                alignItems: "stretch",
                gap: 10,
              }}
            >
              <div className="row-flex" style={{ gap: 10 }}>
                <RowLead icon={Gauge} />
                <div className="row__main">
                  <div className="row__title">Sync speed</div>
                  <div className="row__sub" style={{ fontSize: 12.5 }}>
                    Same profiles as Conceal Next Wallet (workers, batch,
                    sources).
                  </div>
                </div>
              </div>
              <div
                className="row-flex"
                style={{ flexWrap: "wrap", gap: 6, paddingLeft: 46 }}
              >
                {SYNC_SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    disabled={settingsBusy}
                    className={`btn btn--sm ${syncSpeed === speed ? "btn--primary" : "btn--secondary"}`}
                    onClick={() => void applySyncSpeed(speed)}
                  >
                    {SYNC_SPEED_LABELS[speed]}
                  </button>
                ))}
              </div>
            </div>
            <hr className="divider divider--flush" />
            <PrivacySettingItem
              title="Read miner transactions"
              description="Include coinbase outputs when syncing — needed for solo mining."
              on={readMinerTx}
              onToggle={(v) => void applyMinerTx(v)}
            />
          </div>
        </div>

        <div className="section">
          <div className="section__head">
            <span className="section__title">Advanced</span>
          </div>
          <div className="card card--flush">
            <Row
              icon={Network}
              title="Daemon Node"
              sub={currentNode}
              trailing={<ChevronRight size={18} className="mute" />}
              onClick={() => setShowNodeSheet(true)}
            />
            <hr className="divider divider--flush" />
            <Row
              icon={Database}
              title="Local cache"
              sub="Manage on-device cached data"
              trailing={
                <ChevronRight
                  size={16}
                  style={{ color: "var(--text-faint)" }}
                />
              }
            />
            <hr className="divider divider--flush" />
            <Row
              icon={Fingerprint}
              title="Biometric unlock"
              sub="Placeholder — available on supported devices"
              trailing={
                <button
                  role="switch"
                  aria-checked={s.biometricEnabled}
                  onClick={() => s.setBiometric(!s.biometricEnabled)}
                  style={{
                    width: 44,
                    height: 26,
                    borderRadius: 13,
                    background: s.biometricEnabled
                      ? "var(--primary)"
                      : "var(--bg-press)",
                    border: "1px solid var(--border)",
                    position: "relative",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: s.biometricEnabled ? 20 : 2,
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "var(--text-inverse)",
                      transition: "left var(--dur) var(--ease)",
                    }}
                  />
                </button>
              }
            />
            <hr className="divider divider--flush" />
            <Row
              icon={Bug}
              title="Diagnostics"
              sub="View logs and adapter state"
              trailing={
                <Link
                  className="btn btn--sm btn--secondary"
                  to="/settings/about"
                >
                  Open
                </Link>
              }
            />
          </div>
        </div>

        <div className="section">
          <div className="section__head">
            <span className="section__title">About</span>
          </div>
          <div className="card card--flush">
            <LinkRow
              to="/settings/about"
              icon={Info}
              title="About Get Now Here"
              sub="Version, story, and licenses"
            />
          </div>
        </div>

        <div className="section" style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            className="btn btn--block btn--danger"
            disabled={wipeBusy}
            onClick={() => void onDeleteWallet()}
          >
            <Trash2 size={15} /> Delete wallet
          </button>
          <button
            type="button"
            className="btn btn--block btn--danger"
            disabled={wipeBusy}
            onClick={() => void onResetAppData()}
          >
            <Trash2 size={15} /> Reset app data
          </button>
          <p className="center faint" style={{ fontSize: 11.5, paddingTop: 8 }}>
            Get Now Here · v0.1.0 · getnowhere.im
          </p>
        </div>
      </div>
      <BottomNav />

      {showNodeSheet && (
        <div
          className="sheet-overlay"
          onClick={() => setShowNodeSheet(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              background: "var(--bg-elev-1)",
              borderRadius: "20px 20px 0 0",
              padding:
                "24px 20px calc(env(safe-area-inset-bottom, 16px) + 16px)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Daemon Node</h2>
              <button
                className="btn btn--sm btn--secondary"
                onClick={() => setShowNodeSheet(false)}
              >
                Close
              </button>
            </div>
            <p className="faint" style={{ fontSize: 12.5, marginBottom: 16 }}>
              Select a remote node for wallet sync. Changes apply on the next
              sync. Precedence: custom → preferred → auto → default.
            </p>

            <NodeSelector
              activeNodeUrl={currentNode}
              onUseNode={(url) => void applyNode(url)}
              onUseFastest={(url) => {
                if (url) void applyNode(url);
              }}
            />

            <hr className="divider" style={{ margin: "16px 0" }} />
            {!showCustom ? (
              <button
                className="btn btn--block btn--secondary"
                onClick={() => setShowCustom(true)}
              >
                Use custom node URL
              </button>
            ) : (
              <div>
                <input
                  className="input"
                  placeholder="https://your-node/daemon/"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  style={{ width: "100%", marginBottom: 8 }}
                />
                {customHints.map((hint) => (
                  <p
                    key={hint}
                    style={{
                      fontSize: 12,
                      color: "var(--warning, #d4a017)",
                      marginBottom: 4,
                    }}
                  >
                    {hint}
                  </p>
                ))}
                <button
                  className="btn btn--block btn--primary"
                  disabled={!customUrl.trim()}
                  onClick={() => {
                    void applyNode(customUrl.trim());
                    setShowCustom(false);
                    setCustomUrl("");
                  }}
                >
                  Save custom node
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LinkRow({
  to,
  icon: Icon,
  title,
  sub,
}: {
  to: string;
  icon: typeof Shield;
  title: string;
  sub: string;
}) {
  return (
    <Link
      to={to}
      className="row row--clickable"
      style={{ textDecoration: "none" }}
    >
      <RowLead icon={Icon} />
      <div className="row__main">
        <div className="row__title">{title}</div>
        <div
          className="row__sub"
          style={{ fontFamily: "inherit", fontSize: 12.5 }}
        >
          {sub}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: "var(--text-faint)" }} />
    </Link>
  );
}

function Row({
  icon: Icon,
  title,
  sub,
  trailing,
  onClick,
}: {
  icon: typeof Shield;
  title: string;
  sub: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={onClick ? "row row--clickable" : "row"}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <RowLead icon={Icon} />
      <div className="row__main">
        <div className="row__title">{title}</div>
        <div
          className="row__sub"
          style={{ fontFamily: "inherit", fontSize: 12.5 }}
        >
          {sub}
        </div>
      </div>
      {trailing}
    </div>
  );
}

function RowLead({ icon: Icon }: { icon: typeof Shield }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: "var(--bg-elev-2)",
        color: "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={17} />
    </div>
  );
}
