/** WebView → RN bridge for GnhNotifications (mobile shell). */
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { localNotificationId } from "@/services/notifications/localNotificationId";
import type {
  NativeNotificationInput,
  NotificationPermissionReply,
  NotificationPermissionStatus,
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
      requestId?: string;
      wantToken?: boolean;
    }
  | {
      action: "getPermissionStatus";
      requestId: string;
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
    eventId: localNotificationId(event.eventId),
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

/** Safety timer for a pending permission reply; the system prompt may stay open for minutes. */
export const NOTIFICATION_REPLY_TIMEOUT_MS = 10 * 60 * 1000;

const PERMISSION_STATUSES: readonly NotificationPermissionStatus[] = [
  "authorized",
  "provisional",
  "denied",
  "notDetermined",
  "unavailable",
];

const UNAVAILABLE: NotificationPermissionReply = {
  status: "unavailable",
  alertEnabled: false,
};

export type NotificationReplyOptions = {
  /** Fires once if the matching reply arrives after the timeout already resolved. */
  onLateReply?: (reply: NotificationPermissionReply) => void;
  /** Abort to drop the listener (e.g. on unmount); a still-pending call resolves `unavailable`. */
  signal?: AbortSignal;
};

function toPermissionReply(
  raw: Record<string, unknown>,
): NotificationPermissionReply {
  const status = PERMISSION_STATUSES.find((s) => s === raw.status);
  const reply: NotificationPermissionReply = {
    status: status ?? "unavailable",
    alertEnabled: raw.alertEnabled === true,
  };
  if (typeof raw.requestId === "string") reply.requestId = raw.requestId;
  if (typeof raw.apnsToken === "string") reply.apnsToken = raw.apnsToken;
  return reply;
}

function awaitNotificationReply(
  command:
    | {
        action: "requestPermissions";
        badge: boolean;
        alert: boolean;
        wantToken: boolean;
      }
    | { action: "getPermissionStatus" },
  { onLateReply, signal }: NotificationReplyOptions,
): Promise<NotificationPermissionReply> {
  const subscribe = window.gnhMobile?._onNotificationsReply;
  const canPost = typeof window.ReactNativeWebView?.postMessage === "function";
  if (!isMobileHost() || !subscribe || !canPost || signal?.aborted) {
    return Promise.resolve({ ...UNAVAILABLE });
  }
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reply: NotificationPermissionReply): void => {
      settled = true;
      clearTimeout(timer);
      resolve(reply);
    };
    const detach = (): void => {
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = (): void => {
      detach();
      if (!settled) finish({ ...UNAVAILABLE });
    };
    const unsubscribe = subscribe((raw) => {
      if (raw?.requestId !== requestId) return;
      detach();
      const reply = toPermissionReply(raw);
      if (settled) onLateReply?.(reply);
      else finish(reply);
    });
    const timer = setTimeout(() => {
      if (!onLateReply) detach();
      finish({ ...UNAVAILABLE, timedOut: true });
    }, NOTIFICATION_REPLY_TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
    postNotificationsCommand({ ...command, requestId });
  });
}

/**
 * Ask the OS for notification permission and wait for the user's answer.
 * Resolves `unavailable` off-mobile, or `unavailable` + `timedOut` after
 * {@link NOTIFICATION_REPLY_TIMEOUT_MS}; a reply after that goes to `onLateReply`.
 */
export function requestNotificationPermission(
  request: { badge: boolean; alert: boolean; wantToken: boolean },
  options: NotificationReplyOptions = {},
): Promise<NotificationPermissionReply> {
  return awaitNotificationReply(
    { action: "requestPermissions", ...request },
    options,
  );
}

/** Read the current OS notification permission without prompting. Same timeout/late rules. */
export function getNotificationPermissionStatus(
  options: NotificationReplyOptions = {},
): Promise<NotificationPermissionReply> {
  return awaitNotificationReply({ action: "getPermissionStatus" }, options);
}
