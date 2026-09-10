import { describe, expect, it } from "vitest";
import { shouldPollContactInvites } from "../../src/services/contacts/inviteQueue";
import type { Contact, SmartMessageInvite } from "../../src/types/models";

function makeContact(
  partial: Partial<Pick<Contact, "id" | "relationshipStatus" | "inviteStatus">>,
): Pick<Contact, "id" | "relationshipStatus" | "inviteStatus"> {
  return {
    id: "c1",
    relationshipStatus: "eligible",
    inviteStatus: "none",
    ...partial,
  };
}

function makeInvite(
  partial: Partial<SmartMessageInvite> & { contactId: string; roomId: string },
): SmartMessageInvite {
  return {
    id: "inv_1",
    contactId: partial.contactId,
    roomId: partial.roomId,
    inviteId: "invite_1",
    replayId: "replay_1",
    nonce: "nonce",
    expiry: new Date().toISOString(),
    inviteExpiry: Math.floor(Date.now() / 1000) + 3600,
    roomTtl: Math.floor(Date.now() / 1000) + 86400,
    senderAlias: "Bob",
    capabilities: [],
    status: partial.status ?? "received",
    createdAt: new Date().toISOString(),
    roomTopic: partial.roomTopic,
  };
}

describe("shouldPollContactInvites", () => {
  it("returns true when contact is undefined", () => {
    expect(shouldPollContactInvites(undefined, [])).toBe(true);
  });

  it("returns true when contact is not yet eligible", () => {
    const c = makeContact({ relationshipStatus: "pending" });
    expect(shouldPollContactInvites(c, [])).toBe(true);
  });

  it("returns true when contact.inviteStatus is received (chain not yet merged)", () => {
    const c = makeContact({ inviteStatus: "received" });
    expect(shouldPollContactInvites(c, [])).toBe(true);
  });

  it("returns true when there is a pending inbound invite in the queue", () => {
    const c = makeContact({ id: "c1" });
    const invs = [
      makeInvite({ contactId: "c1", roomId: "r1", status: "received" }),
    ];
    expect(shouldPollContactInvites(c, invs)).toBe(true);
  });

  it("returns false when eligible, inviteStatus not received, and no pending queue invite", () => {
    const c = makeContact({
      relationshipStatus: "eligible",
      inviteStatus: "accepted",
    });
    expect(shouldPollContactInvites(c, [])).toBe(false);
  });

  it("returns false when eligible with only a non-received invite (already accepted)", () => {
    const c = makeContact({ id: "c1", inviteStatus: "accepted" });
    const invs = [
      makeInvite({ contactId: "c1", roomId: "r1", status: "accepted" }),
    ];
    expect(shouldPollContactInvites(c, invs)).toBe(false);
  });

  it("ignores invites for other contacts", () => {
    const c = makeContact({ id: "c1", inviteStatus: "accepted" });
    const invs = [
      makeInvite({ contactId: "c2", roomId: "r1", status: "received" }),
    ];
    expect(shouldPollContactInvites(c, invs)).toBe(false);
  });
});
