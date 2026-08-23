/**
 * Peer-wake push token helper for the Expo shell.
 * Gets the raw APNs (iOS) or FCM (Android) device token via expo-notifications
 * and reports it to the WebView for gateway registration.
 * @see docs/features/peer-wake-notification.md
 */
import { Platform } from "react-native";

export type PokeTokenResult = {
  platform: "apns" | "fcm";
  token: string;
};

/**
 * Fetches the raw device push token. Returns null when push is denied,
 * expo-notifications is unavailable, or the token cannot be obtained.
 */
export async function getPushTokenForPoke(): Promise<PokeTokenResult | null> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    // Lazy-load so a missing package doesn't crash the whole shell.
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return null;
    const result = await Notifications.getDevicePushTokenAsync();
    const platform: "apns" | "fcm" = result.type === "ios" ? "apns" : "fcm";
    return { platform, token: result.data };
  } catch {
    return null;
  }
}

/**
 * Registers a handler that fires whenever the OS rotates the push token.
 * Returns a cleanup function.
 */
export async function onPushTokenRefresh(
  callback: (result: PokeTokenResult) => void,
): Promise<() => void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return () => {};
  }
  try {
    const Notifications = await import("expo-notifications");
    const sub = Notifications.addPushTokenListener((tokenData) => {
      const platform: "apns" | "fcm" =
        tokenData.type === "ios" ? "apns" : "fcm";
      callback({ platform, token: tokenData.data });
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
