// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// vi.hoisted ensures these are available when the (hoisted) vi.mock factory runs.
const { saveStoredWalletMock, serializeWalletStateMock } = vi.hoisted(() => ({
  saveStoredWalletMock: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
  serializeWalletStateMock: vi.fn<[], string>().mockReturnValue("{}"),
}));

// Spread real SDK constants (used at module-init time by transitive deps),
// then override the two WASM-touching functions so persistNow never runs real crypto.
vi.mock("conceal-wallet-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("conceal-wallet-sdk")>();
  return {
    ...actual,
    saveStoredWallet: saveStoredWalletMock,
    serializeWalletState: serializeWalletStateMock,
  };
});

import {
  _setRuntimeForTest,
  flushSyncCheckpoint,
  maybeCheckpoint,
  type SdkRuntime,
} from "@/services/conceal/sync/runtime";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal fake StorageAdapter (no-ops). */
function fakeStorage() {
  return {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
}

/**
 * Minimal SdkRuntime fixture.
 * `storage` is provided so `persistNow` never falls back to `getActiveWalletStorage`.
 */
function makeRt(scannedHeight: number, lastHeight = 0): SdkRuntime {
  return {
    id: "default",
    account: { keys: {} } as SdkRuntime["account"],
    raw: { lastHeight } as SdkRuntime["raw"],
    state: { scannedHeight } as SdkRuntime["state"],
    daemon: {} as SdkRuntime["daemon"],
    password: "pw",
    viewOnly: false,
    storage: fakeStorage(),
  };
}

/**
 * Minimal RuntimeCoordination-like plain object.
 * `RuntimeCoordination` is not exported so we construct the shape directly.
 */
function makeCoord(lastCheckpointHeight = 0) {
  return {
    inFlightSync: null as Promise<number> | null,
    pendingSync: false,
    persistChain: Promise.resolve(),
    lastCheckpointHeight,
  };
}

// ── maybeCheckpoint ───────────────────────────────────────────────────────────

describe("maybeCheckpoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
    _setRuntimeForTest(null);
  });

  it("is a no-op on the light path (useHeavyPath=false), even when threshold is exceeded", async () => {
    const lastCheckpoint = 0;
    // Put scannedHeight well past SYNC_CHECKPOINT_BLOCKS so the only guard that fires is useHeavyPath.
    const scannedHeight = lastCheckpoint + 2000;
    const rt = makeRt(scannedHeight);
    const coord = makeCoord(lastCheckpoint);

    await maybeCheckpoint(
      rt,
      coord as Parameters<typeof maybeCheckpoint>[1],
      false,
    );

    expect(saveStoredWalletMock).not.toHaveBeenCalled();
    expect(coord.lastCheckpointHeight).toBe(lastCheckpoint);
  });

  it("is a no-op when scannedHeight advanced less than the checkpoint interval", async () => {
    const lastCheckpoint = 500;
    // One block below the threshold — should NOT persist.
    const scannedHeight = lastCheckpoint + 999;
    const rt = makeRt(scannedHeight);
    const coord = makeCoord(lastCheckpoint);

    await maybeCheckpoint(
      rt,
      coord as Parameters<typeof maybeCheckpoint>[1],
      true,
    );

    expect(saveStoredWalletMock).not.toHaveBeenCalled();
    expect(coord.lastCheckpointHeight).toBe(lastCheckpoint);
  });

  it("persists and advances lastCheckpointHeight when threshold is reached", async () => {
    const lastCheckpoint = 500;
    // Exactly at the threshold boundary — should persist.
    const scannedHeight = lastCheckpoint + 1000;
    const rt = makeRt(scannedHeight);
    const coord = makeCoord(lastCheckpoint);

    await maybeCheckpoint(
      rt,
      coord as Parameters<typeof maybeCheckpoint>[1],
      true,
    );

    expect(saveStoredWalletMock).toHaveBeenCalledOnce();
    // lastCheckpointHeight is updated to the current scannedHeight (derived from fixture).
    expect(coord.lastCheckpointHeight).toBe(scannedHeight);
  });
});

// ── flushSyncCheckpoint ───────────────────────────────────────────────────────

describe("flushSyncCheckpoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
    _setRuntimeForTest(null);
  });

  it("is a no-op when getRuntime() returns null (wallet locked)", async () => {
    // No runtime installed — getRuntime() returns null.
    await flushSyncCheckpoint();

    expect(saveStoredWalletMock).not.toHaveBeenCalled();
  });

  it("is a no-op when scannedHeight has not advanced past lastPersisted", async () => {
    const lastHeight = 1000;
    const scannedHeight = lastHeight; // equal — nothing new
    const rt = makeRt(scannedHeight, lastHeight);
    _setRuntimeForTest(rt);

    await flushSyncCheckpoint();

    expect(saveStoredWalletMock).not.toHaveBeenCalled();
  });

  it("persists when scannedHeight has advanced past lastPersisted", async () => {
    const lastHeight = 800;
    const scannedHeight = lastHeight + 200; // advanced
    const rt = makeRt(scannedHeight, lastHeight);
    _setRuntimeForTest(rt);

    await flushSyncCheckpoint();

    expect(saveStoredWalletMock).toHaveBeenCalledOnce();
    // Verify the runtime that was flushed is the one we installed (saveStoredWallet receives the raw blob).
    expect(saveStoredWalletMock).toHaveBeenCalledWith(
      rt.storage,
      expect.any(Object),
      rt.password,
    );
  });
});
