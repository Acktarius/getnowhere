import { describe, expect, it } from "vitest";
import {
  contactRelayCount,
  shouldSuppressRelayBadge,
} from "../../src/services/notifications/relayNotification";
import { useNotificationStore } from "../../src/state/notificationStore";
import type { ChatRoom } from "../../src/types/models";

function room(
  id: string,
  contactId: string,
  lifecycleStatus: ChatRoom["lifecycleStatus"],
): ChatRoom {
  return {
    id,
    contactId,
    lifecycleStatus,
  } as ChatRoom;
}

describe("relayNotification", () => {
  it("shouldSuppressRelayBadge when active room matches route", () => {
    expect(shouldSuppressRelayBadge("r1", "r1", "/chats/r1")).toBe(true);
    expect(shouldSuppressRelayBadge("r1", "r1", "/contacts/c1")).toBe(false);
    expect(shouldSuppressRelayBadge("r1", "r2", "/chats/r2")).toBe(false);
  });

  it("contactRelayCount sums post-accept rooms only", () => {
    const rooms = [
      room("r1", "c1", "accepted"),
      room("r2", "c1", "pending"),
      room("r3", "c2", "connected"),
    ];
    expect(contactRelayCount("c1", rooms, { r1: 2, r2: 5, r3: 1 })).toBe(2);
  });

  it("relay ingest skips badge increment while viewing room", () => {
    useNotificationStore.getState().resetSession();
    const store = useNotificationStore.getState();
    store.finishRelayBootstrap();
    const roomId = "r1";
    if (!shouldSuppressRelayBadge(roomId, roomId, "/chats/r1")) {
      store.noteRelayIngested("m1", roomId);
    }
    expect(useNotificationStore.getState().roomRelayBadge(roomId)).toBe(0);
    if (!shouldSuppressRelayBadge(roomId, null, "/contacts")) {
      useNotificationStore.getState().noteRelayIngested("m2", roomId);
    }
    expect(useNotificationStore.getState().roomRelayBadge(roomId)).toBe(1);
  });
});
