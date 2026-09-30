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

import { walletService } from "@/services";
import {
  __resetHolepunchTransport,
  __setHolepunchProofTimeoutMs,
  getLastLiveAtMs,
  getMessagesForRoom,
  getTopicRefForRoom,
  HolepunchChatTransport,
  LIVE_RESEND_GAP_MS,
  RECENT_LIVE_SEND_LIMIT,
  RECENT_LIVE_SEND_WINDOW_MS,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { removeCatalogRoom } from "@/services/p2p/roomCatalogStore";
import { loadRoomSession } from "@/services/p2p/roomSessionStore";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import { useWalletStore } from "@/state/walletStore";
import type { ChatMessage } from "@/types/models";

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
    nonceSeed: "ee".repeat(16),
    nonceStrategy: "counter_from_seed",
    salt: "22".repeat(16),
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

type OpenedFrame = { envelope: ChatContentEnvelopeV1; nonce: number[] };

function toWire(sealed: { nonce: Uint8Array; ciphertext: Uint8Array }): string {
  const wire = new Uint8Array(sealed.nonce.length + sealed.ciphertext.length);
  wire.set(sealed.nonce, 0);
  wire.set(sealed.ciphertext, sealed.nonce.length);
  return btoa(String.fromCharCode(...wire));
}

/**
 * Fake remote peer: records frames, opens them with the peer's receive key, and
 * answers proof requests with a proof-ack sealed from the peer's own session.
 */
function createPeer(local: P2PSessionConfig) {
  const sent: string[] = [];
  const sentAtMs: number[] = [];
  const peerCounts = new Map<string, number>();
  const peerHandlers = new Set<(topicRef: string, count: number) => void>();
  const frameHandlers = new Set<
    (msg: { topicRef: string; roomId: string; payload: string }) => void
  >();
  let joinedTopic = "";
  let peerSend: P2PSessionConfig = {
    ...local,
    sendKeyRef: local.recvKeyRef,
    recvKeyRef: local.sendKeyRef,
    sendCounter: 0,
    recvCounter: 0,
  };
  const control = {
    answerProofs: true,
    failNextSend: false,
    onSend: undefined as ((payload: string) => void) | undefined,
  };

  async function open(payload: string): Promise<OpenedFrame | null> {
    const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    const nonce = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    const recv = { ...peerSend, recvCounter: 0 };
    for (const aad of [
      buildChatAad(local.roomId, recv),
      buildProofAad(local.roomId, recv),
    ]) {
      const opened = await P2PEncryptionAdapter.open({
        session: recv,
        ciphertext,
        nonce,
        aad,
      });
      if (opened) {
        const envelope = JSON.parse(
          new TextDecoder().decode(opened.plaintext),
        ) as ChatContentEnvelopeV1;
        return { envelope, nonce: Array.from(nonce) };
      }
    }
    return null;
  }

  async function seal(
    envelope: ChatContentEnvelopeV1,
    aadKind: "chat" | "proof",
  ): Promise<string> {
    const aad =
      aadKind === "proof"
        ? buildProofAad(local.roomId, peerSend)
        : buildChatAad(local.roomId, peerSend);
    const sealed = await P2PEncryptionAdapter.seal({
      session: peerSend,
      plaintext: new TextEncoder().encode(JSON.stringify(envelope)),
      aad,
    });
    peerSend = { ...peerSend, sendCounter: sealed.session.sendCounter };
    return toWire(sealed);
  }

  function inject(roomId: string, payload: string): void {
    for (const h of frameHandlers)
      h({ topicRef: joinedTopic, roomId, payload });
  }

  async function answer(roomId: string, payload: string): Promise<void> {
    const opened = await open(payload);
    if (opened?.envelope.kind !== "proof") return;
    if (!opened.envelope.text?.startsWith("proof:v1:")) return;
    const ack = await seal(
      {
        schemaVersion: 1,
        messageId: `peer-ack-${peerSend.sendCounter}`,
        clientId: "system",
        sentAt: new Date().toISOString(),
        kind: "proof",
        text: `proof-ack:v1:${local.sessionId}`,
      },
      "proof",
    );
    inject(roomId, ack);
  }

  const backend: HolepunchSidecarBackend = {
    async ensureConnected() {},
    async join(topicRef) {
      joinedTopic = topicRef;
      peerCounts.set(topicRef, 1);
    },
    async leave(topicRef) {
      peerCounts.set(topicRef, 0);
    },
    sendFrame(_topicRef, roomId, payload) {
      if (control.failNextSend) {
        control.failNextSend = false;
        throw new Error("bridge down");
      }
      sent.push(payload);
      sentAtMs.push(Date.now());
      control.onSend?.(payload);
      if (control.answerProofs) {
        setTimeout(() => void answer(roomId, payload), 0);
      }
    },
    getPeerCount(topicRef) {
      return peerCounts.get(topicRef) ?? 0;
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
      return () => undefined;
    },
    close() {},
  };

  return {
    backend,
    sent,
    sentAtMs,
    control,
    open,
    seal,
    inject,
    setPeerCount(count: number): void {
      peerCounts.set(joinedTopic, count);
      for (const h of peerHandlers) h(joinedTopic, count);
    },
    /** Opened non-proof frames written at or after index `from`. */
    async contentFrames(from = 0): Promise<OpenedFrame[]> {
      const out: OpenedFrame[] = [];
      for (const p of sent.slice(from)) {
        const opened = await open(p);
        if (opened && opened.envelope.kind !== "proof") out.push(opened);
      }
      return out;
    },
  };
}

type Peer = ReturnType<typeof createPeer>;

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

async function lifecycleOf(roomId: string): Promise<string | undefined> {
  return (await HolepunchChatTransport.getRoom(roomId))?.lifecycleStatus;
}

/** Peer drops and returns; resolves once the room is proven again. */
async function flapAndReconnect(peer: Peer, roomId: string): Promise<number> {
  const mark = peer.sent.length;
  peer.setPeerCount(0);
  expect(await lifecycleOf(roomId)).toBe("connecting");
  peer.setPeerCount(1);
  await vi.waitFor(async () => {
    expect(await lifecycleOf(roomId)).toBe("connected");
  });
  return mark;
}

const replayTimeout = (entries: number) => ({
  timeout: entries * LIVE_RESEND_GAP_MS + 2_000,
});

/** Wait until the replay window after `mark` holds `count` content frames. */
async function waitForReplayed(
  peer: Peer,
  mark: number,
  count: number,
): Promise<OpenedFrame[]> {
  await vi.waitFor(async () => {
    expect((await peer.contentFrames(mark)).length).toBe(count);
  }, replayTimeout(count));
  return peer.contentFrames(mark);
}

async function connectRoom(roomId: string) {
  const { session, contract } = await buildContract(roomId, `inv-${roomId}`);
  const peer = createPeer(session);
  __setHolepunchSidecarBackend(peer.backend);
  const room = await HolepunchChatTransport.connect(contract);
  expect(room.lifecycleStatus).toBe("connected");
  return { peer, session, room };
}

describe("recent live sends are replayed after a proven reconnect", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
    __setHolepunchProofTimeoutMs(300);
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

  it("re-seals the most recent sends oldest first with fresh nonces", async () => {
    const { peer, room } = await connectRoom("room-replay");
    const texts = Array.from(
      { length: RECENT_LIVE_SEND_LIMIT + 1 },
      (_, i) => `t${i}`,
    );
    for (const t of texts) {
      await HolepunchChatTransport.sendContent!(room.id, textEnvelope(t));
    }
    const originals = await peer.contentFrames();
    expect(originals.map((f) => f.envelope.text)).toEqual(texts);

    const mark = await flapAndReconnect(peer, room.id);
    const expected = texts.slice(-RECENT_LIVE_SEND_LIMIT);
    const replayed = await waitForReplayed(peer, mark, expected.length);

    expect(replayed.map((f) => f.envelope.text)).toEqual(expected);
    expect(replayed.map((f) => f.envelope.messageId)).toEqual(
      expected.map((t) => textEnvelope(t).messageId),
    );
    const originalNonces = originals.map((f) => f.nonce.join(","));
    for (const f of replayed) {
      expect(originalNonces).not.toContain(f.nonce.join(","));
    }
    await new Promise((r) => setTimeout(r, LIVE_RESEND_GAP_MS * 2));
    expect(await peer.contentFrames(mark)).toHaveLength(expected.length);
  });

  it("spaces replayed frames by the resend gap", async () => {
    const { peer, room } = await connectRoom("room-gap");
    const texts = ["g0", "g1"];
    for (const t of texts) {
      await HolepunchChatTransport.sendContent!(room.id, textEnvelope(t));
    }
    const mark = await flapAndReconnect(peer, room.id);
    await waitForReplayed(peer, mark, texts.length);

    const times: number[] = [];
    for (let i = mark; i < peer.sent.length; i++) {
      const opened = await peer.open(peer.sent[i] as string);
      if (opened && opened.envelope.kind !== "proof") {
        times.push(peer.sentAtMs[i] as number);
      }
    }
    expect(times).toHaveLength(texts.length);
    expect((times[1] as number) - (times[0] as number)).toBeGreaterThanOrEqual(
      LIVE_RESEND_GAP_MS - 5,
    );
  });

  it("does not keep a send that failed", async () => {
    const { peer, room } = await connectRoom("room-failed");
    peer.control.failNextSend = true;
    await expect(
      HolepunchChatTransport.sendContent!(room.id, textEnvelope("lost")),
    ).rejects.toThrow("bridge down");
    await HolepunchChatTransport.sendContent!(room.id, textEnvelope("kept"));

    const mark = await flapAndReconnect(peer, room.id);
    const replayed = await waitForReplayed(peer, mark, 1);
    await new Promise((r) => setTimeout(r, LIVE_RESEND_GAP_MS * 2));

    expect(
      (await peer.contentFrames(mark)).map((f) => f.envelope.text),
    ).toEqual(["kept"]);
    expect(replayed).toHaveLength(1);
  });

  it("skips an entry older than the replay window", async () => {
    const { peer, room } = await connectRoom("room-expiry");
    const realNow = Date.now.bind(Date);
    let offsetMs = 0;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + offsetMs);

    await HolepunchChatTransport.sendContent!(room.id, textEnvelope("old"));
    offsetMs = RECENT_LIVE_SEND_WINDOW_MS + 1;
    await HolepunchChatTransport.sendContent!(room.id, textEnvelope("fresh"));

    const mark = await flapAndReconnect(peer, room.id);
    await waitForReplayed(peer, mark, 1);
    await new Promise((r) => setTimeout(r, LIVE_RESEND_GAP_MS * 2));

    expect(
      (await peer.contentFrames(mark)).map((f) => f.envelope.text),
    ).toEqual(["fresh"]);
  });

  it("does not replay when the reconnect proof times out", async () => {
    const { peer, room } = await connectRoom("room-noproof");
    await HolepunchChatTransport.sendContent!(room.id, textEnvelope("held"));
    peer.control.answerProofs = false;

    const mark = peer.sent.length;
    peer.setPeerCount(0);
    peer.setPeerCount(1);
    await vi.waitFor(async () => {
      expect(await lifecycleOf(room.id)).toBe("connect_failed");
    });
    await new Promise((r) => setTimeout(r, LIVE_RESEND_GAP_MS * 2));

    expect(peer.sent.length).toBeGreaterThan(mark);
    expect(await peer.contentFrames(mark)).toEqual([]);
  });

  it("keeps the later local edit on the sender during and after replay", async () => {
    const { peer, room } = await connectRoom("room-edit");
    const original = textEnvelope("orig");
    await HolepunchChatTransport.sendContent!(room.id, original);
    await HolepunchChatTransport.sendContent!(room.id, {
      schemaVersion: 1,
      messageId: "e-orig",
      clientId: "c-e-orig",
      sentAt: new Date().toISOString(),
      kind: "edit",
      targetMessageId: original.messageId,
      text: "edited",
    });
    const rowText = () =>
      getMessagesForRoom(room.id).find((m) => m.id === original.messageId)
        ?.text;
    expect(rowText()).toBe("edited");
    const seen: ChatMessage[] = [];
    HolepunchChatTransport.subscribe(room.id, (m) => seen.push(m));

    const mark = await flapAndReconnect(peer, room.id);
    await waitForReplayed(peer, mark, 1);
    expect(rowText()).toBe("edited");
    const replayed = await waitForReplayed(peer, mark, 2);

    expect(replayed.map((f) => f.envelope.messageId)).toEqual([
      original.messageId,
      "e-orig",
    ]);
    expect(rowText()).toBe("edited");
    expect(seen).toEqual([]);
  });

  it("runs one replay batch at a time", async () => {
    const { peer, room } = await connectRoom("room-single");
    const texts = ["s0", "s1"];
    for (const t of texts) {
      await HolepunchChatTransport.sendContent!(room.id, textEnvelope(t));
    }
    const mark = await flapAndReconnect(peer, room.id);
    await waitForReplayed(peer, mark, 1);
    await flapAndReconnect(peer, room.id);
    await new Promise((r) => setTimeout(r, LIVE_RESEND_GAP_MS * 3));

    const ids = (await peer.contentFrames(mark)).map(
      (f) => f.envelope.messageId,
    );
    expect(ids).toEqual(texts.map((t) => textEnvelope(t).messageId));
  });

  it("stops replaying once the room leaves connected", async () => {
    const { peer, room } = await connectRoom("room-stop");
    const texts = ["x0", "x1"];
    for (const t of texts) {
      await HolepunchChatTransport.sendContent!(room.id, textEnvelope(t));
    }
    const mark = await flapAndReconnect(peer, room.id);
    await waitForReplayed(peer, mark, 1);
    peer.setPeerCount(0);
    await new Promise((r) => setTimeout(r, LIVE_RESEND_GAP_MS * 2));

    expect(
      (await peer.contentFrames(mark)).map((f) => f.envelope.text),
    ).toEqual(texts.slice(0, 1));
  });

  it("replays a re-sent message id once", async () => {
    const { peer, room } = await connectRoom("room-dedupe");
    const first = textEnvelope("dup");
    await HolepunchChatTransport.sendContent!(room.id, first);
    await HolepunchChatTransport.sendContent!(room.id, textEnvelope("other"));
    await HolepunchChatTransport.sendContent!(room.id, first);

    const mark = await flapAndReconnect(peer, room.id);
    await waitForReplayed(peer, mark, 2);
    await new Promise((r) => setTimeout(r, LIVE_RESEND_GAP_MS * 2));

    const ids = (await peer.contentFrames(mark)).map(
      (f) => f.envelope.messageId,
    );
    expect(ids.filter((id) => id === first.messageId)).toHaveLength(1);
    expect(ids).toHaveLength(2);
  });
});

describe("replay list lifetime", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
    __setHolepunchProofTimeoutMs(300);
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

  /** Hold the next seal until `release` is called. */
  function holdNextSeal(): { started: Promise<void>; release: () => void } {
    const realSeal = P2PEncryptionAdapter.seal.bind(P2PEncryptionAdapter);
    const hooks: { markStarted?: () => void; release?: () => void } = {};
    const started = new Promise<void>((r) => {
      hooks.markStarted = r;
    });
    const gate = new Promise<void>((r) => {
      hooks.release = r;
    });
    vi.spyOn(P2PEncryptionAdapter, "seal").mockImplementationOnce(
      async (input) => {
        hooks.markStarted?.();
        await gate;
        return realSeal(input);
      },
    );
    return { started, release: () => hooks.release?.() };
  }

  it("wallet lock clears the replay list", async () => {
    const { peer, room } = await connectRoom("room-lock");
    await HolepunchChatTransport.sendContent!(room.id, textEnvelope("secret"));
    vi.spyOn(walletService, "lockWallet").mockResolvedValue(undefined);
    await useWalletStore.getState().lock();

    const mark = await flapAndReconnect(peer, room.id);
    await new Promise((r) => setTimeout(r, LIVE_RESEND_GAP_MS * 2));

    expect(await peer.contentFrames(mark)).toEqual([]);
  });

  it("wallet lock stops a replay batch already running", async () => {
    const { peer, room } = await connectRoom("room-lock-mid");
    const texts = ["k0", "k1"];
    for (const t of texts) {
      await HolepunchChatTransport.sendContent!(room.id, textEnvelope(t));
    }
    const mark = await flapAndReconnect(peer, room.id);
    await waitForReplayed(peer, mark, 1);
    vi.spyOn(walletService, "lockWallet").mockResolvedValue(undefined);
    await useWalletStore.getState().lock();
    await new Promise((r) => setTimeout(r, LIVE_RESEND_GAP_MS * 2));

    expect(
      (await peer.contentFrames(mark)).map((f) => f.envelope.text),
    ).toEqual(texts.slice(0, 1));
  });

  it("listRooms prune clears the replay list", async () => {
    const { session, contract } = await buildContract(
      "room-prune",
      "inv-room-prune",
    );
    const peer = createPeer(session);
    __setHolepunchSidecarBackend(peer.backend);
    const room = await HolepunchChatTransport.connect(contract);
    await HolepunchChatTransport.sendContent!(room.id, textEnvelope("pruned"));
    removeCatalogRoom(room.id);
    const listed = await HolepunchChatTransport.listRooms();
    expect(listed.map((r) => r.id)).not.toContain(room.id);

    const mark = peer.sent.length;
    const again = await HolepunchChatTransport.connect(contract);
    expect(again.lifecycleStatus).toBe("connected");
    await new Promise((r) => setTimeout(r, LIVE_RESEND_GAP_MS * 2));

    expect(await peer.contentFrames(mark)).toEqual([]);
  });

  it("leaveRoom drops a queued live send and the room stays gone", async () => {
    const { peer, room } = await connectRoom("room-leave");
    const held = holdNextSeal();
    const inFlight = HolepunchChatTransport.sendContent!(
      room.id,
      textEnvelope("inflight"),
    );
    await held.started;
    const queued = HolepunchChatTransport.sendContent!(
      room.id,
      textEnvelope("queued"),
    );
    await HolepunchChatTransport.leaveRoom(room.id, { skipEpochBump: true });
    held.release();
    await Promise.allSettled([inFlight, queued]);

    await expect(queued).rejects.toThrow();
    const texts = (await peer.contentFrames()).map((f) => f.envelope.text);
    expect(texts).not.toContain("queued");
    expect(getTopicRefForRoom(room.id)).toBeUndefined();
  });

  it("leaveRoom drops a queued proof-ack and the room stays gone", async () => {
    const { peer, session, room } = await connectRoom("room-leave-ack");
    const recvBefore = loadRoomSession(room.id)?.recvCounter ?? 0;
    const held = holdNextSeal();
    const inFlight = HolepunchChatTransport.sendContent!(
      room.id,
      textEnvelope("inflight"),
    );
    await held.started;
    const mark = peer.sent.length;
    peer.inject(
      room.id,
      await peer.seal(
        {
          schemaVersion: 1,
          messageId: "peer-proof",
          clientId: "system",
          sentAt: new Date().toISOString(),
          kind: "proof",
          text: `proof:v1:${session.sessionId}`,
        },
        "proof",
      ),
    );
    await vi.waitFor(() => {
      expect(loadRoomSession(room.id)?.recvCounter).toBeGreaterThan(recvBefore);
    });
    await HolepunchChatTransport.leaveRoom(room.id, { skipEpochBump: true });
    held.release();
    await Promise.allSettled([inFlight]);
    await new Promise((r) => setTimeout(r, 50));

    const proofs: string[] = [];
    for (const p of peer.sent.slice(mark)) {
      const opened = await peer.open(p);
      if (opened?.envelope.kind === "proof") {
        proofs.push(opened.envelope.text ?? "");
      }
    }
    expect(proofs).toEqual([]);
    expect(getTopicRefForRoom(room.id)).toBeUndefined();
  });
});

describe("receiver", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
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

  it("repeated message id is dropped without notifying subscribers", async () => {
    const { peer, room } = await connectRoom("room-dup-in");
    const seen: ChatMessage[] = [];
    HolepunchChatTransport.subscribe(room.id, (m) => seen.push(m));
    const repeated = textEnvelope("once");
    const later = textEnvelope("later");

    peer.inject(room.id, await peer.seal(repeated, "chat"));
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    const realNow = Date.now.bind(Date);
    const repeatAtMs = realNow() + 60_000;
    vi.spyOn(Date, "now").mockReturnValue(repeatAtMs);
    peer.inject(room.id, await peer.seal(repeated, "chat"));
    await vi.waitFor(() => expect(getLastLiveAtMs(room.id)).toBe(repeatAtMs));
    vi.restoreAllMocks();
    peer.inject(room.id, await peer.seal(later, "chat"));
    await vi.waitFor(() => expect(seen).toHaveLength(2));

    expect(seen.map((m) => m.id)).toEqual([
      repeated.messageId,
      later.messageId,
    ]);
    const rows = getMessagesForRoom(room.id).filter(
      (m) => m.id === repeated.messageId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.direction).toBe("in");
  });
});
