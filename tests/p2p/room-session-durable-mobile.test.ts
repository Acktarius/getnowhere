import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadRoomSession,
  type PersistedRoomSession,
  ROOM_SESSION_FLUSH_TIMEOUT_MS,
  saveRoomSession,
} from "@/services/p2p/roomSessionStore";
import type {
  MobilePrefsBackend,
  MobileWalletFileBackend,
} from "@/services/storage/adapters/mobileNativeStorageAdapter";
import {
  installMobileNativeStorageAdapter,
  resetMobileNativeStorageForTests,
} from "@/services/storage/installMobileNativeStorage";
import {
  setActiveStorageAdapter,
  webStorageAdapter,
} from "@/services/storage/StorageAdapter";
import type { HolepunchBootstrapContract } from "@/types/protocol";

type SetOutcome = "resolve" | "reject" | "hang";

/** Prefs backend whose `set` calls are held until the test releases them. */
function createGatedPrefs(): MobilePrefsBackend & {
  outcome: SetOutcome;
  pending: number;
  release(): void;
} {
  const store = new Map<string, string>();
  let openGate: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  const prefs = {
    outcome: "resolve" as SetOutcome,
    pending: 0,
    release(): void {
      openGate();
    },
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      if (prefs.outcome === "reject") throw new Error("prefs-write-failed");
      if (prefs.outcome === "hang") return new Promise<void>(() => undefined);
      prefs.pending += 1;
      await gate;
      prefs.pending -= 1;
      store.set(key, value);
    },
    async remove(key: string): Promise<void> {
      store.delete(key);
    },
  };
  return prefs;
}

const walletFile: MobileWalletFileBackend = {
  async exists() {
    return { ok: true, exists: false };
  },
  async read() {
    return { ok: false, reason: "io-error" };
  },
  async write() {},
  async remove() {},
};

function sessionRow(roomId: string, sendCounter: number): PersistedRoomSession {
  return {
    roomId,
    contactId: `contact-${roomId}`,
    contract: {} as HolepunchBootstrapContract,
    sendKeyHex: "aa".repeat(32),
    recvKeyHex: "bb".repeat(32),
    sendCounter,
    recvCounter: 0,
    savedAt: new Date().toISOString(),
  };
}

async function installGatedMobile(): Promise<
  ReturnType<typeof createGatedPrefs>
> {
  const prefs = createGatedPrefs();
  await installMobileNativeStorageAdapter({
    isMobile: true,
    backends: { prefs, walletFile },
  });
  return prefs;
}

function track(p: Promise<void>): { settled: () => string | null } {
  let state: string | null = null;
  p.then(
    () => {
      state = "resolved";
    },
    () => {
      state = "rejected";
    },
  );
  return { settled: () => state };
}

const ticks = () => new Promise((r) => setTimeout(r, 20));

describe("room session counters are durable on mobile before save resolves", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetMobileNativeStorageForTests();
    setActiveStorageAdapter(webStorageAdapter);
    localStorage.clear();
  });

  it("stays pending until the secure-prefs write lands", async () => {
    const prefs = await installGatedMobile();
    const row = sessionRow("room-durable-wait", 7);

    const save = saveRoomSession(row);
    const status = track(save);
    await ticks();
    expect(prefs.pending).toBeGreaterThan(0);
    expect(status.settled()).toBeNull();

    prefs.release();
    await expect(save).resolves.toBeUndefined();
    expect(loadRoomSession(row.roomId)?.sendCounter).toBe(row.sendCounter);
  });

  it("rejects when the secure-prefs write fails", async () => {
    const prefs = await installGatedMobile();
    prefs.outcome = "reject";

    await expect(
      saveRoomSession(sessionRow("room-durable-fail", 3)),
    ).rejects.toThrow();
  });

  it("rejects after the flush timeout when the write never settles", async () => {
    const prefs = await installGatedMobile();
    prefs.outcome = "hang";
    vi.useFakeTimers();

    const status = track(saveRoomSession(sessionRow("room-durable-hang", 5)));
    await vi.advanceTimersByTimeAsync(ROOM_SESSION_FLUSH_TIMEOUT_MS - 1);
    expect(status.settled()).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(status.settled()).toBe("rejected");
  });

  it("web localStorage path resolves without a mobile adapter", async () => {
    const row = sessionRow("room-durable-web", 9);

    await expect(saveRoomSession(row)).resolves.toBeUndefined();
    expect(loadRoomSession(row.roomId)?.sendCounter).toBe(row.sendCounter);
  });
});
