import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type StorageAdapter,
  setActiveStorageAdapter,
  webStorageAdapter,
} from "@/services/storage/StorageAdapter";
import { useAuthStore } from "@/state/authStore";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useWalletStore } from "@/state/walletStore";

vi.mock("@/services/conceal/sync/runtime", () => ({
  disconnect: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/biometric-lifecycle", () => ({
  clearAllMobileBiometricEnrollments: vi.fn(async () => undefined),
}));

import { clearAllMobileBiometricEnrollments } from "@/lib/auth/biometric-lifecycle";
import { disconnect } from "@/services/conceal/sync/runtime";
import {
  APP_KEYS_INDEX_KEY,
  createMobileNativeStorageAdapter,
  LOGICAL_WALLET_KEY,
  type MobilePrefsBackend,
  type MobileWalletFileBackend,
  toNamespacedPrefKey,
} from "@/services/storage/adapters/mobileNativeStorageAdapter";
import {
  APP_PREF_ADAPTER_KEYS,
  APP_PREF_LOCAL_SIDE_KEYS,
  APP_PREF_SESSION_KEYS,
  deleteWalletData,
  resetAppData,
  WALLET_TIED_KEYS,
} from "@/services/storage/appDataLifecycle";

const BIOMETRIC_PREF = "gnh.appAccessCredentialId";
const SESSION_PREF = "gnh.walletSession";

function createMemoryAdapter(): StorageAdapter & {
  store: Map<string, string>;
} {
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
  let locationStub: { hash: string; reload: ReturnType<typeof vi.fn> };

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
    locationStub = { hash: "#/settings", reload: reloadSpy };
    Object.defineProperty(window, "location", {
      configurable: true,
      value: locationStub,
    });

    useWalletStore.setState({
      initialized: true,
      locked: false,
      address: "ccx1test",
      seedRef: "seed",
      seedPhrase: null,
    });
    useContactsStore.setState({
      contacts: [
        {
          id: "c1",
          alias: "A",
          ccxAddress: "ccx1a",
          paymentIdFrom: "p1",
          relationshipStatus: "pending",
          inviteStatus: "none",
          chatStatus: "unavailable",
          createdAt: "2020-01-01T00:00:00.000Z",
          updatedAt: "2020-01-01T00:00:00.000Z",
        },
      ],
      invites: [],
      hydrated: true,
    });
    useChatStore.setState({
      rooms: [
        {
          id: "r1",
          contactId: "c1",
          title: "A",
          createdAt: "2020-01-01T00:00:00.000Z",
        } as never,
      ],
      messagesByRoom: { r1: [] },
      activeRoomId: "r1",
    });
    useAuthStore.setState({ unlocked: true });

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
    expect(adapter.getItem("gnh.settings")).not.toBeNull();
    const keptSettings = JSON.parse(
      adapter.getItem("gnh.settings") as string,
    ) as {
      theme?: string;
      appAccessBiometricEnabled?: boolean;
      dataUnlockBiometricEnabled?: boolean;
    };
    expect(keptSettings.theme).toBe("dark");
    expect(keptSettings.appAccessBiometricEnabled).toBe(false);
    expect(keptSettings.dataUnlockBiometricEnabled).toBe(false);
    expect(useWalletStore.getState().initialized).toBe(false);
    expect(useContactsStore.getState().contacts).toEqual([]);
    expect(useChatStore.getState().rooms).toEqual([]);
    expect(useAuthStore.getState().unlocked).toBe(false);
    expect(locationStub.hash).toBe("#/welcome");
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("deleteWalletData resets biometric flags in gnh.settings while keeping theme", async () => {
    // Non-default theme (DEFAULT_SETTINGS.theme is "dark") + both biometric flags on.
    const theme = "light";
    const appAccessBiometricEnabled = true;
    const dataUnlockBiometricEnabled = true;
    const settingsBefore = {
      theme,
      appAccessBiometricEnabled,
      dataUnlockBiometricEnabled,
    };
    adapter.setItem("gnh.settings", JSON.stringify(settingsBefore));
    useSettingsStore.setState(settingsBefore);

    await deleteWalletData();

    const raw = adapter.getItem("gnh.settings");
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string) as typeof settingsBefore;
    expect(persisted.theme).toBe(theme);
    expect(persisted.appAccessBiometricEnabled).toBe(
      !appAccessBiometricEnabled,
    );
    expect(persisted.dataUnlockBiometricEnabled).toBe(
      !dataUnlockBiometricEnabled,
    );

    const store = useSettingsStore.getState();
    expect(store.theme).toBe(theme);
    expect(store.appAccessBiometricEnabled).toBe(!appAccessBiometricEnabled);
    expect(store.dataUnlockBiometricEnabled).toBe(!dataUnlockBiometricEnabled);
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
    expect(useWalletStore.getState().initialized).toBe(false);
    expect(locationStub.hash).toBe("#/welcome");
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

function createPrefsMock(
  initial?: Record<string, string>,
): MobilePrefsBackend & {
  store: Map<string, string>;
} {
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
      state.written = value;
    },
    async remove() {
      if (opts?.remove) await opts.remove();
      state.written = null;
      state.removed = true;
    },
  };
}

describe("app-data lifecycle on mobile native adapter", () => {
  let prefs: ReturnType<typeof createPrefsMock>;
  let walletFile: ReturnType<typeof createWalletFileMock>;
  let adapter: ReturnType<typeof createMobileNativeStorageAdapter>;
  let reloadSpy: ReturnType<typeof vi.fn>;
  let locationStub: { hash: string; reload: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prefs = createPrefsMock({
      [BIOMETRIC_PREF]: "cred-1",
      [SESSION_PREF]: "session-1",
    });
    walletFile = createWalletFileMock();
    adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
    setActiveStorageAdapter(adapter);

    adapter.setItem("gnh.settings", '{"theme":"dark"}');
    adapter.setItem("gnh.onboarded", "1");
    adapter.setItem("gnh.contacts", "[]");
    await adapter.flushPrefs();
    await adapter.persistWallet("durable-wallet");

    reloadSpy = vi.fn();
    locationStub = { hash: "#/settings", reload: reloadSpy };
    Object.defineProperty(window, "location", {
      configurable: true,
      value: locationStub,
    });
    vi.mocked(disconnect).mockClear();
    vi.mocked(clearAllMobileBiometricEnrollments).mockClear();
  });

  afterEach(() => {
    setActiveStorageAdapter(webStorageAdapter);
    localStorage.clear();
    sessionStorage.clear();
  });

  it("deleteWalletData awaits native wallet remove and keeps settings plus biometric prefs", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    walletFile = createWalletFileMock({
      remove: async () => {
        await gate;
      },
    });
    adapter = createMobileNativeStorageAdapter({ prefs, walletFile });
    setActiveStorageAdapter(adapter);
    adapter.setItem("gnh.settings", '{"theme":"dark"}');
    adapter.setItem("gnh.onboarded", "1");
    await adapter.flushPrefs();
    await adapter.persistWallet("durable-wallet");

    const pending = deleteWalletData();
    expect(walletFile.removed).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();

    release?.();
    await pending;

    expect(walletFile.removed).toBe(true);
    expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBeNull();
    expect(adapter.getItem("gnh.settings")).not.toBeNull();
    expect(prefs.store.get(BIOMETRIC_PREF)).toBe("cred-1");
    expect(prefs.store.get(SESSION_PREF)).toBe("session-1");
    expect(clearAllMobileBiometricEnrollments).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("resetAppData awaits native reset of wallet file and adapter index", async () => {
    await resetAppData();

    expect(walletFile.removed).toBe(true);
    expect(adapter.getItem(LOGICAL_WALLET_KEY)).toBeNull();
    expect(adapter.getItem("gnh.settings")).toBeNull();
    expect(adapter.getItem("gnh.onboarded")).toBeNull();
    expect(prefs.store.has(APP_KEYS_INDEX_KEY)).toBe(false);
    expect(prefs.store.has(toNamespacedPrefKey("gnh.settings"))).toBe(false);
    expect(prefs.store.get(BIOMETRIC_PREF)).toBe("cred-1");
    expect(prefs.store.get(SESSION_PREF)).toBe("session-1");
    expect(clearAllMobileBiometricEnrollments).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
