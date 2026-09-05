import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppAccessLocked } from "@/hooks/useAppAccessLocked";
import { useMobileAppAccess } from "@/hooks/useMobileAppAccess";
import { reconcileBiometricSettingsWithEnrollments } from "@/lib/auth/biometric-lifecycle";
import { initMobileBiometricStorage } from "@/lib/auth/biometric-storage";
import { PasskeyError } from "@/lib/auth/passkey-error";
import {
  _resetAppAccessControllerForTests,
  APP_ACCESS_BACKGROUND_AT_KEY,
} from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { AppLockScreen } from "@/screens/AppLockScreen";
import { isOnboarded, markOnboarded, useAuthStore } from "@/state/authStore";
import { useSettingsStore } from "@/state/settingsStore";

const unlockAppAccessBiometric = vi.fn(async () => undefined);

vi.mock("@/lib/mobile/app-access-biometric", () => ({
  unlockAppAccessBiometric: (...args: unknown[]) =>
    unlockAppAccessBiometric(...args),
  isAppAccessBiometricAvailable: vi.fn(async () => true),
  enrollAppAccessBiometric: vi.fn(async () => undefined),
  clearAppAccessBiometric: vi.fn(async () => undefined),
}));

/** Mirrors App.tsx app-access gate + startup init (without full router/wallet). */
function MobileAppAccessHarness() {
  useMobileAppAccess();
  const init = useAuthStore((s) => s.init);
  const appAccessLocked = useAppAccessLocked();
  const appAccessBiometricEnabled = useSettingsStore(
    (s) => s.appAccessBiometricEnabled,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void init().then(async () => {
      if (isMobileHost()) {
        await initMobileBiometricStorage();
        await reconcileBiometricSettingsWithEnrollments();
      }
      setReady(true);
    });
  }, [init]);

  if (!ready) return <div data-testid="booting">booting</div>;

  if (
    isOnboarded() &&
    isMobileHost() &&
    appAccessBiometricEnabled &&
    appAccessLocked
  ) {
    return <AppLockScreen />;
  }

  return <div data-testid="main-app">Main app</div>;
}

function installGnhMobile(opts?: { appAccessCredentialId?: string | null }) {
  const appAccessCredentialId =
    opts && "appAccessCredentialId" in opts
      ? opts.appAccessCredentialId
      : "test-cred";
  window.gnhMobile = {
    onLifecycle: vi.fn(() => () => {}),
    setLockGeneration: vi.fn(),
    biometric: {
      isAvailable: vi.fn(async () => ({ available: true })),
      enrollAppAccess: vi.fn(async () => ({ credentialId: "test-cred" })),
      unlockAppAccess: vi.fn(async () => ({ ok: true })),
      enrollDataUnlock: vi.fn(async () => ({ credentialId: "data-cred" })),
      unlockDataUnlock: vi.fn(async () => ({ password: "pw" })),
      removeCredential: vi.fn(async () => ({ ok: true })),
    },
    securePrefs: {
      get: vi.fn(async (key: string) => ({
        value:
          key === "gnh.appAccessCredentialId" ? appAccessCredentialId : null,
      })),
      set: vi.fn(async () => ({ ok: true })),
      remove: vi.fn(async () => ({ ok: true })),
    },
  };
}

function mockFirstUnlockSucceedsThenReject() {
  unlockAppAccessBiometric.mockImplementation(async () => {
    if (unlockAppAccessBiometric.mock.calls.length > 1) {
      throw new PasskeyError("cancelled", "Biometric unlock was cancelled.");
    }
  });
}

function seedAppAccessSettings(autoLockTimeoutSec: number) {
  useSettingsStore.setState((s) => ({
    ...s,
    appAccessBiometricEnabled: true,
    privacy: { ...s.privacy, autoLockTimeoutSec },
  }));
}

describe("mobile app-access idle integration", () => {
  beforeEach(() => {
    _resetAppAccessControllerForTests();
    localStorage.clear();
    markOnboarded();
    useAuthStore.setState({ unlocked: true, busy: false, error: null });
    seedAppAccessSettings(60);
    installGnhMobile();
    unlockAppAccessBiometric.mockReset();
    unlockAppAccessBiometric.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    delete window.gnhMobile;
    _resetAppAccessControllerForTests();
  });

  it("App.tsx awaits reconcileBiometricSettingsWithEnrollments before ready", () => {
    const src = readFileSync(resolve(__dirname, "../../src/App.tsx"), "utf8");
    expect(src).toContain("reconcileBiometricSettingsWithEnrollments");
    expect(src).toContain("initMobileBiometricStorage");
    expect(src).toMatch(
      /initMobileBiometricStorage[\s\S]*reconcileBiometricSettingsWithEnrollments[\s\S]*setReady\(true\)/,
    );
  });

  it("skips App lock after boot when flag is stale and enrollment is missing", async () => {
    installGnhMobile({ appAccessCredentialId: null });
    unlockAppAccessBiometric.mockRejectedValue(
      new PasskeyError("cancelled", "Biometric unlock was cancelled."),
    );

    render(<MobileAppAccessHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("main-app")).toBeInTheDocument();
    });
    expect(screen.queryByText("App lock")).toBeNull();
    expect(useSettingsStore.getState().appAccessBiometricEnabled).toBe(false);
  });

  it("keeps App lock after init when biometrics fail (no init bypass)", async () => {
    localStorage.setItem(
      APP_ACCESS_BACKGROUND_AT_KEY,
      String(Date.now() - 120_000),
    );
    unlockAppAccessBiometric.mockRejectedValue(
      new PasskeyError("cancelled", "Biometric unlock was cancelled."),
    );

    render(<MobileAppAccessHarness />);

    await waitFor(() => {
      expect(screen.getByText("App lock")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("main-app")).toBeNull();
  });

  it("shows App lock after idle when foreground and inactive", async () => {
    seedAppAccessSettings(1);
    mockFirstUnlockSucceedsThenReject();

    render(<MobileAppAccessHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("main-app")).toBeInTheDocument();
    });

    expect(screen.queryByText("App lock")).toBeNull();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    });

    await waitFor(() => {
      expect(screen.getByText("App lock")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("main-app")).toBeNull();
  });

  it("resets idle timer on user activity", async () => {
    seedAppAccessSettings(1);
    mockFirstUnlockSucceedsThenReject();

    render(<MobileAppAccessHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("main-app")).toBeInTheDocument();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(screen.queryByText("App lock")).toBeNull();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    await waitFor(() => {
      expect(screen.getByText("App lock")).toBeInTheDocument();
    });
  });
});
