import { describe, expect, it, vi } from "vitest";
import {
  gnhSecurePrefsGet,
  isGnhBiometricAvailable,
} from "@/lib/mobile/gnh-biometric-unlock";

describe("gnh-biometric-unlock client", () => {
  it("returns false when gnhMobile absent", async () => {
    delete window.gnhMobile;
    expect(await isGnhBiometricAvailable("data")).toBe(false);
    expect(await gnhSecurePrefsGet("key")).toBeNull();
  });

  it("delegates to injected biometric bridge", async () => {
    window.gnhMobile = {
      sendCommand: vi.fn(),
      onBridgeEvent: vi.fn(() => () => {}),
      biometric: {
        isAvailable: vi.fn(async () => ({ available: true })),
        enrollDataUnlock: vi.fn(),
        unlockDataUnlock: vi.fn(),
        enrollAppAccess: vi.fn(),
        unlockAppAccess: vi.fn(),
        removeCredential: vi.fn(),
      },
      securePrefs: {
        get: vi.fn(async () => ({ value: "x" })),
        set: vi.fn(),
        remove: vi.fn(),
      },
    };
    expect(await isGnhBiometricAvailable("data")).toBe(true);
    expect(await gnhSecurePrefsGet("k")).toBe("x");
  });
});
