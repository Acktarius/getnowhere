import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type StorageAdapter,
  setActiveStorageAdapter,
  webStorageAdapter,
} from "@/services/storage/StorageAdapter";

vi.mock("@/services/conceal/sync/runtime", () => ({
  disconnect: vi.fn(async () => undefined),
}));

import { disconnect } from "@/services/conceal/sync/runtime";
import {
  deleteWalletData,
  resetAppData,
} from "@/services/storage/appDataLifecycle";

const WALLET_TIED_KEYS = [
  "wallet",
  "gnh.onboarded",
  "gnh.contacts",
  "gnh.invites",
  "gnh.pendingInitiatorKeys",
  "gnh.contacts.ready",
  "gnh.roomCatalog",
  "gnh.roomSessions",
  "gnh.revokedRooms",
] as const;

const APP_PREF_ADAPTER_KEYS = ["gnh.settings"] as const;

const APP_PREF_LOCAL_SIDE_KEYS = [
  "ccx-preferred-node",
  "ccx-sync-timing",
  "ccx-disable-parallel-sync",
] as const;

const APP_PREF_SESSION_KEYS = ["ccx-auto-node"] as const;

function createMemoryAdapter(): StorageAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

describe("app-data lifecycle", () => {
  let adapter: ReturnType<typeof createMemoryAdapter>;
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = createMemoryAdapter();
    setActiveStorageAdapter(adapter);

    for (const key of WALLET_TIED_KEYS) {
      adapter.setItem(key, `value:${key}`);
    }
    for (const key of APP_PREF_ADAPTER_KEYS) {
      adapter.setItem(key, '{"theme":"dark"}');
    }
    for (const key of APP_PREF_LOCAL_SIDE_KEYS) {
      localStorage.setItem(key, `side:${key}`);
    }
    for (const key of APP_PREF_SESSION_KEYS) {
      sessionStorage.setItem(key, `session:${key}`);
    }

    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    vi.mocked(disconnect).mockClear();
  });

  afterEach(() => {
    setActiveStorageAdapter(webStorageAdapter);
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(disconnect).mockClear();
  });

  it("deleteWalletData removes wallet-tied keys, keeps gnh.settings, and disconnects", async () => {
    await deleteWalletData();

    expect(disconnect).toHaveBeenCalledTimes(1);
    for (const key of WALLET_TIED_KEYS) {
      expect(adapter.getItem(key)).toBeNull();
    }
    expect(adapter.getItem("gnh.settings")).toBe('{"theme":"dark"}');
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("resetAppData removes wallet-tied and app-pref keys and disconnects", async () => {
    await resetAppData();

    expect(disconnect).toHaveBeenCalledTimes(1);
    for (const key of WALLET_TIED_KEYS) {
      expect(adapter.getItem(key)).toBeNull();
    }
    for (const key of APP_PREF_ADAPTER_KEYS) {
      expect(adapter.getItem(key)).toBeNull();
    }
    for (const key of APP_PREF_LOCAL_SIDE_KEYS) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    for (const key of APP_PREF_SESSION_KEYS) {
      expect(sessionStorage.getItem(key)).toBeNull();
    }
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
