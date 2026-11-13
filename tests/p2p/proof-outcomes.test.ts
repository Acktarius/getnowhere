import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetHolepunchTransport,
  __setHolepunchProofTimeoutMs,
  __setHolepunchSkipProof,
  HolepunchChatTransport,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import {
  decodeLiveFrame,
  encodeLiveFrame,
} from "@/services/p2p/liveFrameCodec";
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

/** Simulated initiator peer: seals frames with its own session and tracks counters. */
class Peer {
  constructor(public session: P2PSessionConfig) {}

  async seal(plaintext: string): Promise<string> {
    const sealed = await P2PEncryptionAdapter.seal({
      session: this.session,
      plaintext: new TextEncoder().encode(plaintext),
      aad: buildProofAad(this.session.roomId, this.session),
    });
    this.session = sealed.session;
    return encodeLiveFrame(sealed.counter, sealed.ciphertext);
  }

  sealProof(kind: "proof" | "proof-ack"): Promise<string> {
    return this.seal(
      JSON.stringify({
        schemaVersion: 1,
        messageId: `proof-test-${this.session.sendCounter}`,
        clientId: "system",
        sentAt: new Date().toISOString(),
        kind: "proof",
        text: `${kind}:v1:${this.session.sessionId}`,
      }),
    );
  }

  async opens(payload: string): Promise<boolean> {
    const frame = decodeLiveFrame(payload);
    if (!frame) return false;
    const opened = await P2PEncryptionAdapter.open({
      session: this.session,
      counter: frame.counter,
      ciphertext: frame.ciphertext,
      aad: buildProofAad(this.session.roomId, this.session),
    });
    if (opened) this.session = opened.session;
    return Boolean(opened);
  }
}

let roomSeq = 0;

/** Fresh roomId per test: the room session store is not reset between tests. */
async function buildResponderConnect() {
  const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const relationshipId = "ab".repeat(32);
  roomSeq += 1;
  const roomId = roomSeq.toString(16).padStart(8, "0");
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
  return { peer: new Peer(initiatorSession), contract };
}

type FrameHandler = (msg: {
  topicRef: string;
  roomId: string;
  payload: string;
}) => void;

/** Backend with one peer present; `onSend` sees every frame the transport writes. */
function createBackend(
  onSend: (payload: string, deliver: (p: string) => void) => void,
): HolepunchSidecarBackend & { deliver: (payload: string) => void } {
  const frameHandlers = new Set<FrameHandler>();
  let topicRef = "";
  let roomId = "";
  let joined = false;
  const deliver = (payload: string) => {
    for (const h of frameHandlers) h({ topicRef, roomId, payload });
  };
  return {
    deliver,
    async ensureConnected() {},
    async join(tr, rid) {
      topicRef = tr;
      roomId = rid;
      joined = true;
    },
    async leave() {
      joined = false;
    },
    sendFrame(_topicRef, _roomId, payload) {
      onSend(payload, deliver);
    },
    getPeerCount() {
      return joined ? 1 : 0;
    },
    onPeers() {
      return () => {};
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

/** Well-formed frame at `counter` whose tag cannot verify. */
function forgedFrame(counter: number): string {
  return encodeLiveFrame(counter, new Uint8Array(48).fill(7));
}

/** Let the serialized receive chain drain. */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 20));
}

describe("post-connect proof outcomes", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
    __clearRelationshipTopicEpochsForTests();
    __setHolepunchSkipProof(false);
    __setHolepunchProofTimeoutMs(150);
  });

  afterEach(() => {
    __setHolepunchProofTimeoutMs(null);
  });

  it("reports a local proof send failure as unreachable, not crypto_mismatch", async () => {
    const { contract } = await buildResponderConnect();
    __setHolepunchSidecarBackend(
      createBackend(() => {
        throw new Error("App access locked");
      }),
    );

    const result = await HolepunchChatTransport.connect(contract);

    expect(result.lifecycleStatus).toBe("connect_failed");
    expect(result.lastConnectError).toBe("unreachable");
  });

  it("answers a peer proof with proof-ack while still waiting", async () => {
    const { peer, contract } = await buildResponderConnect();
    const reader = new Peer({ ...peer.session });
    const outboundTexts: string[] = [];
    let answered = false;
    __setHolepunchSidecarBackend(
      createBackend((payload, deliver) => {
        void (async () => {
          const frame = decodeLiveFrame(payload);
          if (!frame) return;
          const opened = await P2PEncryptionAdapter.open({
            session: reader.session,
            counter: frame.counter,
            ciphertext: frame.ciphertext,
            aad: buildProofAad(reader.session.roomId, reader.session),
          });
          if (!opened) return;
          reader.session = opened.session;
          const text = JSON.parse(new TextDecoder().decode(opened.plaintext))
            .text as string;
          outboundTexts.push(text);
          if (answered || !text.startsWith("proof:v1:")) return;
          answered = true;
          deliver(await peer.sealProof("proof"));
        })();
      }),
    );

    const result = await HolepunchChatTransport.connect(contract);
    for (
      let i = 0;
      i < 20 && !outboundTexts.some((t) => t.startsWith("proof-ack:v1:"));
      i++
    ) {
      await flush();
    }

    expect(result.lifecycleStatus).toBe("connected");
    expect(outboundTexts.filter((t) => t.startsWith("proof-ack:v1:"))).toEqual([
      expect.stringMatching(/^proof-ack:v1:/),
    ]);
  });

  it("connects when a forged in-window frame arrives before the real ack", async () => {
    const { peer, contract } = await buildResponderConnect();
    __setHolepunchSidecarBackend(
      createBackend((payload, deliver) => {
        void (async () => {
          if (!(await peer.opens(payload))) return;
          deliver(forgedFrame(50));
          deliver(await peer.sealProof("proof-ack"));
        })();
      }),
    );

    const result = await HolepunchChatTransport.connect(contract);

    expect(result.lifecycleStatus).toBe("connected");
  });

  it("times out (retryable) when only a stale replay arrives", async () => {
    const { peer, contract } = await buildResponderConnect();
    __setHolepunchSidecarBackend(
      createBackend((_payload, deliver) => {
        void (async () => {
          const frame = await peer.seal("{}");
          deliver(frame);
          deliver(frame);
        })();
      }),
    );

    const result = await HolepunchChatTransport.connect(contract);

    expect(result.lastConnectError).toBe("timeout");
  });

  it("times out (retryable) when only a malformed frame arrives", async () => {
    const { contract } = await buildResponderConnect();
    __setHolepunchSidecarBackend(
      createBackend((_payload, deliver) => deliver("not-a-live-frame")),
    );

    const result = await HolepunchChatTransport.connect(contract);

    expect(result.lastConnectError).toBe("timeout");
  });

  it("reports crypto_mismatch when only an unauthentic in-window frame arrives", async () => {
    const { contract } = await buildResponderConnect();
    __setHolepunchSidecarBackend(
      createBackend((_payload, deliver) => deliver(forgedFrame(0))),
    );

    const result = await HolepunchChatTransport.connect(contract);

    expect(result.lifecycleStatus).toBe("connect_failed");
    expect(result.lastConnectError).toBe("crypto_mismatch");
  });

  it("does not carry an earlier attempt's forged frame into the retry", async () => {
    const { peer, contract } = await buildResponderConnect();
    let peerAnswers = false;
    __setHolepunchSidecarBackend(
      createBackend((payload, deliver) => {
        void (async () => {
          if (!peerAnswers) {
            deliver(forgedFrame(0));
            return;
          }
          if (await peer.opens(payload)) {
            deliver(await peer.sealProof("proof-ack"));
          }
        })();
      }),
    );
    const failed = await HolepunchChatTransport.connect(contract);
    expect(failed.lastConnectError).toBe("crypto_mismatch");

    peerAnswers = true;
    const retried = await HolepunchChatTransport.retryConnect(contract.roomId);

    expect(retried.lifecycleStatus).toBe("connected");
    expect(retried.lastConnectError).toBeUndefined();
  });

  it("relabels crypto_mismatch to timeout once a peer frame opens", async () => {
    const { peer, contract } = await buildResponderConnect();
    const backend = createBackend((_payload, deliver) =>
      deliver(forgedFrame(0)),
    );
    __setHolepunchSidecarBackend(backend);
    const failed = await HolepunchChatTransport.connect(contract);
    expect(failed.lastConnectError).toBe("crypto_mismatch");

    backend.deliver(await peer.seal("{}"));
    await flush();

    const room = await HolepunchChatTransport.getRoom(contract.roomId);
    expect(room?.lifecycleStatus).toBe("connect_failed");
    expect(room?.lastConnectError).toBe("timeout");
  });
});
