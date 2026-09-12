/** Local (non-APNs) notification request ids. @see docs/features/local-background-notifications.md */

export const LOCAL_NOTIFICATION_ID_PREFIX = "gnh.local.";

/** Prefix an opaque event id so local banners can be distinguished from remote wakes. */
export function localNotificationId(eventId: string): string {
  if (eventId.startsWith(LOCAL_NOTIFICATION_ID_PREFIX)) return eventId;
  return `${LOCAL_NOTIFICATION_ID_PREFIX}${eventId}`;
}
