/** Route gnh-notifications WebView commands to the GnhNotifications module. */
import {
  nativeApplyPrivacySettings,
  nativeClearBadge,
  nativeGetNotificationPermissionStatus,
  nativePublishEvent,
  nativeRequestNotificationPermission,
  nativeSetBadgeCount,
} from "./gnhNotificationsNative";
import type { NotificationPermissionResult } from "./resolveNotificationPermission";

/** Permission reply for `_resolveNotifications`; `requestId` echoes the command. */
export type NotificationsReply = NotificationPermissionResult & {
  requestId: string;
};

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
  requestId?: string;
  wantToken?: boolean;
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

/** Commands without a `requestId` (legacy fire-and-forget) get no reply. */
function replyWhenSettled(
  requestId: unknown,
  pending: Promise<NotificationPermissionResult>,
  reply: (payload: NotificationsReply) => void,
): void {
  void pending
    .catch(
      (): NotificationPermissionResult => ({
        status: "unavailable",
        alertEnabled: false,
      }),
    )
    .then((result) => {
      if (typeof requestId !== "string" || requestId.length === 0) return;
      reply({ requestId, ...result });
    });
}

/**
 * Returns true when the message was a notifications command (handled).
 * `reply` receives one payload per permission command that carries a `requestId`.
 */
export function handleNotificationsWebViewMessage(
  raw: string,
  reply: (payload: NotificationsReply) => void,
): boolean {
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
      replyWhenSettled(
        msg.requestId,
        nativeRequestNotificationPermission({
          badge: msg.badge === true,
          alert: msg.alert === true,
          wantToken: msg.wantToken === true,
        }),
        reply,
      );
      return true;
    case "getPermissionStatus":
      if (typeof msg.requestId === "string") {
        replyWhenSettled(
          msg.requestId,
          nativeGetNotificationPermissionStatus(),
          reply,
        );
      }
      return true;
    default:
      return true;
  }
}
