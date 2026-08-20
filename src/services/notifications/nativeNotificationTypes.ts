/** Typed contract for GnhNotifications native module. @see docs/features/local-background-notifications.md */
export type NativeNotificationInput =
  | {
      kind: "l1_invitation_received";
      eventId: string;
      occurredAtMs: number;
    }
  | {
      kind: "l1_invitation_accepted";
      eventId: string;
      occurredAtMs: number;
    }
  | {
      kind: "l1_known_room_message";
      eventId: string;
      occurredAtMs: number;
      contactDisplayName: string;
      messagePreview: string;
    };

export type NotificationPrivacySettings = {
  notificationsEnabled: boolean;
  bannersEnabled: boolean;
};

export interface NowHereNotificationsModule {
  applyPrivacySettings(settings: NotificationPrivacySettings): Promise<void>;
  publishEvent(
    event: NativeNotificationInput,
    settings: NotificationPrivacySettings,
  ): Promise<void>;
  getBadgeCount(): Promise<number>;
  setBadgeCount(count: number): Promise<void>;
  clearBadge(): Promise<void>;
  requestPermissions(options: {
    badge: boolean;
    alert: boolean;
  }): Promise<{ granted: boolean; status: string }>;
  getPermissionStatus(): Promise<{
    status: string;
    alert: boolean;
    badge: boolean;
  }>;
}
