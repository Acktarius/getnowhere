import { beforeEach, describe, expect, it, vi } from "vitest";

const setPrivacy = vi.fn();
const subscribeAll = vi.fn();
const bridgeRequestNotificationPermissions = vi.fn();
const bridgeRequestPokeTokenRefresh = vi.fn();

let mockIsMobileHost = true;
let mockIsMobileAndroid = false;

vi.mock("@/state/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ setPrivacy }),
  },
}));

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => mockIsMobileHost,
  isMobileAndroid: () => mockIsMobileAndroid,
}));

vi.mock("@/lib/mobile/nativeNotificationsBridge", () => ({
  bridgeRequestNotificationPermissions: (...args: unknown[]) =>
    bridgeRequestNotificationPermissions(...args),
}));

vi.mock("@/lib/mobile/pokeNativeBridge", () => ({
  bridgeRequestPokeTokenRefresh: () => bridgeRequestPokeTokenRefresh(),
}));

vi.mock("@/lib/mobile/ntfyWakeBridge", () => ({
  subscribeAll: (...args: unknown[]) => subscribeAll(...args),
}));

describe("applyPushWakeEnabled", () => {
  beforeEach(() => {
    setPrivacy.mockClear();
    subscribeAll.mockClear();
    bridgeRequestNotificationPermissions.mockClear();
    bridgeRequestPokeTokenRefresh.mockClear();
    mockIsMobileHost = true;
    mockIsMobileAndroid = false;
    vi.resetModules();
  });

  it("on=false: persists opt-out without any bridge calls", async () => {
    const { applyPushWakeEnabled } = await import(
      "@/services/poke/applyPushWakeSetting"
    );
    applyPushWakeEnabled(false);
    expect(setPrivacy).toHaveBeenCalledWith({ pushWakeEnabled: false });
    expect(bridgeRequestNotificationPermissions).not.toHaveBeenCalled();
    expect(bridgeRequestPokeTokenRefresh).not.toHaveBeenCalled();
    expect(subscribeAll).not.toHaveBeenCalled();
  });

  it("on=true + Android: calls bridgeRequestNotificationPermissions then subscribeAll, NOT bridgeRequestPokeTokenRefresh", async () => {
    mockIsMobileAndroid = true;
    const { applyPushWakeEnabled } = await import(
      "@/services/poke/applyPushWakeSetting"
    );
    applyPushWakeEnabled(true);
    expect(setPrivacy).toHaveBeenCalledWith({ pushWakeEnabled: true });
    expect(bridgeRequestNotificationPermissions).toHaveBeenCalledWith({
      badge: true,
      alert: true,
    });
    expect(subscribeAll).toHaveBeenCalledTimes(1);
    expect(bridgeRequestPokeTokenRefresh).not.toHaveBeenCalled();
  });

  it("on=true + iOS: calls bridgeRequestNotificationPermissions then bridgeRequestPokeTokenRefresh, NOT subscribeAll", async () => {
    mockIsMobileAndroid = false;
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
    expect(subscribeAll).not.toHaveBeenCalled();
  });

  it("on=true + non-mobile: no bridge calls at all", async () => {
    mockIsMobileHost = false;
    const { applyPushWakeEnabled } = await import(
      "@/services/poke/applyPushWakeSetting"
    );
    applyPushWakeEnabled(true);
    expect(setPrivacy).toHaveBeenCalledWith({ pushWakeEnabled: true });
    expect(bridgeRequestNotificationPermissions).not.toHaveBeenCalled();
    expect(bridgeRequestPokeTokenRefresh).not.toHaveBeenCalled();
    expect(subscribeAll).not.toHaveBeenCalled();
  });
});
