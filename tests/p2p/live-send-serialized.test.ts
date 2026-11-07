import type { RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatAad, buildProofAad } from "@/services/protocol/proofAad";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import type {
  ChatContentEnvelopeV1,
  ChatInviteHandshake,
  P2PSessionConfig,
} from "@/types/protocol";

vi.mock("@/services/conceal/sync/runtime", () => ({
  getRuntime: () => ({
    raw: {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
    } satisfies RawWalletV1,
    password: "test",
    state: {},
  }),
  persistRuntime: async () => undefined,
}));

import {
  __resetHolepunchTransport,
  __setHolepunchSkipProof,
  getMessagesForRoom,
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
import {
  deriveFrameNonce,
  P2PEncryptionAdapter,
} from "@/services/p2p/P2PEncryptionAdapter";
import { loadRoomSession } from "@/services/p2p/roomSessionStore";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";

async function buildContract(roomId: string, inviteId: string) {
  const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const now = Math.floor(Date.now() / 1000);
  const handshake: ChatInviteHandshake = {
    protocolVersion: 1,
    inviteId,
    relationshipId: `rel-${roomId}`,
    roomId,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: alice.publicKeyHex,
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "ff".repeat(16),
    nonceStrategy: "counter_from_seed",
    salt: "11".repeat(16),
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: `replay-${inviteId}`,
  };
  const session = await SessionBootstrapAdapter.deriveSession({
    invite: handshake,
    acceptance: {
      type: "chat.register",
      inviteId,
      receiverEphemeralPublicKey: bob.publicKeyHex,
      replayId: handshake.replayId,
    },
    peerRole: "initiator",
    localPrivateKeyRef: alice.privateKeyRef,
  });
  const contract = await SessionBootstrapAdapter.buildHolepunchContract({
    session,
    invite: handshake,
    peerRole: "initiator",
  });
  return { session, contract };
}

/** One-peer backend: records outbound payloads and lets tests inject inbound frames. */
function createRecordingBackend(): {
  backend: HolepunchSidecarBackend;
  payloads: string[];
  injectFrame(roomId: string, payload: string): void;
} {
  const payloads: string[] = [];
  const peerCounts = new Map<string, number>();
  const frameHandlers = new Set<
    (msg: { topicRef: string; roomId: string; payload: string }) => void
  >();
  let joinedTopic = "";
  const backend: HolepunchSidecarBackend = {
    async ensureConnected() {},
    async join(topicRef) {
      joinedTopic = topicRef;
      peerCounts.set(topicRef, 1);
    },
    async leave(topicRef) {
      peerCounts.set(topicRef, 0);
    },
    sendFrame(_topicRef, _roomId, payload) {
      payloads.push(payload);
    },
    getPeerCount(topicRef) {
      return peerCounts.get(topicRef) ?? 0;
    },
    onPeers() {
      return () => undefined;
    },
    onFrame(handler) {
      frameHandlers.add(handler);
      return () => {
        frameHandlers.delete(handler);
      };
    },
    onConnectionStatus() {
      return () => undefined;
    },
    close() {},
  };
  return {
    backend,
    payloads,
    injectFrame(roomId, payload) {
      for (const h of frameHandlers)
        h({ topicRef: joinedTopic, roomId, payload });
    },
  };
}

/** Wire frame from the remote peer: a proof request (asks for a proof-ack) or a chat text. */
async function sealPeerFrame(
  local: P2PSessionConfig,
  kind: "proof" | "text" = "proof",
): Promise<{ payload: string }> {
  const peer: P2PSessionConfig = {
    ...local,
    sendKeyRef: local.recvKeyRef,
    recvKeyRef: local.sendKeyRef,
    sendCounter: 0,
  };
  const envelope = {
    schemaVersion: 1 as const,
    messageId: `peer-${kind}`,
    clientId: "system",
    sentAt: new Date().toISOString(),
    kind,
    text: kind === "proof" ? `proof:v1:${local.sessionId}` : "peer says hi",
  };
  const sealed = await P2PEncryptionAdapter.seal({
    session: peer,
    plaintext: new TextEncoder().encode(JSON.stringify(envelope)),
    aad:
      kind === "proof"
        ? buildProofAad(local.roomId, peer)
        : buildChatAad(local.roomId, peer),
  });
  return { payload: encodeLiveFrame(sealed.counter, sealed.ciphertext) };
}

function wireCounter(payload: string): number | undefined {
  return decodeLiveFrame(payload)?.counter;
}

function wireNonce(nonceSeed: string, payload: string): number[] {
  const counter = wireCounter(payload);
  if (counter === undefined) throw new Error("not a live frame");
  return Array.from(deriveFrameNonce(nonceSeed, counter));
}

function textEnvelope(text: string): ChatContentEnvelopeV1 {
  return {
    schemaVersion: 1,
    messageId: `m-${text}`,
    clientId: `c-${text}`,
    sentAt: new Date().toISOString(),
    kind: "text",
    text,
  };
}

describe("live sends are serialized per room", () => {
  let recording: ReturnType<typeof createRecordingBackend>;

  beforeEach(() => {
    __resetHolepunchTransport();
    __setHolepunchSkipProof(true);
    recording = createRecordingBackend();
    __setHolepunchSidecarBackend(recording.backend);
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("overlapping sends get distinct nonces and advance the stored counter by two", async () => {
    const { session, contract } = await buildContract("room-race", "inv-race");
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");
    const initialCounter = loadRoomSession(room.id)?.sendCounter;
    expect(initialCounter).toBeTypeOf("number");

    const first = HolepunchChatTransport.sendContent!(
      room.id,
      textEnvelope("one"),
    );
    const second = HolepunchChatTransport.sendContent!(
      room.id,
      textEnvelope("two"),
    );
    await Promise.all([first, second]);

    expect(recording.payloads).toHaveLength(2);
    const [counterA, counterB] = recording.payloads.map(wireCounter);
    expect(counterA).not.toBe(counterB);
    const [nonceA, nonceB] = recording.payloads.map((p) =>
      wireNonce(session.nonceSeed, p),
    );
    expect(nonceA).not.toEqual(nonceB);
    expect(loadRoomSession(room.id)?.sendCounter).toBe(
      (initialCounter as number) + 2,
    );
  });

  it("a failed send rejects its caller and does not block the next send", async () => {
    const { contract } = await buildContract("room-fail", "inv-fail");
    const room = await HolepunchChatTransport.connect(contract);
    const sendFrame = recording.backend.sendFrame;
    let calls = 0;
    recording.backend.sendFrame = (topicRef, roomId, payload) => {
      calls += 1;
      if (calls === 1) throw new Error("bridge down");
      sendFrame(topicRef, roomId, payload);
    };

    const failing = HolepunchChatTransport.sendContent!(
      room.id,
      textEnvelope("lost"),
    );
    const next = HolepunchChatTransport.sendContent!(
      room.id,
      textEnvelope("kept"),
    );

    await expect(failing).rejects.toThrow("bridge down");
    await expect(next).resolves.toMatchObject({ status: "sent" });
    expect(recording.payloads).toHaveLength(1);
  });

  it("proof-ack and content send overlapping get distinct nonces", async () => {
    const { session, contract } = await buildContract("room-ack", "inv-ack");
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");
    const stored = loadRoomSession(room.id);
    expect(stored).toBeDefined();
    const initialSend = stored?.sendCounter as number;
    const initialRecv = stored?.recvCounter as number;
    const peerRequest = await sealPeerFrame(session, "proof");

    const realSeal = P2PEncryptionAdapter.seal.bind(P2PEncryptionAdapter);
    vi.spyOn(P2PEncryptionAdapter, "seal").mockImplementationOnce(
      async (input) => {
        recording.injectFrame(room.id, peerRequest.payload);
        await vi.waitFor(() => {
          expect(loadRoomSession(room.id)?.recvCounter).toBeGreaterThan(
            initialRecv,
          );
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        return realSeal(input);
      },
    );

    await HolepunchChatTransport.sendContent!(room.id, textEnvelope("text"));
    await vi.waitFor(() => {
      expect(recording.payloads).toHaveLength(2);
    });

    const [counterA, counterB] = recording.payloads.map(wireCounter);
    expect(counterA).not.toBe(counterB);
    const [nonceA, nonceB] = recording.payloads.map((p) =>
      wireNonce(session.nonceSeed, p),
    );
    expect(nonceA).not.toEqual(nonceB);
    await vi.waitFor(() => {
      expect(loadRoomSession(room.id)?.sendCounter).toBe(initialSend + 2);
    });
  });

  it("inbound frame opened during a send does not roll back the send counter", async () => {
    const { session, contract } = await buildContract("room-open", "inv-open");
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");
    const initialSend = loadRoomSession(room.id)?.sendCounter;
    expect(initialSend).toBeTypeOf("number");
    const peerText = await sealPeerFrame(session, "text");

    const realOpen = P2PEncryptionAdapter.open.bind(P2PEncryptionAdapter);
    vi.spyOn(P2PEncryptionAdapter, "open").mockImplementationOnce(
      async (input) => {
        await HolepunchChatTransport.sendContent!(
          room.id,
          textEnvelope("during"),
        );
        return realOpen(input);
      },
    );
    recording.injectFrame(room.id, peerText.payload);
    await vi.waitFor(() => {
      expect(
        getMessagesForRoom(room.id).some((m) => m.direction === "in"),
      ).toBe(true);
    });
    await HolepunchChatTransport.sendContent!(room.id, textEnvelope("after"));

    expect(recording.payloads).toHaveLength(2);
    const expectedCounters = await Promise.all(
      recording.payloads.map(async (_, i) => {
        const { counter } = await P2PEncryptionAdapter.seal({
          session: { ...session, sendCounter: (initialSend as number) + i },
          plaintext: new Uint8Array(1),
          aad: new Uint8Array(0),
        });
        return counter;
      }),
    );
    expect(recording.payloads.map(wireCounter)).toEqual(expectedCounters);
    expect(loadRoomSession(room.id)?.sendCounter).toBe(
      (initialSend as number) + recording.payloads.length,
    );
  });
});
