import {
  Bug,
  ChevronRight,
  Database,
  Fingerprint,
  Info,
  KeyRound,
  Network,
  Shield,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { PrivacySettingItem } from "@/components/PrivacySettingItem";
import { ThemeSelector } from "@/components/ThemeSelector";
import { TopBar } from "@/components/TopBar";
import { useSettingsStore } from "@/state/settingsStore";
import { useWalletStore } from "@/state/walletStore";

export function SettingsScreen() {
  const s = useSettingsStore();
  const network = useWalletStore((w) => w.network);

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
          <div className="card">
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
              to="/settings/backup"
              icon={KeyRound}
              title="Backup seed phrase"
              sub="Reveal and confirm your 24-word backup"
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
              title="Network"
              sub="Conceal network selection (placeholder)"
              trailing={<span className="pill pill--none">{network}</span>}
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

        <div className="section">
          <button className="btn btn--block btn--danger">
            <Trash2 size={15} /> Reset app data
          </button>
          <p className="center faint" style={{ fontSize: 11.5, paddingTop: 8 }}>
            Get Now Here · v0.1.0 · getnowhere.im
          </p>
        </div>
      </div>
      <BottomNav />
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
}: {
  icon: typeof Shield;
  title: string;
  sub: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="row">
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
