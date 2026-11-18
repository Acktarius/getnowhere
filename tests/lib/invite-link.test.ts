import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/conceal/ConcealWalletAdapter", () => ({
  validateCcxAddress: (address: string) => address.trim().startsWith("ccx7"),
}));

import {
  encodeInviteLink,
  interpretInvitePaste,
  ONE_PERSON_LINK_WARNING,
  parseInviteLink,
} from "@/lib/invite-link";
import type { Contact } from "@/types/models";

const BOB = "ccx7bobaddress";
const ALICE = "ccx7aliceaddress";
const PID = "ab".repeat(32);
const TOKEN = "cd".repeat(16);

function person(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c-saved",
    alias: "Bob",
    ccxAddress: BOB,
    paymentIdFrom: "aa".repeat(32),
    paymentIdTo: PID,
    relationshipStatus: "eligible",
    inviteStatus: "none",
    chatStatus: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function issuer(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c-bob",
    alias: "Unused invite",
    ccxAddress: "",
    paymentIdFrom: PID,
    relationshipStatus: "pending",
    inviteStatus: "none",
    chatStatus: "unavailable",
    linkToken: TOKEN,
    linkRole: "issuer",
    linkState: "unused",
    linkHandle: "Bob",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function requestLink(): string {
  return encodeInviteLink({
    kind: "request",
    handle: "Bob",
    address: BOB,
    paymentIdFrom: PID,
    token: TOKEN,
  });
}

describe("invite link", () => {
  it("warns that a link goes to one person", () => {
    expect(ONE_PERSON_LINK_WARNING).toMatch(/one person only/i);
  });

  it("round-trips a request", () => {
    const parsed = parseInviteLink(requestLink());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.frame.k).toBe("request");
    expect(parsed.frame.id).toBe(TOKEN);
  });

  it("asks for a handle before creating a reply", () => {
    const outcome = interpretInvitePaste({
      raw: requestLink(),
      myAddress: ALICE,
      contacts: [],
    });
    expect(outcome.type).toBe("need-handle");
  });

  it("finalizes the first reply and refuses a different second reply", () => {
    const reply = encodeInviteLink({
      kind: "reply",
      handle: "Ada",
      address: ALICE,
      paymentIdFrom: "11".repeat(32),
      token: TOKEN,
    });
    const first = interpretInvitePaste({
      raw: reply,
      myAddress: BOB,
      contacts: [issuer()],
    });
    expect(first.type).toBe("finalize");
    if (first.type !== "finalize") return;

    const used = issuer({
      alias: first.patch.alias,
      ccxAddress: first.patch.ccxAddress,
      paymentIdTo: first.patch.paymentIdTo,
      linkState: "used",
    });
    const again = interpretInvitePaste({
      raw: reply,
      myAddress: BOB,
      contacts: [used],
    });
    expect(again.type).toBe("noop");

    const other = encodeInviteLink({
      kind: "reply",
      handle: "Eve",
      address: "ccx7eveaddress",
      paymentIdFrom: "22".repeat(32),
      token: TOKEN,
    });
    const lost = interpretInvitePaste({
      raw: other,
      myAddress: BOB,
      contacts: [used],
    });
    expect(lost).toEqual({ type: "error", code: "lost" });
  });

  it("refuses your own address and a broken link", () => {
    const own = interpretInvitePaste({
      raw: requestLink(),
      myAddress: BOB,
      contacts: [],
    });
    expect(own).toEqual({ type: "error", code: "self" });
    expect(parseInviteLink("not-json").ok).toBe(false);
    expect(parseInviteLink('{"v":2,"t":"gnh-invite"}')).toEqual({
      ok: false,
      code: "version",
    });
  });

  it("stops when the payment ID is already on another address", () => {
    const other = person({
      id: "c-other",
      alias: "Eve",
      ccxAddress: "ccx7eveaddress",
      paymentIdTo: PID,
    });
    const outcome = interpretInvitePaste({
      raw: requestLink(),
      myAddress: ALICE,
      contacts: [other],
    });
    expect(outcome).toEqual({ type: "error", code: "pid-in-use" });
  });

  it("remembers a different name when the address and payment ID match", () => {
    const outcome = interpretInvitePaste({
      raw: requestLink(),
      myAddress: ALICE,
      contacts: [person({ alias: "Robert" })],
    });
    expect(outcome).toEqual({
      type: "remember-alias",
      contactId: "c-saved",
      alias: "Robert",
      alsoKnownAs: "Bob",
    });
  });

  it("stops when that address and payment ID are already saved under the same name", () => {
    const outcome = interpretInvitePaste({
      raw: requestLink(),
      myAddress: ALICE,
      contacts: [person({ alias: "bob", alsoKnownAs: "Bobby" })],
    });
    expect(outcome).toEqual({ type: "already", alias: "bob" });
    const known = interpretInvitePaste({
      raw: requestLink(),
      myAddress: ALICE,
      contacts: [person({ alias: "Robert", alsoKnownAs: "Bob" })],
    });
    expect(known).toEqual({ type: "already", alias: "Robert" });
  });

  it("asks before a second contact at the same address with a different payment ID", () => {
    const saved = person({ paymentIdTo: "ff".repeat(32) });
    const ask = interpretInvitePaste({
      raw: requestLink(),
      myAddress: ALICE,
      contacts: [saved],
    });
    expect(ask).toEqual({
      type: "confirm-second",
      alias: "Bob",
      linkName: "Bob",
    });
    const next = interpretInvitePaste({
      raw: requestLink(),
      myAddress: ALICE,
      contacts: [saved],
      confirmSecond: true,
    });
    expect(next.type).toBe("need-handle");
  });

  it("does not treat a shared name on another address as a conflict", () => {
    const outcome = interpretInvitePaste({
      raw: requestLink(),
      myAddress: ALICE,
      contacts: [
        person({
          alias: "Bob",
          ccxAddress: "ccx7otheraddress",
          paymentIdTo: "ee".repeat(32),
        }),
      ],
    });
    expect(outcome.type).toBe("need-handle");
  });

  it("applies the same checks to a reply, ignoring the unused invite itself", () => {
    const paymentId = "11".repeat(32);
    const raw = encodeInviteLink({
      kind: "reply",
      handle: "Ada",
      address: ALICE,
      paymentIdFrom: paymentId,
      token: TOKEN,
    });
    const taken = interpretInvitePaste({
      raw,
      myAddress: BOB,
      contacts: [
        issuer(),
        person({
          alias: "Eve",
          ccxAddress: "ccx7eveaddress",
          paymentIdFrom: paymentId,
          paymentIdTo: "dd".repeat(32),
        }),
      ],
    });
    expect(taken).toEqual({ type: "error", code: "pid-in-use" });

    const alias = interpretInvitePaste({
      raw,
      myAddress: BOB,
      contacts: [
        issuer(),
        person({
          alias: "Alice",
          ccxAddress: ALICE,
          paymentIdTo: paymentId,
        }),
      ],
    });
    expect(alias).toEqual({
      type: "remember-alias",
      contactId: "c-saved",
      alias: "Alice",
      alsoKnownAs: "Ada",
    });

    const ownPid = encodeInviteLink({
      kind: "reply",
      handle: "Ada",
      address: ALICE,
      paymentIdFrom: PID,
      token: TOKEN,
    });
    const finalized = interpretInvitePaste({
      raw: ownPid,
      myAddress: BOB,
      contacts: [issuer()],
    });
    expect(finalized.type).toBe("finalize");
  });

  it("refuses a reply after the issuer cancels", () => {
    const reply = encodeInviteLink({
      kind: "reply",
      handle: "Ada",
      address: ALICE,
      paymentIdFrom: "11".repeat(32),
      token: TOKEN,
    });
    const outcome = interpretInvitePaste({
      raw: reply,
      myAddress: BOB,
      contacts: [issuer({ linkState: "cancelled" })],
    });
    expect(outcome).toEqual({ type: "error", code: "cancelled" });
  });
});
