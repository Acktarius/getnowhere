/**
 * SEC-2026-008: accept / initiator handoff fail closed after inviteExpiry.
 * @see docs/security/p2pchatprotocol.md §7
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingInitiatorRecord } from "@/services/contacts/contactsPersistence";
import type { SmartMessageInvite } from "@/types/models";
import type { ChatInviteHandshake } from "@/types/protocol";
import { CHAT_PROTOCOL_VERSION } from "@/types/protocol";

const svc = vi.hoisted(() => ({
  generateEphemeralKeypair: vi.fn(),
  restoreEphemeralPrivateKey: vi.fn(async () => ({ privateKeyRef: "ref-a" })),
  deriveSession: vi.fn(),
  acceptInvite: vi.fn(),
  fetchIncomingMessages: vi.fn(async () => [] as SmartMessageInvite[]),
  fetchIncomingRegisters: vi.fn(async () => [] as unknown[]),
  getRoom: vi.fn(async () => undefined),
  pendingRecords: [] as PendingInitiatorRecord[],
}));

vi.mock("@/services", () => ({
  chatTransport: { getRoom: svc.getRoom },
  p2pEncryption: {
    generateEphemeralKeypair: svc.generateEphemeralKeypair,
    restoreEphemeralPrivateKey: svc.restoreEphemeralPrivateKey,
  },
  relationshipService: {},
  sessionBootstrap: { deriveSession: svc.deriveSession },
  smartMessageProtocol: {},
  smartMessageService: {
    acceptInvite: svc.acceptInvite,
    fetchIncomingMessages: svc.fetchIncomingMessages,
    fetchIncomingRegisters: svc.fetchIncomingRegisters,
  },
  walletService: {},
}));

vi.mock("@/services/conceal/walletSyncTip", () => ({
  isWalletNearTip: async () => true,
}));

vi.mock("@/services/contacts/contactsPersistence", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/services/contacts/contactsPersistence")
  >()),
  loadPendingInitiatorKeys: () => svc.pendingRecords,
  upsertPendingInitiatorKey: vi.fn(async () => undefined),
  removePendingInitiatorKey: vi.fn(async () => undefined),
  removePendingInitiatorKeysForRoom: vi.fn(async () => undefined),
}));

import { rememberHandshake } from "@/services/conceal/ConcealSmartMessageAdapter";
import { probeInitiatorHandoff, useContactsStore } from "@/state/contactsStore";

const now = Math.floor(Date.now() / 1000);

function handshake(inviteExpiry: number): ChatInviteHandshake {
  return {
    protocolVersion: CHAT_PROTOCOL_VERSION,
    inviteId: "a1b2c3d4",
    relationshipId: "ab".repeat(32),
    roomId: "01020304",
    topicEpoch: 0,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: "11".repeat(32),
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "22".repeat(8),
    nonceStrategy: "counter_from_seed",
    salt: "33".repeat(16),
    inviteExpiry,
    roomTtl: now + 86400,
    replayId: "44".repeat(8),
  };
}

function receivedInvite(hs: ChatInviteHandshake): SmartMessageInvite {
  return {
    id: "tx:create-1",
    contactId: "c1",
    roomId: hs.roomId,
    inviteId: hs.inviteId,
    replayId: hs.replayId,
    nonce: "n",
    expiry: new Date(hs.inviteExpiry * 1000).toISOString(),
    inviteExpiry: hs.inviteExpiry,
    roomTtl: hs.roomTtl,
    senderAlias: "Alice",
    capabilities: ["chat.v1"],
    status: "received",
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.pendingRecords = [];
  useContactsStore.setState({ contacts: [], invites: [] });
});

describe("contactsStore.acceptInvite expiry", () => {
  it("rejects an expired invite before generating keys or broadcasting", async () => {
    const hs = handshake(now - 3600);
    rememberHandshake(hs);
    const inv = receivedInvite(hs);
    useContactsStore.setState({ invites: [inv] });

    await expect(
      useContactsStore.getState().acceptInvite(inv.id),
    ).rejects.toThrow(/expired/i);
    expect(svc.generateEphemeralKeypair).not.toHaveBeenCalled();
    expect(svc.acceptInvite).not.toHaveBeenCalled();
  });
});

describe("initiator handoff expiry", () => {
  function seedInitiator(hs: ChatInviteHandshake) {
    svc.pendingRecords = [
      {
        inviteId: hs.inviteId,
        contactId: "c1",
        roomId: hs.roomId,
        privateKeyHex: "55".repeat(32),
        handshake: hs,
        peerRole: "initiator",
      },
    ];
  }

  const register = (hs: ChatInviteHandshake) => ({
    type: "chat.register" as const,
    inviteId: hs.inviteId,
    receiverEphemeralPublicKey: "66".repeat(32),
    replayId: hs.replayId,
    acceptedAt: new Date().toISOString(),
  });

  it("refuses a register sent after inviteExpiry", async () => {
    const hs = handshake(now - 3600);
    seedInitiator(hs);
    svc.fetchIncomingRegisters.mockResolvedValue([
      { register: register(hs), txHash: "tx-r", sentAtUnix: now },
    ]);

    const probe = await probeInitiatorHandoff(hs.roomId);

    expect(probe.handoffCompleted).toBe(false);
    expect(probe.detail).toMatch(/after invite expiry/i);
    expect(svc.deriveSession).not.toHaveBeenCalled();
  });

  it("does not reject a register sent before inviteExpiry that is scanned late", async () => {
    const hs = handshake(now - 3600);
    seedInitiator(hs);
    svc.deriveSession.mockRejectedValue(new Error("derive reached"));
    svc.fetchIncomingRegisters.mockResolvedValue([
      {
        register: register(hs),
        txHash: "tx-r",
        sentAtUnix: hs.inviteExpiry - 60,
      },
    ]);

    const probe = await probeInitiatorHandoff(hs.roomId);

    expect(svc.deriveSession).toHaveBeenCalled();
    expect(probe.detail).toBe("derive reached");
  });
});
