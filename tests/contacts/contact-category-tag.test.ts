import { describe, expect, it } from "vitest";
import {
  addressEntryToContact,
  contactsExportPayload,
  contactToAddressEntry,
} from "@/services/contacts/contactsPersistence";
import type { Contact } from "@/types/models";

const baseContact: Contact = {
  id: "c_test",
  alias: "Alex",
  ccxAddress: "ccx1abc",
  paymentIdFrom: "from-id",
  paymentIdTo: "to-id-long-enough-here",
  relationshipStatus: "eligible",
  inviteStatus: "none",
  chatStatus: "ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("contact categoryTags persistence", () => {
  it("round-trips multiple tags through wallet addressBook entry", () => {
    const tagged = {
      ...baseContact,
      categoryTags: ["love", "one_night_stand"] as const,
    };
    const entry = contactToAddressEntry(tagged);
    expect(entry.categoryTags).toEqual(["love", "one_night_stand"]);
    const restored = addressEntryToContact(entry);
    expect(restored.categoryTags).toEqual(["love", "one_night_stand"]);
  });

  it("migrates legacy single categoryTag on import", () => {
    const entry = contactToAddressEntry(baseContact);
    const restored = addressEntryToContact({
      ...entry,
      categoryTag: "work",
    });
    expect(restored.categoryTags).toEqual(["colleague"]);
  });

  it("migrates legacy work tag in categoryTags array", () => {
    const entry = contactToAddressEntry(baseContact);
    const restored = addressEntryToContact({
      ...entry,
      categoryTags: ["work", "friend"] as never,
    });
    expect(restored.categoryTags).toEqual(["colleague", "friend"]);
  });

  it("drops invalid tags on import", () => {
    const entry = contactToAddressEntry(baseContact);
    const restored = addressEntryToContact({
      ...entry,
      categoryTags: ["friend", "vacation", "family"] as never,
    });
    expect(restored.categoryTags).toEqual(["friend", "family"]);
  });

  it("includes categoryTags in metadata export payload", () => {
    const payload = contactsExportPayload([
      { ...baseContact, categoryTags: ["colleague", "friend"] },
    ]) as Array<{ categoryTags: string[] }>;
    expect(payload[0]?.categoryTags).toEqual(["colleague", "friend"]);
  });
});
