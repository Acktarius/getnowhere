/** Route gnh-notifications WebView commands to the GnhNotifications module. */
import {
  nativeApplyPrivacySettings,
  nativeClearBadge,
  nativePublishEvent,
  nativeRequestPermissions,
  nativeSetBadgeCount,
} from "./gnhNotificationsNative";

type NotificationsMessage = {
  channel?: string;
  direction?: string;
  action?: string;
  settings?: { notificationsEnabled?: boolean; bannersEnabled?: boolean };
  eventId?: string;
  title?: string;
  body?: string;
  appInForeground?: boolean;
  badgeCount?: number;
  count?: number;
  badge?: boolean;
  alert?: boolean;
};

export function parseNotificationsMessage(
  raw: string,
): NotificationsMessage | null {
  try {
    const msg = JSON.parse(raw) as NotificationsMessage;
    if (msg.channel !== "gnh-notifications" || msg.direction !== "command") {
      return null;
    }
    if (typeof msg.action !== "string") return null;
    return msg;
  } catch {
    return null;
  }
}

function readSettings(msg: NotificationsMessage): {
  notificationsEnabled: boolean;
  bannersEnabled: boolean;
} {
  const notificationsEnabled = msg.settings?.notificationsEnabled === true;
  const bannersEnabled =
    notificationsEnabled && msg.settings?.bannersEnabled === true;
  return { notificationsEnabled, bannersEnabled };
}

/** Returns true when the message was a notifications command (handled). */
export function handleNotificationsWebViewMessage(raw: string): boolean {
  const msg = parseNotificationsMessage(raw);
  if (!msg) return false;
  switch (msg.action) {
    case "applyPrivacySettings":
      void nativeApplyPrivacySettings(readSettings(msg));
      return true;
    case "publishEvent": {
      if (typeof msg.eventId !== "string" || msg.eventId.length === 0) {
        return true;
      }
      const settings = readSettings(msg);
      void nativePublishEvent({
        eventId: msg.eventId,
        title: typeof msg.title === "string" ? msg.title : "Get NowHere",
        body: typeof msg.body === "string" ? msg.body : "New message",
        badgeCount:
          typeof msg.badgeCount === "number" && msg.badgeCount >= 0
            ? Math.floor(msg.badgeCount)
            : 0,
        notificationsEnabled: settings.notificationsEnabled,
        bannersEnabled: settings.bannersEnabled,
        appInForeground: msg.appInForeground !== false,
      });
      return true;
    }
    case "setBadgeCount":
      void nativeSetBadgeCount(
        typeof msg.count === "number" && msg.count >= 0
          ? Math.floor(msg.count)
          : 0,
      );
      return true;
    case "clearBadge":
      void nativeClearBadge();
      return true;
    case "requestPermissions":
      void nativeRequestPermissions(msg.badge === true, msg.alert === true);
      return true;
    default:
      return true;
  }
}
