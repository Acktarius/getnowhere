/** User-gesture flow: persist push-wake opt-in and register with the poke gateway. */
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { bridgeRequestNotificationPermissions } from "@/lib/mobile/nativeNotificationsBridge";
import { bridgeRequestPokeTokenRefresh } from "@/lib/mobile/pokeNativeBridge";
import { useSettingsStore } from "@/state/settingsStore";

export function applyPushWakeEnabled(on: boolean): void {
  useSettingsStore.getState().setPrivacy({ pushWakeEnabled: on });
  if (!on || !isMobileHost()) return;
  bridgeRequestNotificationPermissions({ badge: true, alert: true });
  bridgeRequestPokeTokenRefresh();
}
