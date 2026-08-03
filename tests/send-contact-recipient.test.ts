import { describe, expect, it } from "vitest";
import {
  autofillFromContact,
  contactLetterMark,
  eligibleSendContacts,
} from "@/lib/send-contact-recipient";
import type { Contact } from "@/types/models";

function contact(
  partial: Partial<Contact> & Pick<Contact, "id" | "alias">,
): Contact {
  return {
    ccxAddress: "ccx7addr",
    paymentIdFrom: "",
    relationshipStatus: "eligible",
    inviteStatus: "none",
    chatStatus: "unavailable",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("contactLetterMark", () => {
  it('returns "?" for empty alias', () => {
    expect(contactLetterMark("")).toBe("?");
    expect(contactLetterMark("   ")).toBe("?");
  });

  it("uses first+last initials for multi-word aliases", () => {
    expect(contactLetterMark("Alice Wonder")).toBe("AW");
    expect(contactLetterMark("  mary jane watson  ")).toBe("MW");
  });

  it("uses up to 3 chars for a single word", () => {
    expect(contactLetterMark("bob")).toBe("BOB");
    expect(contactLetterMark("Carol")).toBe("CAR");
    expect(contactLetterMark("ab")).toBe("AB");
    expect(contactLetterMark("x")).toBe("X");
  });
});

describe("eligibleSendContacts", () => {
  it("excludes archived and blocked, sorts alias case-insensitively", () => {
    const contacts = [
      contact({ id: "1", alias: "carol", relationshipStatus: "eligible" }),
      contact({ id: "2", alias: "Alice", relationshipStatus: "archived" }),
      contact({ id: "3", alias: "bob", relationshipStatus: "blocked" }),
      contact({ id: "4", alias: "zeta", relationshipStatus: "pending" }),
      contact({ id: "5", alias: "Beta", relationshipStatus: "eligible" }),
    ];

    expect(eligibleSendContacts(contacts).map((c) => c.alias)).toEqual([
      "Beta",
      "carol",
      "zeta",
    ]);
  });

  it("returns empty when every contact is archived or blocked", () => {
    const contacts = [
      contact({ id: "1", alias: "a", relationshipStatus: "archived" }),
      contact({ id: "2", alias: "b", relationshipStatus: "blocked" }),
    ];
    expect(eligibleSendContacts(contacts)).toEqual([]);
  });
});

describe("autofillFromContact", () => {
  it("fills address and trimmed paymentIdTo when present", () => {
    const c = contact({
      id: "1",
      alias: "Alice",
      ccxAddress: "ccx7recipient",
      paymentIdTo: "  abcdef0123456789  ",
    });
    expect(autofillFromContact(c)).toEqual({
      address: "ccx7recipient",
      paymentId: "abcdef0123456789",
    });
  });

  it("fills address and empty paymentId when PidTo absent", () => {
    const c = contact({
      id: "1",
      alias: "Alice",
      ccxAddress: "ccx7recipient",
    });
    expect(autofillFromContact(c)).toEqual({
      address: "ccx7recipient",
      paymentId: "",
    });
  });
});
