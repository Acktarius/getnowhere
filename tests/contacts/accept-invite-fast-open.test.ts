/**
 * Accept returns the room before the register broadcast; two wallet saves before connect.
 * @see openspec/changes/accept-invite-fast-open/design.md
 */
import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SmartMessageInvite } from "@/types/models";
import type { ChatInviteHandshake } from "@/types/protocol";
import { CHAT_PROTOCOL_VERSION } from "@/types/protocol";

type Deferred = {
  promise: Promise<{ roomId: string }>;
  resolve: (v: { roomId: string }) => void;
  reject: (e: Error) => void;
};

function deferred(): Deferred {
  let resolve!: Deferred["resolve"];
  let reject!: Deferred["reject"];
  const promise = new Promise<{ roomId: string }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const h = vi.hoisted(() => {
  const events: string[] = [];
  const raw = {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  } as unknown as RawWalletV1;
  const runtime = { raw, password: "test", state: {} };
  let keyCounter = 0;
  const persistRuntime = vi.fn(async () => {
    events.push("save");
  });
  return {
    events,
    runtime,
    revoked: new Set<string>(),
    persistRuntime,
    generateEphemeralKeypair: vi.fn(async () => {
      keyCounter += 1;
      const hex = keyCounter.toString(16).padStart(2, "0");
      return {
        publicKeyHex: hex.repeat(32),
        privateKeyHex: `f${hex}`.repeat(16).slice(0, 64),
        privateKeyRef: `priv-${keyCounter}`,
      };
    }),
    restoreEphemeralPrivateKey: vi.fn(async (hex: string) => ({
      privateKeyRef: `restored-${hex.slice(0, 4)}`,
    })),
    deriveSession: vi.fn(async () => ({ sessionId: "sess-1" })),
    buildHolepunchContract: vi.fn(
      async (input: { invite: { roomId: string } }) => ({
        roomId: input.invite.roomId,
        sessionId: "sess-1",
      }),
    ),
    broadcast: vi.fn(),
    createRoom: vi.fn(
      async (input: {
        contactId: string;
        bootstrap: { roomId: string; lifecycleStatus: string };
      }) => ({
        id: input.bootstrap.roomId,
        contactId: input.contactId,
        lifecycleStatus: input.bootstrap.lifecycleStatus,
        peerStatus: "offline",
      }),
    ),
    connect: vi.fn(),
    // Wallet mode: saves unless the caller defers the save.
    persistSessionBeforeSeal: vi.fn(
      async (
        _contactId: string,
        _contract: unknown,
        options?: { persistWallet?: boolean },
      ) => {
        if (options?.persistWallet !== false) await persistRuntime();
        return true;
      },
    ),
    flushPrefs: vi.fn(async () => {
      events.push("flushPrefs");
    }),
    prefFlushError: { current: null as Error | null },
    toastError: vi.fn(),
  };
});

vi.mock("@/services/conceal/sync/runtime", () => ({
  getRuntime: () => h.runtime,
  requireRuntime: () => h.runtime,
  persistRuntime: h.persistRuntime,
  pollMempoolRuntime: async () => false,
  syncRuntime: async () => 0,
  isSyncInProgress: () => false,
}));

vi.mock("@/services", () => ({
  chatTransport: {
    createRoom: h.createRoom,
    connect: h.connect,
    getRoom: vi.fn(async () => undefined),
  },
  p2pEncryption: {
    generateEphemeralKeypair: h.generateEphemeralKeypair,
    restoreEphemeralPrivateKey: h.restoreEphemeralPrivateKey,
  },
  relationshipService: {},
  sessionBootstrap: {
    deriveSession: h.deriveSession,
    buildHolepunchContract: h.buildHolepunchContract,
  },
  smartMessageProtocol: {
    composeRegister: vi.fn(
      async (input: {
        inviteId: string;
        receiverEphemeralPublicKey: string;
        replayId: string;
      }) => ({
        type: "chat.register",
        ...input,
        acceptedAt: "2026-11-24T00:00:00.000Z",
      }),
    ),
  },
  smartMessageService: {
    acceptInvite: h.broadcast,
    fetchIncomingMessages: vi.fn(async () => []),
    fetchIncomingRegisters: vi.fn(async () => []),
  },
  walletService: {},
}));

vi.mock("@/services/conceal/walletSyncTip", () => ({
  isWalletNearTip: async () => true,
}));

vi.mock("@/services/contacts/contactsPersistence", async (importOriginal) => {
  const real =
    await importOriginal<
      typeof import("@/services/contacts/contactsPersistence")
    >();
  return {
    ...real,
    persistInvites: (invites: SmartMessageInvite[]) => {
      h.events.push(`invites:${invites.map((i) => i.status).join(",")}`);
      real.persistInvites(invites);
    },
  };
});

vi.mock("@/services/p2p/HolepunchChatTransport", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/services/p2p/HolepunchChatTransport")
  >()),
  persistSessionBeforeSeal: h.persistSessionBeforeSeal,
}));

vi.mock("@/services/p2p/revokedRoomsStore", () => ({
  isRoomRevoked: (roomId: string) => h.revoked.has(roomId),
  isInviteRevoked: () => false,
  rememberRevokedRoom: (roomId: string) => h.revoked.add(roomId),
}));

vi.mock("@/services/storage/installMobileNativeStorage", () => ({
  getInstalledMobileStorageAdapter: () => ({
    flushPrefs: h.flushPrefs,
    lastPrefFlushError: () => h.prefFlushError.current,
  }),
}));

vi.mock("@/state/toastStore", () => ({
  toastError: h.toastError,
  toastInfo: vi.fn(),
}));

import { rememberHandshake } from "@/services/conceal/ConcealSmartMessageAdapter";
import {
  loadPendingInitiatorKeys,
  upsertPendingInitiatorKey,
} from "@/services/contacts/contactsPersistence";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import { useChatStore } from "@/state/chatStore";
import {
  completeResponderReconnect,
  probeInitiatorHandoff,
  useContactsStore,
} from "@/state/contactsStore";

const now = Math.floor(Date.now() / 1000);
let fixtureSeq = 0;

/** Fresh ids per test: the store keeps responder stashes in module memory. */
function seedInvite(status: SmartMessageInvite["status"] = "received") {
  fixtureSeq += 1;
  const seq = fixtureSeq.toString(16).padStart(8, "0");
  const hs: ChatInviteHandshake = {
    protocolVersion: CHAT_PROTOCOL_VERSION,
    inviteId: `a${seq.slice(1)}`,
    relationshipId: "ab".repeat(32),
    roomId: `b${seq.slice(1)}`,
    topicEpoch: 0,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: "11".repeat(32),
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "22".repeat(8),
    nonceStrategy: "counter_from_seed",
    salt: "33".repeat(16),
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: "44".repeat(8),
  };
  rememberHandshake(hs);
  const invite: SmartMessageInvite = {
    id: `tx:create-${seq}`,
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
    status,
    createdAt: new Date().toISOString(),
  };
  useContactsStore.setState({ invites: [invite] });
  return { hs, invite };
}

function chatRoom(roomId: string) {
  return useChatStore.getState().rooms.find((r) => r.id === roomId);
}

function storedInvite(id: string) {
  return useContactsStore.getState().invites.find((i) => i.id === id);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.events.length = 0;
  h.revoked.clear();
  h.prefFlushError.current = null;
  h.runtime.raw = {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  } as unknown as RawWalletV1;
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
  useContactsStore.setState({
    contacts: [],
    invites: [],
    acceptingInviteIds: [],
  });
  useChatStore.setState({ rooms: [] });
  h.connect.mockImplementation(async (contract: { roomId: string }) => {
    h.events.push("connect");
    return {
      id: contract.roomId,
      lifecycleStatus: "connecting",
      peerStatus: "connecting",
    };
  });
});

describe("accept flow", () => {
  it("returns roomId and a pending room while the broadcast is unresolved", async () => {
    const { invite } = seedInvite();
    const broadcast = deferred();
    h.broadcast.mockReturnValue(broadcast.promise);

    let result: { roomId: string } | undefined;
    void useContactsStore
      .getState()
      .acceptInvite(invite.id)
      .then((r) => {
        result = r;
      });

    await vi.waitFor(() => expect(result).toEqual({ roomId: invite.roomId }));
    expect(chatRoom(invite.roomId)?.lifecycleStatus).toBe("pending");
    expect(useContactsStore.getState().acceptingInviteIds).toEqual([
      invite.inviteId,
    ]);
    expect(storedInvite(invite.id)?.status).toBe("received");
    expect(h.connect).not.toHaveBeenCalled();
    broadcast.resolve({ roomId: invite.roomId });
    await vi.waitFor(() => expect(h.connect).toHaveBeenCalledOnce());
  });

  it("makes exactly two wallet saves before connect, broadcasting with deferPersist", async () => {
    const { invite } = seedInvite();
    const broadcast = deferred();
    h.broadcast.mockReturnValue(broadcast.promise);
    let savesAtConnect = -1;
    h.connect.mockImplementation(async (contract: { roomId: string }) => {
      savesAtConnect = h.persistRuntime.mock.calls.length;
      return { id: contract.roomId, lifecycleStatus: "connecting" };
    });

    await useContactsStore.getState().acceptInvite(invite.id);
    expect(h.persistRuntime).toHaveBeenCalledTimes(1);
    broadcast.resolve({ roomId: invite.roomId });

    await vi.waitFor(() => expect(h.connect).toHaveBeenCalledOnce());
    expect(savesAtConnect).toBe(2);
    expect(h.broadcast).toHaveBeenCalledOnce();
    expect(h.broadcast.mock.calls[0][2]).toEqual({ deferPersist: true });
    expect(h.persistSessionBeforeSeal).toHaveBeenCalledWith(
      invite.contactId,
      expect.anything(),
      { persistWallet: false },
    );
    expect(storedInvite(invite.id)?.status).toBe("accepted");
    expect(
      loadPendingInitiatorKeys().some((r) => r.inviteId === invite.inviteId),
    ).toBe(false);
  });

  it("persists the invite accepted and flushes prefs before save #2", async () => {
    const { invite } = seedInvite();
    h.broadcast.mockResolvedValue({ roomId: invite.roomId });

    await useContactsStore.getState().acceptInvite(invite.id);
    await vi.waitFor(() => expect(h.connect).toHaveBeenCalledOnce());

    const beforeConnect = h.events.slice(0, h.events.indexOf("connect"));
    const saves = beforeConnect
      .map((e, i) => (e === "save" ? i : -1))
      .filter((i) => i >= 0);
    expect(saves).toHaveLength(2);
    const acceptedWrite = h.events.indexOf("invites:accepted");
    expect(acceptedWrite).toBeGreaterThan(saves[0]);
    expect(acceptedWrite).toBeLessThan(saves[1]);
    const flush = h.events.indexOf("flushPrefs", acceptedWrite);
    expect(flush).toBeGreaterThan(acceptedWrite);
    expect(flush).toBeLessThan(saves[1]);
  });

  it("broadcast failure toasts and keeps invite received, stash and pending room", async () => {
    const { invite } = seedInvite();
    h.broadcast.mockRejectedValue(new Error("Send timed out."));

    await expect(
      useContactsStore.getState().acceptInvite(invite.id),
    ).resolves.toEqual({ roomId: invite.roomId });
    await vi.waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith("Send timed out."),
    );
    await vi.waitFor(() =>
      expect(useContactsStore.getState().acceptingInviteIds).toEqual([]),
    );

    expect(storedInvite(invite.id)?.status).toBe("received");
    expect(
      loadPendingInitiatorKeys().some(
        (r) => r.inviteId === invite.inviteId && r.peerRole === "responder",
      ),
    ).toBe(true);
    expect(chatRoom(invite.roomId)?.lifecycleStatus).toBe("pending");
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.persistRuntime).toHaveBeenCalledTimes(1);
  });

  it("retry after failure reuses the stashed reply key and register", async () => {
    const { invite } = seedInvite();
    h.broadcast.mockRejectedValueOnce(new Error("Send timed out."));
    h.broadcast.mockResolvedValueOnce({ roomId: invite.roomId });

    await useContactsStore.getState().acceptInvite(invite.id);
    await vi.waitFor(() =>
      expect(useContactsStore.getState().acceptingInviteIds).toEqual([]),
    );
    await useContactsStore.getState().acceptInvite(invite.id);
    await vi.waitFor(() => expect(h.connect).toHaveBeenCalledOnce());

    expect(h.generateEphemeralKeypair).toHaveBeenCalledOnce();
    const keypair = await h.generateEphemeralKeypair.mock.results[0].value;
    expect(h.broadcast).toHaveBeenCalledTimes(2);
    expect(h.broadcast.mock.calls[1][1]).toEqual(h.broadcast.mock.calls[0][1]);
    expect(h.broadcast.mock.calls[1][1].receiverEphemeralPublicKey).toBe(
      keypair.publicKeyHex,
    );
  });

  it("second accept while the broadcast is in flight sends one broadcast", async () => {
    const { invite } = seedInvite();
    const broadcast = deferred();
    h.broadcast.mockReturnValue(broadcast.promise);

    const first = await useContactsStore.getState().acceptInvite(invite.id);
    await vi.waitFor(() => expect(h.broadcast).toHaveBeenCalledOnce());
    const second = await useContactsStore.getState().acceptInvite(invite.id);
    await new Promise((r) => setTimeout(r, 0));

    expect(second).toEqual(first);
    expect(h.broadcast).toHaveBeenCalledOnce();
    expect(h.generateEphemeralKeypair).toHaveBeenCalledOnce();
    broadcast.resolve({ roomId: invite.roomId });
    await vi.waitFor(() => expect(h.connect).toHaveBeenCalledOnce());
  });

  it("revoked room after the broadcast still saves the wallet but skips connect", async () => {
    const { invite } = seedInvite();
    const broadcast = deferred();
    h.broadcast.mockReturnValue(broadcast.promise);

    await useContactsStore.getState().acceptInvite(invite.id);
    h.revoked.add(invite.roomId);
    broadcast.resolve({ roomId: invite.roomId });
    await vi.waitFor(() =>
      expect(useContactsStore.getState().acceptingInviteIds).toEqual([]),
    );

    expect(h.persistRuntime).toHaveBeenCalledTimes(2);
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.deriveSession).not.toHaveBeenCalled();
  });

  it("commit failure after the broadcast toasts, still saves the wallet and skips connect", async () => {
    const { invite } = seedInvite();
    h.broadcast.mockResolvedValue({ roomId: invite.roomId });
    h.persistSessionBeforeSeal.mockRejectedValueOnce(
      new Error("Session store down."),
    );

    await useContactsStore.getState().acceptInvite(invite.id);
    await vi.waitFor(() =>
      expect(useContactsStore.getState().acceptingInviteIds).toEqual([]),
    );

    expect(h.toastError).toHaveBeenCalledWith("Session store down.");
    expect(h.persistRuntime).toHaveBeenCalledTimes(2);
    expect(h.connect).not.toHaveBeenCalled();
  });

  it("mobile prefs flush failure toasts, still saves the wallet and skips connect", async () => {
    const { invite } = seedInvite();
    h.broadcast.mockImplementation(async () => {
      h.prefFlushError.current = new Error("Prefs write failed.");
      return { roomId: invite.roomId };
    });

    await useContactsStore.getState().acceptInvite(invite.id);
    await vi.waitFor(() =>
      expect(useContactsStore.getState().acceptingInviteIds).toEqual([]),
    );

    expect(h.toastError).toHaveBeenCalledWith("Prefs write failed.");
    expect(h.persistRuntime).toHaveBeenCalledTimes(2);
    expect(h.connect).not.toHaveBeenCalled();
  });

  it("failed save #1 rejects, releases the claim and the retry mints a new key", async () => {
    const { invite } = seedInvite();
    h.persistRuntime.mockRejectedValueOnce(new Error("Disk full."));

    await expect(
      useContactsStore.getState().acceptInvite(invite.id),
    ).rejects.toThrow("Disk full.");
    expect(useContactsStore.getState().acceptingInviteIds).toEqual([]);
    expect(
      loadPendingInitiatorKeys().some((r) => r.inviteId === invite.inviteId),
    ).toBe(false);
    expect(h.broadcast).not.toHaveBeenCalled();

    h.broadcast.mockResolvedValue({ roomId: invite.roomId });
    let savesAtConnect = -1;
    h.connect.mockImplementation(async (contract: { roomId: string }) => {
      savesAtConnect = h.persistRuntime.mock.calls.length;
      return { id: contract.roomId, lifecycleStatus: "connecting" };
    });
    await useContactsStore.getState().acceptInvite(invite.id);
    await vi.waitFor(() => expect(h.connect).toHaveBeenCalledOnce());

    expect(h.generateEphemeralKeypair).toHaveBeenCalledTimes(2);
    const second = await h.generateEphemeralKeypair.mock.results[1].value;
    expect(h.broadcast.mock.calls[0][1].receiverEphemeralPublicKey).toBe(
      second.publicKeyHex,
    );
    // Failed save #1, then save #1 and save #2 on the retry.
    expect(savesAtConnect).toBe(3);
  });

  it("accept on an already accepted invite neither stashes nor broadcasts", async () => {
    const { invite } = seedInvite("accepted");

    await expect(
      useContactsStore.getState().acceptInvite(invite.id),
    ).resolves.toEqual({ roomId: invite.roomId });

    expect(h.generateEphemeralKeypair).not.toHaveBeenCalled();
    expect(h.persistRuntime).not.toHaveBeenCalled();
    expect(h.broadcast).not.toHaveBeenCalled();
    expect(useContactsStore.getState().acceptingInviteIds).toEqual([]);
  });

  it("foreground failure after the stash releases the claim", async () => {
    const { invite } = seedInvite();
    h.createRoom.mockRejectedValueOnce(new Error("Room store down."));

    await expect(
      useContactsStore.getState().acceptInvite(invite.id),
    ).rejects.toThrow("Room store down.");

    expect(useContactsStore.getState().acceptingInviteIds).toEqual([]);
    expect(h.broadcast).not.toHaveBeenCalled();
  });
});

describe("reconnect guard", () => {
  async function seedResponderStash(hs: ChatInviteHandshake) {
    await upsertPendingInitiatorKey({
      inviteId: hs.inviteId,
      contactId: "c1",
      roomId: hs.roomId,
      privateKeyHex: "55".repeat(32),
      handshake: { ...hs, receiverEphemeralPublicKey: "66".repeat(32) },
      peerRole: "responder",
      register: {
        type: "chat.register",
        inviteId: hs.inviteId,
        receiverEphemeralPublicKey: "66".repeat(32),
        replayId: hs.replayId,
        acceptedAt: "2026-11-24T00:00:00.000Z",
      },
    });
    h.persistRuntime.mockClear();
  }

  it("returns false while the accept broadcast is in flight", async () => {
    const { invite } = seedInvite();
    const broadcast = deferred();
    h.broadcast.mockReturnValue(broadcast.promise);
    await useContactsStore.getState().acceptInvite(invite.id);
    const savesBefore = h.persistRuntime.mock.calls.length;

    await expect(completeResponderReconnect(invite.roomId)).resolves.toBe(
      false,
    );

    expect(h.deriveSession).not.toHaveBeenCalled();
    expect(h.persistRuntime).toHaveBeenCalledTimes(savesBefore);
    expect(h.connect).not.toHaveBeenCalled();
    broadcast.resolve({ roomId: invite.roomId });
    await vi.waitFor(() => expect(h.connect).toHaveBeenCalledOnce());
  });

  it("stash with a received invite does not derive", async () => {
    const { hs, invite } = seedInvite("received");
    await seedResponderStash(hs);

    await expect(completeResponderReconnect(invite.roomId)).resolves.toBe(
      false,
    );
    expect(h.deriveSession).not.toHaveBeenCalled();
    expect(h.connect).not.toHaveBeenCalled();
  });

  it("stash with an accepted invite derives and connects", async () => {
    const { hs, invite } = seedInvite("accepted");
    await seedResponderStash(hs);

    await completeResponderReconnect(invite.roomId);

    expect(h.deriveSession).toHaveBeenCalledOnce();
    expect(h.connect).toHaveBeenCalledOnce();
  });

  it("probe reports Sending accept while the broadcast is in flight", async () => {
    const { invite } = seedInvite();
    const broadcast = deferred();
    h.broadcast.mockReturnValue(broadcast.promise);
    await useContactsStore.getState().acceptInvite(invite.id);

    const probe = await probeInitiatorHandoff(invite.roomId);

    expect(probe.detail).toBe("Sending accept…");
    expect(probe.needsAccept).toBe(false);
    expect(h.deriveSession).not.toHaveBeenCalled();
    broadcast.resolve({ roomId: invite.roomId });
    await vi.waitFor(() => expect(h.connect).toHaveBeenCalledOnce());
  });

  it("probe asks to Accept again when the stash exists but the invite is still received", async () => {
    const { hs, invite } = seedInvite("received");
    await seedResponderStash(hs);

    const probe = await probeInitiatorHandoff(invite.roomId);

    expect(probe.role).toBe("responder");
    expect(probe.needsAccept).toBe(true);
    expect(probe.detail).toBe("Accept did not finish — tap Accept again.");
  });

  /** An older accepted invite listed first in the same room. */
  function seedOlderAcceptedInvite(invite: SmartMessageInvite) {
    const older: SmartMessageInvite = {
      ...invite,
      id: `${invite.id}-old`,
      inviteId: `c${invite.inviteId.slice(1)}`,
      status: "accepted",
    };
    useContactsStore.setState({ invites: [older, invite] });
  }

  it("in-flight check matches any invite in the room, not just the first", async () => {
    const { invite } = seedInvite();
    seedOlderAcceptedInvite(invite);
    const broadcast = deferred();
    h.broadcast.mockReturnValue(broadcast.promise);
    await useContactsStore.getState().acceptInvite(invite.id);

    await expect(completeResponderReconnect(invite.roomId)).resolves.toBe(
      false,
    );

    expect(h.deriveSession).not.toHaveBeenCalled();
    broadcast.resolve({ roomId: invite.roomId });
    await vi.waitFor(() => expect(h.connect).toHaveBeenCalledOnce());
  });

  it("stash trust uses the stash's own invite status", async () => {
    const { hs, invite } = seedInvite("received");
    seedOlderAcceptedInvite(invite);
    await seedResponderStash(hs);

    await expect(completeResponderReconnect(invite.roomId)).resolves.toBe(
      false,
    );
    expect(h.deriveSession).not.toHaveBeenCalled();
  });
});
