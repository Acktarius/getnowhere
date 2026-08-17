import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMemoryBiometricStorage,
  memoryBiometricStorage,
  setBiometricStorageAdapter,
} from "@/lib/auth/biometric-storage";
import {
  getBiometricEnrollment,
  saveBiometricEnrollment,
} from "@/lib/auth/biometric-store";
import {
  enrollUnlockCredential,
  isBiometricUnlockAvailable,
  type PasskeyError,
  signalUnlockRemoved,
  unlockWithBiometric,
} from "@/lib/auth/platform-unlock";

function mockMobileHost(biometric: Record<string, unknown>) {
  window.gnhMobile = {
    sendCommand: vi.fn(),
    onBridgeEvent: vi.fn(() => () => {}),
    biometric,
    securePrefs: {
      get: vi.fn(async () => ({ value: null })),
      set: vi.fn(async () => ({ ok: true })),
      remove: vi.fn(async () => ({ ok: true })),
    },
  };
}

describe("platform-unlock (mobile native)", () => {
  beforeEach(() => {
    clearMemoryBiometricStorage();
    setBiometricStorageAdapter(memoryBiometricStorage);
  });

  afterEach(() => {
    delete window.gnhMobile;
  });

  it("reports unavailable without gnhMobile", async () => {
    delete window.gnhMobile;
    expect(await isBiometricUnlockAvailable()).toBe(false);
  });

  it("enrolls and persists credential metadata", async () => {
    mockMobileHost({
      isAvailable: vi.fn(async () => ({ available: true })),
      enrollDataUnlock: vi.fn(async () => ({ credentialId: "cred-new" })),
      unlockDataUnlock: vi.fn(),
      removeCredential: vi.fn(),
    });
    const cred = await enrollUnlockCredential("default", "secret-pass", "ccx1");
    expect(cred.credentialId).toBe("cred-new");
    const stored = await getBiometricEnrollment();
    expect(stored?.credentials).toHaveLength(1);
    expect(stored?.address).toBe("ccx1");
  });

  it("unlocks via native bridge and returns password", async () => {
    mockMobileHost({
      isAvailable: vi.fn(async () => ({ available: true })),
      enrollDataUnlock: vi.fn(),
      unlockDataUnlock: vi.fn(async () => ({ password: "recovered" })),
      removeCredential: vi.fn(),
    });
    const enrollment = {
      version: 2 as const,
      credentials: [
        { credentialId: "cred-1", label: "This device", createdAt: "" },
      ],
    };
    const password = await unlockWithBiometric("default", enrollment);
    expect(password).toBe("recovered");
  });

  it("maps cancelled unlock to PasskeyError", async () => {
    mockMobileHost({
      isAvailable: vi.fn(async () => ({ available: true })),
      unlockDataUnlock: vi.fn(async () => ({ error: "cancelled" })),
    });
    await expect(
      unlockWithBiometric("default", {
        version: 2,
        credentials: [
          { credentialId: "c", label: "This device", createdAt: "" },
        ],
      }),
    ).rejects.toMatchObject({
      code: "cancelled" satisfies PasskeyError["code"],
    });
  });

  it("rejects duplicate enrollment", async () => {
    mockMobileHost({
      enrollDataUnlock: vi.fn(async () => ({ credentialId: "dup" })),
    });
    await saveBiometricEnrollment({
      version: 2,
      credentials: [
        { credentialId: "dup", label: "This device", createdAt: "" },
      ],
    });
    await expect(
      enrollUnlockCredential("default", "pass"),
    ).rejects.toMatchObject({
      code: "already-enrolled",
    });
  });

  it("signalUnlockRemoved delegates to native removeCredential", async () => {
    const removeCredential = vi.fn(async () => ({ ok: true }));
    mockMobileHost({ removeCredential });
    await signalUnlockRemoved("cred-x");
    expect(removeCredential).toHaveBeenCalledWith("cred-x");
  });
});
