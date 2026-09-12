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

const fetchIncomingRegisters = vi.fn(async () => []);
const fetchIncomingRelays = vi.fn(async () => []);

vi.mock("@/services", () => ({
  smartMessageService: {
    fetchIncomingRegisters: (...args: unknown[]) =>
      fetchIncomingRegisters(...args),
    fetchIncomingRelays: (...args: unknown[]) => fetchIncomingRelays(...args),
  },
}));

import { _resetAppAccessControllerForTests } from "../../src/lib/mobile/AppAccessController";
import {
  __resetNotificationEventLedger,
  unreadNotificationCount,
} from "../../src/services/notifications/notificationEventLedger";
import { scanAndPublishSyncNotifications } from "../../src/services/notifications/scanSyncNotifications";
import {
  removeCatalogRoom,
  upsertCatalogRoom,
} from "../../src/services/p2p/roomCatalogStore";
import { useContactsStore } from "../../src/state/contactsStore";
import { useSettingsStore } from "../../src/state/settingsStore";
import type { Contact, SmartMessageInvite } from "../../src/types/models";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

const contact = {
  id: "c1",
  alias: "Alice",
  roomId: "r1",
  relationshipStatus: "eligible",
} as Contact;

const receivedInvite = {
  id: "inv-local-1",
  contactId: "c1",
  roomId: "r1",
  inviteId: "invite-hex",
  status: "received",
  createdAt: "2026-01-01T00:00:00.000Z",
} as SmartMessageInvite;

describe("scanAndPublishSyncNotifications", () => {
  beforeEach(() => {
    __resetNotificationEventLedger();
    posted.length = 0;
    useSettingsStore.getState().reset();
    _resetAppAccessControllerForTests();
    setVisibility("hidden");
    removeCatalogRoom("r1");
    useContactsStore.setState({ contacts: [contact], invites: [] });
    fetchIncomingRegisters.mockReset();
    fetchIncomingRelays.mockReset();
    fetchIncomingRegisters.mockResolvedValue([]);
    fetchIncomingRelays.mockResolvedValue([]);
  });

  it("known-room L1′ ingest does not publish a native content banner", async () => {
    useSettingsStore.getState().setPrivacy({
      notificationsEnabled: true,
      notificationBannersEnabled: true,
    });
    upsertCatalogRoom({
      id: "r1",
      contactId: "c1",
      lifecycleStatus: "connected",
      createdAt: "2026-01-01T00:00:00.000Z",
    } as Parameters<typeof upsertCatalogRoom>[0]);
    fetchIncomingRelays.mockResolvedValue([
      {
        relay: {
          type: "chat.relay",
          roomId: "r1",
          sentAt: 1_700_000_000,
          text: "hello there",
        },
        txHash: "tx-relay-1",
      },
    ]);

    await scanAndPublishSyncNotifications();

    const msgs = posted.filter(
      (m) => m.channel === "gnh-notifications" && m.action === "publishEvent",
    );
    expect(msgs).toHaveLength(0);
    expect(JSON.stringify(posted)).not.toContain("Alice");
    expect(JSON.stringify(posted)).not.toContain("hello there");
    expect(unreadNotificationCount()).toBe(1);
  });

  it("invite-received posts a generic local banner", async () => {
    useSettingsStore.getState().setPrivacy({
      notificationsEnabled: true,
      notificationBannersEnabled: true,
    });
    useContactsStore.setState({
      contacts: [contact],
      invites: [receivedInvite],
    });

    await scanAndPublishSyncNotifications();

    const msgs = posted.filter(
      (m) => m.channel === "gnh-notifications" && m.action === "publishEvent",
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].title).toBe("Get NowHere");
    expect(msgs[0].body).toBe("You received a room invite");
    expect(JSON.stringify(msgs[0])).not.toContain("Alice");
    expect(String(msgs[0].eventId).startsWith("gnh.local.")).toBe(true);
  });
});
