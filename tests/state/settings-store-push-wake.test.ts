import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorage } from "@/services/storage/StorageAdapter";

const deletePokeHandle = vi.fn(async () => undefined);

vi.mock("@/services/poke/pokeGatewayClient", () => ({
  deletePokeHandle: () => deletePokeHandle(),
}));

describe("settingsStore pushWakeEnabled", () => {
  beforeEach(() => {
    getStorage().removeItem("gnh.settings");
    deletePokeHandle.mockClear();
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

  it("calls deletePokeHandle when pushWakeEnabled is turned off", async () => {
    const { useSettingsStore } = await import("@/state/settingsStore");
    useSettingsStore
      .getState()
      .setPrivacy({ notificationsEnabled: true, pushWakeEnabled: true });
    deletePokeHandle.mockClear();
    useSettingsStore.getState().setPrivacy({ pushWakeEnabled: false });
    await vi.waitFor(() => {
      expect(deletePokeHandle).toHaveBeenCalledTimes(1);
    });
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
