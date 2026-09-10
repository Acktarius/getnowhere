import { describe, expect, it } from "vitest";
import {
  canBroadcastRoomRevoke,
  resolveRoomRevokeIds,
} from "../../src/services/p2p/roomRevoke";
import type { Contact, SmartMessageInvite } from "../../src/types/models";

const contact: Contact = {
  id: "c1",
  alias: "Alice",
  ccxAddress: "ccx1",
  paymentIdFrom: "from",
  paymentIdTo: "to",
  relationshipStatus: "eligible",
  inviteStatus: "accepted",
  chatStatus: "ready",
  roomId: "room-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const invite: SmartMessageInvite = {
  id: "inv-1",
  inviteId: "invite-hex",
  contactId: "c1",
  roomId: "room-1",
  status: "accepted",
  expiry: "2026-12-31T00:00:00.000Z",
  inviteExpiry: 1_800_000_000,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("roomRevoke", () => {
  it("resolves ids from invite (highest priority)", () => {
    const ids = resolveRoomRevokeIds({
      roomId: "room-1",
      invites: [invite],
      contacts: [contact],
    });
    expect(ids).toEqual({ contactId: "c1", inviteId: "invite-hex" });
    expect(canBroadcastRoomRevoke(ids)).toBe(true);
  });

  it("resolves ids from room object when no invite", () => {
    const ids = resolveRoomRevokeIds({
      roomId: "room-1",
      invites: [],
      contacts: [],
      room: {
        id: "room-1",
        contactId: "c1",
        inviteId: "invite-from-room",
        bootstrapSource: "conceal-smart-message",
        roomKeyRef: "key:room-1",
        peerStatus: "offline",
        lifecycleStatus: "connected",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(ids).toEqual({ contactId: "c1", inviteId: "invite-from-room" });
    expect(canBroadcastRoomRevoke(ids)).toBe(true);
  });

  it("resolves ids from catalog when no invite or room", () => {
    const ids = resolveRoomRevokeIds({
      roomId: "room-1",
      invites: [],
      contacts: [],
      catalog: {
        id: "room-1",
        contactId: "c1",
        inviteId: "invite-from-catalog",
        bootstrapSource: "conceal-smart-message",
        roomKeyRef: "key:room-1",
        lifecycleStatus: "connected",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(ids).toEqual({ contactId: "c1", inviteId: "invite-from-catalog" });
    expect(canBroadcastRoomRevoke(ids)).toBe(true);
  });

  it("resolves contactId from contact.roomId when nothing else provides it", () => {
    const ids = resolveRoomRevokeIds({
      roomId: "room-1",
      invites: [],
      contacts: [contact], // contact.roomId === "room-1"
    });
    expect(ids.contactId).toBe("c1");
    expect(ids.inviteId).toBeUndefined();
    expect(canBroadcastRoomRevoke(ids)).toBe(false);
  });

  it("reports local-only when invite id is missing", () => {
    const ids = resolveRoomRevokeIds({
      roomId: "orphan-room",
      invites: [],
      contacts: [contact],
      catalog: {
        id: "orphan-room",
        contactId: "c1",
        bootstrapSource: "conceal-smart-message",
        roomKeyRef: "key:orphan-room",
        lifecycleStatus: "connected",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(ids.contactId).toBe("c1");
    expect(ids.inviteId).toBeUndefined();
    expect(canBroadcastRoomRevoke(ids)).toBe(false);
  });

  it("reports local-only when both ids are missing", () => {
    const ids = resolveRoomRevokeIds({
      roomId: "ghost-room",
      invites: [],
      contacts: [],
    });
    expect(ids.contactId).toBeUndefined();
    expect(ids.inviteId).toBeUndefined();
    expect(canBroadcastRoomRevoke(ids)).toBe(false);
  });
});
