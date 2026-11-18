import { RefreshCw, Wallet } from "lucide-react";
import { useWalletSyncHeights } from "@/hooks/useWalletSyncHeights";
import {
  INSUFFICIENT_FUNDS_MESSAGE,
  type RoomCreationGate,
} from "@/lib/wallet/relationship-fuel";

const CHIP_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  maxWidth: "100%",
  fontSize: 12,
  whiteSpace: "nowrap",
} as const;

/**
 * Top bar wallet status: scan height / tip while syncing, "Insufficient funds"
 * once synced without fuel, nothing when room creation is allowed.
 */
export function ContactSyncChip({ gate }: { gate: RoomCreationGate }) {
  const syncing = !gate.ok && gate.reason !== "insufficient";
  const heights = useWalletSyncHeights(syncing);
  if (gate.ok) return null;

  if (gate.reason === "insufficient") {
    return (
      <span
        role="alert"
        title={INSUFFICIENT_FUNDS_MESSAGE}
        style={{ ...CHIP_STYLE, color: "var(--danger)" }}
      >
        <Wallet size={14} aria-hidden />
        Insufficient funds
      </span>
    );
  }

  const label = heights
    ? `${heights.scannedHeight.toLocaleString()} / ${heights.networkHeight.toLocaleString()}`
    : "syncing";
  return (
    <span
      role="status"
      aria-label={`Wallet sync ${label}`}
      title="Wallet scan height / chain tip"
      className="mono"
      style={{ ...CHIP_STYLE, color: "var(--text-muted)" }}
    >
      <Wallet size={14} aria-hidden />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <RefreshCw size={14} className="spin" aria-hidden />
    </span>
  );
}
