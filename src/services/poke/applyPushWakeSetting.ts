/** User-gesture flow: persist push-wake opt-in and register with the poke gateway. */
import {
  isMobileAndroid,
  isMobileHost,
} from "@/lib/mobile/gnhMobileBridgeTypes";
import { bridgeRequestNotificationPermissions } from "@/lib/mobile/nativeNotificationsBridge";
import { subscribeAll } from "@/lib/mobile/ntfyWakeBridge";
import { bridgeRequestPokeTokenRefresh } from "@/lib/mobile/pokeNativeBridge";
import { useSettingsStore } from "@/state/settingsStore";

export function applyPushWakeEnabled(on: boolean): void {
  // settingsStore side-effect handles opt-out cleanup (Android ntfy unsubscribe / iOS deletePokeHandle).
  useSettingsStore.getState().setPrivacy({ pushWakeEnabled: on });
  if (!on || !isMobileHost()) return;
  bridgeRequestNotificationPermissions({ badge: true, alert: true });
  if (isMobileAndroid()) {
    subscribeAll();
  } else {
    bridgeRequestPokeTokenRefresh();
  }
}
