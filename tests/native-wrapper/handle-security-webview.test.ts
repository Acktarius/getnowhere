import { describe, expect, it, vi } from "vitest";
import { handleSecurityWebViewMessage } from "../../native-wrapper/src/handleSecurityWebViewMessage";

vi.mock("../../native-wrapper/src/gnhSecurityNative", () => ({
  invokeBiometricCommand: vi.fn(async (payload: Record<string, unknown>) => {
    if (payload.action === "isAvailable") return { available: true };
    if (payload.action === "unlockDataUnlock") return { password: "secret" };
    return { ok: true };
  }),
  securePrefsGet: vi.fn(async () => '{"version":2}'),
  securePrefsSet: vi.fn(async () => true),
  securePrefsRemove: vi.fn(async () => true),
}));

describe("handleSecurityWebViewMessage", () => {
  it("handles gnh-biometric commands", async () => {
    let resolved: Record<string, unknown> | null = null;
    const handled = handleSecurityWebViewMessage(
      JSON.stringify({
        channel: "gnh-biometric",
        direction: "command",
        requestId: "req-1",
        action: "isAvailable",
        purpose: "data",
        lockGeneration: 2,
      }),
      (r) => {
        resolved = r;
      },
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(resolved).not.toBeNull());
    expect(resolved).toMatchObject({
      channel: "gnh-biometric",
      direction: "response",
      requestId: "req-1",
      lockGeneration: 2,
      available: true,
    });
  });

  it("handles gnh-secure-prefs get", async () => {
    let resolved: Record<string, unknown> | null = null;
    const handled = handleSecurityWebViewMessage(
      JSON.stringify({
        channel: "gnh-secure-prefs",
        direction: "command",
        requestId: "req-2",
        action: "get",
        key: "gnh-biometric-enrollment",
      }),
      (r) => {
        resolved = r;
      },
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(resolved).not.toBeNull());
    expect(resolved?.value).toBe('{"version":2}');
  });

  it("ignores unrelated channels", () => {
    let called = false;
    const handled = handleSecurityWebViewMessage(
      JSON.stringify({ channel: "gnh-bridge", direction: "command" }),
      () => {
        called = true;
      },
    );
    expect(handled).toBe(false);
    expect(called).toBe(false);
  });
});
