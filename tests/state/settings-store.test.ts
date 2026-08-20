import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorage } from "@/services/storage/StorageAdapter";

describe("settingsStore biometric migration", () => {
  beforeEach(() => {
    getStorage().removeItem("gnh.settings");
    vi.resetModules();
  });

  it("migrates legacy biometricEnabled to dataUnlockBiometricEnabled", async () => {
    getStorage().setItem(
      "gnh.settings",
      JSON.stringify({ biometricEnabled: true, theme: "light" }),
    );
    const { useSettingsStore } = await import("@/state/settingsStore");
    const s = useSettingsStore.getState();
    expect(s.dataUnlockBiometricEnabled).toBe(true);
    expect(s.appAccessBiometricEnabled).toBe(false);
    expect(s.theme).toBe("light");
    expect(s.showTips).toBe(true);
  });

  it("persists showTips preference", async () => {
    const { useSettingsStore } = await import("@/state/settingsStore");
    useSettingsStore.getState().setShowTips(false);
    expect(
      JSON.parse(getStorage().getItem("gnh.settings") ?? "{}").showTips,
    ).toBe(false);
  });
});
