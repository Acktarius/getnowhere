import { describe, expect, it, vi } from "vitest";
import { walletFileWrite } from "../../native-wrapper/src/gnhSecurityNative";
import {
  handleSecurityWebViewMessage,
  shouldInjectSecurityResponse,
} from "../../native-wrapper/src/handleSecurityWebViewMessage";

vi.mock("../../native-wrapper/src/gnhSecurityNative", () => ({
  invokeBiometricCommand: vi.fn(async (payload: Record<string, unknown>) => {
    if (payload.action === "isAvailable") return { available: true };
    if (payload.action === "unlockDataUnlock") return { password: "secret" };
    return { ok: true };
  }),
  securePrefsGet: vi.fn(async () => '{"version":2}'),
  securePrefsSet: vi.fn(async () => true),
  securePrefsRemove: vi.fn(async () => true),
  walletFileExists: vi.fn(async () => ({ exists: true })),
  walletFileRead: vi.fn(async () => ({ value: "wallet-blob" })),
  walletFileWrite: vi.fn(async () => ({ ok: true })),
  walletFileRemove: vi.fn(async () => ({ ok: true })),
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

  it("handles gnh-wallet-file read without echoing an error field", async () => {
    let resolved: Record<string, unknown> | null = null;
    const handled = handleSecurityWebViewMessage(
      JSON.stringify({
        channel: "gnh-wallet-file",
        direction: "command",
        requestId: "req-wf",
        action: "read",
      }),
      (r) => {
        resolved = r;
      },
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(resolved).not.toBeNull());
    expect(resolved).toMatchObject({
      channel: "gnh-wallet-file",
      requestId: "req-wf",
      value: "wallet-blob",
    });
    expect(resolved).not.toHaveProperty("error");
  });

  it("wallet write catch logs action and length, not the blob", async () => {
    const secret = "spend-key-must-not-appear";
    vi.mocked(walletFileWrite).mockRejectedValueOnce(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let resolved: Record<string, unknown> | null = null;
    handleSecurityWebViewMessage(
      JSON.stringify({
        channel: "gnh-wallet-file",
        direction: "command",
        requestId: "req-wf-fail",
        action: "write",
        value: secret,
      }),
      (r) => {
        resolved = r;
      },
    );
    await vi.waitFor(() => expect(resolved).not.toBeNull());
    expect(resolved).toMatchObject({ reason: "io-error" });
    expect(warn).toHaveBeenCalledWith(
      "[GnhWalletFile]",
      "write",
      "Error",
      secret.length,
    );
    expect(warn.mock.calls.flat().join(" ")).not.toContain(secret);
    warn.mockRestore();
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

  it("rejects wallet-file actions while locked", async () => {
    let resolved: Record<string, unknown> | null = null;
    const handled = handleSecurityWebViewMessage(
      JSON.stringify({
        channel: "gnh-wallet-file",
        direction: "command",
        requestId: "req-locked-wf",
        action: "read",
        lockGeneration: 3,
      }),
      (r) => {
        resolved = r;
      },
      {
        isLocked: () => true,
        getGeneration: () => 3,
      },
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(resolved).not.toBeNull());
    expect(resolved).toMatchObject({ reason: "locked" });
  });

  it("allows biometric unlockAppAccess while locked when generation matches", async () => {
    const unlockSpy = vi.fn();
    let resolved: Record<string, unknown> | null = null;
    const handled = handleSecurityWebViewMessage(
      JSON.stringify({
        channel: "gnh-biometric",
        direction: "command",
        requestId: "req-unlock",
        action: "unlockAppAccess",
        lockGeneration: 5,
      }),
      (r) => {
        resolved = r;
      },
      {
        isLocked: () => true,
        getGeneration: () => 5,
        onAppAccessUnlockSuccess: unlockSpy,
      },
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(resolved).not.toBeNull());
    expect(resolved).toMatchObject({ ok: true });
    expect(unlockSpy).toHaveBeenCalledWith(5);
  });

  it("rejects biometric unlockAppAccess while locked when generation mismatches", async () => {
    let resolved: Record<string, unknown> | null = null;
    const handled = handleSecurityWebViewMessage(
      JSON.stringify({
        channel: "gnh-biometric",
        direction: "command",
        requestId: "req-unlock-stale",
        action: "unlockAppAccess",
        lockGeneration: 6,
      }),
      (r) => {
        resolved = r;
      },
      {
        isLocked: () => true,
        getGeneration: () => 7,
      },
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(resolved).not.toBeNull());
    expect(resolved).toMatchObject({ error: "locked" });
  });

  it("allows only allowlisted secure-prefs get while locked", async () => {
    let allowed: Record<string, unknown> | null = null;
    let denied: Record<string, unknown> | null = null;

    handleSecurityWebViewMessage(
      JSON.stringify({
        channel: "gnh-secure-prefs",
        direction: "command",
        requestId: "req-allowed-pref",
        action: "get",
        key: "gnh-biometric-enrollment",
        lockGeneration: 2,
      }),
      (r) => {
        allowed = r;
      },
      {
        isLocked: () => true,
        getGeneration: () => 2,
      },
    );
    handleSecurityWebViewMessage(
      JSON.stringify({
        channel: "gnh-secure-prefs",
        direction: "command",
        requestId: "req-denied-pref",
        action: "get",
        key: "gnh.walletSession",
        lockGeneration: 2,
      }),
      (r) => {
        denied = r;
      },
      {
        isLocked: () => true,
        getGeneration: () => 2,
      },
    );

    await vi.waitFor(() => expect(allowed).not.toBeNull());
    await vi.waitFor(() => expect(denied).not.toBeNull());
    expect(allowed).toMatchObject({ value: '{"version":2}' });
    expect(denied).toMatchObject({ error: "locked" });
  });
});

describe("shouldInjectSecurityResponse", () => {
  it("drops stale generation responses", () => {
    expect(shouldInjectSecurityResponse({ lockGeneration: 2 }, 3)).toBe(false);
  });

  it("allows current-generation responses", () => {
    expect(shouldInjectSecurityResponse({ lockGeneration: 3 }, 3)).toBe(true);
  });

  it("allows legacy responses without lockGeneration", () => {
    expect(shouldInjectSecurityResponse({}, 3)).toBe(true);
  });
});
