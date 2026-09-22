/**
 * SEC-2026-011: only the contact who owns the room may destroy it.
 * @see docs/security/p2pchatprotocol.md §10
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact, SmartMessageInvite } from "@/types/models";
import type { ChatRevokePayload } from "@/types/protocol";

const fetchIncomingRevokes = vi.hoisted(() =>
  vi.fn(async () => [] as unknown[]),
);

vi.mock("@/services", () => ({
  chatTransport: {
    leaveRoom: vi.fn(async () => undefined),
    createRoom: vi.fn(async () => ({})),
    getRoom: vi.fn(async () => undefined),
    connect: vi.fn(async () => ({})),
  },
  p2pEncryption: {
    restoreEphemeralPrivateKey: vi.fn(async () => ({ privateKeyRef: "ref" })),
  },
  relationshipService: {},
  sessionBootstrap: {},
  smartMessageProtocol: {},
  smartMessageService: {
    fetchIncomingRevokes: (...args: unknown[]) => fetchIncomingRevokes(...args),
    fetchIncomingMessages: async () => [],
    fetchIncomingRegisters: async () => [],
  },
  walletService: {},
}));

import { chatTransport } from "@/services";
import {
  peekCatalogRoom,
  removeCatalogRoom,
  upsertCatalogRoom,
} from "@/services/p2p/roomCatalogStore";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import { useContactsStore } from "@/state/contactsStore";

const ROOM = "01020304";
const INVITE = "a1b2c3d4";

function contact(id: string): Contact {
  return {
    id,
    alias: id,
    ccxAddress: `ccx7${id}`,
    paymentIdFrom: `${id}from`.padEnd(16, "a"),
    paymentIdTo: `${id}to`.padEnd(16, "b"),
    relationshipStatus: "eligible",
    inviteStatus: "accepted",
    chatStatus: "active",
    roomId: id === "c-alice" ? ROOM : undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function invite(): SmartMessageInvite {
  return {
    id: "inv-local",
    contactId: "c-alice",
    roomId: ROOM,
    inviteId: INVITE,
    replayId: "44".repeat(8),
    nonce: "n",
    expiry: "2026-12-31T00:00:00.000Z",
    inviteExpiry: 1_900_000_000,
    roomTtl: 1_900_000_000,
    senderAlias: "bob",
    capabilities: ["chat.v1"],
    status: "accepted",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function revoke(roomId: string | undefined): ChatRevokePayload {
  return {
    type: "chat.revoke",
    inviteId: INVITE,
    roomId,
    reasonCode: roomId ? "room_revoked" : "user_declined",
    topicEpoch: 3,
  };
}

beforeEach(() => {
  const mem = new Map<string, string>();
  setActiveStorageAdapter({
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, v);
    },
    removeItem: (k) => {
      mem.delete(k);
    },
  });
  removeCatalogRoom(ROOM);
  upsertCatalogRoom({
    id: ROOM,
    contactId: "c-alice",
    inviteId: INVITE,
    bootstrapSource: "conceal-smart-message",
    roomKeyRef: `key:${ROOM}`,
    lifecycleStatus: "connected",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  useContactsStore.setState({
    contacts: [contact("c-alice"), contact("c-bob")],
    invites: [invite()],
  });
  fetchIncomingRevokes.mockReset();
  vi.mocked(chatTransport.leaveRoom).mockClear();
});

describe("refreshInvites revoke counterpart", () => {
  it("ignores a revoke whose sender does not own the room", async () => {
    fetchIncomingRevokes.mockResolvedValue([
      { revoke: revoke(ROOM), txHash: "tx-bob", contactId: "c-bob" },
    ]);

    await useContactsStore.getState().refreshInvites();

    expect(peekCatalogRoom(ROOM)?.contactId).toBe("c-alice");
    expect(useContactsStore.getState().invites).toHaveLength(1);
    expect(chatTransport.leaveRoom).not.toHaveBeenCalled();
  });

  it("destroys the room when the owner sends room_revoked", async () => {
    fetchIncomingRevokes.mockResolvedValue([
      { revoke: revoke(ROOM), txHash: "tx-alice", contactId: "c-alice" },
    ]);

    await useContactsStore.getState().refreshInvites();

    expect(peekCatalogRoom(ROOM)).toBeUndefined();
    expect(useContactsStore.getState().invites).toHaveLength(0);
    expect(chatTransport.leaveRoom).toHaveBeenCalledWith(
      ROOM,
      expect.anything(),
    );
  });

  it("destroys on the owner's decline when the body has no roomId", async () => {
    fetchIncomingRevokes.mockResolvedValue([
      { revoke: revoke(undefined), txHash: "tx-decline", contactId: "c-alice" },
    ]);

    await useContactsStore.getState().refreshInvites();

    expect(peekCatalogRoom(ROOM)).toBeUndefined();
    expect(chatTransport.leaveRoom).toHaveBeenCalled();
  });
});
