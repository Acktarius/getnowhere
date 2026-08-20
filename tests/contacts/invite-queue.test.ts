import { describe, expect, it } from "vitest";
import {
  getContactInviteActionCount,
  getInviteQueue,
  hasPendingRoomInvite,
} from "../../src/services/contacts/inviteQueue";
import type { SmartMessageInvite } from "../../src/types/models";

function invite(
  partial: Partial<SmartMessageInvite> & {
    contactId: string;
    roomId: string;
  },
): SmartMessageInvite {
  return {
    id: partial.id ?? "inv_local",
    contactId: partial.contactId,
    roomId: partial.roomId,
    inviteId: partial.inviteId ?? "invite_1",
    replayId: partial.replayId ?? "replay_1",
    nonce: partial.nonce ?? "nonce",
    expiry: partial.expiry ?? new Date().toISOString(),
    inviteExpiry: partial.inviteExpiry ?? Math.floor(Date.now() / 1000) + 3600,
    roomTtl: partial.roomTtl ?? Math.floor(Date.now() / 1000) + 86400,
    senderAlias: partial.senderAlias ?? "Alice",
    capabilities: partial.capabilities ?? [],
    status: partial.status ?? "received",
    createdAt: partial.createdAt ?? new Date().toISOString(),
    roomTopic: partial.roomTopic,
  };
}

describe("getInviteQueue", () => {
  it("returns empty queue when no received invites", () => {
    const q = getInviteQueue("c1", [
      invite({ contactId: "c1", roomId: "r1", status: "accepted" }),
    ]);
    expect(q.inQueue).toBe(false);
    expect(q.count).toBe(0);
  });

  it("orders newest first and splits others", () => {
    const invites = [
      invite({
        contactId: "c1",
        roomId: "r_old",
        inviteId: "old",
        createdAt: "2026-01-01T00:00:00.000Z",
        roomTopic: "general",
      }),
      invite({
        contactId: "c1",
        roomId: "r_new",
        inviteId: "new",
        createdAt: "2026-01-02T00:00:00.000Z",
        roomTopic: "work",
      }),
    ];
    const q = getInviteQueue("c1", invites);
    expect(q.count).toBe(2);
    expect(q.newest?.roomId).toBe("r_new");
    expect(q.others.map((i) => i.roomId)).toEqual(["r_old"]);
  });

  it("ignores invites for other contacts", () => {
    const q = getInviteQueue("c1", [invite({ contactId: "c2", roomId: "r2" })]);
    expect(q.count).toBe(0);
  });
});

describe("hasPendingRoomInvite", () => {
  it("is true only for received invite on room", () => {
    const invites = [
      invite({ contactId: "c1", roomId: "r1", status: "received" }),
    ];
    expect(hasPendingRoomInvite("r1", invites)).toBe(true);
    expect(hasPendingRoomInvite("r2", invites)).toBe(false);
  });
});

describe("getContactInviteActionCount", () => {
  it("falls back to inviteStatus when invites not merged yet", () => {
    expect(
      getContactInviteActionCount({ id: "c1", inviteStatus: "received" }, []),
    ).toBe(1);
  });
});
