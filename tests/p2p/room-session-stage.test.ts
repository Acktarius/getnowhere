/**
 * `persistWallet: false` stages a room session in `rt.raw` without a wallet save.
 * @see docs/security/encryption.md
 */
import type { RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type MobilePrefsBackend,
  toNamespacedPrefKey,
} from "@/services/storage/adapters/mobileNativeStorageAdapter";
import type {
  ChatInviteHandshake,
  HolepunchBootstrapContract,
} from "@/types/protocol";

type RawWithSessions = RawWalletV1 & { roomSessions?: Record<string, unknown> };

const persistRuntime = vi.fn(async () => undefined);
const rt: { raw: RawWithSessions; password: string; state: object } = {
  raw: emptyRaw(),
  password: "test",
  state: {},
};

vi.mock("@/services/conceal/sync/runtime", () => ({
  getRuntime: () => rt,
  persistRuntime: (...args: unknown[]) => persistRuntime(...args),
}));

const SESSIONS_KEY = "gnh.roomSessions";

function emptyRaw(): RawWithSessions {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
}

function sessionRow(roomId: string) {
  return {
    roomId,
    contactId: `contact-${roomId}`,
    contract: {} as HolepunchBootstrapContract,
    sendKeyHex: "aa".repeat(32),
    recvKeyHex: "bb".repeat(32),
    sendCounter: 3,
    recvCounter: 1,
    savedAt: new Date().toISOString(),
  };
}

function installDesktopBridge(
  load: { mode: "os"; json: string | null } | { mode: "wallet" },
  saveReply: { mode: "os" } | { mode: "wallet" },
) {
  const saveRoomSessions = vi.fn(async (_json: string) => saveReply);
  window.gnhDesktop = {
    ...window.gnhDesktop,
    loadRoomSessions: async () => load,
    saveRoomSessions,
  } as GnhDesktopBridge;
  return saveRoomSessions;
}

function recordingPrefs(): MobilePrefsBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value) {
      await new Promise((r) => setTimeout(r, 0));
      store.set(key, value);
    },
    async remove(key) {
      store.delete(key);
    },
  };
}

async function deriveContract(
  roomId: string,
): Promise<HolepunchBootstrapContract> {
  const { P2PEncryptionAdapter } = await import(
    "@/services/p2p/P2PEncryptionAdapter"
  );
  const { SessionBootstrapAdapter } = await import(
    "@/services/p2p/sessionBootstrap"
  );
  const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const now = Math.floor(Date.now() / 1000);
  const invite: ChatInviteHandshake = {
    protocolVersion: 1,
    inviteId: `inv-${roomId}`,
    relationshipId: `rel-${roomId}`,
    roomId,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: alice.publicKeyHex,
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "ab".repeat(8),
    nonceStrategy: "counter_from_seed",
    salt: "cd".repeat(16),
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: `replay-${roomId}`,
  };
  const session = await SessionBootstrapAdapter.deriveSession({
    invite,
    acceptance: {
      type: "chat.register",
      inviteId: invite.inviteId,
      receiverEphemeralPublicKey: bob.publicKeyHex,
      replayId: invite.replayId,
    },
    peerRole: "initiator",
    localPrivateKeyRef: alice.privateKeyRef,
  });
  return SessionBootstrapAdapter.buildHolepunchContract({
    session,
    invite,
    peerRole: "initiator",
  });
}

describe("saveRoomSession with persistWallet: false", () => {
  beforeEach(() => {
    vi.resetModules();
    rt.raw = emptyRaw();
    persistRuntime.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    delete (window as { gnhDesktop?: unknown }).gnhDesktop;
  });

  it("wallet mode stages the row in rt.raw without persistRuntime", async () => {
    installDesktopBridge({ mode: "wallet" }, { mode: "wallet" });
    const store = await import("@/services/p2p/roomSessionStore");
    await store.hydrateRoomSessions();
    const row = sessionRow("room-stage-wallet");

    await store.saveRoomSession(row, { persistWallet: false });

    expect(rt.raw.roomSessions?.[row.roomId]).toMatchObject({
      roomId: row.roomId,
      sendCounter: row.sendCounter,
    });
    expect(store.loadRoomSession(row.roomId)?.roomId).toBe(row.roomId);
    expect(persistRuntime).not.toHaveBeenCalled();
  });

  it("wallet mode default still persists the wallet once", async () => {
    installDesktopBridge({ mode: "wallet" }, { mode: "wallet" });
    const store = await import("@/services/p2p/roomSessionStore");
    await store.hydrateRoomSessions();
    const row = sessionRow("room-stage-wallet-default");

    await store.saveRoomSession(row);

    expect(rt.raw.roomSessions?.[row.roomId]).toBeDefined();
    expect(persistRuntime).toHaveBeenCalledTimes(1);
  });

  it("storage mode writes storage and flushes mobile prefs", async () => {
    const { installMobileNativeStorageAdapter } = await import(
      "@/services/storage/installMobileNativeStorage"
    );
    const prefs = recordingPrefs();
    await installMobileNativeStorageAdapter({
      isMobile: true,
      backends: {
        prefs,
        walletFile: {
          async exists() {
            return { ok: true, exists: false };
          },
          async read() {
            return { ok: false, reason: "io-error" };
          },
          async write() {},
          async remove() {},
        },
      },
    });
    const store = await import("@/services/p2p/roomSessionStore");
    const row = sessionRow("room-stage-storage");

    await store.saveRoomSession(row, { persistWallet: false });

    const flushed = JSON.parse(
      prefs.store.get(toNamespacedPrefKey(SESSIONS_KEY)) ?? "{}",
    );
    expect(flushed[row.roomId]?.sendCounter).toBe(row.sendCounter);
    expect(persistRuntime).not.toHaveBeenCalled();
    expect(rt.raw.roomSessions).toBeUndefined();
  });

  it("os mode saves through the bridge as today", async () => {
    const save = installDesktopBridge(
      { mode: "os", json: null },
      { mode: "os" },
    );
    const store = await import("@/services/p2p/roomSessionStore");
    await store.hydrateRoomSessions();
    const row = sessionRow("room-stage-os");

    await store.saveRoomSession(row, { persistWallet: false });

    expect(save).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(save.mock.calls[0]?.[0] ?? "{}");
    expect(sent[row.roomId]?.sendCounter).toBe(row.sendCounter);
    expect(persistRuntime).not.toHaveBeenCalled();
  });

  it("os mode falling back to wallet stages rt.raw without persistRuntime", async () => {
    const save = installDesktopBridge(
      { mode: "os", json: null },
      { mode: "wallet" },
    );
    const store = await import("@/services/p2p/roomSessionStore");
    await store.hydrateRoomSessions();
    const row = sessionRow("room-stage-os-fallback");

    await store.saveRoomSession(row, { persistWallet: false });

    expect(save).toHaveBeenCalledTimes(1);
    expect(rt.raw.roomSessions?.[row.roomId]).toBeDefined();
    expect(persistRuntime).not.toHaveBeenCalled();
  });

  it("persistSessionBeforeSeal forwards persistWallet: false", async () => {
    installDesktopBridge({ mode: "wallet" }, { mode: "wallet" });
    const { persistSessionBeforeSeal } = await import(
      "@/services/p2p/HolepunchChatTransport"
    );
    const contract = await deriveContract("room-stage-seal");

    expect(
      await persistSessionBeforeSeal("c-seal", contract, {
        persistWallet: false,
      }),
    ).toBe(true);

    expect(rt.raw.roomSessions?.[contract.roomId]).toBeDefined();
    expect(persistRuntime).not.toHaveBeenCalled();
  });
});
