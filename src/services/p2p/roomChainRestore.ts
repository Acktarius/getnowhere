/**
 * Rebuild accepted chat rooms from on-chain smart messages during wallet rescan.
 * @see docs/security/p2pchatprotocol.md
 */
import { messages } from "conceal-wallet-sdk";
import {
  readReceivedRecords,
  readSentRecords,
  type SdkMessageRecord,
} from "@/services/conceal/sync/messages-store";
import { getRuntime } from "@/services/conceal/sync/runtime";
import { isWalletNearTip } from "@/services/conceal/walletSyncTip";
import { readChatRooms } from "@/services/p2p/chatRoomsBlob";
import { isRoomRevoked } from "@/services/p2p/revokedRoomsStore";
import {
  listCatalogRooms,
  removeCatalogRoom,
  upsertCatalogRoom,
} from "@/services/p2p/roomCatalogStore";
import { deriveRelationshipId } from "@/services/protocol/ids";
import { isRoomExpired, nowUnix } from "@/services/protocol/roomLifecycle";
import {
  hydrateCreateHandshake,
  parseChatSmartBody,
  rememberReplayId,
} from "@/services/protocol/SmartMessageProtocolAdapter";
import type { Contact, SmartMessageInvite } from "@/types/models";
import type {
  ChatInviteHandshake,
  ChatRegisterPayload,
  ChatRevokePayload,
} from "@/types/protocol";
import { CHAT_PROTOCOL_VERSION } from "@/types/protocol";

export type RestoredRoomPlan = {
  roomId: string;
  inviteId: string;
  contactId: string;
  handshake: ChatInviteHandshake;
  invite: SmartMessageInvite;
  /** Block connect/composer until wallet is near chain tip. */
  awaitingChainSync: boolean;
};

function normalizeInviteId(inviteId: string): string {
  return inviteId.trim().toLowerCase();
}

function matchContactForReceived(
  contacts: Contact[],
  paymentIdFrom: string | null | undefined,
): Contact | undefined {
  if (!paymentIdFrom) return undefined;
  const needle = paymentIdFrom.trim().toLowerCase();
  return contacts.find((c) => c.paymentIdFrom.trim().toLowerCase() === needle);
}

function matchContactForSent(
  contacts: Contact[],
  record: SdkMessageRecord,
): Contact | undefined {
  const pidTo = record.paymentIdTo?.trim().toLowerCase();
  if (pidTo) {
    const byPid = contacts.find(
      (c) => c.paymentIdTo?.trim().toLowerCase() === pidTo,
    );
    if (byPid) return byPid;
  }
  const addr = (record.sentTo ?? record.counterpartyAddress)
    ?.trim()
    .toLowerCase();
  if (!addr) return undefined;
  return contacts.find((c) => c.ccxAddress.trim().toLowerCase() === addr);
}

function allMessageRecords(): SdkMessageRecord[] {
  const rt = getRuntime();
  if (!rt) return [];
  return [...readSentRecords(rt.raw), ...readReceivedRecords(rt.raw)];
}

async function inviteFromCreateRecord(
  record: SdkMessageRecord,
  contact: Contact,
  status: SmartMessageInvite["status"],
): Promise<{
  invite: SmartMessageInvite;
  handshake: ChatInviteHandshake;
} | null> {
  if (!messages.isSmartMessage(record.body)) return null;
  const parsed = parseChatSmartBody(record.body, { allowSeenReplay: true });
  if (parsed?.action !== "create") return null;
  let hs = parsed.payload.handshake;
  if (!hs.relationshipId || !hs.salt) {
    const from = contact.paymentIdFrom?.trim();
    const to = contact.paymentIdTo?.trim();
    if (!from || !to) return null;
    const relationshipId = await deriveRelationshipId(from, to);
    hs = await hydrateCreateHandshake(hs, relationshipId);
  }
  rememberReplayId(hs.replayId);
  const invite: SmartMessageInvite = {
    id: `tx:${record.id}`,
    contactId: contact.id,
    roomId: hs.roomId,
    inviteId: hs.inviteId,
    replayId: hs.replayId,
    nonce: hs.nonceSeed.slice(0, 24),
    expiry: new Date(hs.inviteExpiry * 1000).toISOString(),
    inviteExpiry: hs.inviteExpiry,
    roomTtl: hs.roomTtl,
    senderAlias: parsed.payload.senderAlias,
    capabilities: parsed.payload.capabilities,
    roomTopic: hs.roomTopic,
    bootstrapEncrypted: btoa(`${hs.roomId}:${hs.replayId}:${contact.id}`),
    status,
    createdAt: record.timestamp,
    txHash: record.id,
  };
  return { invite, handshake: hs };
}

function scanRegisters(): Map<string, ChatRegisterPayload> {
  const out = new Map<string, ChatRegisterPayload>();
  for (const record of allMessageRecords()) {
    if (!messages.isSmartMessage(record.body)) continue;
    const parsed = parseChatSmartBody(record.body, { allowSeenReplay: true });
    if (parsed?.action !== "register") continue;
    out.set(normalizeInviteId(parsed.payload.inviteId), parsed.payload);
  }
  return out;
}

function scanRevokes(): {
  inviteIds: Set<string>;
  roomIds: Set<string>;
} {
  const inviteIds = new Set<string>();
  const roomIds = new Set<string>();
  for (const record of allMessageRecords()) {
    if (!messages.isSmartMessage(record.body)) continue;
    const parsed = parseChatSmartBody(record.body, { allowSeenReplay: true });
    if (parsed?.action !== "revoke") continue;
    const revoke = parsed.payload as ChatRevokePayload;
    inviteIds.add(normalizeInviteId(revoke.inviteId));
    if (revoke.roomId) roomIds.add(revoke.roomId);
  }
  return { inviteIds, roomIds };
}

function hasCounterpartValidation(
  registers: Map<string, ChatRegisterPayload>,
  inviteId: string,
  walletHasInbound: boolean,
): boolean {
  if (registers.has(normalizeInviteId(inviteId))) return true;
  if (walletHasInbound) return true;
  return false;
}

/** Drop catalog / wallet room rows whose contact no longer exists. */
export function pruneRoomsForMissingContacts(contacts: Contact[]): string[] {
  const contactIds = new Set(contacts.map((c) => c.id));
  const removed: string[] = [];
  for (const room of listCatalogRooms()) {
    if (!room.contactId || contactIds.has(room.contactId)) continue;
    removeCatalogRoom(room.id);
    removed.push(room.id);
  }
  return removed;
}

/**
 * Scan chain + wallet blob for accepted rooms that should reappear after
 * import / rescan / new device unlock.
 */
export async function planRoomRestores(
  contacts: Contact[],
): Promise<RestoredRoomPlan[]> {
  const rt = getRuntime();
  if (!rt || contacts.length === 0) return [];

  const nearTip = await isWalletNearTip(1);
  const registers = scanRegisters();
  const revokes = scanRevokes();
  const walletRooms = readChatRooms(rt.raw);
  const plans = new Map<string, RestoredRoomPlan>();

  for (const record of allMessageRecords()) {
    if (!messages.isSmartMessage(record.body)) continue;
    const contact =
      record.direction === "received"
        ? matchContactForReceived(contacts, record.paymentIdFrom)
        : matchContactForSent(contacts, record);
    if (!contact) continue;

    const status: SmartMessageInvite["status"] =
      record.direction === "sent" ? "sent" : "received";
    const parsed = await inviteFromCreateRecord(record, contact, status);
    if (!parsed) continue;

    const { invite, handshake } = parsed;
    const roomId = invite.roomId;
    const inviteKey = normalizeInviteId(invite.inviteId);

    if (isRoomRevoked(roomId)) continue;
    if (revokes.roomIds.has(roomId) || revokes.inviteIds.has(inviteKey)) {
      continue;
    }
    if (handshake.roomTtl && isRoomExpired(handshake.roomTtl, nowUnix())) {
      continue;
    }

    const walletEntry = walletRooms[roomId];
    if (walletEntry?.revoked === true) continue;

    const walletHasInbound =
      walletEntry &&
      !walletEntry.revoked &&
      walletEntry.messages.some((m) => m.direction === "in");

    if (
      !hasCounterpartValidation(registers, invite.inviteId, walletHasInbound)
    ) {
      continue;
    }

    const awaitingChainSync = !nearTip;
    const acceptedInvite: SmartMessageInvite = {
      ...invite,
      status: "accepted",
    };
    plans.set(roomId, {
      roomId,
      inviteId: invite.inviteId,
      contactId: contact.id,
      handshake,
      invite: acceptedInvite,
      awaitingChainSync,
    });
  }

  // Wallet transcript + addressBook when create/register rows are not scanned yet.
  for (const contact of contacts) {
    if (!contact.roomId) continue;
    if (isRoomRevoked(contact.roomId)) continue;
    if (plans.has(contact.roomId)) continue;
    if (revokes.roomIds.has(contact.roomId)) continue;

    const entry = walletRooms[contact.roomId];
    if (entry?.revoked === true) continue;

    const walletHasInbound =
      entry &&
      !entry.revoked &&
      entry.messages.some((m) => m.direction === "in");
    const acceptedOnContact = contact.inviteStatus === "accepted";

    if (!walletHasInbound && !acceptedOnContact) continue;

    plans.set(contact.roomId, {
      roomId: contact.roomId,
      inviteId: contact.roomId,
      contactId: contact.id,
      handshake: {
        protocolVersion: CHAT_PROTOCOL_VERSION,
        inviteId: contact.roomId,
        roomId: contact.roomId,
        replayId: "",
        nonceSeed: "",
        inviteExpiry: nowUnix() + 86400,
        roomTtl: nowUnix() + 86400 * 7,
        roomTopic: "general",
        senderEphemeralPublicKey: "",
        relationshipId: "",
        salt: "",
        cipherSuite: "CHACHA20_POLY1305_V1",
        kdf: "HKDF_SHA256_V1",
        nonceStrategy: "counter_from_seed",
      },
      invite: {
        id: `contact:${contact.roomId}`,
        contactId: contact.id,
        roomId: contact.roomId,
        inviteId: contact.roomId,
        replayId: "",
        nonce: "",
        expiry: new Date().toISOString(),
        inviteExpiry: nowUnix() + 86400,
        roomTtl: nowUnix() + 86400 * 7,
        senderAlias: contact.alias,
        capabilities: [],
        bootstrapEncrypted: "",
        status: "accepted",
        createdAt: contact.createdAt,
      },
      awaitingChainSync: !nearTip,
    });
  }

  return [...plans.values()];
}

/** Upsert catalog rows for restored rooms (does not connect). */
export function applyRestoredRoomCatalog(plans: RestoredRoomPlan[]): void {
  for (const plan of plans) {
    if (isRoomRevoked(plan.roomId)) continue;
    upsertCatalogRoom({
      id: plan.roomId,
      contactId: plan.contactId,
      bootstrapSource: "conceal-smart-message",
      roomKeyRef: `key:${plan.roomId}`,
      lifecycleStatus: plan.awaitingChainSync ? "pending" : "accepted",
      inviteId: plan.inviteId,
      inviteExpiry: plan.handshake.inviteExpiry,
      roomTtl: plan.handshake.roomTtl,
      roomTopic: plan.handshake.roomTopic,
      createdAt: plan.invite.createdAt,
      awaitingChainSync: plan.awaitingChainSync,
    });
  }
}
