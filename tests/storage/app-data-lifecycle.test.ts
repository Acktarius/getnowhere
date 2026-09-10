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

import { disconnect } from "@/services/conceal/sync/runtime";
import {
  APP_PREF_ADAPTER_KEYS,
  APP_PREF_LOCAL_SIDE_KEYS,
  APP_PREF_SESSION_KEYS,
  deleteWalletData,
  resetAppData,
  WALLET_TIED_KEYS,
} from "@/services/storage/appDataLifecycle";

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
