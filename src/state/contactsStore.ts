import { create } from "zustand";
import {
  relationshipService,
  smartMessageService,
  walletService,
} from "@/services";
import type { Contact, SmartMessageInvite } from "@/types/models";
import { generatePaymentId, uid } from "@/utils/format";

type ContactsStore = {
  contacts: Contact[];
  invites: SmartMessageInvite[];
  loading: boolean;
  addContact: (input: {
    alias: string;
    ccxAddress: string;
    paymentIdFrom?: string;
    paymentIdTo?: string;
    notes?: string;
  }) => Promise<Contact>;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  savePaymentIdTo: (id: string, paymentIdTo: string) => Promise<void>;
  removeContact: (id: string) => void;
  archiveContact: (id: string) => void;
  blockContact: (id: string) => void;
  refreshInvites: () => Promise<void>;
  sendInvite: (contactId: string, senderAlias: string) => Promise<void>;
  acceptInvite: (inviteId: string) => Promise<{ roomId: string }>;
  getById: (id: string) => Contact | undefined;
};

function recomputeStatus(c: Contact): Contact {
  const hasFrom = Boolean(c.paymentIdFrom);
  const hasTo = Boolean(c.paymentIdTo && c.paymentIdTo.length >= 16);
  const established =
    hasFrom &&
    hasTo &&
    c.relationshipStatus !== "blocked" &&
    c.relationshipStatus !== "archived";
  const nextRel: Contact["relationshipStatus"] =
    c.relationshipStatus === "blocked"
      ? "blocked"
      : c.relationshipStatus === "archived"
        ? "archived"
        : established
          ? "established"
          : "pending";

  let chatStatus: Contact["chatStatus"] = "unavailable";
  if (nextRel === "established") chatStatus = "eligible";
  if (c.inviteStatus === "sent" || c.inviteStatus === "received")
    chatStatus = "invited";
  if (c.inviteStatus === "accepted") chatStatus = "active";

  return {
    ...c,
    relationshipStatus: nextRel,
    chatStatus,
    updatedAt: new Date().toISOString(),
  };
}

export const useContactsStore = create<ContactsStore>((set, get) => ({
  contacts: [],
  invites: [],
  loading: false,

  async addContact({ alias, ccxAddress, paymentIdFrom, paymentIdTo, notes }) {
    const from = paymentIdFrom?.trim() || walletService.generatePaymentId();
    const dup = get().contacts.find(
      (c) => c.ccxAddress === ccxAddress && c.paymentIdFrom === from,
    );
    if (dup)
      throw new Error(
        "A contact with this address and payment ID already exists.",
      );
    const base: Contact = {
      id: uid("c"),
      alias: alias.trim(),
      ccxAddress: ccxAddress.trim(),
      paymentIdFrom: from,
      paymentIdTo: paymentIdTo?.trim() || undefined,
      notes: notes?.trim() || undefined,
      relationshipStatus: "pending",
      inviteStatus: "none",
      chatStatus: "unavailable",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const contact = recomputeStatus(base);
    await relationshipService.createRelationshipRequest({
      contactId: contact.id,
      ccxAddress: contact.ccxAddress,
      paymentIdFrom: contact.paymentIdFrom,
    });
    set((s) => ({ contacts: [contact, ...s.contacts] }));
    return contact;
  },

  updateContact(id, patch) {
    set((s) => ({
      contacts: s.contacts.map((c) =>
        c.id === id ? recomputeStatus({ ...c, ...patch }) : c,
      ),
    }));
  },

  async savePaymentIdTo(id, paymentIdTo) {
    const c = get().contacts.find((x) => x.id === id);
    if (!c) return;
    await relationshipService.completeRelationship({
      contactId: id,
      paymentIdTo,
    });
    set((s) => ({
      contacts: s.contacts.map((x) =>
        x.id === id
          ? recomputeStatus({
              ...x,
              paymentIdTo: paymentIdTo.trim(),
              lastInteractionAt: new Date().toISOString(),
            })
          : x,
      ),
    }));
  },

  removeContact(id) {
    set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) }));
  },
  archiveContact(id) {
    set((s) => ({
      contacts: s.contacts.map((c) =>
        c.id === id
          ? recomputeStatus({ ...c, relationshipStatus: "archived" })
          : c,
      ),
    }));
  },
  blockContact(id) {
    set((s) => ({
      contacts: s.contacts.map((c) =>
        c.id === id
          ? recomputeStatus({ ...c, relationshipStatus: "blocked" })
          : c,
      ),
    }));
  },

  async refreshInvites() {
    const list = await smartMessageService.fetchIncomingMessages();
    set({ invites: list });
  },

  async sendInvite(contactId, senderAlias) {
    const composed = await smartMessageService.composeInviteMessage({
      contactId,
      senderAlias,
    });
    const encrypted = await smartMessageService.encryptInvitePayload(composed);
    await smartMessageService.sendInviteMessage(contactId, encrypted);
    set((s) => ({
      contacts: s.contacts.map((c) =>
        c.id === contactId
          ? recomputeStatus({
              ...c,
              inviteStatus: "sent",
              lastInteractionAt: new Date().toISOString(),
            })
          : c,
      ),
    }));
  },

  async acceptInvite(inviteId) {
    const res = await smartMessageService.acceptInvite(inviteId);
    const inv = get().invites.find((i) => i.id === inviteId);
    if (inv) {
      set((s) => ({
        contacts: s.contacts.map((c) =>
          c.id === inv.contactId
            ? recomputeStatus({
                ...c,
                inviteStatus: "accepted",
                lastInteractionAt: new Date().toISOString(),
              })
            : c,
        ),
      }));
    }
    return res;
  },

  getById(id) {
    return get().contacts.find((c) => c.id === id);
  },
}));

export { generatePaymentId };
