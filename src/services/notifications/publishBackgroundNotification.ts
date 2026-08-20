/** Publish validated sync events to native notifications + ledger. @see docs/features/local-background-notifications.md */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { isAppInBackground } from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import {
  bridgeApplyNotificationPrivacySettings,
  bridgeClearNativeBadge,
  bridgePublishNotificationEvent,
  bridgeSetNativeBadgeCount,
} from "@/lib/mobile/nativeNotificationsBridge";
import type { NotificationPrivacySettings } from "@/services/notifications/nativeNotificationTypes";
import {
  hasNotificationLedgerEntry,
  recordNotificationLedgerEntry,
  unreadNotificationCount,
} from "@/services/notifications/notificationEventLedger";
import type { DomainNotificationEvent } from "@/services/notifications/toNativeNotificationEvent";
import { toNativeNotificationEvent } from "@/services/notifications/toNativeNotificationEvent";
import { useSettingsStore } from "@/state/settingsStore";

/** Domain eventIds may embed roomId/plaintext — hash before storage/native. */
export function opaqueNotificationEventId(domainEventId: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(domainEventId)));
}

export function readNotificationPrivacySettings(): NotificationPrivacySettings {
  const privacy = useSettingsStore.getState().privacy;
  const notificationsEnabled = privacy.notificationsEnabled ?? false;
  let bannersEnabled = privacy.notificationBannersEnabled ?? false;
  if (!notificationsEnabled) bannersEnabled = false;
  return { notificationsEnabled, bannersEnabled };
}

export function syncNativeBadgeFromLedger(): void {
  if (!isMobileHost()) return;
  const count = unreadNotificationCount();
  if (count <= 0) {
    bridgeClearNativeBadge();
    return;
  }
  bridgeSetNativeBadgeCount(count);
}

function isAppForegroundForNotifications(): boolean {
  if (isMobileHost()) return !isAppInBackground();
  return (
    typeof document === "undefined" || document.visibilityState !== "hidden"
  );
}

/** Persist ledger entry once, then optionally notify native layer. */
export function publishDomainNotificationEvent(
  event: DomainNotificationEvent,
): boolean {
  // Notifications off = "no change from new event": do not burn the eventId,
  // otherwise dedup would permanently suppress it once the user opts in.
  const settings = readNotificationPrivacySettings();
  if (!settings.notificationsEnabled) return false;

  // Same reasoning while the user is looking at the app: suppress without
  // burning the eventId, so a later background scan can still notify.
  if (isAppForegroundForNotifications()) return false;

  const opaqueId = opaqueNotificationEventId(event.eventId);
  if (hasNotificationLedgerEntry(opaqueId)) return false;

  const recorded = recordNotificationLedgerEntry({
    eventId: opaqueId,
    kind: event.kind,
    occurredAtMs: event.occurredAtMs,
    contactId: "contactId" in event ? event.contactId : undefined,
    roomId: "roomId" in event ? event.roomId : undefined,
  });
  if (!recorded) return false;

  const nativeEvent = toNativeNotificationEvent({
    ...event,
    eventId: opaqueId,
  });
  if (!nativeEvent) return true;

  if (isMobileHost()) {
    bridgePublishNotificationEvent(
      nativeEvent,
      settings,
      false,
      unreadNotificationCount(),
    );
  }
  return true;
}

export function applyNotificationPrivacyToNative(): void {
  if (!isMobileHost()) return;
  bridgeApplyNotificationPrivacySettings(readNotificationPrivacySettings());
}

export function onNotificationPrivacyChanged(): void {
  applyNotificationPrivacyToNative();
  syncNativeBadgeFromLedger();
}
