/**
 * Wallet sync lag vs chain tip — gates room enablement during rescan.
 * @see docs/security/p2pchatprotocol.md
 */
import { getRuntime } from "@/services/conceal/sync/runtime";

/** Extra block slack for scannedHeight count-vs-index overshoot. @see sync/runtime RESCAN_LAG_BLOCKS */
const HEIGHT_INDEX_SLACK = 1;

export type WalletSyncLag = {
  scannedHeight: number;
  networkHeight: number;
  lagBlocks: number;
};

/** Scanned tip vs daemon height; null when wallet is locked. */
export async function getWalletSyncLag(): Promise<WalletSyncLag | null> {
  const rt = getRuntime();
  if (!rt) return null;
  const scannedHeight = rt.state.scannedHeight ?? 0;
  try {
    const networkHeight = await rt.daemon.getHeight();
    return {
      scannedHeight,
      networkHeight,
      lagBlocks: Math.max(0, networkHeight - scannedHeight),
    };
  } catch {
    return { scannedHeight, networkHeight: scannedHeight, lagBlocks: 0 };
  }
}

/** True when sync is within `toleranceBlocks` of chain tip (+ index slack). */
export async function isWalletNearTip(toleranceBlocks = 1): Promise<boolean> {
  const lag = await getWalletSyncLag();
  if (!lag) return false;
  return lag.lagBlocks <= toleranceBlocks + HEIGHT_INDEX_SLACK;
}
