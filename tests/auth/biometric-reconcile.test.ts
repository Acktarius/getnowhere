import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileBiometricSettingsWithEnrollments } from "@/lib/auth/biometric-lifecycle";
import {
  clearMemoryBiometricStorage,
  initMobileBiometricStorage,
  memoryBiometricStorage,
  setBiometricStorageAdapter,
} from "@/lib/auth/biometric-storage";
import { saveBiometricEnrollment } from "@/lib/auth/biometric-store";
import {
  getStorage,
  setActiveStorageAdapter,
  webStorageAdapter,
} from "@/services/storage/StorageAdapter";
import { useSettingsStore } from "@/state/settingsStore";

/** App-access credential key — same as src/lib/mobile/app-access-biometric.ts */
const APP_ACCESS_CREDENTIAL_KEY = "gnh.appAccessCredentialId";

function installGnhMobile(opts: {
  appAccessCredentialId: string | null;
  enrollmentJson?: string | null;
}) {
  window.gnhMobile = {
    sendCommand: vi.fn(),
    onBridgeEvent: vi.fn(() => () => {}),
    biometric: {
      isAvailable: vi.fn(async () => ({ available: true })),
      enrollAppAccess: vi.fn(),
      unlockAppAccess: vi.fn(),
      enrollDataUnlock: vi.fn(),
      unlockDataUnlock: vi.fn(),
      removeCredential: vi.fn(),
    },
    securePrefs: {
      get: vi.fn(async (key: string) => {
        if (key === APP_ACCESS_CREDENTIAL_KEY) {
          return { value: opts.appAccessCredentialId };
        }
        if (key === "gnh-biometric-enrollment") {
          return { value: opts.enrollmentJson ?? null };
        }
        return { value: null };
      }),
      set: vi.fn(async () => ({ ok: true })),
      remove: vi.fn(async () => ({ ok: true })),
    },
  };
}

function seedBiometricFlagsOn() {
  const appAccessBiometricEnabled = true;
  const dataUnlockBiometricEnabled = true;
  useSettingsStore.getState().setAppAccessBiometric(appAccessBiometricEnabled);
  useSettingsStore
    .getState()
    .setDataUnlockBiometric(dataUnlockBiometricEnabled);
  return { appAccessBiometricEnabled, dataUnlockBiometricEnabled };
}

function readPersistedBiometricFlags(): {
  appAccessBiometricEnabled?: boolean;
  dataUnlockBiometricEnabled?: boolean;
} {
  const raw = getStorage().getItem("gnh.settings");
  if (!raw) return {};
  return JSON.parse(raw) as {
    appAccessBiometricEnabled?: boolean;
    dataUnlockBiometricEnabled?: boolean;
  };
}

describe("reconcileBiometricSettingsWithEnrollments", () => {
  beforeEach(() => {
    clearMemoryBiometricStorage();
    setBiometricStorageAdapter(memoryBiometricStorage);
    getStorage().removeItem("gnh.settings");
    useSettingsStore.setState({
      appAccessBiometricEnabled: false,
      dataUnlockBiometricEnabled: false,
    });
  });

  afterEach(() => {
    delete window.gnhMobile;
    setActiveStorageAdapter(webStorageAdapter);
  });

  it("clears both biometric flags when enrollments are missing", async () => {
    installGnhMobile({ appAccessCredentialId: null });
    const before = seedBiometricFlagsOn();

    await reconcileBiometricSettingsWithEnrollments();

    const store = useSettingsStore.getState();
    expect(store.appAccessBiometricEnabled).toBe(
      !before.appAccessBiometricEnabled,
    );
    expect(store.dataUnlockBiometricEnabled).toBe(
      !before.dataUnlockBiometricEnabled,
    );

    const persisted = readPersistedBiometricFlags();
    expect(persisted.appAccessBiometricEnabled).toBe(
      !before.appAccessBiometricEnabled,
    );
    expect(persisted.dataUnlockBiometricEnabled).toBe(
      !before.dataUnlockBiometricEnabled,
    );
  });

  it("leaves both biometric flags unchanged when enrollments are present", async () => {
    const appAccessCredentialId = "app-cred-present";
    installGnhMobile({ appAccessCredentialId });
    await saveBiometricEnrollment({
      version: 2,
      credentials: [
        {
          credentialId: "data-cred-present",
          label: "This device",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const before = seedBiometricFlagsOn();

    await reconcileBiometricSettingsWithEnrollments();

    const store = useSettingsStore.getState();
    expect(store.appAccessBiometricEnabled).toBe(
      before.appAccessBiometricEnabled,
    );
    expect(store.dataUnlockBiometricEnabled).toBe(
      before.dataUnlockBiometricEnabled,
    );

    const persisted = readPersistedBiometricFlags();
    expect(persisted.appAccessBiometricEnabled).toBe(
      before.appAccessBiometricEnabled,
    );
    expect(persisted.dataUnlockBiometricEnabled).toBe(
      before.dataUnlockBiometricEnabled,
    );
  });

  it("preserves both flags when securePrefs read throws (simulates locked iOS Keychain)", async () => {
    installGnhMobile({ appAccessCredentialId: null });
    // Override securePrefs.get to throw, simulating errSecInteractionNotAllowed
    window.gnhMobile!.securePrefs!.get = vi
      .fn()
      .mockRejectedValue(new Error("unavailable"));
    seedBiometricFlagsOn();

    await reconcileBiometricSettingsWithEnrollments();

    const store = useSettingsStore.getState();
    expect(store.appAccessBiometricEnabled).toBe(true);
    expect(store.dataUnlockBiometricEnabled).toBe(true);

    const persisted = readPersistedBiometricFlags();
    expect(persisted.appAccessBiometricEnabled).toBe(true);
    expect(persisted.dataUnlockBiometricEnabled).toBe(true);
  });

  it("keeps data unlock flag when securePrefs enrollment is read via mobile adapter", async () => {
    const enrollmentJson = JSON.stringify({
      version: 2,
      credentials: [
        {
          credentialId: "data-cred-native",
          label: "This device",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    installGnhMobile({
      appAccessCredentialId: "app-cred-present",
      enrollmentJson,
    });
    await initMobileBiometricStorage();
    seedBiometricFlagsOn();

    await reconcileBiometricSettingsWithEnrollments();

    expect(useSettingsStore.getState().dataUnlockBiometricEnabled).toBe(true);
    expect(readPersistedBiometricFlags().dataUnlockBiometricEnabled).toBe(true);
  });
});
