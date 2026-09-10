/**
 * Wire mobile push-token → poke-gateway registration.
 * Subscribes to `window.gnhMobile.onPokeToken` when running in the mobile shell.
 * No-op on web/desktop.
 * @see docs/features/peer-wake-notification.md
 */
import { useEffect } from "react";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { initPushTokenBridge } from "@/lib/mobile/pushTokenBridge";

/** Mount once at app root when running in mobile shell. */
export function usePushTokenBridge(): void {
  useEffect(() => {
    if (!isMobileHost()) return;
    return initPushTokenBridge();
  }, []);
}
