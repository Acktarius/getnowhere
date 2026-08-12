import { create } from "zustand";
import {
  chatTransport,
  p2pEncryption,
  relationshipService,
  sessionBootstrap,
  smartMessageProtocol,
  smartMessageService,
  walletService,
} from "@/services";
import {
  bindSmartMessageContacts,
  getHandshakeForInvite,
  rememberHandshake,
} from "@/services/conceal/ConcealSmartMessageAdapter";
import { isWalletNearTip } from "@/services/conceal/walletSyncTip";
import {
  hydrateContacts,
  loadPendingInitiatorKeys,
  persistContacts,
  persistInvites,
  removePendingInitiatorKey,
  upsertPendingInitiatorKey,
} from "@/services/contacts/contactsPersistence";
import { exportKeyHex } from "@/services/p2p/P2PEncryptionAdapter";
import {
  getRelationshipTopicEpoch,
  syncRelationshipTopicEpoch,
} from "@/services/p2p/relationshipTopicEpochStore";
import {
  isInviteRevoked,
  isRoomRevoked,
  rememberRevokedRoom,
} from "@/services/p2p/revokedRoomsStore";
import {
  listCatalogRooms,
  patchCatalogRoom,
} from "@/services/p2p/roomCatalogStore";
import {
  applyRestoredRoomCatalog,
  planRoomRestores,
  pruneRoomsForMissingContacts,
} from "@/services/p2p/roomChainRestore";
import { deriveRelationshipId } from "@/services/protocol/ids";
import { tombstoneInvite } from "@/services/protocol/inviteTombstone";
import {
  isPostAcceptStatus,
  shouldAwaitChainSyncForInvite,
} from "@/services/protocol/roomLifecycle";
import type { Contact, SmartMessageInvite } from "@/types/models";
import type { ChatInviteHandshake } from "@/types/protocol";
import { resolveTopicSuite } from "@/types/protocol";
import { generatePaymentId, uid } from "@/utils/format";

type CreateChatOptions = {
  inviteExpirySec?: number;
  roomTtlSec?: number;
  roomTopic?: import("@/services/protocol/roomTopics").RoomTopicId;
};

type ContactsStore = {
  contacts: Contact[];
  invites: SmartMessageInvite[];
  loading: boolean;
  hydrated: boolean;
  /** Load contacts from local storage + wallet addressBook. */
  hydrate: () => Promise<void>;
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
  sendInvite: (
    contactId: string,
    senderAlias: string,
    options?: CreateChatOptions,
  ) => Promise<{ roomId: string }>;
  acceptInvite: (inviteId: string) => Promise<{ roomId: string }>;
  declineInvite: (inviteId: string) => Promise<void>;
  /**
   * Leave forever: L1 chat.revoke (room_revoked), then destroy local room
   * only after broadcast confirms. Peer destroys on scan.
   */
  revokeRoom: (roomId: string) => Promise<void>;
  /** Drop a dead sent invite so Alice can create again (optionally one topic only). */
  abandonPendingInvite: (
    contactId: string,
    opts?: {
      roomTopic?: import("@/services/protocol/roomTopics").RoomTopicId;
      roomId?: string;
    },
  ) => Promise<void>;
  getById: (id: string) => Contact | undefined;
};

/** Eligible contact — both payment IDs; required before any pending chat invite. */
export function isContactEligibleForInvite(
  contact: Pick<
    Contact,
    "paymentIdFrom" | "paymentIdTo" | "relationshipStatus"
  >,
): boolean {
  if (
    contact.relationshipStatus === "blocked" ||
    contact.relationshipStatus === "archived"
  ) {
    return false;
  }
  const hasFrom = Boolean(contact.paymentIdFrom);
  const hasTo = Boolean(
    contact.paymentIdTo && contact.paymentIdTo.length >= 16,
  );
  return hasFrom && hasTo;
}

function isPendingInviteStatus(
  status: Contact["inviteStatus"],
): status is "sent" | "received" {
  return status === "sent" || status === "received";
}

function recomputeStatus(c: Contact): Contact {
  const hasFrom = Boolean(c.paymentIdFrom);
  const hasTo = Boolean(c.paymentIdTo && c.paymentIdTo.length >= 16);
  const canBeEligible =
    hasFrom &&
    hasTo &&
    c.relationshipStatus !== "blocked" &&
    c.relationshipStatus !== "archived";
  const nextRel: Contact["relationshipStatus"] =
    c.relationshipStatus === "blocked"
      ? "blocked"
      : c.relationshipStatus === "archived"
        ? "archived"
        : canBeEligible
          ? "eligible"
          : "pending";

  // Pending invites (sent/received) are only valid on eligible contacts.
  let inviteStatus = c.inviteStatus;
  let roomId = c.roomId;
  if (isPendingInviteStatus(inviteStatus) && nextRel !== "eligible") {
    inviteStatus = "none";
    roomId = undefined;
  }

  let chatStatus: Contact["chatStatus"] = "unavailable";
  if (nextRel === "eligible") chatStatus = "ready";
  if (inviteStatus === "sent" || inviteStatus === "received") {
    chatStatus = "invited";
  }
  if (inviteStatus === "accepted") {
    // Accepted is handoff — UI/store may refine to connecting/active via room.
    chatStatus = c.chatStatus === "active" ? "active" : "connecting";
  }

  return {
    ...c,
    relationshipStatus: nextRel,
    inviteStatus,
    roomId,
    chatStatus,
    updatedAt: new Date().toISOString(),
  };
}

function schedulePersistContacts(get: () => ContactsStore): void {
  void persistContacts(get().contacts);
}

function schedulePersistInvites(get: () => ContactsStore): void {
  persistInvites(get().invites);
}

/**
 * Destructive flows (revoke/decline/abandon) must await the encrypted wallet
 * blob write, not fire-and-forget it — otherwise an app quit right after
 * "Room left" leaves the on-disk blob stale, and hydrateContacts() (which
 * prefers the blob over localStorage) resurrects the deleted room on restart.
 */
async function persistContactsDurably(get: () => ContactsStore): Promise<void> {
  await persistContacts(get().contacts);
}

/**
 * Wipe local room completely after L1 revoke broadcast (or peer revoke scanned).
 * Room MUST disappear from Chats — catalog, session, invites, contact.roomId, UI.
 */
async function applyRoomDestroyLocally(
  get: () => ContactsStore,
  set: (
    partial:
      | Partial<ContactsStore>
      | ((s: ContactsStore) => Partial<ContactsStore>),
  ) => void,
  roomId: string,
  inviteId?: string,
  opts?: { skipEpochBump?: boolean },
): Promise<void> {
  // Tombstone first so any concurrent openRoom/reconnect cannot re-upsert.
  rememberRevokedRoom(roomId, inviteId);
  try {
    const { removeCatalogRoom } = await import(
      "@/services/p2p/roomCatalogStore"
    );
    removeCatalogRoom(roomId);
  } catch {
    /* ignore */
  }

  const invites = get().invites.filter(
    (i) =>
      i.roomId === roomId ||
      (inviteId &&
        (i.inviteId === inviteId ||
          normalizeInviteId(i.inviteId) === normalizeInviteId(inviteId))),
  );
  const ids = new Set(
    invites.map((i) => i.inviteId).concat(inviteId ? [inviteId] : []),
  );
  for (const id of ids) {
    pendingPrivateKeys.delete(id);
    removePendingInitiatorKey(id);
  }

  set((s) => {
    // Drop the invite entirely — tombstone alone still let loadRooms re-seed
    // if status mapping raced; leave = gone from Chats.
    const nextInvites = s.invites.filter((inv) => {
      const matchInvite =
        inviteId &&
        normalizeInviteId(inv.inviteId) === normalizeInviteId(inviteId);
      return inv.roomId !== roomId && !matchInvite;
    });
    const nextContacts = s.contacts.map((c) => {
      if (c.roomId !== roomId) return c;
      return recomputeStatus({
        ...c,
        roomId: undefined,
        inviteStatus: "none",
        chatStatus: "ready",
      });
    });
    return { invites: nextInvites, contacts: nextContacts };
  });
  schedulePersistInvites(get);
  await persistContactsDurably(get);

  try {
    await chatTransport.leaveRoom(roomId, {
      skipEpochBump: opts?.skipEpochBump,
    });
  } catch {
    /* already gone */
  }

  try {
    const { useChatStore } = await import("@/state/chatStore");
    useChatStore.setState((s) => ({
      rooms: s.rooms.filter((r) => r.id !== roomId),
      messagesByRoom: Object.fromEntries(
        Object.entries(s.messagesByRoom).filter(([id]) => id !== roomId),
      ),
      activeRoomId: s.activeRoomId === roomId ? null : s.activeRoomId,
    }));
    // Re-list so Chats cannot keep a stale in-memory entry.
    await useChatStore.getState().loadRooms();
  } catch {
    /* non-fatal */
  }
}

type PendingKey = {
  privateKeyRef: string;
  peerRole: "initiator" | "responder";
  handshake: ChatInviteHandshake;
  contactId: string;
  register?: import("@/types/protocol").ChatRegisterPayload;
};

const pendingPrivateKeys = new Map<string, PendingKey>();

async function restorePendingInitiatorKeys(): Promise<void> {
  for (const rec of loadPendingInitiatorKeys()) {
    const existing = pendingPrivateKeys.get(rec.inviteId);
    // Re-load if: never seen, OR map entry exists but key was wiped after derive.
    if (existing && exportKeyHex(existing.privateKeyRef) !== null) continue;
    const { privateKeyRef } = await p2pEncryption.restoreEphemeralPrivateKey(
      rec.privateKeyHex,
    );
    pendingPrivateKeys.set(rec.inviteId, {
      privateKeyRef,
      peerRole: rec.peerRole ?? "initiator",
      handshake: rec.handshake,
      contactId: rec.contactId,
      register: rec.register,
    });
    rememberHandshake(rec.handshake);
  }
}

function normalizeInviteId(inviteId: string): string {
  return inviteId.trim().toLowerCase();
}

function findPendingInitiator(inviteId: string): PendingKey | undefined {
  const direct = pendingPrivateKeys.get(inviteId);
  if (direct?.peerRole === "initiator") return direct;
  const needle = normalizeInviteId(inviteId);
  for (const [id, pending] of pendingPrivateKeys) {
    if (pending.peerRole !== "initiator") continue;
    if (normalizeInviteId(id) === needle) return pending;
    if (normalizeInviteId(pending.handshake.inviteId) === needle) {
      return pending;
    }
  }
  return undefined;
}

/** True when Alice still holds initiator material for this room. */
export function hasPendingInitiatorForRoom(roomId: string): boolean {
  for (const pending of pendingPrivateKeys.values()) {
    if (
      pending.peerRole === "initiator" &&
      pending.handshake.roomId === roomId
    ) {
      return true;
    }
  }
  return loadPendingInitiatorKeys().some(
    (r) => r.roomId === roomId && (r.peerRole ?? "initiator") === "initiator",
  );
}

function hasPendingResponderForRoom(roomId: string): boolean {
  for (const pending of pendingPrivateKeys.values()) {
    if (
      pending.peerRole === "responder" &&
      pending.handshake.roomId === roomId
    ) {
      return true;
    }
  }
  return loadPendingInitiatorKeys().some(
    (r) => r.roomId === roomId && r.peerRole === "responder",
  );
}

export type InitiatorHandoffProbe = {
  roomId: string;
  hasInitiatorKey: boolean;
  /** Alice initiator vs Bob responder vs unknown (no stash yet). */
  role: "initiator" | "responder" | "unknown";
  registerCount: number;
  matchingRegister: boolean;
  handoffCompleted: boolean;
  detail: string;
  /** When role=unknown and a received invite exists for this room. */
  needsAccept?: boolean;
};

/**
 * Diagnose + attempt Alice's register handoff for a room.
 * Used by Sync accept now so the UI can explain offline/pending.
 */
export async function probeInitiatorHandoff(
  roomId: string,
): Promise<InitiatorHandoffProbe> {
  await restorePendingInitiatorKeys();
  // Bob: re-join mesh from stashed responder key if session disk miss.
  try {
    await completeResponderReconnect(roomId);
  } catch {
    /* fall through to Alice probe */
  }
  const hasInitiatorKey = hasPendingInitiatorForRoom(roomId);
  const hasResponderKey = hasPendingResponderForRoom(roomId);
  const role: InitiatorHandoffProbe["role"] = hasInitiatorKey
    ? "initiator"
    : hasResponderKey
      ? "responder"
      : "unknown";
  let registerCount = 0;
  let matchingRegister = false;
  let handoffCompleted = false;
  let detail = "";
  let needsAccept = false;

  try {
    const registers = await smartMessageService.fetchIncomingRegisters();
    registerCount = registers.length;

    const localInvite = useContactsStore
      .getState()
      .invites.find((i) => i.roomId === roomId);
    const receivedForRoom = useContactsStore
      .getState()
      .invites.find((i) => i.roomId === roomId && i.status === "received");
    const pendingForRoom = [...pendingPrivateKeys.values()].filter(
      (p) => p.peerRole === "initiator" && p.handshake.roomId === roomId,
    );

    // Prefer pending keys for this room; also accept register.inviteId lookup.
    const attempts: Array<{
      pending: PendingKey;
      register: import("@/types/protocol").ChatRegisterPayload;
    }> = [];

    for (const pending of pendingForRoom) {
      const hit = registers.find(
        (r) =>
          normalizeInviteId(r.register.inviteId) ===
          normalizeInviteId(pending.handshake.inviteId),
      );
      if (hit) attempts.push({ pending, register: hit.register });
    }
    for (const { register } of registers) {
      const pending = findPendingInitiator(register.inviteId);
      if (!pending || pending.handshake.roomId !== roomId) continue;
      if (
        attempts.some(
          (a) => a.pending.handshake.inviteId === pending.handshake.inviteId,
        )
      ) {
        continue;
      }
      attempts.push({ pending, register });
    }

    // Register exists for this room's invite even without a local key.
    if (
      localInvite &&
      registers.some(
        (r) =>
          normalizeInviteId(r.register.inviteId) ===
          normalizeInviteId(localInvite.inviteId),
      )
    ) {
      matchingRegister = true;
    }
    if (attempts.length > 0) matchingRegister = true;

    for (const { pending, register } of attempts) {
      try {
        await completeInitiatorHandoff(
          pending.handshake.inviteId,
          { ...register, inviteId: pending.handshake.inviteId },
          pending.handshake,
        );
        handoffCompleted = true;
        detail = "Register applied — connecting.";
        break;
      } catch (e) {
        detail = (e as Error).message || "Handoff failed.";
      }
    }

    if (!detail) {
      const expectedIds = [
        ...new Set([
          ...pendingForRoom.map((p) => p.handshake.inviteId),
          ...(localInvite ? [localInvite.inviteId] : []),
        ]),
      ];
      const seenIds = registers.map((r) => r.register.inviteId);
      if (role === "responder") {
        detail = handoffCompleted
          ? "Connecting…"
          : "You already accepted — reconnecting to peer. If this stays offline, peer must open the same room.";
      } else if (role === "unknown") {
        if (receivedForRoom) {
          needsAccept = true;
          detail =
            "Incoming invite is waiting. Open the contact and tap Accept (Connect now only helps the sender).";
        } else if (localInvite?.status === "sent") {
          detail =
            "No initiator session key for this invite. Abandon it and send a new invite (required after refresh on older builds).";
        } else {
          detail =
            "Room still pending. If you were invited, Accept on the contact. If you sent the invite, resend from the contact.";
        }
      } else if (registerCount === 0) {
        detail =
          "No on-chain register in this wallet yet. Wait for their accept tx to sync, then Sync again.";
      } else if (!matchingRegister) {
        detail = `Waiting for accept of THIS invite. expected=[${expectedIds.join(",") || "?"}] registers=[${seenIds.join(",") || "none"}]. Peer must Accept the new invite (not an old room).`;
      } else {
        detail = "Register matched; retry Sync.";
      }
    }
  } catch (e) {
    detail = (e as Error).message || "Wallet sync failed.";
  }

  return {
    roomId,
    hasInitiatorKey,
    role,
    registerCount,
    matchingRegister,
    handoffCompleted,
    detail,
    needsAccept,
  };
}

function mergeInviteLists(
  local: SmartMessageInvite[],
  incoming: SmartMessageInvite[],
): SmartMessageInvite[] {
  const byInviteId = new Map<string, SmartMessageInvite>();
  for (const inv of local) {
    byInviteId.set(normalizeInviteId(inv.inviteId), inv);
  }
  for (const inv of incoming) {
    const key = normalizeInviteId(inv.inviteId);
    // Never resurrect a revoked room from an on-chain create.
    if (isRoomRevoked(inv.roomId) || isInviteRevoked(inv.inviteId)) {
      continue;
    }
    const prev = byInviteId.get(key);
    if (!prev) {
      byInviteId.set(key, inv);
      continue;
    }
    // Prefer terminal / remote status over stale local "sent".
    // `failed` = destroyed/revoked — must not lose to a re-scanned create.
    const rank = (s: SmartMessageInvite["status"]) =>
      s === "accepted" || s === "rejected" || s === "expired" || s === "failed"
        ? 2
        : s === "received"
          ? 1
          : 0;
    if (rank(prev.status) === 2 && rank(inv.status) < 2) {
      continue;
    }
    byInviteId.set(key, rank(inv.status) >= rank(prev.status) ? inv : prev);
  }
  return [...byInviteId.values()];
}

export const useContactsStore = create<ContactsStore>((set, get) => ({
  contacts: [],
  invites: [],
  loading: false,
  hydrated: false,

  async hydrate() {
    const { contacts, invites } = await hydrateContacts();
    const nextContacts = contacts.map(recomputeStatus);
    const nextInvites = invites.filter((inv) => {
      if (inv.status !== "received" && inv.status !== "sent") return true;
      const contact = nextContacts.find((c) => c.id === inv.contactId);
      return contact ? isContactEligibleForInvite(contact) : false;
    });
    set({
      contacts: nextContacts,
      invites: nextInvites,
      hydrated: true,
    });
    await restorePendingInitiatorKeys();
    schedulePersistContacts(get);
    schedulePersistInvites(get);
  },

  async addContact({ alias, ccxAddress, paymentIdFrom, paymentIdTo, notes }) {
    const from = paymentIdFrom?.trim() || walletService.generatePaymentId();
    const dup = get().contacts.find(
      (c) => c.ccxAddress === ccxAddress && c.paymentIdFrom === from,
    );
    if (dup) {
      throw new Error(
        "A contact with this address and payment ID already exists.",
      );
    }
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
    schedulePersistContacts(get);
    return contact;
  },

  updateContact(id, patch) {
    set((s) => ({
      contacts: s.contacts.map((c) =>
        c.id === id ? recomputeStatus({ ...c, ...patch }) : c,
      ),
    }));
    schedulePersistContacts(get);
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
    schedulePersistContacts(get);
  },

  removeContact(id) {
    const doomedRoomIds = new Set<string>();
    for (const inv of get().invites.filter((i) => i.contactId === id)) {
      doomedRoomIds.add(inv.roomId);
    }
    const contact = get().contacts.find((c) => c.id === id);
    if (contact?.roomId) doomedRoomIds.add(contact.roomId);
    set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) }));
    schedulePersistContacts(get);
    void (async () => {
      for (const roomId of doomedRoomIds) {
        if (isRoomRevoked(roomId)) continue;
        try {
          await applyRoomDestroyLocally(get, set, roomId);
        } catch {
          /* best-effort */
        }
      }
      pruneRoomsForMissingContacts(get().contacts);
    })();
  },
  archiveContact(id) {
    set((s) => ({
      contacts: s.contacts.map((c) =>
        c.id === id
          ? recomputeStatus({ ...c, relationshipStatus: "archived" })
          : c,
      ),
    }));
    schedulePersistContacts(get);
  },
  blockContact(id) {
    set((s) => ({
      contacts: s.contacts.map((c) =>
        c.id === id
          ? recomputeStatus({ ...c, relationshipStatus: "blocked" })
          : c,
      ),
    }));
    schedulePersistContacts(get);
  },

  async refreshInvites() {
    await restorePendingInitiatorKeys();

    // Apply peer revokes first — never recreate a room we are about to destroy.
    const revokes = await smartMessageService.fetchIncomingRevokes();
    for (const { revoke } of revokes) {
      const inv = get().invites.find(
        (i) =>
          normalizeInviteId(i.inviteId) === normalizeInviteId(revoke.inviteId),
      );
      const catalogHit = (await import("@/services/p2p/roomCatalogStore"))
        .listCatalogRooms()
        .find(
          (r) =>
            (revoke.roomId && r.id === revoke.roomId) ||
            (r.inviteId &&
              normalizeInviteId(r.inviteId) ===
                normalizeInviteId(revoke.inviteId)),
        );
      let syncedEpochFromPeer = false;
      if (
        revoke.topicEpoch !== undefined &&
        revoke.reasonCode === "room_revoked"
      ) {
        const handshake = getHandshakeForInvite(revoke.inviteId);
        const contactId = inv?.contactId || catalogHit?.contactId;
        let relationshipId = handshake?.relationshipId;
        if (!relationshipId && contactId) {
          const contact = get().contacts.find((c) => c.id === contactId);
          if (contact?.paymentIdFrom && contact?.paymentIdTo) {
            relationshipId = await deriveRelationshipId(
              contact.paymentIdFrom,
              contact.paymentIdTo,
            );
          }
        }
        if (relationshipId) {
          syncRelationshipTopicEpoch(relationshipId, revoke.topicEpoch);
          syncedEpochFromPeer = true;
        }
      }
      const roomId = revoke.roomId || inv?.roomId || catalogHit?.id;
      if (!roomId) continue;
      const destroyOpts = syncedEpochFromPeer
        ? { skipEpochBump: true as const }
        : undefined;
      if (isRoomRevoked(roomId)) {
        // Ensure catalog/UI stay clean even if a prior pass left residue.
        try {
          await applyRoomDestroyLocally(
            get,
            set,
            roomId,
            revoke.inviteId,
            destroyOpts,
          );
        } catch {
          /* ignore */
        }
        continue;
      }
      try {
        await applyRoomDestroyLocally(
          get,
          set,
          roomId,
          revoke.inviteId,
          destroyOpts,
        );
      } catch {
        /* retry next poll */
      }
    }

    pruneRoomsForMissingContacts(get().contacts);

    const { useWalletStore } = await import("@/state/walletStore");
    const restoreFromFileImport = useWalletStore
      .getState()
      .takeFileImportRoomRestore();
    const restoredPlans = restoreFromFileImport
      ? await planRoomRestores(get().contacts, { restoreFromFileImport: true })
      : [];
    applyRestoredRoomCatalog(restoredPlans);
    const restoredInvites = restoredPlans.map((p) => p.invite);

    const list = await smartMessageService.fetchIncomingMessages();
    const eligibleOnly = mergeInviteLists(
      mergeInviteLists(get().invites, restoredInvites),
      list,
    ).filter((inv) => {
      if (isRoomRevoked(inv.roomId) || isInviteRevoked(inv.inviteId)) {
        return false;
      }
      if (inv.status !== "received" && inv.status !== "sent") return true;
      const contact = get().contacts.find((c) => c.id === inv.contactId);
      return contact ? isContactEligibleForInvite(contact) : false;
    });

    // Per contact + roomTopic: only the newest received create is actionable.
    const newestReceived = new Map<string, (typeof eligibleOnly)[number]>();
    for (const inv of eligibleOnly) {
      if (inv.status !== "received") continue;
      if (isRoomRevoked(inv.roomId) || isInviteRevoked(inv.inviteId)) continue;
      const key = `${inv.contactId}:${inv.roomTopic ?? "general"}`;
      const prev = newestReceived.get(key);
      if (!prev || inv.createdAt >= prev.createdAt) {
        newestReceived.set(key, inv);
      }
    }

    const pruned = eligibleOnly.map((inv) => {
      if (inv.status !== "received") return inv;
      const key = `${inv.contactId}:${inv.roomTopic ?? "general"}`;
      const newest = newestReceived.get(key);
      if (newest && newest.inviteId !== inv.inviteId) {
        return { ...inv, status: "expired" as const };
      }
      return inv;
    });

    set({ invites: pruned });
    schedulePersistInvites(get);

    const nearTip = await isWalletNearTip(1);
    if (nearTip) {
      for (const entry of listCatalogRooms()) {
        if (!entry.awaitingChainSync) continue;
        if (
          isRoomRevoked(entry.id) ||
          (entry.inviteId && isInviteRevoked(entry.inviteId))
        ) {
          continue;
        }
        const pendingInvite = entry.lifecycleStatus === "pending";
        const lifecycleStatus = pendingInvite
          ? ("pending" as const)
          : isPostAcceptStatus(entry.lifecycleStatus)
            ? entry.lifecycleStatus
            : ("accepted" as const);
        patchCatalogRoom(entry.id, {
          awaitingChainSync: false,
          lifecycleStatus,
        });
        try {
          await chatTransport.createRoom({
            contactId: entry.contactId,
            bootstrap: {
              roomId: entry.id,
              roomKeyRef: entry.roomKeyRef,
              bootstrapSource: entry.bootstrapSource,
              lifecycleStatus,
              inviteId: entry.inviteId,
              inviteExpiry: entry.inviteExpiry,
              roomTtl: entry.roomTtl,
              roomTopic: entry.roomTopic,
              awaitingChainSync: false,
            },
          });
        } catch {
          /* ignore */
        }
      }
    }

    for (const plan of restoredPlans) {
      if (isRoomRevoked(plan.roomId) || isInviteRevoked(plan.inviteId)) {
        continue;
      }
      const contact = get().contacts.find((c) => c.id === plan.contactId);
      if (!contact) continue;
      const enabled =
        plan.kind === "accepted" && nearTip && !plan.awaitingChainSync;
      try {
        await chatTransport.createRoom({
          contactId: plan.contactId,
          bootstrap: {
            roomId: plan.roomId,
            roomKeyRef: `key:${plan.roomId}`,
            bootstrapSource: "conceal-smart-message",
            lifecycleStatus: enabled ? "accepted" : "pending",
            inviteId: plan.inviteId,
            inviteExpiry: plan.handshake.inviteExpiry,
            roomTtl: plan.handshake.roomTtl,
            roomTopic: plan.handshake.roomTopic,
            awaitingChainSync: plan.kind === "accepted" && !enabled,
          },
        });
      } catch {
        /* revoked / invalid */
      }
      if (enabled) {
        patchCatalogRoom(plan.roomId, {
          lifecycleStatus: "accepted",
          awaitingChainSync: false,
        });
        get().updateContact(plan.contactId, {
          inviteStatus: "accepted",
          roomId: plan.roomId,
          chatStatus: "connecting",
        });
      }
    }

    for (const inv of newestReceived.values()) {
      if (isRoomRevoked(inv.roomId) || isInviteRevoked(inv.inviteId)) continue;
      const contact = get().contacts.find((c) => c.id === inv.contactId);
      if (!contact || !isContactEligibleForInvite(contact)) continue;
      const awaitingChainSync = shouldAwaitChainSyncForInvite(
        nearTip,
        inv.inviteExpiry,
      );
      await chatTransport.createRoom({
        contactId: inv.contactId,
        bootstrap: {
          roomId: inv.roomId,
          roomKeyRef: `key:${inv.roomId}`,
          bootstrapSource: "conceal-smart-message",
          lifecycleStatus: "pending",
          inviteId: inv.inviteId,
          inviteExpiry: inv.inviteExpiry,
          roomTtl: inv.roomTtl,
          roomTopic: inv.roomTopic,
          awaitingChainSync,
        },
      });
      get().updateContact(inv.contactId, {
        inviteStatus: "received",
        roomId: inv.roomId,
        chatStatus: "invited",
      });
    }

    // Transport rooms are in-memory — push into chat store so Chats list updates
    // without requiring a remount / loadRooms race.
    try {
      const { useChatStore } = await import("@/state/chatStore");
      await useChatStore.getState().loadRooms();
    } catch {
      /* non-fatal */
    }

    // Alice: scan Bob's on-chain register and finish Holepunch handoff.
    const registers = await smartMessageService.fetchIncomingRegisters();
    for (const { register } of registers) {
      const pending = findPendingInitiator(register.inviteId);
      if (!pending) continue;
      if (isRoomRevoked(pending.handshake.roomId)) continue;
      if (pending.contactId) {
        const { useNotificationStore } = await import(
          "@/state/notificationStore"
        );
        useNotificationStore.getState().pingRegister(pending.contactId);
      }
      try {
        await completeInitiatorHandoff(
          pending.handshake.inviteId,
          {
            ...register,
            inviteId: pending.handshake.inviteId,
          },
          pending.handshake,
        );
      } catch {
        // Keep trying on next refresh (sync / key restore may still settle).
      }
    }
  },

  async sendInvite(contactId, senderAlias, options) {
    const contact = get().contacts.find((c) => c.id === contactId);
    if (!contact) throw new Error("Contact not found.");
    if (!isContactEligibleForInvite(contact)) {
      throw new Error(
        "Chat invite requires an eligible contact (both payment IDs).",
      );
    }
    if (contact.relationshipStatus !== "eligible") {
      throw new Error("Chat create requires an eligible contact.");
    }
    if (!contact.paymentIdTo) {
      throw new Error("Missing paymentIdTo.");
    }

    const roomTopic = options?.roomTopic ?? "general";

    // Multiple rooms per contact are allowed (including same topic after UI
    // confirm). Do not auto-abandon prior rooms on create.
    // @see docs/security/p2pchatprotocol.md

    const relationshipId = await deriveRelationshipId(
      contact.paymentIdFrom,
      contact.paymentIdTo,
    );
    const keypair = await p2pEncryption.generateEphemeralKeypair();
    const composed = await smartMessageService.composeInviteMessage({
      contactId,
      senderAlias,
      relationshipId,
      inviteExpirySec: options?.inviteExpirySec,
      roomTtlSec: options?.roomTtlSec,
      roomTopic,
      handshakeOverrides: {
        senderEphemeralPublicKey: keypair.publicKeyHex,
        roomTopic,
      },
    });
    // Stash Alice initiator key across reloads until Bob's register arrives.
    pendingPrivateKeys.set(composed.inviteId, {
      privateKeyRef: keypair.privateKeyRef,
      peerRole: "initiator",
      handshake: composed.handshake,
      contactId,
    });
    upsertPendingInitiatorKey({
      inviteId: composed.inviteId,
      contactId,
      roomId: composed.roomId,
      privateKeyHex: keypair.privateKeyHex,
      handshake: composed.handshake,
      peerRole: "initiator",
    });
    rememberHandshake(composed.handshake);

    // Local envelope for the adapter (tx encryption is on-chain). Pass smartBody
    // directly so unicode aliases cannot break btoa.
    const sent = await smartMessageService.sendInviteMessage(
      contactId,
      composed.smartBody,
      {
        recipientAddress: contact.ccxAddress,
        paymentId: contact.paymentIdTo,
      },
    );

    await chatTransport.createRoom({
      contactId,
      bootstrap: {
        roomId: composed.roomId,
        roomKeyRef: `key:${composed.roomId}`,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "pending",
        inviteId: composed.inviteId,
        inviteExpiry: composed.inviteExpiry,
        roomTtl: composed.roomTtl,
        roomTopic: composed.roomTopic ?? roomTopic,
      },
    });

    set((s) => ({
      contacts: s.contacts.map((c) =>
        c.id === contactId
          ? recomputeStatus({
              ...c,
              inviteStatus: "sent",
              roomId: composed.roomId,
              chatStatus: "invited",
              lastInteractionAt: new Date().toISOString(),
            })
          : c,
      ),
      invites: [
        {
          id: sent.inviteId,
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
          roomTopic: composed.roomTopic ?? roomTopic,
          bootstrapEncrypted: composed.bootstrapEncrypted,
          status: "sent" as const,
          createdAt: new Date().toISOString(),
          txHash: sent.txHash,
        },
        ...s.invites.filter(
          (i) =>
            !(
              i.contactId === contactId &&
              (i.roomTopic ?? "general") === roomTopic &&
              i.status === "sent"
            ),
        ),
      ],
    }));
    schedulePersistContacts(get);
    schedulePersistInvites(get);

    return { roomId: composed.roomId };
  },

  async acceptInvite(inviteId) {
    if (!(await isWalletNearTip(1))) {
      throw new Error(
        "Wallet still syncing — wait until near chain tip before accepting. A leave or revoke may still be on the chain.",
      );
    }

    let inv = get().invites.find((i) => i.id === inviteId);
    // Prefer an already-parsed handshake (from refreshInvites). Only re-scan
    // the chain when the ECDH material is missing (e.g. after restart).
    let handshake = inv ? getHandshakeForInvite(inv.inviteId) : undefined;
    if (!inv || !handshake) {
      const incoming = await smartMessageService.fetchIncomingMessages();
      if (!inv) {
        inv = incoming.find((i) => i.id === inviteId);
        if (inv) {
          set((s) => ({ invites: [inv!, ...s.invites] }));
        }
      }
      if (!inv) throw new Error("Invite not found.");
      if (!handshake) {
        const parsed = incoming.find(
          (i) =>
            i.inviteId === inv!.inviteId ||
            i.id === inv!.id ||
            i.roomId === inv!.roomId,
        );
        if (parsed) handshake = getHandshakeForInvite(parsed.inviteId);
      }
    }
    if (!inv) throw new Error("Invite not found.");
    if (!handshake) {
      throw new Error(
        "Missing create handshake for invite. Wait for wallet sync, then Accept again — or ask them to resend.",
      );
    }

    const keypair = await p2pEncryption.generateEphemeralKeypair();
    const register = await smartMessageProtocol.composeRegister({
      inviteId: inv.inviteId,
      receiverEphemeralPublicKey: keypair.publicKeyHex,
      replayId: inv.replayId,
    });
    // Stash Bob responder key so refresh can reconnect before session persist.
    pendingPrivateKeys.set(register.inviteId, {
      privateKeyRef: keypair.privateKeyRef,
      peerRole: "responder",
      handshake: {
        ...handshake,
        receiverEphemeralPublicKey: keypair.publicKeyHex,
      },
      contactId: inv.contactId,
      register,
    });
    upsertPendingInitiatorKey({
      inviteId: register.inviteId,
      contactId: inv.contactId,
      roomId: inv.roomId,
      privateKeyHex: keypair.privateKeyHex,
      handshake: {
        ...handshake,
        receiverEphemeralPublicKey: keypair.publicKeyHex,
      },
      peerRole: "responder",
      register,
    });

    // L1 register must broadcast so Alice can hand off — this is the real wait.
    await smartMessageService.acceptInvite(inviteId, {
      inviteId: register.inviteId,
      receiverEphemeralPublicKey: register.receiverEphemeralPublicKey,
      replayId: register.replayId,
    });

    const session = await sessionBootstrap.deriveSession({
      invite: handshake,
      acceptance: register,
      peerRole: "responder",
      localPrivateKeyRef: keypair.privateKeyRef,
    });
    const contract = await sessionBootstrap.buildHolepunchContract({
      session,
      invite: {
        ...handshake,
        receiverEphemeralPublicKey: keypair.publicKeyHex,
      },
      peerRole: "responder",
    });

    const room = await chatTransport.createRoom({
      contactId: inv.contactId,
      bootstrap: {
        roomId: inv.roomId,
        roomKeyRef: session.sessionId,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
        inviteId: inv.inviteId,
        inviteExpiry: inv.inviteExpiry,
        roomTtl: inv.roomTtl,
        roomTopic: inv.roomTopic ?? handshake.roomTopic,
      },
    });

    const { useChatStore } = await import("@/state/chatStore");
    useChatStore.setState((s) => ({
      rooms: [
        ...s.rooms.filter((r) => r.id !== inv!.roomId),
        { ...room, lifecycleStatus: "connecting", peerStatus: "connecting" },
      ],
    }));

    set((s) => ({
      contacts: s.contacts.map((c) =>
        c.id === inv!.contactId
          ? recomputeStatus({
              ...c,
              inviteStatus: "accepted",
              roomId: inv!.roomId,
              chatStatus: "connecting",
              lastInteractionAt: new Date().toISOString(),
            })
          : c,
      ),
      invites: s.invites.map((i) =>
        i.id === inviteId || i.inviteId === inv!.inviteId
          ? { ...i, status: "accepted" as const }
          : i,
      ),
    }));
    schedulePersistContacts(get);
    schedulePersistInvites(get);

    // Holepunch connect can take seconds — do not block redirect. Chat room
    // screen already reconnects if peers are not live yet.
    const roomId = inv.roomId;
    void (async () => {
      try {
        const connected = await chatTransport.connect(contract);
        useChatStore.setState((s) => ({
          rooms: [...s.rooms.filter((r) => r.id !== roomId), connected],
        }));
        set((s) => ({
          contacts: s.contacts.map((c) =>
            c.roomId === roomId
              ? recomputeStatus({
                  ...c,
                  chatStatus:
                    connected.lifecycleStatus === "connected"
                      ? "active"
                      : "connecting",
                })
              : c,
          ),
        }));
        schedulePersistContacts(get);
        const saved = (
          await import("@/services/p2p/roomSessionStore")
        ).loadRoomSession(roomId);
        if (saved) {
          pendingPrivateKeys.delete(register.inviteId);
          removePendingInitiatorKey(register.inviteId);
        }
      } catch {
        // ChatRoomScreen retry / refreshInvites will continue connect.
      }
    })();

    return { roomId };
  },

  async declineInvite(inviteId) {
    await smartMessageService.declineInvite(inviteId);
    const inv = get().invites.find((i) => i.id === inviteId);
    if (inv) {
      const { invite: wiped } = tombstoneInvite(inv, "rejected");
      set((s) => ({
        invites: s.invites.map((i) => (i.id === inviteId ? wiped : i)),
        contacts: s.contacts.map((c) =>
          c.id === inv.contactId
            ? recomputeStatus({
                ...c,
                inviteStatus: "rejected",
                chatStatus: "ready",
              })
            : c,
        ),
      }));
      schedulePersistInvites(get);
      await persistContactsDurably(get);
      const room = await chatTransport.getRoom(inv.roomId);
      if (room) {
        await chatTransport.leaveRoom(inv.roomId);
      }
    }
  },

  async revokeRoom(roomId) {
    const inv = get().invites.find((i) => i.roomId === roomId);
    const catalog = (
      await import("@/services/p2p/roomCatalogStore")
    ).loadCatalogRoom(roomId);
    const room = await chatTransport.getRoom(roomId);
    const contactId =
      inv?.contactId ||
      room?.contactId ||
      catalog?.contactId ||
      get().contacts.find((c) => c.roomId === roomId)?.id;
    const inviteId = inv?.inviteId || room?.inviteId || catalog?.inviteId;
    const replayId = inv?.replayId;
    if (!contactId || !inviteId) {
      throw new Error("Cannot leave room — missing contact or invite id.");
    }
    // Destroy immediately — do not wait for L1 broadcast/confirm.
    await applyRoomDestroyLocally(get, set, roomId, inviteId);
    let topicEpoch: number | undefined;
    const handshake = inviteId ? getHandshakeForInvite(inviteId) : undefined;
    const contact = get().contacts.find((c) => c.id === contactId);
    const relationshipId =
      handshake?.relationshipId ??
      (contact?.paymentIdFrom && contact?.paymentIdTo
        ? await deriveRelationshipId(contact.paymentIdFrom, contact.paymentIdTo)
        : undefined);
    if (
      relationshipId &&
      handshake &&
      resolveTopicSuite(handshake) === "HKDF_EPOCH_V1"
    ) {
      topicEpoch = getRelationshipTopicEpoch(relationshipId);
    }
    // Notify counterpart on L1 in the background (best-effort).
    void smartMessageService
      .revokeRoom({ contactId, inviteId, roomId, replayId, topicEpoch })
      .catch(async (e) => {
        const { toastError } = await import("@/state/toastStore");
        toastError(
          (e as Error)?.message ||
            "Room destroyed here, but revoke tx failed to send.",
        );
      });
  },

  async abandonPendingInvite(contactId, opts) {
    const contact = get().contacts.find((c) => c.id === contactId);
    const topicFilter = opts?.roomTopic;
    const roomFilter = opts?.roomId;
    const doomed = get().invites.filter((i) => {
      if (i.contactId !== contactId) return false;
      if (roomFilter && i.roomId !== roomFilter) return false;
      if (
        topicFilter &&
        (i.roomTopic ?? "general") !== topicFilter &&
        i.roomId !== roomFilter
      ) {
        return false;
      }
      return (
        i.status === "sent" ||
        i.status === "received" ||
        i.status === "accepted" ||
        i.roomId === contact?.roomId
      );
    });
    for (const inv of doomed) {
      pendingPrivateKeys.delete(inv.inviteId);
      removePendingInitiatorKey(inv.inviteId);
      try {
        await chatTransport.leaveRoom(inv.roomId);
      } catch {
        /* ignore */
      }
    }
    const doomedRooms = new Set(doomed.map((i) => i.roomId));
    set((s) => {
      const remainingInvites = s.invites.filter(
        (i) => !(i.contactId === contactId && doomedRooms.has(i.roomId)),
      );
      const latestOther = remainingInvites.find(
        (i) =>
          i.contactId === contactId &&
          (i.status === "sent" ||
            i.status === "received" ||
            i.status === "accepted"),
      );
      return {
        invites: remainingInvites,
        contacts: s.contacts.map((c) =>
          c.id === contactId
            ? recomputeStatus({
                ...c,
                inviteStatus:
                  latestOther?.status === "sent"
                    ? "sent"
                    : latestOther?.status === "received"
                      ? "received"
                      : latestOther?.status === "accepted"
                        ? "accepted"
                        : "none",
                chatStatus: latestOther ? "invited" : "ready",
                roomId: latestOther?.roomId,
              })
            : c,
        ),
      };
    });
    schedulePersistInvites(get);
    await persistContactsDurably(get);
  },

  getById(id) {
    return get().contacts.find((c) => c.id === id);
  },
}));

/**
 * Bob: after refresh, re-derive + connect from stashed responder key + register.
 */
export async function completeResponderReconnect(
  roomId: string,
): Promise<boolean> {
  await restorePendingInitiatorKeys();
  const live = await chatTransport.getRoom(roomId);
  if (
    live &&
    (live.lifecycleStatus === "connecting" ||
      live.lifecycleStatus === "connected")
  ) {
    return live.lifecycleStatus === "connected";
  }
  let pending = [...pendingPrivateKeys.values()].find(
    (p) => p.peerRole === "responder" && p.handshake.roomId === roomId,
  );
  if (!pending?.register) {
    for (const rec of loadPendingInitiatorKeys()) {
      if (
        rec.peerRole !== "responder" ||
        rec.roomId !== roomId ||
        !rec.register
      ) {
        continue;
      }
      const { privateKeyRef } = await p2pEncryption.restoreEphemeralPrivateKey(
        rec.privateKeyHex,
      );
      pending = {
        privateKeyRef,
        peerRole: "responder",
        handshake: rec.handshake,
        contactId: rec.contactId,
        register: rec.register,
      };
      pendingPrivateKeys.set(rec.inviteId, pending);
      break;
    }
  }
  if (!pending?.register) return false;
  const register = pending.register;
  if (!register) return false;

  if (!exportKeyHex(pending.privateKeyRef)) {
    const rec = loadPendingInitiatorKeys().find(
      (r) =>
        r.peerRole === "responder" &&
        r.inviteId === pending!.handshake.inviteId,
    );
    if (!rec) return false;
    const { privateKeyRef } = await p2pEncryption.restoreEphemeralPrivateKey(
      rec.privateKeyHex,
    );
    pending = { ...pending, privateKeyRef };
    pendingPrivateKeys.set(pending.handshake.inviteId, pending);
  }

  const session = await sessionBootstrap.deriveSession({
    invite: pending.handshake,
    acceptance: register,
    peerRole: "responder",
    localPrivateKeyRef: pending.privateKeyRef,
  });
  const contract = await sessionBootstrap.buildHolepunchContract({
    session,
    invite: pending.handshake,
    peerRole: "responder",
  });
  await chatTransport.createRoom({
    contactId: pending.contactId,
    bootstrap: {
      roomId,
      roomKeyRef: session.sessionId,
      bootstrapSource: "conceal-smart-message",
      lifecycleStatus: "accepted",
      inviteId: pending.handshake.inviteId,
      inviteExpiry: pending.handshake.inviteExpiry,
      roomTtl: pending.handshake.roomTtl,
    },
  });
  const connected = await chatTransport.connect(contract);
  const { useChatStore } = await import("@/state/chatStore");
  useChatStore.setState((s) => ({
    rooms: [...s.rooms.filter((r) => r.id !== roomId), connected],
  }));
  if (pending.contactId) {
    useContactsStore.getState().updateContact(pending.contactId, {
      inviteStatus: "accepted",
      chatStatus:
        connected.lifecycleStatus === "connected" ? "active" : "connecting",
      roomId,
    });
  }
  const saved = (
    await import("@/services/p2p/roomSessionStore")
  ).loadRoomSession(roomId);
  if (saved) {
    pendingPrivateKeys.delete(pending.handshake.inviteId);
    removePendingInitiatorKey(pending.handshake.inviteId);
  }
  return connected.lifecycleStatus === "connected";
}

/** Completes Alice's Holepunch handoff after Bob's register. */
export async function completeInitiatorHandoff(
  inviteId: string,
  register: import("@/types/protocol").ChatRegisterPayload,
  handshake: ChatInviteHandshake,
): Promise<void> {
  const pending = findPendingInitiator(inviteId);
  if (!pending) return;

  // Room already live (or mid-connect) — do not re-derive and churn the proof.
  const existingRoom = await chatTransport.getRoom(handshake.roomId);
  if (
    existingRoom &&
    (existingRoom.lifecycleStatus === "connected" ||
      existingRoom.lifecycleStatus === "connecting")
  ) {
    return;
  }

  const session = await sessionBootstrap.deriveSession({
    invite: handshake,
    acceptance: {
      ...register,
      inviteId: handshake.inviteId,
      replayId:
        register.replayId.toLowerCase() === handshake.replayId.toLowerCase()
          ? handshake.replayId
          : register.replayId,
    },
    peerRole: "initiator",
    localPrivateKeyRef: pending.privateKeyRef,
  });
  const contract = await sessionBootstrap.buildHolepunchContract({
    session,
    invite: {
      ...handshake,
      receiverEphemeralPublicKey: register.receiverEphemeralPublicKey,
    },
    peerRole: "initiator",
  });

  const contactId =
    pending.contactId ||
    useContactsStore
      .getState()
      .invites.find((i) => i.inviteId === handshake.inviteId)?.contactId ||
    "";
  const roomId = handshake.roomId;
  await chatTransport.createRoom({
    contactId,
    bootstrap: {
      roomId,
      roomKeyRef: session.sessionId,
      bootstrapSource: "conceal-smart-message",
      lifecycleStatus: "accepted",
      inviteId: handshake.inviteId,
      inviteExpiry: handshake.inviteExpiry,
      roomTtl: handshake.roomTtl,
    },
  });

  const connected = await chatTransport.connect(contract);
  // Push live room into chat store so UI leaves "pending" without remount.
  const { useChatStore } = await import("@/state/chatStore");
  useChatStore.setState((s) => ({
    rooms: [...s.rooms.filter((r) => r.id !== roomId), connected],
  }));

  if (contactId) {
    useContactsStore.getState().updateContact(contactId, {
      inviteStatus: "accepted",
      chatStatus:
        connected.lifecycleStatus === "connected" ? "active" : "connecting",
      roomId,
    });
    const { useNotificationStore } = await import("@/state/notificationStore");
    useNotificationStore.getState().pingRegister(contactId);
  }
  useContactsStore.setState((s) => ({
    invites: s.invites.map((i) =>
      normalizeInviteId(i.inviteId) === normalizeInviteId(handshake.inviteId)
        ? { ...i, status: "accepted" as const }
        : i,
    ),
  }));
  persistInvites(useContactsStore.getState().invites);
  // Keep initiator stash until room session is persisted (reload reconnect).
  // Keys are wiped from the live map by deriveSessionConfig; disk stash stays
  // only as a last-resort re-handoff if session save failed.
  const saved = (
    await import("@/services/p2p/roomSessionStore")
  ).loadRoomSession(roomId);
  if (saved) {
    pendingPrivateKeys.delete(pending.handshake.inviteId);
    pendingPrivateKeys.delete(inviteId);
    removePendingInitiatorKey(pending.handshake.inviteId);
    removePendingInitiatorKey(inviteId);
  }
}

bindSmartMessageContacts({
  resolve: (contactId) => {
    const c = useContactsStore
      .getState()
      .contacts.find((x) => x.id === contactId);
    if (!c) return undefined;
    return {
      contactId: c.id,
      address: c.ccxAddress,
      paymentIdFrom: c.paymentIdFrom,
      paymentIdTo: c.paymentIdTo,
      alias: c.alias,
    };
  },
  list: () =>
    useContactsStore.getState().contacts.map((c) => ({
      contactId: c.id,
      address: c.ccxAddress,
      paymentIdFrom: c.paymentIdFrom,
      paymentIdTo: c.paymentIdTo,
      alias: c.alias,
    })),
});

export { generatePaymentId };
