/**
 * SEC-2026-013: a failed proof must not seal nonce 0 again on the next attempt.
 * @see docs/security/encryption.md
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetHolepunchTransport,
  __setHolepunchProofTimeoutMs,
  HolepunchChatTransport,
  persistSessionBeforeSeal,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  createAutoPeerSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { loadRoomSession } from "@/services/p2p/roomSessionStore";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import type {
  ChatInviteHandshake,
  HolepunchBootstrapContract,
} from "@/types/protocol";

const memory = new Map<string, string>();
const roomId = "room-nonce-013";

function nonceHex(payloadB64: string): string {
  const raw = Uint8Array.from(atob(payloadB64), (c) => c.charCodeAt(0));
  return [...raw.slice(0, 12)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function handshake(senderPublic: string): ChatInviteHandshake {
  const now = Math.floor(Date.now() / 1000);
  return {
    protocolVersion: 1,
    inviteId: `inv-${roomId}`,
    relationshipId: `rel-${roomId}`,
    roomId,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: senderPublic,
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "ab".repeat(8),
    nonceStrategy: "counter_from_seed",
    salt: "cd".repeat(16),
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: `replay-${roomId}`,
  };
}

async function deriveContract(
  alicePrivateHex: string,
  senderPublic: string,
  bobPublic: string,
): Promise<HolepunchBootstrapContract> {
  const restored =
    await P2PEncryptionAdapter.restoreEphemeralPrivateKey(alicePrivateHex);
  const invite = handshake(senderPublic);
  const session = await SessionBootstrapAdapter.deriveSession({
    invite,
    acceptance: {
      type: "chat.register",
      inviteId: invite.inviteId,
      receiverEphemeralPublicKey: bobPublic,
      replayId: invite.replayId,
    },
    peerRole: "initiator",
    localPrivateKeyRef: restored.privateKeyRef,
  });
  return SessionBootstrapAdapter.buildHolepunchContract({
    session,
    invite,
    peerRole: "initiator",
  });
}

describe("session counters do not rewind after a failed proof", () => {
  beforeEach(() => {
    memory.clear();
    setActiveStorageAdapter({
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => {
        memory.set(k, v);
      },
      removeItem: (k) => {
        memory.delete(k);
      },
    });
    __resetHolepunchTransport();
    __setHolepunchProofTimeoutMs(30);
  });

  it("seals the second proof under the next counter", async () => {
    const frames: string[] = [];
    const base = createAutoPeerSidecarBackend();
    const backend: HolepunchSidecarBackend = {
      ...base,
      sendFrame(topicRef, id, payload) {
        frames.push(payload);
        base.sendFrame(topicRef, id, payload);
      },
    };
    __setHolepunchSidecarBackend(backend);

    const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const first = await deriveContract(
      alice.privateKeyHex,
      alice.publicKeyHex,
      bob.publicKeyHex,
    );
    expect(first.sendCounter).toBe(0);
    expect(await persistSessionBeforeSeal("c1", first)).toBe(true);

    const failed = await HolepunchChatTransport.connect(first);
    expect(failed.lastConnectError).toBe("timeout");
    expect(loadRoomSession(roomId)?.sendCounter).toBe(1);
    expect(frames).toHaveLength(1);

    const second = await deriveContract(
      alice.privateKeyHex,
      alice.publicKeyHex,
      bob.publicKeyHex,
    );
    expect(second.sendCounter).toBe(0);

    await new Promise((r) => setTimeout(r, 1600));
    await HolepunchChatTransport.connect(second);

    expect(frames).toHaveLength(2);
    expect(nonceHex(frames[0])).not.toBe(nonceHex(frames[1]));
    expect(loadRoomSession(roomId)?.sendCounter).toBe(2);
  });
});
