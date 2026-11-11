import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registerPokeHandle = vi.fn(async () => undefined);

let mockIsMobileHost = true;
let pushWakeEnabled = true;
let pokeHandler: ((platform: "apns", token: string) => void) | null = null;

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => mockIsMobileHost,
}));

vi.mock("@/services/poke/pokeGatewayClient", () => ({
  registerPokeHandle: (...args: unknown[]) => registerPokeHandle(...args),
}));

vi.mock("@/state/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ privacy: { pushWakeEnabled } }),
  },
}));

describe("initPushTokenBridge", () => {
  beforeEach(() => {
    mockIsMobileHost = true;
    pushWakeEnabled = true;
    pokeHandler = null;
    registerPokeHandle.mockClear();
    window.gnhMobile = {
      onPokeToken(handler: (platform: "apns", token: string) => void) {
        pokeHandler = handler;
        return () => {
          pokeHandler = null;
        };
      },
    };
    vi.resetModules();
  });

  afterEach(() => {
    delete window.gnhMobile;
  });

  it("no-ops off mobile host", async () => {
    mockIsMobileHost = false;
    const { initPushTokenBridge } = await import(
      "@/lib/mobile/pushTokenBridge"
    );
    const cleanup = initPushTokenBridge();
    expect(pokeHandler).toBeNull();
    cleanup();
  });

  it("registers APNs tokens when push wake is enabled", async () => {
    const { initPushTokenBridge } = await import(
      "@/lib/mobile/pushTokenBridge"
    );
    const cleanup = initPushTokenBridge();
    expect(pokeHandler).toBeTypeOf("function");
    pokeHandler!("apns", "device-token");
    await vi.waitFor(() => {
      expect(registerPokeHandle).toHaveBeenCalledWith("apns", "device-token");
    });
    cleanup();
  });

  it("skips registration when push wake is disabled", async () => {
    pushWakeEnabled = false;
    const { initPushTokenBridge } = await import(
      "@/lib/mobile/pushTokenBridge"
    );
    initPushTokenBridge();
    pokeHandler!("apns", "device-token");
    await Promise.resolve();
    expect(registerPokeHandle).not.toHaveBeenCalled();
  });
});
