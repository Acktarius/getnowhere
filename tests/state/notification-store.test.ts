import { beforeEach, describe, expect, it } from "vitest";
import { useNotificationStore } from "../../src/state/notificationStore";
import type { SmartMessageInvite } from "../../src/types/models";

function invite(contactId: string, roomId: string): SmartMessageInvite {
  return {
    id: `local_${roomId}`,
    contactId,
    roomId,
    inviteId: `wire_${roomId}`,
    replayId: "replay",
    nonce: "nonce",
    expiry: new Date().toISOString(),
    inviteExpiry: Math.floor(Date.now() / 1000) + 3600,
    roomTtl: Math.floor(Date.now() / 1000) + 86400,
    senderAlias: "Alice",
    capabilities: [],
    status: "received",
    createdAt: new Date().toISOString(),
  };
}

describe("notificationStore", () => {
  beforeEach(() => {
    useNotificationStore.getState().resetSession();
  });

  it("shows invite badge until contact is seen at current queue depth", () => {
    const store = useNotificationStore.getState();
    expect(store.contactInviteBadge("c1", 2)).toBe(2);
    store.markContactSeen("c1", 2);
    expect(useNotificationStore.getState().contactInviteBadge("c1", 2)).toBe(0);
    expect(useNotificationStore.getState().contactInviteBadge("c1", 3)).toBe(3);
  });

  it("tracks register ping until contact seen", () => {
    const store = useNotificationStore.getState();
    store.pingRegister("c1");
    expect(store.contactRegisterBadge("c1")).toBe(true);
    store.markContactSeen("c1", 0);
    expect(useNotificationStore.getState().contactRegisterBadge("c1")).toBe(
      false,
    );
  });

  it("ignores relay ingests until bootstrap finishes", () => {
    const store = useNotificationStore.getState();
    store.noteRelayIngested("r1:1:hi", "room1");
    expect(store.roomRelayBadge("room1")).toBe(0);
    store.finishRelayBootstrap();
    store.noteRelayIngested("r1:2:hey", "room1");
    expect(useNotificationStore.getState().roomRelayBadge("room1")).toBe(1);
  });

  it("clears room badges when room is opened", () => {
    const store = useNotificationStore.getState();
    store.finishRelayBootstrap();
    store.noteRelayIngested("r1:1:hi", "room1");
    store.markRoomSeen("room1");
    expect(useNotificationStore.getState().roomRelayBadge("room1")).toBe(0);
    expect(
      useNotificationStore.getState().roomPendingBadge("room1", true),
    ).toBe(false);
  });

  it("aggregates nav badges", () => {
    const store = useNotificationStore.getState();
    const invites = [invite("c1", "r1")];
    const contacts = [
      {
        id: "c1",
        alias: "Alice",
        inviteStatus: "received" as const,
      },
    ] as import("../../src/types/models").Contact[];
    expect(store.anyContactBadge(contacts, invites, [])).toBe(true);
    store.markContactSeen("c1", 1);
    expect(
      useNotificationStore.getState().anyContactBadge(contacts, invites, []),
    ).toBe(false);
  });

  it("contact relay badge aggregates room unread", () => {
    const store = useNotificationStore.getState();
    const contacts = [
      { id: "c1", alias: "Bob" },
    ] as import("../../src/types/models").Contact[];
    const rooms = [
      {
        id: "r1",
        contactId: "c1",
        lifecycleStatus: "accepted" as const,
      },
      {
        id: "r2",
        contactId: "c1",
        lifecycleStatus: "pending" as const,
      },
    ] as import("../../src/types/models").ChatRoom[];
    store.finishRelayBootstrap();
    store.noteRelayIngested("m1", "r1");
    expect(store.contactRelayBadge("c1", rooms)).toBe(1);
    expect(store.anyContactBadge(contacts, [], rooms)).toBe(true);
  });

  it("Chats nav badge is L1′ relay on post-accept rooms only", () => {
    const store = useNotificationStore.getState();
    const pendingRoom = {
      id: "r1",
      contactId: "c1",
      lifecycleStatus: "pending" as const,
    } as import("../../src/types/models").ChatRoom;
    expect(store.anyRoomBadge([pendingRoom])).toBe(false);

    const activeRoom = {
      ...pendingRoom,
      lifecycleStatus: "accepted" as const,
    };
    expect(store.anyRoomBadge([activeRoom])).toBe(false);

    store.finishRelayBootstrap();
    store.noteRelayIngested("r1:1:hi", "r1");
    expect(useNotificationStore.getState().anyRoomBadge([pendingRoom])).toBe(
      false,
    );
    expect(useNotificationStore.getState().anyRoomBadge([activeRoom])).toBe(
      true,
    );
  });
});
