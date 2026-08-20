import { useEffect, useState } from "react";
import { getWalletSyncLag } from "@/services/conceal/walletSyncTip";

export type WalletSyncHeights = {
  scannedHeight: number;
  networkHeight: number;
};

/** Polls wallet scanned height vs daemon tip while sync UI is active. */
export function useWalletSyncHeights(
  active: boolean,
): WalletSyncHeights | null {
  const [heights, setHeights] = useState<WalletSyncHeights | null>(null);

  useEffect(() => {
    if (!active) {
      setHeights(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const lag = await getWalletSyncLag();
      if (cancelled || !lag || lag.networkHeight <= 0) return;
      setHeights({
        scannedHeight: lag.scannedHeight,
        networkHeight: lag.networkHeight,
      });
    };
    void tick();
    const id = window.setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active]);

  return active ? heights : null;
}
