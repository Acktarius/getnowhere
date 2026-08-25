/**
 * Peer-wake push token helper for the Expo shell (iOS/APNs only).
 * Gets the raw APNs device token via expo-notifications and reports it
 * to the WebView for gateway registration. Android returns null — FCM
 * removed; F-Droid pokeId wiring is handled in a later group.
 * @see docs/features/peer-wake-notification.md
 */
import { Platform } from "react-native";

export type PokeTokenResult = {
  platform: "apns";
  token: string;
};

/**
 * Fetches the raw APNs device push token (iOS only).
 * Returns null on Android, web, push-denied, or any error.
 */
export async function getPushTokenForPoke(): Promise<PokeTokenResult | null> {
  if (Platform.OS !== "ios") return null;
  try {
    // Lazy-load so a missing package doesn't crash the whole shell.
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return null;
    const result = await Notifications.getDevicePushTokenAsync();
    return { platform: "apns", token: result.data };
  } catch {
    return null;
  }
}

/**
 * Registers a handler that fires whenever the OS rotates the APNs push token.
 * No-op on Android. Returns a cleanup function.
 */
export async function onPushTokenRefresh(
  callback: (result: PokeTokenResult) => void,
): Promise<() => void> {
  if (Platform.OS !== "ios") return () => {};
  try {
    const Notifications = await import("expo-notifications");
    const sub = Notifications.addPushTokenListener(
      (tokenData: { data: string }) => {
        callback({ platform: "apns", token: tokenData.data });
      },
    );
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
