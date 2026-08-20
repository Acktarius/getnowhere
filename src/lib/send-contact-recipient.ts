/**
 * Pure helpers for Send sheet contact recipient picker.
 * @see specs/changes/send-contact-recipient/design.md
 */
import type { Contact } from "@/types/models";

/** Letter mark for contact avatar: multi-word initials or ≤3 chars. */
export function contactLetterMark(alias: string): string {
  const parts = alias.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const last = parts[parts.length - 1]?.[0] ?? "";
    return (first + last).toUpperCase();
  }
  return (parts[0] ?? "").slice(0, 3).toUpperCase();
}

/** Contacts usable in Send picker: not archived/blocked, sorted A→Z by alias. */
export function eligibleSendContacts(contacts: Contact[]): Contact[] {
  return contacts
    .filter(
      (c) =>
        c.relationshipStatus !== "archived" &&
        c.relationshipStatus !== "blocked",
    )
    .slice()
    .sort((a, b) =>
      a.alias.localeCompare(b.alias, undefined, { sensitivity: "base" }),
    );
}

/** Autofill payload from a selected contact (address + PidTo). */
export function autofillFromContact(contact: Contact): {
  address: string;
  paymentId: string;
} {
  return {
    address: contact.ccxAddress,
    paymentId: contact.paymentIdTo?.trim() ?? "",
  };
}
