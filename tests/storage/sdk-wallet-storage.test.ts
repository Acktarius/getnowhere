import { afterEach, describe, expect, it } from "vitest";
import { getSdkWalletStorage } from "@/services/conceal/sync/storage";
import {
  createMobileNativeStorageAdapter,
  isWalletPresent,
  LOGICAL_WALLET_KEY,
  type MobilePrefsBackend,
  type MobileWalletFileBackend,
  toNamespacedPrefKey,
} from "@/services/storage/adapters/mobileNativeStorageAdapter";
import {
  setActiveStorageAdapter,
  webStorageAdapter,
} from "@/services/storage/StorageAdapter";

function createPrefsMock(): MobilePrefsBackend & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    async get(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async set(key, value) {
      store.set(key, value);
    },
    async remove(key) {
      store.delete(key);
    },
  };
}

function createWalletFileMock(opts?: {
  write?: (value: string) => Promise<void>;
  remove?: () => Promise<void>;
}): MobileWalletFileBackend & { written: string | null; removed: boolean } {
  const state = { written: null as string | null, removed: false };
  return {
    get written() {
      return state.written;
    },
    get removed() {
      return state.removed;
    },
    async exists() {
      return { ok: true, exists: state.written != null };
    },
    async read() {
      return state.written == null
        ? { ok: false, reason: "io-error" as const }
        : { ok: true, value: state.written };
    },
    async write(value) {
      if (opts?.write) await opts.write(value);
      state.written = value;
    },
    async remove() {
      if (opts?.remove) await opts.remove();
      state.written = null;
      state.removed = true;
    },
  };
}

describe("getSdkWalletStorage mobile durable writes", () => {
  afterEach(() => {
    setActiveStorageAdapter(webStorageAdapter);
  });

  it("setItem(wallet) awaits persistWallet before resolving", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prefs = createPrefsMock();
    const walletFile = createWalletFileMock({
      write: async () => {
        await gate;
      },
    });
    const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
    setActiveStorageAdapter(adapter);
    const blob = `sdk-wallet-${Date.now()}`;

    const pending = getSdkWalletStorage().setItem(LOGICAL_WALLET_KEY, blob);
    expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBeNull();
    expect(walletFile.written).toBeNull();

    release?.();
    await pending;

    expect(walletFile.written).toBe(blob);
    expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBe(blob);
    expect(isWalletPresent(adapter.getWalletStorageState())).toBe(true);
    expect(prefs.store.has(LOGICAL_WALLET_KEY)).toBe(false);
    expect(prefs.store.has(toNamespacedPrefKey(LOGICAL_WALLET_KEY))).toBe(
      false,
    );
  });

  it("removeItem(wallet) awaits removeWallet before resolving", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prefs = createPrefsMock();
    const walletFile = createWalletFileMock({
      remove: async () => {
        await gate;
      },
    });
    const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
    setActiveStorageAdapter(adapter);
    await adapter.persistWallet("to-delete");

    const pending = getSdkWalletStorage().removeItem(LOGICAL_WALLET_KEY);
    expect(walletFile.removed).toBe(false);
    expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBe("to-delete");

    release?.();
    await pending;

    expect(walletFile.removed).toBe(true);
    expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBeNull();
    expect(isWalletPresent(adapter.getWalletStorageState())).toBe(false);
  });

  it("setItem prefs flush to the namespaced backend", async () => {
    const prefs = createPrefsMock();
    const walletFile = createWalletFileMock();
    const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
    setActiveStorageAdapter(adapter);
    const settings = JSON.stringify({ theme: "light" });

    await getSdkWalletStorage().setItem("gnh.settings", settings);

    expect(adapter.getItem("gnh.settings")).toBe(settings);
    expect(prefs.store.get(toNamespacedPrefKey("gnh.settings"))).toBe(settings);
  });
});
