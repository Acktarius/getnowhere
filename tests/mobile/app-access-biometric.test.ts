import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enrollAppAccessBiometric,
  isAppAccessBiometricAvailable,
  unlockAppAccessBiometric,
} from "@/lib/mobile/app-access-biometric";

describe("app-access-biometric", () => {
  afterEach(() => {
    delete window.gnhMobile;
  });

  it("returns false without gnhMobile", async () => {
    expect(await isAppAccessBiometricAvailable()).toBe(false);
  });

  it("enrolls and unlocks via native bridge", async () => {
    window.gnhMobile = {
      sendCommand: vi.fn(),
      onBridgeEvent: vi.fn(() => () => {}),
      biometric: {
        isAvailable: vi.fn(async () => ({ available: true })),
        enrollAppAccess: vi.fn(async () => ({ credentialId: "app-cred" })),
        unlockAppAccess: vi.fn(async () => ({ ok: true })),
        enrollDataUnlock: vi.fn(),
        unlockDataUnlock: vi.fn(),
        removeCredential: vi.fn(),
      },
      securePrefs: {
        get: vi.fn(async () => ({ value: null })),
        set: vi.fn(),
        remove: vi.fn(),
      },
    };
    expect(await isAppAccessBiometricAvailable()).toBe(true);
    await enrollAppAccessBiometric();
    await unlockAppAccessBiometric();
  });
});
