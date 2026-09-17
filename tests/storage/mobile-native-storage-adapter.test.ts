import { afterEach, describe, expect, it } from "vitest";
import {
  APP_KEYS_INDEX_KEY,
  createMobileNativeStorageAdapter,
  isWalletPresent,
  LOGICAL_WALLET_KEY,
  type MobilePrefsBackend,
  type MobileWalletFileBackend,
  toNamespacedPrefKey,
  type WalletFileExistsResult,
  type WalletFileReadResult,
  type WalletUnreadableReason,
} from "@/services/storage/adapters/mobileNativeStorageAdapter";
import {
  getStorage,
  setActiveStorageAdapter,
  webStorageAdapter,
} from "@/services/storage/StorageAdapter";

const BIOMETRIC_KEY = "gnh.appAccessCredentialId";
const SESSION_KEY = "gnh.walletSession";

type PrefsMock = MobilePrefsBackend & { store: Map<string, string> };

function createPrefsMock(initial?: Record<string, string>): PrefsMock {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
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
  exists?: WalletFileExistsResult;
  read?: WalletFileReadResult;
  write?: (value: string) => Promise<void>;
  remove?: () => Promise<void>;
}): MobileWalletFileBackend & { written: string | null; removed: boolean } {
  const state = {
    written: null as string | null,
    removed: false,
  };
  return {
    get written() {
      return state.written;
    },
    get removed() {
      return state.removed;
    },
    async exists() {
      return opts?.exists ?? { ok: true, exists: state.written != null };
    },
    async read() {
      if (opts?.read) return opts.read;
      if (state.written == null) {
        return { ok: false, reason: "io-error" as const };
      }
      return { ok: true, value: state.written };
    },
    async write(value) {
      if (opts?.write) {
        await opts.write(value);
        state.written = value;
        return;
      }
      state.written = value;
    },
    async remove() {
      if (opts?.remove) {
        await opts.remove();
      }
      state.written = null;
      state.removed = true;
    },
  };
}

describe("mobile native storage adapter", () => {
  afterEach(() => {
    setActiveStorageAdapter(webStorageAdapter);
    localStorage.clear();
  });

  describe("key routing and index", () => {
    it("writes prefs under gnh.app: and updates the key index", async () => {
      const prefs = createPrefsMock();
      const walletFile = createWalletFileMock();
      const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
      const settings = JSON.stringify({ theme: "light" });

      adapter.setItem("gnh.settings", settings);
      expect(adapter.getItem("gnh.settings")).toBe(settings);
      await adapter.flushPrefs();

      expect(prefs.store.get(toNamespacedPrefKey("gnh.settings"))).toBe(
        settings,
      );
      expect(prefs.store.has(LOGICAL_WALLET_KEY)).toBe(false);
      expect(prefs.store.has(toNamespacedPrefKey(LOGICAL_WALLET_KEY))).toBe(
        false,
      );

      const indexRaw = prefs.store.get(APP_KEYS_INDEX_KEY);
      expect(indexRaw).toBeTruthy();
      const index = JSON.parse(indexRaw as string) as string[];
      expect(index).toContain("gnh.settings");
      expect(index).not.toContain(APP_KEYS_INDEX_KEY);
    });

    it("routes wallet only to the wallet-file backend", async () => {
      const prefs = createPrefsMock();
      const walletFile = createWalletFileMock();
      const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
      const blob = `wallet-blob-${Date.now()}`;

      await adapter.persistWallet(blob);

      expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBe(blob);
      expect(walletFile.written).toBe(blob);
      expect(prefs.store.has(LOGICAL_WALLET_KEY)).toBe(false);
      expect(prefs.store.has(toNamespacedPrefKey(LOGICAL_WALLET_KEY))).toBe(
        false,
      );
      expect(prefs.store.get(APP_KEYS_INDEX_KEY) ?? "[]").not.toContain(
        LOGICAL_WALLET_KEY,
      );
    });

    it("leaves webStorageAdapter on localStorage when mobile is not installed", () => {
      const marker = `web-only-${Date.now()}`;
      webStorageAdapter.setItem("gnh.settings", marker);
      expect(localStorage.getItem("gnh.settings")).toBe(marker);
      expect(getStorage()).toBe(webStorageAdapter);
      expect(getStorage().getItem("gnh.settings")).toBe(marker);
    });
  });

  describe("wallet durable await", () => {
    it("does not expose wallet in the Map until native write succeeds", async () => {
      const prefs = createPrefsMock();
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const walletFile = createWalletFileMock({
        write: async (value) => {
          await gate;
          void value;
        },
      });
      const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
      const blob = `pending-${Date.now()}`;

      const pending = adapter.persistWallet(blob);
      expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBeNull();
      expect(walletFile.written).toBeNull();

      release?.();
      await pending;

      expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBe(blob);
      expect(walletFile.written).toBe(blob);
    });

    it("does not mark wallet present when native write fails", async () => {
      const prefs = createPrefsMock();
      const walletFile = createWalletFileMock({
        write: async () => {
          throw new Error("io-error");
        },
      });
      const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });

      await expect(adapter.persistWallet("must-not-store")).rejects.toThrow();
      expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBeNull();
      expect(isWalletPresent(adapter.getWalletStorageState())).toBe(false);
    });

    it("does not recreate the wallet file after writes are sealed", async () => {
      const prefs = createPrefsMock();
      let releaseWrite: (() => void) | undefined;
      const writeGate = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      const walletFile = createWalletFileMock({
        write: async () => {
          await writeGate;
        },
      });
      const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });

      const latePersist = adapter.persistWallet("after-wipe");
      adapter.sealWalletWrites();
      await adapter.resetAdapterOwned();
      releaseWrite?.();

      await expect(latePersist).rejects.toThrow("wallet-writes-sealed");
      expect(walletFile.written).toBeNull();
      expect(walletFile.removed).toBe(true);
      expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBeNull();
      expect(isWalletPresent(adapter.getWalletStorageState())).toBe(false);

      await expect(adapter.persistWallet("recreate")).rejects.toThrow(
        "wallet-writes-sealed",
      );
      expect(walletFile.written).toBeNull();
    });

    it("reset clears index keys and wallet file, not biometric or session prefs", async () => {
      const prefs = createPrefsMock({
        [BIOMETRIC_KEY]: "cred-1",
        [SESSION_KEY]: "session-1",
      });
      const walletFile = createWalletFileMock();
      const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
      adapter.setItem("gnh.settings", '{"theme":"dark"}');
      adapter.setItem("gnh.onboarded", "1");
      await adapter.flushPrefs();
      await adapter.persistWallet("blob-to-wipe");

      await adapter.resetAdapterOwned();

      expect(adapter.getItem("gnh.settings")).toBeNull();
      expect(adapter.getItem("gnh.onboarded")).toBeNull();
      expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBeNull();
      expect(walletFile.removed).toBe(true);
      expect(prefs.store.has(APP_KEYS_INDEX_KEY)).toBe(false);
      expect(prefs.store.has(toNamespacedPrefKey("gnh.settings"))).toBe(false);
      expect(prefs.store.get(BIOMETRIC_KEY)).toBe("cred-1");
      expect(prefs.store.get(SESSION_KEY)).toBe("session-1");
    });
  });

  describe("wallet presence tri-state", () => {
    it("is absent only after a successful exists=false", async () => {
      const prefs = createPrefsMock();
      const walletFile = createWalletFileMock({
        exists: { ok: true, exists: false },
      });
      const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
      await adapter.hydrateFromNative();

      expect(adapter.getWalletStorageState()).toEqual({ status: "absent" });
      expect(isWalletPresent(adapter.getWalletStorageState())).toBe(false);
    });

    it("is present after a readable wallet file", async () => {
      const prefs = createPrefsMock();
      const blob = `readable-${Date.now()}`;
      const walletFile = createWalletFileMock({
        exists: { ok: true, exists: true },
        read: { ok: true, value: blob },
      });
      const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
      await adapter.hydrateFromNative();

      expect(adapter.getWalletStorageState()).toEqual({ status: "present" });
      expect(isWalletPresent(adapter.getWalletStorageState())).toBe(true);
      expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBe(blob);
    });

    it("is unreadable on AEAD/auth failure and does not treat that as absent", async () => {
      const prefs = createPrefsMock();
      const walletFile = createWalletFileMock({
        exists: { ok: true, exists: true },
        read: { ok: false, reason: "auth-failed" },
      });
      const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
      await adapter.hydrateFromNative();

      expect(adapter.getWalletStorageState()).toEqual({
        status: "unreadable",
        reason: "auth-failed",
      });
      expect(isWalletPresent(adapter.getWalletStorageState())).toBe(false);
      expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBeNull();
    });

    it("is unreadable when exists itself fails", async () => {
      const prefs = createPrefsMock();
      const reason: WalletUnreadableReason = "bridge-unavailable";
      const walletFile = createWalletFileMock({
        exists: { ok: false, reason },
      });
      const adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
      await adapter.hydrateFromNative();

      expect(adapter.getWalletStorageState()).toEqual({
        status: "unreadable",
        reason,
      });
      expect(isWalletPresent(adapter.getWalletStorageState())).toBe(false);
    });
  });
});
