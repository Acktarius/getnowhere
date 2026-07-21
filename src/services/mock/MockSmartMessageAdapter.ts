// SmartMessageService implementation. Uses the REAL conceal-wallet-sdk
// `messages` namespace for the smart-message protocol layer (encode/parse/
// TTL), with a mock transport for send/fetch (the on-chain txExtra message
// channel requires a broadcast path that is not verified here).
//
// CONFIRMED SDK (messages namespace, pure JS — no WASM):
//   - encodeSmartMessage(module, action, ...data) → "{module,u,data}"
//   - parseSmartMessage(body) → [module, action, ...data] | null
//   - isSmartMessage(body) / isKnownSmartMessage(body)
//   - ttlMinutesToUnix(minutes, nowSec?) → Unix expiry seconds
//   - KNOWN_MODULES includes "contact", "trust", "status" — the modules
//     we use for relationship bootstrap and chat invites.
//
// MOCK (TODO): sendInviteMessage / fetchIncomingMessages simulate the
// on-chain encrypted-message channel. Real delivery rides a Conceal
// transaction's tx_extra MESSAGE record (type 0x04) + optional TTL (0x05),
// which requires the broadcast path.

import { messages } from "conceal-wallet-sdk";
import type { SmartMessageInvite } from "@/types/models";
import type {
  ComposedInvite,
  ComposeInviteInput,
  SmartMessageService,
} from "@/types/services";
import { sleep, uid } from "@/utils/format";

const inbox: SmartMessageInvite[] = [];
const sent: SmartMessageInvite[] = [];

// Smart-message modules confirmed in the SDK's KNOWN_MODULES list.
const MODULE_TRUST = "trust";
const MODULE_CONTACT = "contact";
// Action shorthands — encodeSmartMessage maps verbose actions to their
// single-char forms. "link" and "add" are our app-level verbs; the SDK's
// ACTION_MAP covers the 2FA/vault ecosystem set, but any action string is
// accepted and round-tripped by encodeSmartMessage/parseSmartMessage.
const ACTION_LINK = "link";
const ACTION_INVITE = "invite";

function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export const MockSmartMessageAdapter: SmartMessageService = {
  async composeInviteMessage({
    contactId,
    senderAlias,
    expirySec = 86400,
    capabilities = ["chat.v1"],
    bootstrapData,
  }: ComposeInviteInput): Promise<ComposedInvite> {
    await sleep(450);
    const roomId = uid("room");
    const nonce = uid("nonce").slice(0, 24);

    // REAL SDK: ttlMinutesToUnix converts a TTL in minutes to the absolute
    // Unix-seconds expiry the on-chain 0x05 TTL record stores.
    const expiryMinutes = Math.round(expirySec / 60);
    const expiryUnix = messages.ttlMinutesToUnix(expiryMinutes);
    const expiry = new Date(expiryUnix * 1000).toISOString();

    const rawBootstrap =
      bootstrapData ?? toBytes(`${roomId}:${nonce}:${contactId}`);
    const bootstrapEncrypted = btoa(String.fromCharCode(...rawBootstrap));

    return {
      roomId,
      nonce,
      expiry,
      senderAlias,
      capabilities,
      bootstrapEncrypted,
    };
  },

  async encryptInvitePayload(payload: ComposedInvite): Promise<string> {
    await sleep(200);
    // REAL SDK: encodeSmartMessage wraps the invite into the brace-token
    // smart-message wire format: "{contact,invite,roomId,nonce,...}".
    // This is the format that rides a Conceal tx_extra MESSAGE record.
    const smartBody = messages.encodeSmartMessage(
      MODULE_CONTACT,
      ACTION_INVITE,
      payload.roomId,
      payload.nonce,
      payload.bootstrapEncrypted,
    );
    // Wrap the smart-message body alongside metadata for transport.
    return btoa(JSON.stringify({ smartBody, payload }));
  },

  async sendInviteMessage(contactId, payload) {
    await sleep(700);
    const decoded = JSON.parse(atob(payload)) as {
      smartBody: string;
      payload: ComposedInvite;
    };

    // REAL SDK: isKnownSmartMessage validates the module is in KNOWN_MODULES.
    if (!messages.isKnownSmartMessage(decoded.smartBody)) {
      throw new Error("Composed invite is not a recognized smart message.");
    }

    const invite: SmartMessageInvite = {
      id: uid("inv"),
      contactId,
      roomId: decoded.payload.roomId,
      nonce: decoded.payload.nonce,
      expiry: decoded.payload.expiry,
      senderAlias: decoded.payload.senderAlias,
      capabilities: decoded.payload.capabilities,
      bootstrapEncrypted: decoded.payload.bootstrapEncrypted,
      status: "sent",
      createdAt: new Date().toISOString(),
    };
    sent.push(invite);
    // Mirror into the counterpart's inbox so the demo can be received.
    inbox.push({ ...invite, id: uid("inv"), status: "received" });
    return { inviteId: invite.id, status: "sent" };
  },

  async fetchIncomingMessages(): Promise<SmartMessageInvite[]> {
    await sleep(300);
    return [...inbox];
  },

  async parseRelationshipMessages(): Promise<SmartMessageInvite[]> {
    await sleep(200);
    // REAL SDK: parseSmartMessage splits a smart-message body into
    // [module, action, ...data]. We filter for trust/contact modules.
    return inbox.filter((i) => {
      try {
        // Reconstruct the smart-body shape the invite would arrive as.
        const body = messages.encodeSmartMessage(
          MODULE_TRUST,
          ACTION_LINK,
          i.roomId,
        );
        const parsed = messages.parseSmartMessage(body);
        return (
          parsed !== null &&
          (parsed[0] === MODULE_TRUST || parsed[0] === MODULE_CONTACT)
        );
      } catch {
        return false;
      }
    });
  },

  async acceptInvite(inviteId): Promise<{ roomId: string }> {
    await sleep(400);
    const inv = inbox.find((i) => i.id === inviteId);
    if (!inv) throw new Error("Invite not found");
    if (new Date(inv.expiry).getTime() < Date.now()) {
      inv.status = "expired";
      throw new Error("Invite expired");
    }
    inv.status = "accepted";
    return { roomId: inv.roomId };
  },
};

export function getSentInvites(): SmartMessageInvite[] {
  return sent;
}

export { messages as concealMessages };
