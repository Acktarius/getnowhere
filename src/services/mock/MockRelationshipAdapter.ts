// ConcealRelationshipService implementation. Uses the REAL conceal-wallet-sdk
// `messages` namespace to compose the on-chain smart-message payload that
// carries the relationship-link request, with mock persistence.
//
// CONFIRMED SDK: messages.encodeSmartMessage("trust", "link", paymentIdFrom)
// produces the "{trust,l,paymentIdFrom}" smart-message body that rides a
// Conceal tx_extra MESSAGE record. messages.ttlMinutesToUnix sets the TTL.
//
// MOCK (TODO): the actual on-chain delivery (building + broadcasting the
// message transaction via buildMessageTransaction + daemon.sendrawtransaction)
// is not verified here — we compose the payload but store it locally.

import { messages } from "conceal-wallet-sdk";
import type {
  ConcealRelationshipService,
  CreateRelationshipRequestInput,
} from "@/types/services";
import { sleep } from "@/utils/format";

export const MockRelationshipAdapter: ConcealRelationshipService = {
  async createRelationshipRequest({
    contactId,
    paymentIdFrom,
  }: CreateRelationshipRequestInput) {
    await sleep(500);
    // REAL SDK: compose the trust-link smart-message body. This is the
    // payload that would ride a Conceal message transaction's tx_extra.
    // The counterpart scans it and extracts paymentIdFrom to map us.
    const smartBody = messages.encodeSmartMessage(
      "trust",
      "link",
      paymentIdFrom,
    );
    // In a real integration, buildMessageTransaction would wrap this body
    // into a broadcast-ready tx with a TTL. We hold the composed payload
    // here; delivery is simulated.
    void smartBody; // TODO(conceal): wire to buildMessageTransaction + daemon.
    return { contactId, paymentIdFrom };
  },

  async completeRelationship({ contactId, paymentIdTo }) {
    await sleep(500);
    // Conceal integrated-address payment IDs are 8 bytes (16 hex chars).
    // Our relationship paymentIdTo can be either a 16-hex integrated ID
    // or a 64-hex standalone mapping identifier.
    const established = Boolean(paymentIdTo && paymentIdTo.length >= 16);
    return { contactId, established };
  },
};

export { messages as concealMessages };
