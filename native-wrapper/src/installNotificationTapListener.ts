import { NativeEventEmitter, NativeModules, Platform } from "react-native";

/**
 * Subscribe to `gnhNotificationTap` on iOS so the native module installs its
 * notification-center delegate at launch. Returns a cleanup; no-op elsewhere.
 * @see docs/features/local-background-notifications.md
 */
export function installNotificationTapListener(): () => void {
  const module = NativeModules.GnhNotifications;
  if (Platform.OS !== "ios" || !module) return () => {};
  const subscription = new NativeEventEmitter(module).addListener(
    "gnhNotificationTap",
    () => {},
  );
  return () => subscription.remove();
}
