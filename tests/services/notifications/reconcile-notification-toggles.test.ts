import { describe, expect, it } from "vitest";
import type { NotificationPermissionReply } from "@/services/notifications/nativeNotificationTypes";
import {
  type NotificationTogglePrivacy,
  reconcileNotificationToggles,
} from "@/services/notifications/reconcileNotificationToggles";

const allOn: NotificationTogglePrivacy = {
  notificationsEnabled: true,
  pushWakeEnabled: true,
  notificationBannersEnabled: true,
};

describe("reconcileNotificationToggles", () => {
  it("notDetermined turns stored-on Notifications off", () => {
    const reply: NotificationPermissionReply = {
      status: "notDetermined",
      alertEnabled: false,
    };
    expect(
      reconcileNotificationToggles(
        {
          notificationsEnabled: true,
          pushWakeEnabled: false,
          notificationBannersEnabled: false,
        },
        reply,
      ),
    ).toEqual({ notificationsEnabled: false });
  });

  it("authorized with alerts off turns Wake and Banner off, keeps Notifications", () => {
    const reply: NotificationPermissionReply = {
      status: "authorized",
      alertEnabled: false,
    };
    expect(reconcileNotificationToggles(allOn, reply)).toEqual({
      pushWakeEnabled: false,
      notificationBannersEnabled: false,
    });
  });

  it("never turns a stored-off toggle on", () => {
    const reply: NotificationPermissionReply = {
      status: "authorized",
      alertEnabled: true,
    };
    expect(
      reconcileNotificationToggles(
        {
          notificationsEnabled: true,
          pushWakeEnabled: false,
          notificationBannersEnabled: false,
        },
        reply,
      ),
    ).toEqual({});
  });

  it("unavailable and timed-out replies change nothing", () => {
    const unavailable: NotificationPermissionReply = {
      status: "unavailable",
      alertEnabled: false,
    };
    expect(reconcileNotificationToggles(allOn, unavailable)).toEqual({});
    expect(
      reconcileNotificationToggles(allOn, { ...unavailable, timedOut: true }),
    ).toEqual({});
  });
});
