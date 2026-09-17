import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasStoredWallet } from "@/services/conceal/sync/runtime";
import {
  createMobileNativeStorageAdapter,
  LOGICAL_WALLET_KEY,
  type MobilePrefsBackend,
  type MobileWalletFileBackend,
} from "@/services/storage/adapters/mobileNativeStorageAdapter";
import {
  assertMobileNativeStorageReady,
  installMobileNativeStorageAdapter,
  isMobileNativeStorageReady,
  resetMobileNativeStorageForTests,
} from "@/services/storage/installMobileNativeStorage";
import {
  getStorage,
  setActiveStorageAdapter,
  webStorageAdapter,
} from "@/services/storage/StorageAdapter";

function createPrefs(): MobilePrefsBackend & { store: Map<string, string> } {
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

function createWalletFile(): MobileWalletFileBackend & {
  written: string | null;
} {
  const state = { written: null as string | null };
  return {
    get written() {
      return state.written;
    },
    async exists() {
      return { ok: true, exists: state.written != null };
    },
    async read() {
      if (state.written == null) return { ok: false, reason: "io-error" };
      return { ok: true, value: state.written };
    },
    async write(value) {
      state.written = value;
    },
    async remove() {
      state.written = null;
    },
  };
}

describe("mobile storage boot", () => {
  afterEach(() => {
    resetMobileNativeStorageForTests();
    setActiveStorageAdapter(webStorageAdapter);
    delete window.gnhMobile;
    localStorage.clear();
  });

  it("installs the adapter before hasStoredWallet reads storage", async () => {
    const prefs = createPrefs();
    const walletFile = createWalletFile();
    const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
    await adapter.persistWallet("boot-wallet");

    expect(isMobileNativeStorageReady()).toBe(false);
    expect(() => assertMobileNativeStorageReady()).toThrow();

    await installMobileNativeStorageAdapter({
      isMobile: true,
      backends: { prefs, walletFile },
    });

    expect(isMobileNativeStorageReady()).toBe(true);
    assertMobileNativeStorageReady();
    expect(getStorage().getItem(LOGICAL_WALLET_KEY)).toBe("boot-wallet");
    await expect(hasStoredWallet()).resolves.toBe(true);
  });

  it("fails closed when the native bridge is missing on mobile", async () => {
    delete window.gnhMobile;
    await expect(
      installMobileNativeStorageAdapter({ isMobile: true }),
    ).rejects.toThrow(/native/i);
    expect(isMobileNativeStorageReady()).toBe(false);
    expect(getStorage()).toBe(webStorageAdapter);
  });

  it("main.tsx awaits native adapter install before importing App", () => {
    const src = readFileSync(resolve(__dirname, "../../src/main.tsx"), "utf8");
    expect(src).toContain("installMobileNativeStorageAdapter");
    expect(src).toMatch(
      /installMobileNativeStorageAdapter[\s\S]*import\(\s*["']\.\/App["']\s*\)/,
    );
  });
});
