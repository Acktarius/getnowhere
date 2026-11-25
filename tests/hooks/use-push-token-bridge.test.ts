import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ mobile: false }));
const resume = vi.fn();
const init = vi.fn(() => () => undefined);

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => flags.mobile,
}));

vi.mock("@/lib/mobile/ntfyWakeBridge", () => ({
  resumeAndroidWakeSubscriptions: () => resume(),
}));

vi.mock("@/lib/mobile/pushTokenBridge", () => ({
  initPushTokenBridge: () => init(),
}));

describe("usePushTokenBridge", () => {
  beforeEach(() => {
    flags.mobile = false;
    resume.mockClear();
    init.mockClear();
  });

  it("resumes Android wake subscriptions when the mobile shell boots", async () => {
    flags.mobile = true;
    const { usePushTokenBridge } = await import("@/hooks/usePushTokenBridge");
    renderHook(() => usePushTokenBridge());
    expect(resume).toHaveBeenCalled();
    expect(init).toHaveBeenCalled();
  });

  it("does nothing outside the mobile shell", async () => {
    const { usePushTokenBridge } = await import("@/hooks/usePushTokenBridge");
    renderHook(() => usePushTokenBridge());
    expect(resume).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
  });
});
