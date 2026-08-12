/**
 * Conceal smart-message channel for chat create/register/revoke.
 * Encodes with SDK messages.*; delivers via buildMessageTransaction + wallet sync scan
 * (same path as conceal-next-wallet pulse / sendMessage).
 */

import { messages } from "conceal-wallet-sdk";
import {
  readReceivedRecords,
  readSentRecords,
} from "@/services/conceal/sync/messages-store";
import {
  pollMempoolRuntime,
  requireRuntime,
  syncRuntime,
} from "@/services/conceal/sync/runtime";
import { sendSmartMessage } from "@/services/conceal/sync/spend";
import { getRelationshipTopicEpoch } from "@/services/p2p/relationshipTopicEpochStore";
import {
  deriveInviteSalt,
  deriveRelationshipId,
  randomHex,
} from "@/services/protocol/ids";
import { tombstoneInvite } from "@/services/protocol/inviteTombstone";
import { nowUnix } from "@/services/protocol/roomLifecycle";
import {
  encodeCreateSmartBody,
  encodeRegisterSmartBody,
  encodeRelaySmartBody,
  encodeRevokeSmartBody,
  hydrateCreateHandshake,
  parseChatSmartBody,
  rememberReplayId,
  SmartMessageProtocolAdapter,
} from "@/services/protocol/SmartMessageProtocolAdapter";
import type { SmartMessageInvite } from "@/types/models";
import type { ChatInviteHandshake, ChatRelayPayload } from "@/types/protocol";
import { CHAT_PROTOCOL_VERSION } from "@/types/protocol";
import type {
  ComposedInvite,
  ComposeInviteInput,
  SmartMessageService,
} from "@/types/services";
import { uid } from "@/utils/format";

export type SmartMessageContactDelivery = {
  contactId: string;
  address: string;
  paymentIdFrom: string;
  paymentIdTo?: string;
  alias: string;
};

type ContactBinder = {
  resolve: (contactId: string) => SmartMessageContactDelivery | undefined;
  list: () => SmartMessageContactDelivery[];
};

let contactBinder: ContactBinder | null = null;

/** Wire contacts store → delivery lookups (avoids services↔state import cycles). */
export function bindSmartMessageContacts(binder: ContactBinder): void {
  contactBinder = binder;
}

/** Full handshake from create, keyed by inviteId. */
const handshakesByInviteId = new Map<string, ChatInviteHandshake>();
const invitesById = new Map<string, SmartMessageInvite>();

export function getHandshakeForInvite(
  inviteId: string,
): ChatInviteHandshake | undefined {
  return (
    handshakesByInviteId.get(inviteId) ??
    [...handshakesByInviteId.values()].find((h) => h.inviteId === inviteId)
  );
}

/** Restore create handshake after reload (Alice initiator stash). */
export function rememberHandshake(handshake: ChatInviteHandshake): void {
  handshakesByInviteId.set(handshake.inviteId, handshake);
}

function requireDelivery(
  contactId: string,
  delivery?: { recipientAddress: string; paymentId: string },
): SmartMessageContactDelivery {
  if (delivery?.recipientAddress && delivery.paymentId) {
    if (delivery.paymentId.length < 16) {
      throw new Error("paymentIdTo required to send on-chain smart message.");
    }
    const fromBinder = contactBinder?.resolve(contactId);
    return {
      contactId,
      address: delivery.recipientAddress.trim(),
      paymentIdFrom: fromBinder?.paymentIdFrom ?? "",
      paymentIdTo: delivery.paymentId.trim(),
      alias: fromBinder?.alias ?? "",
    };
  }
  const contact = contactBinder?.resolve(contactId);
  if (!contact?.address) {
    throw new Error(
      "Contact address required to send on-chain smart message. Re-open the app if this persists.",
    );
  }
  if (!contact.paymentIdTo || contact.paymentIdTo.length < 16) {
    throw new Error("paymentIdTo required to send on-chain smart message.");
  }
  return contact;
}

function toInviteFromCreate(
  contactId: string,
  composed: ComposedInvite,
  status: SmartMessageInvite["status"],
  txHash?: string,
): SmartMessageInvite {
  return {
    id: uid("inv"),
    contactId,
    roomId: composed.roomId,
    inviteId: composed.inviteId,
    replayId: composed.replayId,
    nonce: composed.nonce,
    expiry: composed.expiry,
    inviteExpiry: composed.inviteExpiry,
    roomTtl: composed.roomTtl,
    senderAlias: composed.senderAlias,
    capabilities: composed.capabilities,
    bootstrapEncrypted: composed.bootstrapEncrypted,
    status,
    createdAt: new Date().toISOString(),
    ...(txHash ? { txHash } : {}),
  };
}

function matchContactByPaymentId(
  paymentIdFrom: string | null | undefined,
): SmartMessageContactDelivery | undefined {
  if (!paymentIdFrom || !contactBinder) return undefined;
  const needle = paymentIdFrom.trim().toLowerCase();
  return contactBinder
    .list()
    .find((c) => c.paymentIdFrom.trim().toLowerCase() === needle);
}

function matchContactForSentRecord(
  record: import("@/services/conceal/sync/messages-store").SdkMessageRecord,
): SmartMessageContactDelivery | undefined {
  if (!contactBinder) return undefined;
  const pidTo = record.paymentIdTo?.trim().toLowerCase();
  if (pidTo) {
    const byPid = contactBinder
      .list()
      .find((c) => c.paymentIdTo?.trim().toLowerCase() === pidTo);
    if (byPid) return byPid;
  }
  const addr = (record.sentTo ?? record.counterpartyAddress)
    ?.trim()
    .toLowerCase();
  if (!addr) return undefined;
  return contactBinder
    .list()
    .find((c) => c.address.trim().toLowerCase() === addr);
}

async function inviteFromCreateBody(
  body: string,
  meta: {
    contactId: string;
    status: SmartMessageInvite["status"];
    txHash: string;
    createdAt: string;
    senderAlias?: string;
    paymentIdFrom?: string;
    paymentIdTo?: string;
  },
): Promise<SmartMessageInvite | null> {
  const parsed = parseChatSmartBody(body, { allowSeenReplay: true });
  if (parsed?.action !== "create") return null;
  let hs = parsed.payload.handshake;
  if (!hs.relationshipId || !hs.salt) {
    const from = meta.paymentIdFrom?.trim();
    const to = meta.paymentIdTo?.trim();
    if (!from || !to) return null;
    const relationshipId = await deriveRelationshipId(from, to);
    hs = await hydrateCreateHandshake(hs, relationshipId);
  }
  handshakesByInviteId.set(hs.inviteId, hs);
  rememberReplayId(hs.replayId);
  const invite: SmartMessageInvite = {
    id: `tx:${meta.txHash}`,
    contactId: meta.contactId,
    roomId: hs.roomId,
    inviteId: hs.inviteId,
    replayId: hs.replayId,
    nonce: hs.nonceSeed.slice(0, 24),
    expiry: new Date(hs.inviteExpiry * 1000).toISOString(),
    inviteExpiry: hs.inviteExpiry,
    roomTtl: hs.roomTtl,
    senderAlias: meta.senderAlias ?? parsed.payload.senderAlias,
    capabilities: parsed.payload.capabilities,
    roomTopic: hs.roomTopic,
    bootstrapEncrypted: btoa(`${hs.roomId}:${hs.replayId}:${meta.contactId}`),
    status: meta.status,
    createdAt: meta.createdAt,
    txHash: meta.txHash,
  };
  invitesById.set(invite.id, invite);
  return invite;
}

/**
 * Broadcast a contact create/register/revoke body as a mined smart message.
 *
 * On-chain: ttlUnixSeconds=0, amount=100, network fee=1000, node fee=10000.
 * App-layer inviteExpiry / roomTtl stay in the body only — if the peer does
 * not register before inviteExpiry, the invite is expired and must be redone.
 */
async function broadcastSmartBody(input: {
  contactId: string;
  smartBody: string;
  delivery?: { recipientAddress: string; paymentId: string };
}): Promise<{ hash: string }> {
  const delivery = requireDelivery(input.contactId, input.delivery);
  return sendSmartMessage({
    recipientAddress: delivery.address,
    body: input.smartBody,
    paymentId: delivery.paymentIdTo,
    ttlUnixSeconds: 0,
  });
}

/** Decode local envelope (btoa JSON) or accept a raw smart-message body. */
function decodeOutboundPayload(payload: string): {
  smartBody: string;
  composed?: ComposedInvite;
} {
  try {
    const decoded = JSON.parse(atob(payload)) as {
      smartBody?: string;
      payload?: ComposedInvite;
    };
    if (typeof decoded.smartBody === "string") {
      return { smartBody: decoded.smartBody, composed: decoded.payload };
    }
  } catch {
    /* raw smart body */
  }
  if (payload.startsWith("{") && messages.isSmartMessage(payload)) {
    return { smartBody: payload };
  }
  throw new Error("Invalid invite payload.");
}

export const ConcealSmartMessageAdapter: SmartMessageService = {
  async composeInviteMessage(
    input: ComposeInviteInput,
  ): Promise<ComposedInvite> {
    const inviteExpirySec = input.inviteExpirySec ?? 86400;
    const roomTtlSec = input.roomTtlSec ?? 86400 * 7;
    const now = nowUnix();
    const inviteExpiry = messages.ttlMinutesToUnix(
      Math.max(1, Math.round(inviteExpirySec / 60)),
    );
    const roomTtl = now + roomTtlSec;

    // Slim pack widths (see CREATE_PACK_FIELDS): ids 4B, seeds 8B, eph 32B.
    const roomId = input.handshakeOverrides?.roomId ?? randomHex(4);
    const inviteId = input.handshakeOverrides?.inviteId ?? randomHex(4);
    const replayId = input.handshakeOverrides?.replayId ?? randomHex(8);
    const nonceSeed = input.handshakeOverrides?.nonceSeed ?? randomHex(8);
    const nonce = nonceSeed.slice(0, 24);
    const salt =
      input.handshakeOverrides?.salt ??
      (await deriveInviteSalt(input.relationshipId, roomId, inviteId));
    const senderEphemeralPublicKey =
      input.handshakeOverrides?.senderEphemeralPublicKey ?? randomHex(32);

    const topicEpoch =
      input.handshakeOverrides?.topicEpoch ??
      getRelationshipTopicEpoch(input.relationshipId);

    const handshake = {
      protocolVersion: CHAT_PROTOCOL_VERSION,
      inviteId,
      relationshipId: input.relationshipId,
      roomId,
      topicEpoch,
      cipherSuite: "CHACHA20_POLY1305_V1" as const,
      senderEphemeralPublicKey,
      kdf: "HKDF_SHA256_V1" as const,
      nonceSeed,
      nonceStrategy: "counter_from_seed" as const,
      salt,
      inviteExpiry,
      roomTtl,
      replayId,
      roomTopic: input.roomTopic ?? input.handshakeOverrides?.roomTopic,
      ...input.handshakeOverrides,
    };

    const capabilities = input.capabilities ?? ["chat.v1"];
    const envelope = await SmartMessageProtocolAdapter.composeCreate({
      contactId: input.contactId,
      handshake,
      senderAlias: input.senderAlias,
      capabilities,
      relationshipEligible: true,
    });

    const bootstrapEncrypted = btoa(`${roomId}:${replayId}:${input.contactId}`);

    return {
      roomId,
      inviteId,
      replayId,
      nonce,
      expiry: new Date(inviteExpiry * 1000).toISOString(),
      inviteExpiry,
      roomTtl,
      senderAlias: input.senderAlias,
      capabilities,
      roomTopic: handshake.roomTopic,
      bootstrapEncrypted,
      handshake,
      smartBody: envelope.smartBody,
    };
  },

  async encryptInvitePayload(payload: ComposedInvite): Promise<string> {
    const smartBody =
      payload.smartBody ||
      encodeCreateSmartBody(
        payload.handshake,
        payload.senderAlias,
        payload.capabilities,
      );
    return btoa(JSON.stringify({ smartBody, payload }));
  },

  async sendInviteMessage(contactId, payload, delivery) {
    const { smartBody, composed } = decodeOutboundPayload(payload);
    if (!messages.isKnownSmartMessage(smartBody)) {
      throw new Error("Composed create is not a recognized smart message.");
    }
    const parsed = parseChatSmartBody(smartBody);
    if (parsed?.action !== "create") {
      throw new Error("Invalid chat.create smart message.");
    }
    rememberReplayId(parsed.payload.handshake.replayId);
    handshakesByInviteId.set(
      parsed.payload.handshake.inviteId,
      parsed.payload.handshake,
    );

    const inviteExpiry =
      composed?.inviteExpiry ?? parsed.payload.handshake.inviteExpiry;
    const { hash } = await broadcastSmartBody({
      contactId,
      smartBody,
      delivery,
    });

    const composedInvite: ComposedInvite = composed ?? {
      roomId: parsed.payload.handshake.roomId,
      inviteId: parsed.payload.handshake.inviteId,
      replayId: parsed.payload.handshake.replayId,
      nonce: parsed.payload.handshake.nonceSeed.slice(0, 24),
      expiry: new Date(inviteExpiry * 1000).toISOString(),
      inviteExpiry,
      roomTtl: parsed.payload.handshake.roomTtl,
      senderAlias: parsed.payload.senderAlias,
      capabilities: parsed.payload.capabilities,
      bootstrapEncrypted: "",
      handshake: parsed.payload.handshake,
      smartBody,
    };

    const sent = toInviteFromCreate(contactId, composedInvite, "sent", hash);
    invitesById.set(sent.id, sent);

    return { inviteId: sent.id, status: "sent", txHash: hash };
  },

  async fetchIncomingMessages() {
    try {
      const rt = requireRuntime();
      // Mempool first — do not wait on tip catch-up for 0-conf creates.
      await pollMempoolRuntime(rt);
      // Short tip sync so a create that already mined still appears.
      await Promise.race([
        syncRuntime(rt),
        new Promise<void>((resolve) => {
          setTimeout(resolve, 8_000);
        }),
      ]);
      const received = readReceivedRecords(rt.raw);
      const out: SmartMessageInvite[] = [];
      for (const record of received) {
        if (!messages.isSmartMessage(record.body)) continue;
        // Known paymentIdFrom only — strangers never become invites from mempool/mined.
        const contact = matchContactByPaymentId(record.paymentIdFrom);
        if (!contact) continue;
        const invite = await inviteFromCreateBody(record.body, {
          contactId: contact.contactId,
          status: "received",
          txHash: record.id,
          createdAt: record.timestamp,
          senderAlias: contact.alias,
          paymentIdFrom: contact.paymentIdFrom,
          paymentIdTo: contact.paymentIdTo,
        });
        if (invite) {
          out.push({
            ...invite,
            zeroConf: record.blockHeight === 0,
          });
        }
      }
      for (const record of readSentRecords(rt.raw)) {
        if (!messages.isSmartMessage(record.body)) continue;
        const contact = matchContactForSentRecord(record);
        if (!contact) continue;
        const invite = await inviteFromCreateBody(record.body, {
          contactId: contact.contactId,
          status: "sent",
          txHash: record.id,
          createdAt: record.timestamp,
          senderAlias: contact.alias,
          paymentIdFrom: contact.paymentIdFrom,
          paymentIdTo: contact.paymentIdTo,
        });
        if (invite && !out.some((i) => i.inviteId === invite.inviteId)) {
          out.push(invite);
        }
      }
      // Keep any local sent copies that aren't on the received list.
      for (const inv of invitesById.values()) {
        if (inv.status === "sent" && !out.some((i) => i.id === inv.id)) {
          out.push(inv);
        }
      }
      return out;
    } catch {
      return [...invitesById.values()].filter((i) => i.status === "received");
    }
  },

  async fetchIncomingRegisters() {
    try {
      const rt = requireRuntime();
      await pollMempoolRuntime(rt);
      void syncRuntime(rt).catch(() => {});
      const received = readReceivedRecords(rt.raw);
      const out: Array<{
        register: import("@/types/protocol").ChatRegisterPayload;
        txHash: string;
      }> = [];
      for (const record of received) {
        if (!messages.isSmartMessage(record.body)) continue;
        const parsed = parseChatSmartBody(record.body, {
          allowSeenReplay: true,
        });
        if (parsed?.action !== "register") continue;
        out.push({ register: parsed.payload, txHash: record.id });
      }
      return out;
    } catch {
      return [];
    }
  },

  async parseRelationshipMessages() {
    return this.fetchIncomingMessages();
  },

  async acceptInvite(inviteId, register) {
    let inv =
      invitesById.get(inviteId) ??
      [...invitesById.values()].find(
        (i) => i.id === inviteId || i.inviteId === inviteId,
      );
    if (!inv) {
      await ConcealSmartMessageAdapter.fetchIncomingMessages();
      inv =
        invitesById.get(inviteId) ??
        [...invitesById.values()].find(
          (i) => i.id === inviteId || i.inviteId === inviteId,
        );
    }
    if (!inv) throw new Error("Invite not found.");
    if (inv.status !== "received" && inv.status !== "sent") {
      throw new Error("Invite cannot be accepted in current state.");
    }
    const payload = register
      ? await SmartMessageProtocolAdapter.composeRegister(register)
      : await SmartMessageProtocolAdapter.composeRegister({
          inviteId: inv.inviteId,
          receiverEphemeralPublicKey: randomHex(32),
          replayId: inv.replayId,
        });
    await broadcastSmartBody({
      contactId: inv.contactId,
      smartBody: encodeRegisterSmartBody(payload),
    });
    inv.status = "accepted";
    return { roomId: inv.roomId };
  },

  async declineInvite(inviteId) {
    const inv =
      invitesById.get(inviteId) ??
      [...invitesById.values()].find(
        (i) => i.id === inviteId || i.inviteId === inviteId,
      );
    if (!inv) throw new Error("Invite not found.");
    const revoke = await SmartMessageProtocolAdapter.composeRevoke({
      inviteId: inv.inviteId,
      replayId: inv.replayId,
      reasonCode: "user_declined",
    });
    await broadcastSmartBody({
      contactId: inv.contactId,
      smartBody: encodeRevokeSmartBody(revoke),
    });
    const { invite: wiped } = tombstoneInvite(inv, "rejected");
    Object.assign(inv, wiped);
  },

  async revokeRoom(input) {
    const revoke = await SmartMessageProtocolAdapter.composeRevoke({
      inviteId: input.inviteId,
      roomId: input.roomId,
      replayId: input.replayId,
      reasonCode: "room_revoked",
      topicEpoch: input.topicEpoch,
    });
    const { hash } = await broadcastSmartBody({
      contactId: input.contactId,
      smartBody: encodeRevokeSmartBody(revoke),
    });
    return { txHash: hash };
  },

  async fetchIncomingRevokes() {
    try {
      const rt = requireRuntime();
      await pollMempoolRuntime(rt);
      void syncRuntime(rt).catch(() => {});
      const received = readReceivedRecords(rt.raw);
      const out: Array<{
        revoke: import("@/types/protocol").ChatRevokePayload;
        txHash: string;
      }> = [];
      for (const record of received) {
        if (!messages.isSmartMessage(record.body)) continue;
        const parsed = parseChatSmartBody(record.body, {
          allowSeenReplay: true,
        });
        if (parsed?.action !== "revoke") continue;
        out.push({ revoke: parsed.payload, txHash: record.id });
      }
      return out;
    } catch {
      return [];
    }
  },

  async sendChatRelay(input: { contactId: string; relay: ChatRelayPayload }) {
    const smartBody = encodeRelaySmartBody(input.relay);
    if (!messages.isKnownSmartMessage(smartBody)) {
      throw new Error("Composed relay is not a recognized smart message.");
    }
    const { hash } = await broadcastSmartBody({
      contactId: input.contactId,
      smartBody,
    });
    return { txHash: hash };
  },

  async fetchIncomingRelays() {
    try {
      const rt = requireRuntime();
      await pollMempoolRuntime(rt);
      void syncRuntime(rt).catch(() => {});
      const received = readReceivedRecords(rt.raw);
      const out: Array<{
        relay: ChatRelayPayload;
        txHash: string;
        paymentIdFrom?: string;
        zeroConf?: boolean;
      }> = [];
      for (const record of received) {
        if (!messages.isSmartMessage(record.body)) continue;
        // Known paymentIdFrom only — same gate as create (no stranger spam).
        const contact = matchContactByPaymentId(record.paymentIdFrom);
        if (!contact) continue;
        const parsed = parseChatSmartBody(record.body, {
          allowSeenReplay: true,
        });
        if (parsed?.action !== "relay") continue;
        out.push({
          relay: parsed.payload,
          txHash: record.id,
          paymentIdFrom: record.paymentIdFrom ?? undefined,
          zeroConf: record.blockHeight === 0,
        });
      }
      return out;
    } catch {
      return [];
    }
  },
};

/** Test helpers */
export function __resetSmartMessageDelivery(): void {
  invitesById.clear();
  handshakesByInviteId.clear();
  contactBinder = null;
}
