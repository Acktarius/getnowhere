/** RN NativeModules wrapper for GnhNotifications (Android + iOS after prebuild). */
import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import {
  type NotificationPermissionDeps,
  type NotificationPermissionRequest,
  type NotificationPermissionResult,
  readNotificationPermissionStatus,
  resolveNotificationPermission,
} from "./resolveNotificationPermission";

type GnhNotificationsNative = {
  applyPrivacySettings(settingsJson: string): Promise<boolean>;
  publishEvent(payloadJson: string): Promise<string>;
  setBadgeCount(count: number): Promise<boolean>;
  clearBadge(): Promise<boolean>;
  getPermissionStatus(): Promise<string>;
  requestPermissions(badge: boolean, alert: boolean): Promise<string>;
};

const native: GnhNotificationsNative | undefined =
  Platform.OS === "android" || Platform.OS === "ios"
    ? (NativeModules.GnhNotifications as GnhNotificationsNative | undefined)
    : undefined;

export function isGnhNotificationsNativeAvailable(): boolean {
  return native != null;
}

export async function nativeApplyPrivacySettings(settings: {
  notificationsEnabled: boolean;
  bannersEnabled: boolean;
}): Promise<void> {
  if (!native) return;
  await native.applyPrivacySettings(JSON.stringify(settings)).catch(() => {});
}

export async function nativePublishEvent(payload: {
  eventId: string;
  title: string;
  body: string;
  badgeCount: number;
  notificationsEnabled: boolean;
  bannersEnabled: boolean;
  appInForeground: boolean;
}): Promise<string> {
  if (!native) return "UNAVAILABLE";
  return native.publishEvent(JSON.stringify(payload)).catch(() => "ERROR");
}

export async function nativeSetBadgeCount(count: number): Promise<void> {
  if (!native) return;
  await native.setBadgeCount(count).catch(() => {});
}

export async function nativeClearBadge(): Promise<void> {
  if (!native) return;
  await native.clearBadge().catch(() => {});
}

async function getDevicePushToken(): Promise<string> {
  // Lazy-load so a missing package doesn't crash the whole shell.
  const Notifications = await import("expo-notifications");
  const result = await Notifications.getDevicePushTokenAsync();
  return String(result.data);
}

function permissionDeps(): NotificationPermissionDeps {
  return {
    platformOS: Platform.OS,
    native,
    androidApiLevel:
      typeof Platform.Version === "number" ? Platform.Version : 0,
    requestAndroidPostNotifications: () =>
      PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      ),
    getDevicePushToken,
  };
}

/** Prompt for notification permission; resolves with the user's answer (never throws). */
export function nativeRequestNotificationPermission(
  request: NotificationPermissionRequest,
): Promise<NotificationPermissionResult> {
  return resolveNotificationPermission(permissionDeps(), request);
}

/** Current notification permission state without prompting (never throws). */
export function nativeGetNotificationPermissionStatus(): Promise<NotificationPermissionResult> {
  return readNotificationPermissionStatus(permissionDeps());
}
