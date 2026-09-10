import { resetExpoFileSystemStub } from "expo-file-system";
import { StorageAccessFramework } from "expo-file-system/legacy";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { Platform } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveTextFileResult } from "../../native-wrapper/src/buildSaveTextFileResolveScript";
import { buildSaveTextFileResolveScript } from "../../native-wrapper/src/buildSaveTextFileResolveScript";
import { handleSaveTextFileWebViewMessage } from "../../native-wrapper/src/saveTextFileFromWebView";

const {
  getUriForDirectoryInRoot,
  requestDirectoryPermissionsAsync,
  createFileAsync,
  writeAsStringAsync,
} = StorageAccessFramework;

function saveCommand(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    channel: "gnh-file",
    direction: "command",
    requestId: "req-1",
    filename: "wallet-backup.json",
    content: '{"v":1}',
    ...overrides,
  });
}

async function runSave(
  raw: string,
): Promise<{ handled: boolean; result: SaveTextFileResult | null }> {
  let result: SaveTextFileResult | null = null;
  const handled = handleSaveTextFileWebViewMessage(raw, (r) => {
    result = r;
  });
  if (handled) {
    await vi.waitFor(() => expect(result).not.toBeNull());
  }
  return { handled, result };
}

describe("buildSaveTextFileResolveScript", () => {
  it("dispatches save result into the WebView", () => {
    const script = buildSaveTextFileResolveScript({
      requestId: "req-1",
      ok: true,
    });
    expect(script).toContain("_resolveSaveTextFile");
    expect(script).toContain('"requestId":"req-1"');
  });
});

describe("handleSaveTextFileWebViewMessage", () => {
  beforeEach(() => {
    Platform.OS = "android";
    resetExpoFileSystemStub();
    vi.mocked(isAvailableAsync).mockReset().mockResolvedValue(true);
    vi.mocked(shareAsync).mockReset().mockResolvedValue(undefined);
    vi.mocked(getUriForDirectoryInRoot).mockClear();
    vi.mocked(requestDirectoryPermissionsAsync).mockReset().mockResolvedValue({
      granted: true,
      directoryUri: "content://tree/primary%3ADownload",
    });
    vi.mocked(createFileAsync)
      .mockReset()
      .mockImplementation(
        async (_dir: string, baseName: string, _mime: string) =>
          `content://tree/primary/document/${baseName}.json`,
      );
    vi.mocked(writeAsStringAsync).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    Platform.OS = "android";
  });

  it("ignores unrelated channels", () => {
    let called = false;
    const handled = handleSaveTextFileWebViewMessage(
      JSON.stringify({ channel: "gnh-bridge", direction: "command" }),
      () => {
        called = true;
      },
    );
    expect(handled).toBe(false);
    expect(called).toBe(false);
  });

  it("Android writes via Storage Access Framework and resolves ok", async () => {
    Platform.OS = "android";
    const { handled, result } = await runSave(saveCommand());

    expect(handled).toBe(true);
    expect(result).toEqual({ requestId: "req-1", ok: true });
    expect(createFileAsync).toHaveBeenCalled();
    expect(writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringContaining("wallet-backup"),
      '{"v":1}',
    );
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it("Android cancel maps to ok: false", async () => {
    Platform.OS = "android";
    // Production retries once after clear; deny both permission prompts.
    vi.mocked(requestDirectoryPermissionsAsync).mockResolvedValue({
      granted: false,
      directoryUri: "",
    });

    const { result } = await runSave(saveCommand());

    expect(result).toMatchObject({
      requestId: "req-1",
      ok: false,
      message: expect.stringMatching(/cancel/i),
    });
    expect(shareAsync).not.toHaveBeenCalled();
  });

  it("iOS presents share sheet and does not call SAF", async () => {
    Platform.OS = "ios";
    const { handled, result } = await runSave(saveCommand());

    expect(handled).toBe(true);
    expect(result).toEqual({ requestId: "req-1", ok: true });
    expect(shareAsync).toHaveBeenCalledWith(
      expect.stringMatching(/\.json$/),
      expect.objectContaining({
        mimeType: "application/json",
        UTI: "public.json",
      }),
    );
    expect(createFileAsync).not.toHaveBeenCalled();
    expect(requestDirectoryPermissionsAsync).not.toHaveBeenCalled();
    expect(writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("iOS share unavailable maps to ok: false", async () => {
    Platform.OS = "ios";
    vi.mocked(isAvailableAsync).mockResolvedValueOnce(false);

    const { result } = await runSave(saveCommand());

    expect(result).toMatchObject({
      requestId: "req-1",
      ok: false,
      message: expect.any(String),
    });
    expect(shareAsync).not.toHaveBeenCalled();
    expect(createFileAsync).not.toHaveBeenCalled();
  });

  it("iOS share cancel or failure maps to ok: false", async () => {
    Platform.OS = "ios";
    vi.mocked(shareAsync).mockRejectedValueOnce(new Error("Share cancelled"));

    const { result } = await runSave(saveCommand());

    expect(result).toMatchObject({
      requestId: "req-1",
      ok: false,
      message: expect.stringMatching(/cancel|fail|share/i),
    });
    expect(createFileAsync).not.toHaveBeenCalled();
  });
});
