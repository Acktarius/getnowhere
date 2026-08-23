/**
 * Vite-side bridge: receives push tokens from the native shell and registers
 * them with the poke gateway.
 * Call `initPushTokenBridge()` once at app boot when running in mobile host.
 * @see docs/features/peer-wake-notification.md
 */
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { registerPokeHandle } from "@/services/poke/pokeGatewayClient";
import { useSettingsStore } from "@/state/settingsStore";

let cleanupFn: (() => void) | null = null;

async function handleToken(
  platform: "apns" | "fcm",
  token: string,
): Promise<void> {
  const { privacy } = useSettingsStore.getState();
  if (!privacy.pushWakeEnabled) return;
  try {
    await registerPokeHandle(platform, token);
  } catch {
    // Best-effort: silently skip on network error.
  }
}

/**
 * Registers the `onPokeToken` listener on `window.gnhMobile`.
 * Idempotent — calling multiple times replaces the previous subscription.
 * Returns a cleanup function.
 */
export function initPushTokenBridge(): () => void {
  if (!isMobileHost()) return () => {};
  cleanupFn?.();
  const mobile = window.gnhMobile;
  if (!mobile?.onPokeToken) return () => {};
  cleanupFn = mobile.onPokeToken((platform, token) => {
    void handleToken(platform, token);
  });
  return () => {
    cleanupFn?.();
    cleanupFn = null;
  };
}
