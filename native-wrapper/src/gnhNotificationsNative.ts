/** RN NativeModules wrapper for GnhNotifications (Android + iOS after prebuild). */
import { NativeModules, Platform } from "react-native";

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

export async function nativeRequestPermissions(
  badge: boolean,
  alert: boolean,
): Promise<void> {
  if (!native) return;
  await native.requestPermissions(badge, alert).catch(() => {});
}
