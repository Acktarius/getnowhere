import { Eye, EyeOff, Lock, RefreshCw, Unlock } from "lucide-react";
import { useEffect, useState } from "react";
import { useWalletSyncHeights } from "@/hooks/useWalletSyncHeights";
import type { WalletState } from "@/types/models";
import { formatCCX } from "@/utils/format";

type Props = {
  wallet: Pick<
    WalletState,
    | "balanceTotal"
    | "balanceAvailable"
    | "balancePending"
    | "syncStatus"
    | "locked"
  >;
  hideByDefault?: boolean;
  onResync?: () => void;
  onToggleLock?: () => void;
};

export function WalletBalanceCard({
  wallet,
  hideByDefault,
  onResync,
  onToggleLock,
}: Props) {
  const [hidden, setHidden] = useState(Boolean(hideByDefault));
  // Wallet tab stays mounted (keep-alive); apply the setting when it changes.
  useEffect(() => {
    setHidden(Boolean(hideByDefault));
  }, [hideByDefault]);
  const blur = hidden ? "privacy-blur" : "";
  const syncing = wallet.syncStatus === "syncing";
  const syncHeights = useWalletSyncHeights(syncing);
  const syncLabel = syncing
    ? "syncing…"
    : wallet.syncStatus === "synced"
      ? "synced"
      : wallet.syncStatus === "error"
        ? "sync error"
        : "idle";

  return (
    <div className="card card--pad-lg">
      <div className="row-flex row-flex--between" style={{ marginBottom: 14 }}>
        <span className="eyebrow">Total balance</span>
        <div className="row-flex" style={{ gap: 6 }}>
          <button
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? "Show balance" : "Hide balance"}
          >
            {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          {onToggleLock && (
            <button
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              onClick={onToggleLock}
              aria-label={wallet.locked ? "Unlock" : "Lock"}
            >
              {wallet.locked ? <Lock size={15} /> : <Unlock size={15} />}
            </button>
          )}
          {onResync && (
            <button
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              onClick={onResync}
              aria-label="Resync"
            >
              <RefreshCw size={15} />
            </button>
          )}
        </div>
      </div>
      <div className={blur} style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em" }}
        >
          {formatCCX(wallet.balanceTotal)}{" "}
          <span className="faint" style={{ fontSize: 16 }}>
            CCX
          </span>
        </div>
      </div>
      <div className="row-flex" style={{ gap: 20 }}>
        <div>
          <div className="eyebrow">Available</div>
          <div
            className={`mono ${blur}`}
            style={{ fontSize: 15, fontWeight: 500 }}
          >
            {formatCCX(wallet.balanceAvailable)}
          </div>
        </div>
        <div>
          <div className="eyebrow">Pending</div>
          <div
            className={`mono ${blur}`}
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "var(--text-muted)",
            }}
          >
            {formatCCX(wallet.balancePending)}
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="eyebrow">Sync</div>
          <div
            style={{
              fontSize: 13,
              color:
                wallet.syncStatus === "synced"
                  ? "var(--success)"
                  : "var(--text-muted)",
            }}
          >
            {syncLabel}
          </div>
          {syncing && syncHeights ? (
            <div
              className="mono"
              style={{
                fontSize: 11,
                marginTop: 3,
                color: "var(--text-faint)",
                letterSpacing: "-0.01em",
              }}
              title="Wallet scan height / chain tip"
            >
              {syncHeights.scannedHeight.toLocaleString()} /{" "}
              {syncHeights.networkHeight.toLocaleString()}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
