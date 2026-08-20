import { beforeEach, describe, expect, it, vi } from "vitest";
import { runBackgroundRemoteSync } from "@/lib/mobile/backgroundRemoteSync";

const sync = vi.fn();
const isSyncInProgress = vi.fn();
const isUnlocked = vi.fn();

vi.mock("@/services/conceal/sync/runtime", () => ({
  sync: (...args: unknown[]) => sync(...args),
  isSyncInProgress: () => isSyncInProgress(),
  isUnlocked: () => isUnlocked(),
}));

vi.mock("@/lib/mobile/AppAccessController", () => ({
  isAppAccessLocked: () => false,
}));

const scanAndPublishSyncNotifications = vi.fn();
vi.mock("@/services/notifications/scanSyncNotifications", () => ({
  scanAndPublishSyncNotifications: (...args: unknown[]) =>
    scanAndPublishSyncNotifications(...args),
}));

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => true,
}));

describe("runBackgroundRemoteSync", () => {
  beforeEach(() => {
    sync.mockReset();
    isSyncInProgress.mockReset();
    isUnlocked.mockReset();
    scanAndPublishSyncNotifications.mockReset();
    scanAndPublishSyncNotifications.mockResolvedValue(undefined);
    window.gnhMobile = {};
    window.ReactNativeWebView = { postMessage: vi.fn() };
  });

  it("skips when sync already in progress but still scans notifications", async () => {
    isUnlocked.mockReturnValue(true);
    isSyncInProgress.mockReturnValue(true);
    const outcome = await runBackgroundRemoteSync("req-1");
    expect(outcome).toBe("skipped_in_progress");
    expect(sync).not.toHaveBeenCalled();
    expect(scanAndPublishSyncNotifications).toHaveBeenCalledOnce();
  });

  it("calls sync when unlocked and idle", async () => {
    isUnlocked.mockReturnValue(true);
    isSyncInProgress.mockReturnValue(false);
    sync.mockResolvedValue(100);
    const outcome = await runBackgroundRemoteSync("req-2");
    expect(outcome).toBe("completed");
    expect(sync).toHaveBeenCalledOnce();
  });

  it("returns no_op when wallet is locked", async () => {
    isUnlocked.mockReturnValue(false);
    const outcome = await runBackgroundRemoteSync("req-3");
    expect(outcome).toBe("no_op");
    expect(sync).not.toHaveBeenCalled();
  });
});
