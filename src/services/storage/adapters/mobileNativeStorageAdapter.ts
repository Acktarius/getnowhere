/**
 * Mobile native StorageAdapter: prefs in gnh.app: secure-prefs, wallet in file.
 * @see docs/storage/mobile-durable-storage.md
 */
import type { StorageAdapter } from "@/services/storage/StorageAdapter";

export const LOGICAL_WALLET_KEY = "wallet";
export const APP_KEY_PREFIX = "gnh.app:";
export const APP_KEYS_INDEX_KEY = "gnh.app:__keys:v1";

export type WalletUnreadableReason =
  | "bridge-unavailable"
  | "io-error"
  | "invalid-envelope"
  | "auth-failed"
  | "key-unavailable";

export type WalletStorageState =
  | { status: "present" }
  | { status: "absent" }
  | { status: "unreadable"; reason: WalletUnreadableReason };

export type WalletFileExistsResult =
  | { ok: true; exists: boolean }
  | { ok: false; reason: WalletUnreadableReason };

export type WalletFileReadResult =
  | { ok: true; value: string }
  | { ok: false; reason: WalletUnreadableReason };

export type MobilePrefsBackend = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export type MobileWalletFileBackend = {
  exists(): Promise<WalletFileExistsResult>;
  read(): Promise<WalletFileReadResult>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
};

export function toNamespacedPrefKey(logicalKey: string): string {
  return `${APP_KEY_PREFIX}${logicalKey}`;
}

export function isWalletPresent(state: WalletStorageState): boolean {
  return state.status === "present";
}

function parseIndex(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k): k is string => typeof k === "string");
  } catch {
    return [];
  }
}

export type MobileNativeStorageAdapter = StorageAdapter & {
  persistWallet(value: string): Promise<void>;
  removeWallet(): Promise<void>;
  flushPrefs(): Promise<void>;
  resetAdapterOwned(): Promise<void>;
  hydrateFromNative(): Promise<void>;
  getWalletStorageState(): WalletStorageState;
  lastPrefFlushError(): Error | null;
  /** Sync: reject later persistWallet so an in-flight save cannot recreate the file after wipe. */
  sealWalletWrites(): void;
};

export function createMobileNativeStorageAdapter(backends: {
  prefs: MobilePrefsBackend;
  walletFile: MobileWalletFileBackend;
}): MobileNativeStorageAdapter {
  const memory = new Map<string, string>();
  let walletState: WalletStorageState = { status: "absent" };
  let prefError: Error | null = null;
  let walletWritesSealed = false;
  const indexKeys = new Set<string>();
  let chain: Promise<void> = Promise.resolve();

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function writeIndexAndPref(
    logicalKey: string,
    value: string,
  ): Promise<void> {
    indexKeys.add(logicalKey);
    const listed = [...indexKeys];
    await backends.prefs.set(toNamespacedPrefKey(logicalKey), value);
    await backends.prefs.set(APP_KEYS_INDEX_KEY, JSON.stringify(listed));
  }

  async function removePrefAndIndex(logicalKey: string): Promise<void> {
    indexKeys.delete(logicalKey);
    await backends.prefs.remove(toNamespacedPrefKey(logicalKey));
    if (indexKeys.size === 0) {
      await backends.prefs.remove(APP_KEYS_INDEX_KEY);
    } else {
      await backends.prefs.set(
        APP_KEYS_INDEX_KEY,
        JSON.stringify([...indexKeys]),
      );
    }
  }

  const adapter: MobileNativeStorageAdapter = {
    getItem(key) {
      return memory.has(key) ? (memory.get(key) as string) : null;
    },

    setItem(key, value) {
      if (key === LOGICAL_WALLET_KEY) {
        // Sync API cannot commit the wallet. Call persistWallet() and await it.
        return;
      }
      memory.set(key, value);
      void enqueue(async () => {
        try {
          await writeIndexAndPref(key, value);
          prefError = null;
        } catch (err) {
          prefError =
            err instanceof Error ? err : new Error("pref-flush-failed");
          throw prefError;
        }
      });
    },

    removeItem(key) {
      if (key === LOGICAL_WALLET_KEY) {
        // Sync API cannot commit wallet delete. Call removeWallet() and await it.
        return;
      }
      memory.delete(key);
      void enqueue(async () => {
        try {
          await removePrefAndIndex(key);
          prefError = null;
        } catch (err) {
          prefError =
            err instanceof Error ? err : new Error("pref-flush-failed");
          throw prefError;
        }
      });
    },

    clear() {
      void adapter.resetAdapterOwned();
    },

    persistWallet(value) {
      return enqueue(async () => {
        if (walletWritesSealed) {
          throw new Error("wallet-writes-sealed");
        }
        await backends.walletFile.write(value);
        if (walletWritesSealed) {
          await backends.walletFile.remove();
          memory.delete(LOGICAL_WALLET_KEY);
          walletState = { status: "absent" };
          throw new Error("wallet-writes-sealed");
        }
        memory.set(LOGICAL_WALLET_KEY, value);
        walletState = { status: "present" };
      });
    },

    removeWallet() {
      return enqueue(async () => {
        await backends.walletFile.remove();
        memory.delete(LOGICAL_WALLET_KEY);
        walletState = { status: "absent" };
      });
    },

    flushPrefs() {
      return enqueue(async () => undefined);
    },

    resetAdapterOwned() {
      return enqueue(async () => {
        const listed = [...indexKeys];
        for (const logicalKey of listed) {
          memory.delete(logicalKey);
          await backends.prefs.remove(toNamespacedPrefKey(logicalKey));
        }
        indexKeys.clear();
        await backends.prefs.remove(APP_KEYS_INDEX_KEY);
        await backends.walletFile.remove();
        memory.delete(LOGICAL_WALLET_KEY);
        walletState = { status: "absent" };
      });
    },

    async hydrateFromNative() {
      return enqueue(async () => {
        const indexRaw = await backends.prefs.get(APP_KEYS_INDEX_KEY);
        const listed = parseIndex(indexRaw);
        indexKeys.clear();
        for (const logicalKey of listed) {
          if (logicalKey === LOGICAL_WALLET_KEY) continue;
          indexKeys.add(logicalKey);
          const value = await backends.prefs.get(
            toNamespacedPrefKey(logicalKey),
          );
          if (value != null) memory.set(logicalKey, value);
        }

        const existence = await backends.walletFile.exists();
        if (!existence.ok) {
          walletState = { status: "unreadable", reason: existence.reason };
          memory.delete(LOGICAL_WALLET_KEY);
          return;
        }
        if (!existence.exists) {
          walletState = { status: "absent" };
          memory.delete(LOGICAL_WALLET_KEY);
          return;
        }
        const read = await backends.walletFile.read();
        if (!read.ok) {
          walletState = { status: "unreadable", reason: read.reason };
          memory.delete(LOGICAL_WALLET_KEY);
          return;
        }
        memory.set(LOGICAL_WALLET_KEY, read.value);
        walletState = { status: "present" };
      });
    },

    getWalletStorageState() {
      return walletState;
    },

    lastPrefFlushError() {
      return prefError;
    },

    sealWalletWrites() {
      walletWritesSealed = true;
    },
  };

  return adapter;
}
