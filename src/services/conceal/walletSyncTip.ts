/**
 * Wallet sync lag vs chain tip — gates room enablement during rescan.
 * @see docs/security/p2pchatprotocol.md
 */
import { getRuntime, type SdkRuntime } from "@/services/conceal/sync/runtime";

/** Extra block slack for scannedHeight count-vs-index overshoot. @see sync/runtime RESCAN_LAG_BLOCKS */
const HEIGHT_INDEX_SLACK = 1;

export type WalletSyncLag = {
  scannedHeight: number;
  networkHeight: number;
  lagBlocks: number;
};

/** Scanned tip vs daemon height for `rt` (default: active wallet); null when locked. */
export async function getWalletSyncLag(
  rt: SdkRuntime | null = getRuntime(),
): Promise<WalletSyncLag | null> {
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

/** True when `lagBlocks` is within `toleranceBlocks` of chain tip (+ index slack). */
export function isLagNearTip(lagBlocks: number, toleranceBlocks = 1): boolean {
  return lagBlocks <= toleranceBlocks + HEIGHT_INDEX_SLACK;
}

/** True when `rt` (default: active wallet) is within `toleranceBlocks` of chain tip. */
export async function isWalletNearTip(
  toleranceBlocks = 1,
  rt: SdkRuntime | null = getRuntime(),
): Promise<boolean> {
  const lag = await getWalletSyncLag(rt);
  if (!lag) return false;
  return isLagNearTip(lag.lagBlocks, toleranceBlocks);
}
