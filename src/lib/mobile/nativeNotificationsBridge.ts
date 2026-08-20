/** WebView → RN bridge for GnhNotifications (mobile shell). */
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import type {
  NativeNotificationInput,
  NotificationPrivacySettings,
} from "@/services/notifications/nativeNotificationTypes";
import {
  nativeNotificationBody,
  nativeNotificationTitle,
} from "@/services/notifications/toNativeNotificationEvent";

type NotificationsCommand =
  | {
      action: "applyPrivacySettings";
      settings: NotificationPrivacySettings;
    }
  | {
      action: "publishEvent";
      eventId: string;
      /** Display-only strings — the native layer must not parse them. */
      title: string;
      body: string;
      settings: NotificationPrivacySettings;
      appInForeground: boolean;
      badgeCount: number;
    }
  | {
      action: "setBadgeCount";
      count: number;
    }
  | {
      action: "clearBadge";
    }
  | {
      action: "requestPermissions";
      badge: boolean;
      alert: boolean;
    };

function postNotificationsCommand(command: NotificationsCommand): void {
  if (!isMobileHost()) return;
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({
      channel: "gnh-notifications",
      direction: "command",
      ...command,
    }),
  );
}

export function bridgeApplyNotificationPrivacySettings(
  settings: NotificationPrivacySettings,
): void {
  postNotificationsCommand({ action: "applyPrivacySettings", settings });
}

export function bridgePublishNotificationEvent(
  event: NativeNotificationInput,
  settings: NotificationPrivacySettings,
  appInForeground: boolean,
  badgeCount: number,
): void {
  postNotificationsCommand({
    action: "publishEvent",
    eventId: event.eventId,
    title: nativeNotificationTitle(event),
    body: nativeNotificationBody(event),
    settings,
    appInForeground,
    badgeCount,
  });
}

export function bridgeSetNativeBadgeCount(count: number): void {
  postNotificationsCommand({ action: "setBadgeCount", count });
}

export function bridgeClearNativeBadge(): void {
  postNotificationsCommand({ action: "clearBadge" });
}

export function bridgeRequestNotificationPermissions(options: {
  badge: boolean;
  alert: boolean;
}): void {
  postNotificationsCommand({
    action: "requestPermissions",
    badge: options.badge,
    alert: options.alert,
  });
}
