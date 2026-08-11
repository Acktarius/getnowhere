/**
 * Live wallet sync poll — mirrors conceal-next-wallet WALLET_POLL (#112).
 * Keeps tip + mempool fresh so L1 invites / relays arrive near-instantly.
 */
import { useEffect, useRef } from "react";
import { getRuntime, sync } from "@/services/conceal/sync/runtime";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import { useWalletStore } from "@/state/walletStore";

/** [whileCatchingUp, whenNearTip] ms — same cadence as next-wallet. */
const WALLET_POLL_MS = [2500, 20_000] as const;

function isCatchingUp(): boolean {
  const status = useWalletStore.getState().syncStatus;
  if (status === "syncing") return true;
  const rt = getRuntime();
  if (!rt) return true;
  const progress = useWalletStore.getState().syncProgress;
  return progress > 0 && progress < 0.999;
}

/**
 * While the wallet is open: background `sync()` (coalesced) + invite/relay refresh.
 * Pauses when the tab is hidden.
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

    const tick = async () => {
      if (cancelled || document.visibilityState === "hidden") {
        schedule(WALLET_POLL_MS[1]);
        return;
      }
      if (runningRef.current) {
        schedule(WALLET_POLL_MS[0]);
        return;
      }
      runningRef.current = true;
      try {
        // Non-blocking tip catch-up (same pattern as next-wallet getWalletInfo).
        void sync().catch(() => {});
        await refreshBalance();
        await refreshInvites();
        await refreshRelays();
        schedule(isCatchingUp() ? WALLET_POLL_MS[0] : WALLET_POLL_MS[1]);
      } catch {
        schedule(WALLET_POLL_MS[0]);
      } finally {
        runningRef.current = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void tick();

    return () => {
      cancelled = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, refreshBalance, refreshInvites, refreshRelays]);
}
