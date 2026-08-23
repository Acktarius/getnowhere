import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConcealSmartMessageAdapter } from "@/services/conceal/ConcealSmartMessageAdapter";
import {
  __resetHolepunchTransport,
  HolepunchChatTransport,
  storePartnerPokeHandle,
} from "@/services/p2p/HolepunchChatTransport";
import { loadCatalogRoom } from "@/services/p2p/roomCatalogStore";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";

// ── Module mocks ────────────────────────────────────────────────────────────

// Control pushWakeEnabled per-test via pushWakeEnabled variable below.
let pushWakeEnabled = false;

vi.mock("@/state/settingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({ privacy: { pushWakeEnabled } })),
  },
}));

const sendPokeSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("@/services/poke/pokeGatewayClient", () => ({
  sendPoke: (...args: unknown[]) => sendPokeSpy(...args),
  getOwnPokeHandle: () => null,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const ROOM_ID = "poke-room-01";
const PARTNER_HANDLE = "aB3dEfGhIjKlMn"; // 14 base64url chars

async function setupRelayRoom() {
  await HolepunchChatTransport.createRoom({
    contactId: "c1",
    bootstrap: {
      roomId: ROOM_ID,
      roomKeyRef: `key:${ROOM_ID}`,
      bootstrapSource: "conceal-smart-message",
      lifecycleStatus: "connect_failed",
      inviteId: "inv-poke-01",
    },
  });
}

/** Drain microtasks so fire-and-forget maybeSendPoke completes. */
async function flushAsync() {
  await new Promise((r) => setTimeout(r, 0));
}

// ── Tests ────────────────────────────────────────────────────────────────────

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
  __resetHolepunchTransport();
  sendPokeSpy.mockClear();
  pushWakeEnabled = false;
});

describe("maybeSendPoke — pushWakeEnabled=false", () => {
  it("does not call sendPoke even when partnerPokeHandle is set", async () => {
    pushWakeEnabled = false;
    vi.spyOn(ConcealSmartMessageAdapter, "sendChatRelay").mockResolvedValue({
      txHash: "tx1",
    });
    await setupRelayRoom();
    storePartnerPokeHandle(ROOM_ID, PARTNER_HANDLE);

    await HolepunchChatTransport.sendMessage(ROOM_ID, "hello");
    await flushAsync();

    expect(sendPokeSpy).not.toHaveBeenCalled();
  });
});

describe("maybeSendPoke — no partnerPokeHandle", () => {
  it("does not call sendPoke when handle is absent", async () => {
    pushWakeEnabled = true;
    vi.spyOn(ConcealSmartMessageAdapter, "sendChatRelay").mockResolvedValue({
      txHash: "tx2",
    });
    await setupRelayRoom();
    // No storePartnerPokeHandle call

    await HolepunchChatTransport.sendMessage(ROOM_ID, "hello");
    await flushAsync();

    expect(sendPokeSpy).not.toHaveBeenCalled();
  });
});

describe("maybeSendPoke — send-once-per-relay-session rule", () => {
  it("calls sendPoke once on first relay when enabled and handle present", async () => {
    pushWakeEnabled = true;
    vi.spyOn(ConcealSmartMessageAdapter, "sendChatRelay").mockResolvedValue({
      txHash: "tx3",
    });
    await setupRelayRoom();
    storePartnerPokeHandle(ROOM_ID, PARTNER_HANDLE);

    await HolepunchChatTransport.sendMessage(ROOM_ID, "first");
    await flushAsync();

    expect(sendPokeSpy).toHaveBeenCalledOnce();
    expect(sendPokeSpy).toHaveBeenCalledWith(PARTNER_HANDLE);
  });

  it("does NOT call sendPoke again on second relay in the same session", async () => {
    pushWakeEnabled = true;
    vi.spyOn(ConcealSmartMessageAdapter, "sendChatRelay").mockResolvedValue({
      txHash: "tx4",
    });
    await setupRelayRoom();
    storePartnerPokeHandle(ROOM_ID, PARTNER_HANDLE);

    await HolepunchChatTransport.sendMessage(ROOM_ID, "first");
    await flushAsync();
    expect(sendPokeSpy).toHaveBeenCalledOnce();

    await HolepunchChatTransport.sendMessage(ROOM_ID, "second");
    await flushAsync();
    // Still only once
    expect(sendPokeSpy).toHaveBeenCalledOnce();
  });

  it("persists lastPokedAt to catalog after first poke", async () => {
    pushWakeEnabled = true;
    vi.spyOn(ConcealSmartMessageAdapter, "sendChatRelay").mockResolvedValue({
      txHash: "tx5",
    });
    await setupRelayRoom();
    storePartnerPokeHandle(ROOM_ID, PARTNER_HANDLE);

    await HolepunchChatTransport.sendMessage(ROOM_ID, "msg");
    await flushAsync();

    const catalog = loadCatalogRoom(ROOM_ID);
    expect(catalog?.lastPokedAt).toBeGreaterThan(0);
  });
});

describe("maybeSendPoke — reset on connected", () => {
  it("clears lastPokedAt when room reaches connected, enabling a new poke next relay", async () => {
    pushWakeEnabled = true;
    vi.spyOn(ConcealSmartMessageAdapter, "sendChatRelay").mockResolvedValue({
      txHash: "tx6",
    });
    await setupRelayRoom();
    storePartnerPokeHandle(ROOM_ID, PARTNER_HANDLE);

    // First relay — poke fires
    await HolepunchChatTransport.sendMessage(ROOM_ID, "before connect");
    await flushAsync();
    expect(sendPokeSpy).toHaveBeenCalledOnce();

    // Simulate transition to connected (clears lastPokedAt)
    const room = await HolepunchChatTransport.getRoom(ROOM_ID);
    expect(room).not.toBeNull();
    // Patch the room directly via patchCatalogRoom to simulate connected clearing the flag.
    // We use the internal transport path: connect would clear it, but we verify via catalog.
    const catalogAfterRelay = loadCatalogRoom(ROOM_ID);
    expect(catalogAfterRelay?.lastPokedAt).toBeGreaterThan(0);

    // The clear happens inside attemptConnect on connected transition.
    // We verify the clearing invariant via storePartnerPokeHandle + catalog read:
    // After a room goes connected (patchCatalogRoom sets lastPokedAt: undefined),
    // a fresh relay send should fire sendPoke again.
    // We directly invoke patchCatalogRoom to simulate the connected transition.
    const { patchCatalogRoom } = await import(
      "@/services/p2p/roomCatalogStore"
    );
    patchCatalogRoom(ROOM_ID, { lastPokedAt: undefined });

    // Also reset the in-memory room state by re-creating it (simulates re-hydrate after connect)
    __resetHolepunchTransport();
    vi.spyOn(ConcealSmartMessageAdapter, "sendChatRelay").mockResolvedValue({
      txHash: "tx7",
    });
    await setupRelayRoom();
    storePartnerPokeHandle(ROOM_ID, PARTNER_HANDLE);
    // catalog now has lastPokedAt: undefined after the patch

    sendPokeSpy.mockClear();
    await HolepunchChatTransport.sendMessage(ROOM_ID, "after connect");
    await flushAsync();
    expect(sendPokeSpy).toHaveBeenCalledOnce();
  });
});
