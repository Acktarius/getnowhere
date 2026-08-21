/** Native bridge helpers for background remote-node sync inject/resolve. */
import {
  NativeEventEmitter,
  type NativeModule,
  NativeModules,
  Platform,
} from "react-native";

type GnhBackgroundSyncNative = {
  registerWebViewInjector?: () => void;
  clearWebViewInjector?: () => void;
  resolveBackgroundSync?: (requestId: string, outcome: string) => void;
  setAppInBackground?: (inBackground: boolean) => void;
};

const native: GnhBackgroundSyncNative | undefined =
  Platform.OS === "android" || Platform.OS === "ios"
    ? (NativeModules.GnhBackgroundSync as GnhBackgroundSyncNative | undefined)
    : undefined;

export function isGnhBackgroundSyncNativeAvailable(): boolean {
  return native?.registerWebViewInjector != null;
}

export function registerBackgroundSyncWebViewInjector(
  injectScript: (script: string) => void,
): () => void {
  if (!native?.registerWebViewInjector) {
    return () => {};
  }
  const emitter = new NativeEventEmitter(
    NativeModules.GnhBackgroundSync as NativeModule | undefined,
  );
  const sub = emitter.addListener(
    "gnhBackgroundSyncInject",
    (script: string) => {
      if (typeof script === "string") injectScript(script);
    },
  );
  native.registerWebViewInjector();
  return () => {
    sub.remove();
    native.clearWebViewInjector?.();
  };
}

export function resolveNativeBackgroundSync(
  requestId: string,
  outcome: string,
): void {
  native?.resolveBackgroundSync?.(requestId, outcome);
}

/** Android: chain 30s one-shot workers while backgrounded (WebView timers pause). */
export function setNativeAppInBackground(inBackground: boolean): void {
  if (Platform.OS !== "android") return;
  native?.setAppInBackground?.(inBackground);
}
