/**
 * Replay chat rooms from wallet file backup messages (sent + received).
 * @see openspec/changes/repair-room-restoration/design.md
 */
import { messages } from "conceal-wallet-sdk";
import {
  readReceivedRecords,
  readSentRecords,
  type SdkMessageRecord,
} from "@/services/conceal/sync/messages-store";
import { getRuntime } from "@/services/conceal/sync/runtime";
import { isWalletNearTip } from "@/services/conceal/walletSyncTip";
import {
  isRoomRevoked,
  rememberRevokedRoom,
} from "@/services/p2p/revokedRoomsStore";
import {
  listCatalogRooms,
  removeCatalogRoom,
  upsertCatalogRoom,
} from "@/services/p2p/roomCatalogStore";
import { deriveRelationshipId } from "@/services/protocol/ids";
import {
  isInviteExpired,
  isRoomExpired,
  nowUnix,
} from "@/services/protocol/roomLifecycle";
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

export type RestoredRoomPlan = {
  roomId: string;
  inviteId: string;
  contactId: string;
  handshake: ChatInviteHandshake;
  invite: SmartMessageInvite;
  kind: "accepted" | "pending";
  /** Accepted rooms only — block open/connect until near chain tip. */
  awaitingChainSync: boolean;
};

export type PlanRoomRestoresOptions = {
  restoreFromFileImport: boolean;
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

function blobMessageRecords(): SdkMessageRecord[] {
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
  const parsed = parseChatSmartBody(record.body, {
    allowSeenReplay: true,
    allowExpiredInvite: true,
  });
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
  for (const record of blobMessageRecords()) {
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
  for (const record of blobMessageRecords()) {
    if (!messages.isSmartMessage(record.body)) continue;
    const parsed = parseChatSmartBody(record.body, { allowSeenReplay: true });
    if (parsed?.action !== "revoke") continue;
    const revoke = parsed.payload as ChatRevokePayload;
    inviteIds.add(normalizeInviteId(revoke.inviteId));
    if (revoke.roomId) roomIds.add(revoke.roomId);
  }
  return { inviteIds, roomIds };
}

/** Drop catalog rows whose contact no longer exists. */
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
 * Replay rooms from encrypted wallet file backup only.
 * Seed/key/QR/resync must pass `restoreFromFileImport: false`.
 */
export async function planRoomRestores(
  contacts: Contact[],
  options: PlanRoomRestoresOptions,
): Promise<RestoredRoomPlan[]> {
  if (!options.restoreFromFileImport) return [];

  const rt = getRuntime();
  if (!rt || contacts.length === 0) return [];

  const now = nowUnix();
  const nearTip = await isWalletNearTip(1);
  const registers = scanRegisters();
  const revokes = scanRevokes();
  const plans = new Map<string, RestoredRoomPlan>();

  for (const record of blobMessageRecords()) {
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

    // Case 1: room lifetime elapsed.
    if (handshake.roomTtl && isRoomExpired(handshake.roomTtl, now)) {
      continue;
    }

    const hasAccept = registers.has(inviteKey);

    // Case 2: invite window closed without accept — tombstone, silent skip.
    if (
      !hasAccept &&
      handshake.inviteExpiry &&
      isInviteExpired(handshake.inviteExpiry, now)
    ) {
      rememberRevokedRoom(roomId, invite.inviteId);
      continue;
    }

    // Case 3: pending invite still within window.
    if (!hasAccept) {
      plans.set(roomId, {
        roomId,
        inviteId: invite.inviteId,
        contactId: contact.id,
        handshake,
        invite,
        kind: "pending",
        awaitingChainSync: false,
      });
      continue;
    }

    // Case 4: accepted — enable only after near-tip revoke scan.
    plans.set(roomId, {
      roomId,
      inviteId: invite.inviteId,
      contactId: contact.id,
      handshake,
      invite: { ...invite, status: "accepted" },
      kind: "accepted",
      awaitingChainSync: !nearTip,
    });
  }

  return [...plans.values()];
}

/** Upsert catalog rows for file-replayed rooms (does not connect). */
export function applyRestoredRoomCatalog(plans: RestoredRoomPlan[]): void {
  for (const plan of plans) {
    if (isRoomRevoked(plan.roomId)) continue;
    const lifecycleStatus =
      plan.kind === "accepted" && !plan.awaitingChainSync
        ? "accepted"
        : "pending";
    upsertCatalogRoom({
      id: plan.roomId,
      contactId: plan.contactId,
      bootstrapSource: "conceal-smart-message",
      roomKeyRef: `key:${plan.roomId}`,
      lifecycleStatus,
      inviteId: plan.inviteId,
      inviteExpiry: plan.handshake.inviteExpiry,
      roomTtl: plan.handshake.roomTtl,
      roomTopic: plan.handshake.roomTopic,
      createdAt: plan.invite.createdAt,
      awaitingChainSync:
        plan.kind === "accepted" ? plan.awaitingChainSync : false,
    });
  }
}
