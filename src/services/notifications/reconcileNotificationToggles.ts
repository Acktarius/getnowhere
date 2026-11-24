/** Settings-open check: turn off stored-on notification toggles whose OS permission was revoked. */
import type { NotificationPermissionReply } from "@/services/notifications/nativeNotificationTypes";
import {
  grantedFor,
  NOTIFICATION_TOGGLE_PRIVACY_KEY,
  type NotificationToggle,
} from "@/services/notifications/notificationToggleFlow";

export type NotificationTogglePrivacy = Record<
  (typeof NOTIFICATION_TOGGLE_PRIVACY_KEY)[NotificationToggle],
  boolean
>;

const TOGGLES = Object.keys(
  NOTIFICATION_TOGGLE_PRIVACY_KEY,
) as NotificationToggle[];

/** Patch that only ever turns toggles off; an unavailable or timed-out reply changes nothing. */
export function reconcileNotificationToggles(
  privacy: NotificationTogglePrivacy,
  reply: NotificationPermissionReply,
): Partial<NotificationTogglePrivacy> {
  if (reply.status === "unavailable" || reply.timedOut) return {};
  const patch: Partial<NotificationTogglePrivacy> = {};
  for (const toggle of TOGGLES) {
    const key = NOTIFICATION_TOGGLE_PRIVACY_KEY[toggle];
    if (privacy[key] && !grantedFor(toggle, reply)) patch[key] = false;
  }
  return patch;
}
