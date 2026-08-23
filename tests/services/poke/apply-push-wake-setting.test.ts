import { beforeEach, describe, expect, it, vi } from "vitest";

const setPrivacy = vi.fn();
const bridgeRequestNotificationPermissions = vi.fn();
const bridgeRequestPokeTokenRefresh = vi.fn();

vi.mock("@/state/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ setPrivacy }),
  },
}));

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: vi.fn(() => true),
}));

vi.mock("@/lib/mobile/nativeNotificationsBridge", () => ({
  bridgeRequestNotificationPermissions: (...args: unknown[]) =>
    bridgeRequestNotificationPermissions(...args),
}));

vi.mock("@/lib/mobile/pokeNativeBridge", () => ({
  bridgeRequestPokeTokenRefresh: () => bridgeRequestPokeTokenRefresh(),
}));

describe("applyPushWakeEnabled", () => {
  beforeEach(() => {
    setPrivacy.mockClear();
    bridgeRequestNotificationPermissions.mockClear();
    bridgeRequestPokeTokenRefresh.mockClear();
    vi.resetModules();
  });

  it("persists opt-out without requesting native permissions", async () => {
    const { applyPushWakeEnabled } = await import(
      "@/services/poke/applyPushWakeSetting"
    );
    applyPushWakeEnabled(false);
    expect(setPrivacy).toHaveBeenCalledWith({ pushWakeEnabled: false });
    expect(bridgeRequestNotificationPermissions).not.toHaveBeenCalled();
    expect(bridgeRequestPokeTokenRefresh).not.toHaveBeenCalled();
  });

  it("persists opt-in and requests OS permission + token refresh on mobile", async () => {
    const { applyPushWakeEnabled } = await import(
      "@/services/poke/applyPushWakeSetting"
    );
    applyPushWakeEnabled(true);
    expect(setPrivacy).toHaveBeenCalledWith({ pushWakeEnabled: true });
    expect(bridgeRequestNotificationPermissions).toHaveBeenCalledWith({
      badge: true,
      alert: true,
    });
    expect(bridgeRequestPokeTokenRefresh).toHaveBeenCalledTimes(1);
  });

  it("skips native calls when not on mobile host", async () => {
    const { isMobileHost } = await import("@/lib/mobile/gnhMobileBridgeTypes");
    vi.mocked(isMobileHost).mockReturnValue(false);
    const { applyPushWakeEnabled } = await import(
      "@/services/poke/applyPushWakeSetting"
    );
    applyPushWakeEnabled(true);
    expect(setPrivacy).toHaveBeenCalledWith({ pushWakeEnabled: true });
    expect(bridgeRequestNotificationPermissions).not.toHaveBeenCalled();
    expect(bridgeRequestPokeTokenRefresh).not.toHaveBeenCalled();
  });
});
