/**
 * Live wallet sync poll — mirrors conceal-next-wallet WALLET_POLL (#112).
 * Keeps tip + mempool fresh so L1 invites / relays arrive near-instantly.
 */
import { useEffect, useRef } from "react";
import {
  isAppAccessLocked,
  isAppInBackground,
  onAppAccessLifecycle,
} from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { getRuntime, sync } from "@/services/conceal/sync/runtime";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import { useWalletStore } from "@/state/walletStore";

/** [whileCatchingUp, whenNearTip] ms — tip poll shortened so keep-alive wallet UI stays fresh. */
export const WALLET_POLL_MS = [2500, 5_000] as const;

/** Slower cadence when tab/window is hidden (battery). */
export const BACKGROUND_POLL_MS = 30_000;

export function resolveWalletPollMs(
  hidden: boolean,
  catchingUp: boolean,
): number {
  if (hidden) return BACKGROUND_POLL_MS;
  return catchingUp ? WALLET_POLL_MS[0] : WALLET_POLL_MS[1];
}

function isCatchingUp(): boolean {
  const status = useWalletStore.getState().syncStatus;
  if (status === "syncing") return true;
  const rt = getRuntime();
  if (!rt) return true;
  const progress = useWalletStore.getState().syncProgress;
  return progress > 0 && progress < 0.999;
}

/**
 * While the wallet is open: chain sync + invite/relay refresh until Exit.
 * Foreground uses fast/near-tip cadence; background uses {@link BACKGROUND_POLL_MS}.
 */
export function useWalletLiveSync(enabled: boolean): void {
  const refreshBalance = useWalletStore((s) => s.refreshBalance);
  const refreshInvites = useContactsStore((s) => s.refreshInvites);
  const refreshRelays = useChatStore((s) => s.refreshRelays);
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    useNotificationStore.getState().resetSession();

    let cancelled = false;

    const clear = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = (ms: number) => {
      clear();
      if (cancelled) return;
      timerRef.current = window.setTimeout(() => {
        void tick();
      }, ms);
    };

    const isBackgrounded = () => {
      if (isMobileHost()) return isAppInBackground();
      return document.visibilityState === "hidden";
    };

    const tick = async () => {
      if (cancelled) return;
      const hidden = isBackgrounded();

      if (isMobileHost() && isAppAccessLocked()) {
        schedule(BACKGROUND_POLL_MS);
        return;
      }

      if (runningRef.current) {
        schedule(hidden ? BACKGROUND_POLL_MS : WALLET_POLL_MS[0]);
        return;
      }
      runningRef.current = true;
      try {
        // Await tip catch-up before ingest/UI refresh. Fire-and-forget left
        // chat pins (mempool) ahead of wallet history (Zustand cache).
        let networkHeight = 0;
        try {
          networkHeight = await sync();
        } catch {
          /* node blip — still push whatever runtime has */
        }
        const scanned = getRuntime()?.state.scannedHeight ?? 0;
        const tip = Math.max(networkHeight, scanned, 1);
        useWalletStore.setState({
          syncProgress: Math.min(1, scanned / tip),
          syncStatus: "synced",
          lastSyncedAt: new Date().toISOString(),
        });
        // Always push balance+txs (not only when visible). Keep-alive wallet
        // tab never remounts; Zustand must stay current without Resync.
        await refreshBalance();
        await refreshInvites();
        await refreshRelays();
        if (isMobileHost() && hidden) {
          try {
            const { scanAndPublishSyncNotifications } = await import(
              "@/services/notifications/scanSyncNotifications"
            );
            await scanAndPublishSyncNotifications();
          } catch {
            /* best-effort — never break the poll loop */
          }
        }
        schedule(resolveWalletPollMs(hidden, isCatchingUp()));
      } catch {
        schedule(hidden ? BACKGROUND_POLL_MS : WALLET_POLL_MS[0]);
      } finally {
        runningRef.current = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };

    const unsubLifecycle = isMobileHost()
      ? onAppAccessLifecycle((type) => {
          if (
            type === "foreground" ||
            type === "background" ||
            type === "screenOff"
          ) {
            void tick();
          }
        })
      : () => {};

    document.addEventListener("visibilitychange", onVisibility);
    void tick();

    return () => {
      cancelled = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
      unsubLifecycle();
    };
  }, [enabled, refreshBalance, refreshInvites, refreshRelays]);
}
