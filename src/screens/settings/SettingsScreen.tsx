import {
  ChevronRight,
  Database,
  Download,
  Gauge,
  Info,
  KeyRound,
  Network,
  Pickaxe,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NodeSelector } from "@/components/NodeSelector";
import { PrivacySettingItem } from "@/components/PrivacySettingItem";
import { ThemeSelector } from "@/components/ThemeSelector";
import { TopBar } from "@/components/TopBar";
import { useNavNotificationBadges } from "@/hooks/useNavNotificationBadges";
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
import { toastError } from "@/state/toastStore";
import { useWalletStore } from "@/state/walletStore";
import { version } from "../../../package.json";

type WipeConfirm = "delete" | "reset" | "delete-resync";

export function SettingsScreen() {
  const s = useSettingsStore();
  const navBadges = useNavNotificationBadges();
  const setNode = useWalletStore((w) => w.setNode);
  const resync = useWalletStore((w) => w.resync);
  const resyncFromCreationHeight = useWalletStore(
    (w) => w.resyncFromCreationHeight,
  );
  const resetAndRescanFromCreationHeight = useWalletStore(
    (w) => w.resetAndRescanFromCreationHeight,
  );
  const syncStatus = useWalletStore((w) => w.syncStatus);
  const [showNodeSheet, setShowNodeSheet] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [currentNode, setCurrentNode] = useState(getInternalWalletNodeUrl());
  const [syncSpeed, setSyncSpeed] = useState<SyncSpeed>(DEFAULT_SYNC_SPEED);
  const [readMinerTx, setReadMinerTx] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [resyncBusy, setResyncBusy] = useState(false);
  const [creationHeight, setCreationHeight] = useState<number | null>(null);
  const [wipeConfirm, setWipeConfirm] = useState<WipeConfirm | null>(null);

  useEffect(() => {
    void refreshAutoNode();
    const rt = getRuntime();
    if (rt?.raw.options) {
      setSyncSpeed(
        syncSpeedFromReadSpeed(Number(rt.raw.options.readSpeed ?? 0)),
      );
      setReadMinerTx(Boolean(rt.raw.options.checkMinerTx));
      setCurrentNode(getInternalWalletNodeUrl());
      setCreationHeight(Math.max(0, Number(rt.raw.creationHeight ?? 0) || 0));
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

  async function runResyncFromCreation() {
    setResyncBusy(true);
    try {
      await resyncFromCreationHeight();
    } catch (err) {
      toastError((err as Error)?.message ?? "Resync failed.");
    } finally {
      setResyncBusy(false);
    }
  }

  async function runDeleteAndResync() {
    setResyncBusy(true);
    try {
      await resetAndRescanFromCreationHeight();
    } catch (err) {
      toastError((err as Error)?.message ?? "Delete and resync failed.");
      throw err;
    } finally {
      setResyncBusy(false);
    }
  }

  async function runWipe(kind: WipeConfirm) {
    try {
      if (kind === "delete") await deleteWalletData();
      else await resetAppData();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toastError(
        kind === "delete"
          ? `Could not delete wallet: ${message}`
          : `Could not reset app data: ${message}`,
      );
      throw err;
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
        <ThemeSelector />

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
              description="On Exit, save chat messages into the encrypted wallet. Off = do not save chat text."
              on={s.privacy.localMessageRetention}
              onToggle={(v) => s.setPrivacy({ localMessageRetention: v })}
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
              title="Biometrics & auto-lock"
              sub="Auto-lock, app access, and data unlock"
            />
            <LinkRow
              to="/settings/wallet-password"
              icon={KeyRound}
              title="Wallet password"
              sub="Change local wallet encryption password"
            />
            <LinkRow
              to="/settings/backup"
              icon={Download}
              title="Backup"
              sub="Reveal seed & keys, download encrypted wallet"
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
                  <span className="field__hint">Profiles</span>
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
              icon={Pickaxe}
              title="Read miner transactions"
              description="Include coinbase outputs when syncing — needed for solo mining."
              on={readMinerTx}
              onToggle={(v) => void applyMinerTx(v)}
            />
            <hr className="divider divider--flush" />
            <div
              className="row"
              style={{
                flexDirection: "column",
                alignItems: "stretch",
                gap: 10,
              }}
            >
              <div className="row-flex" style={{ gap: 10 }}>
                <RowLead icon={RefreshCw} />
                <div className="row__main">
                  <div className="row__title">Blockchain rescan</div>
                  <span className="field__hint">
                    {creationHeight !== null
                      ? `Creation height: ${creationHeight}. Resync rewinds the scan cursor; delete and resync clears stored transactions first.`
                      : "Resync from wallet creation height (unlock wallet first)."}
                  </span>
                </div>
              </div>
              <div
                className="row-flex"
                style={{ flexWrap: "wrap", gap: 6, paddingLeft: 46 }}
              >
                <button
                  type="button"
                  disabled={
                    resyncBusy || settingsBusy || syncStatus === "syncing"
                  }
                  className="btn btn--sm btn--secondary"
                  onClick={() => void runResyncFromCreation()}
                >
                  {resyncBusy ? "Resyncing…" : "Resync"}
                </button>
                <button
                  type="button"
                  disabled={
                    resyncBusy || settingsBusy || syncStatus === "syncing"
                  }
                  className="btn btn--sm btn--danger"
                  onClick={() => setWipeConfirm("delete-resync")}
                >
                  Delete and resync
                </button>
              </div>
            </div>
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
              title="About Get NowHere"
              sub="Version, story, and licenses"
            />
          </div>
        </div>

        <div className="section" style={{ display: "grid", gap: 8 }}>
          <button
            type="button"
            className="btn btn--block btn--danger"
            onClick={() => setWipeConfirm("delete")}
          >
            <Trash2 size={15} /> Delete wallet
          </button>
          <button
            type="button"
            className="btn btn--block btn--danger"
            onClick={() => setWipeConfirm("reset")}
          >
            <Trash2 size={15} /> Reset app data
          </button>
          <p className="center faint" style={{ fontSize: 11.5, paddingTop: 8 }}>
            Get NowHere · v{version} · getnowhere.im
          </p>
        </div>
      </div>
      <BottomNav {...navBadges} />

      <ConfirmModal
        open={wipeConfirm === "delete"}
        title="Delete wallet?"
        body="This removes your wallet, contacts, and rooms. Theme and other preferences are kept. The app will reload."
        confirmLabel="Delete wallet"
        destructive
        busyLabel="Deleting…"
        onConfirm={() => runWipe("delete")}
        onClose={() => setWipeConfirm(null)}
      />
      <ConfirmModal
        open={wipeConfirm === "delete-resync"}
        title="Delete and resync?"
        body="This clears all stored wallet transactions and received smart messages, then rescans from your wallet creation height. Balances will rebuild as blocks are scanned."
        confirmLabel="Delete and resync"
        destructive
        busyLabel="Rescanning…"
        onConfirm={() => runDeleteAndResync()}
        onClose={() => setWipeConfirm(null)}
      />
      <ConfirmModal
        open={wipeConfirm === "reset"}
        title="Reset all app data?"
        body="This removes your wallet, contacts, rooms, theme, and preferences. The app will reload."
        confirmLabel="Reset app data"
        destructive
        busyLabel="Resetting…"
        onConfirm={() => runWipe("reset")}
        onClose={() => setWipeConfirm(null)}
      />

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
