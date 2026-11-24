import { beforeEach, describe, expect, it, vi } from "vitest";

const rn = vi.hoisted(() => {
  const remove = vi.fn();
  const addListener = vi.fn(() => ({ remove }));
  const emitterModules: unknown[] = [];
  class NativeEventEmitter {
    constructor(module: unknown) {
      emitterModules.push(module);
    }
    addListener = addListener;
  }
  return {
    Platform: { OS: "ios" as string },
    NativeModules: {} as Record<string, unknown>,
    NativeEventEmitter,
    addListener,
    remove,
    emitterModules,
  };
});

vi.mock("react-native", () => rn);

import { installNotificationTapListener } from "../../native-wrapper/src/installNotificationTapListener";

describe("installNotificationTapListener", () => {
  beforeEach(() => {
    rn.Platform.OS = "ios";
    rn.NativeModules = {};
    rn.addListener.mockClear();
    rn.remove.mockClear();
    rn.emitterModules.length = 0;
  });

  it("subscribes once to gnhNotificationTap on the GnhNotifications module (iOS)", () => {
    const module = { name: "GnhNotifications" };
    rn.NativeModules.GnhNotifications = module;

    installNotificationTapListener();

    expect(rn.emitterModules).toEqual([module]);
    expect(rn.addListener).toHaveBeenCalledTimes(1);
    expect(rn.addListener).toHaveBeenCalledWith(
      "gnhNotificationTap",
      expect.any(Function),
    );
  });

  it("cleanup removes the subscription", () => {
    rn.NativeModules.GnhNotifications = {};

    const cleanup = installNotificationTapListener();
    expect(rn.remove).not.toHaveBeenCalled();
    cleanup();

    expect(rn.remove).toHaveBeenCalledTimes(1);
  });

  it("is a no-op on Android", () => {
    rn.Platform.OS = "android";
    rn.NativeModules.GnhNotifications = {};

    const cleanup = installNotificationTapListener();
    cleanup();

    expect(rn.addListener).not.toHaveBeenCalled();
    expect(rn.remove).not.toHaveBeenCalled();
  });

  it("is a no-op when the native module is missing", () => {
    const cleanup = installNotificationTapListener();
    cleanup();

    expect(rn.emitterModules).toEqual([]);
    expect(rn.addListener).not.toHaveBeenCalled();
  });
});
