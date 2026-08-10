/// <reference path="../../src/vite-env.d.ts" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadJson } from "../../src/lib/downloadJson";

describe("downloadJson", () => {
  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.gnhMobile;
  });

  it("uses anchor download on desktop", async () => {
    const result = await downloadJson("wallet.json", { encrypted: true });

    expect(result).toBe("downloaded");
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it("uses mobile bridge when gnhMobile.saveTextFile is present", async () => {
    const saveTextFile = vi.fn();
    const handlers: Array<
      (result: { requestId: string; ok: boolean; message?: string }) => void
    > = [];
    window.gnhMobile = {
      sendCommand: vi.fn(),
      onBridgeEvent: vi.fn(() => () => undefined),
      saveTextFile,
      _onSaveTextFile: (handler) => {
        handlers.push(handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index >= 0) handlers.splice(index, 1);
        };
      },
    };

    const promise = downloadJson("wallet.json", { encrypted: true });
    expect(saveTextFile).toHaveBeenCalledOnce();
    const call = saveTextFile.mock.calls[0]?.[0] as {
      filename: string;
      content: string;
      requestId: string;
    };
    expect(call.filename).toBe("wallet.json");
    expect(JSON.parse(call.content)).toEqual({ encrypted: true });

    handlers[0]?.({ requestId: call.requestId, ok: true });
    await expect(promise).resolves.toBe("saved");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects when mobile bridge reports failure", async () => {
    window.gnhMobile = {
      sendCommand: vi.fn(),
      onBridgeEvent: vi.fn(() => () => undefined),
      saveTextFile: vi.fn(),
      _onSaveTextFile: (handler) => {
        queueMicrotask(() =>
          handler({
            requestId: "req-1",
            ok: false,
            message: "Share cancelled",
          }),
        );
        return () => undefined;
      },
    };

    vi.spyOn(crypto, "randomUUID").mockReturnValue("req-1");

    await expect(downloadJson("wallet.json", {})).rejects.toThrow(
      /Share cancelled/,
    );
  });
});
