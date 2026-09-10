/** WebView → RN bridge: request a fresh push token for peer-wake registration. */
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";

export function bridgeRequestPokeTokenRefresh(): void {
  if (!isMobileHost()) return;
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({
      channel: "gnh-poke",
      direction: "command",
      action: "refreshToken",
    }),
  );
}
