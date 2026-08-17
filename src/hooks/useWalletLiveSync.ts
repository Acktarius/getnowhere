/**
 * Live wallet sync poll — mirrors conceal-next-wallet WALLET_POLL (#112).
 * Keeps tip + mempool fresh so L1 invites / relays arrive near-instantly.
 */
import { useEffect, useRef } from "react";
import {
  getAppAccessState,
  isAppAccessLocked,
  onAppAccessLifecycle,
} from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { getRuntime, sync } from "@/services/conceal/sync/runtime";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import { useWalletStore } from "@/state/walletStore";

/** [whileCatchingUp, whenNearTip] ms — same cadence as next-wallet. */
export const WALLET_POLL_MS = [2500, 20_000] as const;

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
      if (document.visibilityState === "hidden") return true;
      if (isMobileHost()) {
        const reason = getAppAccessState().reason;
        return reason === "background" || reason === "screenOff";
      }
      return false;
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
        void sync().catch(() => {});
        if (!hidden) await refreshBalance();
        await refreshInvites();
        await refreshRelays();
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
          if (type === "foreground") void tick();
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
