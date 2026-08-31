import { beforeEach, describe, expect, it, vi } from "vitest";

const isMobileHostMock = vi.fn<() => boolean>();
const onAppAccessLifecycleMock = vi.fn<[(type: string) => void], () => void>();
const flushSyncCheckpointMock = vi.fn<[], Promise<void>>();
const flushChatTranscriptsOnHideMock = vi.fn<[], Promise<void>>();

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => isMobileHostMock(),
}));

vi.mock("@/lib/mobile/AppAccessController", () => ({
  onAppAccessLifecycle: (handler: (type: string) => void) =>
    onAppAccessLifecycleMock(handler),
}));

vi.mock("@/services/conceal/sync/runtime", () => ({
  flushSyncCheckpoint: () => flushSyncCheckpointMock(),
}));

vi.mock("@/services/p2p/HolepunchChatTransport", () => ({
  flushChatTranscriptsOnHide: () => flushChatTranscriptsOnHideMock(),
}));

describe("installSyncLifecycleCheckpoint", () => {
  beforeEach(() => {
    isMobileHostMock.mockReset();
    onAppAccessLifecycleMock.mockReset();
    flushSyncCheckpointMock.mockReset();
    flushSyncCheckpointMock.mockResolvedValue(undefined);
    flushChatTranscriptsOnHideMock.mockReset();
    flushChatTranscriptsOnHideMock.mockResolvedValue(undefined);
  });

  async function load() {
    vi.resetModules();
    const mod = await import("@/lib/mobile/syncLifecycleCheckpoint");
    return mod.installSyncLifecycleCheckpoint;
  }

  it("returns no-op and skips onAppAccessLifecycle on non-mobile host", async () => {
    isMobileHostMock.mockReturnValue(false);
    const install = await load();
    const unsub = install();
    expect(onAppAccessLifecycleMock).not.toHaveBeenCalled();
    expect(typeof unsub).toBe("function");
    unsub(); // must not throw
  });

  it("calls onAppAccessLifecycle and returns the unsubscribe on mobile host", async () => {
    isMobileHostMock.mockReturnValue(true);
    const fakeUnsub = vi.fn();
    onAppAccessLifecycleMock.mockReturnValue(fakeUnsub);
    const install = await load();
    const unsub = install();
    expect(onAppAccessLifecycleMock).toHaveBeenCalledOnce();
    expect(unsub).toBe(fakeUnsub);
  });

  it("calls flushChat then flushSync when lifecycle type is 'background'", async () => {
    isMobileHostMock.mockReturnValue(true);
    let capturedHandler: ((type: string) => void) | undefined;
    onAppAccessLifecycleMock.mockImplementation((h) => {
      capturedHandler = h;
      return vi.fn();
    });
    const order: string[] = [];
    flushChatTranscriptsOnHideMock.mockImplementation(async () => {
      order.push("chat");
    });
    flushSyncCheckpointMock.mockImplementation(async () => {
      order.push("sync");
    });
    const install = await load();
    install();
    capturedHandler!("background");
    await vi.waitFor(() => {
      expect(flushChatTranscriptsOnHideMock).toHaveBeenCalledOnce();
      expect(flushSyncCheckpointMock).toHaveBeenCalledOnce();
    });
    expect(order).toEqual(["chat", "sync"]);
  });

  it("calls flushChat then flushSync when lifecycle type is 'screenOff'", async () => {
    isMobileHostMock.mockReturnValue(true);
    let capturedHandler: ((type: string) => void) | undefined;
    onAppAccessLifecycleMock.mockImplementation((h) => {
      capturedHandler = h;
      return vi.fn();
    });
    const install = await load();
    install();
    capturedHandler!("screenOff");
    await vi.waitFor(() => {
      expect(flushChatTranscriptsOnHideMock).toHaveBeenCalledOnce();
      expect(flushSyncCheckpointMock).toHaveBeenCalledOnce();
    });
  });

  it("on non-mobile host flushes transcripts when the tab becomes hidden", async () => {
    isMobileHostMock.mockReturnValue(false);
    const install = await load();
    const unsub = install();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flushChatTranscriptsOnHideMock).toHaveBeenCalledOnce();
    expect(flushSyncCheckpointMock).not.toHaveBeenCalled();
    unsub();
  });

  it("on non-mobile host flushes transcripts on pagehide", async () => {
    isMobileHostMock.mockReturnValue(false);
    const install = await load();
    const unsub = install();
    window.dispatchEvent(new Event("pagehide"));
    expect(flushChatTranscriptsOnHideMock).toHaveBeenCalledOnce();
    unsub();
  });

  it("does NOT call flushSyncCheckpoint when lifecycle type is 'foreground'", async () => {
    isMobileHostMock.mockReturnValue(true);
    let capturedHandler: ((type: string) => void) | undefined;
    onAppAccessLifecycleMock.mockImplementation((h) => {
      capturedHandler = h;
      return vi.fn();
    });
    const install = await load();
    install();
    capturedHandler!("foreground");
    expect(flushSyncCheckpointMock).not.toHaveBeenCalled();
    expect(flushChatTranscriptsOnHideMock).not.toHaveBeenCalled();
  });
});
