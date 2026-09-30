import type { RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type SdkMessageRecord,
  withReceivedRecords,
  withSentRecords,
} from "@/services/conceal/sync/messages-store";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import { useSettingsStore } from "@/state/settingsStore";
import type { ChatMessage } from "@/types/models";
import type { ChatInviteHandshake } from "@/types/protocol";

let raw: RawWalletV1 = emptyRaw();

vi.mock("@/services/conceal/sync/runtime", () => ({
  getRuntime: () => ({
    get raw() {
      return raw;
    },
    set raw(v: RawWalletV1) {
      raw = v;
    },
    password: "test",
    state: {},
  }),
  persistRuntime: async () => undefined,
}));

import { ConcealSmartMessageAdapter } from "@/services/conceal/ConcealSmartMessageAdapter";
import { MockChatTransport } from "@/services/mock/MockChatTransport";
import {
  __resetHolepunchTransport,
  __setHolepunchSkipProof,
  getMessagesForRoom,
  HolepunchChatTransport,
  hydrateChatRoomsFromWallet,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import {
  encodeRelaySmartBody,
  parseChatSmartBody,
} from "@/services/protocol/SmartMessageProtocolAdapter";
import { useChatStore } from "@/state/chatStore";

function emptyRaw(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
}

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
  return { handshake, contract };
}

type SentFrame = { topicRef: string; roomId: string; payload: string };

/** One-peer backend that records every frame written to the bridge. */
function createRecordingBackend(): {
  backend: HolepunchSidecarBackend;
  frames: SentFrame[];
} {
  const frames: SentFrame[] = [];
  const peerCounts = new Map<string, number>();
  const peerHandlers = new Set<(topicRef: string, count: number) => void>();
  const backend: HolepunchSidecarBackend = {
    async ensureConnected() {},
    async join(topicRef) {
      peerCounts.set(topicRef, 1);
      for (const h of peerHandlers) h(topicRef, 1);
    },
    async leave(topicRef) {
      peerCounts.set(topicRef, 0);
    },
    sendFrame(topicRef, roomId, payload) {
      frames.push({ topicRef, roomId, payload });
    },
    getPeerCount(topicRef) {
      return peerCounts.get(topicRef) ?? 0;
    },
    onPeers(handler) {
      peerHandlers.add(handler);
      return () => {
        peerHandlers.delete(handler);
      };
    },
    onFrame() {
      return () => undefined;
    },
    onConnectionStatus() {
      return () => undefined;
    },
    close() {},
  };
  return { backend, frames };
}

function collect(roomId: string): ChatMessage[] {
  const seen: ChatMessage[] = [];
  HolepunchChatTransport.subscribe(roomId, (m) => seen.push({ ...m }));
  return seen;
}

function sdkRecord(
  id: string,
  body: string,
  direction: SdkMessageRecord["direction"],
): SdkMessageRecord {
  return {
    id,
    direction,
    counterpartyAddress: "ccxPeer",
    counterpartyName: "Peer",
    body,
    hasBody: true,
    paymentIdFrom: direction === "received" ? "pid-from" : null,
    paymentIdTo: direction === "sent" ? "pid-to" : null,
    timestamp: "2026-01-01T00:00:00.000Z",
    unread: false,
    blockHeight: 100,
    threadKey: "thread",
  };
}

describe("outbound status is sent, never delivered", () => {
  let recording: ReturnType<typeof createRecordingBackend>;

  beforeEach(() => {
    raw = emptyRaw();
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
    useSettingsStore.getState().setPrivacy({ localMessageRetention: true });
    useChatStore.setState({ rooms: [], messagesByRoom: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("live send marks sent once the frame is written to the bridge", async () => {
    const { contract } = await buildContract("room-live", "inv-live");
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");
    const seen = collect(room.id);

    const msg = await HolepunchChatTransport.sendMessage(room.id, "hi live");

    expect(recording.frames).toHaveLength(1);
    expect(recording.frames[0]?.topicRef).toBe(contract.transport.topicRef);
    expect(msg.channel).toBe("live");
    expect(msg.status).toBe("sent");
    expect(seen.map((m) => m.status)).toEqual(["sent"]);
  });

  it("live send with no topic throws and notifies no sent row", async () => {
    const { contract } = await buildContract("room-notopic", "inv-notopic");
    const room = await HolepunchChatTransport.connect({
      ...contract,
      transport: { ...contract.transport, topicRef: "" },
    });
    expect(room.lifecycleStatus).toBe("connected");
    const seen = collect(room.id);

    await expect(
      HolepunchChatTransport.sendMessage(room.id, "nowhere"),
    ).rejects.toThrow("Missing topic.");

    expect(recording.frames).toHaveLength(0);
    expect(seen.filter((m) => m.status === "sent")).toEqual([]);
    expect(getMessagesForRoom(room.id).some((m) => m.text === "nowhere")).toBe(
      false,
    );
  });

  it("relay broadcast marks sent after the broadcast is accepted", async () => {
    const relaySpy = vi
      .spyOn(ConcealSmartMessageAdapter, "sendChatRelay")
      .mockResolvedValue({ txHash: "relay-tx" });
    const room = await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId: "room-relay",
        roomKeyRef: "key:room-relay",
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
      },
    });
    const seen = collect(room.id);

    const msg = await HolepunchChatTransport.sendMessage(room.id, "via chain");

    expect(relaySpy).toHaveBeenCalledOnce();
    expect(msg.channel).toBe("relay");
    expect(msg.status).toBe("sent");
    expect(seen.map((m) => m.status)).toEqual(["sending", "sent"]);
  });

  it("restored relay rows: outbound sent, inbound delivered", () => {
    const roomId = "room-restore";
    const outText = "l1-out";
    const inText = "l1-in";
    const sentAt = 1_700_200_000;
    const outBody = encodeRelaySmartBody({
      type: "chat.relay",
      roomId,
      sentAt,
      text: outText,
    });
    const inBody = encodeRelaySmartBody({
      type: "chat.relay",
      roomId,
      sentAt: sentAt + 30,
      text: inText,
    });
    expect(parseChatSmartBody(outBody)?.action).toBe("relay");
    expect(parseChatSmartBody(inBody)?.action).toBe("relay");
    raw = withSentRecords(raw, [sdkRecord("tx-out", outBody, "sent")]);
    raw = withReceivedRecords(raw, [sdkRecord("tx-in", inBody, "received")]);

    hydrateChatRoomsFromWallet();

    const restored = getMessagesForRoom(roomId);
    const out = restored.find((m) => m.text === outText);
    const inbound = restored.find((m) => m.text === inText);
    expect(out?.direction).toBe("out");
    expect(out?.status).toBe("sent");
    expect(inbound?.direction).toBe("in");
    expect(inbound?.status).toBe("delivered");
  });

  it("chatStore edit and delete keep the local outbound row sent", async () => {
    const { contract } = await buildContract("room-edit", "inv-edit");
    const room = await HolepunchChatTransport.connect(contract);
    const store = useChatStore.getState();

    await store.send(room.id, "first");
    await store.send(room.id, "second");
    const [first, second] = useChatStore.getState().messagesByRoom[room.id]!;
    await store.editMessage(room.id, first!.id, "first edited");
    await store.deleteMessage(room.id, second!.id);

    const rows = useChatStore.getState().messagesByRoom[room.id]!;
    const edited = rows.find((m) => m.id === first!.id);
    const deleted = rows.find((m) => m.id === second!.id);
    expect(recording.frames).toHaveLength(4);
    expect(edited?.text).toBe("first edited");
    expect(edited?.status).toBe("sent");
    expect(deleted?.deletedAt).toBeTruthy();
    expect(deleted?.status).toBe("sent");
    expect(
      rows.some((m) => m.direction === "out" && m.status === "delivered"),
    ).toBe(false);
  });

  it("mock transport marks outbound sent, not delivered", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { contract } = await buildContract("room-mock", "inv-mock");
    const room = await MockChatTransport.connect(contract);

    const msg = await MockChatTransport.sendMessage(room.id, "mocked");

    expect(msg.direction).toBe("out");
    expect(msg.status).toBe("sent");
  });
});
