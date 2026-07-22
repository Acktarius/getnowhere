/**
 * Relationship adapter using real SDK encode for trust/link.
 * Persistence is local (no chain broadcast yet).
 */

import { messages } from "conceal-wallet-sdk";
import type { ConcealRelationshipService } from "@/types/services";

const MODULE_TRUST = "trust";
const ACTION_LINK = "link";

export const ConcealRelationshipAdapter: ConcealRelationshipService = {
  async createRelationshipRequest(input) {
    // Compose for future broadcast; persistence is caller's contacts store.
    messages.encodeSmartMessage(MODULE_TRUST, ACTION_LINK, input.paymentIdFrom);
    return {
      contactId: input.contactId,
      paymentIdFrom: input.paymentIdFrom,
    };
  },

  async completeRelationship(input) {
    const eligible = Boolean(
      input.paymentIdTo && input.paymentIdTo.length >= 16,
    );
    return { contactId: input.contactId, eligible };
  },
};
