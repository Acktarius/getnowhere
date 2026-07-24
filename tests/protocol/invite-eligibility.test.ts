import { describe, expect, it } from "vitest";
import { isContactEligibleForInvite } from "../../src/state/contactsStore";
import type { Contact } from "../../src/types/models";

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    alias: "A",
    ccxAddress: `ccx7${"a".repeat(94)}`,
    paymentIdFrom: "a".repeat(16),
    paymentIdTo: "b".repeat(16),
    relationshipStatus: "eligible",
    inviteStatus: "none",
    chatStatus: "ready",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("isContactEligibleForInvite", () => {
  it("requires both payment ids and non-blocked/archived", () => {
    expect(isContactEligibleForInvite(contact())).toBe(true);
    expect(
      isContactEligibleForInvite(contact({ paymentIdTo: undefined })),
    ).toBe(false);
    expect(isContactEligibleForInvite(contact({ paymentIdTo: "short" }))).toBe(
      false,
    );
    expect(
      isContactEligibleForInvite(contact({ relationshipStatus: "blocked" })),
    ).toBe(false);
    expect(
      isContactEligibleForInvite(contact({ relationshipStatus: "archived" })),
    ).toBe(false);
  });
});
