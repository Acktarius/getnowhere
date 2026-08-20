import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetHolepunchTransport,
  __setHolepunchSkipProof,
  HolepunchChatTransport,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { __clearRelationshipTopicEpochsForTests } from "@/services/p2p/relationshipTopicEpochStore";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import { deriveInviteSalt } from "@/services/protocol/ids";
import { buildProofAad } from "@/services/protocol/proofAad";
import {
  packCreateHandshake,
  unpackCreateHandshake,
} from "@/services/protocol/SmartMessageProtocolAdapter";
import type { ChatInviteHandshake, P2PSessionConfig } from "@/types/protocol";
import { CHAT_PROTOCOL_VERSION } from "@/types/protocol";

async function sealProofWire(
  session: P2PSessionConfig,
  kind: "proof" | "proof-ack",
): Promise<string> {
  const roomId = session.roomId;
  const envelope = {
    schemaVersion: 1 as const,
    messageId: `proof-test-${session.sendCounter}`,
    clientId: "system",
    sentAt: new Date().toISOString(),
    kind: "proof" as const,
    text: `${kind}:v1:${session.sessionId}`,
  };
  const sealed = await P2PEncryptionAdapter.seal({
    session,
    plaintext: new TextEncoder().encode(JSON.stringify(envelope)),
    aad: buildProofAad(roomId, session),
  });
  const wire = new Uint8Array(sealed.nonce.length + sealed.ciphertext.length);
  wire.set(sealed.nonce, 0);
  wire.set(sealed.ciphertext, sealed.nonce.length);
  return btoa(String.fromCharCode(...wire));
}

async function buildResponderV2Connect() {
  const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const relationshipId = "ab".repeat(32);
  const roomId = "01020304";
  const inviteId = "a1b2c3d4";
  const salt = await deriveInviteSalt(relationshipId, roomId, inviteId);
  const now = Math.floor(Date.now() / 1000);
  const handshake: ChatInviteHandshake = {
    protocolVersion: CHAT_PROTOCOL_VERSION,
    inviteId,
    relationshipId,
    roomId,
    topicEpoch: 0,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: alice.publicKeyHex,
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "22".repeat(8),
    nonceStrategy: "counter_from_seed",
    salt,
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: "44".repeat(8),
  };
  const parsed = unpackCreateHandshake(
    CHAT_PROTOCOL_VERSION,
    packCreateHandshake(handshake),
  )!;
  const register = {
    type: "chat.register" as const,
    inviteId,
    receiverEphemeralPublicKey: bob.publicKeyHex,
    replayId: handshake.replayId,
  };
  const hydrated = { ...parsed, relationshipId, salt };
  const initiatorSession = await SessionBootstrapAdapter.deriveSession({
    invite: hydrated,
    acceptance: register,
    peerRole: "initiator",
    localPrivateKeyRef: alice.privateKeyRef,
  });
  const responderSession = await SessionBootstrapAdapter.deriveSession({
    invite: hydrated,
    acceptance: register,
    peerRole: "responder",
    localPrivateKeyRef: bob.privateKeyRef,
  });
  const contract = await SessionBootstrapAdapter.buildHolepunchContract({
    session: responderSession,
    invite: hydrated,
    peerRole: "responder",
  });
  return { handshake: hydrated, initiatorSession, responderSession, contract };
}

/**
 * Simulates initiator proof arriving before the responder enters waitForProof().
 * Answers the responder's proof with a proof-ack so connect can finish.
 */
function createEarlyInitiatorProofBackend(
  initiatorSession: P2PSessionConfig,
): HolepunchSidecarBackend {
  type PeerHandler = (topicRef: string, count: number) => void;
  type FrameHandler = (msg: {
    topicRef: string;
    roomId: string;
    payload: string;
  }) => void;
  const peerHandlers = new Set<PeerHandler>();
  const frameHandlers = new Set<FrameHandler>();
  let topicRef = "";
  let roomId = "";
  let joined = false;
  let initiator = { ...initiatorSession };

  return {
    async ensureConnected() {},
    async join(tr, rid) {
      topicRef = tr;
      roomId = rid;
      const earlyProof = await sealProofWire(initiator, "proof");
      initiator = {
        ...initiator,
        sendCounter: initiator.sendCounter + 1,
      };
      for (const h of frameHandlers) {
        h({ topicRef, roomId, payload: earlyProof });
      }
      joined = true;
      for (const h of peerHandlers) h(topicRef, 1);
    },
    async leave() {
      joined = false;
      for (const h of peerHandlers) h(topicRef, 0);
    },
    sendFrame(_topicRef, _roomId, payload) {
      void (async () => {
        const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
        const opened = await P2PEncryptionAdapter.open({
          session: initiator,
          ciphertext: raw.slice(12),
          nonce: raw.slice(0, 12),
          aad: buildProofAad(roomId, initiator),
        });
        if (!opened) return;
        initiator = opened.session;
        const ack = await sealProofWire(initiator, "proof-ack");
        initiator = {
          ...initiator,
          sendCounter: initiator.sendCounter + 1,
        };
        for (const h of frameHandlers) {
          h({ topicRef, roomId, payload: ack });
        }
      })();
    },
    getPeerCount() {
      return joined ? 1 : 0;
    },
    onPeers(handler) {
      peerHandlers.add(handler);
      return () => peerHandlers.delete(handler);
    },
    onFrame(handler) {
      frameHandlers.add(handler);
      return () => frameHandlers.delete(handler);
    },
    onConnectionStatus() {
      return () => {};
    },
    close() {
      joined = false;
    },
  };
}

describe("v2 responder connect with early initiator proof", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
    __clearRelationshipTopicEpochsForTests();
    __setHolepunchSkipProof(false);
  });

  it("does not crypto_mismatch when proof arrives before waitForProof", async () => {
    const { handshake, initiatorSession, responderSession, contract } =
      await buildResponderV2Connect();
    __setHolepunchSidecarBackend(
      createEarlyInitiatorProofBackend(initiatorSession),
    );

    await HolepunchChatTransport.createRoom({
      contactId: "alice",
      bootstrap: {
        roomId: contract.roomId,
        roomKeyRef: responderSession.sessionId,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
        inviteId: handshake.inviteId,
        roomTtl: handshake.roomTtl,
      },
    });

    const result = await HolepunchChatTransport.connect(contract);
    expect(result.lastConnectError).not.toBe("crypto_mismatch");
    expect(result.lifecycleStatus).toBe("connected");
  });
});
