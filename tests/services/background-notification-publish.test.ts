import { beforeEach, describe, expect, it, vi } from "vitest";

const posted: Array<Record<string, unknown>> = [];

vi.stubGlobal("window", {
  ...globalThis.window,
  ReactNativeWebView: {
    postMessage: (raw: string) => {
      posted.push(JSON.parse(raw) as Record<string, unknown>);
    },
  },
});

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => true,
}));

import {
  _resetAppAccessControllerForTests,
  handleLifecycleEvent,
} from "../../src/lib/mobile/AppAccessController";
import {
  __resetNotificationEventLedger,
  markNotificationEventsRead,
  unreadNotificationCount,
} from "../../src/services/notifications/notificationEventLedger";
import { publishDomainNotificationEvent } from "../../src/services/notifications/publishBackgroundNotification";
import { useSettingsStore } from "../../src/state/settingsStore";

/** Notifications only publish while backgrounded; tests drive this explicitly. */
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

function relayEvent(eventId: string) {
  return {
    kind: "l1_known_room_message" as const,
    eventId,
    occurredAtMs: Date.now(),
    contactId: "c1",
    contactDisplayName: "Alice",
    messagePreview: "hello",
    roomId: "r1",
  };
}

describe("publishDomainNotificationEvent", () => {
  beforeEach(() => {
    __resetNotificationEventLedger();
    posted.length = 0;
    useSettingsStore.getState().reset();
    _resetAppAccessControllerForTests();
    setVisibility("hidden");
  });

  it("settings invariant: notifications off forces banners off", () => {
    useSettingsStore.getState().setPrivacy({
      notificationsEnabled: true,
      notificationBannersEnabled: true,
    });
    expect(useSettingsStore.getState().privacy.notificationBannersEnabled).toBe(
      true,
    );
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: false });
    expect(useSettingsStore.getState().privacy.notificationBannersEnabled).toBe(
      false,
    );
  });

  it("notifications disabled leaves badge untouched and sends nothing native", () => {
    expect(publishDomainNotificationEvent(relayEvent("e1"))).toBe(false);
    expect(unreadNotificationCount()).toBe(0);
    expect(posted.filter((m) => m.channel === "gnh-notifications")).toEqual([]);
  });

  it("event seen while disabled still notifies after the user opts in", () => {
    // Regression: the ledger must not burn eventIds while notifications are off.
    publishDomainNotificationEvent(relayEvent("e-optin"));
    expect(unreadNotificationCount()).toBe(0);

    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    expect(publishDomainNotificationEvent(relayEvent("e-optin"))).toBe(true);
    expect(unreadNotificationCount()).toBe(1);
    expect(
      posted.filter(
        (m) => m.channel === "gnh-notifications" && m.action === "publishEvent",
      ),
    ).toHaveLength(1);
  });

  it("event seen while foreground still notifies once backgrounded", () => {
    // Regression: a suppressed-in-foreground event must not burn its eventId,
    // otherwise a background poll that lands as the user opens the app drops it.
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    setVisibility("visible");
    expect(publishDomainNotificationEvent(relayEvent("e-fg"))).toBe(false);
    expect(unreadNotificationCount()).toBe(0);
    expect(
      posted.filter(
        (m) => m.channel === "gnh-notifications" && m.action === "publishEvent",
      ),
    ).toEqual([]);

    setVisibility("hidden");
    expect(publishDomainNotificationEvent(relayEvent("e-fg"))).toBe(true);
    expect(unreadNotificationCount()).toBe(1);
    const msgs = posted.filter(
      (m) => m.channel === "gnh-notifications" && m.action === "publishEvent",
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].appInForeground).toBe(false);
  });

  it("native background with visible document still publishes", () => {
    // Android WebView often keeps visibilityState === "visible" after Home.
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    setVisibility("visible");
    handleLifecycleEvent("background");
    expect(publishDomainNotificationEvent(relayEvent("e-native-bg"))).toBe(
      true,
    );
    expect(
      posted.filter(
        (m) => m.channel === "gnh-notifications" && m.action === "publishEvent",
      ),
    ).toHaveLength(1);
  });

  it("enabled + banners off publishes badge-bearing event with banners disabled", () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    publishDomainNotificationEvent(relayEvent("e2"));
    const msgs = posted.filter(
      (m) => m.channel === "gnh-notifications" && m.action === "publishEvent",
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].badgeCount).toBe(1);
    expect(
      (msgs[0].settings as { bannersEnabled: boolean }).bannersEnabled,
    ).toBe(false);
  });

  it("duplicate eventId does not increment unread or publish again", () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    expect(publishDomainNotificationEvent(relayEvent("e3"))).toBe(true);
    expect(publishDomainNotificationEvent(relayEvent("e3"))).toBe(false);
    expect(unreadNotificationCount()).toBe(1);
    const msgs = posted.filter(
      (m) => m.channel === "gnh-notifications" && m.action === "publishEvent",
    );
    expect(msgs).toHaveLength(1);
  });

  it("replayed events after mark-read do not resurrect unread", () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    publishDomainNotificationEvent(relayEvent("e4"));
    markNotificationEventsRead({ roomId: "r1" });
    expect(unreadNotificationCount()).toBe(0);
    publishDomainNotificationEvent(relayEvent("e4"));
    expect(unreadNotificationCount()).toBe(0);
  });

  it("published payload contains no room id, address, or tx hash", () => {
    useSettingsStore.getState().setPrivacy({
      notificationsEnabled: true,
      notificationBannersEnabled: true,
    });
    publishDomainNotificationEvent(relayEvent("e5"));
    const msg = posted.find(
      (m) => m.channel === "gnh-notifications" && m.action === "publishEvent",
    )!;
    expect(msg.title).toBe("Alice");
    expect(msg.body).toBe("Alice: hello");
    expect(JSON.stringify(msg)).not.toContain("r1");
    expect(Object.keys(msg)).not.toContain("roomId");
    expect(Object.keys(msg)).not.toContain("contactId");
  });
});
