import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorage } from "@/services/storage/StorageAdapter";

const deletePokeHandle = vi.fn(async () => undefined);
const unsubscribeAll = vi.fn();
let mockIsMobileAndroid = false;

vi.mock("@/services/poke/pokeGatewayClient", () => ({
  deletePokeHandle: () => deletePokeHandle(),
}));

vi.mock("@/lib/mobile/ntfyWakeBridge", () => ({
  unsubscribeAll: () => unsubscribeAll(),
}));

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileAndroid: () => mockIsMobileAndroid,
  isMobileHost: () => true,
}));

describe("settingsStore pushWakeEnabled", () => {
  beforeEach(() => {
    getStorage().removeItem("gnh.settings");
    deletePokeHandle.mockClear();
    unsubscribeAll.mockClear();
    mockIsMobileAndroid = false;
    vi.resetModules();
  });

  it("defaults pushWakeEnabled to false", async () => {
    const { useSettingsStore } = await import("@/state/settingsStore");
    expect(useSettingsStore.getState().privacy.pushWakeEnabled).toBe(false);
  });

  it("persists pushWakeEnabled when toggled on (requires notificationsEnabled)", async () => {
    const { useSettingsStore } = await import("@/state/settingsStore");
    useSettingsStore
      .getState()
      .setPrivacy({ notificationsEnabled: true, pushWakeEnabled: true });
    expect(
      JSON.parse(getStorage().getItem("gnh.settings") ?? "{}").privacy
        .pushWakeEnabled,
    ).toBe(true);
  });

  it("cannot enable pushWakeEnabled while notificationsEnabled is off", async () => {
    const { useSettingsStore } = await import("@/state/settingsStore");
    useSettingsStore.getState().setPrivacy({ pushWakeEnabled: true });
    expect(useSettingsStore.getState().privacy.pushWakeEnabled).toBe(false);
  });

  it("on iOS opt-out: calls deletePokeHandle, NOT ntfyWakeBridge.unsubscribeAll", async () => {
    mockIsMobileAndroid = false;
    const { useSettingsStore } = await import("@/state/settingsStore");
    useSettingsStore
      .getState()
      .setPrivacy({ notificationsEnabled: true, pushWakeEnabled: true });
    deletePokeHandle.mockClear();
    unsubscribeAll.mockClear();
    useSettingsStore.getState().setPrivacy({ pushWakeEnabled: false });
    await vi.waitFor(() => {
      expect(deletePokeHandle).toHaveBeenCalledTimes(1);
    });
    expect(unsubscribeAll).not.toHaveBeenCalled();
  });

  it("on Android opt-out: calls ntfyWakeBridge.unsubscribeAll, NOT deletePokeHandle", async () => {
    mockIsMobileAndroid = true;
    const { useSettingsStore } = await import("@/state/settingsStore");
    useSettingsStore
      .getState()
      .setPrivacy({ notificationsEnabled: true, pushWakeEnabled: true });
    deletePokeHandle.mockClear();
    unsubscribeAll.mockClear();
    useSettingsStore.getState().setPrivacy({ pushWakeEnabled: false });
    await vi.waitFor(() => {
      expect(unsubscribeAll).toHaveBeenCalledTimes(1);
    });
    expect(deletePokeHandle).not.toHaveBeenCalled();
  });

  it("no cleanup called when pushWakeEnabled is already false", async () => {
    const { useSettingsStore } = await import("@/state/settingsStore");
    // pushWakeEnabled defaults to false — setting it to false again is a no-op
    useSettingsStore.getState().setPrivacy({ pushWakeEnabled: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(deletePokeHandle).not.toHaveBeenCalled();
    expect(unsubscribeAll).not.toHaveBeenCalled();
  });

  it("clears pushWakeEnabled when notificationsEnabled is turned off", async () => {
    const { useSettingsStore } = await import("@/state/settingsStore");
    useSettingsStore
      .getState()
      .setPrivacy({ notificationsEnabled: true, pushWakeEnabled: true });
    deletePokeHandle.mockClear();
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: false });
    const state = useSettingsStore.getState();
    expect(state.privacy.pushWakeEnabled).toBe(false);
    expect(state.privacy.notificationBannersEnabled).toBe(false);
    await vi.waitFor(() => {
      expect(deletePokeHandle).toHaveBeenCalledTimes(1);
    });
  });
});
