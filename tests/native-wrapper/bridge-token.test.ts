import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertNonEmptyBridgeToken,
  BridgeTokenUnavailableError,
  createBridgeToken,
} from "../../native-wrapper/src/bridgeToken";

const randomUUIDMock = vi.fn(() => "expo-11111111-2222-4333-8444-555555555555");

vi.mock("expo-crypto", () => ({
  randomUUID: (...args: unknown[]) => randomUUIDMock(...args),
}));

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("createBridgeToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    randomUUIDMock.mockReset();
    randomUUIDMock.mockReturnValue(
      "expo-11111111-2222-4333-8444-555555555555",
    );
  });

  it("returns crypto.randomUUID when available", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
      getRandomValues: (a: Uint8Array) => a,
    });
    expect(createBridgeToken()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("falls back to getRandomValues UUID v4 when randomUUID is missing", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (a: Uint8Array) => {
        for (let i = 0; i < a.length; i++) a[i] = (i * 17 + 3) & 0xff;
        return a;
      },
    });
    const token = createBridgeToken();
    expect(token).toMatch(UUID_RE);
    expect(token[14]).toBe("4");
  });

  it("uses expo-crypto when Web Crypto is missing", () => {
    vi.stubGlobal("crypto", undefined);
    expect(createBridgeToken()).toBe(
      "expo-11111111-2222-4333-8444-555555555555",
    );
    expect(randomUUIDMock).toHaveBeenCalled();
  });

  it("throws when Web Crypto and expo-crypto both fail", () => {
    vi.stubGlobal("crypto", undefined);
    randomUUIDMock.mockImplementationOnce(() => {
      throw new Error("native unavailable");
    });
    expect(() => createBridgeToken()).toThrow(BridgeTokenUnavailableError);
  });
});

describe("assertNonEmptyBridgeToken", () => {
  it("rejects empty string", () => {
    expect(() => assertNonEmptyBridgeToken("")).toThrow(/non-empty/);
  });

  it("returns non-empty token", () => {
    expect(assertNonEmptyBridgeToken("abc")).toBe("abc");
  });
});
