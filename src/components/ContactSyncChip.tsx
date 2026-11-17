import { RefreshCw, Wallet } from "lucide-react";
import { useWalletSyncHeights } from "@/hooks/useWalletSyncHeights";

/** Scan height / chain tip while the wallet is not synced. Hidden by the caller once synced. */
export function ContactSyncChip() {
  const heights = useWalletSyncHeights(true);
  const label = heights
    ? `${heights.scannedHeight.toLocaleString()} / ${heights.networkHeight.toLocaleString()}`
    : "syncing";

  return (
    <span
      role="status"
      aria-label={`Wallet sync ${label}`}
      title="Wallet scan height / chain tip"
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        maxWidth: "100%",
        fontSize: 12,
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      <Wallet size={14} aria-hidden />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      <RefreshCw size={14} className="spin" aria-hidden />
    </span>
  );
}
